'use strict';
// FLOWS-1: between a play tap and Spotify's answer, the header's status line says "Starting “name”…" with a pulsing
// dot, only for the newest tap, and goes back to the usual line (showStatus) on every way out.
// Run: node tests/run.js play-start-feedback  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var FRESH_AGO = 0, STALE_AGO = 5 * 60e3;   // device checked just now / 5 min ago (older than the 90 s fresh window)
function item(name, id) { return { kind: 'track', id: id, name: name, uri: 'spotify:track:' + id, url: 'https://open.spotify.com/track/' + id }; }
function setup(opts) {
  opts = opts || {};
  var env = { r: null };
  var tab = H.makeTab(H.seedStore(), function (m, p, q, body) {
    if (env.r) { var x = env.r(m, p, q, body); if (x) return x; }
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (p === '/me/playlists') return { status: 200, json: { items: [{ id: 'p1', uri: 'spotify:playlist:p1', name: 'Road', owner: { id: 'me1' }, images: [], tracks: { total: 3 } }], next: null, total: 1 } };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.devices = [DEV]; t.state.deviceChecked = true;
    t.state.deviceAt = Date.now() - (opts.stale ? STALE_AGO : FRESH_AGO);
    if (opts.stale) t.state.devicesAt = Date.now() - STALE_AGO;
    t.showStatus();
    tab.calls.length = 0; tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function line(tab) { return d(tab).getElementById('statusText').textContent; }
function dot(tab) { return d(tab).getElementById('dot').className; }
function plays(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; }); }
function click(tab, n) { n.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
var tests = [];

// 1. Device known: the line shows at once, stays through a poll's repaint, and the usual line is back after the toast.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/play') return { status: 204, delay: 900 }; };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('1 within 100 ms: Starting “Road”…', line(tab) === 'Starting “Road”…', line(tab));
      check('1 within 100 ms: dot pulses', dot(tab) === 'dot pulse', dot(tab));
      check('1 no toast yet', tab.toasts().length === 0, tab.toasts());
      t.showStatus();   // a poll or device refresh repaints the header while the play is in flight
      check('1 a repaint mid-flight keeps the line', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab)]);
      check('1 device button stays', d(tab).getElementById('devBtn').textContent === 'iPhone · Change', d(tab).getElementById('devBtn').textContent);
      return H.wait(1100);
    }).then(function () {
      check('1 toast after Spotify answers', tab.toasts().some(function (x) { return /^Playing “Road” on iPhone/.test(x); }), tab.toasts());
      check('1 line back to Ready', /^(Ready: taps play on|Playing on)$/.test(line(tab)), line(tab));
      check('1 dot back to on', dot(tab) === 'dot on', dot(tab));
      check('1 one play request', plays(tab).length === 1, plays(tab).length);
    });
  });
});

// 2. Device check needed (> 90 s): the line covers the check and the play, then goes back.
tests.push(function () {
  return setup({ stale: true }).then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) {
      if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] }, delay: 900 };
      if (p === '/me/player/play') return { status: 204, delay: 900 };
    };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('2 within 100 ms: Starting during the device check', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab)]);
      return H.wait(1200);   // check answered (and repainted the header), play still in flight
    }).then(function () {
      check('2 after the check, before the play answers: still Starting', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab), tab.calls.map(function (c) { return c.method + ' ' + c.path; })]);
      check('2 play sent', plays(tab).length === 1, plays(tab).length);
      return H.wait(1000);
    }).then(function () {
      check('2 toast after the play', tab.toasts().some(function (x) { return /^Playing “Road”/.test(x); }), tab.toasts());
      check('2 line back after the toast', /^(Ready: taps play on|Playing on)$/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
    });
  });
});

// 3. Newest tap only, during a device check: the second tap's name shows, only it plays, the line ends once.
tests.push(function () {
  return setup({ stale: true }).then(function (tab) {
    var t = tab.t(), seen = [], bodies = [];
    tab.env.r = function (m, p, q, body) {
      if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] }, delay: 800 };
      if (p === '/me/player/play') { bodies.push(String(body)); return { status: 204, delay: 500 }; }
    };
    var iv = setInterval(function () { seen.push(line(tab)); }, 50);
    t.onItemClick(item('First', 'a1'), t.NOEV);
    return H.wait(200).then(function () {
      t.onItemClick(item('Second', 'b2'), t.NOEV);
      return H.wait(50);
    }).then(function () {
      check('3 second tap takes the line', line(tab) === 'Starting “Second”…', line(tab));
      return H.wait(1600);
    }).then(function () {
      clearInterval(iv);
      var after = seen.slice(seen.indexOf('Starting “Second”…'));
      check('3 First never shows again after Second', after.indexOf('Starting “First”…') === -1, after);
      check('3 only Second played', bodies.length === 1 && /spotify:track:b2/.test(bodies[0]), bodies);
      check('3 line back after', /^(Ready: taps play on|Playing on)$/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
    });
  });
});

// 4. Newest tap only, device known: an older play answering late doesn't bring its line back.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t(), n = 0;
    tab.env.r = function (m, p) { if (p === '/me/player/play') { n++; return { status: 204, delay: n === 1 ? 1200 : 300 }; } };
    t.onItemClick(item('Slow', 's1'), t.NOEV);
    return H.wait(100).then(function () {
      t.onItemClick(item('Quick', 'q1'), t.NOEV);
      return H.wait(50);
    }).then(function () {
      check('4 newest name shows', line(tab) === 'Starting “Quick”…', line(tab));
      return H.wait(500);
    }).then(function () {
      check('4 newest answered: line back', !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
      return H.wait(900);
    }).then(function () {
      check('4 older answering late leaves the line alone', !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
    });
  });
});

// 5. Play fails (500): error toast with Try again, line back; Try again (no tapped element) shows the line again.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t(), fail = true;
    tab.env.r = function (m, p) {
      if (p === '/me/player/play') return fail ? { status: 500, json: { error: { status: 500, message: 'Server error' } }, delay: 300 } : { status: 204, delay: 600 };
    };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('5 Starting while in flight', line(tab) === 'Starting “Road”…', line(tab));
      return H.wait(400);
    }).then(function () {
      check('5 error toast', tab.toasts().some(function (x) { return /^Couldn’t play/.test(x); }), tab.toasts());
      check('5 line back after the error', !/^Starting/.test(line(tab)) && dot(tab) !== 'dot pulse', [line(tab), dot(tab)]);
      var again = [].filter.call(d(tab).querySelectorAll('#toast button'), function (b) { return b.textContent === 'Try again'; })[0];
      check('5 Try again offered', !!again, d(tab).getElementById('toast').textContent);
      fail = false;
      if (again) click(tab, again);
      return H.wait(100);
    }).then(function () {
      check('5 Try again: Starting again', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab)]);
      return H.wait(800);
    }).then(function () {
      check('5 Try again: played, line back', tab.toasts().some(function (x) { return /^Playing “Road”/.test(x); }) && !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab), tab.toasts()]);
    });
  });
});

// 6. The device check fails: its usual error line replaces Starting.
tests.push(function () {
  return setup({ stale: true }).then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/devices') return { status: 500, json: { error: { status: 500, message: 'Server error' } }, delay: 300 }; };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('6 Starting during the check', line(tab) === 'Starting “Road”…', line(tab));
      return H.wait(500);
    }).then(function () {
      check('6 line shows the device error', /^Couldn’t check your devices/.test(line(tab)), line(tab));
      check('6 dot off', dot(tab) === 'dot off', dot(tab));
      check('6 nothing played', plays(tab).length === 0, plays(tab).length);
    });
  });
});

// 7. No device open (wait mode): the wait line takes over, the header says Spotify isn't open.
tests.push(function () {
  return setup({ stale: true }).then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/devices') return { status: 200, json: { devices: [] }, delay: 300 }; };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('7 Starting during the check', line(tab) === 'Starting “Road”…', line(tab));
      return H.wait(500);
    }).then(function () {
      check('7 header back to not open', /^Spotify isn’t open on any device/.test(line(tab)) && dot(tab) === 'dot off', [line(tab), dot(tab)]);
      check('7 wait line shown', !d(tab).getElementById('wake').hidden, d(tab).getElementById('wakeText').textContent);
      t.state.wake.running = false;
    });
  });
});

// 8. Spotify says wait (429 on the play): cool-off toast, line back.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/play') return { status: 429, headers: { 'retry-after': '30' }, json: { error: { status: 429, message: 'Too many' } }, delay: 300 }; };
    t.onItemClick(item('Road', 't9'), t.NOEV);
    return H.wait(100).then(function () {
      check('8 Starting while in flight', line(tab) === 'Starting “Road”…', line(tab));
      return H.wait(500);
    }).then(function () {
      check('8 a toast after the 429', tab.toasts().length >= 1, tab.toasts());
      check('8 line back', !/^Starting/.test(line(tab)) && dot(tab) !== 'dot pulse', [line(tab), dot(tab)]);
    });
  });
});

// 9. Shortcut play (#44: a fake event with noTap) and a detail page's Play button (a real tap) both show the line.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/play') return { status: 204, delay: 400 }; };
    t.onItemClick(item('Pinned', 'p9'), { preventDefault: function () {}, noTap: true });
    return H.wait(100).then(function () {
      check('9 shortcut play: Starting', line(tab) === 'Starting “Pinned”…', line(tab));
      return H.wait(500);
    }).then(function () {
      check('9 shortcut play: line back', !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
      t.setFilter('playlists');
      return H.wait(200);
    }).then(function () {
      var row = [].filter.call(d(tab).querySelectorAll('#main a.item, #main li a'), function (a) { return /Road/.test(a.textContent); })[0];
      if (row) click(tab, row);
      return H.wait(300);
    }).then(function () {
      var playBtn = [].filter.call(d(tab).querySelectorAll('#main a.btn'), function (x) { return x.textContent === 'Play'; })[0];
      check('9 detail Play button found', !!playBtn, d(tab).getElementById('main').textContent.slice(0, 200));
      t.state.deviceAt = Date.now();   // opening the detail may have checked; keep the device fresh
      if (playBtn) click(tab, playBtn);
      return H.wait(100);
    }).then(function () {
      check('9 detail Play: Starting “Road”…', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab)]);
      return H.wait(500);
    }).then(function () {
      check('9 detail Play: line back', !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
    });
  });
});

// 10. A tap that opens or waits for Spotify right away (no device known) ends an older tap's line at once.
tests.push(function () {
  return setup({ stale: true }).then(function (tab) {
    var t = tab.t();
    tab.env.r = function (m, p) { if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] }, delay: 600 }; };
    t.onItemClick(item('First', 'a1'), t.NOEV);
    return H.wait(100).then(function () {
      check('10 first tap: Starting', line(tab) === 'Starting “First”…', line(tab));
      t.state.device = null; t.state.deviceError = ''; t.state.devicesAt = Date.now(); t.state.deviceAt = 0;   // a check just found nothing open
      t.onItemClick(item('Second', 'b2'), t.NOEV);   // wait mode: waits for Control Center play
      return H.wait(20);
    }).then(function () {
      check('10 second tap waits: no Starting line', !/^Starting/.test(line(tab)) && dot(tab) !== 'dot pulse', [line(tab), dot(tab)]);
      return H.wait(900);
    }).then(function () {
      check('10 first tap ends without bringing its line back', !/^Starting/.test(line(tab)), line(tab));
      check('10 first tap did not play', plays(tab).length === 0, plays(tab).length);
      t.state.wake.running = false;
    });
  });
});

// 11. #54: Play on a whole list while Spotify's Shuffle is on sends Shuffle off first, then the play. The line covers both.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t(), order = [];
    var p = H.song('spotify:track:t1', { playing: false });
    p.shuffle_state = true;
    t.setPlayer(p);
    tab.calls.length = 0; tab.w.__toasts = [];
    tab.env.r = function (m, path, q) {
      if (m === 'PUT' && path === '/me/player/shuffle') { order.push('shuffle?state=' + q.get('state')); return { status: 204, delay: 600 }; }
      if (m === 'PUT' && path === '/me/player/play') { order.push('play'); return { status: 204, delay: 600 }; }
    };
    t.onItemClick({ kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1', name: 'Road', url: 'https://open.spotify.com/playlist/p1' }, t.NOEV);
    return H.wait(100).then(function () {
      check('11 during Shuffle off: Starting “Road”…', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse', [line(tab), dot(tab)]);
      check('11 Shuffle off sent first, play not yet', JSON.stringify(order) === '["shuffle?state=false"]', order);
      return H.wait(800);
    }).then(function () {
      check('11 Shuffle answered, play in flight: still Starting', line(tab) === 'Starting “Road”…' && dot(tab) === 'dot pulse' && JSON.stringify(order) === '["shuffle?state=false","play"]', [line(tab), dot(tab), order]);
      check('11 no toast yet', tab.toasts().length === 0, tab.toasts());
      return H.wait(700);
    }).then(function () {
      check('11 toast after the play', tab.toasts().some(function (x) { return /^Playing “Road” on iPhone/.test(x); }), tab.toasts());
      check('11 line back after the play', !/^Starting/.test(line(tab)) && dot(tab) === 'dot on', [line(tab), dot(tab)]);
    });
  });
});

(function next(i) {
  if (i >= tests.length) {
    results.forEach(function (r) { console.log(r); });
    process.exit(results.some(function (r) { return /^FAIL/.test(r); }) ? 1 : 0);
    return;
  }
  Promise.resolve().then(tests[i]).catch(function (e) { results.push('ERROR test ' + (i + 1) + ': ' + (e && e.stack || e)); }).then(function () { next(i + 1); });
})(0);
