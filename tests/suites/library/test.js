'use strict';
// Library tests: loading the library (loadData), the list views and their sorting, the song-list detail views
// (paging, saved album lists, fallbacks, errors, Back), likes, pins, the local caches, theme and the settings sheet.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
// (Pinned play buttons, Jump back in and Continue are in home-shortcuts; the Find box is in find-in-list.)
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) {
  if (grp) { grp.parts.push([name, !!cond, info]); return; }
  results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info)));
}
// Related checks are reported as one line: group('name') ... end(). A failing line names each failed part.
var grp = null;
function group(name) { end(); grp = { name: name, parts: [] }; }
function end() {
  if (!grp) return;
  var g = grp; grp = null;
  var bad = g.parts.filter(function (p) { return !p[1]; });
  check(g.name + ' (' + g.parts.length + ' parts)', !bad.length, bad.map(function (p) { return { part: p[0], info: p[2] }; }));
}

var API = 'https://api.spotify.com/v1';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };

// ---------- fixtures ----------
function rawPl(id, owner, name, n) {
  return { id: id, uri: 'spotify:playlist:' + id, name: name, images: [], owner: { id: owner, display_name: owner }, collaborative: false, items: { total: n } };
}
function rawAlbum(id, name, artist, date, n) {
  return { id: id, uri: 'spotify:album:' + id, name: name, images: [], artists: [{ id: 'X' + id, name: artist }], release_date: date, total_tracks: n || 10 };
}
function track(id, name, opts) {
  opts = opts || {};
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: name || ('Song ' + id), duration_ms: opts.dur === undefined ? 180000 : opts.dur,
    album: opts.album || { id: 'AX', name: 'Other Album', images: [], uri: 'spotify:album:AX' }, artists: [{ name: opts.artist || 'Band' }],
    track_number: opts.num || 1, disc_number: 1 };
}
function albumTracks(albumId, n, start) {
  var out = [];
  for (var i = start || 0; i < n; i++) out.push(track(albumId + 't' + i, 'Cut ' + (i + 1), { num: i + 1, album: { id: albumId, name: 'x', images: [], uri: 'spotify:album:' + albumId, total_tracks: n } }));
  return out;
}
// Liked Songs: 120 songs, newest liked first, named "Track 120" down to "Track 1".
var LIKED = [];
for (var li = 1; li <= 120; li++) LIKED.push({ added_at: '2026-01-01T00:00:00Z', track: track('L' + li, 'Track ' + (121 - li), { artist: li % 2 ? 'Beta' : 'Alpha' }) });

function lib() {
  return {
    playlists: [rawPl('P1', 'me1', 'Morning Run', 10), rawPl('P2', 'other', 'Their Mix', 50), rawPl('P3', 'me1', 'the Alpha List', 5),
      rawPl('P4', 'me1', 'Zed 2', 20), rawPl('P5', 'me1', 'Zed 10', 7)],
    plPaged: true,
    albums: [rawAlbum('A1', 'Blue', 'Zeta', '2019-05-01', 45), rawAlbum('A2', 'apple', 'Alpha', '2021-01-01', 60), rawAlbum('A3', 'Céline', 'Mid', '2020', 4)],
    artists: [{ id: 'R1', uri: 'spotify:artist:R1', name: 'Some Artist', images: [], genres: ['rock'] }],
    shows: [{ id: 'S1', uri: 'spotify:show:S1', name: 'Money Show', images: [], total_episodes: 20 }],
    likedTotal: 120, episodesTotal: 3
  };
}
function episode(id, showId) {
  return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Episode ' + id, release_date: '2026-11-0' + id.slice(-1), duration_ms: 1800000, images: [],
    show: { id: showId, name: 'Show ' + showId, images: [] }, resume_point: { fully_played: false, resume_position_ms: 0 } };
}
function err(status, msg) { return { status: status, json: { error: { status: status, message: msg } } }; }

// env: {lib, fail: {path: status}, over(method, path, q, call), saved: {uri: bool}, albums: {id: tracks[]}}
function routes(env) {
  return function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (env.over) { var o = env.over(method, path, q, call); if (o) return o; }
    if (env.fail[path]) return err(env.fail[path], 'Boom ' + path);
    var L = env.lib;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'Rich' } };
    if (path === '/me/playlists') {
      var off = +(q.get('offset') || 0);
      if (!L.plPaged) return { status: 200, json: { items: L.playlists, next: null, total: L.playlists.length } };
      return off === 0 ? { status: 200, json: { items: L.playlists.slice(0, 3), next: API + '/me/playlists?limit=50&offset=3', total: L.playlists.length } }
        : { status: 200, json: { items: L.playlists.slice(3), next: null, total: L.playlists.length } };
    }
    if (path === '/me/albums') return { status: 200, json: { items: L.albums.map(function (a) { return { added_at: '2026-01-01T00:00:00Z', album: a }; }), next: null } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: L.artists, next: null } } };
    if (path === '/me/shows') return { status: 200, json: { items: L.shows.map(function (s) { return { show: s }; }), next: null } };
    if (path === '/me/tracks') {
      if (q.get('limit') === '1') return { status: 200, json: { items: [], next: null, total: L.likedTotal } };
      var o2 = +(q.get('offset') || 0);
      var page = LIKED.slice(o2, o2 + 50);
      return { status: 200, json: { items: page, total: LIKED.length, next: o2 + 50 < LIKED.length ? API + '/me/tracks?limit=50&offset=' + (o2 + 50) : null } };
    }
    if (path === '/me/episodes') {
      if (q.get('limit') === '1') return { status: 200, json: { items: [], next: null, total: L.episodesTotal } };
      return { status: 200, json: { items: (env.savedEps || []).map(function (e) { return { added_at: '2026-11-01T00:00:00Z', episode: e }; }), next: null, total: (env.savedEps || []).length } };
    }
    if (path === '/me/library/contains') {
      var uris = (q.get('uris') || '').split(',');
      return { status: 200, json: uris.map(function (u) { return env.saved[u] === true; }) };
    }
    if (path === '/me/library' && (method === 'PUT' || method === 'DELETE')) return { status: 200 };
    var am = /^\/albums\/([^/]+)\/tracks$/.exec(path);
    if (am && env.albums[am[1]]) {
      var all = env.albums[am[1]], ao = +(q.get('offset') || 0), lim = +(q.get('limit') || 50);
      return { status: 200, json: { items: all.slice(ao, ao + lim), total: all.length, next: ao + lim < all.length ? API + path + '?limit=50&offset=' + (ao + lim) : null } };
    }
    var pm = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (pm && env.plItems && env.plItems[pm[1]]) return { status: 200, json: { items: env.plItems[pm[1]], total: env.plItems[pm[1]].length, next: null } };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  };
}

function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('playlists'));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
// opts: {lib, fail, over, saved, albums, plItems, savedEps, session (a store used as sessionStorage), matchMedia}
function setup(store, opts) {
  opts = opts || {};
  var env = { lib: opts.lib || lib(), fail: opts.fail || {}, over: opts.over || null, saved: opts.saved || {},
    albums: opts.albums || { A1: albumTracks('A1', 45), A2: albumTracks('A2', 60), A3: albumTracks('A3', 4) }, plItems: opts.plItems || null, savedEps: opts.savedEps || null };
  var tabOpts = { matchMedia: opts.matchMedia };
  if (opts.session) tabOpts.beforeParse = function (w) { Object.defineProperty(w, 'sessionStorage', { value: opts.session, configurable: true }); };
  var tab = H.makeTab(store, routes(env), tabOpts);
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.boot = tab.calls.slice();
    tab.bootToasts = tab.toasts().slice();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function reqs(list, method, path) { return list.filter(function (c) { return (!method || c.method === method) && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
// Names of the rows in the main library list (the last ul.list in #main, i.e. not Pinned).
function rowNames(tab, sel) { return qa(tab, (sel || '#main ul.list') + ' > li a.item .name').map(function (n) { return n.textContent; }); }
function mainList(tab) { var uls = qa(tab, '#main > ul.list'); return uls[uls.length - 1]; }
function mainNames(tab) { var ul = mainList(tab); return ul ? [].slice.call(ul.querySelectorAll('li a.item .name')).map(function (n) { return n.textContent; }) : []; }
function detailNames(tab) { return qa(tab, '#dlist > li a.item .name').map(function (n) { return n.textContent; }); }
function rowFor(tab, name) { return qa(tab, '#main li.row').filter(function (li) { var n = li.querySelector('a.item .name'); return n && n.textContent === name; })[0]; }
function chip(tab, view, label) { return qa(tab, '.sortbar[data-view="' + view + '"] button.chip').filter(function (b) { return b.textContent === label; })[0]; }
function sum(tab) { var s = $(tab, 'dsum'); return s ? s.textContent : null; }
function footBtn(tab, text) { return qa(tab, '#dfoot button').filter(function (b) { return b.textContent === text; })[0]; }
function stored(store, k) { var v = store.getItem(k); return v == null ? null : JSON.parse(v); }
function lastToast(tab) { var t = tab.toasts(); return t[t.length - 1]; }
function finish(tab) { try { tab.t().stopApp(); } catch (e) {} try { tab.w.close(); } catch (e) {} }

var tests = [];

// 1. Startup: which endpoints loadData asks, paging, what is cached, and the first render.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var b = tab.boot;
    group('1 startup asks each library endpoint once, with paging and limits');
    check('1 /me asked once', reqs(b, 'GET', '/me').length === 1, reqs(b, 'GET', '/me'));
    var pl = reqs(b, 'GET', '/me/playlists').map(function (c) { return c.query; });
    check('1 playlists: limit=50, then the next page', JSON.stringify(pl) === JSON.stringify(['?limit=50', '?limit=50&offset=3']), pl);
    check('1 saved albums: limit=50, one page', JSON.stringify(reqs(b, 'GET', '/me/albums').map(function (c) { return c.query; })) === '["?limit=50"]');
    var fo = reqs(b, 'GET', '/me/following');
    check('1 followed artists: type=artist&limit=50', fo.length === 1 && fo[0].query === '?type=artist&limit=50', fo);
    check('1 Liked Songs: only the total (limit=1)', JSON.stringify(reqs(b, 'GET', '/me/tracks').map(function (c) { return c.query; })) === '["?limit=1"]', reqs(b, 'GET', '/me/tracks'));
    check('1 saved shows limit=50 and saved episodes total limit=1',
      JSON.stringify(reqs(b, 'GET', '/me/shows').map(function (c) { return c.query; })) === '["?limit=50"]' &&
      JSON.stringify(reqs(b, 'GET', '/me/episodes').map(function (c) { return c.query; })) === '["?limit=1"]');
    check('1 nothing written to Spotify at startup', b.filter(function (c) { return c.method !== 'GET'; }).length === 0, b.filter(function (c) { return c.method !== 'GET'; }));
    var c = stored(store, 'lib-cache');
    group('1 the whole library is cached on the phone');
    check('1 library cached on the phone', c && typeof c.at === 'number' && c.me.id === 'me1' && c.me.name === 'Rich', c && c.me);
    check('1 cache: all 5 playlists across both pages, in order', c && c.playlists.map(function (p) { return p.id; }).join() === 'P1,P2,P3,P4,P5', c && c.playlists);
    check('1 cache: albums, artists, shows, totals', c && c.albums.length === 3 && c.artists.length === 1 && c.shows.length === 1 && c.likedTotal === 120 && c.episodesTotal === 3, c);
    check('1 cache: playlist owner and count kept', c && c.playlists[1].ownerId === 'other' && c.playlists[1].count === 50);
    group('1 Playlists list: Liked Songs first with its count, then the playlists');
    check('1 Playlists list: Liked Songs first, then the playlists', JSON.stringify(mainNames(tab)) === JSON.stringify(['Liked Songs', 'Morning Run', 'Their Mix', 'the Alpha List', 'Zed 2', 'Zed 10']), mainNames(tab));
    var liked = rowFor(tab, 'Liked Songs');
    check('1 Liked Songs row says how many songs', liked && liked.querySelector('.sub').textContent === 'Playlist · 120 songs', liked && liked.querySelector('.sub').textContent);
    check('1 playlist row sub: owner and song count', rowFor(tab, 'Their Mix').querySelector('.sub').textContent === 'Playlist · other · 50 songs');
    finish(tab);
  });
});

// 2. Paging stops after 60 pages even if Spotify keeps answering with a next link.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var n = 0;
    tab.env.over = function (m, p) {
      if (p === '/me/playlists') { n++; return { status: 200, json: { items: [rawPl('Q' + n, 'me1', 'Loop ' + n, 1)], next: API + '/me/playlists?limit=50&offset=' + n } }; }
    };
    return tab.t().loadData().then(function (data) {
      check('2 at most 60 pages are followed', n === 60 && data.playlists.length === 60, { n: n, len: data.playlists.length });
      finish(tab);
    });
  });
});

// 3. Optional parts: artists and podcasts can fail without breaking the library.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.fail = { '/me/following': 403, '/me/shows': 500 };
    return t.loadData().then(function (data) {
      group('3 failed artists and podcasts come back null; the rest loads');
      check('3 failed artists come back as null', data.artists === null, data.artists);
      check('3 failed podcasts come back as null', data.shows === null, data.shows);
      check('3 the rest of the library is intact', data.playlists.length === 5 && data.albums.length === 3 && data.likedTotal === 120 && data.episodesTotal === 3, data);
      t.state.data = data;
      t.setFilter('artists');
      var e = d(tab).querySelector('#main .err');
      end();
      check('3 Artists filter explains the failure', e && e.textContent === 'Couldn’t load your followed artists. Tap Refresh to try again.', e && e.textContent);
      tab.env.fail = { '/me/tracks': 500 };
      return t.loadData();
    }).then(function (data2) {
      // #26 (audit/keep-account-on-failure): a failed Liked Songs total on a reload keeps the last known total.
      group('3 a failed Liked Songs total keeps the last one; with none known it is null and leaves no row');
      check('3 a failed Liked Songs total on a reload keeps the last total', data2.likedTotal === 120 && data2.playlists.length === 5, data2.likedTotal);
      t.state.data = data2;
      t.setFilter('playlists');
      check('3 Liked Songs row stays after a failed total', mainNames(tab).indexOf('Liked Songs') !== -1, mainNames(tab));
      t.state.data.likedTotal = null;   // no total known yet
      return t.loadData();
    }).then(function (data3) {
      check('3 a failed Liked Songs total with none known is null, not an error', data3.likedTotal === null && data3.playlists.length === 5, data3.likedTotal);
      t.state.data = data3;
      t.setFilter('playlists');
      check('3 no Liked Songs row without a total', mainNames(tab).indexOf('Liked Songs') === -1, mainNames(tab));
      t.state.data.artists = [];
      t.setFilter('artists');
      var em = d(tab).querySelector('#main .empty');
      end();
      check('3 no followed artists: says so', em && em.textContent === 'You don’t follow any artists yet.', em && em.textContent);
      finish(tab);
    });
  });
});

// 4. A required part failing: nothing cached, the error shows; with a cache, the list stays and a toast says so.
tests.push(function () {
  var store = seed();
  return setup(store, { fail: { '/me/albums': 500 } }).then(function (tab) {
    var e = d(tab).querySelector('#main .err');
    group('4 no cache: the error shows on the page, nothing is cached');
    // #41: a 5xx is said in plain words, with Try again next to it
    check('4 no cache: the error shows on the page', e && e.textContent === 'Couldn’t load your library. Spotify isn’t answering right now.', e && e.textContent);
    check('4 no cache: Try again next to the error', !!d(tab).querySelector('#main button.libretry'));
    check('4 a half-loaded library is not cached', store.getItem('lib-cache') === null, store.getItem('lib-cache'));
    finish(tab);
    var store2 = seed();
    return setup(store2).then(function (tab2) {
      finish(tab2);
      return setup(store2, { fail: { '/me/albums': 500 } });
    }).then(function (tab3) {
      group('4 with a cache: the list stays and a toast says the refresh failed');
      check('4 with a cache: the cached list is shown', mainNames(tab3).length === 6 && mainNames(tab3)[1] === 'Morning Run', mainNames(tab3));
      check('4 with a cache: a toast says the refresh failed', tab3.bootToasts.indexOf('Couldn’t refresh. Spotify isn’t answering right now.') !== -1, tab3.bootToasts);   // #41
      finish(tab3);
    });
  });
});

// 5. Playlists: sort chips, stored per view, Liked Songs stays first.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var labels = qa(tab, '.sortbar[data-view="playlists"] button.chip').map(function (b) { return b.textContent; });
    group('5 playlist sort options, Default pressed');
    check('5 playlist sort options', JSON.stringify(labels) === JSON.stringify(['Default', 'Recents', 'A–Z', 'Most songs', 'By you']), labels);   // v2.58: Recents, and the By you filter after the sorts
    check('5 Default is pressed at first', chip(tab, 'playlists', 'Default').getAttribute('aria-pressed') === 'true');
    click(tab, chip(tab, 'playlists', 'A–Z'));
    group('5 A–Z ignores The, orders numbers, is stored and pressed');
    check('5 A–Z ignores "The" and counts numbers', JSON.stringify(mainNames(tab)) === JSON.stringify(['Liked Songs', 'the Alpha List', 'Morning Run', 'Their Mix', 'Zed 2', 'Zed 10']), mainNames(tab));
    check('5 A–Z choice stored', stored(store, 'lib-sort-playlists') === 'az');
    check('5 A–Z chip pressed and focused', chip(tab, 'playlists', 'A–Z').getAttribute('aria-pressed') === 'true' && d(tab).activeElement === chip(tab, 'playlists', 'A–Z'));
    click(tab, chip(tab, 'playlists', 'Most songs'));
    group('5 Most songs: biggest first, Liked Songs still first, nothing sent');
    check('5 Most songs: biggest first, Liked Songs still first', JSON.stringify(mainNames(tab)) === JSON.stringify(['Liked Songs', 'Their Mix', 'Zed 2', 'Morning Run', 'Zed 10', 'the Alpha List']), mainNames(tab));
    check('5 sorting sends nothing', tab.calls.length === 0, tab.calls);
    finish(tab);
    return setup(store).then(function (tab2) {
      group('5 the sort survives a reload; Default restores the order');
      check('5 the choice survives a reload', mainNames(tab2)[1] === 'Their Mix' && chip(tab2, 'playlists', 'Most songs').getAttribute('aria-pressed') === 'true', mainNames(tab2));
      click(tab2, chip(tab2, 'playlists', 'Default'));
      check('5 Default restores Spotify\'s order', mainNames(tab2).slice(1).join() === 'Morning Run,Their Mix,the Alpha List,Zed 2,Zed 10', mainNames(tab2));
      finish(tab2);
    });
  });
});

// 6. Albums: four sorts; library albums show a filled heart and a pin.
tests.push(function () {
  var store = seed({ 'lib-filter': 'albums' });
  return setup(store).then(function (tab) {
    group('6 album sorts: Recently saved, A–Z, Artist A–Z, Release date');
    check('6 Recently saved is the default order', mainNames(tab).join() === 'Blue,apple,Céline', mainNames(tab));
    click(tab, chip(tab, 'albums', 'A–Z'));
    check('6 A–Z ignores case and accents', mainNames(tab).join() === 'apple,Blue,Céline', mainNames(tab));
    click(tab, chip(tab, 'albums', 'Artist A–Z'));
    check('6 Artist A–Z', mainNames(tab).join() === 'apple,Céline,Blue', mainNames(tab));
    click(tab, chip(tab, 'albums', 'Release date'));
    check('6 Release date: newest first, year-only dates fit in', mainNames(tab).join() === 'apple,Céline,Blue', mainNames(tab));
    var h = rowFor(tab, 'Blue').querySelector('button.heart');
    group('6 album rows: filled heart, pin, second line');
    check('6 library album heart is filled', h && h.getAttribute('aria-pressed') === 'true' && h.getAttribute('aria-label') === 'Save “Blue”', h && h.outerHTML.slice(0, 200));
    check('6 album rows have a pin button', !!rowFor(tab, 'Blue').querySelector('button.pinbtn'));
    check('6 album row sub', rowFor(tab, 'Blue').querySelector('.sub').textContent === 'Album · Zeta');
    finish(tab);
  });
});

// 7. Which rows can be saved (hearts) and pinned.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    group('7 hearts and pins on library rows');
    check('7 own playlist: no heart', !rowFor(tab, 'Morning Run').querySelector('button.heart'));
    var h = rowFor(tab, 'Their Mix').querySelector('button.heart');
    check('7 someone else\'s playlist in your list: filled heart', h && h.getAttribute('aria-pressed') === 'true');
    check('7 Liked Songs row: no heart, no pin', !rowFor(tab, 'Liked Songs').querySelector('button.heart') && !rowFor(tab, 'Liked Songs').querySelector('button.pinbtn'));
    t.setFilter('artists');
    check('7 artist row: pin, no heart', !!rowFor(tab, 'Some Artist').querySelector('button.pinbtn') && !rowFor(tab, 'Some Artist').querySelector('button.heart'));
    var own = { kind: 'playlist', uri: 'spotify:playlist:P1', ownerId: 'me1' }, other = { kind: 'playlist', uri: 'spotify:playlist:P2', ownerId: 'other' };
    group('7 canSave and savableUris');
    check('7 canSave: songs, episodes, albums, podcasts', ['track', 'episode', 'album', 'show'].every(function (k) { return t.canSave({ kind: k, uri: 'spotify:' + k + ':x' }) === true; }));
    check('7 canSave: own playlist no, others\' yes', t.canSave(own) === false && t.canSave(other) === true);
    check('7 canSave: Liked Songs, artists and items without a URI are not savable',
      !t.canSave({ kind: 'liked', uri: null }) && !t.canSave({ kind: 'artist', uri: 'spotify:artist:R1' }) && !t.canSave({ kind: 'track' }) && !t.canSave(null));
    var su = t.savableUris([own, other, { kind: 'track', uri: 'spotify:track:t' }, { kind: 'artist', uri: 'spotify:artist:a' }]);
    check('7 savableUris keeps only savable ones', JSON.stringify(su) === JSON.stringify(['spotify:playlist:P2', 'spotify:track:t']), su);
    group('7 canPin');
    check('7 canPin: playlist, album, artist, podcast', ['playlist', 'album', 'artist', 'show'].every(function (k) { return t.canPin({ kind: k, id: 'x', uri: 'spotify:' + k + ':x' }); }));
    check('7 canPin: not songs, episodes, Liked Songs, or without an id',
      !t.canPin({ kind: 'track', id: 'x', uri: 'u' }) && !t.canPin({ kind: 'episode', id: 'x', uri: 'u' }) && !t.canPin({ kind: 'liked', uri: null }) && !t.canPin({ kind: 'album', uri: 'u' }));
    finish(tab);
  });
});

// 8. All: grouped by kind in Default, sorted together in A–Z (Liked Songs and Saved episodes stay first).
tests.push(function () {
  var store = seed({ 'lib-filter': 'all' });
  return setup(store).then(function (tab) {
    group('8 All: grouped by kind, A–Z mixed, Saved episodes row');
    check('8 All default: Liked, playlists, albums, artists, Saved episodes, podcasts',
      mainNames(tab).join() === 'Liked Songs,Morning Run,Their Mix,the Alpha List,Zed 2,Zed 10,Blue,apple,Céline,Some Artist,Saved episodes,Money Show', mainNames(tab));
    click(tab, chip(tab, 'all', 'A–Z'));
    check('8 All A–Z: Liked Songs and Saved episodes first, then everything by name',
      mainNames(tab).join() === 'Liked Songs,Saved episodes,the Alpha List,apple,Blue,Céline,Money Show,Morning Run,Some Artist,Their Mix,Zed 2,Zed 10', mainNames(tab));
    var se = rowFor(tab, 'Saved episodes');
    check('8 Saved episodes row counts episodes', se && se.querySelector('.sub').textContent === 'Podcast · 3 episodes');
    finish(tab);
  });
});

// 9. Filter by name (the box above the lists).
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var box = $(tab, 'search');
    box.value = 'zed';
    box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
    group('9 filter by name: as you type, second line, no match, sends nothing');
    check('9 filters the list as you type', mainNames(tab).join() === 'Zed 2,Zed 10', mainNames(tab));
    box.value = 'other';
    box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
    check('9 matches the second line too (owner)', mainNames(tab).join() === 'Their Mix', mainNames(tab));
    box.value = 'nomatch';
    box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
    var e = d(tab).querySelector('#main .empty');
    check('9 no match: says so', e && e.textContent === 'Nothing matches “nomatch”.', e && e.textContent);
    check('9 filtering sends nothing', tab.calls.length === 0, tab.calls);
    box.value = '';
    box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
    check('9 clearing shows everything again', mainNames(tab).length === 6);
    finish(tab);
  });
});

// 10. Filter chips: pressed state, stored choice, the box's role, restored on reload.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    click(tab, d(tab).querySelector('.filters .chip[data-filter="albums"]'));
    group('10 filter chips: pressed, stored, the box changes role');
    check('10 chip pressed', d(tab).querySelector('.filters .chip[data-filter="albums"]').getAttribute('aria-pressed') === 'true' &&
      d(tab).querySelector('.filters .chip[data-filter="playlists"]').getAttribute('aria-pressed') === 'false');
    check('10 choice stored', stored(store, 'lib-filter') === 'albums');
    check('10 the list changes', mainNames(tab).join() === 'Blue,apple,Céline', mainNames(tab));
    check('10 box filters by name', $(tab, 'search').placeholder === 'Filter by name or paste a link' && $(tab, 'schips').hidden);   // #52: or paste a link
    tab.t().setFilter('search');
    check('10 Search Spotify turns the box into a search', $(tab, 'search').placeholder === 'Search Spotify or paste a link' && !$(tab, 'schips').hidden);   // #52
    tab.t().setFilter('albums');
    finish(tab);
    return setup(store).then(function (tab2) {
      group('10 reload opens the stored filter; an unknown one means Home');
      check('10 reload opens the stored filter', tab2.t().state.filter === 'albums' && mainNames(tab2).join() === 'Blue,apple,Céline', mainNames(tab2));
      finish(tab2);
      store.setItem('lib-filter', JSON.stringify('bogus'));
      return setup(store);
    }).then(function (tab3) {
      check('10 an unknown stored filter falls back to Home', tab3.t().state.filter === 'home');
      finish(tab3);
    });
  });
});

// 11. Home: Liked Songs row, Your playlists (pinned ones left out, See all), and the empty state.
tests.push(function () {
  var store = seed({ 'lib-filter': 'home', 'lib-pins': [{ kind: 'playlist', id: 'P1', name: 'Morning Run', uri: 'spotify:playlist:P1', url: 'https://open.spotify.com/playlist/P1', img: '', sub: 'Playlist', ownerId: 'me1' }] });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.state.recentTriedAt = Date.now();
    var hero = d(tab).querySelector('#main ul.hero a.item .name');
    group('11 Home: Liked Songs first, Your playlists without pinned ones, See all');
    check('11 Home starts with Liked Songs', hero && hero.textContent === 'Liked Songs');
    var pls = qa(tab, 'ul[aria-labelledby="hPlaylists"] .clname').map(function (n) { return n.textContent; });
    check('11 Your playlists leaves out pinned ones', pls.join() === 'Their Mix,the Alpha List,Zed 2,Zed 10', pls);
    click(tab, d(tab).querySelector('button[data-see="hPlaylists"]'));
    check('11 See all opens Playlists', t.state.filter === 'playlists' && stored(store, 'lib-filter') === 'playlists');
    finish(tab);
    var empty = { playlists: [], plPaged: false, albums: [], artists: [], shows: [], likedTotal: 0, episodesTotal: null };
    return setup(seed({ 'lib-filter': 'home' }), { lib: empty, fail: { '/me/tracks': 500 } });
  }).then(function (tab2) {
    var e = d(tab2).querySelector('#main .empty');
    end();
    check('11 empty library: Home says Nothing here yet', e && e.textContent === 'Nothing here yet.', d(tab2).getElementById('main').textContent);
    finish(tab2);
  });
});

// 12. Liked Songs: paging, the summary line, sorting the loaded songs, hearts, Back.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, rowFor(tab, 'Liked Songs').querySelector('a.item'));
    return H.wait(100).then(function () {
      var q = reqs(tab.calls, 'GET', '/me/tracks').map(function (c) { return c.query; });
      group('12 Liked Songs page 1: request, rows, summary, history entry, hearts, no checks');
      check('12 first page: limit=50&offset=0', JSON.stringify(q) === '["?limit=50&offset=0"]', q);
      check('12 50 rows', detailNames(tab).length === 50 && detailNames(tab)[0] === 'Track 120', detailNames(tab).length);
      check('12 summary while more remain', sum(tab) === '50 of 120 songs loaded', sum(tab));
      check('12 detail view has its own history entry', tab.w.location.hash === '#detail' && tab.w.history.state && tab.w.history.state.depth === 1, tab.w.history.state);
      check('12 header shows the name', d(tab).querySelector('.dname').textContent === 'Liked Songs' && $(tab, 'top').classList.contains('detail'));
      var hs = qa(tab, '#dlist button.heart');
      check('12 liked songs show filled hearts', hs.length === 50 && hs.every(function (b) { return b.getAttribute('aria-pressed') === 'true'; }));
      check('12 Liked Songs header has no heart', !d(tab).querySelector('.dhead button.heart'));
      check('12 no saved-state check for liked songs', reqs(tab.calls, 'GET', '/me/library/contains').length === 0, tab.calls);
      var labels = qa(tab, '.sortbar[data-view="d-liked"] button.chip').map(function (b) { return b.textContent; });
      group('12 sorting the loaded songs: chips, A–Z, partial note, stored');
      check('12 song sort options', labels.join() === 'Recently liked,Title A–Z,Artist A–Z,Not played lately,Duration,Album,Release date', labels);   // #46: Not played lately; #50: Duration, Album, Release date
      click(tab, chip(tab, 'd-liked', 'Title A–Z'));
      check('12 A–Z sorts the loaded songs', detailNames(tab)[0] === 'Track 71' && detailNames(tab)[49] === 'Track 120', detailNames(tab).slice(0, 2));
      var note = d(tab).querySelector('#dsort .snote');
      check('12 note: sorted within the songs loaded so far', note && note.textContent === 'Sorted within the songs loaded so far');
      check('12 detail sort stored', stored(store, 'lib-sort-d-liked') === 'az');
      tab.calls.length = 0;
      click(tab, footBtn(tab, 'Load more'));
      return H.wait(100);
    }).then(function () {
      group('12 Load more: next page, re-sorted, summary');
      check('12 Load more asks the next page', JSON.stringify(reqs(tab.calls, 'GET', '/me/tracks').map(function (c) { return c.query; })) === '["?limit=50&offset=50"]', tab.calls);
      check('12 100 rows, re-sorted', detailNames(tab).length === 100 && detailNames(tab)[0] === 'Track 21', detailNames(tab)[0]);
      check('12 summary 100 of 120', sum(tab) === '100 of 120 songs loaded', sum(tab));
      click(tab, footBtn(tab, 'Load more'));
      return H.wait(100);
    }).then(function () {
      group('12 fully loaded: count and length, no Load more, default order back');
      check('12 all 120 loaded', detailNames(tab).length === 120 && detailNames(tab)[0] === 'Track 1');
      check('12 summary gives count and length', sum(tab) === '120 songs · 6 hr', sum(tab));
      check('12 no Load more and no partial-sort note at the end', !footBtn(tab, 'Load more') && !d(tab).querySelector('#dsort .snote'));
      click(tab, chip(tab, 'd-liked', 'Recently liked'));
      check('12 Recently liked restores the order', detailNames(tab)[0] === 'Track 120' && detailNames(tab)[119] === 'Track 1');
      tab.calls.length = 0;
      click(tab, d(tab).querySelector('.dhead button.back'));
      return H.wait(100);
    }).then(function () {
      group('12 Back: closes the list, shows the library, sends nothing');
      check('12 Back closes the list', t.state.detail === null && tab.w.location.hash === '' && !$(tab, 'top').classList.contains('detail'), tab.w.location.hash);
      check('12 Back shows the library list again', mainNames(tab)[0] === 'Liked Songs' && mainNames(tab).length === 6, mainNames(tab));
      check('12 Back sends nothing', tab.calls.length === 0, tab.calls);
      finish(tab);
    });
  });
});

// 13. Playlists: your own lists songs (local files left out, hearts asked), others' show a note, 403 means restricted.
tests.push(function () {
  var store = seed();
  var items = [
    { added_at: '2026-02-01T00:00:00Z', item: track('pa', 'Alpha Song', { dur: 120000 }) },
    { added_at: '2026-03-01T00:00:00Z', is_local: true, track: { uri: 'spotify:local:x', name: 'Local' } },
    { added_at: '2026-01-01T00:00:00Z', track: track('pb', 'Beta Song', { dur: 60000 }) }
  ];
  return setup(store, { plItems: { P1: items }, saved: { 'spotify:track:pa': true } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.playlists[0]);
    return H.wait(200).then(function () {
      var r = reqs(tab.calls, 'GET', '/playlists/P1/items');
      group('13 own playlist: request, local files dropped, summary, one check, hearts');
      check('13 own playlist: GET /playlists/{id}/items?limit=50&offset=0', r.length === 1 && r[0].query === '?limit=50&offset=0', tab.calls);
      check('13 local files left out', detailNames(tab).join() === 'Alpha Song,Beta Song', detailNames(tab));
      check('13 summary: 2 songs · 3 min', sum(tab) === '2 songs · 3 min', sum(tab));
      var c = reqs(tab.calls, 'GET', '/me/library/contains');
      check('13 one saved-state check for both songs', c.length === 1 && decodeURIComponent(c[0].query) === '?uris=spotify:track:pa,spotify:track:pb', c);
      var hs = qa(tab, '#dlist button.heart').map(function (b) { return b.getAttribute('aria-pressed'); });
      check('13 hearts follow the answer', hs.join() === 'true,false', hs);
      check('13 own playlist header: no heart', !d(tab).querySelector('.dhead button.heart'));
      click(tab, chip(tab, 'd-playlist', 'Recently added'));
      end();
      check('13 Recently added sorts by added date', detailNames(tab).join() === 'Alpha Song,Beta Song');
      click(tab, chip(tab, 'd-playlist', 'Default'));
      tab.calls.length = 0;
      t.closeDetail();
      t.openDetail(t.state.data.playlists[1]);
      return H.wait(200);
    }).then(function () {
      group('13 someone else\'s playlist: restricted, nothing asked');
      check('13 someone else\'s playlist: nothing asked', reqs(tab.calls, 'GET', /^\/playlists\//).length === 0, tab.calls);
      check('13 restricted note shown', /Spotify only lets personal apps list songs in your own playlists/.test($(tab, 'dfoot').textContent), $(tab, 'dfoot').textContent);
      check('13 restricted: count from the library, no sort chips', sum(tab) === '50 songs' && !d(tab).querySelector('#dsort .sortbar'), sum(tab));
      check('13 restricted: Show songs button and a filled heart', !!footBtn(tab, 'Show songs') && d(tab).querySelector('.dhead button.heart').getAttribute('aria-pressed') === 'true');
      t.closeDetail();
      tab.env.fail = { '/playlists/P3/items': 403 };
      t.openDetail(t.state.data.playlists[2]);
      return H.wait(200);
    }).then(function () {
      end();
      check('13 own playlist answering 403: shown as restricted', t.state.detail.restricted === true && /only lets personal apps/.test($(tab, 'dfoot').textContent));
      finish(tab);
    });
  });
});

// 14. Albums: hearts asked 40 at a time, the list saved on the phone, reopened with no request, partial albums page on.
tests.push(function () {
  var store = seed({ 'lib-filter': 'albums' });
  return setup(store).then(function (tab) {
    click(tab, rowFor(tab, 'Blue').querySelector('a.item'));
    return H.wait(300).then(function () {
      var r = reqs(tab.calls, 'GET', '/albums/A1/tracks');
      group('14 album: one request, rows in order, hearts checked 40 at a time');
      check('14 album: GET /albums/{id}/tracks?limit=50&offset=0', r.length === 1 && r[0].query === '?limit=50&offset=0', r);
      check('14 45 songs in track order', detailNames(tab).length === 45 && detailNames(tab)[0] === 'Cut 1' && detailNames(tab)[44] === 'Cut 45');
      var c = reqs(tab.calls, 'GET', '/me/library/contains').map(function (x) { return decodeURIComponent(x.query).split(',').length; });
      check('14 saved-state checks in batches of 40', JSON.stringify(c) === '[40,5]', c);
      check('14 the album itself is not checked (library album)', !reqs(tab.calls, 'GET', '/me/library/contains').some(function (x) { return decodeURIComponent(x.query).indexOf('spotify:album:A1') !== -1; }));
      var sl = stored(store, 'lib-cache-album:A1');
      group('14 album saved on the phone: minimal copy, note, summary');
      check('14 saved on the phone: at, total, 45 items', sl && typeof sl.at === 'number' && sl.total === 45 && sl.items.length === 45, sl && { total: sl.total, n: sl.items.length });
      check('14 saved copy is minimal', sl && Object.keys(sl.items[0]).sort().join() === 'artists,disc_number,duration_ms,id,name,track_number,uri', sl && Object.keys(sl.items[0]));
      var n = $(tab, 'dnote');
      check('14 note: Saved on this phone · Reload from Spotify', !n.hidden && /Saved on this phone/.test(n.textContent) && /Reload from Spotify/.test(n.textContent), n.textContent);
      check('14 summary: 45 songs · 2 hr 15 min', sum(tab) === '45 songs · 2 hr 15 min', sum(tab));
      finish(tab);
      return setup(store);
    }).then(function (tab2) {
      var t2 = tab2.t();
      t2.openDetail(t2.state.data.albums[0]);
      return H.wait(200).then(function () {
        group('14 reopened after a reload: from the phone, no request');
        check('14 reopened after reload: no album request', reqs(tab2.calls, 'GET', /^\/albums\//).length === 0 && detailNames(tab2).length === 45, tab2.calls);
        check('14 reopened: src is the saved copy', t2.state.detail.src === 'cache');
        tab2.calls.length = 0;
        click(tab2, qa(tab2, '#dnote button').filter(function (b) { return b.textContent === 'Reload from Spotify'; })[0]);
        return H.wait(200);
      }).then(function () {
        var r = reqs(tab2.calls, 'GET', '/albums/A1/tracks');
        end();
        check('14 Reload from Spotify asks page 1 again', r.length === 1 && r[0].query === '?limit=50&offset=0', tab2.calls);
        t2.closeDetail();
        tab2.calls.length = 0;
        t2.openDetail(t2.state.data.albums[1]);
        return H.wait(200);
      }).then(function () {
        var sl = stored(store, 'lib-cache-album:A2');
        end();
        check('14 partial album saved as 50 of 60', sl && sl.total === 60 && sl.items.length === 50, sl && { t: sl.total, n: sl.items.length });
        finish(tab2);
        return setup(store);
      });
    }).then(function (tab3) {
      var t3 = tab3.t();
      t3.openDetail(t3.state.data.albums[1]);
      return H.wait(200).then(function () {
        group('14 saved partial album: Load more asks offset=50 and updates the copy');
        check('14 saved partial album: no request, 50 of 60 loaded', reqs(tab3.calls, 'GET', /^\/albums\//).length === 0 && sum(tab3) === '50 of 60 songs loaded', sum(tab3));
        click(tab3, footBtn(tab3, 'Load more'));
        return H.wait(200);
      }).then(function () {
        var r = reqs(tab3.calls, 'GET', '/albums/A2/tracks');
        check('14 Load more asks offset=50', r.length === 1 && r[0].query === '?limit=50&offset=50', r);
        check('14 all 60 now, saved copy updated', detailNames(tab3).length === 60 && stored(store, 'lib-cache-album:A2').items.length === 60);
        finish(tab3);
      });
    });
  });
});

// 15. A failed song list shows the error; Try again asks the same page.
tests.push(function () {
  var store = seed();
  return setup(store, { fail: { '/albums/A3/tracks': 500 } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[2]);
    return H.wait(200).then(function () {
      var e = d(tab).querySelector('#dfoot .err');
      group('15 failed album: error shown, nothing saved');
      check('15 error shown', e && e.textContent === 'Couldn’t load songs. Spotify isn’t answering right now.', e && e.textContent);   // #41: plain words for a 5xx
      check('15 nothing saved for a failed album', store.getItem('lib-cache-album:A3') === null);
      tab.env.fail = {};
      tab.calls.length = 0;
      click(tab, footBtn(tab, 'Try again'));
      return H.wait(200);
    }).then(function () {
      var r = reqs(tab.calls, 'GET', '/albums/A3/tracks');
      group('15 Try again asks the same page and shows the songs');
      check('15 Try again asks the same page', r.length === 1 && r[0].query === '?limit=50&offset=0', r);
      check('15 songs shown after Try again', detailNames(tab).length === 4 && !d(tab).querySelector('#dfoot .err'));
      finish(tab);
    });
  });
});

// 16. Catalog paused: an unsaved album comes from search; an unsaved podcast from your saved episodes.
tests.push(function () {
  var store = seed();
  var alb = { id: 'A3', name: 'x', images: [], uri: 'spotify:album:A3', total_tracks: 2 };
  return setup(store, {
    savedEps: [episode('e1', 'S1'), episode('e2', 'S9'), episode('e3', 'S1')],
    over: function (m, p, q) {
      if (p === '/search') return { status: 200, json: { tracks: { items: [
        track('s2', 'Second', { num: 2, album: alb }), track('zz', 'Elsewhere', { num: 1, album: { id: 'A9', name: 'y', images: [] } }), track('s1', 'First', { num: 1, album: alb })
      ], next: null } } };
    }
  }).then(function (tab) {
    var t = tab.t();
    store.setItem('lib-cooloff', JSON.stringify({ catalog: { until: Date.now() + 600000, reason: 'quota', strikes: 1, quotaAt: Date.now() } }));
    t.openDetail(t.state.data.albums[2]);
    return H.wait(200).then(function () {
      group('16 album while catalog is paused: found through search, saved when complete');
      check('16 nothing sent to the paused album endpoint', reqs(tab.calls, 'GET', /^\/albums\//).length === 0, tab.calls);
      var s = reqs(tab.calls, 'GET', '/search');
      var sq = s[0] && new tab.w.URLSearchParams(s[0].query);
      check('16 one track search for the album', s.length === 1 && sq.get('type') === 'track' && sq.get('q') === 'album:"Céline" artist:"Mid"' && sq.get('offset') === '0', s[0] && s[0].query);
      check('16 only this album\'s songs, in track order', detailNames(tab).join() === 'First,Second', detailNames(tab));
      check('16 note says it came from search', /From search/.test($(tab, 'dnote').textContent), $(tab, 'dnote').textContent);
      check('16 summary says found', sum(tab) === '2 songs found', sum(tab));
      check('16 complete search result is saved like an album', stored(store, 'lib-cache-album:A3') && stored(store, 'lib-cache-album:A3').items.length === 2);
      check('16 detailFallback is not used once rows are shown', t.detailFallback(t.state.detail) === false);
      t.closeDetail();
      tab.calls.length = 0;
      t.openDetail(t.state.data.shows[0]);
      return H.wait(200);
    }).then(function () {
      group('16 podcast while catalog is paused: your saved episodes of that show');
      check('16 podcast: nothing sent to /shows', reqs(tab.calls, 'GET', /^\/shows\//).length === 0, tab.calls);
      check('16 podcast: saved episodes asked instead', reqs(tab.calls, 'GET', '/me/episodes').length === 1, tab.calls);
      check('16 podcast: only this show\'s saved episodes, newest first', detailNames(tab).join() === 'Episode e3,Episode e1', detailNames(tab));
      check('16 podcast note explains the pause', /Your saved and played episodes from this show/.test($(tab, 'dnote').textContent), $(tab, 'dnote').textContent);
      finish(tab);
    });
  });
});

// 17. Likes: optimistic heart, PUT/DELETE /me/library, toasts, Undo, rollback on error, one request per double tap.
tests.push(function () {
  var store = seed();
  var session = H.makeStore();
  return setup(store, { session: session }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[2]);
    var uri = 'spotify:track:A3t0';
    var heart;
    return H.wait(300).then(function () {
      heart = d(tab).querySelector('#dlist button.heart[data-uri="' + uri + '"]');
      group('17 like: label, heart fills at once');
      check('17 song heart starts empty with a Like label', heart && heart.getAttribute('aria-pressed') === 'false' && heart.getAttribute('aria-label') === 'Like “Cut 1”', heart && heart.getAttribute('aria-label'));
      tab.calls.length = 0;
      click(tab, heart);
      click(tab, heart);   // a double tap while the first is in flight
      check('17 heart fills at once', heart.getAttribute('aria-pressed') === 'true');
      return H.wait(100);
    }).then(function () {
      var w = tab.calls.filter(function (c) { return c.path === '/me/library'; });
      group('17 like: one PUT with the URI in the query, toast, kept for the session');
      check('17 one PUT /me/library for a double tap', w.length === 1 && w[0].method === 'PUT', w);
      check('17 the URI goes in the query, no body', w[0] && decodeURIComponent(w[0].query) === '?uris=' + uri && w[0].body === null, w[0]);
      check('17 toast: Added to Liked Songs', lastToast(tab) === 'Added to Liked Songs', tab.toasts());
      check('17 known saved state updated', t.state.saved[uri] === true);
      return H.wait(1100);
    }).then(function () {
      var ss = JSON.parse(session.getItem('lib-saved') || '{}');
      check('17 saved state kept for this browser session', ss[uri] === true, ss);
      tab.calls.length = 0;
      click(tab, heart);
      group('17 unlike: heart empties at once, DELETE, toast with Undo');
      check('17 unlike empties the heart at once', heart.getAttribute('aria-pressed') === 'false');
      return H.wait(100);
    }).then(function () {
      var w = tab.calls.filter(function (c) { return c.path === '/me/library'; });
      check('17 unlike sends DELETE', w.length === 1 && w[0].method === 'DELETE' && decodeURIComponent(w[0].query) === '?uris=' + uri, w);
      check('17 toast offers Undo', lastToast(tab) === 'Removed “Cut 1”' && $(tab, 'toast').querySelector('.toastbtn').textContent === 'Undo', tab.toasts());
      tab.calls.length = 0;
      click(tab, $(tab, 'toast').querySelector('.toastbtn'));
      return H.wait(100);
    }).then(function () {
      var w = tab.calls.filter(function (c) { return c.path === '/me/library'; });
      group('17 Undo saves it again');
      check('17 Undo saves it again', w.length === 1 && w[0].method === 'PUT' && heart.getAttribute('aria-pressed') === 'true', w);
      check('17 toast: Saved again', lastToast(tab) === 'Saved “Cut 1” again', tab.toasts());
      // The album in the header: DELETE then PUT, with album wording.
      var ah = d(tab).querySelector('.dhead button.heart');
      group('17 album heart: DELETE then PUT, album wording');
      check('17 album header heart is filled with a Save label', ah.getAttribute('aria-pressed') === 'true' && ah.getAttribute('aria-label') === 'Save “Céline”');
      click(tab, ah);
      return H.wait(100).then(function () {
        click(tab, ah);
        return H.wait(100);
      }).then(function () {
        var w2 = tab.calls.filter(function (c) { return c.path === '/me/library' && /album/.test(decodeURIComponent(c.query)); }).map(function (c) { return c.method; });
        check('17 album: DELETE then PUT', w2.join() === 'DELETE,PUT', w2);
        check('17 album toast: Saved to your library', lastToast(tab) === 'Saved to your library', tab.toasts());
      });
    }).then(function () {
      // Errors roll back.
      var h2 = d(tab).querySelector('#dlist button.heart[data-uri="spotify:track:A3t1"]');
      tab.env.over = function (m, p) { if (p === '/me/library') return err(500, 'Server error'); };
      click(tab, h2);
      return H.wait(100).then(function () {
        group('17 failed like and unlike roll back with a toast');
        check('17 failed like: heart empties again', h2.getAttribute('aria-pressed') === 'false' && t.state.saved['spotify:track:A3t1'] === false);
        // #41: plain words for a 5xx, and Try again on the toast
        check('17 failed like: toast says so, with Try again', lastToast(tab) === 'Couldn’t save. Spotify isn’t answering right now.' && !!d(tab).querySelector('#toast .toastbtn[data-retry]'), tab.toasts());
        click(tab, heart);
        return H.wait(100);
      }).then(function () {
        check('17 failed unlike: heart stays filled', heart.getAttribute('aria-pressed') === 'true' && t.state.saved[uri] === true);
        check('17 failed unlike: toast says so, with Try again', lastToast(tab) === 'Couldn’t remove. Spotify isn’t answering right now.' && !!d(tab).querySelector('#toast .toastbtn[data-retry]'), tab.toasts());   // #41
        tab.env.over = null;
        // Library paused: nothing sent, heart unchanged, a toast explains.
        store.setItem('lib-cooloff', JSON.stringify({ library: { until: Date.now() + 600000, reason: 'quota', strikes: 1, quotaAt: Date.now() } }));
        tab.calls.length = 0;
        tab.w.__toasts = [];
        click(tab, h2);
        return H.wait(100);
      }).then(function () {
        group('17 library paused: nothing sent, heart unchanged, toast');
        check('17 library paused: nothing sent', tab.calls.filter(function (c) { return c.path === '/me/library'; }).length === 0, tab.calls);
        check('17 library paused: heart unchanged, toast shown', h2.getAttribute('aria-pressed') === 'false' && /Spotify paused/.test(lastToast(tab) || ''), tab.toasts());
        store.removeItem('lib-cooloff');
        finish(tab);
        // A new page in the same browser session: the saved state is known, so it isn't asked again.
        return setup(store, { session: session });
      });
    }).then(function (tab2) {
      var t2 = tab2.t();
      group('17 a new page in the same browser session uses known saved states');
      check('17 session state loaded on start', t2.state.saved[uri] === true);
      t2.openDetail(t2.state.data.albums[2]);
      return H.wait(300).then(function () {
        var c = reqs(tab2.calls, 'GET', '/me/library/contains').map(function (x) { return decodeURIComponent(x.query); }).join(' ');
        check('17 songs already known this session aren\'t asked about again', c === '', c);
        check('17 its heart is filled from the session', d(tab2).querySelector('#dlist button.heart[data-uri="' + uri + '"]').getAttribute('aria-pressed') === 'true');
        finish(tab2);
      });
    });
  });
});

// 18. When the saved-state check isn't available, it stops asking for this visit.
tests.push(function () {
  var store = seed();
  return setup(store, { over: function (m, p) { if (p === '/me/library/contains') return err(403, 'Forbidden'); } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[2]);
    return H.wait(300).then(function () {
      group('18 saved-state check unavailable: stops asking this visit');
      check('18 one failed check', reqs(tab.calls, 'GET', '/me/library/contains').length === 1);
      check('18 checks switched off', t.state.containsOff === true);
      t.closeDetail();
      t.openDetail(t.state.data.albums[0]);
      return H.wait(300);
    }).then(function () {
      check('18 no more checks this visit', reqs(tab.calls, 'GET', '/me/library/contains').length === 1, reqs(tab.calls, 'GET', '/me/library/contains').length);
      check('18 hearts stay empty', qa(tab, '#dlist button.heart').every(function (b) { return b.getAttribute('aria-pressed') === 'false'; }));
      finish(tab);
    });
  });
});

// 19. Pins: stored on the phone, a Pinned section at the top of its tab and All, the 30 limit.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, rowFor(tab, 'Their Mix').querySelector('button.pinbtn'));
    var pins = stored(store, 'lib-pins');
    group('19 pin: stored record, toast, Pinned section, button state, nothing sent');
    check('19 pin stored', pins && pins.length === 1 && pins[0].kind === 'playlist' && pins[0].id === 'P2' && pins[0].uri === 'spotify:playlist:P2' && pins[0].name === 'Their Mix', pins);
    check('19 pin keeps owner and collaborative for playlists', pins && pins[0].ownerId === 'other' && pins[0].collaborative === false && pins[0].url === 'https://open.spotify.com/playlist/P2');
    check('19 toast: Pinned', lastToast(tab) === 'Pinned “Their Mix”', tab.toasts());
    var heads = qa(tab, '#main h2.sect').map(function (h) { return h.textContent; });
    check('19 Pinned section then Playlists', heads.join() === 'Pinned,Playlists', heads);
    var first = d(tab).querySelector('#main > ul.list');
    check('19 pinned row at the top', first && first.querySelector('a.item .name').textContent === 'Their Mix');
    check('19 pinned row left out of the rest', mainNames(tab).indexOf('Their Mix') === -1 && mainNames(tab).length === 5, mainNames(tab));
    var pb = d(tab).querySelector('.pinbtn[data-pin="spotify:playlist:P2"]');
    check('19 pin button pressed, label says Unpin', pb.getAttribute('aria-pressed') === 'true' && pb.getAttribute('aria-label') === 'Unpin “Their Mix”');
    check('19 isPinned', t.isPinned('spotify:playlist:P2') && !t.isPinned('spotify:playlist:P1'));
    check('19 pinning sends nothing', tab.calls.length === 0, tab.calls);
    click(tab, chip(tab, 'playlists', 'A–Z'));
    group('19 Pinned: first in any sort, in All, not in other kinds');
    check('19 Pinned stays first whatever the sort', d(tab).querySelector('#main > ul.list a.item .name').textContent === 'Their Mix');
    t.setFilter('all');
    check('19 pinned in All too', d(tab).querySelector('#main > ul.list a.item .name').textContent === 'Their Mix' && qa(tab, '#main h2.sect')[0].textContent === 'Pinned');
    t.setFilter('albums');
    check('19 not in another kind\'s tab', qa(tab, '#main h2.sect').length === 0);
    t.setFilter('playlists');
    click(tab, d(tab).querySelector('.pinbtn[data-pin="spotify:playlist:P2"]'));
    group('19 unpin: removed, toast, no Pinned section');
    check('19 unpin: removed and toast', stored(store, 'lib-pins').length === 0 && lastToast(tab) === 'Unpinned “Their Mix”');
    check('19 unpin: no Pinned section', qa(tab, '#main h2.sect').length === 0 && mainNames(tab).length === 6);
    // The 30 limit.
    var many = [];
    for (var i = 0; i < 30; i++) many.push({ kind: 'album', id: 'Z' + i, name: 'Z' + i, uri: 'spotify:album:Z' + i });
    store.setItem('lib-pins', JSON.stringify(many));
    t.togglePin(t.state.data.playlists[0]);
    group('19 the 30 limit and readPins');
    check('19 a 31st pin is refused', stored(store, 'lib-pins').length === 30 && lastToast(tab) === 'You can pin up to 30. Unpin one first.', tab.toasts());
    store.setItem('lib-pins', JSON.stringify(many.concat([{ kind: 'album', id: 'Z99', uri: 'spotify:album:Z99' }])));
    check('19 readPins keeps at most 30', t.readPins().length === 30);
    store.setItem('lib-pins', JSON.stringify([{ kind: 'track', id: 't', uri: 'spotify:track:t' }, { kind: 'album', uri: 'spotify:album:noid' }, null, many[0]]));
    check('19 readPins drops broken entries', t.readPins().length === 1 && t.readPins()[0].id === 'Z0', t.readPins());
    store.setItem('lib-pins', '"oops"');
    check('19 readPins: not a list means none', t.readPins().length === 0);
    finish(tab);
  });
});

// 20. Back with a stack: a list opened on top returns to the one under it; a replaced list returns to the start.
tests.push(function () {
  var store = seed({ 'lib-filter': 'albums' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[0]);
    return H.wait(200).then(function () {
      t.openDetail(t.state.data.albums[2], { push: true });
      return H.wait(200);
    }).then(function () {
      group('20 a view opened on top: depth 2, Back names the view under it');
      check('20 pushed view: depth 2 in history', t.state.detailStack.length === 1 && tab.w.history.state.depth === 2, tab.w.history.state);
      check('20 Back names the view under it', d(tab).querySelector('.dhead button.back').getAttribute('aria-label') === 'Back to “Blue”');
      tab.calls.length = 0;
      click(tab, d(tab).querySelector('.dhead button.back'));
      return H.wait(100);
    }).then(function () {
      group('20 Back returns to the view under it from memory; replacing keeps one level');
      check('20 Back returns to the album under it', t.state.detail && t.state.detail.item.id === 'A1' && detailNames(tab).length === 45, t.state.detail && t.state.detail.item.id);
      check('20 nothing asked again', tab.calls.length === 0, tab.calls);
      check('20 Back label now says list', d(tab).querySelector('.dhead button.back').getAttribute('aria-label') === 'Back to list');
      t.openDetail(t.state.data.albums[2]);   // replaces (as from Now Playing)
      check('20 replacing keeps one level', t.state.detailStack.length === 0 && t.state.detail.item.id === 'A3');
      t.goBack();
      return H.wait(100);
    }).then(function () {
      end();
      check('20 Back from a replaced view goes to the list', t.state.detail === null && mainNames(tab).join() === 'Blue,apple,Céline', mainNames(tab));
      finish(tab);
    });
  });
});

// 21. Local caches: the search cache keeps 40 entries; saved lists have caps, survive a full storage and clear.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.cachePut('track', 'abc', { items: [1] });
    group('21 search cache: get, put, newest 40');
    check('21 cacheGet returns what was put', t.cacheGet('track', 'abc').items[0] === 1 && t.cacheGet('album', 'abc') === null);
    for (var i = 0; i < 40; i++) t.cachePut('all', 'q' + i, { n: i });
    check('21 search cache keeps the newest 40', t.cacheGet('track', 'abc') === null && t.cacheGet('all', 'q0').n === 0 && t.cacheGet('all', 'q39').n === 39 && Object.keys(t.searchCache).length === 40);
    var A = t.SL_ALBUM, S = t.SL_SHOW;
    check('21 saved-list prefixes', A === 'lib-cache-album:' && S === 'lib-cache-show:');
    t.slPut(A, 'x1', { at: 1000, total: 1, items: [{ id: 'a' }] }, 2);
    t.slPut(A, 'x2', { at: 3000, total: 1, items: [{ id: 'b' }] }, 2);
    t.slPut(A, 'x3', { at: 2000, total: 1, items: [{ id: 'c' }] }, 2);
    group('21 saved lists: cap drops the oldest, broken copies rejected');
    check('21 over the cap, the oldest goes', t.slKeys(A).sort().join() === 'lib-cache-album:x2,lib-cache-album:x3', t.slKeys(A));
    check('21 slGet reads a saved list', t.slGet(A, 'x2').items[0].id === 'b');
    store.setItem(A + 'bad1', JSON.stringify({ at: 'x', items: [] }));
    store.setItem(A + 'bad2', JSON.stringify({ at: 5, items: 'no' }));
    check('21 slGet rejects broken copies', t.slGet(A, 'bad1') === null && t.slGet(A, 'bad2') === null && t.slGet(A, 'none') === null && t.slGet(A, '') === null);
    store.removeItem(A + 'bad1'); store.removeItem(A + 'bad2');
    t.slPut(S, 's1', { at: 5, total: null, items: [] }, 60);
    var st = t.slStats();
    group('21 slStats and full storage');
    check('21 slStats counts albums, shows and size', st.albums === 2 && st.shows === 1 && st.chars > 0, st);
    // Full storage: the first try fails; the oldest saved lists are dropped and it tries once more.
    var orig = store.setItem;
    store.setItem = function (k, v) { if (k === A + 'big' && t.slKeys(A).length >= 2) throw new Error('QuotaExceededError'); return orig.call(store, k, v); };
    var ok = t.slPut(A, 'big', { at: 9000, total: 1, items: [{ id: 'z' }] }, 150);
    check('21 storage full: older lists dropped, then saved', ok === true && t.slGet(A, 'big') && t.slKeys(A).length === 1, t.slKeys(A));
    store.setItem = function (k, v) { if (k === A + 'never') throw new Error('QuotaExceededError'); return orig.call(store, k, v); };
    check('21 storage still refusing: false, nothing saved (the older album was dropped trying)', t.slPut(A, 'never', { at: 1, items: [] }, 150) === false && store.getItem(A + 'never') === null && t.slKeys(A).length === 0);
    store.setItem = orig;
    check('21 slPut needs an id', t.slPut(A, '', { at: 1, items: [] }, 150) === false);
    // Settings sheet: the count, then Clear saved lists.
    t.paintSettings();
    group('21 settings count and Clear saved lists');
    check('21 settings show the saved lists', /^Saved lists: 0 albums, 1 show, 0 playlists \(≈ \d+ KB\)$/.test($(tab, 'slInfo').textContent), $(tab, 'slInfo').textContent);   // #53: playlists counted too
    click(tab, $(tab, 'slClear'));
    check('21 Clear saved lists removes them', t.slKeys(A).length === 0 && t.slKeys(S).length === 0);
    check('21 Clear leaves the library cache and pins alone', store.getItem('lib-cache') !== null && store.getItem('lib-token') !== null);
    check('21 Clear: count and toast updated', $(tab, 'slInfo').textContent === 'Saved lists: 0 albums, 0 shows, 0 playlists (≈ 0 KB)' && lastToast(tab) === 'Saved lists cleared.', [$(tab, 'slInfo').textContent, tab.toasts()]);   // #53
    finish(tab);
  });
});

// 22. Clearing saved lists while a saved album is open drops the "Saved on this phone" note.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[2]);
    return H.wait(200).then(function () {
      group('22 clearing saved lists with a saved album open');
      check('22 note shown for the saved album', !$(tab, 'dnote').hidden && /Saved on this phone/.test($(tab, 'dnote').textContent));
      t.clearSavedLists();
      check('22 note gone after clearing', $(tab, 'dnote').hidden && t.state.detail.savedAt === 0);
      check('22 its saved copy is gone', store.getItem('lib-cache-album:A3') === null);
      // saveAlbumList writes it again from what is on screen.
      t.saveAlbumList(t.state.detail);
      check('22 saveAlbumList writes the open album', t.slGet(t.SL_ALBUM, 'A3') && t.slGet(t.SL_ALBUM, 'A3').items.length === 4 && t.state.detail.savedAt > 0);
      finish(tab);
    });
  });
});

// 23. Theme: stored choice applied at load, radios in Settings, matching the phone (matchMedia), the playlist player's theme.
function darkPhone(q) { return { matches: /dark/.test(q), addEventListener: function () {}, addListener: function () {} }; }
tests.push(function () {
  var store = seed({ 'lib-theme': 'dark' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var html = d(tab).documentElement;
    group('23 stored theme, Settings radios, Match phone');
    check('23 stored Dark applied at load', html.getAttribute('data-theme') === 'dark' && t.themeMode() === 'dark' && t.pageIsDark() === true);
    t.paintSettings();
    var radio = function (v) { return d(tab).querySelector('input[name="theme"][value="' + v + '"]'); };
    check('23 Settings show Dark checked', radio('dark').checked && !radio('light').checked && !radio('auto').checked);
    radio('light').checked = true;
    radio('light').dispatchEvent(new tab.w.Event('change', { bubbles: true }));
    check('23 Light: stored and applied', stored(store, 'lib-theme') === 'light' && html.getAttribute('data-theme') === 'light' && t.pageIsDark() === false);
    radio('auto').checked = true;
    radio('auto').dispatchEvent(new tab.w.Event('change', { bubbles: true }));
    check('23 Match phone: stored choice removed, no data-theme', store.getItem('lib-theme') === null && !html.hasAttribute('data-theme') && t.themeMode() === 'auto');
    check('23 Match phone on a light phone: not dark', t.pageIsDark() === false);
    store.setItem('lib-theme', JSON.stringify('purple'));
    t.applyTheme();
    check('23 an unknown stored theme means Match phone', t.themeMode() === 'auto' && !html.hasAttribute('data-theme'));
    finish(tab);
    store.removeItem('lib-theme');
    return setup(store, { matchMedia: darkPhone });
  }).then(function (tab2) {
    var t = tab2.t();
    group('23 Match phone follows matchMedia, and so does the playlist player');
    check('23 Match phone on a dark phone: dark', t.pageIsDark() === true && !d(tab2).documentElement.hasAttribute('data-theme'));
    t.openDetail(t.state.data.playlists[1]);
    return H.wait(200).then(function () {
      // A stand-in for Spotify's iFrame API (as in full-playback): records each player the page builds.
      var made = [];
      var api = { createController: function (elm, o, cb) {
        var ctl = { opts: o, destroyed: 0, addListener: function () {}, pause: function () {}, destroy: function () { ctl.destroyed++; } };
        made.push(ctl);
        setTimeout(function () { cb(ctl); }, 0);
      } };
      click(tab2, footBtn(tab2, 'Show songs'));
      return H.wait(20).then(function () {
        tab2.w.onSpotifyIframeApiReady(api);
        return H.wait(30);
      }).then(function () {
        check('23 playlist player follows the dark phone', made.length === 1 && made[0].opts.url === 'https://open.spotify.com/playlist/P2?theme=0', made.map(function (c) { return c.opts.url; }));
        tab2.t().paintSettings();
        var light = d(tab2).querySelector('input[name="theme"][value="light"]');
        light.checked = true;
        light.dispatchEvent(new tab2.w.Event('change', { bubbles: true }));
        return H.wait(40);
      }).then(function () {
        check('23 choosing Light rebuilds the open player without the dark style', made.length === 2 && made[1].opts.url === 'https://open.spotify.com/playlist/P2' && made[0].destroyed === 1, made.map(function (c) { return [c.opts.url, c.destroyed]; }));
        finish(tab2);
      });
    });
  });
});

// 24. Settings sheet: Search shows first, and the Appearance radios reflect the stored value.
tests.push(function () {
  var store = seed({ 'lib-search-first': 'album' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.paintSettings();
    group('24 settings sheet: Search shows first');
    check('24 Search shows first reflects storage', $(tab, 'searchFirst').value === 'album');
    check('24 no stored theme: Match phone checked', d(tab).querySelector('input[name="theme"][value="auto"]').checked);
    store.setItem('lib-search-first', JSON.stringify('nonsense'));
    t.paintSettings();
    check('24 unknown Search first falls back to Songs', $(tab, 'searchFirst').value === 'track');
    $(tab, 'searchFirst').value = 'show';
    $(tab, 'searchFirst').dispatchEvent(new tab.w.Event('change', { bubbles: true }));
    check('24 changing it is stored', stored(store, 'lib-search-first') === 'show');
    finish(tab);
  });
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).then(end, function (e) { end(); check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
});
