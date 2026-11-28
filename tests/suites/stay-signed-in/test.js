'use strict';
// Stay signed in (v2.65, review SEC-1). Spotify ends every sign-in 6 months after it was made; renewing the token
// doesn't extend it and signing in again starts a new 6 months
// (https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration). The page stores when you signed in,
// offers Renew now (one tap, back where you were) from day 165, and when Spotify does end it, says why and keeps
// the last playback. jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var nodeCrypto = require('crypto');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var BASE = 'https://richardtran324.github.io/spotify-library/';
var DAY = 86400000;
var LASTPLAY = { item: { uri: 'spotify:episode:e1', id: 'e1', name: 'Long podcast episode', type: 'episode', duration_ms: 7200000,
  show: { id: 's1', name: 'Some Show', images: [] }, artists: [] }, context: null, positionMs: 3600000, deviceId: 'A', at: Date.now() - 60000 };

function getJ(store, k) { var v = store.getItem(k); return v ? JSON.parse(v) : null; }
function store(tok, extra) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify('fakeclient'));
  if (tok) s.setItem('lib-token', JSON.stringify(tok));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
function tok(extra) { return Object.assign({ access: 'A0', refresh: 'r0', expires: Date.now() + 3600e3, scope: H.SCOPE }, extra || {}); }

// opts: url, token (fn(form) -> {status, json}), wait (ms, default 400)
function setup(s, opts) {
  opts = opts || {};
  var env = { req: [] };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    env.req.push({ method: method, url: call.url, body: body == null ? null : String(body) });
    if (call.host === 'accounts.spotify.com') return opts.token ? opts.token(new URLSearchParams(String(body))) : { status: 500, json: { error: 'no_route' } };
  }, {
    url: opts.url || BASE,
    beforeParse: function (w) {
      var counter = 0;
      Object.defineProperty(w, 'crypto', { configurable: true, value: {
        getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (counter++ * 37 + 11) & 255; return a; },
        subtle: { digest: function (alg, data) { return nodeCrypto.webcrypto.subtle.digest(alg, data); } }
      } });
    }
  });
  tab.env = env;
  return H.wait(opts.wait === undefined ? 400 : opts.wait).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function heading(tab) { var h = $(tab, 'main').querySelector('h2'); return h ? h.textContent : ''; }
function mainText(tab) { return $(tab, 'main').textContent.replace(/\s+/g, ' ').trim(); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function btn(tab, text) { return [].slice.call($(tab, 'main').querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === text; })[0] || null; }
function authNavs(tab) { return (tab.w.__nav || []).filter(function (n) { return n.url.indexOf('https://accounts.spotify.com/') === 0; }); }
function tokenReqs(tab) { return tab.env.req.filter(function (r) { return r.url === 'https://accounts.spotify.com/api/token'; }); }
function bannerShown(tab) { return !$(tab, 'banner').hidden; }
function bannerText(tab) { return $(tab, 'banner').textContent.replace(/\s+/g, ' ').trim(); }
function dayText(ms) { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function okToken(access, extra) {
  return function () { return { status: 200, json: Object.assign({ access_token: access, expires_in: 3600, token_type: 'Bearer', scope: H.SCOPE }, extra || {}) }; };
}
function refused() { return { status: 400, json: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }; }

var tests = [];

// 1. A fresh sign-in (code exchange) stores when it was made; the banner stays hidden.
tests.push(function () {
  var s = store(null, { 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  var t0 = Date.now();
  return setup(s, { url: BASE + '?code=abc&state=st1', token: okToken('A1', { refresh_token: 'R1' }) }).then(function (tab) {
    var tk = getJ(s, 'lib-token') || {};
    check('1 sign-in stores authAt (now)', typeof tk.authAt === 'number' && tk.authAt >= t0 && tk.authAt <= Date.now(), tk);
    check('1 a fresh sign-in has no authSeen', tk.authSeen === undefined, tk);
    check('1 app started, banner hidden', tab.t().state.started === true && !bannerShown(tab));
  });
});

// 2. A renewal (refresh token) keeps authAt: renewing doesn't extend Spotify's 6 months.
tests.push(function () {
  var at = Date.now() - 10 * DAY;
  var s = store(tok({ access: 'old', expires: 0, authAt: at }));
  return setup(s, { token: okToken('A2', { refresh_token: 'R2' }) }).then(function (tab) {
    var tk = getJ(s, 'lib-token') || {};
    check('2 refresh happened', tokenReqs(tab).length === 1 && tk.access === 'A2' && tk.refresh === 'R2', tk);
    check('2 refresh keeps authAt', tk.authAt === at, { want: at, got: tk.authAt });
  });
});

// 3. A sign-in saved before v2.65 (no date): no warning; its first renewal notes authSeen (made on or before now),
// and no authAt is made up.
tests.push(function () {
  var s = store(tok({ access: 'old', expires: 0 }));
  var t0 = Date.now();
  return setup(s, { token: okToken('A3') }).then(function (tab) {
    var tk = getJ(s, 'lib-token') || {};
    check('3 old sign-in: authSeen noted at its first renewal', typeof tk.authSeen === 'number' && tk.authSeen >= t0 && tk.authSeen <= Date.now(), tk);
    check('3 old sign-in: no authAt invented', tk.authAt === undefined, tk);
    check('3 old sign-in: no banner, no toast', !bannerShown(tab) && tab.toasts().length === 0, { b: bannerText(tab), t: tab.toasts() });
  }).then(function () {
    var seen = Date.now() - 30 * DAY;
    var s2 = store(tok({ access: 'old', expires: 0, authSeen: seen }));
    return setup(s2, { token: okToken('A3b') }).then(function () {
      var tk = getJ(s2, 'lib-token') || {};
      check('3 a later renewal keeps authSeen', tk.authSeen === seen && tk.authAt === undefined, tk);
    });
  });
});

// 4. The banner: hidden at day 100, shown from day 165 with the date the sign-in ends and Renew now.
tests.push(function () {
  return setup(store(tok({ authAt: Date.now() - 100 * DAY }))).then(function (tab) {
    check('4 day 100: banner hidden', !bannerShown(tab), bannerText(tab));
  }).then(function () {
    var at = Date.now() - 171 * DAY;
    return setup(store(tok({ authAt: at }))).then(function (tab) {
      check('4 day 171: banner shown', bannerShown(tab), bannerText(tab));
      check('4 day 171: names the date it ends', bannerText(tab).indexOf(dayText(at + 180 * DAY)) !== -1 && /every 6 months/.test(bannerText(tab)), bannerText(tab));
      check('4 day 171: one-tap Renew now', $(tab, 'bannerBtn').textContent === 'Renew now', $(tab, 'bannerBtn').textContent);
      check('4 day 171: nothing opened by itself', authNavs(tab).length === 0, tab.w.__nav);
    });
  }).then(function () {
    var seen = Date.now() - 170 * DAY;
    return setup(store(tok({ authSeen: seen }))).then(function (tab) {
      check('4 old sign-in seen 170 days ago: banner says "by" the latest date', bannerShown(tab) && bannerText(tab).indexOf('by ' ) !== -1 && bannerText(tab).indexOf(dayText(seen + 180 * DAY)) !== -1, bannerText(tab));
    });
  }).then(function () {
    return setup(store(tok({}))).then(function (tab) {
      check('4 old sign-in, date unknown: no banner', !bannerShown(tab), bannerText(tab));
    });
  }).then(function () {
    // Missing everyday scopes still show the old banner text and button.
    return setup(store(tok({ authAt: Date.now() - 171 * DAY, scope: 'user-read-playback-state' }))).then(function (tab) {
      check('4 missing scopes: the permissions banner wins', bannerShown(tab) && /New features need one more sign-in/.test(bannerText(tab)) && $(tab, 'bannerBtn').textContent === 'Sign in again', bannerText(tab));
    });
  });
});

// 5. Renew now: the normal PKCE sign-in with the same scopes (no new ones), and the return comes back where you
// were (filter text) with a new 6 months.
tests.push(function () {
  var at = Date.now() - 172 * DAY;
  var s = store(tok({ authAt: at }), { 'lib-lastplay': LASTPLAY });
  var t0;
  return setup(s).then(function (tab) {
    var t = tab.t();
    click(tab, d(tab).querySelector('.filters .chip[data-filter="playlists"]'));
    var q = $(tab, 'search'); q.value = 'road trip';
    q.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
    click(tab, $(tab, 'bannerBtn'));
    return H.wait(100).then(function () {
      var n = authNavs(tab);
      var u = n.length ? new URL(n[0].url) : null, p = u ? u.searchParams : new URLSearchParams();
      check('5 Renew now opens Spotify\'s authorize page (PKCE)', n.length === 1 && u.pathname === '/authorize' && p.get('code_challenge_method') === 'S256' && !!p.get('code_challenge'), tab.w.__nav);
      var want = t.SCOPE_LIST.slice().sort().join(' '), got = (p.get('scope') || '').split(' ').sort().join(' ');
      check('5 Renew now asks for no new scopes', got === want, { got: got, want: want });
      check('5 nothing playing was dropped before leaving', !!getJ(s, 'lib-lastplay'));
      t0 = Date.now();
      return setup(s, { url: BASE + '?code=c2&state=' + encodeURIComponent(getJ(s, 'lib-state')), token: okToken('A5', { refresh_token: 'R5' }) });
    });
  }).then(function (tab) {
    var tk = getJ(s, 'lib-token') || {};
    check('5 renewal starts a new 6 months', tk.access === 'A5' && typeof tk.authAt === 'number' && tk.authAt >= t0, tk);
    check('5 banner gone after renewing', !bannerShown(tab), bannerText(tab));
    check('5 back where you were: filter and filter text', tab.t().state.filter === 'playlists' && tab.t().state.query === 'road trip' && $(tab, 'search').value === 'road trip', { f: tab.t().state.filter, q: tab.t().state.query });
    check('5 last playback kept', (getJ(s, 'lib-lastplay') || { item: {} }).item.id === 'e1');
  });
});

// 6. Spotify ends the sign-in (invalid_grant after its 6 months): the card says why, the last playback is kept
// (also after the page is opened again), Sign in brings it back; Change Client ID still forgets it.
tests.push(function () {
  var s = store(tok({ access: 'old', expires: 0, authAt: Date.now() - 181 * DAY }), { 'lib-lastplay': LASTPLAY });
  return setup(s, { token: refused }).then(function (tab) {
    return H.wait(2400).then(function () {
      check('6 expiry: sign-in card', heading(tab) === 'Sign in' && tab.t().state.started === false, heading(tab));
      check('6 expiry: says Spotify signs you out every 6 months', /Spotify signs you out every 6 months/.test(mainText(tab)), mainText(tab));
      check('6 expiry: token removed', s.getItem('lib-token') === null);
      check('6 expiry: last playback kept', (getJ(s, 'lib-lastplay') || { item: {} }).item.id === 'e1' && (getJ(s, 'lib-lastplay') || {}).positionMs === 3600000, s.getItem('lib-lastplay'));
      check('6 expiry: one renewal tried, no redirect by itself', tokenReqs(tab).length === 1 && authNavs(tab).length === 0);
    });
  }).then(function () {
    return setup(s).then(function (tab) {   // the page opened again later, still signed out
      check('6 reopened: still explains and keeps the last playback', /every 6 months/.test(mainText(tab)) && !!getJ(s, 'lib-lastplay'), mainText(tab));
      click(tab, btn(tab, 'Sign in with Spotify'));
      return H.wait(100).then(function () {
        check('6 Sign in opens the authorize page', authNavs(tab).length === 1);
        return setup(s, { url: BASE + '?code=c6&state=' + encodeURIComponent(getJ(s, 'lib-state')), token: okToken('A6', { refresh_token: 'R6' }), wait: 600 });
      });
    });
  }).then(function (tab) {
    var tk = getJ(s, 'lib-token') || {};
    check('6 signed in again: new 6 months, explanation cleared', tk.access === 'A6' && typeof tk.authAt === 'number' && tab.t().state.started === true && !/every 6 months/.test(mainText(tab)), tk);
    check('6 signed in again: last playback still there', (getJ(s, 'lib-lastplay') || { item: {} }).item.id === 'e1');
    check('6 signed in again: the paused episode is on the bar', !$(tab, 'player').hidden && /Long podcast episode/.test($(tab, 'player').textContent), $(tab, 'player').textContent.slice(0, 120));
  }).then(function () {
    var s2 = store(tok({ access: 'old', expires: 0, authAt: Date.now() - 181 * DAY }), { 'lib-lastplay': LASTPLAY });
    return setup(s2, { token: refused }).then(function (tab) {
      return H.wait(2400).then(function () {
        click(tab, btn(tab, 'Change Client ID'));
        check('6 Change Client ID forgets the last playback and the client', s2.getItem('lib-lastplay') === null && s2.getItem('lib-client-id') === null && heading(tab) === 'One-time setup', { lp: s2.getItem('lib-lastplay'), h: heading(tab) });
      });
    });
  });
});

// 7. Spotify ends a young sign-in (access removed in the Spotify account): no 6-month claim, last playback kept.
tests.push(function () {
  var s = store(tok({ access: 'old', expires: 0, authAt: Date.now() - 30 * DAY }), { 'lib-lastplay': LASTPLAY });
  return setup(s, { token: refused }).then(function (tab) {
    return H.wait(2400).then(function () {
      check('7 early end: says it ended before its 6 months', heading(tab) === 'Sign in' && /before its 6 months were up/.test(mainText(tab)), mainText(tab));
      check('7 early end: last playback kept', !!getJ(s, 'lib-lastplay'));
    });
  });
});

// 8. stopApp on its own (and other sign-outs) still forgets the last playback.
tests.push(function () {
  var s = store(tok({ authAt: Date.now() }), { 'lib-lastplay': LASTPLAY });
  return setup(s).then(function (tab) {
    tab.t().stopApp();
    check('8 plain stopApp still forgets the last playback', s.getItem('lib-lastplay') === null);
  });
});

// 9. Diagnostics shows when the sign-in was made and when Spotify asks again.
tests.push(function () {
  var at = Date.now() - 20 * DAY;
  return setup(store(tok({ authAt: at }))).then(function (tab) {
    tab.t().runDiag();
    var out = $(tab, 'diagOut').textContent;
    var line = (out.split('\n').filter(function (l) { return l.indexOf('Sign-in made:') === 0; })[0]) || '';
    check('9 Diagnostics: sign-in date and when it ends', line.indexOf(dayText(at)) !== -1 && line.indexOf(dayText(at + 180 * DAY)) !== -1, out.split('\n').slice(0, 4));
  }).then(function () {
    return setup(store(tok({}))).then(function (tab) {
      tab.t().runDiag();
      check('9 Diagnostics: an older sign-in says unknown', /Sign-in made: unknown/.test($(tab, 'diagOut').textContent), $(tab, 'diagOut').textContent.split('\n').slice(0, 4));
    });
  });
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
});
