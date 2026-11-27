'use strict';
// Mark as played / unplayed on this phone (v2.21) tests: jsdom, mocked fetch, shared localStorage.
// Run: node tests/run.js <suite name>  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var DAY = 86400000;
function isoDaysAgo(n) { return new Date(Date.now() - n * DAY).toISOString().slice(0, 10); }
var SHOW = { id: 's1', name: 'Money Show', uri: 'spotify:show:s1', images: [], total_episodes: 4, publisher: 'P' };
// Latest cache rows (as mapLatest stores them): e1 new and unplayed, e2 in progress, e3 played, e4 older and unplayed.
function latestItems() {
  return [
    { id: 'e1', uri: 'spotify:episode:e1', name: 'Newest one', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(1), durMs: 3600000, positionMs: 0, played: false },
    { id: 'e2', uri: 'spotify:episode:e2', name: 'Half done', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(3), durMs: 3600000, positionMs: 1200000, played: false },
    { id: 'e3', uri: 'spotify:episode:e3', name: 'Finished', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(10), durMs: 3600000, positionMs: 0, played: true },
    { id: 'e4', uri: 'spotify:episode:e4', name: 'Older one', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(20), durMs: 3600000, positionMs: 0, played: false }
  ];
}
function spEpisode(id, opts) {   // a Spotify episode object
  opts = opts || {};
  return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: opts.name || ('Episode ' + id), release_date: opts.date || isoDaysAgo(2),
    duration_ms: 3600000, images: [], show: { id: 's1', name: 'Money Show', images: [] }, description: 'Notes ' + id,
    resume_point: { fully_played: !!opts.played, resume_position_ms: opts.pos || 0 } };
}
function playerFor(ep, playing, pos) {
  return { item: ep, currently_playing_type: 'episode', context: null, is_playing: playing !== false, progress_ms: pos || 60000,
    device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function store0(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-latest', JSON.stringify({ at: Date.now() - 60000, items: latestItems(), failed: 0, newest: { s1: isoDaysAgo(1) }, asked: 1 }));
  s.setItem('lib-filter', JSON.stringify(opts.filter || 'podcasts'));
  if (opts.marks) s.setItem('lib-ep-marks', typeof opts.marks === 'string' ? opts.marks : JSON.stringify(opts.marks));
  return s;
}
function setup(store, opts) {
  opts = opts || {};
  var env = { player: opts.player || null, script: opts.script || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === path && (!s.q || s.q(q))) { s.used = true; return { status: s.status, json: s.json }; }
    }
    if (path === '/me/shows' && method === 'GET') return { status: 200, json: { items: [{ show: SHOW }], next: null, total: 1 } };
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: env.noDevice ? [] : [DEV] } };
    if (path === '/me/library/contains' || path === '/me/episodes/contains') return { status: 200, json: [] };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (opts.setPlayer) { t.setPlayer(JSON.parse(JSON.stringify(opts.setPlayer))); t.state.playerAt = Date.now(); }
    if (opts.filter && opts.filter !== 'podcasts') t.setFilter(opts.filter);
    t.renderList();
    return H.wait(100);
  }).then(function () {
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function q(tab, sel) { return d(tab).querySelector(sel); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function clUris(tab) { return qa(tab, 'ul.cl li[data-puri]').map(function (li) { return li.getAttribute('data-puri'); }); }
function listRow(tab, id) { return q(tab, 'ul.list li[data-puri="spotify:episode:' + id + '"]'); }
function rowSub(tab, id) { var r = listRow(tab, id); return r ? r.querySelector('.sub').textContent : null; }
// v2.45: Episode notes moved from its own row button into the row's ⋯ menu: open the menu, return its Notes row.
function menuNotes(tab, more) { if (!more) return null; click(tab, more); return q(tab, '#rmList [data-act="notes"]'); }
function notesBtn(tab, id) { return menuNotes(tab, q(tab, 'ul.list li[data-puri="spotify:episode:' + id + '"] button.more')); }
function markBtn(tab) { return q(tab, '#notesMark'); }
function marks(store) { try { return JSON.parse(store.getItem('lib-ep-marks') || 'null'); } catch (e) { return 'bad'; } }
function playNewest(tab) { return qa(tab, '.lbar a.btn')[0]; }
function hideChip(tab) { return q(tab, '.lbar .chip'); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function toastBtn(tab) { var t = q(tab, '#toast'); return t && !t.hidden ? t.querySelector('.toastbtn') : null; }

var tests = [];

// 1. Baseline: Spotify's own state shows as before.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    check('1 Continue listening has the started episode', JSON.stringify(clUris(tab)) === '["spotify:episode:e2"]', clUris(tab));
    check('1 Play newest points at e1', /Newest one/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab) && playNewest(tab).getAttribute('aria-label'));
    check('1 e1 has the green dot', !!listRow(tab, 'e1').querySelector('.newdot'));
    check('1 e3 says Played', /Played$/.test(rowSub(tab, 'e3')), rowSub(tab, 'e3'));
    check('1 card has a Mark as played button', !!q(tab, 'ul.cl li[data-puri="spotify:episode:e2"] button.clmark[aria-label="Mark “Half done” as played"]'));
  });
});

// 2. Notes sheet: Mark as played hides e2 from Continue listening, flips the label, toast with Undo, zero requests.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, notesBtn(tab, 'e2'));
    check('2 sheet open with Mark as played', !q(tab, '#notes').hidden && markBtn(tab).textContent === 'Mark as played', markBtn(tab).textContent);
    var note = q(tab, '#notesMarkNote');
    check('2 limit shown plainly near the button', !note.hidden && note.textContent === 'Only on this phone. The Spotify app won’t see it.', note.textContent);
    click(tab, markBtn(tab));
    return H.wait(50).then(function () {
      check('2 label flips to Mark as unplayed', markBtn(tab).textContent === 'Mark as unplayed', markBtn(tab).textContent);
      check('2 gone from Continue listening', clUris(tab).indexOf('spotify:episode:e2') === -1, clUris(tab));
      check('2 not in continueItems', t.continueItems().every(function (i) { return i.uri !== 'spotify:episode:e2'; }));
      check('2 row says Played', /Played$/.test(rowSub(tab, 'e2')), rowSub(tab, 'e2'));
      var m = marks(store);
      check('2 stored in lib-ep-marks', m && m['spotify:episode:e2'] && m['spotify:episode:e2'].played === true && typeof m['spotify:episode:e2'].at === 'number', m);
      check('2 not playing: no position stored', m && m['spotify:episode:e2'] && !('pos' in m['spotify:episode:e2']), m);
      check('2 toast says on this phone', /Marked “Half done” as played on this phone/.test(lastToast(tab)), tab.toasts());
      check('2 toast has Undo', toastBtn(tab) && toastBtn(tab).textContent === 'Undo');
      check('2 Latest cache keeps Spotify’s state', JSON.parse(store.getItem('lib-latest')).items[1].positionMs === 1200000);
      check('2 zero requests', tab.calls.length === 0, tab.calls);
      click(tab, toastBtn(tab));
      return H.wait(50);
    }).then(function () {
      check('2 Undo brings it back to Continue listening', clUris(tab).indexOf('spotify:episode:e2') !== -1, clUris(tab));
      check('2 Undo removes the mark', !t.markOf('spotify:episode:e2') && !(marks(store) || {})['spotify:episode:e2'], marks(store));
      check('2 Undo flips the label back', markBtn(tab).textContent === 'Mark as played', markBtn(tab).textContent);
      check('2 Undo: zero requests', tab.calls.length === 0, tab.calls);
    });
  });
});

// 3. Continue listening card button; Hide played lists (Latest and Home) leave it out.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, q(tab, 'ul.cl li[data-puri="spotify:episode:e2"] button.clmark'));
    return H.wait(50).then(function () {
      check('3 card button marks it played', t.markOf('spotify:episode:e2') && t.markOf('spotify:episode:e2').played === true);
      check('3 card gone (row hidden when empty)', !q(tab, 'ul.cl'), clUris(tab));
      check('3 button did not play', tab.calls.filter(function (c) { return /\/me\/player\/play/.test(c.path); }).length === 0, tab.calls);
      click(tab, hideChip(tab));
      return H.wait(50);
    }).then(function () {
      check('3 Hide played on Latest leaves e2 and e3 out', !listRow(tab, 'e2') && !listRow(tab, 'e3') && !!listRow(tab, 'e1') && !!listRow(tab, 'e4'));
      t.setFilter('home');
      t.renderList();
      return H.wait(50);
    }).then(function () {
      check('3 Hide played on Home leaves e2 out', !listRow(tab, 'e2') && !!listRow(tab, 'e1'), qa(tab, 'ul.list li[data-puri]').map(function (l) { return l.getAttribute('data-puri'); }));
      check('3 Home has no Continue listening card for it', clUris(tab).indexOf('spotify:episode:e2') === -1);
      check('3 marking and redrawing: zero requests', tab.calls.length === 0, tab.calls);
    });
  });
});

// 4. Play newest skips a marked episode; the green dot goes; a podcast's Play skips it too.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.toggleMark(t.notesEp(t.latestItem(latestItems()[0])));
    return H.wait(50).then(function () {
      var pn = playNewest(tab);
      check('4 Play newest skips e1 to e2', /Half done/.test(pn.getAttribute('aria-label')), pn.getAttribute('aria-label'));
      check('4 green dot gone from e1', !listRow(tab, 'e1').querySelector('.newdot') && /Played$/.test(rowSub(tab, 'e1')), rowSub(tab, 'e1'));
      t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
      return H.wait(50);
    }).then(function () {
      check('4 Play newest then skips to e4', /Older one/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
      tab.calls.length = 0;
      click(tab, playNewest(tab));
      return H.wait(300);
    }).then(function () {
      var plays = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
      check('4 Play newest plays e4 through the play path', plays.length === 1 && plays[0].body && JSON.stringify(plays[0].body).indexOf('spotify:episode:e4') !== -1, tab.calls);
      // A podcast's Play (firstUnplayed) over mapped rows.
      var rows = [spEpisode('p1'), spEpisode('p2'), spEpisode('p3', { played: true })].map(function (e) { return t.mapEpisode(e, false); });
      check('4 firstUnplayed before marks', t.firstUnplayed(rows).id === 'p1');
      t.writeMark('spotify:episode:p1', { played: true, at: Date.now() });
      check('4 firstUnplayed skips a marked one', t.firstUnplayed(rows).id === 'p2', t.firstUnplayed(rows).id);
      t.writeMark('spotify:episode:p3', { played: false, at: Date.now() });
      t.writeMark('spotify:episode:p2', { played: true, at: Date.now() });
      check('4 unplayed mark on a Spotify-played one counts', t.firstUnplayed(rows).id === 'p3', t.firstUnplayed(rows).id);
    });
  });
});

// 5. Mark as unplayed: a Spotify-played episode shows unplayed; an in-progress one comes back to Continue listening.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, hideChip(tab));   // Hide played on
    click(tab, notesBtn(tab, 'e1'));
    check('5 e3 hidden by Hide played', !listRow(tab, 'e3'));
    t.closeNotes();
    click(tab, hideChip(tab));   // off again, to reach e3's notes
    click(tab, notesBtn(tab, 'e3'));
    check('5 e3 sheet offers Mark as unplayed', markBtn(tab).textContent === 'Mark as unplayed', markBtn(tab).textContent);
    click(tab, markBtn(tab));
    t.closeNotes();
    click(tab, hideChip(tab));   // Hide played on again
    return H.wait(50).then(function () {
      check('5 e3 shows with Hide played on', !!listRow(tab, 'e3') && !/Played/.test(rowSub(tab, 'e3')), rowSub(tab, 'e3'));
      check('5 e3 not in Continue listening (no position)', clUris(tab).indexOf('spotify:episode:e3') === -1);
      check('5 stored as played false', marks(store)['spotify:episode:e3'].played === false, marks(store));
      // e2: mark played, then unplayed: back in Continue listening at its old spot.
      t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
      check('5 e2 out after Mark as played', clUris(tab).indexOf('spotify:episode:e2') === -1);
      t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
      return H.wait(50);
    }).then(function () {
      check('5 Mark as unplayed brings e2 back', clUris(tab).indexOf('spotify:episode:e2') !== -1, clUris(tab));
      var it = t.continueItems().filter(function (i) { return i.uri === 'spotify:episode:e2'; })[0];
      check('5 resumes from the old position', it && it.positionMs === 1200000, it);
      check('5 toast says unplayed', /as unplayed on this phone/.test(lastToast(tab)), tab.toasts());
      check('5 zero requests', tab.calls.length === 0, tab.calls);
    });
  });
});

// 6. A later play the page sees clears the mark; an older answer or a paused one doesn't.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
    var at = t.markOf('spotify:episode:e2').at;
    var ep = spEpisode('e2', { name: 'Half done', pos: 1200000 });
    t.setPlayer(playerFor(ep, true, 1210000), { at: at - 5000, fromCache: true });   // an answer from before the mark
    check('6 older answer keeps the mark', !!t.markOf('spotify:episode:e2'));
    t.setPlayer(playerFor(ep, false, 1210000), { at: at + 1000 });   // paused
    check('6 paused answer keeps the mark', !!t.markOf('spotify:episode:e2'));
    t.setPlayer(playerFor(ep, true, 1215000), { at: at + 2000 });   // playing after the mark
    return H.wait(50).then(function () {
      check('6 playing after the mark clears it', !t.markOf('spotify:episode:e2') && !(marks(store) || {})['spotify:episode:e2'], marks(store));
      check('6 back in Continue listening', clUris(tab).indexOf('spotify:episode:e2') !== -1, clUris(tab));
      var reqs = tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); });
      check('6 no non-player requests', reqs.length === 0, reqs);
    });
  });
});

// 7. Marked while it plays (from Now Playing's notes): only a play 30 s+ away clears it.
tests.push(function () {
  var store = store0();
  var ep = spEpisode('e2', { name: 'Half done', pos: 1200000 });
  return setup(store, { setPlayer: playerFor(ep, true, 1300000) }).then(function (tab) {
    var t = tab.t();
    t.state.playerAt = Date.now();
    t.openNotes(t.notesEp(t.state.player.item), null);
    check('7 Now Playing sheet offers Mark as played', markBtn(tab).textContent === 'Mark as played', markBtn(tab).textContent);
    click(tab, markBtn(tab));
    var m = t.markOf('spotify:episode:e2');
    check('7 position stored', m && Math.abs(m.pos - 1300000) < 2000, m);
    return H.wait(20).then(function () {
      t.setPlayer(playerFor(ep, true, 1310000), { at: Date.now() });
      check('7 next check 10 s on keeps the mark', !!t.markOf('spotify:episode:e2'));
      t.setPlayer(playerFor(ep, true, 1340000), { at: Date.now() });
      check('7 40 s on clears it', !t.markOf('spotify:episode:e2'));
      check('7 sheet label follows', markBtn(tab).textContent === 'Mark as played', markBtn(tab).textContent);
    });
  });
});

// 8. A tap on this page that plays the episode clears its mark (through the usual play path).
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.toggleMark({ uri: 'spotify:episode:e3', name: 'Finished', sp: true });   // unplayed
    check('8 e3 marked unplayed', t.markOf('spotify:episode:e3').played === false);
    click(tab, listRow(tab, 'e3').querySelector('a.item'));
    return H.wait(400).then(function () {
      var plays = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
      check('8 played once', plays.length === 1, tab.calls);
      check('8 tap clears the mark', !t.markOf('spotify:episode:e3'), marks(store));
    });
  });
});

// 9. Asleep (no live player) and no device: marking still works, nothing sent.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.setPlayer(null);
    tab.env.noDevice = true;
    t.state.device = null;
    tab.calls.length = 0;
    t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
    return H.wait(50).then(function () {
      check('9 marked with no device', t.markOf('spotify:episode:e2').played === true);
      check('9 nothing sent', tab.calls.length === 0, tab.calls);
    });
  });
});

// 10. Caps and aging: 400 newest kept, entries older than 180 days and broken ones dropped.
tests.push(function () {
  var now = Date.now(), m = {};
  for (var i = 0; i < 450; i++) m['spotify:episode:c' + i] = { played: i % 2 === 0, at: now - i * 60000 };
  m['spotify:episode:old'] = { played: true, at: now - 181 * DAY };
  m['spotify:episode:bad'] = { played: 'yes', at: now };
  m['spotify:track:t1'] = { played: true, at: now };
  m['spotify:episode:future'] = { played: true, at: now + 10 * DAY };
  var store = store0({ marks: m });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('10 old mark ignored', !t.markOf('spotify:episode:old'));
    check('10 broken mark ignored', !t.markOf('spotify:episode:bad') && !t.markOf('spotify:episode:future'));
    check('10 count capped in memory', t.markCount() === t.MARKS_MAX, t.markCount());
    check('10 newest kept, oldest over the cap dropped', !!t.markOf('spotify:episode:c0') && !!t.markOf('spotify:episode:c399') && !t.markOf('spotify:episode:c400'));
    t.writeMark('spotify:episode:new', { played: true, at: Date.now() });
    var s = marks(store), keys = Object.keys(s);
    check('10 storage capped at 400', keys.length === 400, keys.length);
    check('10 new one kept, c399 pushed out', !!s['spotify:episode:new'] && !s['spotify:episode:c399'] && !!s['spotify:episode:c398']);
    check('10 aged and broken ones not written back', !s['spotify:episode:old'] && !s['spotify:episode:bad'] && !s['spotify:track:t1'] && !s['spotify:episode:future']);
    check('10 limits are 400 and 180 days', t.MARKS_MAX === 400 && t.MARKS_MS === 180 * DAY);
  });
});

// 11. A mark that ages out while the page is open stops counting.
tests.push(function () {
  var store = store0({ marks: { 'spotify:episode:e2': { played: true, at: Date.now() - 180 * DAY + 300 } } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    return H.wait(400).then(function () {
      check('11 aged mark stops counting', !t.markOf('spotify:episode:e2') && t.continueItems().some(function (i) { return i.uri === 'spotify:episode:e2'; }));
    });
  });
});

// 12. Broken storage value, and storage that refuses writes.
tests.push(function () {
  var store = store0({ marks: '[1,2,3]' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('12 array in storage: no marks, no crash', t.markCount() === 0 && clUris(tab).length === 1);
    store.setItem = function () { throw new Error('QuotaExceeded'); };
    t.toggleMark({ uri: 'spotify:episode:e2', name: 'Half done', sp: false });
    return H.wait(50).then(function () {
      check('12 refused write: mark still works this visit', !!t.markOf('spotify:episode:e2') && clUris(tab).indexOf('spotify:episode:e2') === -1, clUris(tab));
    });
  });
});

// 13. Podcast history rows (Recent) and a podcast's list follow the mark; the open list redraws.
tests.push(function () {
  var store = store0();
  var eps = [spEpisode('d1', { name: 'Show ep 1' }), spEpisode('d2', { name: 'Show ep 2', pos: 600000 }), spEpisode('d3', { name: 'Show ep 3', played: true })];
  return setup(store, { script: [{ m: 'GET', path: '/shows/s2/episodes', status: 200, json: { items: eps, next: null, total: 3 } }] }).then(function (tab) {
    var t = tab.t();
    var hr = t.histRow({ uri: 'spotify:episode:h1', id: 'h1', name: 'Heard', show: { id: 's1', name: 'Money Show', images: [] }, duration_ms: 3600000, positionMs: 600000, played: false, at: Date.now() - 60000 });
    check('13 history row before', !hr.played && /min left$/.test(hr.sub), hr.sub);
    t.writeMark('spotify:episode:h1', { played: true, at: Date.now() });
    hr = t.histRow({ uri: 'spotify:episode:h1', id: 'h1', name: 'Heard', show: { id: 's1', name: 'Money Show', images: [] }, duration_ms: 3600000, positionMs: 600000, played: false, at: Date.now() - 60000 });
    check('13 history row says Played', hr.played && /Played$/.test(hr.sub) && hr.positionMs === 0, hr.sub);
    t.openDetail({ kind: 'show', id: 's2', uri: 'spotify:show:s2', name: 'Other Show', url: 'https://open.spotify.com/show/s2', img: '' });
    return H.wait(500).then(function () {
      var gets = tab.calls.filter(function (c) { return c.path === '/shows/s2/episodes'; });
      check('13 podcast list asked once on open', gets.length === 1, tab.calls);
      tab.calls.length = 0;
      var nb = menuNotes(tab, q(tab, '#dlist li[data-puri="spotify:episode:d1"] button.more'));
      click(tab, nb);
      click(tab, markBtn(tab));
      return H.wait(50);
    }).then(function () {
      var sub = q(tab, '#dlist li[data-puri="spotify:episode:d1"] .sub').textContent;
      check('13 podcast list row redrawn as Played', /Played$/.test(sub), sub);
      check('13 podcast Play now skips d1', t.firstUnplayed(t.state.detail.items).id === 'd2');
      check('13 marking in a podcast list: zero requests', tab.calls.length === 0, tab.calls);
      var saved = store.getItem('lib-cache-show:s2') || '';
      check('13 saved podcast copy keeps Spotify’s state', saved.indexOf('"fully_played":false') !== -1 && saved.indexOf('d1') !== -1, saved.slice(0, 300));
    });
  });
});

// 14. Diagnostics shows the count.
tests.push(function () {
  var store = store0({ marks: { 'spotify:episode:e2': { played: true, at: Date.now() }, 'spotify:episode:e3': { played: false, at: Date.now() } } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDiag();
    return H.wait(300).then(function () {
      var txt = q(tab, '#diag').textContent;
      check('14 Diagnostics lists the mark count', /Marked played or unplayed on this phone: 2/.test(txt), txt.slice(0, 200));
    });
  });
});

// 15. Search results and Saved episodes rows (mapEpisode) follow marks made later.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    var row = t.mapEpisode(spEpisode('x1', { pos: 300000 }), false);
    check('15 mapped row in progress', !row.played && row.positionMs === 300000);
    t.writeMark('spotify:episode:x1', { played: true, at: Date.now() });
    var li = t.itemRow(row);
    check('15 drawn row follows a later mark', row.played && /Played$/.test(li.querySelector('.sub').textContent), li.querySelector('.sub').textContent);
    t.writeMark('spotify:episode:x1', null);
    li = t.itemRow(row);
    check('15 cleared mark restores the row', !row.played && row.positionMs === 300000 && /min left$/.test(li.querySelector('.sub').textContent), li.querySelector('.sub').textContent);
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
