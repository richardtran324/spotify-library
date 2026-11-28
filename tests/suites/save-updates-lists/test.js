'use strict';
// v2.63: a heart that Spotify accepted changes the library lists and counts at once (as Follow does), in memory
// (state.data) and in the saved copy (lib-cache); a failed request changes nothing. Review finding CORR-1.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function rawAlbum(id, name) { return { id: id, uri: 'spotify:album:' + id, name: name, images: [], artists: [{ id: 'ar1', name: 'Art' }], release_date: '2020-01-01', total_tracks: 10 }; }
function rawShow(id, name, n) { return { id: id, uri: 'spotify:show:' + id, name: name, images: [], publisher: 'Pub', total_episodes: n }; }
function rawPl(id, owner, name, n) { return { id: id, uri: 'spotify:playlist:' + id, name: name, images: [], owner: { id: owner, display_name: owner }, collaborative: false, snapshot_id: 'snap-' + id, items: { total: n } }; }

// env.lib: queue of answers for PUT/DELETE /me/library ({status}); default 200.
function setup(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(opts.filter || 'albums'));
  var env = { lib: [] };
  var tab = H.makeTab(s, function (m, p, q) {
    if (p === '/me') return { status: 200, json: { id: 'me1', display_name: 'Rich' } };
    if (p === '/me/albums') return { status: 200, json: { items: [{ album: rawAlbum('a1', 'Kept Album') }, { album: rawAlbum('a2', 'Gone Album') }], next: null, total: 2 } };
    if (p === '/me/shows') return { status: 200, json: { items: [{ show: rawShow('s1', 'Old Show', 20) }], next: null, total: 1 } };
    if (p === '/me/playlists') return { status: 200, json: { items: [rawPl('p1', 'me1', 'Mine', 5), rawPl('p2', 'other', 'Their Mix', 50)], next: null, total: 2 } };
    if (p === '/me/following') return { status: 200, json: { artists: { items: [], next: null } } };
    if (p === '/me/tracks') return { status: 200, json: { items: [], next: null, total: 4213 } };
    if (p === '/me/episodes') return { status: 200, json: { items: [], next: null, total: 7 } };
    if (p === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (p === '/me/library' && (m === 'PUT' || m === 'DELETE')) { var a = env.lib.shift() || { status: 200 }; return { status: a.status, json: a.json }; }
    if (p === '/search') return { status: 200, json: {
      tracks: { items: [] }, artists: { items: [] }, episodes: { items: [] },
      albums: { items: [Object.assign(rawAlbum('a3', 'New Album'), { album_type: 'album' })], next: null },
      shows: { items: [rawShow('s2', 'New Show', 12)], next: null },
      playlists: { items: [rawPl('p9', 'someone', 'Found Mix', 30)], next: null } } };
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (p === '/me/player') return { status: 204 };
  }, { beforeParse: function (w) {
    w.__scrolls = [];
    w.scrollTo = function (x, y) { w.__scrolls.push([x, y]); };
    Object.defineProperty(w, 'pageYOffset', { configurable: true, get: function () { return w.__y || 0; } });
  } });
  tab.env = env; tab.store = s;
  return H.wait(700).then(function () {
    var t = tab.t();
    if (!t || !t.state.data) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0; tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, n) { n.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function names(tab) { return [].slice.call(d(tab).querySelectorAll('#main .row .name')).map(function (n) { return n.textContent; }); }
function subs(tab) { return [].slice.call(d(tab).querySelectorAll('#main .row .sub')).map(function (n) { return n.textContent; }); }
function heart(tab, uri) { return d(tab).querySelector('#main .heart[data-uri="' + uri + '"]'); }
function cache(tab) { return JSON.parse(tab.store.getItem('lib-cache') || 'null') || {}; }
function ids(list) { return (list || []).map(function (x) { return x.id; }); }
function lastToast(tab) { var t = tab.toasts(); return t[t.length - 1] || ''; }
function undoBtn(tab) { return d(tab).querySelector('#toast .toastbtn'); }
function writes(tab) { return tab.calls.filter(function (c) { return c.path === '/me/library' && c.method !== 'GET'; }).map(function (c) { return c.method + ' ' + decodeURIComponent(c.query); }); }
// Runs a search with the All type and waits for its rows.
function search(tab, q) {
  var t = tab.t();
  t.setFilter('search');
  t.runSearch(q);
  return H.wait(200);
}

var tests = [];

// 1. Albums: a save from Search goes to the top of the Albums tab and lib-cache; a removal in the Albums tab takes
// the row away at the same scroll place, with focus kept in the list; Undo brings the library's own copy back.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    return search(tab, 'new album').then(function () {
      var h = heart(tab, 'spotify:album:a3');
      check('1 search shows the album with a heart', !!h, names(tab));
      click(tab, h);
      return H.wait(150);
    }).then(function () {
      check('1 PUT sent and toast', JSON.stringify(writes(tab)) === JSON.stringify(['PUT ?uris=spotify:album:a3']) && lastToast(tab) === 'Saved to your library', [writes(tab), tab.toasts()]);
      check('1 state.data.albums has a3 first', JSON.stringify(ids(t.state.data.albums)) === '["a3","a1","a2"]', ids(t.state.data.albums));
      check('1 lib-cache albums has a3 first', JSON.stringify(ids(cache(tab).albums)) === '["a3","a1","a2"]', ids(cache(tab).albums));
      var a3 = t.state.data.albums[0];
      check('1 new album record is library-shaped', a3.kind === 'album' && a3.name === 'New Album' && a3.sub === 'Album · Art' && a3.artist === 'Art' && a3.uri === 'spotify:album:a3' && !a3.linkStub, a3);
      t.setFilter('albums');
      return H.wait(50);
    }).then(function () {
      check('1 Albums tab lists the saved album first', JSON.stringify(names(tab)) === JSON.stringify(['New Album', 'Kept Album', 'Gone Album']), names(tab));
      tab.w.__y = 300; tab.w.__scrolls = [];
      var h = heart(tab, 'spotify:album:a2');
      h.focus();
      tab.calls.length = 0;
      click(tab, h);
      return H.wait(150);
    }).then(function () {
      check('1 DELETE sent, toast with Undo', JSON.stringify(writes(tab)) === JSON.stringify(['DELETE ?uris=spotify:album:a2']) && lastToast(tab) === 'Removed “Gone Album”' && !!undoBtn(tab), [writes(tab), tab.toasts()]);
      check('1 the removed row is gone from the Albums tab at once', JSON.stringify(names(tab)) === JSON.stringify(['New Album', 'Kept Album']), names(tab));
      check('1 state.data and lib-cache drop a2', JSON.stringify(ids(t.state.data.albums)) === '["a3","a1"]' && JSON.stringify(ids(cache(tab).albums)) === '["a3","a1"]', [ids(t.state.data.albums), ids(cache(tab).albums)]);
      var sc = tab.w.__scrolls;
      check('1 drawn again at the same scroll place', sc.length > 0 && sc[sc.length - 1][1] === 300, sc);
      var ae = d(tab).activeElement;
      check('1 focus stays in the list (not lost to the page)', ae && ae !== d(tab).body && d(tab).getElementById('main').contains(ae), ae && ae.outerHTML);
      tab.calls.length = 0;
      click(tab, undoBtn(tab));
      return H.wait(150);
    }).then(function () {
      check('1 Undo sends PUT', JSON.stringify(writes(tab)) === JSON.stringify(['PUT ?uris=spotify:album:a2']), writes(tab));
      check('1 Undo brings the row back', names(tab).indexOf('Gone Album') !== -1 && names(tab).length === 3, names(tab));
      check('1 Undo puts a2 back in state.data and lib-cache', ids(t.state.data.albums).indexOf('a2') !== -1 && ids(cache(tab).albums).indexOf('a2') !== -1, [ids(t.state.data.albums), ids(cache(tab).albums)]);
      var a2 = t.state.data.albums.filter(function (a) { return a.id === 'a2'; })[0];
      check('1 Undo uses the library copy (same sub, release date)', a2 && a2.sub === 'Album · Art' && a2.released === '2020-01-01', a2);
      check('1 heart a2 filled again', heart(tab, 'spotify:album:a2') && heart(tab, 'spotify:album:a2').getAttribute('aria-pressed') === 'true');
    });
  });
});

// 2. Liked Songs and Saved episodes counts move by one, in memory, lib-cache and on screen.
tests.push(function () {
  return setup({ filter: 'playlists' }).then(function (tab) {
    var t = tab.t();
    var liked = function () { return subs(tab).filter(function (x) { return /^Playlist · \d+ songs$/.test(x) && /4\d{3}/.test(x); })[0]; };
    check('2 Liked Songs row starts at 4213', liked() === 'Playlist · 4213 songs', subs(tab));
    tab.w.__y = 120; tab.w.__scrolls = [];
    t.toggleSave('spotify:track:t1', 'Song One', 'track');   // the Now Playing heart
    return H.wait(150).then(function () {
      check('2 like: count +1 in memory and lib-cache', t.state.data.likedTotal === 4214 && cache(tab).likedTotal === 4214, [t.state.data.likedTotal, cache(tab).likedTotal]);
      check('2 like: Liked Songs row says 4214', liked() === 'Playlist · 4214 songs', subs(tab));
      check('2 like: same scroll place', tab.w.__scrolls.length && tab.w.__scrolls[tab.w.__scrolls.length - 1][1] === 120, tab.w.__scrolls);
      t.toggleSave('spotify:track:t1', 'Song One', 'track');
      return H.wait(150);
    }).then(function () {
      check('2 unlike: count -1 in memory and lib-cache', t.state.data.likedTotal === 4213 && cache(tab).likedTotal === 4213, [t.state.data.likedTotal, cache(tab).likedTotal]);
      check('2 unlike: Liked Songs row says 4213', liked() === 'Playlist · 4213 songs', subs(tab));
      t.toggleSave('spotify:episode:e1', 'Ep One', 'episode');
      return H.wait(150);
    }).then(function () {
      check('2 episode saved: Saved episodes +1 in memory and lib-cache', t.state.data.episodesTotal === 8 && cache(tab).episodesTotal === 8, [t.state.data.episodesTotal, cache(tab).episodesTotal]);
      t.setFilter('podcasts'); t.state.podTab = 'shows'; t.renderList();
      check('2 Podcasts → Shows says 8 episodes', subs(tab).indexOf('Podcast · 8 episodes') !== -1, subs(tab));
      t.toggleSave('spotify:episode:e1', 'Ep One', 'episode');
      return H.wait(150);
    }).then(function () {
      check('2 episode removed: back to 7, on screen too', t.state.data.episodesTotal === 7 && cache(tab).episodesTotal === 7 && subs(tab).indexOf('Podcast · 7 episodes') !== -1, [t.state.data.episodesTotal, subs(tab)]);
    });
  });
});

// 3. A failed PUT or DELETE changes no list and no count.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var before = JSON.stringify(t.state.data), cBefore = tab.store.getItem('lib-cache');
    tab.env.lib = [{ status: 500, json: { error: { status: 500, message: 'Server error' } } }, { status: 500 }, { status: 503 }];
    t.toggleSave('spotify:album:a9', 'Other Album', 'album', false, { kind: 'album', id: 'a9', uri: 'spotify:album:a9', name: 'Other Album', artist: 'X' });
    t.toggleSave('spotify:album:a1', 'Kept Album', 'album', false, t.state.data.albums[0]);
    t.toggleSave('spotify:track:t9', 'Song', 'track');
    return H.wait(200).then(function () {
      check('3 three requests sent and failed', writes(tab).length === 3 && tab.toasts().filter(function (x) { return /^Couldn’t (save|remove)/.test(x); }).length >= 1, [writes(tab), tab.toasts()]);
      check('3 state.data unchanged', JSON.stringify(t.state.data) === before);
      check('3 lib-cache unchanged', tab.store.getItem('lib-cache') === cBefore);
      check('3 Albums tab unchanged', JSON.stringify(names(tab)) === JSON.stringify(['Kept Album', 'Gone Album']), names(tab));
    });
  });
});

// 4. Podcasts and other people's playlists: save from Search, remove, Undo; "N new" starting point; no snapshot.
tests.push(function () {
  return setup({ filter: 'podcasts' }).then(function (tab) {
    var t = tab.t();
    return search(tab, 'new').then(function () {
      click(tab, heart(tab, 'spotify:show:s2'));
      click(tab, heart(tab, 'spotify:playlist:p9'));
      return H.wait(150);
    }).then(function () {
      check('4 show saved: state.data and lib-cache list s2 first', JSON.stringify(ids(t.state.data.shows)) === '["s2","s1"]' && JSON.stringify(ids(cache(tab).shows)) === '["s2","s1"]', [ids(t.state.data.shows), ids(cache(tab).shows)]);
      var s2 = t.state.data.shows[0];
      check('4 show record keeps its episode count', s2.total === 12 && s2.sub === 'Podcast · 12 episodes', s2);
      var seen = JSON.parse(tab.store.getItem('lib-show-seen') || '{}');
      check('4 new podcast gets its "N new" starting point', seen.s2 === 12, seen);
      check('4 playlist saved: state.data and lib-cache list p9 first', ids(t.state.data.playlists)[0] === 'p9' && ids(cache(tab).playlists)[0] === 'p9', [ids(t.state.data.playlists), ids(cache(tab).playlists)]);
      var p9 = t.state.data.playlists[0];
      check('4 new playlist has no snapshot and its owner', p9.snap === '' && p9.ownerId === 'someone' && p9.sub === 'Playlist · someone · 30 songs', p9);
      t.setFilter('podcasts'); t.state.podTab = 'shows'; t.renderList();
      check('4 Podcasts → Shows lists the new show', names(tab).indexOf('New Show') !== -1, names(tab));
      tab.calls.length = 0;
      click(tab, heart(tab, 'spotify:show:s1'));
      return H.wait(150);
    }).then(function () {
      check('4 show removed: gone from the tab, state.data and lib-cache', names(tab).indexOf('Old Show') === -1 && ids(t.state.data.shows).indexOf('s1') === -1 && ids(cache(tab).shows).indexOf('s1') === -1, [names(tab), ids(t.state.data.shows)]);
      click(tab, undoBtn(tab));
      return H.wait(150);
    }).then(function () {
      check('4 Undo brings the show back', names(tab).indexOf('Old Show') !== -1 && ids(cache(tab).shows).indexOf('s1') !== -1, names(tab));
      var s1 = t.state.data.shows.filter(function (s) { return s.id === 's1'; })[0];
      check('4 Undo keeps the library record (no "Latest" text added)', s1 && s1.sub === 'Podcast · 20 episodes' && s1.total === 20, s1);
      t.setFilter('playlists');
      check('4 Playlists tab lists the followed playlist', names(tab).indexOf('Found Mix') !== -1, names(tab));
      tab.calls.length = 0;
      click(tab, heart(tab, 'spotify:playlist:p9'));
      return H.wait(150);
    }).then(function () {
      check('4 playlist removed from the tab and lib-cache', names(tab).indexOf('Found Mix') === -1 && ids(cache(tab).playlists).indexOf('p9') === -1, names(tab));
    });
  });
});

// 5. The heart on an open album page: the library changes, the page stays (no list drawn over it).
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.albums[1]);
    return H.wait(200).then(function () {
      var h = d(tab).querySelector('.dhead button.heart');
      check('5 album page has a filled heart', h && h.getAttribute('aria-pressed') === 'true');
      click(tab, h);
      return H.wait(150);
    }).then(function () {
      check('5 album page still open', !!t.state.detail && !!d(tab).querySelector('.dhead'));
      check('5 removed from state.data and lib-cache', ids(t.state.data.albums).indexOf('a2') === -1 && ids(cache(tab).albums).indexOf('a2') === -1, ids(t.state.data.albums));
      t.closeDetail();
      return H.wait(50);
    }).then(function () {
      check('5 back in the Albums tab the album is gone', JSON.stringify(names(tab)) === JSON.stringify(['Kept Album']), names(tab));
    });
  });
});

function runAll() {
  var i = 0;
  function next() {
    if (i >= tests.length) return Promise.resolve();
    var f = tests[i++];
    return Promise.resolve().then(f).catch(function (e) { results.push('ERROR test ' + i + ': ' + (e && e.stack || e)); }).then(next);
  }
  return next();
}
runAll().then(function () {
  results.forEach(function (r) { console.log(r); });
  var pass = results.filter(function (r) { return r.indexOf('PASS') === 0; }).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
});
