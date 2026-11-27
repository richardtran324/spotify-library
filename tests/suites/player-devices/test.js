'use strict';
// Playback controls and devices: next/previous, seek and the sliders, volume, shuffle/repeat, the bar and Now Playing
// painting, the device sheet and device choice, Up next and + (queue), playing a tapped item, the wake flow when no
// device is open, polling cadence and the shared player cache. jsdom, mocked fetch. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV_A = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var DEV_B = { id: 'B', name: 'Computer', type: 'Computer', is_active: false, volume_percent: 70 };
var DEV_C = { id: 'C', name: 'Kitchen', type: 'Speaker', is_active: false, is_restricted: true };
var NO_DEVICE = 'Spotify needs to be open on a device first: your phone, computer or speaker.';
var WAKE_FIRST = 'Press play first to wake Spotify.';
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

// A /me/player answer. opts: id, name, type ('episode'), dur, pos, playing, device (null for none), shuffle, repeat, context, artists
function player(opts) {
  opts = opts || {};
  var ep = opts.type === 'episode';
  var id = opts.id || (ep ? 'e1' : 't1');
  var item = ep
    ? { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: opts.name || 'Episode One', duration_ms: opts.dur || 1800000, images: [], show: { id: 's1', name: 'Money Show', images: [] } }
    : { type: 'track', id: id, uri: 'spotify:track:' + id, name: opts.name || 'Song One', duration_ms: opts.dur || 240000,
      album: { id: 'a1', name: 'Album', images: [], uri: 'spotify:album:a1' }, artists: opts.artists || [{ id: 'ar1', name: 'Artist' }] };
  return {
    item: item, currently_playing_type: ep ? 'episode' : 'track',
    context: opts.context === undefined ? { type: 'album', uri: 'spotify:album:a1' } : opts.context,
    is_playing: opts.playing !== false, progress_ms: opts.pos != null ? opts.pos : 60000,
    device: opts.device === null ? null : clone(opts.device || DEV_A),
    shuffle_state: !!opts.shuffle, repeat_state: opts.repeat || 'off', timestamp: Date.now()
  };
}
function trackObj(id, name) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: name, duration_ms: 200000, album: { id: 'a1', name: 'Album', images: [] }, artists: [{ id: 'ar1', name: 'Artist' }] };
}
function songItem(o) {
  return Object.assign({ kind: 'track', id: 't5', uri: 'spotify:track:t5', name: 'Five', url: 'https://open.spotify.com/track/t5', sub: 'Song' }, o || {});
}

// env.player answers GET /me/player, env.devices the device list, env.queue GET /me/player/queue;
// env.script: [{m, path, q?, status, json}] matched once each, in order, before the defaults.
function setup(store, opts) {
  opts = opts || {};
  var env = { player: opts.player || null, devices: opts.devices || [DEV_A], queue: opts.queue || null, script: opts.script || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === path && (!s.q || s.q(q))) { s.used = true; return { status: s.status, json: s.json }; }
    }
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: clone(env.player) } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: clone(env.devices) } };
    if (path === '/me/player/queue' && method === 'GET') return env.queue ? { status: 200, json: clone(env.queue) } : { status: 204 };
    if ((method === 'PUT' || method === 'POST') && /^\/me\/player/.test(path)) return { status: 204 };
  }, {
    beforeParse: function (w) {
      var realNow = w.Date.now;
      w.__off = 0;   // tests move the page's clock forward with this (timers still run in real time)
      w.__frozen = null;   // or stops it at a fixed time
      w.Date.now = function () { return w.__frozen != null ? w.__frozen : realNow.call(w.Date) + w.__off; };
      w.__nav = [];
      w.libNavigate = function (u) { w.__nav.push(u); };
    }
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = clone(DEV_A); t.state.deviceAt = tab.w.Date.now();
    if (opts.setPlayer) { t.setPlayer(clone(opts.setPlayer)); }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return tab.w.document.getElementById(id); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function key(tab, node, k) { node.dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
function ptr(tab, node, type, x, button) { node.dispatchEvent(new tab.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: button || 0 })); }
function rect(node, left, width) { node.getBoundingClientRect = function () { return { left: left, width: width, top: 0, height: 4, right: left + width, bottom: 4, x: left, y: 0 }; }; }
function shown(tab, id) { return !$(tab, id).hidden; }
function txt(tab, id) { return $(tab, id).textContent; }
function stored(store, k) { var v = store.getItem(k); return v == null ? null : JSON.parse(v); }
function done(tab) { try { tab.t().stopWake(); tab.w.close(); } catch (e) {} }
function ev() { var e = { called: 0 }; e.preventDefault = function () { e.called++; }; return e; }
function cool(store, g) { var c = {}; c[g] = { until: Date.now() + 600000, reason: 'rate', strikes: 1 }; store.setItem('lib-cooloff', JSON.stringify(c)); }

var tests = [];

// 1. Next and Previous: one POST each with the playing device, then one forced check.
tests.push(function () {
  var p = player();
  return setup(H.seedStore(), { player: p, setPlayer: p }).then(function (tab) {
    click(tab, $(tab, 'pNext'));
    click(tab, $(tab, 'npPrev'));
    return H.wait(100).then(function () {
      var n = reqs(tab, 'POST', '/me/player/next'), pr = reqs(tab, 'POST', '/me/player/previous');
      check('1 Next: POST /me/player/next?device_id=A', n.length === 1 && n[0].query === '?device_id=A' && n[0].body === null, tab.calls);
      check('1 Previous: POST /me/player/previous?device_id=A', pr.length === 1 && pr[0].query === '?device_id=A', tab.calls);
      check('1 no check before 500 ms', reqs(tab, 'GET', '/me/player').length === 0, tab.calls);
      return H.wait(650);
    }).then(function () {
      var g = reqs(tab, 'GET', '/me/player');
      check('1 one forced check afterwards (episodes included)', g.length === 1 && g[0].query === '?additional_types=episode', g);
      check('1 no toast', tab.toasts().length === 0, tab.toasts());
      done(tab);
    });
  });
});

// 2. Next errors: a 404 means Spotify fell asleep; other errors toast; asleep sends nothing; a player with no device sends no device_id.
tests.push(function () {
  var p = player();
  return setup(H.seedStore(), { player: p, setPlayer: p, script: [
    { m: 'POST', path: '/me/player/next', status: 500, json: { error: { status: 500, message: 'Server error' } } },
    { m: 'POST', path: '/me/player/next', status: 404, json: { error: { status: 404, message: 'Device not found' } } }
  ] }).then(function (tab) {
    var t = tab.t();
    click(tab, $(tab, 'pNext'));
    return H.wait(100).then(function () {
      check('2 500: Couldn’t control playback toast', tab.toasts().indexOf('Couldn’t control playback. Spotify isn’t answering right now.') !== -1 && !t.state.playerIdle, tab.toasts());   // #41: plain words
      tab.w.__toasts = [];
      click(tab, $(tab, 'pNext'));
      return H.wait(100);
    }).then(function () {
      check('2 404: shown asleep', t.state.playerIdle === true && $(tab, 'pPlay').getAttribute('aria-label') === 'Play', t.state.playerIdle);
      check('2 404: asks to press play first', tab.toasts().indexOf(WAKE_FIRST) !== -1, tab.toasts());
      check('2 404: device forgotten', t.state.device === null);
      tab.calls.length = 0; tab.w.__toasts = [];
      click(tab, $(tab, 'pNext'));
      click(tab, $(tab, 'pShuffle'));
      return H.wait(100);
    }).then(function () {
      check('2 asleep: Next and Shuffle send nothing', reqs(tab, 'POST', '/me/player/next').length === 0 && reqs(tab, 'PUT', /^\/me\/player\//).length === 0, tab.calls);
      check('2 asleep: toast each time', tab.toasts().filter(function (s) { return s === WAKE_FIRST; }).length === 2, tab.toasts());
      t.setPlayer(player({ device: null }));
      tab.calls.length = 0;
      click(tab, $(tab, 'pNext'));
      return H.wait(100);
    }).then(function () {
      var n = reqs(tab, 'POST', '/me/player/next');
      check('2 answer without a device: no device_id', n.length === 1 && n[0].query === '', n);
      done(tab);
    });
  });
});

// 3. Player paused by Spotify (cool-off): controls send nothing and say so once.
tests.push(function () {
  var store = H.seedStore();
  var p = player();
  return setup(store, { player: p, setPlayer: p }).then(function (tab) {
    cool(store, 'player');
    click(tab, $(tab, 'pNext'));
    tab.t().cycleRepeat();
    tab.t().setVolume(30);
    return H.wait(150).then(function () {
      check('3 cool-off: nothing sent', reqs(tab, 'POST', /^\/me\/player/).length === 0 && reqs(tab, 'PUT', /^\/me\/player/).length === 0, tab.calls);
      check('3 cool-off: one toast', tab.toasts().length === 1, tab.toasts());
      done(tab);
    });
  });
});

// 4. Shuffle and Repeat: requests and the buttons' state on the bar and Now Playing.
tests.push(function () {
  var p = player({ shuffle: false, repeat: 'off' });
  return setup(H.seedStore(), { player: p, setPlayer: p }).then(function (tab) {
    var t = tab.t();
    t.openNp();
    click(tab, $(tab, 'pShuffle'));
    var sh = [$(tab, 'pShuffle').getAttribute('aria-pressed'), $(tab, 'npShuffle').getAttribute('aria-pressed')];
    var labels = [];
    var rb = $(tab, 'pRepeat');
    ['npRepeat', 'pRepeat', 'pRepeat'].forEach(function (id) {
      click(tab, $(tab, id));
      labels.push([rb.getAttribute('data-state'), rb.getAttribute('aria-pressed'), rb.getAttribute('aria-label'), $(tab, 'npRepeat').getAttribute('data-state')].join('|'));
    });
    return H.wait(120).then(function () {
      var s = reqs(tab, 'PUT', '/me/player/shuffle');
      check('4 shuffle on: PUT ?state=true&device_id=A', s.length === 1 && s[0].query === '?state=true&device_id=A', s);
      check('4 shuffle button pressed on both', sh[0] === 'true' && sh[1] === 'true', sh);
      var r = reqs(tab, 'PUT', '/me/player/repeat').map(function (c) { return c.query; });
      check('4 repeat cycles off → context → track → off', JSON.stringify(r) === JSON.stringify(['?state=context&device_id=A', '?state=track&device_id=A', '?state=off&device_id=A']), r);
      check('4 repeat all shown', labels[0] === 'context|true|Repeat all (tap to change)|context', labels);
      check('4 repeat one shown', labels[1] === 'track|true|Repeat one (tap to change)|track', labels);
      check('4 repeat off shown', labels[2] === 'off|false|Repeat off (tap to change)|off', labels);
      t.setPlayer(player({ shuffle: true, repeat: 'weird' }));
      tab.calls.length = 0;
      t.toggleShuffle();
      t.cycleRepeat();
      return H.wait(120);
    }).then(function () {
      check('4 shuffle off from on', reqs(tab, 'PUT', '/me/player/shuffle').map(function (c) { return c.query; }).join() === '?state=false&device_id=A', tab.calls);
      check('4 unknown repeat counts as off', reqs(tab, 'PUT', '/me/player/repeat').map(function (c) { return c.query; }).join() === '?state=context&device_id=A', tab.calls);
      done(tab);
    });
  });
});

// 5. Seek: seekBy and seekTo clamp to the song; episodes get Back 15 s / Forward 30 s.
tests.push(function () {
  var p = player({ playing: false, pos: 60000, dur: 240000 });
  return setup(H.seedStore(), { player: p, setPlayer: p }).then(function (tab) {
    var t = tab.t();
    t.openNp();
    check('5 songs have no skip buttons', !shown(tab, 'npSkip'));
    t.seekBy(30000);
    var el1 = txt(tab, 'npElapsed');
    t.seekBy(-200000);
    t.seekTo(999999);
    t.seekTo(12345.6);
    return H.wait(120).then(function () {
      var q = reqs(tab, 'PUT', '/me/player/seek').map(function (c) { return c.query; });
      check('5 seekBy +30 s from 1:00', q[0] === '?position_ms=90000&device_id=A', q);
      check('5 shown at once', el1 === '1:30', el1);
      check('5 seekBy past the start: 0', q[1] === '?position_ms=0&device_id=A', q);
      check('5 seekTo past the end: the length', q[2] === '?position_ms=240000&device_id=A', q);
      check('5 rounded to a whole ms', q[3] === '?position_ms=12346&device_id=A' && q.length === 4, q);
      t.setPlayer(player({ type: 'episode', playing: false, pos: 600000 }));
      tab.calls.length = 0;
      check('5 episodes show the skip buttons', shown(tab, 'npSkip'));
      click(tab, $(tab, 'npFwd30'));
      click(tab, $(tab, 'npBack15'));
      return H.wait(120);
    }).then(function () {
      var q = reqs(tab, 'PUT', '/me/player/seek').map(function (c) { return c.query; });
      check('5 Forward 30 s then Back 15 s', JSON.stringify(q) === JSON.stringify(['?position_ms=630000&device_id=A', '?position_ms=615000&device_id=A']), q);
      done(tab);
    });
  });
});

// 6. makeSlider on its own: paint, drag (one commit on release), keys (one commit after a pause), clamping, no max.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t(), doc = d(tab);
    var node = doc.createElement('div');
    node.innerHTML = '<div class="strack"><div class="sfill"></div><div class="sthumb"></div></div>';
    doc.body.appendChild(node);
    rect(node.querySelector('.strack'), 0, 100);
    var max = 100, commits = [], inputs = [];
    var s = t.makeSlider(node, { max: function () { return max; }, step: 5, text: function (v) { return v + ' pct'; },
      input: function (v) { inputs.push(v); }, commit: function (v) { commits.push(v); } });
    s.set(40);
    check('6 paint: aria and fill', node.getAttribute('aria-valuenow') === '40' && node.getAttribute('aria-valuemax') === '100' &&
      node.getAttribute('aria-valuetext') === '40 pct' && node.querySelector('.sfill').style.width === '40%' && node.querySelector('.sthumb').style.left === '40%',
      [node.getAttribute('aria-valuenow'), node.querySelector('.sfill').style.width]);
    ptr(tab, node, 'pointerdown', 25);
    s.set(70);   // a repaint while dragging is ignored
    var during = node.getAttribute('aria-valuenow');
    ptr(tab, node, 'pointermove', 60);
    check('6 drag: shows the value, nothing committed', during === '25' && node.getAttribute('aria-valuenow') === '60' && commits.length === 0 && s.busy(), { during: during, commits: commits });
    ptr(tab, node, 'pointerup', 130);
    check('6 release: one commit, clamped to max', JSON.stringify(commits) === '[100]' && !s.busy(), commits);
    check('6 input called while dragging', JSON.stringify(inputs) === '[25,60,100]', inputs);
    ptr(tab, node, 'pointerdown', 50, 2);
    check('6 right button ignored', !s.busy() && commits.length === 1);
    ptr(tab, node, 'pointerdown', 50);
    node.dispatchEvent(new tab.w.Event('pointercancel', { bubbles: true }));
    ptr(tab, node, 'pointerup', 50);
    check('6 cancelled drag commits nothing', commits.length === 1 && !s.busy(), commits);
    s.set(30);
    key(tab, node, 'ArrowUp'); key(tab, node, 'ArrowRight'); key(tab, node, 'ArrowUp'); key(tab, node, 'ArrowDown');
    check('6 keys move by the step, no commit yet', node.getAttribute('aria-valuenow') === '40' && commits.length === 1 && s.busy(), node.getAttribute('aria-valuenow'));
    return H.wait(650).then(function () {
      check('6 keys: one commit after a pause', JSON.stringify(commits) === '[100,40]' && !s.busy(), commits);
      key(tab, node, 'End'); key(tab, node, 'ArrowRight');
      key(tab, node, 'x');
      return H.wait(650);
    }).then(function () {
      check('6 End and past the end stay at max; other keys ignored', JSON.stringify(commits) === '[100,40,100]', commits);
      key(tab, node, 'Home');
      return H.wait(650);
    }).then(function () {
      check('6 Home goes to 0', commits[3] === 0, commits);
      max = 0;
      ptr(tab, node, 'pointerdown', 50); ptr(tab, node, 'pointerup', 50);
      key(tab, node, 'ArrowUp');
      return H.wait(650);
    }).then(function () {
      check('6 no max: drag and keys do nothing', commits.length === 4 && !s.busy(), commits);
      done(tab);
    });
  });
});

// 7. The progress slider on Now Playing: tap/drag sends one seek on release; keys send one seek; it isn't repainted mid-drag.
tests.push(function () {
  var p = player({ playing: false, pos: 60000, dur: 240000 });
  return setup(H.seedStore(), { player: p, setPlayer: p }).then(function (tab) {
    var t = tab.t(), seek = $(tab, 'npSeek');
    t.openNp();
    check('7 slider shows the position', seek.getAttribute('aria-valuenow') === '60000' && seek.getAttribute('aria-valuemax') === '240000' && seek.getAttribute('aria-valuetext') === '1:00 of 4:00',
      [seek.getAttribute('aria-valuenow'), seek.getAttribute('aria-valuetext')]);
    rect(seek.querySelector('.strack'), 10, 200);
    ptr(tab, seek, 'pointerdown', 110);
    t.paintProgress();
    var mid = [seek.getAttribute('aria-valuenow'), txt(tab, 'npElapsed'), txt(tab, 'npRemain')];
    ptr(tab, seek, 'pointermove', 160);
    return H.wait(80).then(function () {
      check('7 dragging moves the times, not the song', mid.join('|') === '120000|2:00|-2:00' && reqs(tab, 'PUT', '/me/player/seek').length === 0, { mid: mid, calls: tab.calls });
      ptr(tab, seek, 'pointerup', 160);
      return H.wait(80);
    }).then(function () {
      var q = reqs(tab, 'PUT', '/me/player/seek').map(function (c) { return c.query; });
      check('7 release: one seek to 3:00', JSON.stringify(q) === JSON.stringify(['?position_ms=180000&device_id=A']), q);
      t.state.player.progress_ms = 100000; t.paintProgress();
      tab.calls.length = 0;
      key(tab, seek, 'ArrowRight'); key(tab, seek, 'ArrowRight');
      return H.wait(650);
    }).then(function () {
      var q = reqs(tab, 'PUT', '/me/player/seek').map(function (c) { return c.query; });
      check('7 two arrow presses: one seek 10 s on', JSON.stringify(q) === JSON.stringify(['?position_ms=110000&device_id=A']), q);
      done(tab);
    });
  });
});

// 8. Volume: only when the device allows it; clamped and rounded; the slider sends one request.
tests.push(function () {
  var vdev = Object.assign({}, DEV_B, { is_active: true, supports_volume: true, volume_percent: 40 });
  var p = player({ device: vdev });
  return setup(H.seedStore(), { player: p, setPlayer: p }).then(function (tab) {
    var t = tab.t(), vol = $(tab, 'npVol');
    t.openNp();
    check('8 volume row shown with the device volume', shown(tab, 'npVolRow') && vol.getAttribute('aria-valuenow') === '40' && vol.getAttribute('aria-valuetext') === '40%',
      [shown(tab, 'npVolRow'), vol.getAttribute('aria-valuenow')]);
    key(tab, vol, 'ArrowUp');
    return H.wait(650).then(function () {
      var q = reqs(tab, 'PUT', '/me/player/volume').map(function (c) { return c.query; });
      check('8 slider: one PUT volume 45 on the playing device', JSON.stringify(q) === JSON.stringify(['?volume_percent=45&device_id=B']), q);
      tab.calls.length = 0;
      t.setVolume(73.6);
      var opt = t.state.player.device.volume_percent;
      t.setVolume(150);
      t.setVolume(-10);
      return H.wait(120).then(function () {
        var q2 = reqs(tab, 'PUT', '/me/player/volume').map(function (c) { return c.query; });
        check('8 rounded, clamped to 0-100', JSON.stringify(q2) === JSON.stringify(['?volume_percent=74&device_id=B', '?volume_percent=100&device_id=B', '?volume_percent=0&device_id=B']), q2);
        check('8 shown at once', opt === 74, opt);
        t.setPlayer(player({ device: Object.assign({}, DEV_A, { supports_volume: false }) }));
        check('8 no volume row when the device can’t change it', !shown(tab, 'npVolRow'));
        done(tab);
      });
    });
  });
});

// 9. The bar and Now Playing reflect the player answer.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t(), doc = d(tab), store = null;
    check('9 nothing playing: no bar', !shown(tab, 'player') && !doc.body.classList.contains('has-player'));
    t.setPlayer(player({ shuffle: true, repeat: 'track', artists: [{ id: 'x1', name: 'Ann' }, { id: 'x2', name: 'Bo' }] }));
    check('9 bar shown', shown(tab, 'player') && doc.body.classList.contains('has-player'));
    check('9 title and artists · device', txt(tab, 'pTitle') === 'Song One' && txt(tab, 'pSub') === 'Ann, Bo · iPhone', txt(tab, 'pSub'));
    check('9 Pause while playing', $(tab, 'pPlay').getAttribute('aria-label') === 'Pause');
    check('9 shuffle and repeat one', $(tab, 'pShuffle').getAttribute('aria-pressed') === 'true' && $(tab, 'pRepeat').getAttribute('data-state') === 'track');
    check('9 heart points at the song', $(tab, 'pHeart').getAttribute('data-uri') === 'spotify:track:t1' && $(tab, 'pHeart').getAttribute('data-kind') === 'track');
    check('9 Now Playing closed until opened', !shown(tab, 'np'));
    t.openNp();
    check('9 Now Playing: name, by, device, controls', shown(tab, 'np') && txt(tab, 'npName') === 'Song One' && txt(tab, 'npBy') === 'Ann, Bo' &&
      txt(tab, 'npDev') === 'Playing on iPhone · Change' && $(tab, 'npPlay').getAttribute('aria-label') === 'Pause' &&
      $(tab, 'npShuffle').getAttribute('aria-pressed') === 'true' && $(tab, 'npRepeat').getAttribute('aria-label') === 'Repeat one (tap to change)',
      [txt(tab, 'npName'), txt(tab, 'npBy'), txt(tab, 'npDev')]);
    t.setPlayer(player({ playing: false }));
    check('9 paused: Play on both', $(tab, 'pPlay').getAttribute('aria-label') === 'Play' && $(tab, 'npPlay').getAttribute('aria-label') === 'Play');
    t.setPlayer(player({ type: 'episode', playing: false, pos: 3723000, dur: 7200000 }));
    check('9 episode: show name on bar and screen', txt(tab, 'pSub') === 'Money Show · iPhone' && txt(tab, 'npBy') === 'Money Show' && $(tab, 'pHeart').getAttribute('data-kind') === 'episode', txt(tab, 'pSub'));
    check('9 hours in the times', txt(tab, 'npElapsed') === '1:02:03' && txt(tab, 'npRemain') === '-57:57', [txt(tab, 'npElapsed'), txt(tab, 'npRemain')]);
    t.setPlayer(player({ device: null, playing: false }));
    check('9 no device: Choose a device, no device in the sub line', txt(tab, 'npDev') === 'Choose a device' && txt(tab, 'pSub') === 'Artist', [txt(tab, 'npDev'), txt(tab, 'pSub')]);
    // Playing: the bar moves on between checks, and stops at the end.
    tab.w.__frozen = Date.now();
    t.setPlayer(player({ pos: 60000, dur: 240000 }));
    t.paintProgress();
    var t0 = txt(tab, 'npElapsed');
    tab.w.__frozen += 15000;
    t.paintProgress();
    var t1 = [txt(tab, 'npElapsed'), txt(tab, 'npRemain')];
    tab.calls.length = 0;
    tab.w.__frozen += 600000;
    t.paintProgress();
    tab.w.__frozen = null; tab.w.__off = 615000;
    var t2 = [txt(tab, 'npElapsed'), txt(tab, 'npRemain')];
    check('9 progress counts on while playing', t0 === '1:00' && t1.join() === '1:15,-2:45', { t0: t0, t1: t1 });
    check('9 progress stops at the end', t2.join() === '4:00,-0:00', t2);
    return H.wait(1800).then(function () {
      check('9 song ran out locally: one early check', reqs(tab, 'GET', '/me/player').length === 1, tab.calls);
      tab.w.__off = 0;
      done(tab);
    });
  });
});

// 10. Device sheet: loading, rows, choosing a device (transfer with play), focus, closing.
tests.push(function () {
  var store = H.seedStore();
  var p = player();
  return setup(store, { player: p, setPlayer: p, devices: [DEV_A, DEV_B, DEV_C] }).then(function (tab) {
    var t = tab.t(), list = $(tab, 'devList');
    t.state.devices = [];
    var opener = $(tab, 'devBtn');
    opener.focus();
    click(tab, opener);
    check('10 sheet opens with a loading line', shown(tab, 'sheet') && /Looking for devices…/.test(list.textContent), list.textContent);
    check('10 focus on Close', d(tab).activeElement === $(tab, 'sheetClose'));
    return H.wait(120).then(function () {
      var rows = [].slice.call(list.querySelectorAll('button'));
      check('10 one devices request, three rows', reqs(tab, 'GET', '/me/player/devices').length === 1 && rows.length === 3, rows.length);
      check('10 current device marked', rows[0].getAttribute('aria-current') === 'true' && /Selected/.test(rows[0].textContent) && /Active/.test(rows[0].textContent), rows[0] && rows[0].textContent);
      check('10 restricted device disabled', rows[2].disabled && /Can’t be controlled/.test(rows[2].textContent), rows[2] && rows[2].textContent);
      check('10 other device selectable', !rows[1].disabled && rows[1].getAttribute('aria-current') === 'false' && /Computer/.test(rows[1].textContent));
      tab.calls.length = 0;
      click(tab, rows[1]);
      return H.wait(120);
    }).then(function () {
      var tr = reqs(tab, 'PUT', '/me/player');
      check('10 transfer: PUT /me/player with play true', tr.length === 1 && tr[0].query === '' && JSON.stringify(tr[0].body) === JSON.stringify({ device_ids: ['B'], play: true }), tr);
      check('10 choice kept on the phone', stored(store, 'lib-device') === 'B', store.getItem('lib-device'));
      check('10 sheet closes, focus back, toast', !shown(tab, 'sheet') && d(tab).activeElement === opener && tab.toasts().indexOf('Now using Computer') !== -1, tab.toasts());
      check('10 device switched', t.state.device && t.state.device.id === 'B' && txt(tab, 'devBtn') === 'Computer · Change', txt(tab, 'devBtn'));
      return H.wait(700);
    }).then(function () {
      check('10 forced check after the switch', reqs(tab, 'GET', '/me/player').length === 1, tab.calls);
      check('10 chosen device stays chosen after the check', t.state.device && t.state.device.id === 'B');
      t.openSheet();
      return H.wait(120);
    }).then(function () {
      tab.calls.length = 0;
      click(tab, $(tab, 'sheetRefresh'));
      return H.wait(120);
    }).then(function () {
      check('10 Refresh asks again', reqs(tab, 'GET', '/me/player/devices').length === 1, tab.calls);
      key(tab, d(tab), 'Escape');
      check('10 Escape closes the sheet', !shown(tab, 'sheet'));
      t.closeSheet();
      t.openSheet();
      click(tab, $(tab, 'sheetBack'));
      check('10 backdrop closes the sheet', !shown(tab, 'sheet'));
      done(tab);
    });
  });
});

// 11. Device sheet edge cases: paused transfer, transfer errors, list errors, empty list, cool-off, one request at a time.
tests.push(function () {
  var store = H.seedStore();
  var p = player({ playing: false });
  return setup(store, { player: p, setPlayer: p, devices: [DEV_A, DEV_B], script: [
    { m: 'PUT', path: '/me/player', status: 404, json: { error: { status: 404, message: 'Device not found' } } },
    { m: 'PUT', path: '/me/player', status: 502, json: { error: { status: 502, message: 'Bad gateway' } } }
  ] }).then(function (tab) {
    var t = tab.t(), list = $(tab, 'devList');
    t.openSheet();
    return H.wait(100).then(function () {
      t.transferTo(DEV_B);
      return H.wait(100);
    }).then(function () {
      check('11 404: says to refresh, sheet stays, nothing kept', tab.toasts().indexOf('Couldn’t switch to Computer (device not found; refresh the list).') !== -1 && shown(tab, 'sheet') && store.getItem('lib-device') === null, tab.toasts());
      t.transferTo(DEV_B);
      return H.wait(100);
    }).then(function () {
      check('11 a 5xx says so in plain words', tab.toasts().indexOf('Couldn’t switch to Computer. Spotify isn’t answering right now.') !== -1, tab.toasts());   // #41
      tab.calls.length = 0;
      t.transferTo(DEV_B);
      return H.wait(100);
    }).then(function () {
      var tr = reqs(tab, 'PUT', '/me/player');
      check('11 paused: transfer with play false', tr.length === 1 && tr[0].body.play === false && tr[0].body.device_ids[0] === 'B', tr);
      tab.env.script.push({ m: 'GET', path: '/me/player/devices', status: 500, json: { error: { status: 500, message: 'Server down' } } });
      t.openSheet();
      return H.wait(120);
    }).then(function () {
      check('11 list error shown in the sheet', list.querySelector('.err') && list.querySelector('.err').textContent === 'Couldn’t load devices. Spotify isn’t answering right now.', list.textContent);   // #41
      tab.env.devices = [];
      t.loadSheetDevices();
      return H.wait(120);
    }).then(function () {
      check('11 empty list explains what to do', /Open Spotify on your phone, computer or speaker, then refresh\./.test(list.textContent), list.textContent);
      tab.env.devices = [DEV_A];
      tab.calls.length = 0;
      var a = t.fetchDevices(), b = t.fetchDevices();
      return Promise.all([a, b]).then(function (r) {
        check('11 two lookups at once share one request', a === b && reqs(tab, 'GET', '/me/player/devices').length === 1 && r[0].length === 1, tab.calls);
        cool(store, 'player');
        tab.calls.length = 0;
        t.transferTo(DEV_B);
        return H.wait(100);
      });
    }).then(function () {
      check('11 cool-off: no transfer sent', reqs(tab, 'PUT', '/me/player').length === 0, tab.calls);
      done(tab);
    });
  });
});

// 12. Device choice: preference, active device, phone fallback, freshness, status line, control device.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t(), s = t.state, now = tab.w.Date.now();
    var P = { id: 'P', name: 'Phone', type: 'Smartphone', is_active: false };
    s.devices = [DEV_A, DEV_B]; s.active = DEV_A;
    store.setItem('lib-device', JSON.stringify('B'));
    t.recomputeDevice();
    check('12 preferred device wins over the active one', s.device && s.device.id === 'B');
    store.setItem('lib-device', JSON.stringify('X'));
    s.active = { id: 'X', name: 'Car', type: 'Automobile', is_active: true };
    t.recomputeDevice();
    check('12 preferred device not listed but active: used', s.device && s.device.id === 'X');
    s.active = DEV_A;
    t.recomputeDevice();
    check('12 preferred device gone: the active one', s.device && s.device.id === 'A');
    store.removeItem('lib-device');
    s.active = null; s.devices = [Object.assign({}, DEV_B), P];
    t.recomputeDevice();
    check('12 nothing active: the phone', s.device && s.device.id === 'P');
    s.devices = [Object.assign({}, DEV_B, { is_active: true }), P];
    t.recomputeDevice();
    check('12 an active device in the list beats the phone', s.device && s.device.id === 'B');
    s.devices = [DEV_B.is_active ? DEV_B : Object.assign({}, DEV_B)];
    s.deviceChecked = true; s.deviceError = '';
    t.recomputeDevice();
    check('12 no active device and no phone: none', s.device === null);
    check('12 status says nothing is open', /Spotify isn’t open on any device/.test(txt(tab, 'statusText')) && txt(tab, 'devBtn') === 'Devices', txt(tab, 'statusText'));
    s.device = DEV_A; s.deviceAt = now;
    check('12 fresh device', !!t.deviceFresh());
    s.deviceAt = now - 91000;
    check('12 device older than 90 s is not fresh', !t.deviceFresh());
    s.device = null; s.deviceChecked = true; s.deviceError = ''; s.devicesAt = now;
    check('12 empty list just now: known that nothing is open', t.noDeviceKnown() === true);
    s.devicesAt = now - 121000;
    check('12 empty list over 2 min ago: not known', t.noDeviceKnown() === false);
    s.devicesAt = now; s.deviceError = 'x';
    check('12 a failed check is not “nothing open”', t.noDeviceKnown() === false);
    s.deviceError = ''; s.deviceChecked = false;
    check('12 never checked is not “nothing open”', t.noDeviceKnown() === false);
    s.device = DEV_A; s.player = player({ device: DEV_B });
    check('12 control device: the one playing', t.controlDevice().id === 'B');
    s.player = player({ device: null });
    check('12 control device: the chosen one when the answer has none', t.controlDevice().id === 'A');
    s.player = null;
    check('12 control device: the chosen one with no player', t.controlDevice().id === 'A');
    done(tab);
  });
});

// 13. checkDevice: errors show in the status line; success clears them; cool-off sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [DEV_A] }).then(function (tab) {
    var t = tab.t();
    tab.env.script.push({ m: 'GET', path: '/me/player/devices', status: 500, json: { error: { status: 500, message: 'Down' } } });
    t.state.active = null;
    return t.checkDevice().then(function () {
      check('13 error kept and shown', t.state.deviceError === 'Down' && t.state.device === null && txt(tab, 'statusText') === 'Couldn’t check your devices. Spotify isn’t answering right now.', txt(tab, 'statusText'));   // #41: plain words
      return t.checkDevice();
    }).then(function () {
      check('13 next check clears it', t.state.deviceError === '' && t.state.device && t.state.device.id === 'A', t.state.deviceError);
      check('13 status: ready, not playing here', txt(tab, 'statusText') === 'Ready: taps play on' && txt(tab, 'devBtn') === 'iPhone · Change', [txt(tab, 'statusText'), txt(tab, 'devBtn')]);
      t.setPlayer(player());
      check('13 status: playing on', txt(tab, 'statusText') === 'Playing on', txt(tab, 'statusText'));
      cool(store, 'player');
      tab.calls.length = 0;
      var before = t.state.device;
      return t.checkDevice().then(function () {
        check('13 cool-off: no request, device kept', reqs(tab, 'GET', '/me/player/devices').length === 0 && t.state.device === before, tab.calls);
        done(tab);
      });
    });
  });
});

// 14. Up next: one request, songs you added only (by default), the switch, refresh, focus, closing.
tests.push(function () {
  var store = H.seedStore();
  var now = Date.now();
  store.setItem('lib-queued', JSON.stringify([{ uri: 'spotify:track:t2', at: now }, { uri: 'spotify:track:t3', at: now - 25 * 3600e3 }]));
  var q = { currently_playing: trackObj('t1', 'Song One'), queue: [trackObj('t2', 'Song Two'), trackObj('t3', 'Song Three'), trackObj('t2', 'Song Two')] };
  var p = player();
  return setup(store, { player: p, setPlayer: p, queue: q }).then(function (tab) {
    var t = tab.t(), body = $(tab, 'qBody');
    var opener = $(tab, 'pQueue');
    click(tab, opener);
    var loading = body.textContent;
    check('14 opens with a loading line, switch on by default', shown(tab, 'queue') && loading === 'Loading the queue…' && $(tab, 'qHide').checked === true && t.queueHide() === true, loading);
    check('14 focus on Close', d(tab).activeElement === $(tab, 'queueClose'));
    return H.wait(120).then(function () {
      var heads = [].slice.call(body.querySelectorAll('h3')).map(function (h) { return h.textContent; });
      var lists = body.querySelectorAll('ul');
      check('14 one GET /me/player/queue', reqs(tab, 'GET', '/me/player/queue').length === 1, tab.calls);
      check('14 now playing and added by you', heads.join('|') === 'Now playing|Added by you' && /Song One/.test(lists[0].textContent), heads);
      check('14 only the song added with + in the last 24 h, once', lists[1] && lists[1].querySelectorAll('li').length === 1 && /Song Two/.test(lists[1].textContent), lists[1] && lists[1].textContent);
      check('14 note about hidden picks', /Spotify may add its own picks after these; they’re hidden\./.test(body.textContent));
      tab.calls.length = 0;
      click(tab, $(tab, 'qHide'));
      var heads2 = [].slice.call(body.querySelectorAll('h3')).map(function (h) { return h.textContent; });
      check('14 switch off: kept on the phone, whole queue shown', stored(store, 'lib-queue-hide') === false && t.queueHide() === false && heads2[1] === 'Next in queue' &&
        body.querySelectorAll('ul')[1].querySelectorAll('li').length === 3, heads2);
      check('14 switch off: other note, no request', /Later songs may be Spotify’s own picks/.test(body.textContent) && tab.calls.length === 0, tab.calls);
      click(tab, $(tab, 'queueRefresh'));
      return H.wait(120);
    }).then(function () {
      check('14 Refresh asks again', reqs(tab, 'GET', '/me/player/queue').length === 1, tab.calls);
      click(tab, $(tab, 'queueClose'));
      check('14 Close: hidden, focus back on the opener', !shown(tab, 'queue') && d(tab).activeElement === opener);
      t.openQueue();
      check('14 reopening keeps the switch off', $(tab, 'qHide').checked === false);
      key(tab, d(tab), 'Escape');
      check('14 Escape closes Up next', !shown(tab, 'queue'));
      done(tab);
    });
  });
});

// 15. Up next answers: nothing playing (204), empty lists, errors, missing permission, an answer after closing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { script: [
    { m: 'GET', path: '/me/player/queue', status: 500, json: { error: { status: 500, message: 'Server down' } } }
  ] }).then(function (tab) {
    var t = tab.t(), body = $(tab, 'qBody');
    t.openQueue();
    return H.wait(120).then(function () {
      check('15 error shown', body.querySelector('.err') && body.querySelector('.err').textContent === 'Couldn’t load the queue. Spotify isn’t answering right now.', body.textContent);   // #41
      t.loadQueue();
      return H.wait(120);
    }).then(function () {
      check('15 204: no now playing, nothing you added', body.querySelectorAll('h3').length === 1 && /Nothing you added with ＋ is waiting\./.test(body.textContent), body.textContent);
      store.setItem('lib-queue-hide', 'false');
      t.renderQueue();
      check('15 switch off and empty: the queue is empty', /The queue is empty\./.test(body.textContent), body.textContent);
      t.closeQueue(false);
      tab.env.queue = { currently_playing: trackObj('t1', 'Song One'), queue: [] };
      t.openQueue();
      t.closeQueue(false);
      return H.wait(150);
    }).then(function () {
      check('15 an answer after closing is ignored', !/Song One/.test(body.textContent) && !/Now playing/.test(body.textContent), body.textContent);
      done(tab);
    });
  });
});
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE.replace('user-read-currently-playing ', '') }));
  return setup(store, { script: [{ m: 'GET', path: '/me/player/queue', status: 403, json: { error: { status: 403, message: 'Insufficient client scope' } } }] }).then(function (tab) {
    var t = tab.t(), body = $(tab, 'qBody');
    t.openQueue();
    return H.wait(150).then(function () {
      var b = body.querySelector('button');
      check('15 missing permission: asks for one more sign-in', /Up next needs one more sign-in\./.test(body.textContent) && b && b.textContent === 'Sign in again', body.textContent);
      done(tab);
    });
  });
});

// 16. + (add to queue): request, remembered for Up next, device choice, errors, consumed once it plays.
tests.push(function () {
  var store = H.seedStore();
  var p = player();
  return setup(store, { player: p, setPlayer: p, script: [
    { m: 'POST', path: '/me/player/queue', status: 404, json: { error: { status: 404, message: 'No active device' } } },
    { m: 'POST', path: '/me/player/queue', status: 500, json: { error: { status: 500, message: 'Boom' } } }
  ] }).then(function (tab) {
    var t = tab.t();
    var row = t.itemRow(songItem({ id: 't9', uri: 'spotify:track:t9', name: 'Nine', url: 'https://open.spotify.com/track/t9' }));
    var plus = row.querySelector('button[aria-label="Add “Nine” to queue"]');
    check('16 song rows have +', !!plus);
    click(tab, plus);
    return H.wait(100).then(function () {
      check('16 404: needs a device, not remembered', tab.toasts().indexOf(NO_DEVICE) !== -1 && t.readQueued().length === 0, tab.toasts());
      click(tab, plus);
      return H.wait(100);
    }).then(function () {
      check('16 500: Couldn’t add to queue', tab.toasts().indexOf('Couldn’t add to queue. Spotify isn’t answering right now.') !== -1, tab.toasts());   // #41
      tab.calls.length = 0; tab.w.__toasts = [];
      click(tab, plus);
      return H.wait(100);
    }).then(function () {
      var qp = reqs(tab, 'POST', '/me/player/queue');
      check('16 POST /me/player/queue with uri and device', qp.length === 1 && qp[0].query === '?uri=spotify%3Atrack%3At9&device_id=A' && qp[0].body === null, qp);
      check('16 toast and remembered', tab.toasts().indexOf('Added to queue') !== -1 && t.readQueued().map(function (x) { return x.uri; }).join() === 'spotify:track:t9', t.readQueued());
      t.setPlayer(player({ device: DEV_B }));
      tab.calls.length = 0;
      t.addToQueue(songItem({ kind: 'episode', id: 'e4', uri: 'spotify:episode:e4', name: 'Ep' }));
      return H.wait(100);
    }).then(function () {
      var qp = reqs(tab, 'POST', '/me/player/queue');
      check('16 goes to the device that is playing', qp.length === 1 && qp[0].query === '?uri=spotify%3Aepisode%3Ae4&device_id=B', qp);
      t.setPlayer(player({ id: 't9', name: 'Nine' }));
      t.setPlayer(player({ id: 't10', name: 'Ten' }));
      check('16 a queued song that played no longer waits', t.readQueued().map(function (x) { return x.uri; }).join() === 'spotify:episode:e4', t.readQueued());
      t.state.player = null; t.state.device = null;
      tab.calls.length = 0; tab.w.__toasts = [];
      t.addToQueue(songItem());
      return H.wait(100);
    }).then(function () {
      check('16 no device: nothing sent, says so', reqs(tab, 'POST', '/me/player/queue').length === 0 && tab.toasts().indexOf(NO_DEVICE) !== -1, { calls: tab.calls, toasts: tab.toasts() });
      done(tab);
    });
  });
});

// 17. playBody for each kind of item.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    function b(it) { return JSON.stringify(t.playBody(it)); }
    check('17 song in an album: context with offset', b(songItem({ ctx: 'spotify:album:a5' })) === JSON.stringify({ context_uri: 'spotify:album:a5', offset: { uri: 'spotify:track:t5' } }));
    check('17 song in a playlist at a position', b(songItem({ ctx: 'spotify:playlist:p1', positionMs: 5000 })) === JSON.stringify({ context_uri: 'spotify:playlist:p1', offset: { uri: 'spotify:track:t5' }, position_ms: 5000 }));
    check('17 song alone', b(songItem()) === JSON.stringify({ uris: ['spotify:track:t5'] }));
    check('17 episode resumes, rounded', b({ kind: 'episode', uri: 'spotify:episode:e1', positionMs: 12345.6 }) === JSON.stringify({ uris: ['spotify:episode:e1'], position_ms: 12346 }));
    check('17 position 0 is left out', b({ kind: 'episode', uri: 'spotify:episode:e1', positionMs: 0 }) === JSON.stringify({ uris: ['spotify:episode:e1'] }));
    check('17 exact 0:00 is sent', b({ kind: 'episode', uri: 'spotify:episode:e1', positionMs: 0, exactPos: true }) === JSON.stringify({ uris: ['spotify:episode:e1'], position_ms: 0 }));
    check('17 album plays as a context', b({ kind: 'album', uri: 'spotify:album:a5' }) === JSON.stringify({ context_uri: 'spotify:album:a5' }));
    check('17 playlist plays as a context', b({ kind: 'playlist', uri: 'spotify:playlist:p1' }) === JSON.stringify({ context_uri: 'spotify:playlist:p1' }));
    check('17 resume of the last song', b({ kind: 'resume', uri: 'spotify:track:t1', positionMs: 65000 }) === JSON.stringify({ uris: ['spotify:track:t1'], position_ms: 65000 }));
    var saved = t.state.data;
    t.state.data = null;
    check('17 Liked Songs before the account loads: nothing', t.playBody({ kind: 'liked' }) === null);
    t.state.data = { me: { id: 'me1' } };
    check('17 Liked Songs: the collection context', b({ kind: 'liked' }) === JSON.stringify({ context_uri: 'spotify:user:me1:collection' }));
    t.state.data = saved;
    done(tab);
  });
});

// 18. Tapping an item with a fresh device: one play request, toast, forced check; shuffle first; context retry.
tests.push(function () {
  return setup(H.seedStore(), { script: [
    { m: 'PUT', path: '/me/player/play', status: 403, json: { error: { status: 403, message: 'Restricted' } } }
  ] }).then(function (tab) {
    var t = tab.t(), e = ev();
    t.onItemClick(songItem({ ctx: 'spotify:album:a5', positionMs: 5000 }), e);
    return H.wait(120).then(function () {
      var pl = reqs(tab, 'PUT', '/me/player/play');
      check('18 tap handled by the page', e.called === 1);
      check('18 no device lookup when fresh', reqs(tab, 'GET', '/me/player/devices').length === 0, tab.calls);
      check('18 refused in context: tries the song alone once', pl.length === 2 && pl[0].body.context_uri === 'spotify:album:a5' &&
        JSON.stringify(pl[1].body) === JSON.stringify({ uris: ['spotify:track:t5'], position_ms: 5000 }) && /device_id=A/.test(pl[1].query), pl);
      check('18 playing toast', tab.toasts().indexOf('Playing “Five” on iPhone') !== -1, tab.toasts());
      return H.wait(700);
    }).then(function () {
      check('18 forced check after play', reqs(tab, 'GET', '/me/player').length >= 1, tab.calls);
      tab.calls.length = 0; tab.w.__toasts = [];
      t.state.deviceAt = tab.w.Date.now();
      t.onItemClick({ kind: 'album', id: 'a5', uri: 'spotify:album:a5', name: 'Album Five', url: 'https://open.spotify.com/album/a5' }, ev(), { shuffle: true });
      return H.wait(120);
    }).then(function () {
      var seq = tab.calls.filter(function (c) { return c.method === 'PUT'; }).map(function (c) { return c.path + c.query; });
      check('18 shuffle: shuffle on, then play the album', JSON.stringify(seq) === JSON.stringify(['/me/player/shuffle?state=true&device_id=A', '/me/player/play?device_id=A']), seq);
      check('18 shuffle toast', tab.toasts().indexOf('Shuffling “Album Five” on iPhone') !== -1, tab.toasts());
      done(tab);
    });
  });
});

// 19. Play errors: 404 in link mode toasts with a link (no retry); 404 in wait mode waits; other errors; account not loaded; cool-off.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { script: [
    { m: 'PUT', path: '/me/player/play', status: 404, json: { error: { status: 404, message: 'Device not found' } } },
    { m: 'PUT', path: '/me/player/play', status: 404, json: { error: { status: 404, message: 'Device not found' } } },
    { m: 'PUT', path: '/me/player/play', status: 500, json: { error: { status: 500, message: 'Oops' } } }
  ] }).then(function (tab) {
    var t = tab.t();
    t.setWakeMode('link');
    t.playNow(songItem({ ctx: 'spotify:album:a5' }));
    return H.wait(120).then(function () {
      check('19 404: no context retry', reqs(tab, 'PUT', '/me/player/play').length === 1, tab.calls);
      check('19 404 (link mode): toast with Open in Spotify', tab.toasts().indexOf('Couldn’t play (Device not found). | https://open.spotify.com/track/t5 | Open in Spotify') !== -1, tab.toasts());
      check('19 device forgotten after a failed play', t.state.device === null && t.state.deviceAt === 0);
      tab.env.devices = [];
      t.setWakeMode('wait');
      t.state.device = clone(DEV_A); t.state.deviceAt = tab.w.Date.now();
      tab.w.__toasts = [];
      t.playNow(songItem());
      return H.wait(150);
    }).then(function () {
      var pend = stored(store, 'lib-pending');
      check('19 404 (wait mode): the tap waits for Spotify', pend && pend.mode === 'wait' && pend.item.uri === 'spotify:track:t5' && shown(tab, 'wake') && tab.toasts().length === 0, { pend: pend, toasts: tab.toasts() });
      t.stopWake(); store.removeItem('lib-pending');
      t.state.device = clone(DEV_A); t.state.deviceAt = tab.w.Date.now();
      t.playNow(songItem());
      return H.wait(120);
    }).then(function () {
      check('19 a 5xx: Couldn’t play in plain words', tab.toasts().indexOf('Couldn’t play. Spotify isn’t answering right now. | https://open.spotify.com/track/t5 | Open in Spotify') !== -1, tab.toasts());   // #41
      var saved = t.state.data;
      t.state.data = null;
      t.state.device = clone(DEV_A); t.state.deviceAt = tab.w.Date.now();
      tab.calls.length = 0;
      t.playNow({ kind: 'liked', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks' });
      return H.wait(100).then(function () {
        t.state.data = saved;
        check('19 Liked Songs before the account loads: says so, nothing sent', reqs(tab, 'PUT', '/me/player/play').length === 0 &&
          tab.toasts().some(function (s) { return s.indexOf('Couldn’t play (your account details haven’t loaded yet).') === 0; }), tab.toasts());
        cool(store, 'player');
        t.state.device = clone(DEV_A); t.state.deviceAt = tab.w.Date.now();
        var e = ev();
        tab.calls.length = 0;
        t.onItemClick(songItem(), e);
        return H.wait(100).then(function () {
          check('19 cool-off: tap sends nothing', e.called === 1 && tab.calls.length === 0, tab.calls);
          done(tab);
        });
      });
    });
  });
});

// 20. Tapping with no fresh device: check first; play, wait, or offer to wake Spotify depending on the result and the wake mode.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [DEV_A] }).then(function (tab) {
    var t = tab.t();
    t.state.deviceAt = tab.w.Date.now() - 100000;
    t.onItemClick(songItem(), ev());
    return H.wait(150).then(function () {
      var order = tab.calls.filter(function (c) { return c.path !== '/me/player' || c.method !== 'GET'; }).map(function (c) { return c.method + ' ' + c.path; });
      check('20 stale device: look up devices, then play', order[0] === 'GET /me/player/devices' && order[1] === 'PUT /me/player/play' && order.length === 2, order);
      // Nothing open, link mode: a toast button wakes Spotify by opening the item.
      tab.env.devices = [];
      t.setWakeMode('link');
      t.state.device = null; t.state.deviceAt = 0; t.state.devicesAt = 0; t.state.active = null; t.state.deviceChecked = false;
      tab.calls.length = 0; tab.w.__toasts = [];
      t.onItemClick(songItem(), ev());
      return H.wait(150);
    }).then(function () {
      var btn = $(tab, 'toast').querySelector('.toastbtn');
      check('20 nothing open (link): toast with Open in Spotify', tab.toasts().indexOf('Spotify isn’t open on any device.') !== -1 && btn && btn.textContent === 'Open in Spotify' && reqs(tab, 'PUT', '/me/player/play').length === 0, tab.toasts());
      click(tab, btn);
      var pend = stored(store, 'lib-pending');
      check('20 button opens the item in Spotify and remembers the tap', tab.w.__nav[0] === 'https://open.spotify.com/track/t5' && pend && pend.mode === 'link' && pend.item.uri === 'spotify:track:t5', { nav: tab.w.__nav, pend: pend });
      store.removeItem('lib-pending');
      // Known empty list just now: wake straight from the tap, no lookup.
      tab.calls.length = 0;
      t.onItemClick(songItem(), ev());
      check('20 known nothing open: wakes at once, no lookup', tab.w.__nav.length === 2 && tab.calls.length === 0, { nav: tab.w.__nav, calls: tab.calls });
      store.removeItem('lib-pending');
      // Shortcut mode: the button runs the Wake Spotify shortcut.
      t.setWakeMode('shortcut');
      t.state.devicesAt = 0;
      tab.w.__toasts = [];
      t.onItemClick(songItem(), ev());
      return H.wait(150);
    }).then(function () {
      var btn = $(tab, 'toast').querySelector('.toastbtn');
      check('20 shortcut mode: toast button says Wake Spotify', btn && btn.textContent === 'Wake Spotify', btn && btn.textContent);
      click(tab, btn);
      var pend = stored(store, 'lib-pending');
      check('20 shortcut mode: runs the shortcut', tab.w.__nav[2] === 'shortcuts://run-shortcut?name=Wake%20Spotify' && pend && pend.mode === 'shortcut', { nav: tab.w.__nav, pend: pend });
      store.removeItem('lib-pending');
      // Wait mode: the tap waits, nothing opens.
      t.setWakeMode('wait');
      t.state.devicesAt = 0;
      t.onItemClick(songItem(), ev());
      return H.wait(150);
    }).then(function () {
      var pend = stored(store, 'lib-pending');
      check('20 wait mode: remembered, waiting line, nothing opened', pend && pend.mode === 'wait' && shown(tab, 'wake') && tab.w.__nav.length === 3, { pend: pend, nav: tab.w.__nav });
      t.stopWake(); store.removeItem('lib-pending');
      tab.env.script.push({ m: 'GET', path: '/me/player/devices', status: 500, json: { error: { status: 500, message: 'Down' } } });
      t.state.devicesAt = 0; tab.w.__toasts = [];
      t.onItemClick(songItem(), ev());
      return H.wait(150);
    }).then(function () {
      check('20 lookup failed: toast with Open in Spotify', tab.toasts().indexOf('Couldn’t check your devices. Spotify isn’t answering right now. | https://open.spotify.com/track/t5 | Open in Spotify') !== -1, tab.toasts());   // #41
      done(tab);
    });
  });
});

// 21. Wake mode setting and wakeSpotify.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t();
    check('21 default is wait', t.wakeMode() === 'wait');
    t.setWakeMode('link');
    check('21 link stored as a plain string', store.getItem('lib-wake') === 'link' && t.wakeMode() === 'link');
    t.setWakeMode('shortcut');
    check('21 shortcut', store.getItem('lib-wake') === 'shortcut' && t.wakeMode() === 'shortcut');
    t.setWakeMode('bogus');
    check('21 anything else is wait', store.getItem('lib-wake') === 'wait' && t.wakeMode() === 'wait');
    store.setItem('lib-wake', '"link"');
    check('21 a JSON-quoted value still reads', t.wakeMode() === 'link');
    var radio = d(tab).querySelector('input[name="wakeMode"][value="shortcut"]');
    radio.checked = true;
    radio.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
    check('21 settings radio saves the mode', t.wakeMode() === 'shortcut' && tab.toasts().some(function (s) { return /Wake Spotify shortcut/.test(s); }), tab.toasts());
    t.wakeSpotify(songItem(), { shuffle: true }, 'link');
    var pend = stored(store, 'lib-pending');
    check('21 explicit link: opens the item, remembers the tap with shuffle', tab.w.__nav.join() === 'https://open.spotify.com/track/t5' && pend.mode === 'link' && pend.opts.shuffle === true, { nav: tab.w.__nav, pend: pend });
    store.removeItem('lib-pending');
    t.setWakeMode('wait');
    t.wakeSpotify(songItem());
    pend = stored(store, 'lib-pending');
    check('21 wait mode: waits instead of leaving', tab.w.__nav.length === 1 && pend.mode === 'wait' && shown(tab, 'wake'), { nav: tab.w.__nav, pend: pend });
    t.stopWake(); store.removeItem('lib-pending');
    t.showWaitTimeout();
    check('21 timeout line with nothing waiting: hidden', !shown(tab, 'wake'));
    done(tab);
  });
});

// 22. Waiting for Spotify: the line, alternating checks, the regular check paused, then playing once Spotify shows up.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t();
    t.state.device = null; t.state.active = null;
    t.waitForPlay(songItem(), {});
    var pend = stored(store, 'lib-pending');
    check('22 tap remembered (wait)', pend && pend.mode === 'wait' && pend.item.name === 'Five');
    check('22 waiting line with Open Spotify instead', shown(tab, 'wake') && /Press play in Control Center or on the lock screen\. “Five” starts as soon as Spotify wakes\./.test(txt(tab, 'wakeText')) &&
      shown(tab, 'wakeOpen') && !shown(tab, 'wakeRetry'), txt(tab, 'wakeText'));
    t.pollPlayer();
    // #33 (audit/wait-skip-duplicate-devices): the device list from start-up is under one wait step (3 s) old,
    // so the wait starts with the player check, then the device list, then the player again (~6 s in).
    return H.wait(200).then(function () {
      check('22 first check is the player (device list under 3 s old)', reqs(tab, 'GET', '/me/player').length === 1 && reqs(tab, 'GET', '/me/player/devices').length === 0, tab.calls);
      check('22 regular player check holds off while waiting (only the wait\'s own check)', reqs(tab, 'GET', '/me/player').length === 1 && stored(store, 'lib-poller').id === t.MY_ID, tab.calls);
      tab.env.player = player();
      return H.wait(6200);
    }).then(function () {
      var pl = reqs(tab, 'PUT', '/me/player/play');
      check('22 second check is the device list, third the player', reqs(tab, 'GET', '/me/player/devices').length >= 1 && reqs(tab, 'GET', '/me/player').length >= 2, tab.calls);
      check('22 Spotify playing: plays the tap on that device', pl.length === 1 && pl[0].query === '?device_id=A' && JSON.stringify(pl[0].body) === JSON.stringify({ uris: ['spotify:track:t5'] }), pl);
      check('22 wait over: tap cleared, line hidden', store.getItem('lib-pending') === null && !shown(tab, 'wake'));
      done(tab);
    });
  });
});

// 23. A minute without Spotify: Try again; a second minute drops the tap; Cancel; Open Spotify instead; a device found elsewhere plays it.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t();
    t.state.device = null; t.state.active = null;
    t.waitForPlay(songItem(), {});
    tab.w.__off = 61000;
    return H.wait(200).then(function () {
      var pend = stored(store, 'lib-pending');
      check('23 after a minute: Spotify didn’t wake up yet', shown(tab, 'wake') && txt(tab, 'wakeText') === 'Spotify didn’t wake up yet.' && shown(tab, 'wakeRetry') && shown(tab, 'wakeOpen'), txt(tab, 'wakeText'));
      check('23 tap kept for Try again', pend && pend.manual === true, pend);
      tab.calls.length = 0;
      t.resumePending(false);
      return H.wait(150);
    }).then(function () {
      check('23 coming back does not start another minute on its own', tab.calls.length === 0 && txt(tab, 'wakeText') === 'Spotify didn’t wake up yet.', tab.calls);
      click(tab, $(tab, 'wakeRetry'));
      var pend = stored(store, 'lib-pending');
      check('23 Try again: waiting again', /Press play in Control Center/.test(txt(tab, 'wakeText')) && pend.retry === true && pend.manual === false, pend);
      tab.w.__off = 122000;
      return H.wait(200);
    }).then(function () {
      check('23 second minute: tap dropped with a toast', store.getItem('lib-pending') === null && !shown(tab, 'wake') &&
        tab.toasts().indexOf('Spotify still didn’t wake up. Start something in Spotify, then tap again.') !== -1, tab.toasts());
      tab.w.__off = 0;
      t.waitForPlay(songItem(), {});
      click(tab, $(tab, 'wakeCancel'));
      check('23 Cancel: forgotten, hidden, toast', store.getItem('lib-pending') === null && !shown(tab, 'wake') && tab.toasts().indexOf('Cancelled') !== -1);
      click(tab, $(tab, 'wakeRetry'));
      check('23 Try again with nothing waiting', tab.toasts().indexOf('Tap the item again.') !== -1, tab.toasts());
      t.waitForPlay(songItem(), {});
      click(tab, $(tab, 'wakeOpen'));
      var pend = stored(store, 'lib-pending');
      check('23 Open Spotify instead: opens the item, tap now waits for the return', tab.w.__nav.join() === 'https://open.spotify.com/track/t5' && pend && pend.mode === 'link', { nav: tab.w.__nav, pend: pend });
      store.removeItem('lib-pending');
      t.stopWake();
      t.waitForPlay(songItem({ id: 't6', uri: 'spotify:track:t6', name: 'Six' }), {});
      return H.wait(150);
    }).then(function () {
      t.stopWake();   // the loop stops; the tap stays remembered
      tab.env.devices = [DEV_A];
      tab.calls.length = 0;
      return t.checkDevice().then(function () { return H.wait(150); });
    }).then(function () {
      var pl = reqs(tab, 'PUT', '/me/player/play');
      check('23 any device lookup that finds Spotify plays the waiting tap', pl.length === 1 && pl[0].body.uris[0] === 'spotify:track:t6' && store.getItem('lib-pending') === null, pl);
      done(tab);
    });
  });
});

// 24. Polling cadence and the player check.
tests.push(function () {
  var store = H.seedStore();
  var p = player();
  return setup(store, { player: p, setPlayer: p }).then(function (tab) {
    var t = tab.t(), s = t.state;
    [1, 2].forEach(function () { tab.env.script.push({ m: 'GET', path: '/me/player', status: 500, json: { error: { status: 500, message: 'Server down' } } }); });
    check('24 every 20 s', t.pollEvery() === 20000, t.pollEvery());
    t.openNp();
    check('24 every 10 s with Now Playing open', t.pollEvery() === 10000, t.pollEvery());
    s.lastActiveAt = tab.w.Date.now() - 11 * 60000;
    check('24 every 60 s after 10 idle minutes', t.pollEvery() === 60000, t.pollEvery());
    t.closeNp();
    s.lastActiveAt = tab.w.Date.now();
    check('24 back to 20 s', t.pollEvery() === 20000);
    t.schedulePoll(30000, true);
    check('24 schedulePoll sets the timer and the forced flag', !!s.pollTimer && s.pollForce === true);
    t.schedulePoll(30000);
    check('24 an unforced reschedule keeps the forced flag', s.pollForce === true);
    clearTimeout(s.pollTimer); s.pollForce = false;
    tab.calls.length = 0;
    t.pollPlayer();
    return H.wait(100).then(function () {
      check('24 error: one toast', tab.toasts().filter(function (x) { return x === 'Couldn’t check what’s playing. Spotify isn’t answering right now.'; }).length === 1, tab.toasts());   // #41
      check('24 next check rescheduled', !!s.pollTimer);
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      check('24 second error in a row: no second toast', tab.toasts().filter(function (x) { return /what’s playing/.test(x); }).length === 1, tab.toasts());
      tab.calls.length = 0;
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      var g = reqs(tab, 'GET', '/me/player');
      var c = stored(store, 'lib-player-cache'), l = stored(store, 'lib-poller');
      check('24 one GET /me/player?additional_types=episode', g.length === 1 && g[0].query === '?additional_types=episode', g);
      check('24 holds the poller lock', l && l.id === t.MY_ID && l.every === 20000, l);
      check('24 answer shared with other copies', c && c.by === t.MY_ID && c.json && c.json.item.uri === 'spotify:track:t1', c);
      // Another copy holds a fresh lock: show its answer instead of asking.
      store.setItem('lib-poller', JSON.stringify({ id: 'other', at: tab.w.Date.now(), every: 20000 }));
      store.setItem('lib-player-cache', JSON.stringify({ at: tab.w.Date.now(), by: 'other', json: player({ id: 't7', name: 'Seven' }) }));
      tab.calls.length = 0;
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      check('24 another copy polls: no request, its answer shown', reqs(tab, 'GET', '/me/player').length === 0 && txt(tab, 'pTitle') === 'Seven', { calls: tab.calls, title: txt(tab, 'pTitle') });
      t.schedulePoll(0, true);
      return H.wait(100);
    }).then(function () {
      check('24 forced check asks even so', reqs(tab, 'GET', '/me/player').length === 1, tab.calls);
      store.setItem('lib-poller', JSON.stringify({ id: 'other', at: tab.w.Date.now() - 60000, every: 20000 }));
      tab.calls.length = 0;
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      check('24 stale lock: this copy takes over', reqs(tab, 'GET', '/me/player').length === 1 && stored(store, 'lib-poller').id === t.MY_ID, tab.calls);
      tab.env.player = null;
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      var c = stored(store, 'lib-player-cache');
      check('24 nothing playing (204): shared as null', c && c.json === null && c.by === t.MY_ID, c);
      cool(store, 'player');
      tab.calls.length = 0;
      t.pollPlayer();
      return H.wait(100);
    }).then(function () {
      check('24 cool-off: no check sent', reqs(tab, 'GET', '/me/player').length === 0, tab.calls);
      done(tab);
    });
  });
});

// 25. The shared player cache.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t(), now = function () { return tab.w.Date.now(); };
    t.storePlayerCache(player());
    var c = stored(store, 'lib-player-cache');
    check('25 store: time, this copy, answer', c && c.by === t.MY_ID && typeof c.at === 'number' && c.json.item.id === 't1', c);
    t.storePlayerCache(undefined);
    check('25 store nothing: null', stored(store, 'lib-player-cache').json === null);
    check('25 own answer is not applied again', t.applyPlayerCache({ at: now(), by: t.MY_ID, json: player() }) === false);
    check('25 empty or broken entries ignored', t.applyPlayerCache(null) === false && t.applyPlayerCache({ at: 'x', by: 'other', json: null }) === false);
    check('25 older than 5 minutes ignored', t.applyPlayerCache({ at: now() - 6 * 60000, by: 'other', json: player() }) === false);
    check('25 from the future ignored', t.applyPlayerCache({ at: now() + 2 * 60000, by: 'other', json: player() }) === false);
    var at = now();
    check('25 another copy’s answer is shown', t.applyPlayerCache({ at: at, by: 'other', json: player({ id: 't8', name: 'Eight' }) }) === true && txt(tab, 'pTitle') === 'Eight', txt(tab, 'pTitle'));
    check('25 the same answer is not applied twice', t.applyPlayerCache({ at: at, by: 'other', json: player({ id: 't9', name: 'Nine' }) }) === false && txt(tab, 'pTitle') === 'Eight');
    store.setItem('lib-player-cache', JSON.stringify({ at: now() + 5, by: 'other', json: player({ id: 't3', name: 'Three' }) }));
    var Ev = tab.w.StorageEvent;
    var se = new Ev('storage', { key: 'lib-player-cache' });
    return H.wait(20).then(function () {
      tab.w.dispatchEvent(se);
      check('25 a storage event from another copy shows its answer', txt(tab, 'pTitle') === 'Three', txt(tab, 'pTitle'));
      done(tab);
    });
  });
});

var chain = Promise.resolve();
var t0 = Date.now();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(fails ? 1 : 0);
});
