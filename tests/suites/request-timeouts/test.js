'use strict';
// Request time limits (v2.61) tests: a request with no answer in time fails like "Load failed", leaves the shared
// in-flight maps, and the next check or tap sends a fresh request. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var LIM = { player: 300, other: 900 };   // short limits so the suite runs fast (the page uses 10 s and 20 s)

// env.hang(method, path, host) true: that request never answers (a dead connection). env.slow: ms before answering.
// env.honorAbort: the hung request rejects with an AbortError when its signal aborts (as Safari 12.1+ does);
// otherwise it ignores the signal (the worst case: the page's own timer must still end the wait).
function setup(store, opts) {
  opts = opts || {};
  var env = { hang: opts.hang || function () { return false; }, slow: 0, honorAbort: false, armed: false };   // armed: hangs start after the page started
  var tab;
  tab = H.makeTab(store, function (m, p, q, body, call) {
    if (call.host === 'accounts.spotify.com') return { status: 200, json: { access_token: 'new', refresh_token: 'r2', expires_in: 3600, scope: H.SCOPE } };
    if (p === '/me/player' && m === 'GET') return { status: 200, json: H.song() };
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (m === 'PUT' && /^\/me\/player\//.test(p)) return { status: 204 };
  }, { beforeParse: function (w) {
    var inner = null;
    Object.defineProperty(w, 'fetch', { configurable: true, set: function (fn) { inner = fn; }, get: function () {
      return function (url, fo) {
        var u = new w.URL(String(url)), method = (fo && fo.method) || 'GET';
        var path = u.pathname.replace('/v1', '');
        var sig = fo && fo.signal;
        if (env.armed && env.hang(method, path, u.host)) {
          var rec = { method: method, path: path, host: u.host, hung: true, signal: sig || null };
          tab.calls.push(rec);
          return new Promise(function (res, rej) {
            if (env.honorAbort && sig) sig.addEventListener('abort', function () { rej(new w.DOMException('The operation was aborted.', 'AbortError')); });
          });
        }
        if (sig) tab.signals.push(sig);
        if (env.slow) return new Promise(function (res) { setTimeout(function () { res(inner(url, fo)); }, env.slow); });
        return inner(url, fo);
      };
    } });
  } });
  tab.env = env;
  tab.signals = [];
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (t.REQ_LIMIT_MS) { t.REQ_LIMIT_MS.player = LIM.player; t.REQ_LIMIT_MS.other = LIM.other; }
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0; tab.signals.length = 0;
    tab.w.__toasts = [];
    env.armed = true;
    return tab;
  });
}
function hung(tab, re, method) { return tab.calls.filter(function (c) { return c.hung && re.test(c.path) && (!method || c.method === method); }); }
function sent(tab, re) { return tab.calls.filter(function (c) { return re.test(c.path); }); }
function errs(store) { try { return JSON.parse(store.getItem('lib-errors') || '[]'); } catch (e) { return []; } }
function settle(p) {   // { done, ok, value|error } without waiting on it
  var s = { done: false };
  p.then(function (v) { s.done = true; s.ok = true; s.value = v; }, function (e) { s.done = true; s.ok = false; s.error = e; });
  return s;
}
var PLAYER = /^\/me\/player$/, DEVICES = /^\/me\/player\/devices$/;

var tests = [];

// 1. The page's own limits: 10 s for playback, devices and token renewal, 20 s for everything else.
tests.push(function () {
  return H.wait(0).then(function () {
    var tab = H.makeTab(H.seedStore(), function () {});
    return H.wait(400).then(function () {
      var L = tab.t().REQ_LIMIT_MS;
      check('1 limits are 10 s (player, token) and 20 s (other)', !!L && L.player === 10000 && L.other === 20000, L);
      tab.w.close();
    });
  });
});

// 2. /me/player hangs: the check fails within the limit (signal aborted, logged as a network error, page offline),
//    leaves `inflight`, and the next pollPlayer() sends a new request. Before the limit, identical GETs still share one.
tests.push(function () {
  var store = H.seedStore(), stall = false;
  return setup(store, { hang: function (m, p) { return stall && m === 'GET' && p === '/me/player'; } }).then(function (tab) {
    var t = tab.t();
    stall = true;
    var a = t.api('/me/player?additional_types=episode'), b = t.api('/me/player?additional_types=episode');
    var sa = settle(a);
    return H.wait(50).then(function () {
      check('2a identical GETs in flight still share one request', a === b && hung(tab, PLAYER).length === 1, hung(tab, PLAYER).length);
      return H.wait(LIM.player + 200);
    }).then(function () {
      var c = hung(tab, PLAYER)[0];
      check('2b the hung check failed within the limit', sa.done && sa.ok === false, sa);
      check('2c it failed as "no answer" (net, timeout), not an AbortError', sa.error && sa.error.net === true && sa.error.timeout === true && sa.error.name !== 'AbortError', sa.error && { name: sa.error.name, msg: sa.error.message });
      check('2d its request was aborted', !!(c && c.signal && c.signal.aborted), c && !!c.signal);
      check('2e it left the in-flight map', Object.keys(t.inflight).length === 0, Object.keys(t.inflight));
      check('2f logged in Diagnostics as a network error', errs(store).some(function (l) { return /GET \/me\/player → network Spotify didn’t answer/.test(l); }), errs(store));
      check('2g the page shows the no-internet line', t.state.offline === true && !tab.w.document.getElementById('net').hidden, t.state.offline);
      check('2h a background check shows no toast', tab.toasts().length === 0, tab.toasts());
      t.pollPlayer();
      return H.wait(50);
    }).then(function () {
      check('2i the next pollPlayer() sends a new request', hung(tab, PLAYER).length === 2, hung(tab, PLAYER).length);
      stall = false;
      return H.wait(LIM.player + 250);
    }).then(function () {
      t.pollPlayer();
      return H.wait(150);
    }).then(function () {
      check('2j once Spotify answers again the line goes and the song shows', t.state.offline === false && t.state.player && t.state.player.item && t.state.player.item.name === 'Song One', { off: t.state.offline });
      tab.w.close();
    });
  });
});

// 3. Four checks asked during one stall (the reviewer's repro): each later check after the limit sends a fresh request.
tests.push(function () {
  var stall = false;
  return setup(H.seedStore(), { hang: function (m, p) { return stall && m === 'GET' && p === '/me/player'; } }).then(function (tab) {
    var t = tab.t();
    stall = true;
    t.pollPlayer();
    return H.wait(LIM.player + 150).then(function () { t.pollPlayer(); return H.wait(LIM.player + 150); })
      .then(function () { t.pollPlayer(); return H.wait(LIM.player + 150); })
      .then(function () { t.pollPlayer(); return H.wait(50); })
      .then(function () {
        check('3 four checks spaced past the limit send four requests', hung(tab, PLAYER).length === 4, hung(tab, PLAYER).length);
        tab.w.close();
      });
  });
});

// 4. The device check hangs: checkDevice() fails within the limit with plain words, devicesReq clears,
//    and the next checkDevice() sends a new request.
tests.push(function () {
  return setup(H.seedStore(), { hang: function (m, p) { return p === '/me/player/devices'; } }).then(function (tab) {
    var t = tab.t();
    t.state.active = null;   // nothing known playing (else a failed check keeps the device the player answer showed)
    var s1 = settle(t.checkDevice());
    t.checkDevice();
    return H.wait(50).then(function () {
      check('4a two checks at once share one request', hung(tab, DEVICES).length === 1, hung(tab, DEVICES).length);
      return H.wait(LIM.player + 200);
    }).then(function () {
      check('4b the device check ended within the limit', s1.done, s1);
      check('4c devicesReq cleared', t.devicesReq() === null, String(t.devicesReq()));
      check('4d the error is a no-answer error', !!(t.state.deviceErrObj && t.state.deviceErrObj.net && t.state.deviceErrObj.timeout), t.state.deviceErrObj && t.state.deviceErrObj.message);
      check('4e status line in plain words', /^Couldn’t check your devices\. No internet connection\.$/.test(tab.w.document.getElementById('statusText').textContent), tab.w.document.getElementById('statusText').textContent);
      t.checkDevice();
      return H.wait(50);
    }).then(function () {
      check('4f the next checkDevice() sends a new request', hung(tab, DEVICES).length === 2, hung(tab, DEVICES).length);
      tab.w.close();
    });
  });
});

// 5. A tap whose device check hangs shows one toast (with Try again) instead of silence.
tests.push(function () {
  return setup(H.seedStore(), { hang: function (m, p) { return p === '/me/player/devices'; } }).then(function (tab) {
    var t = tab.t();
    t.state.deviceAt = 0;   // last device check too old: the tap checks first
    t.state.active = null;
    var item = { kind: 'track', id: 't9', name: 'Tapped', uri: 'spotify:track:t9', url: 'https://open.spotify.com/track/t9' };
    t.onItemClick(item, { preventDefault: function () {} });
    return H.wait(LIM.player + 400).then(function () {
      var toasts = tab.toasts();
      check('5a the tap checked devices', hung(tab, DEVICES).length === 1, hung(tab, DEVICES).length);
      check('5b one toast in plain words', toasts.length === 1 && toasts[0] === 'Couldn’t check your devices. No internet connection.', toasts);
      check('5c the toast has Try again', !!tab.w.document.querySelector('#toast .toastbtn[data-retry]'), tab.w.document.getElementById('toast').textContent);
      check('5d nothing was played', sent(tab, /^\/me\/player\/play$/).length === 0, tab.calls);
      tab.w.close();
    });
  });
});

// 6. Where fetch honours abort() (Safari 12.1+), the page still reports the time limit, not the AbortError.
tests.push(function () {
  var stall = false;
  return setup(H.seedStore(), { hang: function (m, p) { return stall && m === 'GET' && p === '/me/player'; } }).then(function (tab) {
    var t = tab.t();
    tab.env.honorAbort = true;
    stall = true;
    var s = settle(t.api('/me/player'));
    return H.wait(LIM.player + 250).then(function () {
      check('6 aborted request reports the time limit', s.done && s.error && s.error.timeout === true && s.error.net === true, s.error && { name: s.error.name, msg: s.error.message });
      tab.w.close();
    });
  });
});

// 7. Playback and devices use the short limit; other requests (library, catalog, search) the long one.
tests.push(function () {
  return setup(H.seedStore(), { hang: function (m, p) { return p === '/me/player' || p === '/me/albums'; } }).then(function (tab) {
    var t = tab.t();
    var sp = settle(t.api('/me/player')), sl = settle(t.api('/me/albums?limit=50'));
    return H.wait(LIM.player + 250).then(function () {
      check('7a /me/player ended at the short limit', sp.done, sp);
      check('7b /me/albums still waiting (long limit)', !sl.done, sl);
      return H.wait(LIM.other - LIM.player + 100);
    }).then(function () {
      check('7c /me/albums ended at the long limit', sl.done && sl.error && sl.error.timeout === true, sl);
      tab.w.close();
    });
  });
});

// 8. Token renewal hangs: requests waiting on it fail within the limit, and the next request renews again.
tests.push(function () {
  var store = H.seedStore(), stall = true;
  return setup(store, { hang: function (m, p, host) { return stall && host === 'accounts.spotify.com'; } }).then(function (tab) {
    var t = tab.t();
    var tok = JSON.parse(store.getItem('lib-token')); tok.expires = Date.now() - 1000; store.setItem('lib-token', JSON.stringify(tok));
    var s1 = settle(t.api('/me/player')), s2 = settle(t.api('/me/albums'));
    return H.wait(LIM.player + 250).then(function () {
      var reqs = tab.calls.filter(function (c) { return c.host === 'accounts.spotify.com'; });
      check('8a one renewal for both requests', reqs.length === 1, reqs.length);
      check('8b both failed within the token limit', s1.done && s2.done && s1.error && s1.error.timeout && s2.error && s2.error.timeout, { s1: s1.done, s2: s2.done });
      check('8c still signed in', !!store.getItem('lib-token'), null);
      stall = false;
      return Promise.race([t.api('/me/player'), H.wait(LIM.player + 500).then(function () { return null; })]);   // null: still waiting
    }).then(function (r) {
      var reqs = tab.calls.filter(function (c) { return c.host === 'accounts.spotify.com'; });
      check('8d the next request renews again and works', reqs.length === 2 && r && r.ok, { n: reqs.length, ok: r && r.ok });
      tab.w.close();
    });
  });
});

// 9. Network working: slow answers inside the limit are never aborted, show nothing, and log nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.slow = Math.round(LIM.player * 0.6);
    var before = errs(store).length;
    var sp = settle(t.api('/me/player')), sd = settle(t.checkDevice()), sl = settle(t.api('/me/albums'));
    var item = { kind: 'track', id: 't8', name: 'Fine', uri: 'spotify:track:t8', url: 'https://open.spotify.com/track/t8' };
    t.state.device = DEV; t.state.deviceAt = Date.now();
    t.onItemClick(item, { preventDefault: function () {} });
    return H.wait(LIM.other + 300).then(function () {
      check('9a answers came back ok', sp.done && sp.ok && sp.value.ok && sd.done && sd.ok && sl.done && sl.ok, { sp: sp.ok, sd: sd.ok, sl: sl.ok });
      check('9b every request had a signal and none was aborted', tab.signals.length >= 4 && tab.signals.every(function (s) { return !s.aborted; }), { n: tab.signals.length, aborted: tab.signals.filter(function (s) { return s.aborted; }).length });
      check('9c nothing logged, still online', errs(store).length === before && t.state.offline === false, errs(store).slice(before));
      check('9d the tap played with no error toast', sent(tab, /^\/me\/player\/play$/).length === 1 && !tab.toasts().some(function (x) { return /Couldn’t/.test(x); }), tab.toasts());
      tab.w.close();
    });
  });
});

// A request that never settles can leave nothing scheduled, and node would then exit quietly mid-suite.
var finished = false;
process.on('beforeExit', function () {
  if (finished) return;
  console.log(results.concat(['FAIL suite stopped early: a request never settled']).join('\n'));
  process.exit(1);
});
var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  finished = true;
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
});
