'use strict';
// Rate limits and errors: 429 cool-off (per group, shared through localStorage), request meter, error toasts,
// error log and Diagnostics. jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var ACCESS = 'ACCsecretTok_9f8e7d6c';
var REFRESH = 'REFsecretTok_1a2b3c4d';
var NEW_ACCESS = 'NEWaccessTok_5e6f7a8b';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var ITEM = { uri: 'spotify:track:t1', name: 'Song One' };
var ID22 = '4uLU6hMCjMI75M1A2tKUQC';

function seed() {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify('fakeclient'));
  s.setItem('lib-token', JSON.stringify({ access: ACCESS, refresh: REFRESH, expires: Date.now() + 3600e3, scope: H.SCOPE }));
  return s;
}
function token(store) { return JSON.parse(store.getItem('lib-token') || 'null'); }
function cool(store) { return JSON.parse(store.getItem('lib-cooloff') || 'null'); }

// env.route(method, path, q, body, call) answers first; env.fail(path) makes fetch reject (network failure).
// Each tab has its own adjustable clock: tab.adv(ms) moves the page's Date.now forward.
function setup(store, opts) {
  opts = opts || {};
  var env = { route: null, fail: null, auth: [] };
  var clock = { off: 0 };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body;
    if (call.host === 'accounts.spotify.com') return { status: 200, json: { access_token: NEW_ACCESS, expires_in: 3600, scope: H.SCOPE } };
    if (env.route) { var r = env.route(method, path, q, body, call); if (r) return r; }
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  }, {
    beforeParse: function (w) {
      var realNow = w.Date.now.bind(w.Date);
      w.Date.now = function () { return realNow() + clock.off; };
      if (opts.clipboard !== undefined) {
        Object.defineProperty(w.navigator, 'clipboard', { value: opts.clipboard, configurable: true });
      }
    }
  });
  tab.env = env;
  tab.adv = function (ms) { clock.off += ms; };
  tab.now = function () { return tab.w.Date.now(); };
  return H.wait(opts.wait || 500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    var orig = tab.w.fetch;
    tab.w.fetch = function (url, fo) {
      var h = fo && fo.headers;
      env.auth.push({ url: String(url), auth: h && h.Authorization });
      if (env.fail && env.fail(String(url))) {
        tab.calls.push({ method: (fo && fo.method) || 'GET', path: new tab.w.URL(url).pathname.replace('/v1', ''), failed: true });
        return Promise.reject(new TypeError('Load failed'));
      }
      return orig(url, fo);
    };
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function reqs(tab, method, path) {
  return tab.calls.filter(function (c) { return (!method || c.method === method) && (path instanceof RegExp ? path.test(c.path) : c.path === path); });
}
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function fakeRes(retryAfter, throws) {
  return { status: 429, headers: { get: function (h) { if (throws) throw new Error('blocked'); return String(h).toLowerCase() === 'retry-after' ? retryAfter : null; } } };
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 120); }
function settle(p) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }); }
function diagText(tab) { return $(tab, 'diagOut').textContent; }
function diagLine(tab, re) { return diagText(tab).split('\n').filter(function (l) { return re.test(l); })[0] || ''; }

var tests = [];

// 1. noteRateLimit: Retry-After in its forms, the default, the cap, and per-group records.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t(), now;
    now = tab.now(); t.noteRateLimit(fakeRes('30'), null, 'GET /albums/a', 'catalog');
    check('1 Retry-After 30 pauses the group 30 s', near(t.coolUntil('catalog') - now, 30000), t.coolUntil('catalog') - now);
    var rec = cool(store).catalog;
    check('1 record kept in localStorage', rec && rec.reason === 'rate' && rec.retryAfter === '30' && rec.strikes === 0 && rec.last429.what === 'GET /albums/a' && rec.last429.reason === 'rate limit', rec);
    check('1 other groups keep working', t.coolUntil('player') === 0 && t.coolUntil('library') === 0 && t.coolUntil('search') === 0);
    now = tab.now(); t.noteRateLimit(fakeRes(null), null, 'GET /search', 'search');
    check('1 no Retry-After: 30 s default, recorded as null', near(t.coolUntil('search') - now, 30000) && cool(store).search.retryAfter === null, cool(store).search);
    check('1 a second group keeps the first group\'s record', !!cool(store).catalog && !!cool(store).search);
    now = tab.now(); t.noteRateLimit(fakeRes('2.5'), null, 'PUT /me/player/play', 'player');
    check('1 fractional seconds', near(t.coolUntil('player') - now, 2500), t.coolUntil('player') - now);
    now = tab.now(); t.noteRateLimit(fakeRes('soon'), null, 'GET /me/tracks', 'library');
    check('1 unreadable Retry-After: 30 s', near(t.coolUntil('library') - now, 30000), t.coolUntil('library') - now);
    return setup(seed()).then(function (tab2) {
      var t2 = tab2.t(), n2 = tab2.now();
      t2.noteRateLimit(fakeRes(new tab2.w.Date(n2 + 90000).toUTCString()), null, 'GET /albums/a', 'catalog');
      var left = t2.coolUntil('catalog') - n2;
      check('1 HTTP-date Retry-After', left > 88500 && left <= 90200, left);
      n2 = tab2.now(); t2.noteRateLimit(fakeRes('999999'), null, 'GET /search', 'search');
      check('1 huge Retry-After capped at 24 h', near(t2.coolUntil('search') - n2, 24 * 3600e3), t2.coolUntil('search') - n2);
      n2 = tab2.now(); t2.noteRateLimit(fakeRes('600'), null, 'GET /me/tracks', 'library');
      var u1 = t2.coolUntil('library');
      t2.noteRateLimit(fakeRes('5'), null, 'GET /me/albums', 'library');
      check('1 a shorter later 429 does not shorten the pause', t2.coolUntil('library') === u1 && cool(store) !== null, { a: u1, b: t2.coolUntil('library') });
      check('1 last429 shows the newest request', JSON.parse(tab2.dom.window.localStorage.getItem('lib-cooloff')).library.last429.what === 'GET /me/albums');
      n2 = tab2.now(); t2.noteRateLimit(fakeRes('7', true), null, 'GET /me/player', 'player');
      check('1 headers.get throwing counts as no header', near(t2.coolUntil('player') - n2, 30000), t2.coolUntil('player') - n2);
    });
  });
});

// 2. QUOTA_EXCEEDED: 10 min, doubling on repeats up to 2 h, reset after 2 h quiet.
tests.push(function () {
  var store = seed();
  var Q = { error: { status: 429, message: 'Quota exceeded', reason: 'QUOTA_EXCEEDED' } };
  return setup(store).then(function (tab) {
    var t = tab.t(), now = tab.now();
    t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    var r = cool(store).catalog;
    check('2 first quota 429: 10 min', near(t.coolUntil('catalog') - now, 600000) && r.reason === 'quota' && r.strikes === 1 && r.last429.reason === 'QUOTA_EXCEEDED', r);
    var u = t.coolUntil('catalog');
    t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s2', 'catalog');
    check('2 a quota answer during the pause does not count again', cool(store).catalog.strikes === 1 && near(t.coolUntil('catalog'), u, 200), cool(store).catalog);
    t.noteRateLimit(fakeRes('5'), null, 'GET /shows/s3', 'catalog');
    check('2 a plain 429 during a quota pause stays quota', cool(store).catalog.reason === 'quota');
    tab.adv(601000);
    check('2 pause over after 10 min', t.coolUntil('catalog') === 0);
    now = tab.now(); t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    check('2 second quota 429: 20 min', near(t.coolUntil('catalog') - now, 1200000) && cool(store).catalog.strikes === 2, cool(store).catalog);
    tab.adv(1201000); now = tab.now(); t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    check('2 third: 40 min', near(t.coolUntil('catalog') - now, 2400000), t.coolUntil('catalog') - now);
    tab.adv(2401000); now = tab.now(); t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    check('2 fourth: 80 min', near(t.coolUntil('catalog') - now, 4800000), t.coolUntil('catalog') - now);
    tab.adv(4801000); now = tab.now(); t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    check('2 fifth: capped at 2 h', near(t.coolUntil('catalog') - now, 7200000) && cool(store).catalog.strikes === 5, { left: t.coolUntil('catalog') - now, s: cool(store).catalog.strikes });
    tab.adv(7200000 + 7201000); now = tab.now(); t.noteRateLimit(fakeRes(null), Q, 'GET /shows/s1', 'catalog');
    check('2 two quiet hours start over at 10 min', near(t.coolUntil('catalog') - now, 600000) && cool(store).catalog.strikes === 1, { left: t.coolUntil('catalog') - now, s: cool(store).catalog.strikes });
    now = tab.now(); t.noteRateLimit(fakeRes('3600'), Q, 'GET /episodes/e1', 'player');
    check('2 a longer Retry-After beats the quota minimum', near(t.coolUntil('player') - now, 3600000), t.coolUntil('player') - now);
  });
});

// 3. isCool / coolErr / coolUntil / readCool edge cases (stored records from other copies or older pages).
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t(), now = tab.now();
    var e = t.coolErr('search');
    check('3 coolErr shape', e instanceof tab.w.Error && e.message === 'cooling off' && e.cool === true && e.group === 'search');
    check('3 isCool', t.isCool(e) && !t.isCool(new Error('x')) && !t.isCool(null) && !t.isCool(undefined));
    store.setItem('lib-cooloff', JSON.stringify({ player: { until: now - 1000, reason: 'rate' } }));
    check('3 an ended pause reads as 0', t.coolUntil('player') === 0);
    store.setItem('lib-cooloff', JSON.stringify({ player: { until: now + 26 * 3600e3, reason: 'rate' } }));
    check('3 a pause past the 24 h cap is ignored', t.coolUntil('player') === 0 && !t.coolBlocked('player'));
    store.setItem('lib-cooloff', '{not json');
    check('3 unreadable storage: nothing paused', JSON.stringify(t.readCool()) === '{}' && t.coolUntil('catalog') === 0);
    store.setItem('lib-cooloff', JSON.stringify({ until: now + 60000, reason: 'rate', last429: { at: now, what: 'GET /me/player/devices' } }));
    var rc = t.readCool();
    check('3 old one-for-all record goes to its 429\'s group', Object.keys(rc).join() === 'player' && rc.player.until === now + 60000 && t.coolUntil('player') === now + 60000, rc);
    store.setItem('lib-cooloff', JSON.stringify({ until: now + 60000, reason: 'quota', quotaMs: 1200000 }));
    rc = t.readCool();
    check('3 old record without a request: catalog, strikes from quotaMs', rc.catalog && rc.catalog.strikes === 2 && t.coolUntil('catalog') === now + 60000, rc);
    store.removeItem('lib-cooloff');
  });
});

// 4. A 429 through api(): nothing more in that group is sent, other groups work, the bar and toasts, then recovery.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.route = function (m, p) { if (p === '/me/player/devices') return { status: 429, headers: { 'retry-after': '30' }, json: { error: { status: 429, message: 'API rate limit exceeded' } } }; };
    var before = t.meterCount(60000, 'player');
    var now = tab.now();
    return settle(t.api('/me/player/devices')).then(function (res) {
      check('4 api rejects with a cool error', !res.ok && t.isCool(res.e) && res.e.status === 429 && res.e.group === 'player', res.e && { m: res.e.message, s: res.e.status, g: res.e.group });
      check('4 one request, no automatic retry', reqs(tab, 'GET', '/me/player/devices').length === 1, tab.calls);
      check('4 group paused for Retry-After', near(t.coolUntil('player') - now, 30000, 300) && cool(store).player.retryAfter === '30', cool(store));
      check('4 the 429 is counted by the meter', t.meterCount(60000, 'player') === before + 1);
      var last = t.errorLog()[t.errorLog().length - 1] || '';
      check('4 logged as an error', /GET \/me\/player\/devices → 429 API rate limit exceeded$/.test(last), last);
      check('4 no toast for a background request', tab.toasts().length === 0, tab.toasts());
      check('4 cool bar shown, names playback', !$(tab, 'cool').hidden && /^Spotify paused playback controls until \d{1,2}:\d\d [AP]M\. Your library, search and album and podcast pages still work\.$/.test($(tab, 'coolText').textContent), $(tab, 'coolText').textContent);
      check('4 countdown', /^0:(30|29) left$/.test($(tab, 'coolLeft').textContent), $(tab, 'coolLeft').textContent);
      check('4 Now Playing note shown', !$(tab, 'npCool').hidden && /playback controls/.test($(tab, 'npCool').textContent));
      tab.calls.length = 0; tab.env.route = null;
      return Promise.all([settle(t.api('/me/player/play?device_id=A', { method: 'PUT', body: { uris: ['x'] } })), settle(t.api('/me/player/devices'))]);
    }).then(function (rs) {
      check('4 player requests rejected with nothing sent', rs.every(function (x) { return !x.ok && t.isCool(x.e) && x.e.status === undefined; }) && reqs(tab, null, /^\/me\/player(\/(?!recently)|$)/).length === 0, tab.calls);
      return settle(t.api('/me/playlists?limit=50'));
    }).then(function (r) {
      check('4 library still sent', r.ok && reqs(tab, 'GET', '/me/playlists').length === 1);
      var n = tab.calls.length;
      t.addToQueue(ITEM);
      check('4 tap shows one toast saying until when', tab.toasts().length === 1 && tab.toasts()[0] === t.coolText('player') && /until/.test(tab.toasts()[0]), tab.toasts());
      check('4 tap sent nothing', tab.calls.length === n);
      t.addToQueue(ITEM);
      check('4 second tap right away: no second toast', tab.toasts().length === 1, tab.toasts());
      check('4 coolBlocked false for a working group, no toast', t.coolBlocked('library') === false && tab.toasts().length === 1);
      check('4 coolText names only that group', /playback controls/.test(t.coolText('player')) && !/podcast and album details until/.test(t.coolText('player')));
      check('4 coolText without a paused group falls back', t.coolText('search') === t.coolText() && /playback controls/.test(t.coolText()));
      tab.adv(31000);
      return H.wait(1300);
    }).then(function () {
      check('4 bar hides when the pause ends', $(tab, 'cool').hidden && $(tab, 'npCool').hidden);
      check('4 group works again', t.coolUntil('player') === 0 && t.coolBlocked('player') === false);
      return H.wait(3200);
    }).then(function () {
      check('4 after the pause the player check runs once on its own', reqs(tab, 'GET', '/me/player').length >= 1, tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
    });
  });
});

// 5. Shared across copies (tabs) through localStorage; a later visit honours it; a refresh then a cool-off.
tests.push(function () {
  var store = seed();
  return Promise.all([setup(store), setup(store)]).then(function (tabs) {
    var A = tabs[0], B = tabs[1], ta = A.t(), tb = B.t();
    A.env.route = function (m, p) { if (/^\/albums\//.test(p)) return { status: 429, headers: { 'retry-after': '120' } }; };
    return settle(ta.api('/albums/' + ID22)).then(function () {
      check('5 tab A paused catalog', ta.coolUntil('catalog') > 0);
      check('5 tab B sees the pause from storage', tb.coolUntil('catalog') > 0 && tb.coolBlocked('catalog') === true, cool(store));
      return settle(tb.api('/albums/other1'));
    }).then(function (r) {
      check('5 tab B sends nothing in that group', !r.ok && tb.isCool(r.e) && reqs(B, 'GET', /^\/albums\//).length === 0, B.calls);
      B.w.dispatchEvent(new B.w.StorageEvent('storage', { key: 'lib-cooloff' }));
      check('5 tab B shows the bar on the storage event', !$(B, 'cool').hidden && /podcast and album details/.test($(B, 'coolText').textContent), $(B, 'coolText').textContent);
      return setup(store);
    }).then(function (C) {
      check('5 a new copy shows the bar at start', !$(C, 'cool').hidden && /podcast and album details/.test($(C, 'coolText').textContent));
    }).then(function () {
      // Every group paused before the page starts: start-up sends nothing to Spotify.
      var s2 = seed(), now = Date.now();
      var rec = function (g) { return { until: now + 300000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: '300', last429: { at: now, reason: 'rate limit', retryAfter: '300', what: 'GET /x' } }; };
      s2.setItem('lib-cooloff', JSON.stringify({ player: rec(), library: rec(), search: rec(), catalog: rec() }));
      var tab = H.makeTab(s2, function () {});
      return H.wait(800).then(function () {
        var api = tab.calls.filter(function (c) { return c.host === 'api.spotify.com'; });
        check('5 start-up with every group paused sends nothing', api.length === 0, api);
        check('5 all paused: slow-down text with a time', /^Spotify asked this page to slow down\. Try again after \d{1,2}:\d\d [AP]M\.$/.test(tab.w.document.getElementById('coolText').textContent), tab.w.document.getElementById('coolText').textContent);
      });
    }).then(function () {
      // Token renewal in flight while another copy hits the limit: the request is not sent.
      var s3 = seed();
      return setup(s3).then(function (tab) {
        var t = tab.t(), tk = token(s3); tk.expires = 0; s3.setItem('lib-token', JSON.stringify(tk));
        var p = settle(t.api('/me/player/devices'));
        var n = tab.now();
        s3.setItem('lib-cooloff', JSON.stringify({ player: { until: n + 60000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: { at: n, reason: 'rate limit', retryAfter: null, what: 'GET /me/player' } } }));
        return p.then(function (r) {
          check('5 cool-off that starts during token renewal: nothing sent', !r.ok && t.isCool(r.e) && reqs(tab, 'GET', '/me/player/devices').length === 0 && reqs(tab, 'POST', '/api/token').length === 1, tab.calls);
        });
      });
    });
  });
});

// 6. errMsg / httpError / onFail.
tests.push(function () {
  return setup(seed()).then(function (tab) {
    var t = tab.t();
    check('6 errMsg: Web API error object', t.errMsg({ status: 403, json: { error: { status: 403, message: 'Player command failed: Restriction violated' } } }) === 'Player command failed: Restriction violated');
    check('6 errMsg: OAuth error with description', t.errMsg({ status: 400, json: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }) === 'Refresh token revoked');
    check('6 errMsg: OAuth error alone', t.errMsg({ status: 400, json: { error: 'invalid_client' } }) === 'invalid_client');
    check('6 errMsg: no body', t.errMsg({ status: 502, json: null }) === 'HTTP 502' && t.errMsg({ status: 500, json: { error: {} } }) === 'HTTP 500');
    check('6 errMsg: nothing at all', t.errMsg(undefined) === 'HTTP ?');
    var he = t.httpError({ status: 404, json: { error: { status: 404, message: 'Device not found' } } });
    check('6 httpError carries message and status', he instanceof tab.w.Error && he.message === 'Device not found' && he.status === 404);
    var f = t.onFail('Couldn’t save');
    f(new Error('Server error'));
    check('6 onFail toast', tab.toasts()[0] === 'Couldn’t save (Server error).', tab.toasts());
    f(null);
    check('6 onFail without a message', tab.toasts()[1] === 'Couldn’t save (unknown error).', tab.toasts());
    tab.w.__toasts = [];
    var n = tab.now();
    tab.dom.window.localStorage.setItem('lib-cooloff', JSON.stringify({ library: { until: n + 60000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: null } }));
    f(t.coolErr('library'));
    check('6 onFail with a cool error says when to try again', tab.toasts().length === 1 && /^Spotify paused your library until/.test(tab.toasts()[0]), tab.toasts());
    tab.dom.window.localStorage.removeItem('lib-cooloff');
    f(new Error('signed-out'));
    check('6 onFail signed-out shows sign-in', /Sign in with Spotify/.test($(tab, 'main').textContent) && tab.toasts().length === 1);
  });
});

// 7. HTTP errors and network failure through a real tap (Add to queue): toasts, error log, token handling.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    var status = 0, body = null;
    tab.env.route = function (m, p) { if (p === '/me/player/queue') return { status: status, json: body }; };
    function tap(s, b) { status = s; body = b; tab.w.__toasts = []; tab.calls.length = 0; t.addToQueue(ITEM); return H.wait(80); }
    return tap(401, { error: { status: 401, message: 'The access token expired' } }).then(function () {
      check('7 401: toast with Spotify\'s message', tab.toasts()[0] === 'Couldn’t add to queue (The access token expired).', tab.toasts());
      check('7 401: token marked expired, refresh kept', token(store).expires === 0 && token(store).refresh === REFRESH && token(store).access === ACCESS, token(store));
      check('7 401: queue request sent with POST and the uri', reqs(tab, 'POST', '/me/player/queue').length === 1 && /uri=spotify%3Atrack%3At1/.test(reqs(tab, 'POST', '/me/player/queue')[0].query));
      tab.env.auth.length = 0;
      return tap(204, null);
    }).then(function () {
      var tokCalls = reqs(tab, 'POST', '/api/token');
      check('7 next request renews the token first', tokCalls.length === 1 && /grant_type=refresh_token/.test(String(tokCalls[0].body)) && String(tokCalls[0].body).indexOf(REFRESH) !== -1, tokCalls);
      var q = tab.env.auth.filter(function (a) { return /queue/.test(a.url); })[0];
      check('7 and uses the new token', q && q.auth === 'Bearer ' + NEW_ACCESS && token(store).access === NEW_ACCESS, q);
      check('7 success toast', tab.toasts()[0] === 'Added to queue', tab.toasts());
      return tap(403, { error: { status: 403, message: 'Insufficient client scope' } });
    }).then(function () {
      check('7 403 scope: toast', tab.toasts()[0] === 'Couldn’t add to queue (Insufficient client scope).', tab.toasts());
      check('7 403 scope: permissions banner', t.state.scopeProblem === true && !$(tab, 'banner').hidden);
      check('7 403 scope: no cool-off', t.coolUntil('player') === 0);
      return tap(404, { error: { status: 404, message: 'Player command failed: No active device found' } });
    }).then(function () {
      check('7 404: open Spotify on a device', tab.toasts()[0] === t.NO_DEVICE, tab.toasts());
      return tap(500, { error: { status: 500, message: 'Server error' } });
    }).then(function () {
      check('7 500: toast in plain words', tab.toasts()[0] === 'Couldn’t add to queue. Spotify isn’t answering right now.', tab.toasts());   // #41
      check('7 500: logged with method, path and status', /POST \/me\/player\/queue → 500 Server error$/.test(t.errorLog()[t.errorLog().length - 1]), t.errorLog());
      check('7 500: no cool-off, no retry', t.coolUntil('player') === 0 && reqs(tab, 'POST', '/me/player/queue').length === 1);
      return tap(502, null);
    }).then(function () {
      // #41: the same plain words, and that toast is still up, so it isn't shown a second time
      check('7 502 with no body: same words, the toast still up is not repeated', tab.toasts().length === 0 && !$(tab, 'toast').hidden &&
        $(tab, 'toast').firstChild.textContent === 'Couldn’t add to queue. Spotify isn’t answering right now.', { toasts: tab.toasts(), shown: $(tab, 'toast').textContent });
      tab.env.fail = function (u) { return /queue/.test(u); };
      return tap(204, null);
    }).then(function () {
      check('7 network failure: toast says no internet', tab.toasts()[0] === 'Couldn’t add to queue. No internet connection.', tab.toasts());   // #41
      check('7 network failure: logged as network', /POST \/me\/player\/queue → network Load failed$/.test(t.errorLog()[t.errorLog().length - 1]), t.errorLog().slice(-1));
      check('7 network failure: no cool-off', t.coolUntil('player') === 0 && cool(store) === null);
      tab.env.fail = null;
      var n = t.errorLog().length;
      store.removeItem('lib-token');
      return tap(204, null).then(function () {
        check('7 signed out: sign-in screen, nothing sent, nothing logged', /Sign in with Spotify/.test($(tab, 'main').textContent) && reqs(tab, null, '/me/player/queue').length === 0 && t.errorLog().length === n && tab.toasts().length === 0, { calls: tab.calls, toasts: tab.toasts() });
      });
    });
  });
});

// 8. Error log: kept to 12, saved to localStorage, survives a reload, page errors and rejections included.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    for (var i = 1; i <= 14; i++) t.logError('GET /x' + i, 500, 'boom ' + i);
    var saved = JSON.parse(store.getItem('lib-errors'));
    check('8 at most 12 kept, oldest dropped', t.errorLog().length === 12 && /GET \/x3 → 500 boom 3$/.test(t.errorLog()[0]) && /GET \/x14 → 500 boom 14$/.test(t.errorLog()[11]), t.errorLog());
    check('8 saved to localStorage', Array.isArray(saved) && saved.length === 12 && saved[11] === t.errorLog()[11]);
    tab.w.dispatchEvent(new tab.w.ErrorEvent('error', { message: 'x is not defined', lineno: 1234 }));
    check('8 page error logged with its line', /Page → error x is not defined \(line 1234\)$/.test(t.errorLog()[11]), t.errorLog()[11]);
    var ev = new tab.w.Event('unhandledrejection'); ev.reason = new Error('lost promise');
    tab.w.dispatchEvent(ev);
    check('8 unhandled rejection logged', /Page → promise lost promise$/.test(t.errorLog()[11]), t.errorLog()[11]);
    return setup(store).then(function (tab2) {
      check('8 a reload keeps the log', tab2.t().errorLog().length === 12 && tab2.t().errorLog()[11] === t.errorLog()[11]);
    });
  });
});

// 9. Request meter: per copy in memory, per minute for all copies in storage, top paths with ids folded.
tests.push(function () {
  var store = seed();
  return Promise.all([setup(store), setup(store)]).then(function (tabs) {
    var A = tabs[0], B = tabs[1], ta = A.t(), tb = B.t();
    store.removeItem('lib-reqmeter');
    var a0 = ta.meterCount(3600000);
    ['4', '5', '6', '7', '8'].forEach(function (c) { ta.meterNote('GET /albums/' + ID22.replace('4', c) + '/tracks', 'catalog'); });
    ta.meterNote('GET /me/testpath', 'library');
    tb.meterNote('GET /search', 'search');
    check('9 meterCount: this copy only', ta.meterCount(3600000) === a0 + 6);
    check('9 meterCount by group', ta.meterCount(30000, 'catalog') >= 5 && ta.meterCount(30000, 'search') === 0 && tb.meterCount(30000, 'search') >= 1);
    check('9 meterShared counts every copy', ta.meterShared(10) === 7 && tb.meterShared(10) === 7, ta.meterShared(10));
    var top = ta.meterTop(600000);
    var counts = top.split(', ').map(function (x) { return +x.split(' ').pop(); });
    check('9 meterTop folds ids and sorts by count', top.indexOf('GET /albums/{id}/tracks 5') === 0 && top.indexOf(ID22) === -1 && counts.every(function (c, i) { return i === 0 || c <= counts[i - 1]; }), top);
    for (var i = 0; i < 8; i++) ta.meterNote('GET /p' + i, 'library');
    check('9 meterTop lists at most 6', ta.meterTop(600000).split(', ').length === 6, ta.meterTop(600000));
    var m = Math.floor(A.now() / 60000), b = JSON.parse(store.getItem('lib-reqmeter'));
    b[m - 90] = 50; b[m + 5] = 7; store.setItem('lib-reqmeter', JSON.stringify(b));
    check('9 meterShared ignores old and future minutes', ta.meterShared(60) === 15, ta.meterShared(60));
    ta.meterNote('GET /me', 'library');
    var b2 = JSON.parse(store.getItem('lib-reqmeter'));
    check('9 old and future minutes pruned from storage', !b2[m - 90] && !b2[m + 5] && b2[m] >= 16, b2);
    var c30 = ta.meterCount(30000);
    A.adv(31000);
    check('9 30 s window moves on', ta.meterCount(30000) === 0 && c30 >= 15 && ta.meterCount(600000) >= 15, { c30: c30, now: ta.meterCount(30000) });
    A.adv(11 * 60000);
    check('9 10 min shared window moves on', ta.meterShared(10) === 0 && ta.meterShared(60) >= 16);
    var n = ta.meterCount(3600000);
    A.env.route = null; A.calls.length = 0;
    return settle(ta.api('/me/playlists?limit=50')).then(function () {
      check('9 every api request is counted', ta.meterCount(3600000) === n + 1 && ta.meterCount(30000, 'library') >= 1);
    });
  });
});

// 10. Diagnostics: probes, meter lines, last 429, per-group pauses, errors; skipped probes while paused; closing.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.route = function (m, p) {
      if (p === '/search') return { status: 429 };
      if (p === '/me') return { status: 200, json: { id: 'rich1', display_name: 'R' } };
      if (p === '/me/playlists') return { status: 200, json: { items: [], total: 7, next: null } };
    };
    return settle(t.api('/search?q=x&type=track')).then(function () {
      t.logError('GET /shows/s1', 500, 'Server error');
      tab.calls.length = 0;
      click(tab, $(tab, 'diagBtn'));
      check('10 Diagnostics opens, focus on Close', !$(tab, 'diag').hidden && d(tab).activeElement === $(tab, 'diagClose'));
      return H.wait(400);
    }).then(function () {
      var probes = tab.calls.filter(function (c) { return c.host === 'api.spotify.com'; }).map(function (c) { return c.method + ' ' + c.path + c.query; });
      var want = ['GET /me', 'GET /me/player/devices', 'GET /me/player', 'GET /me/playlists?limit=1'];
      check('10 four probes in order', JSON.stringify(probes.filter(function (p) { return want.indexOf(p) !== -1; })) === JSON.stringify(want), probes);
      check('10 Account probe', /^Account \(\/me\) → 200  user rich1$/m.test(diagText(tab)), diagLine(tab, /^Account/));
      check('10 Devices probe', /^Devices → 200  1 device\(s\): iPhone \[Smartphone, active\]$/m.test(diagText(tab)), diagLine(tab, /^Devices/));
      check('10 Now playing probe', /^Now playing \(\/me\/player\) → 204/m.test(diagText(tab)), diagLine(tab, /^Now playing/));
      check('10 Playlists probe', /^Playlists → 200  7 total$/m.test(diagText(tab)), diagLine(tab, /^Playlists/));
      check('10 requests line', /^Requests, this copy: \d+ in 30 s · \d+ in 10 min · \d+ in 1 h$/m.test(diagText(tab)) && /^Requests, all copies in this browser: \d+ in 10 min · \d+ in 1 h$/m.test(diagText(tab)));
      check('10 most asked', /^Most asked \(10 min\): GET \/\S+ \d+(, GET \/\S+ \d+){0,5}$/m.test(diagText(tab)), diagLine(tab, /^Most asked/));
      check('10 by group', /^Requests by group, this copy \(10 min \/ 1 h\): player \d+ \/ \d+ · library \d+ \/ \d+ · search 1 \/ 1 · catalog \d+ \/ \d+$/m.test(diagText(tab)), diagLine(tab, /^Requests by group/));
      check('10 last 429 without Retry-After', /^Last 429: \d{1,2}:\d\d:\d\d [AP]M \(.*\) · rate limit · Retry-After not exposed · GET \/search$/m.test(diagText(tab)), diagLine(tab, /^Last 429/));
      check('10 search paused line', /^ {2}search: paused until \d{1,2}:\d\d:\d\d [AP]M \(rate limit\), 0:(30|29|28) left$/m.test(diagText(tab)), diagLine(tab, /^ {2}search:/));
      check('10 other groups working', /^ {2}player: working$/m.test(diagText(tab)) && /^ {2}catalog: working$/m.test(diagText(tab)));
      check('10 recent errors listed', /Recent errors:\n(.*\n)*\s+.*GET \/search → 429 HTTP 429\n(.*\n)*\s+.*GET \/shows\/s1 → 500 Server error/.test(diagText(tab)), diagText(tab).split('Recent errors:')[1]);
      // Run again with library paused (quota), a 429 on devices, and a network failure on /me/player.
      var n = tab.now();
      var Q = { error: { status: 429, message: 'Quota', reason: 'QUOTA_EXCEEDED' } };
      t.noteRateLimit({ headers: { get: function () { return '45'; } } }, Q, 'GET /me/tracks', 'library');
      tab.env.route = function (m, p) { if (p === '/me/player/devices') return { status: 429, headers: { 'retry-after': '20' } }; };
      tab.env.fail = function (u) { return /\/v1\/me\/player\?|\/v1\/me\/player$/.test(u); };
      tab.calls.length = 0;
      click(tab, $(tab, 'diagRun'));
      return H.wait(400);
    }).then(function () {
      check('10 paused group: probes skipped, nothing sent', /^Account \(\/me\) → skipped \(library paused\)$/m.test(diagText(tab)) && /^Playlists → skipped \(library paused\)$/m.test(diagText(tab)) && reqs(tab, 'GET', '/me').length === 0 && reqs(tab, 'GET', '/me/playlists').length === 0, tab.calls);
      check('10 probe answered 429', /^Devices → 429, player paused$/m.test(diagText(tab)), diagLine(tab, /^Devices/));
      check('10 probe after a 429 in its group is skipped', /^Now playing \(\/me\/player\) → skipped \(player paused\)$/m.test(diagText(tab)), diagLine(tab, /^Now playing/));
      check('10 quota line with strikes', /^ {2}library: paused until .* \(quota\), (9|10):\d\d left · quota strikes 1, next quota pause 20 min$/m.test(diagText(tab)), diagLine(tab, /^ {2}library:/));
      check('10 last 429 (written before the probes) shows reason and Retry-After seconds', /^Last 429: .* · QUOTA_EXCEEDED · Retry-After 45 s · GET \/me\/tracks$/m.test(diagText(tab)), diagLine(tab, /^Last 429/));
      d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('10 Escape closes', $(tab, 'diag').hidden);
      // A network failure in a probe.
      tab.adv(11 * 60000);
      tab.env.route = null;
      t.openDiag();
      return H.wait(400);
    }).then(function () {
      check('10 network failure in a probe', /^Now playing \(\/me\/player\) → failed: Load failed$/m.test(diagText(tab)), diagLine(tab, /^Now playing/));
      click(tab, $(tab, 'diagBack'));
      check('10 backdrop closes', $(tab, 'diag').hidden);
      t.openDiag(); click(tab, $(tab, 'diagClose'));
      check('10 Close closes', $(tab, 'diag').hidden);
    });
  });
});

// 11. Copy: the clipboard gets exactly the report, and never the access or refresh token.
tests.push(function () {
  var store = seed();
  var copied = [];
  var clip = { writeText: function (s) { copied.push(s); return Promise.resolve(); } };
  return setup(store, { clipboard: clip }).then(function (tab) {
    var t = tab.t();
    // Put a renewed token in play too, and errors with a 401.
    var tk = token(store); tk.expires = 0; store.setItem('lib-token', JSON.stringify(tk));
    tab.env.route = function (m, p) { if (p === '/me/player/queue') return { status: 401, json: { error: { status: 401, message: 'Invalid access token' } } }; };
    t.addToQueue(ITEM);
    return H.wait(150).then(function () {
      tab.env.route = null;
      t.openDiag();
      return H.wait(400);
    }).then(function () {
      click(tab, $(tab, 'diagCopy'));
      return H.wait(50);
    }).then(function () {
      var txt = copied[0] || '';
      check('11 Copy writes the report to the clipboard', copied.length === 1 && txt === diagText(tab) && /^Page v/.test(txt) && /Recent errors:/.test(txt), txt.slice(0, 80));
      check('11 says signed in, without the token', /^Signed in: yes(, token (valid \d+ min|expired \(will renew\)))?$/m.test(txt), txt.split('\n')[2]);
      check('11 no access or refresh token in the copy', [ACCESS, REFRESH, NEW_ACCESS].every(function (s) { return txt.indexOf(s) === -1; }) && !/Bearer/.test(txt), txt.length);
      check('11 the 401 is in the copy', /POST \/me\/player\/queue → 401 Invalid access token/.test(txt));
      check('11 button says Copied', $(tab, 'diagCopy').textContent === 'Copied');
      return H.wait(2100);
    }).then(function () {
      check('11 button back to Copy', $(tab, 'diagCopy').textContent === 'Copy');
    });
  }).then(function () {
    // Clipboard refused: the report is selected instead.
    var clip2 = { writeText: function () { return Promise.reject(new Error('NotAllowedError')); } };
    return setup(seed(), { clipboard: clip2 }).then(function (tab) {
      tab.t().openDiag();
      return H.wait(400).then(function () {
        tab.t().copyDiag();
        return H.wait(50);
      }).then(function () {
        var sel = String(tab.w.getSelection());
        check('11 refused: report selected for a manual copy', $(tab, 'diagCopy').textContent === 'Selected, tap Copy' && sel.length > 50 && sel === diagText(tab), { b: $(tab, 'diagCopy').textContent, n: sel.length });
      });
    });
  }).then(function () {
    // No clipboard API at all.
    return setup(seed(), { clipboard: null }).then(function (tab) {
      tab.t().openDiag();
      return H.wait(400).then(function () {
        tab.t().copyDiag();
        check('11 no clipboard API: selected instead', $(tab, 'diagCopy').textContent === 'Selected, tap Copy' && String(tab.w.getSelection()).indexOf('Page v') === 0);
        tab.t().closeDiag();
        check('11 closeDiag hides the sheet', $(tab, 'diag').hidden);
      });
    });
  });
});

// 12. afterCool: a library pause ending reloads the library if nothing is cached; catalog and search start nothing.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.state.data = null;
    tab.calls.length = 0;
    t.afterCool(['catalog', 'search']);
    return H.wait(3300).then(function () {
      check('12 catalog/search ending sends nothing on its own', reqs(tab, 'GET', /^\/(albums|shows|episodes|search|artists)/).length === 0, tab.calls);
      tab.calls.length = 0;
      t.afterCool(['library']);
      check('12 library: nothing sent at once (no burst)', reqs(tab, 'GET', /^\/me\/(playlists|albums|tracks|shows|episodes|following)/).length === 0, tab.calls);
      return H.wait(3400);
    }).then(function () {
      check('12 library: reloads a few seconds later', reqs(tab, 'GET', /^\/me\/(playlists|albums|tracks|shows|episodes|following)/).length >= 1, tab.calls.map(function (c) { return c.path; }));
    });
  });
});

var t0 = Date.now();
var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(fails ? 1 : 0);
});
