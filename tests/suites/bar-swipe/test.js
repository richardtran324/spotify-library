'use strict';
// Swipe the Now Playing bar (v2.57) tests: jsdom, mocked fetch, shared localStorage.
// Left = Next, right = Previous (the buttons' own command), up = open Now Playing (no request of its own).
// Run: node tests/run.js bar-swipe  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var fs = require('fs');
var path = require('path');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var RATE = { status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } } };

function setup(store, opts) {
  opts = opts || {};
  var env = { script: opts.script || [] };
  var tab = H.makeTab(store || H.seedStore(), function (method, p, q) {
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === p) { s.used = true; return { status: s.status, json: s.json, headers: s.headers }; }
    }
    if (p === '/me/player' && method === 'GET') return opts.player === false ? { status: 204 } : { status: 200, json: H.song() };
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (p === '/me/library/contains') return { status: 200, json: [false] };
  }, { matchMedia: opts.reduce ? function (qs) { return { matches: /reduced-motion/.test(qs), addEventListener: function () {}, addListener: function () {} }; } : undefined });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (opts.player !== false) { t.setPlayer(H.song()); t.state.playerAt = Date.now(); t.paintPlayer(); }
    t.state.lastPollAt = Date.now();   // the next regular check is a full interval away
    return H.wait(100);
  }).then(function () {
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function touchEv(tab, target, type, pts) {
  var list = pts.map(function (p) { return { clientX: p[0], clientY: p[1], target: target, identifier: 0 }; });
  var ev = new tab.w.Event(type, { bubbles: true, cancelable: true });
  var ending = type === 'touchend' || type === 'touchcancel';
  Object.defineProperty(ev, 'touches', { value: ending ? [] : list });
  Object.defineProperty(ev, 'changedTouches', { value: list });
  target.dispatchEvent(ev);
}
// swipe(tab, node, [[dx,dy], ...]): finger down at (150, 700), moves through each offset, lifts at the last one.
function swipe(tab, node, offs, opts) {
  opts = opts || {};
  var x = opts.x != null ? opts.x : 150, y = 700;
  touchEv(tab, node, 'touchstart', opts.fingers === 2 ? [[x, y], [x + 40, y]] : [[x, y]]);
  offs.forEach(function (o, i) { if (i < offs.length - 1 || opts.cancel) touchEv(tab, node, 'touchmove', [[x + o[0], y + o[1]]]); });
  var last = offs[offs.length - 1];
  touchEv(tab, node, opts.cancel ? 'touchcancel' : 'touchend', [[x + last[0], y + last[1]]]);
}
function left(tab, node) { swipe(tab, node || $(tab, 'pTitle'), [[-30, 2], [-70, 4], [-90, 3]]); }
function right(tab, node) { swipe(tab, node || $(tab, 'pTitle'), [[30, -2], [70, -3], [90, 1]]); }
function up(tab, node) { swipe(tab, node || $(tab, 'pCover'), [[2, -20], [3, -50], [4, -70]]); }
function byEp(calls) {
  var m = {};
  calls.forEach(function (c) { var k = c.method + ' ' + c.path; m[k] = (m[k] || 0) + 1; });
  return m;
}
function npOpen(tab) { return !$(tab, 'np').hidden; }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function cover(tab) { return $(tab, 'pCover'); }
function slid(tab) { var c = cover(tab).classList; return c.contains('pslide-l') ? 'l' : c.contains('pslide-r') ? 'r' : ''; }

var tests = [];

// 1. Thresholds: > 60 px sideways with < 30 px drift skips; > 40 px up (mostly upward) opens; anything else does nothing.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t(), k = t.barSwipeKind;
    check('1 constants as specified', t.BAR_SKIP_PX === 60 && t.BAR_DRIFT_PX === 30 && t.BAR_UP_PX === 40, [t.BAR_SKIP_PX, t.BAR_DRIFT_PX, t.BAR_UP_PX]);
    check('1 left 61 = next', k(-61, 0) === 'next');
    check('1 right 61 = prev', k(61, 0) === 'prev');
    check('1 exactly 60 sideways = nothing', k(-60, 0) === '' && k(60, 0) === '');
    check('1 drift 29 still skips', k(-90, 29) === 'next' && k(-90, 5, 29) === 'next');
    check('1 drift 30 = nothing', k(-90, 30) === '' && k(-90, 5, 30) === '', [k(-90, 30), k(-90, 5, 30)]);
    check('1 up 41 = open', k(0, -41) === 'open');
    check('1 up exactly 40 = nothing', k(0, -40) === '');
    check('1 up with some sideways still opens', k(30, -50) === 'open');
    check('1 diagonal (more sideways than up) = nothing', k(50, -45) === '' && k(10, -50, null, 55) === '', [k(50, -45), k(10, -50, null, 55)]);
    check('1 swipe down = nothing', k(0, 80) === '' && k(5, 200) === '');
    check('1 tap = nothing', k(2, 3) === '' && k(0, 0) === '');
  });
});

// 2. Swipe left = Next: one player request, with the device, nothing else; cover slides left.
tests.push(function () {
  return setup().then(function (tab) {
    check('2 bar shows', !$(tab, 'player').hidden);
    left(tab);
    check('2 cover slides left', slid(tab) === 'l', cover(tab).className);
    return H.wait(100).then(function () {
      var m = byEp(tab.calls);
      check('2 exactly one request: POST /me/player/next', tab.calls.length === 1 && m['POST /me/player/next'] === 1, tab.calls);
      check('2 sent to the playing device', /device_id=A/.test(tab.calls[0] && tab.calls[0].query), tab.calls[0]);
      check('2 Now Playing not opened', !npOpen(tab));
      check('2 no message', tab.toasts().length === 0, tab.toasts());
      check('2 zero library/search/catalog requests', tab.calls.every(function (c) { return /^\/me\/player/.test(c.path); }), tab.calls);
      return H.wait(300);
    }).then(function () {
      check('2 slide class cleared afterwards', slid(tab) === '', cover(tab).className);
    });
  });
});

// 3. Swipe right = Previous.
tests.push(function () {
  return setup().then(function (tab) {
    right(tab);
    check('3 cover slides right', slid(tab) === 'r', cover(tab).className);
    return H.wait(100).then(function () {
      check('3 exactly one request: POST /me/player/previous', tab.calls.length === 1 && byEp(tab.calls)['POST /me/player/previous'] === 1, tab.calls);
    });
  });
});

// 4. Same requests as the buttons over the same time (the follow-up checks included).
function sameAs(swipeFn, btnId) {
  return Promise.all([setup(), setup()]).then(function (tabs) {
    tabs[0].calls.length = 0; tabs[1].calls.length = 0;
    swipeFn(tabs[0]); click(tabs[1], $(tabs[1], btnId));
    return H.wait(1200).then(function () { return [byEp(tabs[0].calls), byEp(tabs[1].calls)]; });
  });
}
tests.push(function () {
  return sameAs(left, 'pNext').then(function (m) {
    check('4 swipe left and Next button send the same requests', JSON.stringify(m[0]) === JSON.stringify(m[1]), m);
    check('4 only one player command each', (m[0]['POST /me/player/next'] || 0) === 1, m[0]);
    return sameAs(right, 'pPrev');
  }).then(function (m) {
    check('4 swipe right and Previous button send the same requests', JSON.stringify(m[0]) === JSON.stringify(m[1]), m);
  });
});

// 5. Swipe up opens Now Playing with no request; the following click on the cover/title isn't a second tap.
tests.push(function () {
  return setup().then(function (tab) {
    up(tab);
    check('5 Now Playing opened', npOpen(tab));
    check('5 no slide for swipe up', slid(tab) === '');
    click(tab, $(tab, 'pInfo'));   // the click iOS may send at the end of the swipe
    return H.wait(200).then(function () {
      check('5 zero requests', tab.calls.length === 0, tab.calls);
      check('5 bar is inert under the screen', $(tab, 'player').hasAttribute('inert'));
      left(tab);   // the bar is covered and inert: ignored
      return H.wait(100);
    }).then(function () {
      check('5 swipe on the inert bar sends nothing', tab.calls.length === 0, tab.calls);
      tab.t().closeNp();
      check('5 closes as usual', !npOpen(tab));
    });
  });
});

// 6. Taps still work: a tap (tiny movement) on the cover/title opens Now Playing; a swipe eats only the click that follows it.
tests.push(function () {
  return setup().then(function (tab) {
    swipe(tab, $(tab, 'pTitle'), [[2, 1], [3, 2]]);
    click(tab, $(tab, 'pInfo'));
    check('6 tap opens Now Playing', npOpen(tab));
    tab.t().closeNp();
    return H.wait(50).then(function () {   // NAV-2: closing steps back once, and a tap waits for that Back
      left(tab);
      click(tab, $(tab, 'pInfo'));
      check('6 click right after a skip swipe does not open Now Playing', !npOpen(tab));
      click(tab, $(tab, 'pInfo'));
      check('6 the next tap opens it', npOpen(tab));
      tab.t().closeNp();
      return H.wait(100);
    }).then(function () {
      check('6 only the skip was sent', tab.calls.length === 1 && tab.calls[0].path === '/me/player/next', tab.calls);
      left(tab);
      return H.wait(700);
    }).then(function () {
      click(tab, $(tab, 'pInfo'));
      check('6 a tap well after a swipe still opens', npOpen(tab));
      tab.t().closeNp();
    });
  });
});

// 7. Buttons are left alone: swipes starting on Up next, the heart or the lower controls do nothing; their clicks work right after a swipe.
tests.push(function () {
  return setup().then(function (tab) {
    ['pQueue', 'pHeart', 'pNext', 'pPlay', 'pShuffle'].forEach(function (id) { swipe(tab, $(tab, id), [[-40, 0], [-100, 0]]); up(tab, $(tab, id)); });
    return H.wait(100).then(function () {
      check('7 no request from swipes on buttons', tab.calls.length === 0, tab.calls);
      check('7 Now Playing not opened', !npOpen(tab));
      left(tab);
      click(tab, $(tab, 'pQueue'));
      check('7 Up next opens right after a swipe', !$(tab, 'queue').hidden);
      return H.wait(100);
    }).then(function () {
      var m = byEp(tab.calls);
      check('7 skip sent once and Up next loaded', m['POST /me/player/next'] === 1 && m['GET /me/player/queue'] === 1, m);
    });
  });
});

// 8. Not a swipe: too much drift, a short drag, a cancel, two fingers, a swipe down.
tests.push(function () {
  return setup().then(function (tab) {
    var n = $(tab, 'pTitle');
    swipe(tab, n, [[-30, 35], [-90, 5]]);   // drifted 35 px on the way, ends level
    swipe(tab, n, [[-30, 0], [-55, 0]]);
    swipe(tab, n, [[-40, 0], [-100, 0]], { cancel: true });
    swipe(tab, n, [[-40, 0], [-100, 0]], { fingers: 2 });
    swipe(tab, n, [[0, 40], [0, 90]]);
    swipe(tab, n, [[40, -10], [70, -45]]);   // diagonal: too much drift for a skip, too sideways to open
    return H.wait(100).then(function () {
      check('8 nothing sent', tab.calls.length === 0, tab.calls);
      check('8 Now Playing not opened', !npOpen(tab));
      check('8 no slide', slid(tab) === '');
      check('8 no message', tab.toasts().length === 0, tab.toasts());
    });
  });
});

// 9. Asleep (Spotify dropped the phone): the same message as the buttons, nothing sent, no slide.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.goIdle();
    check('9 asleep', t.state.playerIdle === true);
    left(tab);
    check('9 no slide while asleep', slid(tab) === '');
    var swipeMsg = lastToast(tab);
    click(tab, $(tab, 'pNext'));
    var btnMsg = lastToast(tab);
    check('9 message is WAKE_FIRST', swipeMsg === t.WAKE_FIRST, swipeMsg);
    check('9 same message as the Next button', swipeMsg === btnMsg, [swipeMsg, btnMsg]);
    right(tab);
    check('9 right swipe too', lastToast(tab) === t.WAKE_FIRST);
    up(tab);
    check('9 swipe up still opens Now Playing while asleep (like a tap)', npOpen(tab));
    return H.wait(100).then(function () { check('9 zero requests', tab.calls.length === 0, tab.calls); });
  });
});

// 10. No device (Spotify answers 404): goes asleep with the buttons' message.
tests.push(function () {
  return setup(null, { script: [{ m: 'POST', path: '/me/player/next', status: 404, json: { error: { status: 404, message: 'Player command failed: No active device found' } } }] }).then(function (tab) {
    left(tab);
    return H.wait(100).then(function () {
      var t = tab.t();
      check('10 one request', tab.calls.length === 1, tab.calls);
      check('10 shows asleep', t.state.playerIdle === true);
      check('10 message is WAKE_FIRST', lastToast(tab) === t.WAKE_FIRST, tab.toasts());
      left(tab);
      return H.wait(100);
    }).then(function () {
      check('10 a second swipe sends nothing', tab.calls.length === 1, tab.calls);
    });
  });
});

// 11. 429 pauses the player group; the next swipe sends nothing and says so, like the buttons.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { script: [{ m: 'POST', path: '/me/player/next', status: 429, json: RATE.json, headers: { 'retry-after': '30' } }] }).then(function (tab) {
    var t = tab.t();
    left(tab);
    return H.wait(350).then(function () {
      var c = JSON.parse(store.getItem('lib-cooloff') || '{}');
      check('11 429: player group paused', !!(c.player && c.player.until > Date.now()) && t.coolLeft('player') > 0, c);
      check('11 429: library not paused', !c.library, c);
      check('11 429: says playback is paused', /paus/i.test(lastToast(tab)), tab.toasts());
      var n = tab.calls.length;
      tab.w.__toasts = [];
      tab.w.document.getElementById('toast').hidden = true;
      right(tab);
      check('11 paused: no slide', slid(tab) === '');
      return H.wait(100).then(function () {
        check('11 paused: swipe sends nothing', tab.calls.length === n, tab.calls.slice(n));
        check('11 paused: message shown', /paus/i.test(lastToast(tab)), tab.toasts());
      });
    });
  });
});

// 12. Already paused player group: swipe and button give the same message, zero requests; a library pause doesn't block skips.
tests.push(function () {
  function paused(g) { var s = H.seedStore(), c = {}; c[g] = { until: Date.now() + 600000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: null }; s.setItem('lib-cooloff', JSON.stringify(c)); return s; }
  var sw, bt;
  return setup(paused('player')).then(function (tab) {
    left(tab); sw = lastToast(tab);
    return H.wait(100).then(function () { check('12 player paused: swipe sends nothing', tab.calls.length === 0, tab.calls); return setup(paused('player')); });
  }).then(function (tab) {
    click(tab, $(tab, 'pNext')); bt = lastToast(tab);
    check('12 same message as the Next button', sw && sw === bt, [sw, bt]);
    return setup(paused('library'));
  }).then(function (tab) {
    left(tab);
    return H.wait(100).then(function () {
      check('12 library paused: skip still sent', byEp(tab.calls)['POST /me/player/next'] === 1, tab.calls);
    });
  });
});

// 13. Reduced motion: no cover slide; the skip still goes.
tests.push(function () {
  return setup(null, { reduce: true }).then(function (tab) {
    left(tab);
    check('13 no slide with reduced motion', slid(tab) === '', cover(tab).className);
    return H.wait(100).then(function () {
      check('13 skip still sent', tab.calls.length === 1 && tab.calls[0].path === '/me/player/next', tab.calls);
    });
  });
});

// 14. Nothing playing: the bar is hidden and touches do nothing.
tests.push(function () {
  return setup(null, { player: false }).then(function (tab) {
    check('14 bar hidden', $(tab, 'player').hidden);
    left(tab); up(tab);
    return H.wait(100).then(function () {
      check('14 nothing sent', tab.calls.length === 0, tab.calls);
      check('14 nothing opened', !npOpen(tab));
    });
  });
});

// 15. Storage: swipes store nothing new.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var before = Object.keys(store._m()).sort().join(',');
    left(tab); right(tab); up(tab); tab.t().closeNp();
    swipe(tab, $(tab, 'pTitle'), [[-30, 40], [-90, 0]]);
    return H.wait(100).then(function () {
      var after = Object.keys(store._m()).sort().join(',');
      check('15 no new storage keys', before === after, [before, after]);
      check('15 no swipe key', !/swipe/i.test(after), after);
      check('15 two skips, two requests', tab.calls.length === 2, tab.calls);
    });
  });
});

// 16. Nearby features: Now Playing's swipe down still closes it; its own Next works; buttons unchanged; page details.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    up(tab);
    check('16 opened by swipe', npOpen(tab));
    var np = $(tab, 'np');
    swipe(tab, np, [[0, 50], [0, 120]]);
    check('16 swipe down closes Now Playing', !npOpen(tab));
    up(tab);
    click(tab, $(tab, 'npNext'));
    return H.wait(100).then(function () {
      check('16 Now Playing Next: one request', tab.calls.length === 1 && tab.calls[0].path === '/me/player/next', tab.calls);
      t.closeNp();
      click(tab, $(tab, 'pPlay'));
      return H.wait(100);
    }).then(function () {
      check('16 Play/Pause button still works', tab.calls.some(function (c) { return c.path === '/me/player/pause'; }), tab.calls);
      var html = fs.readFileSync(process.env.SRC || path.resolve(__dirname, '..', '..', '..', 'index.html'), 'utf8');
      check('16 row handles its own pans', /\.prow \{ touch-action: none; \}/.test(html));
      check('16 reduced-motion rule for the slide', /prefers-reduced-motion: reduce\) \{ \.pcover\.pslide-l, \.pcover\.pslide-r \{ animation: none; \}/.test(html));
      check('16 version (v2.55 or later)', (+((/^v2\.(\d+)/.exec(t.VERSION) || [])[1]) >= 55), t.VERSION);   // renumbered from v2.57 on merge
      check('16 cover/title button stays the tap target', /Open Now Playing$/.test($(tab, 'pInfo').getAttribute('aria-label')), $(tab, 'pInfo').getAttribute('aria-label'));
    });
  });
});

// 17. Back-to-back swipes: one request each, the slide restarts.
tests.push(function () {
  return setup().then(function (tab) {
    left(tab); left(tab); right(tab);
    check('17 last slide direction wins', slid(tab) === 'r', cover(tab).className);
    return H.wait(100).then(function () {
      var m = byEp(tab.calls);
      check('17 one request per skip', m['POST /me/player/next'] === 2 && m['POST /me/player/previous'] === 1 && tab.calls.length === 3, m);
    });
  });
});

// 18. The click guard never swallows a real tap: it lasts only until the next touch or 250 ms (v2.57 review fix).
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    check('18 constants', t.BAR_MOVED_PX === 10 && t.BAR_EDGE_PX === 24, [t.BAR_MOVED_PX, t.BAR_EDGE_PX]);
    left(tab);   // iOS sends no click after a moved touch
    return H.wait(300).then(function () {
      click(tab, $(tab, 'pInfo'));
      check('18 tap 300 ms after a swipe opens Now Playing', npOpen(tab));
      t.closeNp();
      return H.wait(50);   // NAV-2: closing steps back once, and a tap waits for that Back
    }).then(function () {
      left(tab);
      click(tab, $(tab, 'pInfo'));   // the click fired right after the swipe's touchend
      check('18 click right after touchend is suppressed', !npOpen(tab));
      left(tab);
      swipe(tab, $(tab, 'pTitle'), [[1, 1], [2, 1]]);   // a new tap straight away clears the guard
      click(tab, $(tab, 'pInfo'));
      check('18 a tap straight after a swipe (new touch) opens Now Playing', npOpen(tab));
      t.closeNp();
      return H.wait(50);
    }).then(function () {
      swipe(tab, $(tab, 'pTitle'), [[4, 3], [8, 5]]);   // moved under 10 px: a tap
      click(tab, $(tab, 'pInfo'));
      check('18 a slightly moving tap opens Now Playing', npOpen(tab));
      t.closeNp();
      swipe(tab, $(tab, 'pTitle'), [[-10, 4], [-30, 6]]);   // moved, but not a swipe: its own click is still ignored
      click(tab, $(tab, 'pInfo'));
      check('18 a short drag does not count as a tap', !npOpen(tab));
      return H.wait(100);
    }).then(function () {
      check('18 only the three skips were sent', tab.calls.filter(function (c) { return c.method === 'POST'; }).length === 3, tab.calls);
    });
  });
});

// 19. Swipes that start within 24 px of the left edge are left to Safari's back gesture; taps there still work.
tests.push(function () {
  return setup().then(function (tab) {
    swipe(tab, $(tab, 'pCover'), [[40, 0], [100, 0]], { x: 16 });
    swipe(tab, $(tab, 'pCover'), [[-1, 0], [-10, 0]], { x: 20 });
    swipe(tab, $(tab, 'pCover'), [[2, -30], [3, -70]], { x: 23 });
    check('19 edge swipes do not open Now Playing', !npOpen(tab));
    swipe(tab, $(tab, 'pCover'), [[0, 0], [1, 1]], { x: 16 });
    click(tab, $(tab, 'pInfo'));
    check('19 a tap at the edge still opens Now Playing', npOpen(tab));
    tab.t().closeNp();
    return H.wait(100).then(function () {
      check('19 edge swipes send nothing', tab.calls.length === 0, tab.calls);
      swipe(tab, $(tab, 'pCover'), [[40, 0], [100, 0]], { x: 24 });
      return H.wait(100);
    }).then(function () {
      check('19 a swipe starting 24 px in still skips', tab.calls.length === 1 && tab.calls[0].path === '/me/player/previous', tab.calls);
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
