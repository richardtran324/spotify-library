'use strict';
// PODS-1 + PODS-2 + NAV-3: Play newest (Latest) and a podcast's Play wait for the running check for new episodes,
// the rows keep their place when scrolled into the list, and a tap right after the rows moved is ignored.
// Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var HOUR = 3600e3;
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true };
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dayIso(n) { var t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - n); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
function spEp(id, date, sid) {
  var e = { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Ep ' + id, release_date: date, duration_ms: HOUR, images: [], is_playable: true, resume_point: { fully_played: false, resume_position_ms: 0 } };
  if (sid) e.show = { id: sid, name: 'Show ' + sid };
  return e;
}
function lrow(id, sid, days) { return { id: id, uri: 'spotify:episode:' + id, name: 'Ep ' + id, img: '', showId: sid, showName: 'Show ' + sid, date: dayIso(days), durMs: HOUR, positionMs: 0, played: false }; }
function slEp(id, days) { return { id: id, uri: 'spotify:episode:' + id, name: 'Ep ' + id, release_date: dayIso(days), duration_ms: HOUR, images: [], resume_point: { fully_played: false, resume_position_ms: 0 } }; }
function click(tab, node) { var ev = new tab.w.MouseEvent('click', { bubbles: true, cancelable: true }); node.dispatchEvent(ev); return ev; }
function playsOf(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; }).map(function (c) { var b = c.body ? JSON.parse(c.body) : {}; return (b.uris || [])[0] || b.context_uri || ''; }); }
function devFresh(tab) { var t = tab.t(); t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.deviceChecked = true; t.state.devices = [DEV]; t.state.devicesAt = Date.now(); }

// ---- Latest ----
var SHOWS = [{ id: 's1', name: 'Show s1', uri: 'spotify:show:s1', images: [], total_episodes: 6 }, { id: 's2', name: 'Show s2', uri: 'spotify:show:s2', images: [], total_episodes: 6 }];
// opts: epDelay, epStatus, devStatus
function latestTab(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('podcasts'));
  s.setItem('lib-latest', JSON.stringify({ at: Date.now() - 13 * HOUR, items: [lrow('old1', 's1', 2), lrow('old2', 's2', 3)], failed: 0, newest: { s1: dayIso(2), s2: dayIso(3) }, asked: 2 }));
  var tab = H.makeTab(s, function (m, p, q, body, call) {
    call.body = body || null;
    if (p === '/me/player/devices') return { status: 200, delay: opts.devDelay || 0, json: { devices: opts.noDevice ? [] : [DEV] } };
    if (m === 'PUT' && p === '/me/player/play') return { status: 204 };
    if (p === '/me/shows') return { status: 200, json: { items: SHOWS.map(function (x) { return { show: x }; }), next: null, total: 2 } };
    var mm = /^\/shows\/(s\d)\/episodes$/.exec(p);
    if (mm) {
      if (opts.epStatus) return { status: opts.epStatus, delay: opts.epDelay || 1200, json: { error: { status: opts.epStatus, message: 'x' } } };
      return { status: 200, delay: opts.epDelay || 1200, json: { items: mm[1] === 's1' ? [spEp('new1', dayIso(0), 's1'), spEp('old1', dayIso(2), 's1')] : [spEp('old2', dayIso(3), 's2')], next: null, total: 2 } };
    }
  }, { beforeParse: function (w) { w.libNavigate = function (u) { (w.__nav = w.__nav || []).push(u); }; } });
  return H.wait(500).then(function () { if (opts.dev !== false) devFresh(tab); tab.w.__toasts = []; return tab; });
}
function latestRows(tab) { return [].slice.call(tab.w.document.querySelectorAll('#main ul.list li[data-puri]')).map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }); }
function playNewestBtn(tab) { return tab.w.document.querySelector('.lbar a.btn'); }

var tests = [];

// 1. Held, then plays the new newest once.
tests.push(function () {
  return latestTab().then(function (tab) {
    check('1 reload running on open', tab.t().state.latest.loading === true && latestRows(tab).join() === 'old1,old2', latestRows(tab));
    var ev = click(tab, playNewestBtn(tab));
    check('1 link cancelled at once', ev.defaultPrevented === true);
    check('1 toast says it checks', tab.toasts().indexOf('Checking for new episodes…') !== -1, tab.toasts());
    return H.wait(500).then(function () {
      check('1 no play before the answer', playsOf(tab).length === 0, playsOf(tab));
      return H.wait(1500);
    }).then(function () {
      check('1 exactly one play, the new episode', JSON.stringify(playsOf(tab)) === '["spotify:episode:new1"]', playsOf(tab));
      check('1 list has the new episode on top', latestRows(tab)[0] === 'new1', latestRows(tab));
      return H.wait(4000);
    }).then(function () {
      check('1 still one play after the cap', playsOf(tab).length === 1, playsOf(tab));
    });
  });
});
// 2. Reload fails: plays what was held.
tests.push(function () {
  return latestTab({ epStatus: 500 }).then(function (tab) {
    click(tab, playNewestBtn(tab));
    return H.wait(2200).then(function () {
      check('2 failed check: one play of the old newest', JSON.stringify(playsOf(tab)) === '["spotify:episode:old1"]', playsOf(tab));
    });
  });
});
// 3. Device not fresh: no hold, the tap goes on as before (device check, then play before the reload answers).
tests.push(function () {
  return latestTab({ dev: false }).then(function (tab) {
    var t = tab.t(); t.state.device = DEV; t.state.deviceAt = 0;
    click(tab, playNewestBtn(tab));
    check('3 no "Checking for new episodes" toast', tab.toasts().indexOf('Checking for new episodes…') === -1, tab.toasts());
    return H.wait(400).then(function () {
      check('3 device not fresh: plays at once (old path)', JSON.stringify(playsOf(tab)) === '["spotify:episode:old1"]', playsOf(tab));
    });
  });
});
// 4. No device known: wake runs inside the tap.
tests.push(function () {
  return latestTab({ dev: false }).then(function (tab) {
    var t = tab.t(); t.state.device = null; t.state.deviceChecked = true; t.state.deviceError = ''; t.state.devices = []; t.state.devicesAt = Date.now();
    tab.w.localStorage.setItem(t.K.wake, 'link');
    tab.w.__nav = [];
    click(tab, playNewestBtn(tab));
    check('4 no device: Spotify opened within the tap', (tab.w.__nav || []).length === 1 && /open\.spotify\.com\/episode\/old1/.test(tab.w.__nav[0]), tab.w.__nav);
  });
});
// 5. Slow reload: the hold ends at the cap and plays the held pick, once.
tests.push(function () {
  return latestTab({ epDelay: 6500 }).then(function (tab) {
    var cap = tab.t().HOLD_NEW_MS;
    check('5 cap is about 4 s', cap > 0 && cap <= 4500, cap);
    click(tab, playNewestBtn(tab));
    return H.wait(cap - 600).then(function () {
      check('5 nothing before the cap', playsOf(tab).length === 0, playsOf(tab));
      return H.wait(1100);
    }).then(function () {
      check('5 at the cap: plays the held pick', JSON.stringify(playsOf(tab)) === '["spotify:episode:old1"]', playsOf(tab));
      return H.wait(2500);
    }).then(function () {
      check('5 the late answer plays nothing more', playsOf(tab).length === 1, playsOf(tab));
    });
  });
});
// 6. Leaving Latest during the hold drops the play.
tests.push(function () {
  return latestTab().then(function (tab) {
    click(tab, playNewestBtn(tab));
    return H.wait(300).then(function () {
      tab.t().setFilter('home');
      return H.wait(1800);
    }).then(function () {
      check('6 left Latest during the hold: no play', playsOf(tab).length === 0, playsOf(tab));
    });
  });
});
// 7. Another row tapped during the hold: only that row plays.
tests.push(function () {
  return latestTab().then(function (tab) {
    click(tab, playNewestBtn(tab));
    return H.wait(300).then(function () {
      var row = tab.w.document.querySelector('#main ul.list li[data-puri="spotify:episode:old2"] a.item');
      click(tab, row);
      return H.wait(2000);
    }).then(function () {
      check('7 newer tap wins: only old2 plays', JSON.stringify(playsOf(tab)) === '["spotify:episode:old2"]', playsOf(tab));
    });
  });
});

// ---- A podcast's page ----
var SHOW = { kind: 'show', id: 'p1', uri: 'spotify:show:p1', name: 'Pod', url: 'https://open.spotify.com/show/p1', img: '', sub: 'Podcast' };
function showTab(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('home'));
  var tab = H.makeTab(s, function (m, p, q, body, call) {
    call.body = body || null;
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (m === 'PUT' && p === '/me/player/play') return { status: 204 };
    if (p === '/shows/p1/episodes') {
      if (opts.epStatus) return { status: opts.epStatus, delay: opts.epDelay || 1200, json: { error: { status: opts.epStatus, message: 'x' } } };
      return { status: 200, delay: opts.epDelay || 1200, json: { items: (opts.fresh || [spEp('new2', dayIso(0)), spEp('new1', dayIso(1))]).concat([spEp('old1', dayIso(2)), spEp('old0', dayIso(9))]), next: null, total: 4 } };
    }
  }, { beforeParse: opts.beforeParse });
  return H.wait(500).then(function () {
    var t = tab.t();
    devFresh(tab);
    t.slPut(t.SL_SHOW, 'p1', { at: Date.now() - (opts.age || 13 * HOUR), total: 2, items: [slEp('old1', 2), slEp('old0', 9)] }, 40);
    tab.w.__toasts = [];
    return tab;
  });
}
function detRows(tab) { return [].slice.call(tab.w.document.querySelectorAll('#dlist li[data-puri]')).map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }); }
function detPlay(tab) { return tab.w.document.querySelector('.dbtns a.btn'); }

// 8. Play during the 12-hour check: waits, then plays the newest unplayed of the new list.
tests.push(function () {
  return showTab().then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(100).then(function () {
      check('8 opened from the saved copy, checking', detRows(tab).join() === 'old1,old0' && tab.t().state.detail.loading === true, detRows(tab));
      var ev = click(tab, detPlay(tab));
      check('8 link cancelled at once', ev.defaultPrevented === true);
      return H.wait(500);
    }).then(function () {
      check('8 no play before the answer', playsOf(tab).length === 0, playsOf(tab));
      return H.wait(1200);
    }).then(function () {
      check('8 one play, the newest episode', JSON.stringify(playsOf(tab)) === '["spotify:episode:new2"]', playsOf(tab));
      check('8 new rows on top', detRows(tab).join() === 'new2,new1,old1,old0', detRows(tab));
    });
  });
});
// 9. Back during the hold drops the play.
tests.push(function () {
  return showTab().then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(100).then(function () {
      click(tab, detPlay(tab));
      return H.wait(200);
    }).then(function () {
      tab.t().goBack();
      return H.wait(1600);
    }).then(function () {
      check('9 Back during the hold: no play', playsOf(tab).length === 0, playsOf(tab));
    });
  });
});
// 10. The check fails: plays the saved copy's pick.
tests.push(function () {
  return showTab({ epStatus: 500 }).then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(100).then(function () {
      click(tab, detPlay(tab));
      return H.wait(1700);
    }).then(function () {
      check('10 failed check: one play of the saved pick', JSON.stringify(playsOf(tab)) === '["spotify:episode:old1"]', playsOf(tab));
    });
  });
});
// 11. A fresh copy (no check running): plays at once, as before.
tests.push(function () {
  return showTab({ age: HOUR }).then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(100).then(function () {
      check('11 fresh copy: no check', !tab.t().state.detail.loading, tab.t().state.detail.loading);
      click(tab, detPlay(tab));
      return H.wait(200);
    }).then(function () {
      check('11 fresh copy: plays at once', JSON.stringify(playsOf(tab)) === '["spotify:episode:old1"]', playsOf(tab));
      check('11 no checking toast', tab.toasts().indexOf('Checking for new episodes…') === -1, tab.toasts());
    });
  });
});

// 12. Tap guard: a row tap right after the rows moved is ignored; a later one plays. No guard without a reorder.
tests.push(function () {
  return showTab({ epDelay: 300 }).then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(450).then(function () {
      check('12 rows moved', detRows(tab).join() === 'new2,new1,old1,old0', detRows(tab));
      var ev = click(tab, tab.w.document.querySelector('#dlist li[data-puri="spotify:episode:new1"] a.item'));
      check('12 tap within the guard: link cancelled', ev.defaultPrevented === true);
      return H.wait(150);
    }).then(function () {
      check('12 tap within the guard: no play', playsOf(tab).length === 0, playsOf(tab));
      return H.wait(tab.t().SHIFT_GUARD_MS);
    }).then(function () {
      click(tab, tab.w.document.querySelector('#dlist li[data-puri="spotify:episode:new1"] a.item'));
      return H.wait(200);
    }).then(function () {
      check('12 tap after the guard plays', JSON.stringify(playsOf(tab)) === '["spotify:episode:new1"]', playsOf(tab));
      var t = tab.t();
      t.remapDetail(t.state.detail);   // same rows, same order
      click(tab, tab.w.document.querySelector('#dlist li[data-puri="spotify:episode:old1"] a.item'));
      return H.wait(200);
    }).then(function () {
      check('12 redraw without a reorder sets no guard', playsOf(tab).slice(-1)[0] === 'spotify:episode:old1' && playsOf(tab).length === 2, playsOf(tab));
    });
  });
});

// 13–15. Anchor: a fake layout (header bottom at 100 px, rows 60 px tall starting at 300 px on the page).
function layout(w) {
  w.__y = 0; w.__scrolls = [];
  Object.defineProperty(w, 'pageYOffset', { get: function () { return w.__y; }, configurable: true });
  w.scrollTo = function (x, y) { w.__scrolls.push(y); w.__y = y; };
  var orig = w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect = function () {
    if (this.id === 'top') return { top: 0, bottom: 100, left: 0, right: 400, height: 100, width: 400 };
    if (this.tagName === 'LI' && this.parentNode && this.parentNode.id === 'dlist') {
      var i = [].indexOf.call(this.parentNode.children, this), top = 300 + i * 60 - w.__y;
      return { top: top, bottom: top + 60, left: 0, right: 400, height: 60, width: 400 };
    }
    return orig.call(this);
  };
}
function anchorRun(name, y, extra) {
  return showTab({ epDelay: 400, beforeParse: layout }).then(function (tab) {
    tab.t().openDetail(SHOW);
    return H.wait(100).then(function () {
      tab.w.__y = y; tab.w.__scrolls = [];
      if (extra) extra(tab);
      return H.wait(500);
    }).then(function () {
      return { rows: detRows(tab), scrolls: tab.w.__scrolls.slice(), y: tab.w.__y };
    });
  });
}
tests.push(function () {
  // Scrolled so old0 (page top 360) is the first row under the header: 2 rows (120 px) go in above it.
  return anchorRun('13', 300).then(function (r) {
    check('13 scrolled into the list: rows inserted above', r.rows.join() === 'new2,new1,old1,old0', r.rows);
    check('13 scrolled: page moves down by the inserted height', r.y === 420 && r.scrolls.indexOf(420) !== -1, r);
  });
});
tests.push(function () {
  return anchorRun('14', 0).then(function (r) {
    check('14 at the top: no anchor scroll (the new episode shows first)', r.scrolls.filter(function (v) { return v > 0; }).length === 0 && r.y === 0, r);
  });
});
tests.push(function () {
  return anchorRun('15', 300, function (tab) { tab.t().state.detail.kpY = 300; }).then(function (r) {
    check('15 #42 restore pending: no anchor scroll', r.scrolls.indexOf(420) === -1, r);
  });
});

(function run(i) {
  if (i >= tests.length) {
    results.forEach(function (l) { console.log(l); });
    var f = results.filter(function (l) { return /^FAIL/.test(l); }).length;
    console.log((results.length - f) + ' passed, ' + f + ' failed');
    process.exit(f ? 1 : 0);
  }
  Promise.resolve().then(tests[i]).then(function () { run(i + 1); }, function (e) { console.log('ERROR test ' + (i + 1) + ': ' + (e && e.stack || e)); run(i + 1); });
})(0);
