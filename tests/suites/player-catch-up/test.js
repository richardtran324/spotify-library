'use strict';
// smooth/player-catch-up: the bar and Now Playing catch up with Spotify sooner.
// PLAYER-2 end-of-song check with Now Playing closed; PLAYER-3 Next/Previous show 0:00 and dim at once
// (not when Spotify disallows skipping); PLAYER-4 a seek waits for Spotify to show the new spot;
// PLAYER-7 one device switch at a time, row busy meanwhile.
var H = require('./harness');
if (process.argv[2]) process.env.SRC = process.argv[2];
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
var DEV_A = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var DEV_B = { id: 'B', name: 'Computer', type: 'Computer', is_active: false, volume_percent: 70 };
function player(o) {
  o = o || {};
  var p = { item: { type: 'track', id: o.id || 't1', uri: 'spotify:track:' + (o.id || 't1'), name: o.name || 'Song One', duration_ms: o.dur || 240000,
      album: { id: 'a1', name: 'Album', images: [], uri: 'spotify:album:a1' }, artists: [{ name: 'Artist' }] },
    context: { type: 'album', uri: 'spotify:album:a1' }, is_playing: o.playing !== false, progress_ms: o.pos != null ? o.pos : 60000,
    device: clone(DEV_A), shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
  if (o.disallows) p.actions = { disallows: o.disallows };
  return p;
}
// env.player: answer (or function) for GET /me/player; env.delay: answer time; env.cmd(method, path, q): optional override
function setup(env) {
  var tab = H.makeTab(H.seedStore(), function (m, p, q, body, call) {
    call.body = body;
    var dl = env.delay || 0;
    if (env.cmd) { var r = env.cmd(m, p, q); if (r) { if (r.delay == null) r.delay = dl; return r; } }
    if (p === '/me/player' && m === 'GET') { var pl = typeof env.player === 'function' ? env.player() : env.player; return pl ? { status: 200, json: clone(pl), delay: dl } : { status: 204, delay: dl }; }
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV_A, DEV_B] }, delay: dl };
    if ((m === 'PUT' || m === 'POST') && /^\/me\/player/.test(p)) return { status: 204, delay: dl };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = clone(DEV_A); t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    tab.calls.length = 0; tab.w.__toasts = [];
    return tab;
  });
}
function gets(tab, since) { return tab.calls.filter(function (c) { return c.method === 'GET' && c.path === '/me/player' && c.t >= (since || 0); }).map(function (c) { return c.t - (since || 0); }); }
function $(tab, id) { return tab.w.document.getElementById(id); }

var tests = [];

// 1. PLAYER-2: 2 s left, Now Playing closed: one check about 1.5 s after the end, and the bar shows the next song.
tests.push(function () {
  var env = { player: player({ pos: 238000 }), delay: 50 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.pollPlayer();
    return H.wait(200).then(function () {
      check('1 setup: Now Playing closed, Song One on the bar', $(tab, 'np').hidden && $(tab, 'pTitle').textContent === 'Song One');
      env.player = player({ id: 't2', name: 'Song Two', pos: 0 });
      var t0 = Date.now();
      return H.wait(4500).then(function () {
        var g = gets(tab, t0);
        check('1 one early check between +2.5 and +4 s', g.length === 1 && g[0] >= 2500 && g[0] <= 4000, g);
        check('1 bar shows the next song', $(tab, 'pTitle').textContent === 'Song Two', $(tab, 'pTitle').textContent);
        tab.w.close();
      });
    });
  });
});
// 2. PLAYER-2: the end check still shows the old song (Spotify late): no second early check.
tests.push(function () {
  var env = { player: player({ pos: 238000 }), delay: 50 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.pollPlayer();
    return H.wait(200).then(function () {
      env.player = player({ pos: 240000 });   // still Song One, at its end
      var t0 = Date.now();
      return H.wait(7000).then(function () {
        var g = gets(tab, t0);
        check('2 only the one early check in 7 s (no loop)', g.length === 1, g);
        check('2 a regular check is scheduled', !!t.state.pollTimer);
        tab.w.close();
      });
    });
  });
});
// 3. PLAYER-2: paused, or asleep: no extra checks.
tests.push(function () {
  var env = { player: player({ pos: 238000, playing: false }), delay: 50 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.pollPlayer();
    return H.wait(200).then(function () {
      var t0 = Date.now();
      return H.wait(4500).then(function () {
        check('3 paused with 2 s left: no check in 4.5 s', gets(tab, t0).length === 0, gets(tab, t0));
        tab.w.close();
      });
    });
  });
});
tests.push(function () {
  var env = { player: null, delay: 50 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 238000 }));   // was playing ...
    t.goIdle(238000);                         // ... Spotify fell asleep
    t.pollPlayer();
    return H.wait(200).then(function () {
      var t0 = Date.now();
      return H.wait(4500).then(function () {
        check('3 asleep: no early check in 4.5 s', t.state.playerIdle && gets(tab, t0).length === 0, { idle: t.state.playerIdle, g: gets(tab, t0) });
        tab.w.close();
      });
    });
  });
});
// 4. PLAYER-2: a pause and resume before the end don't use up the end check.
tests.push(function () {
  var env = { player: player({ pos: 236000 }), delay: 50 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.pollPlayer();
    return H.wait(200).then(function () {
      env.player = player({ pos: 236300, playing: false });
      t.togglePlay();   // pause
      return H.wait(900);
    }).then(function () {
      check('4 paused', t.state.player.is_playing === false, t.state.player.is_playing);
      env.player = player({ pos: 236300 });
      t.togglePlay();   // resume (Spotify plays at once in this test)
      return H.wait(900);
    }).then(function () {
      check('4 playing again', t.state.player.is_playing === true && !t.state.playerIdle, t.state.player.is_playing);
      env.player = player({ id: 't2', name: 'Song Two', pos: 0 });
      var t0 = Date.now();
      return H.wait(5500).then(function () {
        var g = gets(tab, t0);
        check('4 early check still comes after the resume', g.length === 1 && g[0] <= 5000, { g: g, calls: tab.calls.map(function (c) { return c.method + ' ' + c.path; }) });
        check('4 bar shows the next song', $(tab, 'pTitle').textContent === 'Song Two', $(tab, 'pTitle').textContent);
        tab.w.close();
      });
    });
  });
});

// 5. PLAYER-3: Next shows 0:00 and dims at once; the answer ends the dim.
['Next', 'Prev'].forEach(function (btn) {
  tests.push(function () {
    var env = { player: player({ pos: 60000 }), delay: 300 };
    return setup(env).then(function (tab) {
      var t = tab.t();
      t.setPlayer(player({ pos: 60000 })); t.openNp();
      env.player = player({ id: 't2', name: 'Song Two', pos: 0 });
      $(tab, 'p' + btn).click();
      var n = btn === 'Next' ? 'next' : 'previous';
      check('5 ' + btn + ': time reads 0:00 at once', $(tab, 'npElapsed').textContent === '0:00', $(tab, 'npElapsed').textContent);
      check('5 ' + btn + ': bar and Now Playing dimmed', $(tab, 'player').classList.contains('skipping') && $(tab, 'np').classList.contains('skipping'));
      check('5 ' + btn + ': title not guessed', $(tab, 'pTitle').textContent === 'Song One', $(tab, 'pTitle').textContent);
      return H.wait(400).then(function () {
        check('5 ' + btn + ': one POST sent', tab.calls.filter(function (c) { return c.method === 'POST' && c.path === '/me/player/' + n; }).length === 1, tab.calls);
        check('5 ' + btn + ': still dimmed while waiting, time not counting from the old spot', $(tab, 'player').classList.contains('skipping') && /^0:0[01]$/.test($(tab, 'npElapsed').textContent), $(tab, 'npElapsed').textContent);
        return H.wait(1000);
      }).then(function () {
        check('5 ' + btn + ': answer shown, dim gone', $(tab, 'pTitle').textContent === 'Song Two' && !$(tab, 'player').classList.contains('skipping') && !$(tab, 'np').classList.contains('skipping'), { title: $(tab, 'pTitle').textContent, cls: $(tab, 'player').className });
        tab.w.close();
      });
    });
  });
});
// 6. PLAYER-3: Spotify late with the new song: the dim stays through #37's re-checks, then clears.
tests.push(function () {
  var flips = 0;
  var env = { player: function () { return ++flips >= 2 ? player({ id: 't2', name: 'Song Two', pos: 0 }) : player({ pos: 60500 }); }, delay: 100 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 60000 })); t.openNp();
    flips = 0;
    $(tab, 'pNext').click();
    return H.wait(800).then(function () {
      check('6 first check shows the old song: still 0:00 and dimmed', $(tab, 'player').classList.contains('skipping') && $(tab, 'pTitle').textContent === 'Song One' && /^0:0[01]$/.test($(tab, 'npElapsed').textContent), { cls: $(tab, 'player').className, el: $(tab, 'npElapsed').textContent });
      return H.wait(1500);
    }).then(function () {
      check('6 re-check shows Song Two, dim gone', $(tab, 'pTitle').textContent === 'Song Two' && !$(tab, 'player').classList.contains('skipping'), $(tab, 'pTitle').textContent);
      tab.w.close();
    });
  });
});
// 7. PLAYER-3: a refused Next (403) clears the dim and puts the time back.
tests.push(function () {
  var env = { player: player({ pos: 61000 }), delay: 100, cmd: function (m, p) { if (m === 'POST' && p === '/me/player/next') return { status: 403, json: { error: { status: 403, message: 'Restriction violated' } } }; } };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 60000 })); t.openNp();
    $(tab, 'pNext').click();
    return H.wait(1200).then(function () {
      check('7 refused: dim gone, old song and its time back', !$(tab, 'player').classList.contains('skipping') && $(tab, 'pTitle').textContent === 'Song One' && /^1:0[12]$/.test($(tab, 'npElapsed').textContent), { cls: $(tab, 'player').className, el: $(tab, 'npElapsed').textContent });
      tab.w.close();
    });
  });
});
// 8. PLAYER-3: no answer at all: the dim ends after 4 s.
tests.push(function () {
  var env = { player: player({ pos: 60000 }), delay: 100, cmd: function (m, p) { if (m === 'POST' && p === '/me/player/next') return { status: 204, delay: 6000 }; } };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 60000 }));
    $(tab, 'pNext').click();
    return H.wait(3500).then(function () {
      check('8 still dimmed at 3.5 s', $(tab, 'player').classList.contains('skipping'));
      return H.wait(800);
    }).then(function () {
      check('8 dim ends by 4.3 s with no answer', !$(tab, 'player').classList.contains('skipping'));
      tab.w.close();
    });
  });
});
// 8b. PLAYER-3: Next answered 404 (Spotify asleep): the dim ends and the saved spot is the one from before the tap.
tests.push(function () {
  var env = { player: player({ pos: 60000 }), delay: 100, cmd: function (m, p) { if (m === 'POST' && p === '/me/player/next') return { status: 404, json: { error: { status: 404, message: 'x' } } }; } };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 60000 }));
    env.player = null;
    $(tab, 'pNext').click(); $(tab, 'pNext').click();   // double tap
    return H.wait(1000).then(function () {
      var lp = JSON.parse(tab.w.localStorage.getItem('lib-lastplay') || 'null');
      check('8b asleep, dim gone', t.state.playerIdle && !$(tab, 'player').classList.contains('skipping'), { idle: t.state.playerIdle, cls: $(tab, 'player').className });
      check('8b saved spot is about 1:00, not 0:00', lp && lp.positionMs >= 59000 && lp.positionMs <= 63000, lp && lp.positionMs);
      tab.w.close();
    });
  });
});
// 9. PLAYER-3 with #51: skipping disallowed: nothing changes on screen, the tap is still sent.
tests.push(function () {
  var env = { player: player({ pos: 60000, disallows: { skipping_next: true, skipping_prev: true } }), delay: 300 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ pos: 60000, disallows: { skipping_next: true, skipping_prev: true } })); t.openNp();
    $(tab, 'pNext').click(); $(tab, 'npPrev').click();
    check('9 disallowed: time not reset', $(tab, 'npElapsed').textContent !== '0:00', $(tab, 'npElapsed').textContent);
    check('9 disallowed: not dimmed', !$(tab, 'player').classList.contains('skipping') && !$(tab, 'np').classList.contains('skipping'));
    return H.wait(200).then(function () {
      check('9 disallowed: both taps still sent', tab.calls.filter(function (c) { return c.method === 'POST'; }).length === 2, tab.calls);
      return H.wait(600);
    }).then(function () { tab.w.close(); });
  });
});

// 10. PLAYER-4: Spotify shows a seek 1.5 s late: the time doesn't jump back.
tests.push(function () {
  var lagUntil = 0, target = null;
  var env = { player: function () { var p = player({ id: 'e', pos: 60000 }); if (target != null && Date.now() > lagUntil) p.progress_ms = target; return p; }, delay: 80 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ id: 'e', pos: 60000 })); t.openNp();
    tab.calls.length = 0;
    lagUntil = Date.now() + 1500; target = 200000; t.seekTo(200000);
    var low = Infinity, seen = [], i = 0;
    return new Promise(function (resolve) {
      var iv = setInterval(function () {
        var pos = t.curPos(); low = Math.min(low, pos); seen.push($(tab, 'npElapsed').textContent);
        if (++i >= 12) { clearInterval(iv); resolve(); }
      }, 250);
    }).then(function () {
      check('10 lag: time never goes back below the target minus 2 s', low >= 198000, { low: low, seen: seen });
      check('10 lag: at most 3 checks', gets(tab).length >= 2 && gets(tab).length <= 3, gets(tab));
      tab.w.close();
    });
  });
});
tests.push(function () {
  var env = { player: function () { return player({ id: 'e', pos: 200000 }); }, delay: 80 };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player({ id: 'e', pos: 60000 }));
    tab.calls.length = 0;
    t.seekTo(200000);
    return H.wait(2500).then(function () {
      check('10 no lag: exactly 1 check', gets(tab).length === 1, gets(tab));
      check('10 no lag: shows the new spot', t.curPos() >= 199000, t.curPos());
      tab.w.close();
    });
  });
});

// 11. PLAYER-7: double tap on a device: one switch, row busy meanwhile, one toast.
tests.push(function () {
  var env = { player: player(), delay: 50, cmd: function (m, p) { if (m === 'PUT' && p === '/me/player') return { status: 204, delay: 400 }; } };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player()); t.openSheet();
    return H.wait(400).then(function () {
      tab.calls.length = 0; tab.w.__toasts = [];
      var rows = tab.w.document.querySelectorAll('#devList .devrow');
      rows[1].click();
      return H.wait(120).then(function () {
        var row = tab.w.document.querySelectorAll('#devList .devrow')[1];
        check('11 row busy while switching', row.getAttribute('aria-busy') === 'true', row.getAttribute('aria-busy'));
        row.click();
        t.renderSheet();   // a device refresh re-renders mid-switch
        var row2 = tab.w.document.querySelectorAll('#devList .devrow')[1];
        check('11 re-rendered row keeps the busy look', row2.getAttribute('aria-busy') === 'true', row2.getAttribute('aria-busy'));
        row2.click();
        return H.wait(900);
      }).then(function () {
        var puts = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player'; });
        check('11 one PUT /me/player', puts.length === 1, puts.length);
        check('11 one toast', tab.toasts().length === 1 && tab.toasts()[0] === 'Now using Computer', tab.toasts());
        check('11 no row left busy', !tab.w.document.querySelector('#devList .devrow[aria-busy]'));
        tab.w.close();
      });
    });
  });
});
// 12. PLAYER-7: after a failed switch the row isn't busy and a new tap switches.
tests.push(function () {
  var fails = 1;
  var env = { player: player(), delay: 50, cmd: function (m, p) { if (m === 'PUT' && p === '/me/player') return fails-- > 0 ? { status: 500, json: { error: { status: 500, message: 'x' } }, delay: 200 } : { status: 204, delay: 200 }; } };
  return setup(env).then(function (tab) {
    var t = tab.t();
    t.setPlayer(player()); t.openSheet();
    return H.wait(400).then(function () {
      tab.calls.length = 0; tab.w.__toasts = [];
      tab.w.document.querySelectorAll('#devList .devrow')[1].click();
      return H.wait(600);
    }).then(function () {
      check('12 failed: a toast, row not busy', tab.toasts().length === 1 && /Couldn’t switch to Computer/.test(tab.toasts()[0]) && !tab.w.document.querySelector('#devList .devrow[aria-busy]'), tab.toasts());
      tab.w.document.querySelectorAll('#devList .devrow')[1].click();
      return H.wait(600);
    }).then(function () {
      var puts = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player'; });
      check('12 a new tap switches', puts.length === 2 && tab.toasts().indexOf('Now using Computer') >= 0, { puts: puts.length, toasts: tab.toasts() });
      tab.w.close();
    });
  });
});

tests.reduce(function (p, f) { return p.then(f).catch(function (e) { results.push('ERROR ' + (e && e.stack || e)); }); }, Promise.resolve()).then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('PASS') !== 0; }).length;
  console.log('\n' + (results.length - fails) + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});
