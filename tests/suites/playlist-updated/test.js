'use strict';
// "Updated" playlists (v2.46) tests: snapshot ids from the library load, the Updated label on playlist rows and
// cards until opened, New dots and Added by inside playlists, storage limits and quota errors, and zero extra
// requests. jsdom, mocked fetch, shared localStorage.
// Run: node tests/run.js playlist-updated  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var OLD = '2026-01-05T10:00:00Z';
function track(id) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: 200000,
    artists: [{ id: 'ar1', name: 'Band' }], album: { id: 'al1', name: 'Record', images: [] } };
}
// p1 and p5 are mine (p5 has no snapshot id), p2 is a friend's collaborative playlist, p3 is someone else's,
// p4 is owned by "spotify".
function freshPlaylists() {
  return {
    p1: { name: 'Road trip', owner: 'me1', collab: false, snap: 'a1', items: [{ id: 's1', at: OLD, by: 'me1' }, { id: 's2', at: OLD, by: 'me1' }] },
    p2: { name: 'Band jams', owner: 'friend', collab: true, snap: 'b1', items: [{ id: 's3', at: OLD, by: 'me1' }, { id: 's4', at: OLD, by: 'friend' }] },
    p3: { name: 'Friend mix', owner: 'friend2', collab: false, snap: 'c1', items: [{ id: 's5', at: OLD, by: 'friend2' }] },
    p4: { name: 'Top hits', owner: 'spotify', collab: false, snap: 'd1', items: [{ id: 's6', at: OLD, by: 'spotify' }] },
    p5: { name: 'No snap', owner: 'me1', collab: false, snap: '', items: [] }
  };
}
function apiPlaylist(id, p) {
  return { id: id, name: p.name, uri: 'spotify:playlist:' + id, images: [], collaborative: p.collab, snapshot_id: p.snap || undefined,
    owner: { id: p.owner, display_name: p.owner === 'me1' ? 'R' : p.owner }, items: { total: p.items.length } };
}
function store0(extra) {
  var s = H.seedStore();
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, typeof extra[k] === 'string' ? extra[k] : JSON.stringify(extra[k])); });
  return s;
}
function setup(s, opts) {
  opts = opts || {};
  var env = { pls: opts.pls || freshPlaylists(), noPlaylists: false, pl429: false };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (call.host === 'accounts.spotify.com') return { status: 400, json: { error: 'invalid_grant' } };
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/playlists') {
      if (env.pl429) return { status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } } };
      var ids = env.noPlaylists ? [] : Object.keys(env.pls);
      return { status: 200, json: { items: ids.map(function (k) { return apiPlaylist(k, env.pls[k]); }), next: null, total: ids.length } };
    }
    var m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m && env.pls[m[1]] && method === 'GET') {
      var pl = env.pls[m[1]];
      if (pl.owner !== 'me1' && !pl.collab) return { status: 403, json: { error: { status: 403, message: 'Forbidden' } } };
      return { status: 200, json: { items: pl.items.map(function (x) { return { added_at: x.at, added_by: { id: x.by }, is_local: false, item: track(x.id) }; }),
        total: pl.items.length, offset: 0, limit: 50, next: null } };
    }
    if (path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(opts.startWait || 600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (opts.filter) t.setFilter(opts.filter);
    return H.wait(50);
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
function seen(s) { try { return JSON.parse(s.getItem('lib-pl-seen') || 'null'); } catch (e) { return 'bad'; } }
function rowFor(tab, name) {
  var a = qa(tab, '#main ul.list li.row a.item').filter(function (x) { return x.getAttribute('data-verb') === 'Open “' + name + '”'; })[0];
  return a ? a.parentNode : null;
}
function rowUpd(tab, name) { var li = rowFor(tab, name); return !!(li && li.querySelector('.updtag')); }
function rowSub(tab, name) { var li = rowFor(tab, name); return li ? li.querySelector('.sub').textContent : null; }
function rowLabel(tab, name) { var li = rowFor(tab, name); return li ? li.querySelector('a.item').getAttribute('aria-label') : null; }
function card(tab, strip, name) {
  return qa(tab, 'ul[aria-labelledby="' + strip + '"] a.clcard').filter(function (a) { return (a.getAttribute('aria-label') || '').indexOf('Open “' + name + '”') === 0; })[0] || null;
}
function cardUpd(tab, strip, name) { var a = card(tab, strip, name); return !!(a && a.querySelector('.updtag')); }
function songRows(tab) { return qa(tab, '#dlist li.row'); }
function songRow(tab, id) {
  return songRows(tab).filter(function (li) { return li.querySelector('.name').textContent === 'Song ' + id; })[0] || null;
}
function apiCalls(tab) { return tab.calls.filter(function (c) { return c.host === 'api.spotify.com' && c.path !== '/me/player' && c.path !== '/me/player/devices'; }); }
function byPath(tab) {
  var o = {};
  apiCalls(tab).forEach(function (c) { var k = c.method + ' ' + c.path; o[k] = (o[k] || 0) + 1; });
  return o;
}
function lib(t, id) { return t.libraryPlaylist(id); }
function reload(tab) { return tab.t().refresh().then(function () { return H.wait(60); }); }
function isoAgo(ms) { return new Date(Date.now() - ms).toISOString(); }
var LOAD_PATHS = ['GET /me', 'GET /me/playlists', 'GET /me/albums', 'GET /me/following', 'GET /me/tracks', 'GET /me/shows', 'GET /me/episodes'];

var tests = [];

// 1. First sight: recorded, never marked; spotify-owned and snapshot-less playlists left out; zero extra requests.
tests.push(function () {
  var s = store0({ 'lib-filter': 'playlists' });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t(), m = seen(s);
    check('1 stored after the first load', m && typeof m === 'object', m);
    check('1 p1, p2, p3 recorded with their snapshot', m.p1 && m.p1.s === 'a1' && m.p2.s === 'b1' && m.p3.s === 'c1', m);
    check('1 first sight: not opened yet', m.p1.o === 0 && typeof m.p1.f === 'number' && Math.abs(m.p1.f - Date.now()) < 5000, m.p1);
    check('1 spotify-owned not recorded', !m.p4, m);
    check('1 no snapshot id: not recorded', !m.p5, m);
    check('1 no row says Updated', qa(tab, '.updtag').length === 0, qa(tab, '.updtag').length);
    check('1 rows unchanged', rowSub(tab, 'Road trip') === 'Playlist · R · 2 songs', rowSub(tab, 'Road trip'));
    return reload(tab).then(function () {
      var calls = byPath(tab);
      check('1 a library load sends only the usual requests', Object.keys(calls).sort().join() === LOAD_PATHS.slice().sort().join(), calls);
      check('1 each asked once', LOAD_PATHS.every(function (k) { return calls[k] === 1; }), calls);
      check('1 nothing asked per playlist', apiCalls(tab).filter(function (c) { return /^\/playlists\//.test(c.path); }).length === 0);
      check('1 same snapshots: still no Updated', qa(tab, '.updtag').length === 0);
      check('1 stored entries unchanged', JSON.stringify(seen(s)) === JSON.stringify(m), seen(s));
      check('1 plUpdated false for all', ['p1', 'p2', 'p3', 'p4', 'p5'].every(function (id) { return !t.plUpdated(lib(t, id)); }));
    });
  });
});

// 2. A changed snapshot marks the row Updated in Playlists, All, Home's Your playlists and Pinned (rows and cards).
tests.push(function () {
  var s = store0({ 'lib-pins': [{ kind: 'playlist', id: 'p2', name: 'Band jams', uri: 'spotify:playlist:p2', url: '', img: '', sub: 'Playlist', ownerId: 'friend', collaborative: true }] });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t(), before = JSON.stringify(seen(s));
    tab.env.pls.p1.snap = 'a2'; tab.env.pls.p2.snap = 'b2'; tab.env.pls.p3.snap = 'c2'; tab.env.pls.p4.snap = 'd2';
    return reload(tab).then(function () {
      check('2 own playlist row says Updated', rowUpd(tab, 'Road trip'), rowSub(tab, 'Road trip'));
      check('2 sub reads "Updated · …"', rowSub(tab, 'Road trip') === 'Updated · Playlist · R · 2 songs', rowSub(tab, 'Road trip'));
      check('2 label read aloud', /^Open “Road trip”, Updated · Playlist/.test(rowLabel(tab, 'Road trip')), rowLabel(tab, 'Road trip'));
      check('2 someone else’s playlist says Updated', rowUpd(tab, 'Friend mix'));
      check('2 spotify-owned never says Updated', !rowUpd(tab, 'Top hits') && !t.plUpdated(lib(t, 'p4')), rowSub(tab, 'Top hits'));
      check('2 no snapshot id: no label', !rowUpd(tab, 'No snap'));
      var pinSect = qa(tab, '#main h2.sect').some(function (h) { return h.textContent === 'Pinned'; });
      check('2 pinned row in Playlists says Updated', pinSect && rowUpd(tab, 'Band jams'));
      check('2 never "new songs"', d(tab).body.textContent.indexOf('new songs') === -1);
      check('2 stored snapshots unchanged until opened', JSON.stringify(seen(s)) === before, seen(s));
      check('2 no per-playlist requests', apiCalls(tab).filter(function (c) { return /^\/playlists\//.test(c.path); }).length === 0, byPath(tab));
      t.setFilter('all');
      return H.wait(30);
    }).then(function () {
      check('2 All shows Updated too', rowUpd(tab, 'Road trip') && rowUpd(tab, 'Friend mix') && !rowUpd(tab, 'Top hits'));
      t.setFilter('home');
      return H.wait(30);
    }).then(function () {
      check('2 Home Your playlists card says Updated', cardUpd(tab, 'hPlaylists', 'Road trip') && cardUpd(tab, 'hPlaylists', 'Friend mix'));
      var a = card(tab, 'hPlaylists', 'Road trip');
      check('2 card label says Updated', a && a.getAttribute('aria-label') === 'Open “Road trip”, Updated, 2 songs', a && a.getAttribute('aria-label'));
      check('2 card sub', a && a.querySelector('.sub').textContent === 'Updated · 2 songs', a && a.querySelector('.sub').textContent);
      check('2 spotify card plain', card(tab, 'hPlaylists', 'Top hits') && !cardUpd(tab, 'hPlaylists', 'Top hits'));
      check('2 Pinned card says Updated', cardUpd(tab, 'hPinned', 'Band jams'), !!card(tab, 'hPinned', 'Band jams'));
    });
  });
});

// 3. Opening your own playlist clears the label and stores the new snapshot; New dots for songs added since.
tests.push(function () {
  var s = store0();
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t(), first = seen(s).p1.f;
    tab.env.pls.p1.snap = 'a2';
    tab.env.pls.p1.items.push({ id: 's7', at: isoAgo(100), by: 'me1' });   // added after the page first saw p1
    return reload(tab).then(function () {
      check('3 Updated before opening', rowUpd(tab, 'Road trip'));
      tab.calls.length = 0;
      click(tab, rowFor(tab, 'Road trip').querySelector('a.item'));
      return H.wait(200);
    }).then(function () {
      var m = seen(s).p1;
      check('3 opened: new snapshot stored', m.s === 'a2' && m.o > 0 && Math.abs(m.o - Date.now()) < 5000 && m.f === first, m);
      check('3 song list loaded once, nothing else per playlist', (byPath(tab)['GET /playlists/p1/items'] || 0) === 1 &&
        apiCalls(tab).filter(function (c) { return /^\/playlists\//.test(c.path); }).length === 1, byPath(tab));
      check('3 header has no Updated tag', !q(tab, '.dhead .updtag'));
      var nr = songRow(tab, 's7'), old = songRow(tab, 's1');
      check('3 song added since gets the New dot', nr && !!nr.querySelector('.newdot'), nr && nr.innerHTML);
      check('3 New read aloud', nr && /, new/.test(nr.querySelector('a.item').getAttribute('aria-label')), nr && nr.querySelector('a.item').getAttribute('aria-label'));
      check('3 older songs: no dot', old && !old.querySelector('.newdot'));
      check('3 own playlist: no Added by', songRows(tab).every(function (li) { return li.querySelector('.sub').textContent.indexOf('Added by') === -1; }));
      t.closeDetail();
      return H.wait(60);
    }).then(function () {
      check('3 back in the list: label gone', rowFor(tab, 'Road trip') && !rowUpd(tab, 'Road trip'), rowSub(tab, 'Road trip'));
      return reload(tab);
    }).then(function () {
      check('3 next load with the same snapshot: still no label', !rowUpd(tab, 'Road trip'));
      tab.env.pls.p1.snap = 'a3';
      return reload(tab);
    }).then(function () {
      check('3 another change: Updated again', rowUpd(tab, 'Road trip'));
      tab.calls.length = 0;
      t.openDetail(lib(t, 'p1'));
      return H.wait(200);
    }).then(function () {
      var nr = songRow(tab, 's7');
      check('3 reopened: the dot follows the last open (s7 was seen)', nr && !nr.querySelector('.newdot'), nr && nr.innerHTML);
      check('3 reopened: the list came from this visit’s memo (no request)', !byPath(tab)['GET /playlists/p1/items'], byPath(tab));
    });
  });
});

// 4. Songs added after the open (by this page or a later change) don't get the dot; no dots before any open.
tests.push(function () {
  var s = store0();
  return setup(s).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p1.items.push({ id: 's8', at: new Date(Date.now() + 60000).toISOString(), by: 'me1' });
    t.openDetail(lib(t, 'p1'));
    return H.wait(200).then(function () {
      check('4 added after the open: no dot', songRow(tab, 's8') && !songRow(tab, 's8').querySelector('.newdot'));
      // A playlist outside the library (no record): no dots, nothing stored without a snapshot.
      check('4 nothing marked fresh without a window', songRows(tab).every(function (li) { return !li.querySelector('.newdot'); }));
    });
  });
});

// 5. Someone else's playlist: opening alone keeps Updated; Show songs counts as opened; Play on a Pinned card too.
tests.push(function () {
  var s = store0({ 'lib-pins': [{ kind: 'playlist', id: 'p3', name: 'Friend mix', uri: 'spotify:playlist:p3', url: '', img: '', sub: 'Playlist', ownerId: 'friend2', collaborative: false }] });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p3.snap = 'c2';
    return reload(tab).then(function () {
      tab.calls.length = 0;
      t.openDetail(lib(t, 'p3'));
      return H.wait(200);
    }).then(function () {
      check('5 opening sends no song-list request', !byPath(tab)['GET /playlists/p3/items'], byPath(tab));
      check('5 not marked by opening alone', seen(s).p3.s === 'c1' && seen(s).p3.o === 0, seen(s).p3);
      var tag = q(tab, '.dhead .sub .updtag');
      check('5 header says Updated', !!tag && q(tab, '.dhead .sub').textContent.indexOf('Updated · Playlist') === 0, q(tab, '.dhead .sub') && q(tab, '.dhead .sub').textContent);
      var b = qa(tab, '#dfoot button').filter(function (x) { return x.textContent === 'Show songs'; })[0];
      check('5 Show songs offered', !!b);
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(50);
    }).then(function () {
      check('5 Show songs: marked opened', seen(s).p3.s === 'c2' && seen(s).p3.o > 0, seen(s).p3);
      check('5 header tag removed', !q(tab, '.dhead .updtag') && q(tab, '.dhead .sub').textContent.indexOf('Playlist') === 0, q(tab, '.dhead .sub').textContent);
      check('5 Show songs: zero API requests', apiCalls(tab).length === 0, byPath(tab));
      t.closeDetail();
      return H.wait(50);
    }).then(function () {
      check('5 list label gone', !rowUpd(tab, 'Friend mix'));
      tab.env.pls.p3.snap = 'c3';
      t.setFilter('home');
      return reload(tab);
    }).then(function () {
      check('5 Pinned card Updated again', cardUpd(tab, 'hPinned', 'Friend mix'));
      var li = card(tab, 'hPinned', 'Friend mix').parentNode;
      var pb = li.querySelector('.cardplay');
      check('5 Pinned card has its play button', !!pb);
      tab.calls.length = 0;
      click(tab, pb);
      return H.wait(300);
    }).then(function () {
      check('5 Play: marked opened', seen(s).p3.s === 'c3', seen(s).p3);
      check('5 Play: card label removed without a redraw', !cardUpd(tab, 'hPinned', 'Friend mix') &&
        card(tab, 'hPinned', 'Friend mix').querySelector('.sub').textContent === '1 songs' &&
        card(tab, 'hPinned', 'Friend mix').getAttribute('aria-label').indexOf('Updated') === -1, card(tab, 'hPinned', 'Friend mix').outerHTML);
      var plays = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
      check('5 Play sent once, as before', plays.length === 1 && plays[0].body && plays[0].body.context_uri === 'spotify:playlist:p3', tab.calls);
      check('5 Play: nothing else sent', apiCalls(tab).filter(function (c) { return c.path !== '/me/player/play'; }).length === 0, byPath(tab));
    });
  });
});

// 6. Collaborative: Added by you / someone else, and New dots; own playlist Play doesn't count (spec: opened).
tests.push(function () {
  var s = store0();
  return setup(s).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p2.items.push({ id: 's9', at: isoAgo(100), by: 'friend' });
    t.openDetail(lib(t, 'p2'));
    return H.wait(200).then(function () {
      var mine = songRow(tab, 's3'), theirs = songRow(tab, 's4'), nw = songRow(tab, 's9');
      check('6 Added by you', mine && /· Added by you$/.test(mine.querySelector('.sub').textContent), mine && mine.querySelector('.sub').textContent);
      check('6 Added by someone else', theirs && /· Added by someone else$/.test(theirs.querySelector('.sub').textContent), theirs && theirs.querySelector('.sub').textContent);
      check('6 read aloud too', /Added by someone else/.test(theirs.querySelector('a.item').getAttribute('aria-label')));
      check('6 collaborative New dot', nw && !!nw.querySelector('.newdot') && !theirs.querySelector('.newdot'));
      check('6 Added by is display only (not in the stored sub)', t.state.detail.items.every(function (i) { return (i.sub || '').indexOf('Added by') === -1; }));
      check('6 marked opened', seen(s).p2.o > 0);
      t.closeDetail();
      tab.env.pls.p1.snap = 'a9';
      return reload(tab);
    }).then(function () {
      t.setFilter('playlists');
      return H.wait(30);
    }).then(function () {
      check('6 own playlist Updated', rowUpd(tab, 'Road trip'));
      t.markPlOpened(lib(t, 'p4'));
      check('6 spotify-owned: opening stores nothing', !seen(s).p4, seen(s));
    });
  });
});

// 7. This page's own changes don't mark a playlist Updated; someone else's unseen change still does.
tests.push(function () {
  var s = store0();
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    t.afterAdd(lib(t, 'p1'), track('s20'), 'a5');   // Add to playlist answered with snapshot a5
    tab.env.pls.p1.snap = 'a5';
    check('7 own change noted', seen(s).p1.e === 'a5' && seen(s).p1.s === 'a1', seen(s).p1);
    return reload(tab).then(function () {
      check('7 own change: no Updated', !rowUpd(tab, 'Road trip'), rowSub(tab, 'Road trip'));
      tab.env.pls.p2.snap = 'b2';
      return reload(tab);
    }).then(function () {
      check('7 p2 Updated by someone else', rowUpd(tab, 'Band jams'));
      t.plEdited('p2', 'b3');
      tab.env.pls.p2.snap = 'b3';
      return reload(tab);
    }).then(function () {
      check('7 own change on an Updated playlist keeps the label', rowUpd(tab, 'Band jams') && !seen(s).p2.e, seen(s).p2);
      t.openDetail(lib(t, 'p1'));
      return H.wait(200);
    }).then(function () {
      check('7 opening drops the edit snapshot', seen(s).p1.s === 'a5' && seen(s).p1.e === undefined, seen(s).p1);
      t.plEdited('nope', 'x');
      check('7 unknown playlist: nothing stored', !seen(s).nope);
    });
  });
});

// 8. Storage cap: 500 kept, library playlists first, then the most recent; broken entries dropped.
tests.push(function () {
  var now = Date.now(), m = {};
  for (var i = 0; i < 600; i++) m['x' + i] = { s: 'z', o: i % 3 ? 0 : now - i * 1000, f: now - i * 1000 };
  m.p1 = { s: 'a1', o: 0, f: now - 900 * 86400000 };   // oldest of all, but in the library
  m.bad1 = { s: '', o: 0, f: now };
  m.bad2 = { s: 'q', o: 'yes', f: now };
  m.bad3 = 'string';
  m.bad4 = { s: 'q', o: 0, f: now, e: 5 };
  var s = store0({ 'lib-pl-seen': m });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t(), st = seen(s), keys = Object.keys(st);
    check('8 capped at 500', keys.length === 500 && t.PLSEEN_MAX === 500, keys.length);
    check('8 library playlists kept (old p1 included)', !!st.p1 && !!st.p2 && !!st.p3, Object.keys(st).slice(0, 5));
    check('8 newest others kept, oldest dropped', !!st.x0 && !!st.x496 && !st.x497 && !st.x599, [!!st.x0, !!st.x496, !!st.x497]);
    check('8 broken entries dropped', !st.bad1 && !st.bad2 && !st.bad3 && !st.bad4);
    check('8 kept p1 not re-recorded (keeps its old first sight)', st.p1.f === m.p1.f);
  });
});

// 9. Storage refuses writes: the full list fails, the best half is stored; refusing everything lasts the visit.
tests.push(function () {
  var now = Date.now(), m = {};
  for (var i = 0; i < 600; i++) m['x' + i] = { s: 'snapshot' + i, o: 0, f: now - i * 1000 };
  var s = store0({ 'lib-pl-seen': m });
  var real = s.setItem.bind(s);
  s.setItem = function (k, v) { if (k === 'lib-pl-seen' && String(v).length > 20000) throw new Error('QuotaExceededError'); real(k, v); };
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var st = seen(s);
    check('9 too big: the best half is stored', Object.keys(st).length === 250 && !!st.p1 && !!st.p2 && !!st.p3 && !!st.x0, Object.keys(st).length);
    check('9 memory keeps all 500 this visit', Object.keys(tab.t().readPlSeen()).length === 500);
    s.setItem = function (k, v) { if (k === 'lib-pl-seen') throw new Error('QuotaExceededError'); real(k, v); };
    tab.env.pls.p1.snap = 'a2';
    return reload(tab).then(function () {
      check('9 refused writes: label still works', rowUpd(tab, 'Road trip'));
      tab.t().openDetail(tab.t().libraryPlaylist('p1'));
      return H.wait(200);
    }).then(function () {
      check('9 refused write: open lasts this visit', tab.t().readPlSeen().p1.s === 'a2' && seen(s).p1.s === 'a1', [tab.t().readPlSeen().p1, seen(s).p1]);
      tab.t().closeDetail();
      return H.wait(30);
    }).then(function () {
      check('9 no crash, list drawn without the label', !!rowFor(tab, 'Road trip') && !rowUpd(tab, 'Road trip'));
    });
  });
});

// 10. Broken stored values.
tests.push(function () {
  var s = store0({ 'lib-pl-seen': '[1,2,3]' });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    check('10 array replaced with fresh records', seen(s) && !Array.isArray(seen(s)) && seen(s).p1.s === 'a1', seen(s));
    check('10 no label', qa(tab, '.updtag').length === 0);
    var s2 = store0({ 'lib-pl-seen': '{not json' });
    return setup(s2, { filter: 'playlists' }).then(function (tab2) {
      check('10 bad JSON: fresh records, no crash', seen(s2) && seen(s2).p2.s === 'b1' && !!rowFor(tab2, 'Road trip'), s2.getItem('lib-pl-seen'));
    });
  });
});

// 11. A 429 on the library (paused group): nothing changes, nothing extra sent; cached labels still show.
tests.push(function () {
  var s = store0();
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p1.snap = 'a2';
    return reload(tab).then(function () {
      var before = s.getItem('lib-pl-seen');
      tab.env.pl429 = true; tab.env.pls.p3.snap = 'c2';
      tab.calls.length = 0;
      return reload(tab).then(function () {
        check('11 library paused after the 429', t.coolLeft('library') > 0, t.coolLeft('library'));
        check('11 stored records unchanged', s.getItem('lib-pl-seen') === before);
        check('11 cached data keeps the label', rowUpd(tab, 'Road trip') && !rowUpd(tab, 'Friend mix'));
        var pl = tab.calls.filter(function (c) { return c.path === '/me/playlists'; }).length;
        check('11 no extra requests (one playlists ask)', pl === 1 && apiCalls(tab).filter(function (c) { return /^\/playlists\//.test(c.path); }).length === 0, byPath(tab));
        tab.calls.length = 0;
        return reload(tab);
      }).then(function () {
        check('11 refresh while paused sends nothing', apiCalls(tab).filter(function (c) { return c.path === '/me/playlists'; }).length === 0, byPath(tab));
      });
    });
  });
});

// 12. Empty library and Diagnostics.
tests.push(function () {
  var s = store0();
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p1.snap = 'a2';
    return reload(tab).then(function () {
      t.openDiag();
      return H.wait(300);
    }).then(function () {
      var txt = q(tab, '#diag').textContent;
      check('12 Diagnostics: snapshot count, Updated and stored', /Playlists with a snapshot id: 4 of 5 · Updated since opened: 1 · Remembered on this phone: 3 \(up to 500\)/.test(txt), t.plSeenDiag());
      var s2 = store0();
      return setup(s2, { filter: 'playlists' });
    }).then(function (tab2) {
      tab2.env.noPlaylists = true;
      return reload(tab2).then(function () {
        var s2 = tab2.w.localStorage;
        check('12 empty library: nothing new stored, no crash', Object.keys(seen(s2) || {}).length === 3, seen(s2));
        check('12 empty Diagnostics line', tab2.t().plSeenDiag().indexOf('Playlists with a snapshot id: 0 of 0 · Updated since opened: 0') === 0, tab2.t().plSeenDiag());
      });
    });
  });
});

// 13. Two tabs sharing storage: one tab's open survives the other's write.
tests.push(function () {
  var s = store0();
  var a, b;
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    a = tab;
    return setup(s, { filter: 'playlists' });
  }).then(function (tab) {
    b = tab;
    a.env.pls.p1.snap = 'a2'; b.env.pls.p1.snap = 'a2';
    a.env.pls.n1 = b.env.pls.n1 = { name: 'Brand new', owner: 'me1', collab: false, snap: 'n1', items: [] };
    return reload(a);
  }).then(function () {
    a.t().openDetail(a.t().libraryPlaylist('p1'));
    return H.wait(200);
  }).then(function () {
    return reload(b);   // b still holds p1 at a1 in memory and records n1
  }).then(function () {
    var st = seen(s);
    check('13 other tab’s open kept', st.p1.s === 'a2' && st.p1.o > 0, st.p1);
    check('13 new playlist recorded', st.n1 && st.n1.s === 'n1' && st.n1.o === 0, st.n1);
    check('13 a new playlist is not marked on first sight', !rowUpd(b, 'Brand new'));
    a.t().stopApp(); b.t().stopApp();
  });
});

// 14. Nearby features: copy labels, Liked Songs, albums and playing rows are unaffected.
tests.push(function () {
  var s = store0({ 'lib-pl-copies': { p3: { copyId: 'p1', name: 'Road trip', ownerName: 'friend2', ownerId: 'friend2', uri: 'spotify:playlist:p1', img: '', snap: 'c1', count: 1, at: Date.now() } } });
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    tab.env.pls.p3.snap = 'c2';
    return reload(tab).then(function () {
      var sub = rowSub(tab, 'Friend mix');
      check('14 Updated and the copy label together', /^Updated · Playlist · friend2 · 1 songs · You have a copy$/.test(sub), sub);
      check('14 copy baseline untouched', JSON.parse(s.getItem('lib-pl-copies')).p3.snap === 'c1');
      check('14 library copy keeps Spotify’s snapshot', lib(t, 'p3').snap === 'c2');
      var liked = rowFor(tab, 'Liked Songs');
      check('14 Liked Songs row plain', !liked || !liked.querySelector('.updtag'));
      check('14 plUpdated ignores other kinds', !t.plUpdated({ kind: 'album', id: 'p3', snap: 'zz' }) && !t.plUpdated(null));
    });
  });
});

// 15. Review fix: this page's own change, then an open before the next library load, never shows Updated.
tests.push(function () {
  var s = store0();
  return setup(s, { filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    // A: Add to playlist (Now Playing), then open the playlist, then a library load.
    t.afterAdd(lib(t, 'p1'), track('s20'), 'a5');
    tab.env.pls.p1.snap = 'a5'; tab.env.pls.p1.items.push({ id: 's20', at: new Date().toISOString(), by: 'me1' });
    check('15A library copy takes the new snapshot', lib(t, 'p1').snap === 'a5', lib(t, 'p1').snap);
    check('15A saved library takes it too', JSON.parse(s.getItem('lib-cache')).playlists.filter(function (p) { return p.id === 'p1'; })[0].snap === 'a5');
    check('15A no Updated before opening', !t.plUpdated(lib(t, 'p1')));
    t.openDetail(lib(t, 'p1'));
    return H.wait(200).then(function () {
      check('15A open stores the edited snapshot', seen(s).p1.s === 'a5', seen(s).p1);
      t.closeDetail();
      return reload(tab);
    }).then(function () {
      check('15A next load: no Updated', !rowUpd(tab, 'Road trip'), rowSub(tab, 'Road trip'));
      // B: open, edit (remove), Back, reopen, library load.
      t.openDetail(lib(t, 'p2'));
      return H.wait(200);
    }).then(function () {
      t.applyRemove(t.state.detail, 'spotify:track:s4', 'b6');
      tab.env.pls.p2.snap = 'b6'; tab.env.pls.p2.items = tab.env.pls.p2.items.filter(function (x) { return x.id !== 's4'; });
      check('15B no Updated while open after the edit', !t.plUpdated(lib(t, 'p2')));
      t.closeDetail();
      return H.wait(50);
    }).then(function () {
      check('15B back in the list: no Updated', !rowUpd(tab, 'Band jams'));
      t.openDetail(lib(t, 'p2'));
      return H.wait(200);
    }).then(function () {
      check('15B reopened: edited snapshot stored', seen(s).p2.s === 'b6', seen(s).p2);
      t.closeDetail();
      return reload(tab);
    }).then(function () {
      check('15B next load: no Updated', !rowUpd(tab, 'Band jams'), rowSub(tab, 'Band jams'));
      // A new tab starting from the saved library shows no Updated either.
      return setup(s, { filter: 'playlists', startWait: 50, pls: tab.env.pls });
    }).then(function (tab2) {
      check('15 a later visit from the saved library: no Updated', !rowUpd(tab2, 'Road trip') && !rowUpd(tab2, 'Band jams'), [rowSub(tab2, 'Road trip'), rowSub(tab2, 'Band jams'), tab2.env.pls.p1.snap, seen(s).p1]);
      tab2.t().stopApp();
    });
  });
});

// 16. Review fix: Play records an open only after the player cool-off check, and only once your account is known.
tests.push(function () {
  var s = store0({ 'lib-pins': [{ kind: 'playlist', id: 'p3', name: 'Friend mix', uri: 'spotify:playlist:p3', url: '', img: '', sub: 'Playlist', ownerId: 'friend2', collaborative: false }] });
  return setup(s, { filter: 'home' }).then(function (tab) {
    var t = tab.t(), now = Date.now();
    tab.env.pls.p3.snap = 'c2';
    return reload(tab).then(function () {
      s.setItem('lib-cooloff', JSON.stringify({ player: { until: now + 600000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: { at: now, reason: 'rate', retryAfter: null, what: 'PUT /me/player/play' } } }));
      tab.calls.length = 0;
      click(tab, card(tab, 'hPinned', 'Friend mix').parentNode.querySelector('.cardplay'));
      return H.wait(200);
    }).then(function () {
      check('16 player paused: Play sends nothing', tab.calls.filter(function (c) { return c.path === '/me/player/play'; }).length === 0, byPath(tab));
      check('16 player paused: open not recorded', seen(s).p3.s === 'c1' && seen(s).p3.o === 0, seen(s).p3);
      check('16 player paused: label stays', cardUpd(tab, 'hPinned', 'Friend mix'));
      s.removeItem('lib-cooloff');
      var me = t.state.data.me;
      t.state.data.me = null;
      click(tab, card(tab, 'hPinned', 'Friend mix').parentNode.querySelector('.cardplay'));
      return H.wait(300).then(function () {
        check('16 account not known: open not recorded', seen(s).p3.s === 'c1' && seen(s).p3.o === 0, seen(s).p3);
        t.state.data.me = me;
      });
    }).then(function () {
      tab.calls.length = 0;
      click(tab, card(tab, 'hPinned', 'Friend mix').parentNode.querySelector('.cardplay'));
      return H.wait(300);
    }).then(function () {
      check('16 account known, not paused: recorded', seen(s).p3.s === 'c2' && seen(s).p3.o > 0, seen(s).p3);
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
