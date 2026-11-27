'use strict';
// Sign-in and tokens: setup screen, sign-in screen, PKCE redirect, callback, token storage and refresh,
// missing scopes, sign-out. jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var nodeCrypto = require('crypto');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var BASE = 'https://richardtran324.github.io/spotify-library/';
var CLIENT = '0123456789abcdef0123456789ABCDEF';
var ALL_SCOPES = H.SCOPE;

// A store with only a Client ID (no token), or nothing at all.
function clientStore(extra) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify(CLIENT));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
function tokenStore(tok) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify('fakeclient'));
  s.setItem('lib-token', JSON.stringify(tok));
  return s;
}
function getJ(store, k) { var v = store.getItem(k); return v ? JSON.parse(v) : null; }

// opts: url (page address), script [{m, path, status, json, times?}], token (fn(body) -> {status, json}),
// netFail (fn(url) -> true to reject the fetch), digestFail, clipboard ('ok' | 'reject' | undefined),
// session (object written to sessionStorage 'lib-saved' before the page runs), wait (ms, default 300).
function setup(store, opts) {
  opts = opts || {};
  var env = { script: (opts.script || []).slice(), token: opts.token || null, netFail: opts.netFail || null, req: [], clip: [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    if (call.host === 'accounts.spotify.com') {
      if (!env.token) return { status: 500, json: { error: 'no_route' } };
      return env.token(new URLSearchParams(String(body)));
    }
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (s.m === method && s.path === path && (s.times === undefined || s.times > 0)) {
        if (s.times !== undefined) s.times--;
        return { status: s.status, json: s.json };
      }
    }
  }, {
    url: opts.url || BASE,
    beforeParse: function (w) {
      // Deterministic random bytes (so verifier and state differ per call but runs repeat), real SHA-256.
      var counter = 0;
      Object.defineProperty(w, 'crypto', { configurable: true, value: {
        getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (counter++ * 37 + 11) & 255; return a; },
        subtle: { digest: function (alg, data) {
          if (opts.digestFail) return Promise.reject(new Error('digest unavailable'));
          return nodeCrypto.webcrypto.subtle.digest(alg, data);
        } }
      } });
      // Wrap the harness's mocked fetch to record headers and form bodies, and to simulate network failures.
      var inner = null;
      Object.defineProperty(w, 'fetch', { configurable: true,
        set: function (fn) { inner = fn; },
        get: function () {
          return function (url, fo) {
            fo = fo || {};
            var hdr = {};
            Object.keys(fo.headers || {}).forEach(function (k) { hdr[k.toLowerCase()] = fo.headers[k]; });
            env.req.push({ url: String(url), method: fo.method || 'GET', headers: hdr, body: fo.body == null ? null : String(fo.body) });
            if (env.netFail && env.netFail(String(url))) return Promise.reject(new TypeError('Load failed'));
            return inner(url, fo);
          };
        } });
      if (opts.clipboard) {
        Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: function (t) {
          env.clip.push(t); return opts.clipboard === 'ok' ? Promise.resolve() : Promise.reject(new Error('denied'));
        } } });
      }
      if (opts.session) { try { w.sessionStorage.setItem('lib-saved', typeof opts.session === 'string' ? opts.session : JSON.stringify(opts.session)); } catch (e) {} }
    }
  });
  tab.env = env;
  return H.wait(opts.wait === undefined ? 300 : opts.wait).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    tab.w.__toasts = tab.w.__toasts || [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function main(tab) { return d(tab).getElementById('main'); }
function heading(tab) { var h = main(tab).querySelector('h2'); return h ? h.textContent : ''; }
function errText(tab) { var e = main(tab).querySelector('.err'); return e ? e.textContent : ''; }
function btn(tab, text) {
  return [].slice.call(main(tab).querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === text; })[0] || null;
}
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function navs(tab) { return tab.w.__nav || []; }
function authNavs(tab) { return navs(tab).filter(function (n) { return n.url.indexOf('https://accounts.spotify.com/') === 0; }); }
function tokenReqs(tab) { return tab.env.req.filter(function (r) { return r.url === 'https://accounts.spotify.com/api/token'; }); }
function apiReqs(tab) { return tab.env.req.filter(function (r) { return r.url.indexOf('https://api.spotify.com/') === 0; }); }
function form(r) { return new URLSearchParams(r.body || ''); }
function b64urlNode(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function topHidden(tab) { return d(tab).getElementById('top').hidden; }
function bannerHidden(tab) { return d(tab).getElementById('banner').hidden; }
function okToken(access, extra) {
  return function () { return { status: 200, json: Object.assign({ access_token: access, expires_in: 3600, token_type: 'Bearer' }, extra || {}) }; };
}

var tests = [];

// 1. First visit (no Client ID): the setup screen, nothing sent.
tests.push(function () {
  return setup(H.makeStore()).then(function (tab) {
    check('1 setup screen shown', heading(tab) === 'One-time setup', heading(tab));
    check('1 redirect address is the page address', d(tab).getElementById('redirect').textContent === BASE, d(tab).getElementById('redirect').textContent);
    var input = d(tab).getElementById('clientId');
    check('1 Client ID field present', !!input && input.getAttribute('autocomplete') === 'off');
    check('1 Save and Copy buttons', !!btn(tab, 'Save and sign in with Spotify') && !!btn(tab, 'Copy this address'));
    check('1 no requests sent', tab.env.req.length === 0, tab.env.req);
    check('1 app not started, top bar hidden', tab.t().state.started === false && topHidden(tab));
    check('1 no navigation', navs(tab).length === 0, navs(tab));
  });
});

// 2. Setup: a bad Client ID is refused with a message; nothing is stored or opened.
tests.push(function () {
  var store = H.makeStore();
  return setup(store).then(function (tab) {
    var input = d(tab).getElementById('clientId');
    input.value = 'not-a-client-id';
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    check('2 bad id shows message', /doesn’t look like a Client ID/.test(errText(tab)), errText(tab));
    check('2 bad id not stored', store.getItem('lib-client-id') === null);
    input.value = '0123456789abcdef0123456789abcde';   // 31 characters
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    check('2 31 characters refused', store.getItem('lib-client-id') === null && /32 letters and numbers/.test(errText(tab)));
    input.value = '0123456789abcdef0123456789abcdeg';  // 'g' is not hex
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    check('2 non-hex refused', store.getItem('lib-client-id') === null && store.getItem('lib-verifier') === null);
    return H.wait(50).then(function () {
      check('2 nothing opened', navs(tab).length === 0, navs(tab));
    });
  });
});

// 3. Setup: a good Client ID (with spaces around it) is saved and starts the PKCE redirect.
tests.push(function () {
  var store = H.makeStore();
  return setup(store).then(function (tab) {
    d(tab).getElementById('clientId').value = '  ' + CLIENT + '\n';
    click(tab, btn(tab, 'Save and sign in with Spotify'));
    return H.wait(100).then(function () {
      check('3 Client ID saved trimmed', getJ(store, 'lib-client-id') === CLIENT, store.getItem('lib-client-id'));
      var verifier = getJ(store, 'lib-verifier'), st = getJ(store, 'lib-state');
      check('3 verifier is 64 letters/digits', typeof verifier === 'string' && /^[A-Za-z0-9]{64}$/.test(verifier), verifier);
      check('3 state is 16 letters/digits', typeof st === 'string' && /^[A-Za-z0-9]{16}$/.test(st), st);
      var n = authNavs(tab);
      check('3 one redirect to Spotify', n.length === 1 && !n[0].replace, navs(tab));
      var u = n[0] ? new URL(n[0].url) : null;
      check('3 authorize host and path', u && u.host === 'accounts.spotify.com' && u.pathname === '/authorize', n[0]);
      var p = u ? u.searchParams : new URLSearchParams();
      check('3 response_type code', p.get('response_type') === 'code');
      check('3 client_id is the saved id', p.get('client_id') === CLIENT, p.get('client_id'));
      check('3 redirect_uri is the page address', p.get('redirect_uri') === BASE, p.get('redirect_uri'));
      var scopes = (p.get('scope') || '').split(' ');
      check('3 every everyday scope requested once', tab.t().SCOPE_LIST.every(function (s) { return scopes.indexOf(s) >= 0 && scopes.indexOf(s) === scopes.lastIndexOf(s); }), p.get('scope'));
      check('3 scopes include playback, library and Up next', ['user-modify-playback-state', 'user-library-modify', 'user-read-currently-playing', 'playlist-read-private'].every(function (s) { return scopes.indexOf(s) >= 0; }));
      check('3 first sign-in asks for no feature-only scopes', scopes.indexOf('user-follow-modify') === -1 && scopes.indexOf('playlist-modify-private') === -1, scopes);
      check('3 challenge method S256', p.get('code_challenge_method') === 'S256');
      var expect = b64urlNode(nodeCrypto.createHash('sha256').update(verifier || '').digest());
      check('3 challenge is SHA-256 of the saved verifier, base64url', p.get('code_challenge') === expect, { got: p.get('code_challenge'), expect: expect });
      check('3 challenge has no padding or +/', /^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge') || ''));
      check('3 state in URL matches saved state', p.get('state') === st);
      check('3 no Spotify API requests yet', tab.env.req.length === 0, tab.env.req);
    });
  });
});

// 4. Setup page opened as .../index.html: the redirect address drops index.html; Copy uses it.
tests.push(function () {
  return setup(H.makeStore(), { url: BASE + 'index.html', clipboard: 'ok' }).then(function (tab) {
    check('4 index.html dropped from redirect', d(tab).getElementById('redirect').textContent === BASE && tab.t().REDIRECT === BASE);
    click(tab, btn(tab, 'Copy this address'));
    return H.wait(30).then(function () {
      check('4 Copy writes the redirect address', tab.env.clip.length === 1 && tab.env.clip[0] === BASE, tab.env.clip);
      check('4 Copy toast', tab.toasts().indexOf('Copied') >= 0, tab.toasts());
    });
  });
});

// 5. Copy when the clipboard refuses, and when there is no clipboard.
tests.push(function () {
  return setup(H.makeStore(), { clipboard: 'reject' }).then(function (tab) {
    click(tab, btn(tab, 'Copy this address'));
    return H.wait(30).then(function () {
      check('5 clipboard refused asks to copy by hand', tab.toasts().indexOf('Select the address and copy it') >= 0, tab.toasts());
    });
  }).then(function () {
    return setup(H.makeStore()).then(function (tab) {
      var hasClip = !!(tab.w.navigator.clipboard && tab.w.navigator.clipboard.writeText);
      click(tab, btn(tab, 'Copy this address'));
      return H.wait(30).then(function () {
        check('5 no clipboard asks to copy by hand', !hasClip && tab.toasts().indexOf('Select the address and copy it') >= 0, tab.toasts());
      });
    });
  });
});

// 6. Client ID saved, no token: the sign-in screen; its button starts the redirect.
tests.push(function () {
  var store = clientStore();
  return setup(store).then(function (tab) {
    check('6 sign-in screen shown', heading(tab) === 'Sign in', heading(tab));
    check('6 no error line', errText(tab) === '');
    check('6 nothing sent, not started', tab.env.req.length === 0 && tab.t().state.started === false && topHidden(tab));
    click(tab, btn(tab, 'Sign in with Spotify'));
    return H.wait(100).then(function () {
      var n = authNavs(tab);
      var p = n[0] ? new URL(n[0].url).searchParams : new URLSearchParams();
      check('6 button redirects to authorize', n.length === 1 && p.get('client_id') === CLIENT, navs(tab));
      check('6 state saved and sent', p.get('state') === getJ(store, 'lib-state') && !!getJ(store, 'lib-verifier'));
      var first = { st: getJ(store, 'lib-state'), v: getJ(store, 'lib-verifier'), ch: p.get('code_challenge') };
      click(tab, btn(tab, 'Sign in with Spotify'));
      return H.wait(100).then(function () {
        var n2 = authNavs(tab);
        var p2 = n2[1] ? new URL(n2[1].url).searchParams : new URLSearchParams();
        check('6 second tap makes a new state and verifier', n2.length === 2 && getJ(store, 'lib-state') !== first.st && getJ(store, 'lib-verifier') !== first.v && p2.get('code_challenge') !== first.ch, { first: first, p2: p2.toString() });
        check('6 second redirect uses the new state', p2.get('state') === getJ(store, 'lib-state'));
      });
    });
  });
});

// 7. Sign-in screen: Change Client ID opens setup and forgets nothing yet (plain-messages: the old ID and token stay
// until a different ID is saved; see suites/plain-messages).
tests.push(function () {
  var store = clientStore();
  return setup(store).then(function (tab) {
    store.setItem('lib-token', JSON.stringify({ access: 'x', refresh: 'y', expires: 0, scope: '' }));
    var id0 = store.getItem('lib-client-id');
    click(tab, btn(tab, 'Change Client ID'));
    check('7 Client ID kept until a new one is saved', store.getItem('lib-client-id') === id0 && id0 !== null);
    check('7 token kept until a new ID is saved', store.getItem('lib-token') !== null);
    check('7 setup screen shown', heading(tab) === 'One-time setup', heading(tab));
    check('7 nothing opened', navs(tab).length === 0);
  });
});

// 8. login() without a Client ID shows setup; a failing SHA-256 shows a toast and opens nothing.
tests.push(function () {
  var store = H.makeStore();
  return setup(store).then(function (tab) {
    tab.t().renderSignIn();
    tab.t().login();
    check('8 login without Client ID shows setup', heading(tab) === 'One-time setup' && store.getItem('lib-verifier') === null);
  }).then(function () {
    return setup(clientStore(), { digestFail: true }).then(function (tab) {
      click(tab, btn(tab, 'Sign in with Spotify'));
      return H.wait(50).then(function () {
        check('8 digest failure toast', tab.toasts().indexOf('Couldn’t start sign-in (digest unavailable).') >= 0, tab.toasts());
        check('8 digest failure opens nothing', navs(tab).length === 0, navs(tab));
      });
    });
  });
});

// 9. randomString and b64url.
tests.push(function () {
  return setup(H.makeStore()).then(function (tab) {
    var t = tab.t();
    var a = t.randomString(40), b = t.randomString(40);
    check('9 randomString length and alphabet', a.length === 40 && /^[A-Za-z0-9]+$/.test(a), a);
    check('9 randomString differs per call', a !== b);
    check('9 randomString(0) is empty', t.randomString(0) === '');
    check('9 b64url replaces + and / and drops padding', t.b64url(new Uint8Array([0xfb, 0xff, 0xbf]).buffer) === '-_-_', t.b64url(new Uint8Array([0xfb, 0xff, 0xbf]).buffer));
    check('9 b64url one byte has no padding', t.b64url(new Uint8Array([1]).buffer) === 'AQ');
    var h = nodeCrypto.createHash('sha256').update('abc').digest();
    var ab = h.buffer.slice(h.byteOffset, h.byteOffset + h.length);
    check('9 b64url of a SHA-256 matches Node', t.b64url(ab) === b64urlNode(h), t.b64url(ab));
  });
});

// 10. Callback with a good code and state: one form POST to /api/token, token saved, URL cleaned, app starts.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  var t0 = Date.now();
  return setup(store, {
    url: BASE + '?code=abc123&state=st1',
    token: okToken('A1', { refresh_token: 'R1', scope: ALL_SCOPES }),
    wait: 400
  }).then(function (tab) {
    var t = tab.t();
    var tr = tokenReqs(tab);
    check('10 one token request', tr.length === 1, tab.env.req.map(function (r) { return r.method + ' ' + r.url; }));
    var r = tr[0] || { headers: {} };
    var f = form(r);
    check('10 token request is a form POST', r.method === 'POST' && r.headers['content-type'] === 'application/x-www-form-urlencoded', r);
    check('10 grant_type authorization_code', f.get('grant_type') === 'authorization_code');
    check('10 code sent', f.get('code') === 'abc123');
    check('10 redirect_uri sent', f.get('redirect_uri') === BASE, f.get('redirect_uri'));
    check('10 client_id sent', f.get('client_id') === CLIENT);
    check('10 code_verifier is the saved verifier', f.get('code_verifier') === 'V'.repeat(64));
    check('10 no client secret and no Authorization header', !f.has('client_secret') && !r.headers.authorization, r);
    var tok = getJ(store, 'lib-token') || {};
    check('10 token saved', tok.access === 'A1' && tok.refresh === 'R1' && tok.scope === ALL_SCOPES, tok);
    check('10 expiry is 60 s early', tok.expires >= t0 + 3540e3 && tok.expires <= Date.now() + 3540e3, { exp: tok.expires, t0: t0 });
    check('10 verifier and state removed', store.getItem('lib-verifier') === null && store.getItem('lib-state') === null);
    check('10 URL cleaned to the redirect address', tab.w.location.href === BASE && tab.w.location.search === '', tab.w.location.href);
    check('10 cleaned with replaceState (no navigation)', navs(tab).length === 0, navs(tab));
    check('10 app started', t.state.started === true && !topHidden(tab));
    check('10 banner hidden with all scopes', bannerHidden(tab));
    var api = apiReqs(tab);
    check('10 API requests sent after sign-in', api.length > 0);
    check('10 API requests use the new token', api.length > 0 && api.every(function (q) { return q.headers.authorization === 'Bearer A1'; }), api.map(function (q) { return q.headers.authorization; }));
    check('10 token request before any API request', tab.env.req.indexOf(r) === 0);
  });
});

// 11. Callback where the state does not match: no exchange, sign-in screen with a message, URL cleaned.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(store, { url: BASE + '?code=abc&state=WRONG', token: okToken('A1') }).then(function (tab) {
    check('11 no token request', tokenReqs(tab).length === 0 && tab.env.req.length === 0, tab.env.req);
    check('11 sign-in screen with check message', heading(tab) === 'Sign in' && errText(tab) === 'Sign-in check failed. Please try again.', errText(tab));
    check('11 no token stored', store.getItem('lib-token') === null);
    check('11 URL cleaned', tab.w.location.href === BASE, tab.w.location.href);
    check('11 not started', tab.t().state.started === false && topHidden(tab));
  });
});

// 12. Callback with a code but no state while one was saved: refused the same way.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(store, { url: BASE + '?code=abc', token: okToken('A1') }).then(function (tab) {
    check('12 missing state refused', tokenReqs(tab).length === 0 && errText(tab) === 'Sign-in check failed. Please try again.', errText(tab));
  }).then(function () {
    var store2 = clientStore({ 'lib-verifier': 'V'.repeat(64) });
    return setup(store2, { url: BASE + '?code=abc&state=st9', token: okToken('A1') }).then(function (tab) {
      check('12 state with none saved refused', tokenReqs(tab).length === 0 && /Sign-in check failed/.test(errText(tab)) && store2.getItem('lib-token') === null, errText(tab));
    });
  });
});

// 13. Callback with error=access_denied: message on the sign-in screen, nothing sent, URL cleaned; can sign in again.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(store, { url: BASE + '?error=access_denied&state=st1', token: okToken('A1') }).then(function (tab) {
    check('13 cancelled message', heading(tab) === 'Sign in' && errText(tab) === 'Sign-in was cancelled.', errText(tab));
    check('13 nothing sent', tab.env.req.length === 0, tab.env.req);
    check('13 URL cleaned', tab.w.location.href === BASE && tab.w.location.search === '', tab.w.location.href);
    check('13 no token, not started', store.getItem('lib-token') === null && tab.t().state.started === false);
    click(tab, btn(tab, 'Sign in with Spotify'));
    return H.wait(100).then(function () {
      check('13 Sign in again redirects', authNavs(tab).length === 1, navs(tab));
    });
  });
});

// 14. Callback whose code exchange fails: Spotify's description, its error code, HTTP status, network failure.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(store, {
    url: BASE + '?code=old&state=st1',
    token: function () { return { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid authorization code' } }; }
  }).then(function (tab) {
    check('14 description shown', heading(tab) === 'Sign in' && errText(tab) === 'Could not finish sign-in: Invalid authorization code', errText(tab));
    check('14 no token stored, not started', store.getItem('lib-token') === null && tab.t().state.started === false && topHidden(tab));
    check('14 no API requests after failed exchange', apiReqs(tab).length === 0, apiReqs(tab));
  }).then(function () {
    var s = clientStore({ 'lib-verifier': 'V', 'lib-state': 'st1' });
    return setup(s, { url: BASE + '?code=x&state=st1', token: function () { return { status: 400, json: { error: 'invalid_client' } }; } }).then(function (tab) {
      check('14 error code shown without description', errText(tab) === 'Could not finish sign-in: invalid_client', errText(tab));
    });
  }).then(function () {
    var s = clientStore({ 'lib-verifier': 'V', 'lib-state': 'st1' });
    return setup(s, { url: BASE + '?code=x&state=st1', token: function () { return { status: 503, json: {} }; } }).then(function (tab) {
      check('14 HTTP status shown when no error field', errText(tab) === 'Could not finish sign-in: HTTP 503', errText(tab));
    });
  }).then(function () {
    var s = clientStore({ 'lib-verifier': 'V', 'lib-state': 'st1' });
    return setup(s, { url: BASE + '?code=x&state=st1', token: okToken('A1'), netFail: function (u) { return /accounts\.spotify\.com/.test(u); } }).then(function (tab) {
      check('14 network failure shown', errText(tab) === 'Could not finish sign-in: Load failed' && s.getItem('lib-token') === null, errText(tab));
      check('14 URL cleaned after failure', tab.w.location.search === '');
    });
  });
});

// 15. Callback that also carries ?wake=1: the wake flag is dropped and sign-in still completes.
tests.push(function () {
  var store = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(store, { url: BASE + '?wake=1&code=c&state=st1', token: okToken('A9', { refresh_token: 'R9', scope: ALL_SCOPES }), wait: 400 }).then(function (tab) {
    check('15 exchange still happens', tokenReqs(tab).length === 1 && form(tokenReqs(tab)[0]).get('code') === 'c');
    check('15 signed in and URL clean', (getJ(store, 'lib-token') || {}).access === 'A9' && tab.w.location.href === BASE, tab.w.location.href);
  });
});

// 16. Saved token still valid: app starts, requests carry it, no token request.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    check('16 started with saved token', tab.t().state.started === true && !topHidden(tab));
    var api = apiReqs(tab);
    check('16 API requests use saved token', api.length > 0 && api.every(function (q) { return q.headers.authorization === 'Bearer fake'; }), api.map(function (q) { return q.headers.authorization; }));
    check('16 no token request', tokenReqs(tab).length === 0);
    check('16 no sign-in screen', heading(tab) !== 'Sign in' && heading(tab) !== 'One-time setup');
  });
});

// 17. Expired token: one refresh shared by every request at start; new access token used; refresh and scope kept.
tests.push(function () {
  var store = tokenStore({ access: 'old', refresh: 'r', expires: Date.now() - 1000, scope: ALL_SCOPES });
  var t0 = Date.now();
  return setup(store, { token: okToken('A2', { expires_in: 1800 }) }).then(function (tab) {
    var tr = tokenReqs(tab);
    check('17 exactly one refresh for all start-up requests', tr.length === 1 && apiReqs(tab).length >= 2, { tokens: tr.length, api: apiReqs(tab).length });
    var f = form(tr[0] || {});
    check('17 refresh body', f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'r' && f.get('client_id') === 'fakeclient', String(f));
    check('17 refresh sends no code or verifier', !f.has('code') && !f.has('code_verifier'));
    check('17 refresh is a form POST', tr[0] && tr[0].method === 'POST' && tr[0].headers['content-type'] === 'application/x-www-form-urlencoded');
    var tok = getJ(store, 'lib-token') || {};
    check('17 new access token saved', tok.access === 'A2');
    check('17 refresh token kept when Spotify sends none', tok.refresh === 'r');
    check('17 scope kept when Spotify sends none', tok.scope === ALL_SCOPES, tok.scope);
    check('17 new expiry from expires_in', tok.expires >= t0 + 1740e3 && tok.expires <= Date.now() + 1740e3, tok.expires);
    var api = apiReqs(tab);
    check('17 no request sent with the old token', api.every(function (q) { return q.headers.authorization === 'Bearer A2'; }), api.map(function (q) { return q.headers.authorization; }));
    check('17 still started, banner hidden', tab.t().state.started === true && bannerHidden(tab));
  });
});

// 18. Refresh that returns a new refresh token and a narrower scope: both saved; banner appears.
tests.push(function () {
  var narrow = ALL_SCOPES.split(' ').filter(function (s) { return s !== 'user-read-currently-playing'; }).join(' ');
  var store = tokenStore({ access: 'old', refresh: 'r', expires: 0, scope: ALL_SCOPES });
  return setup(store, { token: okToken('A3', { refresh_token: 'r2', scope: narrow }) }).then(function (tab) {
    var tok = getJ(store, 'lib-token') || {};
    check('18 rotated refresh token saved', tok.refresh === 'r2' && tok.access === 'A3', tok);
    check('18 returned scope saved', tok.scope === narrow);
    check('18 missingScopes names the dropped scope', JSON.stringify(tab.t().missingScopes()) === '["user-read-currently-playing"]', tab.t().missingScopes());
    check('18 banner shown', !bannerHidden(tab));
  });
});

// 19. A 401 marks the token expired; the next request refreshes first, then uses the new token.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { token: okToken('A4') }).then(function (tab) {
    var t = tab.t();
    tab.env.script.push({ m: 'GET', path: '/me', status: 401, json: { error: { status: 401, message: 'The access token expired' } }, times: 1 });
    tab.env.req.length = 0;
    return t.api('/me').then(function (res) {
      check('19 401 answer returned, not retried', res.status === 401 && res.ok === false && apiReqs(tab).length === 1 && tokenReqs(tab).length === 0, { res: res, req: tab.env.req.length });
      var tok = getJ(store, 'lib-token') || {};
      check('19 token marked expired, refresh kept', tok.expires === 0 && tok.access === 'fake' && tok.refresh === 'r', tok);
      tab.env.req.length = 0;
      return t.api('/me');
    }).then(function (res) {
      var tr = tokenReqs(tab), api = apiReqs(tab);
      check('19 next call refreshes first', tr.length === 1 && tab.env.req.indexOf(tr[0]) === 0 && form(tr[0]).get('grant_type') === 'refresh_token', tab.env.req.map(function (r) { return r.url; }));
      check('19 next call uses new token and succeeds', res.ok && api.length === 1 && api[0].headers.authorization === 'Bearer A4', api);
      check('19 new token stored', (getJ(store, 'lib-token') || {}).access === 'A4');
    });
  });
});

// 20. accessToken: several calls while expired share one refresh; a valid token sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { token: okToken('A5') }).then(function (tab) {
    var t = tab.t();
    tab.env.req.length = 0;
    return t.accessToken().then(function (a) {
      check('20 valid token returned without a request', a === 'fake' && tab.env.req.length === 0);
      var tok = getJ(store, 'lib-token'); tok.expires = Date.now() - 1; store.setItem('lib-token', JSON.stringify(tok));
      return Promise.all([t.accessToken(), t.accessToken(), t.accessToken()]);
    }).then(function (all) {
      check('20 three calls, one refresh', tokenReqs(tab).length === 1 && all.join() === 'A5,A5,A5', { n: tokenReqs(tab).length, all: all });
      return t.accessToken();
    }).then(function (a) {
      check('20 after refresh no further request', a === 'A5' && tokenReqs(tab).length === 1);
    });
  });
});

// 21. accessToken without a token, or expired without a refresh token: signed-out, nothing sent.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    store.removeItem('lib-token');
    tab.env.req.length = 0;
    return t.accessToken().then(function () { return 'resolved'; }, function (e) { return e.message; }).then(function (m) {
      check('21 no token rejects signed-out', m === 'signed-out' && tab.env.req.length === 0, m);
      store.setItem('lib-token', JSON.stringify({ access: 'a', expires: 0, scope: ALL_SCOPES }));
      return t.accessToken().then(function () { return 'resolved'; }, function (e) { return e.message; });
    }).then(function (m) {
      check('21 expired without refresh token rejects signed-out', m === 'signed-out' && tokenReqs(tab).length === 0, m);
      return t.api('/me').then(function () { return 'resolved'; }, function (e) { return e.message; });
    }).then(function (m) {
      check('21 api() sends nothing when signed out', m === 'signed-out' && apiReqs(tab).length === 0, m);
    });
  });
});

// 22. Refresh refused (invalid_grant) at start: since AUTH-1 (#14) the page first waits up to 2 s for another
// copy's newer token; none comes, so the token is deleted and the sign-in screen shows. Client ID kept.
tests.push(function () {
  var store = tokenStore({ access: 'old', refresh: 'revoked', expires: 0, scope: ALL_SCOPES });
  return setup(store, { token: function () { return { status: 400, json: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }; } }).then(function (tab) {
    check('22 token kept for now while waiting for another copy\'s newer token', (getJ(store, 'lib-token') || {}).refresh === 'revoked' && heading(tab) !== 'Sign in' && tab.t().state.started === true, { tok: getJ(store, 'lib-token'), h: heading(tab) });
    return H.wait(2300).then(function () {
      check('22 token deleted', store.getItem('lib-token') === null);
      check('22 sign-in screen shown', heading(tab) === 'Sign in', heading(tab));
      check('22 app stopped, top bar and banner hidden', tab.t().state.started === false && topHidden(tab) && bannerHidden(tab));
      check('22 Client ID kept', getJ(store, 'lib-client-id') === 'fakeclient');
      check('22 no API request with the old token', apiReqs(tab).length === 0, apiReqs(tab));
      check('22 one refresh tried', tokenReqs(tab).length === 1, tokenReqs(tab).length);
    });
  });
});

// 23. Refresh failing for another reason (server error): token kept, no sign-in screen; next call tries again.
tests.push(function () {
  var store = tokenStore({ access: 'old', refresh: 'r', expires: 0, scope: ALL_SCOPES });
  var fail = true;
  return setup(store, { token: function () { return fail ? { status: 500, json: { error: 'server_error', error_description: 'Try later' } } : { status: 200, json: { access_token: 'A6', expires_in: 3600 } }; } }).then(function (tab) {
    var t = tab.t();
    check('23 token kept after server error', (getJ(store, 'lib-token') || {}).refresh === 'r');
    check('23 no sign-in screen', heading(tab) !== 'Sign in' && t.state.started === true, heading(tab));
    check('23 library error shown', /Couldn’t load your library \(Try later\)\./.test(main(tab).textContent), main(tab).textContent.slice(0, 200));   // #41: same wording as other errors
    check('23 nothing sent with the expired token', apiReqs(tab).length === 0, apiReqs(tab));
    fail = false;
    var before = tokenReqs(tab).length;
    return t.api('/me').then(function (res) {
      check('23 next call refreshes again and succeeds', tokenReqs(tab).length === before + 1 && res.ok && (getJ(store, 'lib-token') || {}).access === 'A6');
    });
  });
});

// 24. Saved token expired with no refresh token: start shows the sign-in screen.
tests.push(function () {
  var store = tokenStore({ access: 'old', expires: 0, scope: ALL_SCOPES });
  return setup(store).then(function (tab) {
    check('24 sign-in screen shown', heading(tab) === 'Sign in' && tab.t().state.started === false, heading(tab));
    check('24 nothing sent', tab.env.req.length === 0, tab.env.req);
  });
});

// 25. saveToken.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    var t0 = Date.now();
    t.saveToken({ access_token: 'S1', expires_in: 120 }, false);
    var tok = getJ(store, 'lib-token');
    check('25 refresh and scope kept on refresh without them', tok.access === 'S1' && tok.refresh === 'r' && tok.scope === ALL_SCOPES, tok);
    check('25 expiry is expires_in minus 60 s', tok.expires >= t0 + 60e3 && tok.expires <= Date.now() + 60e3, tok.expires - t0);
    t.state.scopeProblem = true;
    t.saveToken({ access_token: 'S2', expires_in: 3600 }, false);
    check('25 refresh leaves a scope problem in place', t.state.scopeProblem === true);
    t.saveToken({ access_token: 'S3', refresh_token: 'N', expires_in: 3600 }, true);
    tok = getJ(store, 'lib-token');
    check('25 fresh sign-in without scope saves empty scope', tok.scope === '' && tok.refresh === 'N', tok);
    check('25 fresh sign-in clears the scope problem', t.state.scopeProblem === false);
    check('25 empty scope means every scope missing', t.missingScopes().length === t.SCOPE_LIST.length);
    t.saveToken({ access_token: 'S4', expires_in: 3600, scope: ALL_SCOPES }, true);
    check('25 fresh sign-in with scope saves it', getJ(store, 'lib-token').scope === ALL_SCOPES && t.missingScopes().length === 0);
    store.removeItem('lib-token');
    t.saveToken({ access_token: 'S5', expires_in: 3600 }, false);
    tok = getJ(store, 'lib-token');
    check('25 no earlier token: no refresh, empty scope', tok.access === 'S5' && tok.refresh === undefined && tok.scope === '', tok);
  });
});

// 26. missingScopes and the banner.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('26 all scopes: none missing, banner hidden', t.missingScopes().length === 0 && bannerHidden(tab));
    var tok = getJ(store, 'lib-token');
    tok.scope = ALL_SCOPES.replace('user-library-modify', '').replace('user-follow-read', '');
    store.setItem('lib-token', JSON.stringify(tok));
    check('26 two missing named in order', JSON.stringify(t.missingScopes()) === '["user-library-modify","user-follow-read"]', t.missingScopes());
    t.updateBanner();
    check('26 banner shown when scopes are missing', !bannerHidden(tab));
    delete tok.scope; store.setItem('lib-token', JSON.stringify(tok));
    check('26 token without scope field: all missing', t.missingScopes().length === t.SCOPE_LIST.length);
    store.removeItem('lib-token');
    check('26 no token: all missing', t.missingScopes().length === t.SCOPE_LIST.length);
    tok.scope = ALL_SCOPES + ' extra-scope'; store.setItem('lib-token', JSON.stringify(tok));
    t.updateBanner();
    check('26 extra granted scopes are fine', t.missingScopes().length === 0 && bannerHidden(tab));
  });
});

// 27. Old token missing a scope: banner at start; its button starts a new sign-in.
tests.push(function () {
  var narrow = ALL_SCOPES.split(' ').filter(function (s) { return s !== 'user-read-playback-position'; }).join(' ');
  var store = tokenStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: narrow });
  return setup(store).then(function (tab) {
    check('27 banner shown at start', !bannerHidden(tab));
    check('27 app still works (started, requests sent)', tab.t().state.started === true && apiReqs(tab).length > 0);
    click(tab, d(tab).getElementById('bannerBtn'));
    return H.wait(100).then(function () {
      var n = authNavs(tab);
      var p = n[0] ? new URL(n[0].url).searchParams : new URLSearchParams();
      check('27 banner button redirects to authorize with every scope', n.length === 1 && (p.get('scope') || '').split(' ').indexOf('user-read-playback-position') >= 0, navs(tab));
      check('27 banner button saves state and verifier', p.get('state') === getJ(store, 'lib-state') && !!getJ(store, 'lib-verifier'));
      check('27 token kept while signing in again', (getJ(store, 'lib-token') || {}).access === 'fake');
    });
  });
});

// 28. A 403 that mentions scope shows the banner even with all scopes; a fresh sign-in clears it.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.script.push({ m: 'GET', path: '/me/following', status: 403, json: { error: { status: 403, message: 'Insufficient client scope' } }, times: 1 });
    return t.api('/me/following?type=artist').then(function (res) {
      check('28 403 returned', res.status === 403);
      check('28 scope problem shows banner', t.state.scopeProblem === true && !bannerHidden(tab));
      tab.env.script.push({ m: 'GET', path: '/me/albums', status: 403, json: { error: { status: 403, message: 'Forbidden' } }, times: 1 });
      t.state.scopeProblem = false; t.updateBanner();
      return t.api('/me/albums');
    }).then(function () {
      check('28 a 403 without scope does not', t.state.scopeProblem === false && bannerHidden(tab));
      t.state.scopeProblem = true; t.updateBanner();
      t.saveToken({ access_token: 'F', expires_in: 3600, scope: ALL_SCOPES }, true);
      check('28 fresh sign-in hides banner', t.state.scopeProblem === false && bannerHidden(tab));
    });
  });
});

// 29. Banner never shows on the sign-in or setup screens.
tests.push(function () {
  var store = clientStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.state.scopeProblem = true; t.updateBanner();
    check('29 banner hidden on sign-in screen', bannerHidden(tab) && t.missingScopes().length === t.SCOPE_LIST.length);
  });
});

// 30. stopApp (sign-out path): app stopped, bars hidden, last playback forgotten, poller released, no more checks.
tests.push(function () {
  var store = H.seedStore();
  var player = H.song('spotify:track:t1');
  return setup(store, { script: [{ m: 'GET', path: '/me/player', status: 200, json: player }], wait: 500 }).then(function (tab) {
    var t = tab.t();
    var wasPlaying = !d(tab).getElementById('player').hidden;
    store.setItem('lib-lastplay', JSON.stringify({ item: { uri: 'spotify:track:t1' }, positionMs: 1, at: Date.now() }));
    store.setItem('lib-poller', JSON.stringify({ id: t.MY_ID, at: Date.now(), every: 20000 }));
    t.stopApp();
    check('30 player bar was showing before', wasPlaying);
    check('30 started false', t.state.started === false);
    check('30 top bar hidden', topHidden(tab));
    check('30 banner hidden', bannerHidden(tab));
    check('30 player bar hidden', d(tab).getElementById('player').hidden);
    check('30 player state cleared', t.state.player === null && t.state.pollTimer === null);
    check('30 last playback forgotten', store.getItem('lib-lastplay') === null);
    check('30 player-check lock released', store.getItem('lib-poller') === null);
    check('30 open view closed', t.state.detail === null && t.state.detailStack.length === 0);
    check('30 sign-in itself kept (only Change Client ID forgets it)', !!store.getItem('lib-token') && !!store.getItem('lib-client-id'));
    tab.env.req.length = 0;
    tab.w.document.dispatchEvent(new tab.w.Event('visibilitychange'));
    return H.wait(100).then(function () {
      check('30 returning to the page after stop sends nothing', tab.env.req.length === 0, tab.env.req.map(function (r) { return r.url; }));
    });
  });
});

// 31. stopApp leaves another copy's player-check lock alone.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    store.setItem('lib-poller', JSON.stringify({ id: 'someone-else', at: Date.now(), every: 20000 }));
    tab.t().stopApp();
    check('31 other copy keeps its lock', (getJ(store, 'lib-poller') || {}).id === 'someone-else');
  });
});

// 32. Signed out mid-visit (refresh refused while the app runs): sign-in screen replaces the library, about 2 s
// later (AUTH-1, #14: the page first waits for another copy's newer token).
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { token: function () { return { status: 400, json: { error: 'invalid_grant' } }; } }).then(function (tab) {
    var t = tab.t();
    var tok = getJ(store, 'lib-token'); tok.expires = 0; store.setItem('lib-token', JSON.stringify(tok));
    click(tab, d(tab).getElementById('refreshBtn'));
    return H.wait(150).then(function () {
      check('32 still in the library just after the refused refresh', heading(tab) !== 'Sign in' && t.state.started === true && (getJ(store, 'lib-token') || {}).refresh === 'r', heading(tab));
      return H.wait(2400);
    }).then(function () {
      check('32 sign-in screen after refused refresh', heading(tab) === 'Sign in' && t.state.started === false, heading(tab));
      check('32 token removed', store.getItem('lib-token') === null);
      check('32 top bar hidden', topHidden(tab));
      check('32 one refresh sent for the whole wait', tokenReqs(tab).length === 1, tokenReqs(tab).length);
    });
  });
});

// 33. loadSavedSession: saved-state answers from this browser session, booleans only, known answers kept.
tests.push(function () {
  var session = { 'spotify:track:x': true, 'spotify:album:y': false, 'spotify:track:bad': 'yes', 'spotify:track:n': null };
  return setup(H.seedStore(), { session: session }).then(function (tab) {
    var s = tab.t().state.saved;
    check('33 true and false restored at start', s['spotify:track:x'] === true && s['spotify:album:y'] === false, { x: s['spotify:track:x'], y: s['spotify:album:y'] });
    check('33 non-boolean values ignored', s['spotify:track:bad'] === undefined && s['spotify:track:n'] === undefined);
    s['spotify:track:x'] = false;
    tab.w.sessionStorage.setItem('lib-saved', JSON.stringify({ 'spotify:track:x': true, 'spotify:track:z': true }));
    tab.t().loadSavedSession();
    check('33 known answer not overwritten', s['spotify:track:x'] === false);
    check('33 new answer added', s['spotify:track:z'] === true);
    tab.w.sessionStorage.setItem('lib-saved', '{broken');
    var threw = false;
    try { tab.t().loadSavedSession(); } catch (e) { threw = true; }
    check('33 broken session data ignored', !threw && s['spotify:track:z'] === true);
  });
});

// 34. Signing in again keeps a feature permission already granted; one never granted is not asked for.
tests.push(function () {
  var store = tokenStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: 'user-follow-read user-follow-modify' });
  return setup(store).then(function (tab) {
    check('34 banner shown for the missing everyday scopes', !bannerHidden(tab));
    click(tab, d(tab).getElementById('bannerBtn'));
    return H.wait(100).then(function () {
      var n = authNavs(tab);
      var scopes = n[0] ? (new URL(n[0].url).searchParams.get('scope') || '').split(' ') : [];
      check('34 granted feature scope kept on the new sign-in', scopes.indexOf('user-follow-modify') >= 0, scopes);
      check('34 everyday scopes all asked for', tab.t().SCOPE_LIST.every(function (s) { return scopes.indexOf(s) >= 0; }), scopes);
      check('34 feature never granted not asked for', scopes.indexOf('playlist-modify-private') === -1, scopes);
    });
  });
});

// 35. A cancelled "Sign in again" while still holding a token (not a feature sign-in): since AUTH-2 (#15) the page
// goes back to the library with a toast; the token and the last playback are kept.
tests.push(function () {
  var store = tokenStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: ALL_SCOPES });
  store.setItem('lib-state', JSON.stringify('st1'));
  var lastplay = { item: { uri: 'spotify:track:t1', id: 't1', name: 'Song One', type: 'track', duration_ms: 240000,
    album: { id: 'a1', name: 'Album', images: [], uri: 'spotify:album:a1' }, artists: [{ name: 'Artist' }], show: null },
    context: { type: 'album', uri: 'spotify:album:a1' }, positionMs: 60000, deviceId: 'A', shuffle: false, repeat: 'off', at: Date.now() };
  store.setItem('lib-lastplay', JSON.stringify(lastplay));
  var tokBefore = store.getItem('lib-token');
  return setup(store, { url: BASE + '?error=access_denied&state=st1' }).then(function (tab) {
    check('35 back in the library with the cancelled toast', heading(tab) !== 'Sign in' && tab.t().state.started === true && !topHidden(tab) &&
      tab.toasts().indexOf('Sign-in was cancelled. You’re still signed in.') >= 0, { h: heading(tab), err: errText(tab), toasts: tab.toasts() });
    check('35 no token request, URL cleaned', tokenReqs(tab).length === 0 && tab.w.location.search === '', tab.env.req.map(function (r) { return r.url; }));
    check('35 token and last playback kept', store.getItem('lib-token') === tokBefore && (getJ(store, 'lib-lastplay') || { item: {} }).item.uri === 'spotify:track:t1', { tok: store.getItem('lib-token'), lp: store.getItem('lib-lastplay') });
    var api = apiReqs(tab);
    check('35 library loads with the old token', api.length > 0 && api.every(function (q) { return q.headers.authorization === 'Bearer fake'; }), api.map(function (q) { return q.headers.authorization; }));
  });
});

// 36. AUTH-2 (#15): a failed state check or a failed code exchange while still holding a token also goes back to
// the library with a toast; on a state mismatch lib-state and lib-verifier stay (another tab may be signing in).
tests.push(function () {
  var store = tokenStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: ALL_SCOPES });
  store.setItem('lib-state', JSON.stringify('st1'));
  store.setItem('lib-verifier', JSON.stringify('V'.repeat(64)));
  var tokBefore = store.getItem('lib-token');
  return setup(store, { url: BASE + '?code=abc&state=WRONG', token: okToken('A1') }).then(function (tab) {
    check('36 state mismatch: no exchange, toast, still in the library', tokenReqs(tab).length === 0 && tab.toasts().indexOf('Sign-in check failed. You’re still signed in.') >= 0 &&
      heading(tab) !== 'Sign in' && tab.t().state.started === true, { toasts: tab.toasts(), h: heading(tab) });
    check('36 state mismatch: token, state and verifier kept, URL cleaned', store.getItem('lib-token') === tokBefore && getJ(store, 'lib-state') === 'st1' &&
      getJ(store, 'lib-verifier') === 'V'.repeat(64) && tab.w.location.search === '', tab.w.location.href);
  }).then(function () {
    var s = tokenStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: ALL_SCOPES });
    s.setItem('lib-state', JSON.stringify('st1'));
    s.setItem('lib-verifier', JSON.stringify('V'.repeat(64)));
    var before = s.getItem('lib-token');
    return setup(s, { url: BASE + '?code=old&state=st1',
      token: function () { return { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid authorization code' } }; } }).then(function (tab) {
      check('36 failed exchange: one token request, toast, still in the library', tokenReqs(tab).length === 1 &&
        tab.toasts().indexOf('Could not finish sign-in (Invalid authorization code). You’re still signed in.') >= 0 &&
        heading(tab) !== 'Sign in' && tab.t().state.started === true, { toasts: tab.toasts(), h: heading(tab) });
      check('36 failed exchange: old token kept and used', s.getItem('lib-token') === before &&
        apiReqs(tab).length > 0 && apiReqs(tab).every(function (q) { return q.headers.authorization === 'Bearer fake'; }), apiReqs(tab).map(function (q) { return q.headers.authorization; }));
    });
  });
});

// 37. AUTH-1 (#14): two copies renew at once. Spotify refuses the second use of the refresh token, but the other
// copy has saved a newer one (before the refusal arrives, or within 2 s of it): it is used, nobody is signed out.
tests.push(function () {
  var store = tokenStore({ access: 'old', refresh: 'r', expires: 0, scope: ALL_SCOPES });
  var other = { access: 'B1', refresh: 'r2', expires: Date.now() + 3600e3, scope: ALL_SCOPES };
  return setup(store, { token: function () {
    store.setItem('lib-token', JSON.stringify(other));   // the other copy won the race and saved first
    return { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid refresh token' } };
  } }).then(function (tab) {
    check('37 other copy saved first: one refresh sent, still in the library', tokenReqs(tab).length === 1 && tab.t().state.started === true && heading(tab) !== 'Sign in', { n: tokenReqs(tab).length, h: heading(tab) });
    check('37 other copy saved first: its token kept', JSON.stringify(getJ(store, 'lib-token')) === JSON.stringify(other), getJ(store, 'lib-token'));
    var api = apiReqs(tab);
    check('37 other copy saved first: requests use its token', api.length > 0 && api.every(function (q) { return q.headers.authorization === 'Bearer B1'; }), api.map(function (q) { return q.headers.authorization; }));
  }).then(function () {
    var s = tokenStore({ access: 'old', refresh: 'r', expires: 0, scope: ALL_SCOPES });
    var late = { access: 'B2', refresh: 'r3', expires: Date.now() + 3600e3, scope: ALL_SCOPES };
    return setup(s, { token: function () { return { status: 400, json: { error: 'invalid_grant' } }; } }).then(function (tab) {
      check('37 refused, other copy not saved yet: nothing sent yet, token kept', apiReqs(tab).length === 0 && (getJ(s, 'lib-token') || {}).refresh === 'r' && tab.t().state.started === true, apiReqs(tab));
      s.setItem('lib-token', JSON.stringify(late));   // the other copy saves its renewal a moment later
      return H.wait(2300).then(function () {
        check('37 other copy saved later: still signed in, no second refresh', tokenReqs(tab).length === 1 && tab.t().state.started === true && heading(tab) !== 'Sign in' &&
          JSON.stringify(getJ(s, 'lib-token')) === JSON.stringify(late), { n: tokenReqs(tab).length, h: heading(tab), tok: getJ(s, 'lib-token') });
        var api = apiReqs(tab);
        check('37 other copy saved later: requests use its token', api.length > 0 && api.every(function (q) { return q.headers.authorization === 'Bearer B2'; }), api.map(function (q) { return q.headers.authorization; }));
      });
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
