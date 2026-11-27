'use strict';
// In Latest: Priority · Normal · Hidden (v2.44) tests: jsdom, mocked fetch (answers on timers), shared localStorage.
// Run: node tests/run.js latest-priority  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var HOUR = 3600000, MIN = 60000;
var KEY = 'lib-latest-pri';
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dayIso(n) { var t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - n); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
function showObj(k) { return { id: 's' + k, name: 'Show ' + k, uri: 'spotify:show:s' + k, images: [], total_episodes: 5 }; }
function shows(n) { var a = []; for (var k = 1; k <= n; k++) a.push(showObj(k)); return a; }
var SHOWS = shows(14);
function spEp(id, showId, date) {
  return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Episode ' + id, release_date: date, duration_ms: HOUR, images: [],
    show: { id: showId, name: 'Show ' + showId.slice(1), images: [] }, description: '', is_playable: true,
    resume_point: { fully_played: false, resume_position_ms: 0 } };
}
function latestAnswer(k) {
  var items = [];
  for (var j = 0; j < 5; j++) items.push(spEp('e' + k + '-' + j, 's' + k, dayIso((14 - k) + 15 * j)));
  return { items: items, next: null, total: 5 };
}
function lrow(id, showId, days, o) {
  o = o || {};
  return { id: id, uri: 'spotify:episode:' + id, name: 'Episode ' + id, img: '', showId: showId, showName: 'Show ' + showId.slice(1), date: dayIso(days),
    durMs: HOUR, positionMs: o.pos || 0, played: !!o.played };
}
// Newest first: a1 (s1), b1 (s2), a2 (s1), b2 (s2, played), c1 (s3), b3 (s2), d1 (s4), c2 (s3).
function cacheItems() {
  return [lrow('a1', 's1', 0), lrow('b1', 's2', 1), lrow('a2', 's1', 2), lrow('b2', 's2', 3, { played: true }), lrow('c1', 's3', 4),
    lrow('b3', 's2', 5), lrow('d1', 's4', 6), lrow('c2', 's3', 7)];
}
function freshCache() { return { at: Date.now() - 60000, items: cacheItems(), failed: 0, newest: { s1: dayIso(0), s2: dayIso(1), s3: dayIso(4), s4: dayIso(6) }, asked: 4 }; }
function cool(group, ms) {
  var o = {};
  o[group] = { until: Date.now() + (ms || 10 * MIN), reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null,
    last429: { at: Date.now(), reason: 'rate limit', retryAfter: null, what: 'GET /x' } };
  return JSON.stringify(o);
}
function store0(o) {
  o = o || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(o.filter || 'podcasts'));
  if (o.latest !== null) s.setItem('lib-latest', JSON.stringify(o.latest || freshCache()));
  if (o.pri !== undefined) s.setItem(KEY, typeof o.pri === 'string' ? o.pri : JSON.stringify(o.pri));
  if (o.sort) s.setItem('lib-sort-latest', JSON.stringify(o.sort));
  if (o.cool) s.setItem('lib-cooloff', o.cool);
  return s;
}

var LIVE = [];
function idle() { return LIVE.every(function (t) { return t.flight.now === 0; }); }
function settle(ms) {
  var end = Date.now() + 8000;
  function loop() { return H.wait(20).then(function () { return idle() || Date.now() > end ? H.wait(20).then(function () { return idle() || Date.now() > end ? null : loop(); }) : loop(); }); }
  return H.wait(ms).then(loop);
}
function setup(store, opts) {
  opts = opts || {};
  var env = { shows: opts.shows || SHOWS, latest: opts.latest || null };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.q = q;
    var m;
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
    if (/\/contains$/.test(path)) return { status: 200, json: [] };
    if (path === '/me/shows') return { status: 200, json: { items: env.shows.map(function (s) { return { show: s }; }), next: null, total: env.shows.length } };
    if (path === '/me/episodes') return { status: 200, json: { items: [], next: null, total: 0 } };
    if ((m = /^\/shows\/([^/]+)\/episodes$/.exec(path)) && q.get('limit') === '5') {
      var r = env.latest ? env.latest(m[1], q) : null;
      if (r) return r;
      return { status: 200, json: latestAnswer(+m[1].slice(1)), delay: 20 };
    }
  }, opts.tabOpts);
  tab.env = env;
  LIVE.push(tab);
  return settle(opts.wait || 600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    tab.boot = tab.calls.slice();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function close(tab) { LIVE = LIVE.filter(function (t) { return t !== tab; }); tab.w.close(); }
function d(tab) { return tab.w.document; }
function q(tab, sel) { return d(tab).querySelector(sel); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function latestReqs(list) { return list.filter(function (c) { return c.method === 'GET' && /^\/shows\/[^/]+\/episodes$/.test(c.path) && c.q && c.q.get('limit') === '5'; }); }
function catalog(list) { return list.filter(function (c) { return /^\/(shows|episodes|albums|artists|playlists)\//.test(c.path); }); }
function showIdOf(c) { return c.path.split('/')[2]; }
function ids(tab, sel) { return qa(tab, (sel || '#main ul.list') + ' li[data-puri]').map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }); }
function homeIds(tab) { var h = q(tab, '#hLatest'); var ul = h && h.parentNode.nextElementSibling; return ul ? [].slice.call(ul.querySelectorAll('li[data-puri]')).map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }) : []; }
function playNewest(tab) { return q(tab, '.lbar a.btn'); }
function priBtn(tab, v) { return q(tab, '#dlpri [data-lpri="' + v + '"]'); }
function pressed(tab) { return qa(tab, '#dlpri [data-lpri]').filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return b.getAttribute('data-lpri'); }).join(); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function stored(store) { try { return JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { return 'bad'; } }
function emptyText(tab) { var p = q(tab, '#main p.empty'); return p ? p.textContent : ''; }
function showItem(id) { return { kind: 'show', id: id, uri: 'spotify:show:' + id, name: 'Show ' + id.slice(1), url: 'https://open.spotify.com/show/' + id, img: '', sub: 'Podcast' }; }

var tests = [];

// 1. Default: no setting stored, Latest and Home exactly as before; the switch shows Normal.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('1 Latest unchanged with nothing set', ids(tab).join() === 'a1,b1,a2,b2,c1,b3,d1,c2', ids(tab));
    check('1 Play newest is the newest unplayed', /Episode a1$/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
    check('1 nothing stored', store.getItem(KEY) === null);
    check('1 every show is Normal', t.latestPriOf('s1') === 'n' && t.latestPriOf('') === 'n');
    t.openDetail(showItem('s2'));
    return settle(100).then(function () {
      var row = q(tab, '.dhead #dlpri');
      check('1 podcast page header has the switch', !!row && row.querySelector('.lprilbl').textContent === 'In Latest', row && row.textContent);
      var g = row && row.querySelector('.seg.lpri');
      check('1 switch is a labelled group', g && g.getAttribute('role') === 'group' && g.getAttribute('aria-label') === 'In Latest');
      check('1 three choices in order', qa(tab, '#dlpri button').map(function (b) { return b.textContent; }).join() === 'Priority,Normal,Hidden');
      check('1 Normal is selected', pressed(tab) === 'n', pressed(tab));
      check('1 every choice is a button', qa(tab, '#dlpri button').every(function (b) { return b.getAttribute('type') === 'button'; }));
      check('1 opening the page from Latest asked nothing', catalog(tab.calls).length === 0, tab.calls.map(function (c) { return c.path; }));
    });
  });
});

// 2. Only on podcast pages: not on Saved episodes, an album or a playlist. CSS keeps tap targets at 44 px.
tests.push(function () {
  var store = store0({ filter: 'home' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'episodes', name: 'Saved episodes', uri: null, url: 'https://open.spotify.com/collection/your-episodes', sub: 'Podcast · 0 episodes' });
    return settle(80).then(function () {
      check('2 no switch on Saved episodes', !q(tab, '#dlpri') && !!q(tab, '.dhead'));
      t.closeDetail();
      t.openDetail({ kind: 'album', id: 'al1', uri: 'spotify:album:al1', name: 'Album', url: 'https://open.spotify.com/album/al1', img: '', sub: 'Album · X', tracks: null });
      return settle(80);
    }).then(function () {
      check('2 no switch on an album', !q(tab, '#dlpri') && !!q(tab, '.dhead'));
      t.closeDetail();
      t.openDetail({ kind: 'show', id: '', uri: '', name: 'No id', url: '', img: '', sub: 'Podcast' });
      return settle(80);
    }).then(function () {
      check('2 no switch for a podcast without an id', !q(tab, '#dlpri'));
      var css = [].slice.call(d(tab).querySelectorAll('style')).map(function (s) { return s.textContent; }).join('\n');
      check('2 switch buttons are 44 px tall', /\.seg\.lpri button \{[^}]*min-height: 44px/.test(css));
      check('2 switch wraps under its label when space is short', /\.lprirow \{[^}]*flex-wrap: wrap/.test(css));
    });
  });
});

// 3. Tapping a choice: stored, repainted in place (same buttons, focus kept), toast, zero requests; Normal removes it.
tests.push(function () {
  var store = store0({ filter: 'home' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('s2'));
    return settle(80).then(function () {
      tab.calls.length = 0;
      var b = priBtn(tab, 'p');
      b.focus();
      click(tab, b);
      check('3 Priority stored', JSON.stringify(stored(store)) === '{"s2":"p"}', stored(store));
      check('3 Priority selected', pressed(tab) === 'p', pressed(tab));
      check('3 same button keeps focus', priBtn(tab, 'p') === b && d(tab).activeElement === b);
      check('3 toast says it applies now and how to get missing episodes', lastToast(tab) === '“Show 2” now comes first in Latest. If its newest episodes aren’t there yet, tap Refresh in Latest.', tab.toasts());
      click(tab, priBtn(tab, 'p'));
      check('3 tapping the selected one again does nothing', tab.toasts().length === 1, tab.toasts());
      click(tab, priBtn(tab, 'h'));
      check('3 Hidden stored', JSON.stringify(stored(store)) === '{"s2":"h"}' && pressed(tab) === 'h', stored(store));
      check('3 Hidden toast', lastToast(tab) === '“Show 2” is hidden from Latest and Home.', lastToast(tab));
      click(tab, priBtn(tab, 'n'));
      check('3 Normal removes the key when nothing else is set', store.getItem(KEY) === null && pressed(tab) === 'n', store.getItem(KEY));
      check('3 Normal toast', lastToast(tab) === '“Show 2” shows in Latest as usual.', lastToast(tab));
      check('3 zero requests for all taps', tab.calls.length === 0, tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
      t.setLatestPri('s5', 'p');
      t.setLatestPri('s2', 'h');
      t.setLatestPri('s2', 'n');
      check('3 Normal on one keeps the others', JSON.stringify(stored(store)) === '{"s5":"p"}', stored(store));
      t.closeDetail();
      t.openDetail(showItem('s5'));
      return settle(80);
    }).then(function () {
      check('3 page reopened shows the stored choice', pressed(tab) === 'p', pressed(tab));
    });
  });
});

// 4. Latest: Priority unplayed first (played stays in place), Hidden left out, Play newest prefers Priority. 0 requests.
tests.push(function () {
  var store = store0({ pri: { s2: 'p', s3: 'h' } });
  return setup(store).then(function (tab) {
    check('4 order: Priority unplayed, then the rest; Hidden gone', ids(tab).join() === 'b1,b3,a1,a2,b2,d1', ids(tab));
    check('4 Play newest prefers the Priority show', /Episode b1$/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
    check('4 boot asked no Latest requests (cache fresh)', latestReqs(tab.boot).length === 0, latestReqs(tab.boot).map(showIdOf));
    var c = JSON.parse(store.getItem('lib-latest'));
    check('4 cache itself untouched (Hidden rows kept for un-hiding)', c.items.length === 8 && c.items[4].id === 'c1');
    store.setItem(KEY, JSON.stringify({ s2: 'p', s3: 'h', s1: 'h' }));
    tab.t().renderList();
    check('4 another copy’s change shows on the next draw', ids(tab).join() === 'b1,b3,b2,d1', ids(tab));
    check('4 a Hidden show’s episodes never become Play newest', /Episode b1$/.test(playNewest(tab).getAttribute('aria-label')));
    store.setItem(KEY, JSON.stringify({ s1: 'h', s2: 'h', s3: 'h' }));
    tab.t().renderList();
    check('4 Play newest falls to the next visible show', /Episode d1$/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
    check('4 drawing asked nothing', tab.calls.length === 0, tab.calls.map(function (c) { return c.path; }));
  });
});

// 5. Hide played, marks and sorts with Priority and Hidden.
tests.push(function () {
  var store = store0({ pri: { s2: 'p', s3: 'h' } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    store.setItem('lib-hide-played', 'true');
    t.renderList();
    check('5 Hide played still hides played rows', ids(tab).join() === 'b1,b3,a1,a2,d1', ids(tab));
    t.writeMark('spotify:episode:b1', { played: true, at: Date.now() });
    store.removeItem('lib-hide-played');
    t.renderList();
    check('5 marked played on this phone: leaves the top, keeps its date place', ids(tab).join() === 'b3,a1,b1,a2,b2,d1', ids(tab));
    check('5 Play newest moves to the next Priority episode', /Episode b3$/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
    t.writeMark('spotify:episode:b1', null);
    store.setItem('lib-sort-latest', JSON.stringify('oldest'));
    t.renderList();
    check('5 Oldest first: Priority on top (oldest first), then the rest', ids(tab).join() === 'b3,b1,d1,b2,a2,a1', ids(tab));
    check('5 Play newest ignores the sort', /Episode b1$/.test(playNewest(tab).getAttribute('aria-label')), playNewest(tab).getAttribute('aria-label'));
    store.removeItem(KEY);
    store.setItem('lib-sort-latest', JSON.stringify('show'));
    t.renderList();
    var plain = ids(tab);
    store.setItem(KEY, JSON.stringify({ s2: 'p', s3: 'h' }));
    t.renderList();
    var withPri = ids(tab);
    var expect = plain.filter(function (id) { return id[0] !== 'c'; });
    check('5 Show A–Z keeps A–Z order, Hidden left out', withPri.join() === expect.join() && plain.length === 8, { plain: plain, withPri: withPri });
    check('5 sorting asked nothing', tab.calls.length === 0);
  });
});

// 6. Home's Latest episodes follow the setting (5 at most); the name box still filters.
tests.push(function () {
  var store = store0({ filter: 'home', pri: { s2: 'p', s3: 'h' } });
  return setup(store).then(function (tab) {
    check('6 Home: Priority first, Hidden gone, 5 rows', homeIds(tab).join() === 'b1,b3,a1,a2,b2', homeIds(tab));
    store.setItem(KEY, JSON.stringify({ s1: 'h', s2: 'h', s3: 'h', s4: 'h' }));
    tab.t().renderList();
    check('6 Home hides the section when every show is Hidden', !q(tab, '#hLatest'));
    check('6 Home loads no Latest', latestReqs(tab.boot).length === 0 && latestReqs(tab.calls).length === 0);
  });
});

// 7. The Latest reload leaves Hidden shows out (fewer catalog requests) and asks Priority shows first; still 12 at most.
tests.push(function () {
  var store = store0({ latest: null, pri: { s1: 'h', s2: 'h', s3: 'h', s14: 'p' } });
  return setup(store).then(function (tab) {
    var lr = latestReqs(tab.boot);
    check('7 11 requests, not 12: three shows Hidden', lr.length === 11, lr.map(showIdOf));
    check('7 Priority show asked first, Hidden never', showIdOf(lr[0]) === 's14' && !lr.some(function (c) { return /^s[123]$/.test(showIdOf(c)); }), lr.map(showIdOf));
    check('7 only Latest requests in the catalog group', catalog(tab.boot).length === 11, catalog(tab.boot).map(function (c) { return c.path; }));
    var c = JSON.parse(store.getItem('lib-latest'));
    check('7 cache says 11 asked', c && c.asked === 11 && c.failed === 0, c && { asked: c.asked, failed: c.failed });
    check('7 list shows no Hidden show', !ids(tab).some(function (id) { return /^e[123]-/.test(id); }), ids(tab).slice(0, 5));
    check('7 Priority show’s unplayed episodes on top', ids(tab).slice(0, 5).every(function (id) { return /^e14-/.test(id); }), ids(tab).slice(0, 6));
    var t = tab.t();
    var set = t.latestShows(t.state.data.shows).map(function (s) { return s.id; });
    check('7 latestShows: 11, Priority first', set.length === 11 && set[0] === 's14', set);
  });
});

// 8. Without settings the reload asks the usual 12 (no change). Priority takes at most 8 of the 12 while 4 or more
//    Normal shows exist; with fewer Normal shows they're all asked and Priority fills the rest.
tests.push(function () {
  var many = {}; for (var k = 1; k <= 13; k++) many['s' + k] = 'p';
  var store = store0({ latest: null });
  return setup(store).then(function (tab) {
    check('8 no settings: 12 requests as before', latestReqs(tab.boot).length === 12, latestReqs(tab.boot).map(showIdOf));
    var t = tab.t();
    store.setItem(KEY, JSON.stringify(many));
    var set = t.latestShows(t.state.data.shows).map(function (s) { return s.id; });
    check('8 13 Priority, 1 Normal: 11 Priority + the Normal one = 12', set.length === 12 && set.indexOf('s14') !== -1 &&
      set.filter(function (id) { return many[id]; }).length === 11, set);
    var three = {}; for (var j = 1; j <= 3; j++) three['s' + j] = 'p';
    store.setItem(KEY, JSON.stringify(three));
    set = t.latestShows(t.state.data.shows).map(function (s) { return s.id; });
    check('8 3 Priority: all 3 first, then 9 Normal', set.length === 12 && set.slice(0, 3).sort().join() === 's1,s2,s3' && set.slice(3).every(function (id) { return !three[id]; }), set);
  });
});
tests.push(function () {
  var many = {}; for (var k = 1; k <= 13; k++) many['s' + k] = 'p';
  var store = store0({ latest: null, pri: many });
  return setup(store, { shows: shows(20) }).then(function (tab) {
    var lr = latestReqs(tab.boot).map(showIdOf);
    check('8b 13 Priority of 20: 12 requests', lr.length === 12, lr);
    check('8b Priority capped at 8: s1–s8', lr.filter(function (id) { return many[id]; }).sort().join() === 's1,s2,s3,s4,s5,s6,s7,s8', lr);
    check('8b 4 slots go to Normal shows: s14–s17', lr.filter(function (id) { return !many[id]; }).sort().join() === 's14,s15,s16,s17', lr);
    check('8b never more than 12 catalog requests', catalog(tab.boot).length === 12, catalog(tab.boot).length);
  });
});

// 9. Every show Hidden: no requests, no error, a plain message; Refresh asks nothing either.
tests.push(function () {
  var all = {}; SHOWS.forEach(function (s) { all[s.id] = 'h'; });
  var store = store0({ pri: all, latest: { at: Date.now() - 20 * HOUR, items: cacheItems(), failed: 0, newest: {}, asked: 4 } });
  return setup(store).then(function (tab) {
    check('9 stale cache, all Hidden: 0 requests', catalog(tab.boot).length === 0, catalog(tab.boot).map(function (c) { return c.path; }));
    check('9 no error shown', !q(tab, '.lnote .err'), q(tab, '.lnote') && q(tab, '.lnote').textContent);
    check('9 message says why it’s empty', emptyText(tab) === 'Only podcasts set to Hidden have episodes here. Change it on a podcast’s page.', emptyText(tab));
    check('9 Play newest says none', /Play newest unplayed episode$/.test(playNewest(tab).getAttribute('aria-label')));
    click(tab, playNewest(tab));
    check('9 Play newest tap: toast, no play', lastToast(tab) === 'No unplayed episodes.' && tab.calls.length === 0, tab.toasts());
    tab.t().state.latest.triedAt = 0;
    tab.t().refreshLatest();
    return settle(80).then(function () {
      check('9 Refresh asks nothing', catalog(tab.calls).length === 0, tab.calls.map(function (c) { return c.path; }));
      check('9 still not loading', tab.t().state.latest.loading === false);
    });
  });
});

// 10. The Shows list, a Hidden show's own page and a pinned podcast's play button are unaffected.
tests.push(function () {
  var store = store0({ pri: { s3: 'h' } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, q(tab, '.seg [data-tab="shows"]'));
    var shown = qa(tab, '#main ul.list li a.item').map(function (a) { return a.getAttribute('href').split('/').pop(); });
    check('10 Shows lists every podcast, Hidden included', SHOWS.every(function (s) { return shown.indexOf(s.id) !== -1; }), shown);
    t.openDetail(showItem('s3'));
    return settle(100).then(function () {
      var rows = qa(tab, '#dlist li a.item').map(function (a) { return a.getAttribute('href').split('/').pop(); });
      check('10 Hidden show’s page still lists its episodes', rows.join() === 'c1,c2', rows);
      check('10 its page shows Hidden selected', pressed(tab) === 'h');
      var h = t.heldShowEpisode('s3');
      check('10 pinned play button still finds its newest episode', h && h.id === 'c1', h);
    });
  });
});

// 11. Cap: 100 settings, with real-length (22-character) show ids. After this visit's library load, settings of
//     podcasts no longer followed make room, otherwise a toast refuses; before it, the setting made longest ago goes.
var B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function rid(n, tag) { var x = 'X' + (tag || 'a'); var v = n * 7919 + 13; while (x.length < 22) { x += B62[v % 62]; v = Math.floor(v / 62) * 31 + 17 + x.length; } return x; }
tests.push(function () {
  var gone = {}; for (var i = 0; i < 100; i++) gone[rid(i, 'g')] = i % 2 ? 'p' : 'h';
  var store = store0({ filter: 'home', pri: gone });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('11 ids are 22 characters and distinct', Object.keys(gone).length === 100 && Object.keys(gone).every(function (id) { return id.length === 22; }));
    check('11 LATEST_PRI_MAX is 100', t.LATEST_PRI_MAX === 100);
    check('11 after the library load: a 101st drops ones for podcasts no longer followed', t.setLatestPri('s1', 'p') === true && JSON.stringify(stored(store)) === '{"s1":"p"}', stored(store));
    var big = []; for (var k = 0; k < 101; k++) big.push({ id: rid(k, 'f'), name: 'Pod ' + k, uri: 'spotify:show:' + rid(k, 'f'), kind: 'show' });
    var full = {}; big.slice(0, 100).forEach(function (s) { full[s.id] = 'h'; });
    store.setItem(KEY, JSON.stringify(full));
    var bytes = store.getItem(KEY).length;
    check('11 100 settings stay under 3 KB', bytes < 3072, bytes);
    t.state.data.shows = big;
    tab.w.__toasts = [];
    t.openDetail({ kind: 'show', id: big[100].id, uri: big[100].uri, name: 'Pod 100', url: 'https://open.spotify.com/show/' + big[100].id, img: '', sub: 'Podcast' });
    return settle(80).then(function () {
      click(tab, priBtn(tab, 'p'));
      check('11 all 100 followed: refused with a toast', lastToast(tab) === 'You can set up to 100 podcasts. Set one back to Normal first.', tab.toasts());
      check('11 refused: nothing stored, Normal still selected', !stored(store)[big[100].id] && Object.keys(stored(store)).length === 100 && pressed(tab) === 'n', pressed(tab));
      check('11 changing an existing one is allowed at the cap', t.setLatestPri(big[5].id, 'p') === true && stored(store)[big[5].id] === 'p');
      check('11 a changed setting counts as set last', Object.keys(stored(store))[99] === big[5].id, Object.keys(stored(store)).slice(-2));
      check('11 Normal is allowed at the cap', t.setLatestPri(big[6].id, 'n') === true && !(big[6].id in stored(store)));
      var over = {}; for (var j = 0; j < 130; j++) over[rid(j, 'o')] = 'p';
      store.setItem(KEY, JSON.stringify(over));
      check('11 reading caps at 100', Object.keys(t.readLatestPri()).length === 100);
    });
  });
});
// 11b. Before this visit's library load has finished, the old saved list isn't trusted: at the cap the setting made
//      longest ago is cleared instead (with a note in the toast), and nothing else is dropped.
tests.push(function () {
  var full = {}; for (var i = 0; i < 100; i++) full[rid(i, 'g')] = 'h';
  var store = store0({ filter: 'home', pri: full });
  store.setItem('lib-cache', JSON.stringify({ at: Date.now() - HOUR, me: { id: 'me1', name: 'R' }, playlists: [], albums: [], artists: [], likedTotal: 0,
    shows: [{ kind: 'show', id: 's1', name: 'Show 1', uri: 'spotify:show:s1', url: 'https://open.spotify.com/show/s1', img: '', sub: 'Podcast' }], episodesTotal: 0 }));
  var tab = H.makeTab(store, function (method, path) {
    if (path === '/me/player') return { status: 204 };
    if (path === '/me/shows') return { status: 200, json: { items: SHOWS.map(function (s) { return { show: s }; }), next: null, total: SHOWS.length }, delay: 2500 };
  });
  var first = Object.keys(full)[0], second = Object.keys(full)[1];
  return H.wait(500).then(function () {
    var t = tab.t();
    check('11b library still loading (old list in use)', t.state.data && t.state.data.shows && t.state.data.shows.length === 1, t.state.data && t.state.data.shows && t.state.data.shows.length);
    check('11b at the cap before the load: stored, oldest cleared', t.setLatestPri('s2', 'p') === 'cleared', stored(store) && Object.keys(stored(store)).length);
    var st = stored(store);
    check('11b only the oldest went', Object.keys(st).length === 100 && !(first in st) && st[second] === 'h' && st.s2 === 'p', Object.keys(st).slice(0, 2));
    t.openDetail({ kind: 'show', id: 's3', uri: 'spotify:show:s3', name: 'Show 3', url: 'https://open.spotify.com/show/s3', img: '', sub: 'Podcast' });
    return H.wait(100).then(function () {
      tab.w.__toasts = [];
      click(tab, priBtn(tab, 'h'));
      check('11b toast says the oldest was cleared', /^“Show 3” is hidden from Latest and Home\. The setting made longest ago was cleared to make room\.$/.test(lastToast(tab)), tab.toasts());
      return H.wait(3200);
    }).then(function () {
      check('11b after the load: unfollowed settings make room', t.setLatestPri('s4', 'p') === true && Object.keys(stored(store)).sort().join() === 's2,s3,s4', Object.keys(stored(store)).length);
      tab.w.close();
    });
  });
});

// 12. Storage full: a toast, the switch stays as it was, nothing else breaks.
tests.push(function () {
  var store = store0({ filter: 'home' });
  var realSet = store.setItem;
  store.setItem = function (k, v) { if (k === KEY) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(store, k, v); };
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('s2'));
    return settle(80).then(function () {
      click(tab, priBtn(tab, 'h'));
      check('12 storage full: toast', lastToast(tab) === 'Couldn’t save that on this phone. Its storage is full.', tab.toasts());
      check('12 storage full: Normal still selected, nothing stored', pressed(tab) === 'n' && store.getItem(KEY) === null, pressed(tab));
      check('12 storage full: setLatestPri says false', t.setLatestPri('s2', 'p') === false);
      check('12 page still works', !!q(tab, '#dlist'));
    });
  });
});

// 13. Bad stored values are ignored (treated as Normal).
tests.push(function () {
  var store = store0({ pri: '{"s1":"x","s2":"p","":"h","s3":7,"s4":"h"}' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('13 only valid entries read', JSON.stringify(t.readLatestPri()) === '{"s2":"p","s4":"h"}', t.readLatestPri());
    check('13 Latest drawn with the valid ones', ids(tab).join() === 'b1,b3,a1,a2,b2,c1,c2', ids(tab));
    ['"oops"', '[1,2]', 'not json', 'null'].forEach(function (raw) {
      store.setItem(KEY, raw);
      check('13 ' + raw + ' reads as nothing set', JSON.stringify(t.readLatestPri()) === '{}');
    });
    t.renderList();
    check('13 garbage: Latest as before', ids(tab).join() === 'a1,b1,a2,b2,c1,b3,d1,c2', ids(tab));
  });
});

// 14. Diagnostics shows how many podcasts have each setting.
tests.push(function () {
  var store = store0({ filter: 'home', pri: { s1: 'p', s2: 'p', s3: 'h' } });
  return setup(store).then(function (tab) {
    tab.t().openDiag();
    return H.wait(300).then(function () {
      var txt = q(tab, '#diag').textContent;
      check('14 Diagnostics lists the counts', /In Latest \(set on this phone\): 2 Priority · 1 Hidden/.test(txt), txt.slice(0, 400));
      check('14 Diagnostics version', /Page v2\.44 \(2026-11-27\)/.test(txt));
      check('14 counts helper', JSON.stringify(tab.t().latestPriCounts()) === '{"p":2,"h":1}');
    });
  });
});

// 15. Paused catalog group: opening Latest asks nothing; changing a setting asks nothing and works.
tests.push(function () {
  var store = store0({ latest: null, pri: { s1: 'h' }, cool: cool('catalog') });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('15 catalog paused: no Latest requests', latestReqs(tab.boot).length === 0, latestReqs(tab.boot).map(showIdOf));
    check('15 paused note shown', /Paused by Spotify until/.test(q(tab, '.lnote').textContent), q(tab, '.lnote').textContent);
    t.openDetail(showItem('s2'));
    return settle(80).then(function () {
      tab.calls.length = 0;
      click(tab, priBtn(tab, 'p'));
      check('15 setting changed while paused', stored(store).s2 === 'p' && tab.calls.length === 0, tab.calls);
    });
  });
});

// 16. A 429 during a reload with Hidden shows: stops as before, never asks a Hidden show, keeps the rest of the cache.
tests.push(function () {
  var n = 0;
  var store = store0({ latest: null, pri: { s4: 'h', s5: 'h' } });
  return setup(store, { latest: function (id) {
    n++;
    if (n === 3) return { status: 429, json: { error: { status: 429, message: 'rate limit' } }, delay: 10 };
    return null;
  } }).then(function (tab) {
    var lr = latestReqs(tab.boot);
    check('16 stops after the 429 (at most the 2 in flight finish)', lr.length >= 3 && lr.length <= 4, lr.map(showIdOf));
    check('16 no Hidden show asked', !lr.some(function (c) { return /^s[45]$/.test(showIdOf(c)); }), lr.map(showIdOf));
    var cl = JSON.parse(store.getItem('lib-cooloff') || '{}');
    check('16 catalog group paused', cl.catalog && cl.catalog.until > Date.now(), cl);
    check('16 other groups not paused', !cl.library && !cl.player, Object.keys(cl));
  });
});

// 17. Two copies of the page share the setting (storage only).
tests.push(function () {
  var store = store0();
  var tab1;
  return setup(store).then(function (tab) {
    tab1 = tab;
    tab.t().openDetail(showItem('s3'));
    return settle(80);
  }).then(function () {
    click(tab1, priBtn(tab1, 'h'));
    return setup(store);
  }).then(function (tab2) {
    check('17 second copy leaves the Hidden show out', ids(tab2).join() === 'a1,b1,a2,b2,b3,d1', ids(tab2));
    check('17 second copy asked no Latest', latestReqs(tab2.boot).length === 0);
    close(tab2);
    close(tab1);
  });
});

// 18. A reload drops Hidden shows' rows before keeping 50 (each keeps its newest row), so the visible list stays at 50.
tests.push(function () {
  var old = [];
  ['s13', 's14'].forEach(function (sid) { for (var j = 0; j < 5; j++) old.push(lrow('h' + sid + '-' + j, sid, j)); });
  var store = store0({ pri: { s13: 'h', s14: 'h' }, latest: { at: Date.now() - 20 * HOUR, items: old, failed: 0, newest: { s13: dayIso(0), s14: dayIso(0) }, asked: 2 } });
  return setup(store).then(function (tab) {
    var lr = latestReqs(tab.boot).map(showIdOf);
    check('18 reload asked 12 shows, no Hidden ones', lr.length === 12 && lr.indexOf('s13') === -1 && lr.indexOf('s14') === -1, lr);
    var c = JSON.parse(store.getItem('lib-latest'));
    var vis = c.items.filter(function (x) { return x.showId !== 's13' && x.showId !== 's14'; });
    var hid = c.items.filter(function (x) { return x.showId === 's13' || x.showId === 's14'; }).map(function (x) { return x.id; });
    check('18 cache keeps 50 visible rows', vis.length === 50, vis.length);
    check('18 Hidden shows keep only their newest row', hid.sort().join() === 'hs13-0,hs14-0', hid);
    check('18 cache still newest first', c.items.every(function (x, i) { return !i || c.items[i - 1].date >= x.date; }));
    check('18 Latest shows 50 rows', ids(tab).length === 50 && !ids(tab).some(function (id) { return id[0] === 'h'; }), ids(tab).length);
    var h = tab.t().heldShowEpisode('s13');
    check('18 Hidden show’s pin play still finds its newest episode', h && h.id === 'hs13-0', h);
    store.removeItem(KEY);
    tab.t().renderList();
    check('18 un-hiding shows the kept rows at once', ids(tab).indexOf('hs13-0') !== -1 && ids(tab).length === 52, ids(tab).length);
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
