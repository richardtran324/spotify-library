'use strict';
var H = require('./harness');
if (process.argv[2]) process.env.SRC = process.argv[2];
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }
var WAKE = 'Press play first to wake Spotify.';

// Builds a tab that shows `p` playing; script: list of {m, path, test(query)?, status, json} matched in order (each once).
function setup(store, p, script) {
  var env = { player: p, script: script || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body;
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === path && (!s.q || s.q(q))) { s.used = true; return { status: s.status, json: s.json }; }
    }
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
  });
  tab.env = env;
  return H.wait(400).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (p) { t.setPlayer(JSON.parse(JSON.stringify(p))); t.state.playerAt = Date.now() - 5000; }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function putPauses(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/pause'; }); }
function gets(tab, path) { return tab.calls.filter(function (c) { return c.method === 'GET' && c.path === path; }); }
function lp(store) { return JSON.parse(store.getItem('lib-lastplay') || 'null'); }
function approx(v, target, tol) { return typeof v === 'number' && Math.abs(v - target) <= tol; }

var tests = [];
// 1. Asleep: both pauses 404, no toast, asleep, no forced check, frozen at ~65000, cache null.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [
    { m: 'PUT', path: '/me/player/pause', q: function (q) { return q.get('device_id') === 'A'; }, status: 404, json: { error: { status: 404, message: 'Device not found' } } },
    { m: 'PUT', path: '/me/player/pause', q: function (q) { return !q.get('device_id'); }, status: 404, json: { error: { status: 404, message: 'Player command failed: No active device found' } } }
  ]).then(function (tab) {
    tab.env.player = null;
    var t = tab.t();
    t.togglePlay();
    return H.wait(2000).then(function () {
      var pp = putPauses(tab), o = lp(store), cache = JSON.parse(store.getItem('lib-player-cache') || 'null');
      var d = tab.w.document;
      check('1 two PUTs, second without device_id', pp.length === 2 && /device_id=A/.test(pp[0].query) && pp[1].query === '', pp);
      check('1 no GET within 2 s', gets(tab, '/me/player').length === 0 && gets(tab, '/me/player/devices').length === 0, tab.calls);
      check('1 no toast', tab.toasts().length === 0, tab.toasts());
      check('1 asleep', t.state.playerIdle === true, t.state.playerIdle);
      check('1 button says Play', d.getElementById('pPlay').getAttribute('aria-label') === 'Play');
      check('1 idle line', d.getElementById('pSub').textContent === 'Spotify is asleep. Press play to wake it.' && d.getElementById('npIdle').textContent === 'Spotify is asleep. Press play to wake it.', d.getElementById('pSub').textContent);
      check('1 frozen at ~65000 with frozenAt', o && approx(o.positionMs, 65000, 600) && typeof o.frozenAt === 'number', o && { pos: o.positionMs, f: o.frozenAt });
      check('1 player cache null from this copy', cache && cache.json === null && cache.by === t.MY_ID, cache);
      check('1 normal check scheduled (~20 s, not forced)', t.state.pollTimer && t.state.pollForce !== true, { force: t.state.pollForce });
      
    });
  });
});
// 2. New device id: retry 204, forced GET finds device B paused.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [
    { m: 'PUT', path: '/me/player/pause', q: function (q) { return q.get('device_id') === 'A'; }, status: 404, json: { error: { status: 404, message: 'Device not found' } } },
    { m: 'PUT', path: '/me/player/pause', q: function (q) { return !q.get('device_id'); }, status: 204 }
  ]).then(function (tab) {
    tab.env.player = H.song(null, { playing: false, dev: 'B', pos: 65000 });
    var t = tab.t();
    t.togglePlay();
    return H.wait(1500).then(function () {
      check('2 two PUTs and one forced GET', putPauses(tab).length === 2 && gets(tab, '/me/player').length === 1, tab.calls);
      check('2 shows paused on B, not asleep', !t.state.playerIdle && t.state.player.device && t.state.player.device.id === 'B' && t.state.player.is_playing === false, t.state.player && t.state.player.device);
      check('2 no toast', tab.toasts().length === 0, tab.toasts());
      
    });
  });
});
// 3. Normal pause: 1 PUT, 1 forced GET.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [{ m: 'PUT', path: '/me/player/pause', status: 204 }]).then(function (tab) {
    tab.env.player = H.song(null, { playing: false, pos: 65000 });
    var t = tab.t();
    t.togglePlay();
    return H.wait(1500).then(function () {
      var g = gets(tab, '/me/player');
      check('3 one PUT with device_id, one GET ~500 ms later', putPauses(tab).length === 1 && /device_id=A/.test(putPauses(tab)[0].query) && g.length === 1 && g[0].t - putPauses(tab)[0].t >= 450, tab.calls);
      check('3 paused, not asleep, no toast', !t.state.playerIdle && t.state.player.is_playing === false && tab.toasts().length === 0, tab.toasts());
      
    });
  });
});
// 4. 403 Restriction violated: no toast, paused stays, 1 forced GET.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [{ m: 'PUT', path: '/me/player/pause', status: 403, json: { error: { status: 403, message: 'Player command failed: Restriction violated' } } }]).then(function (tab) {
    tab.env.player = H.song(null, { playing: false, pos: 65000 });
    var t = tab.t();
    t.togglePlay();
    return H.wait(1500).then(function () {
      check('4 no toast, paused, one forced GET', tab.toasts().length === 0 && t.state.player.is_playing === false && gets(tab, '/me/player').length === 1 && putPauses(tab).length === 1, { toasts: tab.toasts(), calls: tab.calls });
      
    });
  });
});
// 5. Other 403 / 500: error toast as before.
[{ status: 403, json: { error: { status: 403, message: 'Premium required' } } }, { status: 500, json: { error: { status: 500, message: 'Server error' } } }].forEach(function (resp) {
  tests.push(function () {
    var store = H.seedStore();
    return setup(store, H.song(), [{ m: 'PUT', path: '/me/player/pause', status: resp.status, json: resp.json }]).then(function (tab) {
      var t = tab.t();
      t.togglePlay();
      return H.wait(1000).then(function () {
        var ts = tab.toasts();
        // #41: plain words: a 403 that mentions Premium, a 5xx
        var want = resp.status === 403 ? 'Couldn’t control playback. Spotify Premium is needed to control playback.' : 'Couldn’t control playback. Spotify isn’t answering right now.';
        check('5 ' + resp.status + ' shows Couldn’t control playback', ts.length === 1 && ts[0] === want, ts);
        
      });
    });
  });
});
// 6. Player cool-off: nothing sent, cool-off toast.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), []).then(function (tab) {
    store.setItem('lib-cooloff', JSON.stringify({ player: { until: Date.now() + 60000, reason: 'rate', strikes: 1 } }));
    var t = tab.t();
    t.togglePlay();
    return H.wait(800).then(function () {
      check('6 cool-off: no PUT, a toast', putPauses(tab).length === 0 && tab.toasts().length === 1, { calls: tab.calls, toasts: tab.toasts() });
      
    });
  });
});
// 7. Next Play resumes at the frozen spot (wake mode wait), then plays at that spot once device A shows up.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } },
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } }
  ]).then(function (tab) {
    tab.env.player = null;
    var t = tab.t();
    t.togglePlay();
    return H.wait(800).then(function () {
      var frozen = lp(store).positionMs;
      tab.calls.length = 0;
      t.togglePlay();
      return H.wait(1200); }).then(function () {
      var frozen = lp(store).positionMs;
      var pd = t.readPending();
      check('7 pending resume at the frozen spot', pd && pd.item && pd.item.kind === 'resume' && pd.item.positionMs === frozen, pd);
      check('7 line says it picks up there', /It picks up at 1:0[45]\./.test(tab.w.document.getElementById('pSub').textContent), tab.w.document.getElementById('pSub').textContent);
      // Spotify wakes: device A appears (Control Center play starts whatever Spotify last had).
      tab.env.player = H.song('spotify:track:other', { playing: true, pos: 1000 });
      tab.env.script.push({ m: 'GET', path: '/me/player/devices', status: 200, json: { devices: [{ id: 'A', name: 'iPhone', type: 'Smartphone', is_active: false, volume_percent: 50 }] } });
      tab.env.script.push({ m: 'GET', path: '/me/player/devices', status: 200, json: { devices: [{ id: 'A', name: 'iPhone', type: 'Smartphone', is_active: false, volume_percent: 50 }] } });
      return H.wait(7000).then(function () {
        var play = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; })[0];
        var body = play && JSON.parse(play.body || '{}');
        check('7 PUT play with position_ms at the frozen spot', body && approx(body.position_ms, frozen, 50), { play: play, frozen: frozen, calls: tab.calls.map(function (c) { return c.method + ' ' + c.path + c.query; }) });
        
      });
    });
  });
});
// 8. Episode history gets the paused spot right away.
tests.push(function () {
  var store = H.seedStore();
  var ep = H.song('spotify:episode:e1', { type: 'episode' });
  ep.item.id = 'e1'; ep.item.album = undefined; ep.item.artists = undefined; ep.context = null;
  return setup(store, ep, [
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } },
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } }
  ]).then(function (tab) {
    tab.env.player = null;
    var t = tab.t();
    t.togglePlay();
    return H.wait(800).then(function () {
      var e = t.epHistory().filter(function (x) { return x.uri === 'spotify:episode:e1'; })[0];
      var saved = JSON.parse(store.getItem('lib-ep-history') || '[]').filter(function (x) { return x.uri === 'spotify:episode:e1'; })[0];
      check('8 history (memory) at ~65000', e && approx(e.positionMs, 65000, 600), e);
      check('8 history (storage) at ~65000', saved && approx(saved.positionMs, 65000, 600), saved);
      
    });
  });
});
// 9. Another tab that still counts the song as playing doesn't move the frozen spot.
tests.push(function () {
  var store = H.seedStore();
  var tabB;
  return setup(store, H.song(), []).then(function (b) {
    tabB = b;
    tabB.t().state.playerAt = Date.now() - 5000;   // B last heard "playing at 60000" 5 s ago
    return setup(store, H.song(), [
      { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } },
      { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } }
    ]);
  }).then(function (tabA) {
    tabA.env.player = null;
    tabB.t().state.playerAt = Date.now() - 5000;
    tabA.t().togglePlay();
    return H.wait(800).then(function () {
      var frozen = lp(store).positionMs;
      // 30 s later B's own check (or the cache) says nothing is playing.
      tabB.t().state.playerAt -= 30000;
      tabB.t().setPlayer(null);
      var o = lp(store);
      check('9 frozen spot unchanged by tab B', o.positionMs === frozen && approx(frozen, 65000, 900), { frozen: frozen, now: o.positionMs });
      check('9 tab B shows asleep at that spot', tabB.t().state.playerIdle && tabB.t().state.player.progress_ms === frozen, tabB.t().state.player && tabB.t().state.player.progress_ms);
      // 10. A seek while asleep still wins, and a later "nothing playing" elsewhere keeps it.
      tabA.t().seekTo(120000);
      check('10 seek moves spot to 120000', lp(store).positionMs === 120000, lp(store).positionMs);
      tabB.t().setPlayer(null);
      check('10 another nothing-playing keeps 120000', lp(store).positionMs === 120000, lp(store).positionMs);
      // 11. A real playing answer replaces the record without frozenAt.
      tabA.t().setPlayer(H.song(null, { pos: 10000 }));
      var o2 = lp(store);
      check('11 playing answer wins, frozenAt gone', o2.positionMs === 10000 && o2.frozenAt === undefined && !tabA.t().state.playerIdle, o2);
      // Same song played again later, then stops: the old frozenAt must not pin it to the old spot.
      tabA.t().state.playerAt = Date.now() - 20000;
      tabA.t().setPlayer(null);
      check('11b later stop freezes the new spot (~30000)', approx(lp(store).positionMs, 30000, 600), lp(store).positionMs);
      
    });
  });
});
// 12. While asleep, Next/Shuffle/Repeat still say WAKE_FIRST and send nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } },
    { m: 'PUT', path: '/me/player/pause', status: 404, json: { error: { status: 404, message: 'x' } } }
  ]).then(function (tab) {
    tab.env.player = null;
    var t = tab.t();
    t.togglePlay();
    return H.wait(800).then(function () {
      tab.calls.length = 0; tab.w.__toasts = [];
      tab.w.document.getElementById('pNext') && tab.w.document.getElementById('pNext').click();
      t.toggleShuffle(); t.cycleRepeat();
      var ts = tab.toasts();
      check('12 controls while asleep: WAKE_FIRST, nothing sent', ts.length >= 2 && ts.every(function (m) { return m === WAKE; }) && tab.calls.filter(function (c) { return c.method !== 'GET'; }).length === 0, { ts: ts, calls: tab.calls });
      
    });
  });
});
// 13. Next while the page thinks it's playing and Spotify 404s: still goes asleep with WAKE_FIRST (command() path unchanged).
tests.push(function () {
  var store = H.seedStore();
  return setup(store, H.song(), [{ m: 'POST', path: '/me/player/next', status: 404, json: { error: { status: 404, message: 'x' } } }]).then(function (tab) {
    tab.env.player = null;
    var t = tab.t();
    var nb = tab.w.document.getElementById('pNext');
    if (nb) nb.click();
    return H.wait(1200).then(function () {
      check('13 Next 404 → asleep + WAKE_FIRST', !!nb && t.state.playerIdle && tab.toasts()[0] === WAKE, { nb: !!nb, ts: tab.toasts(), calls: tab.calls });
      
    });
  });
});

tests.reduce(function (p, f) { return p.then(f).catch(function (e) { results.push('ERROR ' + (e && e.stack || e)); }); }, Promise.resolve()).then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('PASS') !== 0; }).length;
  console.log('\n' + (results.length - fails) + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});
