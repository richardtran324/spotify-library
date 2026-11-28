'use strict';
// Plain messages tests: restriction 403 in plain words, leftover raw texts, Change Client ID that keeps the old ID
// until a new one is saved, Latest Refresh after a failed try, and the header Refresh busy state.
// jsdom, mocked fetch (answers on timers), shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var CID = '0123456789abcdef0123456789abcdef';
var CID2 = 'fedcba9876543210fedcba9876543210';
var BASE = 'https://richardtran324.github.io/spotify-library/';
var RESTRICT = { status: 403, json: { error: { status: 403, message: 'Player command failed: Restriction violated', reason: 'UNKNOWN' } } };
var PLAYLISTS = { status: 200, json: { items: [{ id: 'p1', uri: 'spotify:playlist:p1', name: 'Road', owner: { id: 'me1' }, images: [], tracks: { total: 3 } }], next: null, total: 1 } };
var SHOWS = { status: 200, json: { items: [{ show: { id: 's1', uri: 'spotify:show:s1', name: 'Pod', images: [], total_episodes: 3 } }], next: null, total: 1 } };

function d(tab) { return tab.w.document; }
function click(tab, n) { n.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1]; }
function heading(tab) { var h = d(tab).querySelector('#main h2'); return h ? h.textContent : ''; }
function errText(tab) { var p = d(tab).querySelector('#main p.err'); return p ? p.textContent : ''; }
function btn(tab, text) { return [].filter.call(d(tab).querySelectorAll('#main button'), function (b) { return b.textContent === text; })[0]; }
function toastBtn(tab) { return d(tab).querySelector('#toast .toastbtn'); }
function getJ(store, k) { var v = store.getItem(k); return v ? JSON.parse(v) : null; }
function count(tab, re, m) { return tab.calls.filter(function (c) { return re.test(c.path) && (!m || c.method === m); }).length; }

// env.r(method, path) may answer first; otherwise devices, playlists and shows get a small library.
function setup(store, opts) {
  opts = opts || {};
  var env = { r: opts.r || null };
  var tab = H.makeTab(store, function (m, p, q) {
    if (env.r) { var x = env.r(m, p, q); if (x) return x; }
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (p === '/me/playlists') return PLAYLISTS;
    if (p === '/me/shows') return SHOWS;
  }, {
    url: opts.url || undefined,
    // Sign in: SHA-256 never answers, so a Save stops before leaving the page (jsdom has no crypto.subtle).
    beforeParse: function (w) {
      var c = w.crypto || {};
      try { Object.defineProperty(w, 'crypto', { configurable: true, value: { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; }, subtle: { digest: function () { return new Promise(function () {}); } }, randomUUID: c.randomUUID } }); } catch (e) {}
    }
  });
  tab.env = env;
  return H.wait(opts.settle == null ? 300 : opts.settle).then(function () { return tab; });
}
function clientOnly(extra) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify(CID));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}

var tests = [];

// 1. plainErr: a 403 about a restriction reads in plain words, with no Try again; other 403s are unchanged.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    var e = new Error('Player command failed: Restriction violated'); e.status = 403; e.reason = 'UNKNOWN';
    var p = t.plainErr(e);
    check('1 restriction: plain words, no retry', p.text === 'Spotify didn’t allow that right now.' && p.retry === false && !p.raw, p);
    check('1 restriction: toast text', t.failText('Couldn’t control playback', e) === 'Couldn’t control playback. Spotify didn’t allow that right now.', t.failText('Couldn’t control playback', e));
    var prem = new Error('Player command failed: Premium required'); prem.status = 403; prem.reason = 'PREMIUM_REQUIRED';
    check('1 Premium still reads as Premium', t.plainErr(prem).text === 'Spotify Premium is needed to control playback.');
    var other = new Error('Forbidden'); other.status = 403;
    check('1 other 403 unchanged (raw)', t.plainErr(other).raw === true && t.plainErr(other).text === 'Forbidden');
    tab.w.close();
  });
});

// 2. Next / Previous refused with Spotify's 403 restriction: plain toast, no Try again, no developer text.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    t.state.player = H.song(); t.state.playerAt = Date.now(); t.state.playerIdle = false;
    tab.env.r = function (m, p) { if (p === '/me/player/next' || p === '/me/player/previous') return RESTRICT; };
    tab.w.__toasts = [];
    click(tab, d(tab).getElementById('pNext'));
    return H.wait(150).then(function () {
      var msg = lastToast(tab) || '';
      check('2 Next refused: plain toast', msg === 'Couldn’t control playback. Spotify didn’t allow that right now.', tab.toasts());
      check('2 Next refused: no Restriction or Player command text', !/Restriction|Player command/.test(tab.toasts().join(' ')), tab.toasts());
      check('2 Next refused: no Try again', !toastBtn(tab));
      tab.w.__toasts = []; d(tab).getElementById('toast').hidden = true;
      t.state.player = H.song(); t.state.playerIdle = false;
      click(tab, d(tab).getElementById('pPrev'));
      return H.wait(150);
    }).then(function () {
      check('2 Previous refused: plain toast', lastToast(tab) === 'Couldn’t control playback. Spotify didn’t allow that right now.' && !toastBtn(tab), tab.toasts());
      tab.w.close();
    });
  });
});

// 3. Leftover raw texts: edit 403, follow 400, Now Playing failing to draw.
tests.push(function () {
  var store = H.seedStore();
  var tok = getJ(store, 'lib-token'); tok.scope += ' user-follow-modify playlist-modify-private';
  store.setItem('lib-token', JSON.stringify(tok));
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.w.__toasts = [];
    t.editRefused({ status: 403, json: { error: { status: 403, message: 'Forbidden' } } }, 'Couldn’t add', null);
    check('3 edit 403: plain sentence, no bracket', lastToast(tab) === 'Spotify didn’t allow this change from this page.', tab.toasts());
    tab.env.r = function (m, p) { if (p === '/me/library' && (m === 'PUT' || m === 'DELETE')) return { status: 400, json: { error: { status: 400, message: 'Invalid uri' } } }; };
    t.toggleFollow({ id: 'ar1', name: 'Artist One', uri: 'spotify:artist:ar1' }, null, true);
    return H.wait(150).then(function () {
      check('3 follow 400: plain sentence, no bracket', lastToast(tab) === 'Spotify didn’t accept following from this page.', tab.toasts());
      t.toggleFollow({ id: 'ar1', name: 'Artist One', uri: 'spotify:artist:ar1' }, null, false);
      return H.wait(150);
    }).then(function () {
      check('3 unfollow 400: plain sentence, no bracket', lastToast(tab) === 'Spotify didn’t accept unfollowing from this page.', tab.toasts());
      // Now Playing that throws while drawing: closed again, plain toast, the reason only in Diagnostics.
      var p = H.song();
      Object.defineProperty(p.item, 'name', { get: function () { throw new Error('boom xyz'); } });
      t.state.player = p; t.state.playerIdle = false;
      tab.w.__toasts = [];
      t.openNp();
      check('3 Now Playing error: plain toast', lastToast(tab) === 'Couldn’t open Now Playing. Try again.', tab.toasts());
      check('3 Now Playing error: no exception text, screen closed', !/boom/.test(tab.toasts().join(' ')) && d(tab).getElementById('np').hidden === true);
      tab.w.close();
    });
  });
});

// 4. First sign-in cancelled at Spotify: "Sign-in was cancelled."; any other code keeps its bracket.
tests.push(function () {
  return setup(clientOnly({ 'lib-state': 'st1' }), { url: BASE + '?error=access_denied&state=st1' }).then(function (tab) {
    check('4 access_denied: plain message on Sign in', heading(tab) === 'Sign in' && errText(tab) === 'Sign-in was cancelled.', [heading(tab), errText(tab)]);
    tab.w.close();
    return setup(clientOnly({ 'lib-state': 'st1' }), { url: BASE + '?error=server_error&state=st1' });
  }).then(function (tab) {
    check('4 other error code kept in brackets', errText(tab) === 'Spotify sign-in was cancelled or failed (server_error).', errText(tab));
    tab.w.close();
  });
});

// 5. Change Client ID forgets nothing: setup shows the old ID, Back to sign in goes back with nothing changed.
tests.push(function () {
  var store = clientOnly();
  return setup(store).then(function (tab) {
    check('5 starts on Sign in', heading(tab) === 'Sign in', heading(tab));
    store.setItem('lib-token', JSON.stringify({ access: 'x', refresh: 'y', expires: 0, scope: '' }));
    var tok0 = store.getItem('lib-token');
    click(tab, btn(tab, 'Change Client ID'));
    check('5 setup screen shown', heading(tab) === 'One-time setup', heading(tab));
    check('5 nothing deleted on tap', getJ(store, 'lib-client-id') === CID && store.getItem('lib-token') === tok0);
    var box = d(tab).getElementById('clientId');
    check('5 box prefilled with the old ID', box && box.value === CID, box && box.value);
    check('5 Back to sign in shown', !!btn(tab, 'Back to sign in'));
    check('5 no confirm dialog needed', !d(tab).querySelector('dialog'));
    click(tab, btn(tab, 'Back to sign in'));
    check('5 Back: Sign in screen again', heading(tab) === 'Sign in' && !!btn(tab, 'Sign in with Spotify'), heading(tab));
    check('5 Back: Client ID and token unchanged', getJ(store, 'lib-client-id') === CID && store.getItem('lib-token') === tok0);
    tab.w.close();
  });
});

// 6. Saving: an invalid ID changes nothing; the same ID keeps the sign-in; a different valid ID drops the old token.
tests.push(function () {
  var store = clientOnly();
  return setup(store).then(function (tab) {
    store.setItem('lib-token', JSON.stringify({ access: 'x', refresh: 'y', expires: 0, scope: '' }));
    var tok0 = store.getItem('lib-token');
    click(tab, btn(tab, 'Change Client ID'));
    var box = d(tab).getElementById('clientId');
    box.value = 'not-an-id';
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    check('6 invalid ID: error shown, nothing changed', /doesn’t look like a Client ID/.test(errText(tab)) && getJ(store, 'lib-client-id') === CID && store.getItem('lib-token') === tok0, errText(tab));
    box.value = '  ' + CID.toUpperCase() + ' ';
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    check('6 same ID (any case): token kept', store.getItem('lib-token') === tok0);
    return H.wait(50).then(function () {
      tab.t().renderSignIn();
      click(tab, btn(tab, 'Change Client ID'));
      d(tab).getElementById('clientId').value = CID2;
      click(tab, btn(tab, 'Save and sign in with Spotify'));
      check('6 different ID: saved, old token cleared', getJ(store, 'lib-client-id') === CID2 && store.getItem('lib-token') === null, [getJ(store, 'lib-client-id'), store.getItem('lib-token')]);
      tab.w.close();
    });
  });
});

// 7. First setup (no saved ID): empty box, no Back button.
tests.push(function () {
  return setup(H.makeStore()).then(function (tab) {
    var box = d(tab).getElementById('clientId');
    check('7 first setup: empty box, no Back', heading(tab) === 'One-time setup' && box && box.value === '' && !btn(tab, 'Back to sign in'), heading(tab));
    tab.w.close();
  });
});

// 8. Latest: Refresh after a failed try says so (no "Updated"), and works again after a minute; 5 minutes after a good one.
tests.push(function () {
  var mode = { fail: true };
  return setup(H.seedStore(), { r: function (m, p) {
    if (/^\/shows\/s1\/episodes/.test(p)) {
      return mode.fail ? { status: 500, json: { error: { status: 500, message: 'Server error' } } }
        : { status: 200, json: { items: [{ id: 'e1', uri: 'spotify:episode:e1', name: 'Ep 1', release_date: '2026-11-26', duration_ms: 60000, images: [], resume_point: { fully_played: false, resume_position_ms: 0 } }], next: null, total: 1 } };
    }
  } }).then(function (tab) {
    var t = tab.t();
    t.state.latest.cache = { at: Date.now() - 13 * 3600e3, items: [], newest: {}, failed: 0 };
    t.state.podTab = 'latest'; t.setFilter('podcasts');
    function note() { var n = d(tab).querySelector('.lnote'); return n ? n.textContent : ''; }
    function refreshLink() { var n = d(tab).querySelector('.lnote'); return n && [].filter.call(n.querySelectorAll('button'), function (b) { return b.textContent === 'Refresh'; })[0]; }
    function eps() { return count(tab, /^\/shows\/s1\/episodes/); }
    return H.wait(1500).then(function () {
      check('8 failed load: error in the note', /Couldn’t load the latest episodes/.test(note()) && eps() >= 1, note());
      var n0 = eps();
      tab.w.__toasts = [];
      click(tab, refreshLink());
      return H.wait(150).then(function () {
        check('8 Refresh right after a failure: says the last try didn’t work', lastToast(tab) === 'The last try didn’t work. Try again in a minute.', tab.toasts());
        check('8 no "Updated" claim, nothing sent', !/Updated/.test(tab.toasts().join(' ')) && eps() === n0, tab.toasts());
        t.state.latest.triedAt = Date.now() - 30000;   // 30 s after the failed try
        tab.w.__toasts = [];
        click(tab, refreshLink());
        return H.wait(150);
      }).then(function () {
        check('8 still held at 30 s', lastToast(tab) === 'The last try didn’t work. Try again in a minute.' && eps() === n0, tab.toasts());
        t.state.latest.triedAt = Date.now() - 61000;   // 61 s after the failed try
        mode.fail = false;
        tab.w.__toasts = [];
        click(tab, refreshLink());
        return H.wait(1000);
      }).then(function () {
        check('8 Refresh after 61 s asks the podcast again', eps() === n0 + 1, { before: n0, now: eps(), toasts: tab.toasts() });
        check('8 good load: error gone', !t.state.latest.error && !/Couldn’t load/.test(note()), note());
        tab.w.__toasts = [];
        var r = refreshLink();
        if (r) click(tab, r);
        return H.wait(150);
      }).then(function () {
        check('8 after a good load: 5-minute rule', lastToast(tab) === 'Updated a moment ago. Try again in 5 minutes.', tab.toasts());
        tab.w.close();
      });
    });
  });
});

// 9. Header Refresh: the button reads Refreshing… (aria-busy) and ignores taps until the library answers; no toasts.
tests.push(function () {
  var slow = { ms: 1500, fail: false };
  return setup(H.seedStore(), { settle: 400 }).then(function (tab) {
    var t = tab.t();
    t.setFilter('playlists');
    tab.env.r = function (m, p) { if (p === '/me/playlists') return slow.fail ? { status: 500, json: { error: { status: 500, message: 'Server error' } }, delay: slow.ms } : Object.assign({ delay: slow.ms }, PLAYLISTS); };
    var rb = d(tab).getElementById('refreshBtn');
    tab.w.__toasts = []; tab.calls.length = 0;
    click(tab, rb); click(tab, rb); click(tab, rb);
    check('9 busy: text and aria-busy', rb.textContent === 'Refreshing…' && rb.getAttribute('aria-busy') === 'true', rb.outerHTML);
    check('9 no Refreshing… toast', tab.toasts().indexOf('Refreshing…') === -1, tab.toasts());
    return H.wait(1000).then(function () {
      check('9 three taps: one library load', count(tab, /^\/me\/playlists$/) === 1, count(tab, /^\/me\/playlists$/));
      check('9 still busy while loading', rb.getAttribute('aria-busy') === 'true');
      return H.wait(900);
    }).then(function () {
      check('9 done: Refresh again, not busy', rb.textContent === 'Refresh' && !rb.hasAttribute('aria-busy'), rb.outerHTML);
      check('9 done: no toast at all', tab.toasts().length === 0, tab.toasts());
      slow.fail = true; slow.ms = 300;
      click(tab, rb);
      return H.wait(800);
    }).then(function () {
      check('9 failed refresh: button back to Refresh', rb.textContent === 'Refresh' && !rb.hasAttribute('aria-busy'), rb.outerHTML);
      check('9 failed refresh: its own failure toast only', tab.toasts().length === 1 && /^Couldn’t refresh/.test(tab.toasts()[0]), tab.toasts());
      tab.w.close();
    });
  });
});

// 10. Library paused (cool-off), player not: the player check runs, the button doesn't go busy.
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-cooloff', JSON.stringify({ library: { until: Date.now() + 120000, reason: 'test', strikes: 1 } }));
  return setup(store, { settle: 400 }).then(function (tab) {
    var rb = d(tab).getElementById('refreshBtn');
    tab.w.__toasts = []; tab.calls.length = 0;
    click(tab, rb);
    return H.wait(100).then(function () {
      check('10 library paused: not busy, no library load', rb.textContent === 'Refresh' && !rb.hasAttribute('aria-busy') && count(tab, /^\/me\/playlists$/) === 0, rb.outerHTML);
      check('10 library paused: player check still sent', count(tab, /^\/me\/player(\/devices)?$/) >= 1, tab.calls.map(function (c) { return c.path; }));
      tab.w.close();
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
