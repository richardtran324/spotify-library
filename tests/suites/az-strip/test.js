'use strict';
// A–Z strip (v2.60) tests: jsdom, mocked fetch, shared localStorage.
// Run: node tests/run.js az-strip  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

// Names chosen to cover the sort key: a leading "The", accents, digits and symbols, mixed case.
var SPECIAL = ['The Beatles', 'Édith Piaf Live', '2 Become 1', '!Action Pact', 'abba gold', 'Zebra', 'the xx'];
var FILL = 'ACDFGHJKMNPRSTW';   // no B, E, I, L, O, Q, U, V, X, Y (B/E/X come only from SPECIAL)
function names(n) {
  var out = SPECIAL.slice();
  for (var i = 0; out.length < n; i++) out.push(FILL[i % FILL.length] + 'name ' + i);
  return out.slice(0, n);
}
function spAlbum(i, name, artist) {
  return { album: { id: 'al' + i, uri: 'spotify:album:al' + i, name: name, images: [], release_date: '2020-01-01', total_tracks: 10,
    artists: [{ id: 'ar' + i, name: artist || ('Artist ' + name) }] } };
}
function spArtist(i, name) { return { id: 'at' + i, uri: 'spotify:artist:at' + i, name: name, images: [], genres: [] }; }
function spPlaylist(i, name) { return { id: 'pl' + i, uri: 'spotify:playlist:pl' + i, name: name, images: [], owner: { id: 'me1', display_name: 'R' }, items: { total: 3 } }; }
function spShow(i, name) { return { show: { id: 'sh' + i, uri: 'spotify:show:sh' + i, name: name, images: [], total_episodes: 3, publisher: 'P' } }; }
function spTrack(i, name, artist) {
  return { added_at: '2026-01-01T00:00:00Z', track: { type: 'track', id: 'tr' + i, uri: 'spotify:track:tr' + i, name: name, duration_ms: 200000,
    album: { id: 'a' + i, name: 'Alb', images: [] }, artists: [{ name: artist || 'Someone' }] } };
}

function store0(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(opts.filter || 'albums'));
  Object.keys(opts.sorts || {}).forEach(function (v) { s.setItem('lib-sort-' + v, JSON.stringify(opts.sorts[v])); });
  if (opts.pins) s.setItem('lib-pins', JSON.stringify(opts.pins));
  return s;
}
// lib: {albums, artists, playlists, shows, liked} counts (or name arrays).
function setup(store, lib) {
  lib = lib || {};
  function list(x) { return Array.isArray(x) ? x : names(x || 0); }
  var env = { liked: list(lib.liked), likedArtists: lib.likedArtists };
  var tab = H.makeTab(store, function (method, path, q) {
    if (method !== 'GET') return undefined;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/albums') return { status: 200, json: { items: list(lib.albums).map(function (n, i) { return spAlbum(i, n, lib.albumArtists && lib.albumArtists[i]); }), next: null, total: list(lib.albums).length } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: list(lib.artists).map(function (n, i) { return spArtist(i, n); }), next: null, total: list(lib.artists).length } } };
    if (path === '/me/playlists') return { status: 200, json: { items: list(lib.playlists).map(function (n, i) { return spPlaylist(i, n); }), next: null, total: list(lib.playlists).length } };
    if (path === '/me/shows') return { status: 200, json: { items: list(lib.shows).map(function (n, i) { return spShow(i, n); }), next: null, total: list(lib.shows).length } };
    if (path === '/me/tracks') {
      var lim = +q.get('limit'), off = +q.get('offset') || 0, all = env.liked;
      var page = all.slice(off, off + lim).map(function (n, j) { return spTrack(off + j, n, env.likedArtists && env.likedArtists[off + j]); });
      var nx = off + lim < all.length ? 'https://api.spotify.com/v1/me/tracks?limit=' + lim + '&offset=' + (off + lim) : null;
      return { status: 200, json: { items: page, next: nx, total: all.length } };
    }
    if (path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    tab.scrolls = [];
    tab.w.scrollTo = function (x, y) { tab.scrolls.push(y); };
    t.renderList();
    return H.wait(50);
  }).then(function () {
    tab.calls.length = 0;
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function q(tab, sel) { return d(tab).querySelector(sel); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function strip(tab) { var n = q(tab, '#azstrip'); return n && !n.hidden ? n : null; }
function letters(tab) { var n = strip(tab); return n ? qa(tab, '#azstrip .azl').map(function (b) { return b.textContent; }).join('') : ''; }
function btn(tab, L) { return q(tab, '#azstrip .azl[data-az="' + L + '"]'); }
function sortChip(tab, s) { return q(tab, '.sortbar [data-sort="' + s + '"]'); }
function notPlayer(tab) { return tab.calls.filter(function (c) { return c.path.indexOf('/me/player') !== 0; }); }
function typeFilter(tab, v) { var b = q(tab, '#search'); b.value = v; b.dispatchEvent(new tab.w.Event('input', { bubbles: true })); }
// jsdom has no layout: give each row a top so a jump has somewhere to go.
function layoutRows(tab) {
  qa(tab, '#main ul.list > li').forEach(function (li, i) {
    li.getBoundingClientRect = function () { var top = 200 + i * 60; return { top: top, bottom: top + 56, left: 0, right: 300, width: 300, height: 56 }; };
  });
  q(tab, '#top').getBoundingClientRect = function () { return { top: 0, bottom: 120, left: 0, right: 375, width: 375, height: 120 }; };
}
function layoutStrip(tab) {
  qa(tab, '#azstrip .azl').forEach(function (b, i) {
    b.getBoundingClientRect = function () { return { top: 130 + i * 20, bottom: 150 + i * 20, left: 319, right: 363, width: 44, height: 20 }; };
  });
}
function rowIndexOf(tab, li) { return qa(tab, '#main ul.list > li').indexOf(li); }
function ptr(tab, type, y) {
  var ev = new tab.w.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
  q(tab, '#azstrip .azcol').dispatchEvent(ev);
}
function rowName(li) { var n = li && li.querySelector('.name'); return n ? n.textContent : null; }

var tests = [];

// 1. Sort key letters: leading "The", accents, digits and symbols under #.
tests.push(function () {
  return setup(store0(), {}).then(function (tab) {
    var t = tab.t();
    var pairs = [['The Beatles', 'B'], ['the xx', 'X'], ['The', 'T'], ['Théo', 'T'], ['Édith', 'E'], ['ólafur', 'O'], ['2Pac', '#'], ['!!!', '#'], ['', '#'], [null, '#'], ['  The Kinks', '#'], ['zz', 'Z'], ['Ørjan', 'O'], ['Łódź', 'L'], ['Æther', 'A'], ['ßeta', 'S'], ['Ангел', '#'], ['東京', '#'], ['\ud83c\udfb5 Tunes', '#']];
    var bad = pairs.filter(function (p) { return t.azLetter(p[0]) !== p[1]; }).map(function (p) { return [p[0], t.azLetter(p[0])]; });
    check('1 letters follow the sort key', !bad.length, bad);
    check('1 fields: A–Z uses name, Artist A–Z uses artist', t.azField('albums', 'az') === 'name' && t.azField('albums', 'artist') === 'artist' && t.azField('d-liked', 'artist') === 'artist' && t.azField('d-liked', 'az') === 'name');
    check('1 no strip for other sorts and views', t.azField('albums', 'saved') === null && t.azField('all', 'az') === null && t.azField('d-playlist', 'az') === null && t.azField('s-album', 'az') === null && t.azField('latest', 'show') === null);
    check('1 threshold is more than 40', t.AZ_MIN === 40);
  });
});

// 2. Albums A–Z with 45 rows: the strip, its letters in list order, labels, zero requests to draw it.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    var n = strip(tab);
    check('2 strip shown', !!n);
    check('2 nav with a label', n && n.tagName === 'NAV' && n.getAttribute('aria-label') === 'Jump to letter');
    check('2 letters in list order, # first, only letters present', letters(tab) === '#ABCDEFGHJKMNPRSTWXZ', letters(tab));
    check('2 # button label', btn(tab, '#') && btn(tab, '#').getAttribute('aria-label') === 'Jump to numbers and symbols');
    check('2 letter button label', btn(tab, 'M') && btn(tab, 'M').getAttribute('aria-label') === 'Jump to M' && btn(tab, 'M').type === 'button');
    check('2 body has-az (rows get room on the right)', d(tab).body.classList.contains('has-az'));
    check('2 one strip in the page', qa(tab, '#azstrip').length === 1);
    tab.calls.length = 0;
    var before = qa(tab, '#azstrip .azl');
    tab.t().renderList();
    tab.t().renderList();
    var after = qa(tab, '#azstrip .azl');
    check('2 redraws keep one strip and the very same button elements', qa(tab, '#azstrip').length === 1 && after.length === before.length && after.every(function (b, i) { return b === before[i]; }));
    return H.wait(50).then(function () { check('2 drawing the strip sends nothing', notPlayer(tab).filter(function (c) { return c.path !== '/me/library/contains'; }).length === 0, notPlayer(tab)); });
  });
});

// 3. Tap a letter: scrolls the first row with that letter under the header, focuses its link, zero requests.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    layoutRows(tab);
    tab.calls.length = 0; tab.scrolls.length = 0;
    click(tab, btn(tab, 'B'));
    var rows = qa(tab, '#main ul.list > li');
    var bi = -1; rows.forEach(function (li, i) { if (bi < 0 && rowName(li) === 'The Beatles') bi = i; });
    check('3 The Beatles is under B', bi >= 0);
    check('3 scrolled to that row under the header', tab.scrolls.length === 1 && tab.scrolls[0] === 200 + bi * 60 - 120 - 4, [tab.scrolls, bi]);
    check('3 focus moved to the row', d(tab).activeElement && rows[bi].contains(d(tab).activeElement), d(tab).activeElement && d(tab).activeElement.outerHTML.slice(0, 80));
    click(tab, btn(tab, '#'));
    check('3 # goes to the first row (symbols and digits sort first)', tab.scrolls[1] === Math.max(0, 200 - 124), tab.scrolls);
    click(tab, btn(tab, 'X'));
    var xi = -1; rows.forEach(function (li, i) { if (xi < 0 && rowName(li) === 'the xx') xi = i; });
    check('3 X jumps to “the xx”', tab.scrolls[2] === 200 + xi * 60 - 124, [tab.scrolls, xi]);
    var ei = -1; rows.forEach(function (li, i) { if (ei < 0 && rowName(li) === 'Édith Piaf Live') ei = i; });
    click(tab, btn(tab, 'E'));
    check('3 E jumps to the accented name', tab.scrolls[3] === 200 + ei * 60 - 124, [tab.scrolls, ei]);
    return H.wait(50).then(function () { check('3 jumping sends nothing', tab.calls.length === 0, tab.calls); });
  });
});

// 4. Drag along the strip: each new letter jumps, a bubble shows it, release hides it; the click after a touch doesn't jump again.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    layoutRows(tab); layoutStrip(tab);
    tab.calls.length = 0; tab.scrolls.length = 0;
    var bub = q(tab, '#azbub');
    ptr(tab, 'pointerdown', 135);   // first button (#)
    check('4 press jumps to # and shows the bubble', tab.scrolls.length === 1 && !bub.hidden && bub.textContent === '#', [tab.scrolls, bub.hidden, bub.textContent]);
    check('4 bubble hidden from VoiceOver', bub.getAttribute('aria-hidden') === 'true');
    ptr(tab, 'pointermove', 138);   // same letter: no new scroll
    check('4 same letter: no extra scroll', tab.scrolls.length === 1, tab.scrolls);
    ptr(tab, 'pointermove', 175);   // third button (B)
    check('4 moving to B jumps again', tab.scrolls.length === 2 && bub.textContent === 'B', [tab.scrolls, bub.textContent]);
    ptr(tab, 'pointermove', 5000);   // past the end: last letter
    check('4 past the end clamps to the last letter', bub.textContent === 'Z', bub.textContent);
    ptr(tab, 'pointermove', -50);   // above the top: first letter
    check('4 above the top clamps to the first letter', bub.textContent === '#', bub.textContent);
    ptr(tab, 'pointerup', -50);
    check('4 release hides the bubble', bub.hidden);
    var before = tab.scrolls.length;
    click(tab, btn(tab, '#'));
    check('4 the click that follows a touch does not jump again', tab.scrolls.length === before, tab.scrolls);
    ptr(tab, 'pointermove', 175);
    check('4 moving without a press does nothing', tab.scrolls.length === before);
    ptr(tab, 'pointerdown', 175); ptr(tab, 'pointercancel', 175);
    check('4 pointercancel hides the bubble', bub.hidden);
    return H.wait(50).then(function () { check('4 dragging sends nothing', tab.calls.length === 0, tab.calls); });
  });
});

// 5. Threshold: 40 rows no strip, 41 rows a strip; one letter only: no strip.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 40 }).then(function (tab) {
    check('5 40 rows: no strip', !strip(tab) && !d(tab).body.classList.contains('has-az'));
    return setup(store0({ sorts: { albums: 'az' } }), { albums: 41 });
  }).then(function (tab) {
    check('5 41 rows: strip', !!strip(tab));
    var same = []; for (var i = 0; i < 45; i++) same.push('Alpha ' + i);
    return setup(store0({ sorts: { albums: 'az' } }), { albums: same });
  }).then(function (tab) {
    check('5 every row under one letter: no strip', !strip(tab));
  });
});

// 6. Only A–Z and Artist A–Z: switching sorts with the chips shows and hides it.
tests.push(function () {
  return setup(store0(), { albums: 45, albumArtists: names(45).map(function (n, i) { return i % 2 ? 'Queen ' + i : 'Oasis ' + i; }) }).then(function (tab) {
    check('6 Recently saved (default): no strip', !strip(tab));
    click(tab, sortChip(tab, 'az'));
    check('6 A–Z chip: strip', !!strip(tab));
    click(tab, sortChip(tab, 'artist'));
    check('6 Artist A–Z uses the artist', letters(tab) === 'OQ', letters(tab));
    click(tab, sortChip(tab, 'released'));
    check('6 Release date: no strip', !strip(tab) && !d(tab).body.classList.contains('has-az'));
    check('6 no new storage keys besides the sort choice', Object.keys(tab.w.localStorage._m()).filter(function (k) { return /az/i.test(k); }).length === 0, Object.keys(tab.w.localStorage._m()));
  });
});

// 7. The name filter: any text hides the strip; clearing it brings it back.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    typeFilter(tab, 'a');
    check('7 filter text hides the strip (even with 40+ matches)', !strip(tab) && qa(tab, '#main ul.list > li').length > 40);
    typeFilter(tab, '   ');
    check('7 only spaces: strip back', !!strip(tab));
    typeFilter(tab, 'z');
    check('7 hidden again', !strip(tab));
    typeFilter(tab, '');
    check('7 cleared: back', !!strip(tab));
  });
});

// 8. Artists, Playlists (Liked Songs stays first and isn't a letter target) and Podcasts → Shows; not All, Latest or Home.
tests.push(function () {
  var st = store0({ filter: 'artists', sorts: { artists: 'az', playlists: 'az', shows: 'az', all: 'az' } });
  return setup(st, { artists: 45, playlists: 45, shows: 45, liked: 3 }).then(function (tab) {
    var t = tab.t();
    check('8 Artists A–Z: strip', !!strip(tab) && letters(tab) === '#ABCDEFGHJKMNPRSTWXZ', letters(tab));
    t.setFilter('playlists');
    check('8 Playlists A–Z: strip', !!strip(tab));
    var first = qa(tab, '#main ul.list > li')[0];
    check('8 Liked Songs row still first', rowName(first) === 'Liked Songs', rowName(first));
    check('8 no L from Liked Songs', letters(tab).indexOf('L') === -1, letters(tab));
    layoutRows(tab); tab.scrolls.length = 0;
    click(tab, btn(tab, '#'));
    check('8 # jumps to the first sorted row, below Liked Songs', tab.scrolls[0] === 200 + 60 - 124, tab.scrolls);
    t.state.podTab = 'shows';
    t.setFilter('podcasts');
    check('8 Podcasts → Shows A–Z: strip', !!strip(tab), letters(tab));
    t.state.podTab = 'latest'; t.renderList();
    check('8 Podcasts → Latest: no strip', !strip(tab));
    t.setFilter('all');
    check('8 All A–Z: no strip', !strip(tab));
    t.setFilter('home');
    check('8 Home: no strip', !strip(tab) && !d(tab).body.classList.contains('has-az'));
    t.setFilter('recent');
    check('8 Recent: no strip', !strip(tab));
  });
});

// 9. Pinned items stay in their own section and aren't letter targets; opening an album hides the strip, Back brings it.
tests.push(function () {
  var pin = { kind: 'album', id: 'al0', name: 'The Beatles', uri: 'spotify:album:al0', url: 'https://open.spotify.com/album/al0', img: '', sub: 'Album' };
  return setup(store0({ sorts: { albums: 'az' }, pins: [pin] }), { albums: 46 }).then(function (tab) {
    var t = tab.t();
    check('9 pinned section shown', !!q(tab, '#main h2.sect'));
    check('9 strip from the 45 unpinned rows, no B (only The Beatles had it, pinned)', !!strip(tab) && letters(tab).indexOf('B') === -1, letters(tab));
    t.openDetail(t.state.data.albums[3]);
    return H.wait(50).then(function () {
      check('9 album song list: no strip', !strip(tab) && !d(tab).body.classList.contains('has-az'));
      t.closeDetail();
      check('9 Back: strip again', !!strip(tab));
    });
  });
});

// 10. Liked Songs: only with every song loaded and a Title / Artist A–Z sort; Find in list hides it. Requests: just the pages.
tests.push(function () {
  var st = store0({ filter: 'playlists', sorts: { 'd-liked': 'az' } });
  return setup(st, { liked: 60 }).then(function (tab) {
    var t = tab.t();
    tab.calls.length = 0;
    t.openDetail(t.likedItem(t.state.data));
    return H.wait(100).then(function () {
      check('10 first page of 50 loaded', qa(tab, '#dlist > li').length === 50, qa(tab, '#dlist > li').length);
      check('10 more to load: no strip', !strip(tab));
      click(tab, q(tab, '#dfoot .btn'));   // Load more
      return H.wait(100);
    }).then(function () {
      check('10 all 60 loaded', qa(tab, '#dlist > li').length === 60);
      check('10 fully loaded and sorted Title A–Z: strip', !!strip(tab) && letters(tab) === '#ABCDEFGHJKMNPRSTWXZ', letters(tab));
      var tracks = notPlayer(tab).filter(function (c) { return c.path === '/me/tracks'; });
      check('10 library group: exactly the two song pages', tracks.length === 2, tracks.map(function (c) { return c.query; }));
      check('10 no catalog or search requests', notPlayer(tab).filter(function (c) { return /^\/(albums|artists|shows|episodes|search)/.test(c.path); }).length === 0, notPlayer(tab));
      var li = qa(tab, '#dlist > li');
      li.forEach(function (x, i) { x.getBoundingClientRect = function () { return { top: 300 + i * 50, bottom: 340 + i * 50, left: 0, right: 300, width: 300, height: 40 }; }; });
      q(tab, '#top').getBoundingClientRect = function () { return { top: 0, bottom: 100, left: 0, right: 375, width: 375, height: 100 }; };
      tab.scrolls.length = 0;
      var n0 = tab.calls.length;
      click(tab, btn(tab, 'Z'));
      var zi = -1; li.forEach(function (x, i) { if (zi < 0 && rowName(x) === 'Zebra') zi = i; });
      check('10 Z jumps to Zebra in the song list', tab.scrolls[0] === 300 + zi * 50 - 104, [tab.scrolls, zi]);
      check('10 jump sends nothing', tab.calls.length === n0);
      var box = q(tab, '#dfind');
      box.value = 'name'; box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('10 Find in list text hides the strip', !strip(tab));
      box.value = ''; box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('10 Find cleared: strip back', !!strip(tab));
      click(tab, sortChip(tab, 'default'));
      check('10 Recently liked: no strip', !strip(tab));
      click(tab, sortChip(tab, 'artist'));
      check('10 Artist A–Z with every song by one artist: no strip (one letter)', !strip(tab), letters(tab));
      t.closeDetail();
      check('10 back to Playlists (few rows): no strip', !strip(tab));
    });
  });
});

// 11. Liked Songs that fit in one page (45 songs) get the strip at once; under 41 songs none.
tests.push(function () {
  var st = store0({ filter: 'playlists', sorts: { 'd-liked': 'artist' } });
  var arts = names(45).map(function (n) { return 'By ' + n; });
  arts[0] = 'The Smiths'; arts[1] = 'Ölafur';
  return setup(st, { liked: 45, likedArtists: arts }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.likedItem(t.state.data));
    return H.wait(100).then(function () {
      check('11 45 songs, one page, Artist A–Z: strip', !!strip(tab), letters(tab));
      check('11 artist letters (“The Smiths” under S, accent under O)', letters(tab) === 'BOS', letters(tab));
      return setup(store0({ filter: 'playlists', sorts: { 'd-liked': 'az' } }), { liked: 40 });
    }).then(function (tab2) {
      var t2 = tab2.t();
      t2.openDetail(t2.likedItem(t2.state.data));
      return H.wait(100).then(function () { check('11 40 songs: no strip', !strip(tab2)); });
    });
  });
});

// 12. Other song lists (a playlist sorted Title A–Z) get no strip.
tests.push(function () {
  var st = store0({ filter: 'playlists', sorts: { 'd-playlist': 'az' } });
  return setup(st, { playlists: 2, liked: 0 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.playlists[0]);
    return H.wait(100).then(function () { check('12 a playlist’s song list: no strip', !strip(tab)); });
  });
});

// 13. A jump to a row no longer on the page does nothing; signing out hides the strip.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    var t = tab.t();
    var row = t.az.rows[1].li;
    row.parentNode.removeChild(row);
    tab.scrolls.length = 0;
    check('13 a removed row: no jump', t.azJump(t.az.rows[1].L, true) === false && tab.scrolls.length === 0);
    check('13 an unknown letter: no jump', t.azJump('?', false) === false);
    t.stopApp();
    check('13 signed out: strip hidden', !strip(tab) && !d(tab).body.classList.contains('has-az'));
  });
});

// 14. Layout rules for the iPhone (from the page's own CSS).
tests.push(function () {
  return setup(store0(), {}).then(function (tab) {
    var css = [].slice.call(d(tab).querySelectorAll('style')).map(function (s) { return s.textContent; }).join('\n');
    var rule = /\.azstrip \{([^}]*)\}/.exec(css);
    var r = rule ? rule[1] : '';
    check('14 strip is 44 px wide (tap width)', /width: 44px/.test(r), r);
    check('14 inset from the right edge, safe area included', /right: max\(calc\(12px \+ env\(safe-area-inset-right, 0px\)\)/.test(r), r);
    check('14 clears the bottom safe area and the player bar', /env\(safe-area-inset-bottom/.test(r) && /body\.has-player \.azstrip \{ bottom: calc\(140px/.test(css));
    var crule = (/\.azcol \{([^}]*)\}/.exec(css) || [])[1] || '';
    check('14 the nav takes no touches, only the letters do', /pointer-events: none/.test(r) && /pointer-events: auto/.test(crule), [r, crule]);
    check('14 dragging on the letters never scrolls the page', /touch-action: none/.test(crule) && !/touch-action/.test(r));
    check('14 a dropped letter stays as an off-screen button', /\.azl\.azskip \{[^}]*clip/.test(css));
    check('14 rows get 44 px of room on a phone', /@media \(max-width: 760px\) \{ body\.has-az #main \{ padding-right: 44px; \} \}/.test(css));
    var lrule = (/\.azl \{([^}]*)\}/.exec(css) || [])[1] || '';
    check('14 letters use theme tokens', /var\(--accent\)/.test(lrule) && /var\(--surface\)/.test((/\.azbub \{([^}]*)\}/.exec(css) || [])[1] || ''));
    check('14 no animation (reduced motion)', !/\.az(strip|col|l|bub)[^{]*\{[^}]*(transition|animation)/.test(css));
    check('14 buttons get the shared focus ring', /button:focus-visible/.test(css));
  });
});

// 15. Touches beside the letters (above or below them) are left to the page: no jump, no drag.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    layoutRows(tab); layoutStrip(tab);
    var n = qa(tab, '#azstrip .azl').length;
    tab.scrolls.length = 0;
    ptr(tab, 'pointerdown', 100);   // above the first letter (130)
    check('15 press above the letters: no jump, no drag', tab.scrolls.length === 0 && !tab.t().az.drag && q(tab, '#azbub').hidden);
    ptr(tab, 'pointermove', 175);
    check('15 then moving does nothing', tab.scrolls.length === 0);
    ptr(tab, 'pointerup', 175);
    ptr(tab, 'pointerdown', 150 + (n - 1) * 20 + 5);   // below the last letter
    check('15 press below the letters: no jump', tab.scrolls.length === 0 && !tab.t().az.drag);
    var ev = new tab.w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 100, button: 0 });
    q(tab, '#azstrip .azcol').dispatchEvent(ev);
    check('15 the page keeps the touch (not prevented)', !ev.defaultPrevented);
    ptr(tab, 'pointerdown', 135);
    check('15 press on a letter still jumps', tab.scrolls.length === 1 && tab.t().az.drag);
    ptr(tab, 'pointerup', 135);
  });
});

// 16. Fit: room for every letter; every other letter on a short screen (drags over a gap pick the shown letter);
// hidden when even that doesn't fit; back when there's room again (resize / orientation change).
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    var t = tab.t(), nav = q(tab, '#azstrip'), avail = 400;
    nav.getBoundingClientRect = function () { return { top: 128, bottom: 128 + avail, left: 319, right: 363, width: 44, height: avail }; };
    var all = qa(tab, '#azstrip .azl');   // 20 letters
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('16 400 px: every letter, 20 px each', t.az.fit === 'all' && all.every(function (b) { return !b.classList.contains('azskip') && b.style.height === '20px'; }), [t.az.fit, all[0].style.height]);
    avail = 2000; tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('16 tall screen: letters stop at 28 px', all[0].style.height === '28px', all[0].style.height);
    avail = 200; tab.w.dispatchEvent(new tab.w.Event('orientationchange'));
    var shownB = qa(tab, '#azstrip .azl:not(.azskip)');
    check('16 200 px (under 14 px a letter): every other letter', t.az.fit === 'half' && shownB.length === 10 && shownB.map(function (b) { return b.textContent; }).join('') === '#BDFHKNRTX', shownB.map(function (b) { return b.textContent; }).join(''));
    check('16 shown letters at least 14 px', parseInt(shownB[0].style.height, 10) >= 14, shownB[0].style.height);
    check('16 dropped letters stay as buttons for VoiceOver', qa(tab, '#azstrip .azl.azskip').length === 10 && btn(tab, 'A').getAttribute('aria-label') === 'Jump to A');
    check('16 strip shown, rows keep their room', !nav.hidden && d(tab).body.classList.contains('has-az'));
    layoutRows(tab);
    shownB.forEach(function (b, i) { b.getBoundingClientRect = function () { return { top: 130 + i * 20, bottom: 150 + i * 20, left: 319, right: 363, width: 44, height: 20 }; }; });
    tab.scrolls.length = 0;
    ptr(tab, 'pointerdown', 155);   // second shown button: B (A is dropped)
    check('16 a drag over the half strip picks a shown letter', q(tab, '#azbub').textContent === 'B', q(tab, '#azbub').textContent);
    ptr(tab, 'pointerup', 155);
    avail = 100; tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('16 100 px: even half doesn’t fit, strip hidden, no right padding', t.az.fit === 'none' && nav.hidden && !d(tab).body.classList.contains('has-az'));
    avail = 400; tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('16 room again: every letter back', t.az.fit === 'all' && !nav.hidden && qa(tab, '#azstrip .azl.azskip').length === 0);
  });
});

// 17. A redraw mid-drag (Shows after a Now Playing check) keeps the drag going; jumps use the new rows.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    var t = tab.t();
    layoutRows(tab); layoutStrip(tab);
    var btns = qa(tab, '#azstrip .azl');
    tab.scrolls.length = 0;
    ptr(tab, 'pointerdown', 135);
    t.renderList();   // the rows are new elements now
    layoutRows(tab);
    check('17 still dragging after the redraw', t.az.drag && !q(tab, '#azbub').hidden);
    check('17 same buttons (not rebuilt mid-drag)', qa(tab, '#azstrip .azl').every(function (b, i) { return b === btns[i]; }));
    ptr(tab, 'pointermove', 175);
    check('17 next letter jumps, to a row of the new list', tab.scrolls.length === 2 && t.az.rows[2].li.isConnected, tab.scrolls);
    t.setFilter('home');   // the list goes away mid-drag
    check('17 strip stays until the finger lifts', !!strip(tab) && t.az.drag);
    var n17 = tab.scrolls.length;   // Home restores its own scroll spot (v2.42)
    ptr(tab, 'pointermove', 195);
    check('17 nothing to jump to: no scroll', tab.scrolls.length === n17, tab.scrolls);
    ptr(tab, 'pointerup', 195);
    check('17 lifted: strip hidden', !strip(tab) && !d(tab).body.classList.contains('has-az') && q(tab, '#azbub').hidden);
    t.setFilter('albums');
    check('17 back to Albums: strip again', !!strip(tab));
    layoutStrip(tab);
    ptr(tab, 'pointerdown', 135);
    t.stopApp();
    check('17 signing out hides it even mid-drag', !strip(tab) && !t.az.drag);
  });
});

// 18. Ø, Ł, Æ go with O, L, A where the list sorts them; # only where digits, symbols and other scripts sort.
tests.push(function () {
  var list = names(41).concat(['Øystein Sevåg', 'Oasis', 'Łódź Band', 'Lorde', 'Æther Realm', 'Ангел']);
  return setup(store0({ sorts: { albums: 'az' } }), { albums: list }).then(function (tab) {
    var L = letters(tab);
    check('18 # appears once and only at an end', L.split('#').length === 2 && (L[0] === '#' || L[L.length - 1] === '#'), L);
    check('18 letters in A–Z order after #', L.replace('#', '') === L.replace('#', '').split('').sort().join(''), L);
    check('18 O and L present (Oasis, Øystein; Lorde, Łódź)', L.indexOf('O') !== -1 && L.indexOf('L') !== -1, L);
    var rows = qa(tab, '#main ul.list > li').map(rowName);
    var t = tab.t();
    var oRow = t.az.rows.filter(function (r) { return r.L === 'O'; })[0];
    check('18 O jumps to the first O row in list order', oRow && rowName(oRow.li) === rows.filter(function (n) { return /^(Oasis|Øystein)/.test(n); })[0], oRow && rowName(oRow.li));
    var lRow = t.az.rows.filter(function (r) { return r.L === 'L'; })[0];
    check('18 Łódź sorts and jumps with L', lRow && rowName(lRow.li) === 'Łódź Band' && rows.indexOf('Łódź Band') < rows.indexOf('Lorde'), [lRow && rowName(lRow.li), rows.indexOf('Łódź Band'), rows.indexOf('Lorde')]);
    var aRow = t.az.rows.filter(function (r) { return r.L === 'A'; })[0];
    check('18 Æther is an A row', aRow && rows.indexOf('Æther Realm') > rows.indexOf(rowName(aRow.li)) - 1 && rows.indexOf('Æther Realm') < rows.indexOf(rowName(t.az.rows[t.az.rows.indexOf(aRow) + 1].li)));
    var only = []; for (var i = 0; i < 45; i++) only.push((i % 2 ? 'Alpha ' : 'Омега ') + i);
    return setup(store0({ sorts: { albums: 'az' } }), { albums: only });
  }).then(function (tab) {
    check('18 only Latin and Cyrillic: # sits last, where Cyrillic sorts', letters(tab) === 'A#', letters(tab));
  });
});

// 19. The strip moves when the header changes height (cool-off line) and on resize.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    var t = tab.t(), hb = 120, nav = q(tab, '#azstrip');
    q(tab, '#top').getBoundingClientRect = function () { return { top: 0, bottom: hb, left: 0, right: 375, width: 375, height: hb }; };
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('19 placed under the header', nav.style.top === '128px', nav.style.top);
    hb = 150;
    t.state.cool = t.state.cool || {};
    t.paintCool();
    check('19 paintCool re-places it under the taller header', nav.style.top === '158px', nav.style.top);
    hb = 130; tab.w.dispatchEvent(new tab.w.Event('orientationchange'));
    check('19 orientation change re-places it', nav.style.top === '138px', nav.style.top);
  });
});

// 20. VoiceOver double-tap: the touch jumps, then its click moves focus to the row without a second scroll.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 45 }).then(function (tab) {
    layoutRows(tab); layoutStrip(tab);
    tab.scrolls.length = 0;
    ptr(tab, 'pointerdown', 175); ptr(tab, 'pointerup', 175);   // B
    click(tab, btn(tab, 'B'));
    var rows = qa(tab, '#main ul.list > li');
    var bi = -1; rows.forEach(function (li, i) { if (bi < 0 && rowName(li) === 'The Beatles') bi = i; });
    check('20 one scroll only', tab.scrolls.length === 1, tab.scrolls);
    check('20 focus moved to The Beatles', d(tab).activeElement && rows[bi].contains(d(tab).activeElement));
    ptr(tab, 'pointerdown', 135); ptr(tab, 'pointerup', 135);   // #
    var f0 = d(tab).activeElement;
    click(tab, btn(tab, 'M'));   // a click on another letter right after a touch: ignored
    check('20 a click on a different letter right after a touch is ignored', tab.scrolls.length === 2 && d(tab).activeElement === f0, tab.scrolls);
  });
});

// 21. Long lists (over 300 rows) redraw 150 ms after typing (v2.29); the strip hides at the first key, not after.
tests.push(function () {
  return setup(store0({ sorts: { albums: 'az' } }), { albums: 320 }).then(function (tab) {
    check('21 320 albums: strip', !!strip(tab));
    var rows0 = qa(tab, '#main ul.list > li').length;
    typeFilter(tab, 'zz');
    check('21 hidden at once, before the delayed redraw', !strip(tab) && qa(tab, '#main ul.list > li').length === rows0);
    return H.wait(250).then(function () {
      check('21 still hidden after the redraw', !strip(tab) && qa(tab, '#main ul.list > li').length < rows0);
      typeFilter(tab, '');
      check('21 cleared: back at once', !!strip(tab));
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
