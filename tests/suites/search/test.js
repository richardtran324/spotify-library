'use strict';
// Search Spotify tests: typing and debounce, result types (chips), All view, Load more, sorting, recent searches,
// album search while album details are paused, errors, stale answers and what a tap on a result does.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var HD = H.delayed;
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var ALL_TYPES = 'track,artist,album,playlist,show,episode';

// ---------- Spotify objects ----------
function trk(id, name, o) {
  o = o || {};
  return { id: id, uri: 'spotify:track:' + id, name: name, type: 'track', artists: [{ id: 'ar1', name: 'Art' }],
    album: { id: o.album || 'alx', name: 'Alb', images: [], total_tracks: o.total }, duration_ms: 200000,
    track_number: o.n || 1, disc_number: o.disc || 1 };
}
function art(id, name) { return { id: id, uri: 'spotify:artist:' + id, name: name, images: [], genres: ['pop'] }; }
function alb(id, name, date) { return { id: id, uri: 'spotify:album:' + id, name: name, artists: [{ id: 'ar1', name: 'Art' }], images: [], release_date: date || '', total_tracks: 10 }; }
function pl(id, name) { return { id: id, uri: 'spotify:playlist:' + id, name: name, owner: { id: 'other', display_name: 'Someone' }, images: [], tracks: { total: 12 } }; }
function sh(id, name) { return { id: id, uri: 'spotify:show:' + id, name: name, images: [], total_episodes: 4 }; }
function ep(id, name) { return { id: id, uri: 'spotify:episode:' + id, name: name, type: 'episode', release_date: '2026-11-01', duration_ms: 1800000, images: [], show: { id: 'sh0', name: 'Show 0', images: [] } }; }
function pg(items, more) { return { items: items, next: more ? 'https://api.spotify.com/v1/search?offset=x' : null, total: 100 }; }
function range(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
function allAnswer(p) {
  return {
    tracks: pg(range(7, function (i) { return trk(p + 's' + i, p + ' Song ' + i); }), true),
    artists: pg([art(p + 'ar0', p + ' Artist 0'), art(p + 'ar1', p + ' Artist 1')], true),
    albums: pg([alb(p + 'al0', p + ' Album 0', '2020-01-01')], false),
    playlists: pg([null, pl(p + 'pl0', p + ' Playlist 0')], false),
    shows: pg([sh(p + 'sh0', p + ' Show 0')], false),
    episodes: pg([ep(p + 'ep0', p + ' Ep 0')], false)
  };
}
function emptyAll() { return { tracks: pg([]), artists: pg([]), albums: pg([]), playlists: pg([]), shows: pg([]), episodes: pg([]) }; }
var BOOM = { status: 500, json: { error: { status: 500, message: 'Server boom' } } };

// ---------- tab setup ----------
// env.search(params, call) answers GET /search ({status, json, delay?}); other requests get the harness defaults.
function setup(store, opts, Hx) {
  opts = opts || {};
  Hx = Hx || H;
  var env = { search: opts.search || function () { return { status: 200, json: emptyAll() }; } };
  var tab = Hx.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    call.params = {};
    q.forEach(function (v, k) { call.params[k] = v; });
    if (path === '/search' && method === 'GET') return env.search(call.params, call);
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  tab.skew = 0;
  return Hx.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    var orig = tab.w.Date.now.bind(tab.w.Date);
    tab.w.Date.now = function () { return orig() + tab.skew; };
    t.state.device = DEV; t.state.deviceAt = Date.now() + 3600e3;   // stays fresh for the whole test
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function searchStore(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('search'));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function box(tab) { return $(tab, 'search'); }
function main(tab) { return $(tab, 'main'); }
function mainText(tab) { return main(tab).textContent; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function typeIn(tab, v) { box(tab).value = v; box(tab).dispatchEvent(new tab.w.Event('input', { bubbles: true })); }
function enter(tab, v) {
  if (v != null) box(tab).value = v;
  box(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function searches(tab) { return tab.calls.filter(function (c) { return c.method === 'GET' && c.path === '/search'; }); }
function lastSearch(tab) { var s = searches(tab); return s[s.length - 1] || null; }
function heads(tab) { return [].slice.call(main(tab).querySelectorAll('h2.sect')).map(function (h) { return h.textContent; }); }
function rowNames(tab, sel) { return [].slice.call(d(tab).querySelectorAll((sel || '#main') + ' a.item .name')).map(function (n) { return n.textContent; }); }
function rowLink(tab, name) {
  var links = [].slice.call(d(tab).querySelectorAll('a.item'));
  for (var i = 0; i < links.length; i++) { if (links[i].querySelector('.name').textContent === name) return links[i]; }
  return null;
}
function chip(tab, t) { return d(tab).querySelector('.schip[data-stype="' + t + '"]'); }
function stored(store, k) { var v = store.getItem(k); return v == null ? null : JSON.parse(v); }
function recentQs(store) { return (stored(store, 'lib-recent-searches') || []).map(function (x) { return x.q; }); }
function footBtn(tab) { var f = $(tab, 'sfoot'); return f ? f.querySelector('button') : null; }
function errText(tab) { var e = main(tab).querySelector('.err'); return e ? e.textContent : ''; }

var tests = [];

// 1. Opening Search Spotify, an empty box and a one-letter query.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    check('1 result-type chips hidden outside search', $(tab, 'schips').hidden === true);
    click(tab, d(tab).querySelector('.filters .chip[data-filter="search"]'));
    check('1 chips shown in search', $(tab, 'schips').hidden === false);
    check('1 box says Search all of Spotify', box(tab).placeholder === 'Search all of Spotify' && box(tab).getAttribute('aria-label') === 'Search all of Spotify');
    check('1 filter remembered', stored(store, 'lib-filter') === 'search', store.getItem('lib-filter'));
    check('1 box focused', d(tab).activeElement === box(tab));
    check('1 All chip pressed by default', chip(tab, 'all').getAttribute('aria-pressed') === 'true' && chip(tab, 'track').getAttribute('aria-pressed') === 'false');
    check('1 empty box shows the hint', /Type a song, artist, album, playlist or podcast/.test(mainText(tab)), mainText(tab));
    enter(tab, 'a');
    typeIn(tab, 'a');
    return H.wait(650).then(function () {
      check('1 one letter sends nothing', searches(tab).length === 0, tab.calls);
      check('1 one letter keeps the hint', /Type a song/.test(mainText(tab)));
      check('1 one letter is not a recent search', store.getItem('lib-recent-searches') === null);
      click(tab, d(tab).querySelector('.filters .chip[data-filter="home"]'));
      check('1 back to Filter by name', box(tab).placeholder === 'Filter by name' && $(tab, 'schips').hidden === true);
    });
  });
});

// 2. Typing waits for a pause, then one request; the All view groups.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) { return { status: 200, json: allAnswer('T') }; } }).then(function (tab) {
    typeIn(tab, 'ta'); typeIn(tab, 'tay'); typeIn(tab, 'taylor');
    return H.wait(200).then(function () {
      check('2 nothing sent while typing', searches(tab).length === 0, tab.calls);
      return H.wait(500);
    }).then(function () {
      var s = searches(tab);
      check('2 one request after the pause', s.length === 1, s);
      var p = s[0] && s[0].params || {};
      check('2 q is the whole query', p.q === 'taylor', p);
      check('2 All asks every type', p.type === ALL_TYPES, p);
      check('2 limit 10, no offset', p.limit === '10' && !('offset' in p), p);
      check('2 group order', JSON.stringify(heads(tab)) === JSON.stringify(['Songs', 'Artists', 'Albums', 'Playlists', 'Podcasts', 'Episodes']), heads(tab));
      var lists = main(tab).querySelectorAll('ul.list');
      check('2 at most 5 songs in All', lists[0] && lists[0].querySelectorAll('li').length === 5, lists[0] && lists[0].querySelectorAll('li').length);
      check('2 null playlist dropped', lists[3] && lists[3].querySelectorAll('li').length === 1);
      var see = [].slice.call(main(tab).querySelectorAll('button')).map(function (b) { return b.textContent; }).filter(function (t) { return /^See all/.test(t); });
      check('2 See all per group', see.indexOf('See all songs') !== -1 && see.indexOf('See all episodes') !== -1 && see.length === 6, see);
      check('2 recent search saved', JSON.stringify(recentQs(store)) === '["taylor"]', recentQs(store));
      check('2 shown query', tab.t().state.search.q === 'taylor');
      typeIn(tab, 'taylor  ');
      return H.wait(650);
    }).then(function () {
      check('2 same query (spaces aside) is cached', searches(tab).length === 1, searches(tab).length);
      typeIn(tab, 't');
      check('2 shortening to one letter shows the hint', /Type a song/.test(mainText(tab)) && !main(tab).querySelector('a.item'));
      typeIn(tab, '');
      check('2 empty box shows recent searches', /Recent searches/.test(mainText(tab)), mainText(tab));
      typeIn(tab, 'taylor');
      check('2 cached query shows at once', rowNames(tab).length > 0 && searches(tab).length === 1);
    });
  });
});

// 3. Enter searches at once (query trimmed) and cancels the pending debounce.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function () { return { status: 200, json: allAnswer('A') }; } }).then(function (tab) {
    box(tab).focus();
    typeIn(tab, '  abba  ');
    enter(tab);
    return H.wait(40).then(function () {
      check('3 Enter sends right away', searches(tab).length === 1 && searches(tab)[0].params.q === 'abba', searches(tab));
      check('3 Enter hides the keyboard', d(tab).activeElement !== box(tab));
      return H.wait(650);
    }).then(function () {
      check('3 no second request from the debounce', searches(tab).length === 1, searches(tab).length);
      check('3 recent saved trimmed', JSON.stringify(recentQs(store)) === '["abba"]', recentQs(store));
    });
  });
});

// 4. No results, in All and in one type.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) {
    if (p.type === 'track') return { status: 200, json: { tracks: pg([]) } };
    return { status: 200, json: emptyAll() };
  } }).then(function (tab) {
    enter(tab, 'zzzz');
    return H.wait(50).then(function () {
      check('4 All with nothing found', /No results for “zzzz”\./.test(mainText(tab)) && heads(tab).length === 0, mainText(tab));
      click(tab, chip(tab, 'track'));
      return H.wait(50);
    }).then(function () {
      var s = lastSearch(tab);
      check('4 Songs chip asks for songs', s && s.params.type === 'track' && s.params.offset === '0', s && s.params);
      check('4 Songs with nothing found', /No songs for “zzzz”\./.test(mainText(tab)), mainText(tab));
      check('4 no Load more', !$(tab, 'sfoot'));
    });
  });
});

// 5. Error answers: the message, and the failed query is asked again.
tests.push(function () {
  var store = searchStore();
  var n = 0, b2 = 0;
  return setup(store, { search: function (p) {
    n++;
    if (p.q === 'boom' && n === 1) return BOOM;
    if (p.q === 'gate') return { status: 502 };
    if (p.q === 'boom2' && p.type === 'track' && ++b2 === 1) return BOOM;
    return { status: 200, json: p.type === 'track' ? { tracks: pg([trk('b1', 'Back 1')]) } : allAnswer('B') };
  } }).then(function (tab) {
    enter(tab, 'boom');
    return H.wait(50).then(function () {
      check('5 error shown', errText(tab) === 'Search failed: Server boom', errText(tab));
      check('5 no rows on error', !main(tab).querySelector('a.item'));
      enter(tab, 'boom');
      return H.wait(50);
    }).then(function () {
      check('5 failed query asked again', searches(tab).length === 2, searches(tab).length);
      check('5 second try shows results', !errText(tab) && rowNames(tab).indexOf('B Song 0') !== -1, mainText(tab));
      enter(tab, 'gate');
      return H.wait(50);
    }).then(function () {
      check('5 answer without a body says HTTP status', errText(tab) === 'Search failed: HTTP 502', errText(tab));
      click(tab, chip(tab, 'track'));
      enter(tab, 'boom2');
      return H.wait(50);
    }).then(function () {
      check('5 one-type error shown', errText(tab) === 'Search failed: Server boom', errText(tab));
      var before = searches(tab).length;
      click(tab, chip(tab, 'all'));
      return H.wait(50).then(function () {
        click(tab, chip(tab, 'track'));
        return H.wait(50);
      }).then(function () {
        var s = searches(tab).slice(before);
        check('5 chip back to a failed type asks again', s.length === 2 && s[1].params.type === 'track' && s[1].params.q === 'boom2', s.map(function (c) { return c.params; }));
        check('5 retried type shows rows', JSON.stringify(rowNames(tab)) === '["Back 1"]', rowNames(tab));
      });
    });
  });
});

// 6. One result type: Load more pages, duplicates dropped, cache when switching chips.
function songPages(p) {
  var off = Number(p.offset || 0);
  if (off === 0) return { status: 200, json: { tracks: pg(range(10, function (i) { return trk('s' + i, 'Song ' + i); }), true) } };
  if (off === 10) return { status: 200, json: { tracks: pg([trk('s9', 'Song 9')].concat(range(9, function (i) { return trk('s' + (10 + i), 'Song ' + (10 + i)); })), true) } };
  return { status: 200, json: { tracks: pg(range(3, function (i) { return trk('s' + (19 + i), 'Song ' + (19 + i)); }), false) } };
}
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) { return p.type === 'track' ? songPages(p) : { status: 200, json: allAnswer('L') }; } }).then(function (tab) {
    enter(tab, 'love');
    return H.wait(50).then(function () {
      click(tab, chip(tab, 'track'));
      check('6 Songs chip pressed', chip(tab, 'track').getAttribute('aria-pressed') === 'true' && chip(tab, 'all').getAttribute('aria-pressed') === 'false');
      check('6 result type remembered', stored(store, 'lib-searchtype') === 'track', store.getItem('lib-searchtype'));
      return H.wait(50);
    }).then(function () {
      var s = lastSearch(tab);
      check('6 asks songs from offset 0', s.params.type === 'track' && s.params.offset === '0' && s.params.limit === '10' && s.params.q === 'love', s.params);
      check('6 ten rows', rowNames(tab, '#slist').length === 10, rowNames(tab, '#slist').length);
      check('6 no group headings', heads(tab).length === 0, heads(tab));
      var b = footBtn(tab);
      check('6 Load more shown', b && b.textContent === 'Load more', b && b.textContent);
      click(tab, b); click(tab, b);
      var b2 = footBtn(tab);
      check('6 button says Loading… while it loads', b2 && b2.textContent === 'Loading…' && b2.getAttribute('aria-disabled') === 'true', b2 && b2.outerHTML);
      return H.wait(50);
    }).then(function () {
      var s = searches(tab).filter(function (c) { return c.params.type === 'track'; });
      check('6 a double tap sends one page', s.length === 2, s.map(function (c) { return c.params; }));
      check('6 second page from offset 10', s[1] && s[1].params.offset === '10', s[1] && s[1].params);
      var names = rowNames(tab, '#slist');
      check('6 duplicate dropped, rows appended', names.length === 19 && names[9] === 'Song 9' && names[10] === 'Song 10', names);
      click(tab, footBtn(tab));
      return H.wait(50);
    }).then(function () {
      check('6 third page from offset 20', lastSearch(tab).params.offset === '20', lastSearch(tab).params);
      check('6 all rows', rowNames(tab, '#slist').length === 22, rowNames(tab, '#slist').length);
      check('6 no Load more at the end', !footBtn(tab));
      var n = searches(tab).length;
      click(tab, chip(tab, 'all'));
      check('6 back to All from cache', searches(tab).length === n && heads(tab)[0] === 'Songs', heads(tab));
      click(tab, chip(tab, 'track'));
      check('6 Songs again from cache, all pages kept', searches(tab).length === n && rowNames(tab, '#slist').length === 22 && !footBtn(tab));
      tab.t().setFilter('home');
      tab.t().setFilter('search');
      check('6 leaving and coming back keeps query and type', box(tab).value === 'love' && rowNames(tab, '#slist').length === 22 && searches(tab).length === n, box(tab).value);
    });
  });
});

// 7. See all … switches to that type and searches it.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) {
    if (p.type === 'artist') return { status: 200, json: { artists: pg([art('x1', 'Xavier'), art('x2', 'Xena')]) } };
    return { status: 200, json: allAnswer('S') };
  } }).then(function (tab) {
    enter(tab, 'seeall');
    return H.wait(50).then(function () {
      var see = main(tab).querySelector('button[data-see="artist"]');
      click(tab, see);
      check('7 focus on the Artists chip', d(tab).activeElement === chip(tab, 'artist'));
      check('7 Artists chip pressed', chip(tab, 'artist').getAttribute('aria-pressed') === 'true');
      return H.wait(50);
    }).then(function () {
      var s = lastSearch(tab);
      check('7 asks artists', s.params.type === 'artist' && s.params.offset === '0' && s.params.q === 'seeall', s.params);
      check('7 artist rows', JSON.stringify(rowNames(tab, '#slist')) === '["Xavier","Xena"]', rowNames(tab, '#slist'));
      check('7 type remembered', stored(store, 'lib-searchtype') === 'artist');
    });
  });
});

// 8. Load more fails, then works on the next tap.
tests.push(function () {
  var store = searchStore({ 'lib-searchtype': 'track' });
  var failed = false;
  return setup(store, { search: function (p) {
    if (p.offset === '10' && !failed) { failed = true; return BOOM; }
    return songPages(p);
  } }).then(function (tab) {
    check('8 stored type restored', chip(tab, 'track').getAttribute('aria-pressed') === 'true' && tab.t().state.stype === 'track');
    enter(tab, 'more');
    return H.wait(50).then(function () {
      check('8 first page asked as songs', searches(tab)[0].params.type === 'track');
      click(tab, footBtn(tab));
      return H.wait(50);
    }).then(function () {
      var f = $(tab, 'sfoot');
      check('8 load more error shown', f.querySelector('.err') && f.querySelector('.err').textContent === 'Couldn’t load more (Server boom).', f.textContent);
      check('8 rows kept', rowNames(tab, '#slist').length === 10);
      check('8 Load more still offered', footBtn(tab) && footBtn(tab).textContent === 'Load more');
      click(tab, footBtn(tab));
      return H.wait(50);
    }).then(function () {
      check('8 retry asks offset 10 again', lastSearch(tab).params.offset === '10');
      check('8 error gone, rows added', !$(tab, 'sfoot').querySelector('.err') && rowNames(tab, '#slist').length === 19, $(tab, 'sfoot').textContent);
    });
  });
});

// 9. Sorting one result type.
tests.push(function () {
  var store = searchStore({ 'lib-searchtype': 'album' });
  return setup(store, { search: function (p) {
    if (p.type === 'artist') return { status: 200, json: { artists: pg([art('o1', 'Only')]) } };
    if (p.offset === '10') return { status: 200, json: { albums: pg([alb('a5', 'Aardvark', '2023-02-02')], false) } };
    return { status: 200, json: { albums: pg([alb('a1', 'Zeta', '2001'), alb('a2', 'The Apple', '2020-05-01'), alb('a3', 'beta', '1999-01-01'), alb('a4', 'Alpha 10', '')], true) } };
  } }).then(function (tab) {
    function sortChips() { return [].slice.call(d(tab).querySelectorAll('#ssort .sortbar [data-sort]')); }
    function pressed() { var c = d(tab).querySelector('#ssort [data-sort][aria-pressed="true"]'); return c && c.getAttribute('data-sort'); }
    function sortBtn(k) { return d(tab).querySelector('#ssort [data-sort="' + k + '"]'); }
    function note() { return /Sorted within the results loaded so far/.test($(tab, 'ssort').textContent); }
    enter(tab, 'blue');
    return H.wait(50).then(function () {
      check('9 Spotify order first', JSON.stringify(rowNames(tab, '#slist')) === '["Zeta","The Apple","beta","Alpha 10"]', rowNames(tab, '#slist'));
      check('9 album sort options', sortChips().map(function (c) { return c.textContent; }).join(',') === 'Best match,A–Z,Newest', sortChips().map(function (c) { return c.textContent; }));
      check('9 Best match pressed', pressed() === 'best');
      check('9 no note in Spotify order', !note());
      click(tab, sortBtn('az'));
      check('9 A–Z ignores The and case', JSON.stringify(rowNames(tab, '#slist')) === '["Alpha 10","The Apple","beta","Zeta"]', rowNames(tab, '#slist'));
      check('9 A–Z remembered', stored(store, 'lib-sort-s-album') === 'az', store.getItem('lib-sort-s-album'));
      check('9 A–Z pressed', pressed() === 'az');
      check('9 note while more remain', note());
      check('9 focus stays on the chip', d(tab).activeElement === sortBtn('az'));
      check('9 A–Z sent nothing', searches(tab).length === 1);
      click(tab, footBtn(tab));
      return H.wait(50);
    }).then(function () {
      check('9 more rows re-sorted', JSON.stringify(rowNames(tab, '#slist')) === '["Aardvark","Alpha 10","The Apple","beta","Zeta"]', rowNames(tab, '#slist'));
      check('9 note gone when all loaded', !note());
      click(tab, sortBtn('newest'));
      check('9 Newest by release date, missing last', JSON.stringify(rowNames(tab, '#slist')) === '["Aardvark","The Apple","Zeta","beta","Alpha 10"]', rowNames(tab, '#slist'));
      click(tab, sortBtn('best'));
      check('9 Best match restores Spotify order', JSON.stringify(rowNames(tab, '#slist')) === '["Zeta","The Apple","beta","Alpha 10","Aardvark"]', rowNames(tab, '#slist'));
      click(tab, chip(tab, 'artist'));
      return H.wait(50);
    }).then(function () {
      check('9 one result: no sort chips', rowNames(tab, '#slist').length === 1 && sortChips().length === 0);
    });
  });
});

// 10. Settings: which group comes first in All.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function () { return { status: 200, json: allAnswer('F') }; } }).then(function (tab) {
    var t = tab.t();
    check('10 default first group is Songs', t.searchFirst() === 'track');
    enter(tab, 'first');
    return H.wait(50).then(function () {
      var sel = $(tab, 'searchFirst');
      sel.value = 'album';
      sel.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
      check('10 choice stored', stored(store, 'lib-search-first') === 'album', store.getItem('lib-search-first'));
      check('10 Albums first, the rest in order', JSON.stringify(heads(tab)) === JSON.stringify(['Albums', 'Songs', 'Artists', 'Playlists', 'Podcasts', 'Episodes']), heads(tab));
      check('10 redraw sent nothing', searches(tab).length === 1);
      store.setItem('lib-search-first', JSON.stringify('bogus'));
      check('10 unknown value falls back to Songs', t.searchFirst() === 'track');
    });
  });
});

// 11. Recent searches: storage rules.
tests.push(function () {
  var store = searchStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.addRecentSearch('a');
    check('11 one letter not saved', store.getItem('lib-recent-searches') === null);
    t.addRecentSearch('  Abba  ');
    var r = stored(store, 'lib-recent-searches');
    check('11 saved trimmed with a time', r.length === 1 && r[0].q === 'Abba' && typeof r[0].at === 'number', r);
    t.addRecentSearch('abba');
    check('11 same search in other case kept once, newest spelling', JSON.stringify(recentQs(store)) === '["abba"]', recentQs(store));
    t.addRecentSearch('ta');
    t.addRecentSearch('taylor');
    check('11 extending within 30 s replaces', JSON.stringify(recentQs(store)) === '["taylor","abba"]', recentQs(store));
    t.addRecentSearch('tay');
    check('11 shortening within 30 s replaces', JSON.stringify(recentQs(store)) === '["tay","abba"]', recentQs(store));
    tab.skew += 31000;
    t.addRecentSearch('taylor');
    check('11 extending after 30 s adds', JSON.stringify(recentQs(store)) === '["taylor","tay","abba"]', recentQs(store));
    t.addRecentSearch('abba');
    check('11 repeating an older one moves it to the top', JSON.stringify(recentQs(store)) === '["abba","taylor","tay"]', recentQs(store));
    for (var i = 0; i < 10; i++) { tab.skew += 31000; t.addRecentSearch('q' + i + 'x'); }
    var qs = recentQs(store);
    check('11 capped at 8, newest first', qs.length === 8 && qs[0] === 'q9x' && qs[7] === 'q2x', qs);
    t.removeRecentSearch('Q5X');
    check('11 remove ignores case', recentQs(store).indexOf('q5x') === -1 && recentQs(store).length === 7, recentQs(store));
    store.setItem('lib-recent-searches', JSON.stringify({ q: 'x' }));
    check('11 not a list reads as empty', t.recentSearches().length === 0);
    store.setItem('lib-recent-searches', JSON.stringify([null, { q: 'a' }, { q: 5 }, { q: 'ok', at: 1 }, 'str']));
    check('11 bad entries skipped', JSON.stringify(t.recentSearches().map(function (x) { return x.q; })) === '["ok"]', t.recentSearches());
    store.setItem('lib-recent-searches', '{not json');
    check('11 unreadable storage reads as empty', t.recentSearches().length === 0);
  });
});

// 12. Recent searches on screen: tap to search, remove one, Clear; typing with pauses saves one entry.
tests.push(function () {
  var now = Date.now();
  var store = searchStore({ 'lib-recent-searches': [{ q: 'jazz', at: now - 1e6 }, { q: 'Blues', at: now - 2e6 }, { q: 'rock', at: now - 3e6 }] });
  return setup(store, { search: function (p) { return { status: 200, json: allAnswer(p.q) }; } }).then(function (tab) {
    function rq() { return [].slice.call(main(tab).querySelectorAll('[data-rq]')); }
    check('12 heading shown', /Recent searches/.test(mainText(tab)));
    check('12 recent buttons in order', rq().map(function (b) { return b.textContent; }).join(',') === 'jazz,Blues,rock', rq().map(function (b) { return b.textContent; }));
    check('12 buttons say what they do', rq()[1].getAttribute('aria-label') === 'Search for “Blues”' && !!main(tab).querySelector('[aria-label="Remove “Blues” from recent searches"]'));
    click(tab, main(tab).querySelector('[data-rx="1"]'));
    check('12 removed from storage', JSON.stringify(recentQs(store)) === '["jazz","rock"]', recentQs(store));
    check('12 removed from the screen', rq().map(function (b) { return b.textContent; }).join(',') === 'jazz,rock');
    check('12 focus moves to the next recent', d(tab).activeElement && d(tab).activeElement.getAttribute('data-rq') === '1');
    click(tab, rq()[1]);
    return H.wait(50).then(function () {
      check('12 tap fills the box', box(tab).value === 'rock');
      check('12 tap searches at once', searches(tab).length === 1 && searches(tab)[0].params.q === 'rock', searches(tab));
      check('12 focus to the pressed type chip', d(tab).activeElement === chip(tab, 'all'));
      check('12 results shown', rowNames(tab).indexOf('rock Song 0') !== -1, rowNames(tab));
      check('12 tapped one moves to the top', recentQs(store)[0] === 'rock' && recentQs(store).length === 2, recentQs(store));
      typeIn(tab, '');
      check('12 recents back when the box is empty', rq().map(function (b) { return b.textContent; }).join(',') === 'rock,jazz');
      var clear = [].slice.call(main(tab).querySelectorAll('button')).filter(function (b) { return b.textContent === 'Clear'; })[0];
      click(tab, clear);
      check('12 Clear empties storage', JSON.stringify(stored(store, 'lib-recent-searches')) === '[]');
      check('12 Clear shows the hint', /Type a song/.test(mainText(tab)) && !rq().length);
      check('12 Clear focuses the box', d(tab).activeElement === box(tab));
      typeIn(tab, 'ta');
      return H.wait(650);
    }).then(function () {
      typeIn(tab, 'taylor');
      return H.wait(650);
    }).then(function () {
      check('12 a pause runs each search', searches(tab).map(function (c) { return c.params.q; }).join(',') === 'rock,ta,taylor', searches(tab).map(function (c) { return c.params.q; }));
      check('12 still-typing searches saved once', JSON.stringify(recentQs(store)) === '["taylor"]', recentQs(store));
    });
  });
});

// 13. A stale answer for an older query doesn't replace newer results (answers on timers).
tests.push(function () {
  var store = searchStore();
  var delays = { ab: 300, abc: 30, cd: 200, ef: 250 };
  return setup(store, { search: function (p) {
    var json = p.type === 'track' ? { tracks: pg([trk('t' + p.q, p.q.toUpperCase() + ' track')]) }
      : { tracks: pg([trk('h' + p.q, p.q.toUpperCase() + ' hit')]), artists: pg([]), albums: pg([]), playlists: pg([]), shows: pg([]), episodes: pg([]) };
    return { status: 200, json: json, delay: p.type === 'track' ? 20 : (delays[p.q] || 10) };
  } }, HD).then(function (tab) {
    enter(tab, 'ab');
    return HD.wait(20).then(function () {
      check('13 Searching… while waiting', /Searching…/.test(mainText(tab)), mainText(tab));
      enter(tab, 'abc');
      return HD.wait(100);
    }).then(function () {
      check('13 newer answer shown', JSON.stringify(rowNames(tab)) === '["ABC hit"]', rowNames(tab));
      return HD.wait(350);
    }).then(function () {
      check('13 older answer did not replace it', JSON.stringify(rowNames(tab)) === '["ABC hit"]' && tab.t().currentSearch().q === 'abc', rowNames(tab));
      var n = searches(tab).length;
      enter(tab, 'ab');
      check('13 older query is cached once answered', searches(tab).length === n && JSON.stringify(rowNames(tab)) === '["AB hit"]', rowNames(tab));
      enter(tab, 'cd');
      return HD.wait(20);
    }).then(function () {
      click(tab, d(tab).querySelector('.filters .chip[data-filter="home"]'));
      return HD.wait(300);
    }).then(function () {
      check('13 answer after leaving search not drawn', !/CD hit|Searching…/.test(mainText(tab)) && tab.t().state.filter === 'home', mainText(tab));
      var n = searches(tab).length;
      click(tab, d(tab).querySelector('.filters .chip[data-filter="search"]'));
      check('13 back in search: answer shown from cache', box(tab).value === 'cd' && JSON.stringify(rowNames(tab)) === '["CD hit"]' && searches(tab).length === n, rowNames(tab));
      enter(tab, 'ef');
      return HD.wait(20);
    }).then(function () {
      click(tab, chip(tab, 'track'));
      return HD.wait(400);
    }).then(function () {
      check('13 All answer after a chip change not drawn', JSON.stringify(rowNames(tab)) === '["EF track"]' && heads(tab).length === 0 && !!$(tab, 'slist'), { rows: rowNames(tab), heads: heads(tab) });
    });
  });
});

// 14. Tapping a result: songs and episodes play, the rest open.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function () { return { status: 200, json: allAnswer('P') }; } }).then(function (tab) {
    var t = tab.t();
    function puts() { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; }); }
    enter(tab, 'tap');
    return H.wait(50).then(function () {
      click(tab, rowLink(tab, 'P Song 0'));
      return H.wait(50);
    }).then(function () {
      var p = puts();
      check('14 song tap plays on the device', p.length === 1 && p[0].query === '?device_id=A', p);
      check('14 song plays by itself', p[0] && JSON.stringify(p[0].body) === JSON.stringify({ uris: ['spotify:track:Ps0'] }), p[0] && p[0].body);
      check('14 toast says what plays', tab.toasts().indexOf('Playing “P Song 0” on iPhone') !== -1, tab.toasts());
      check('14 song tap stays on results', !t.state.detail);
      click(tab, rowLink(tab, 'P Ep 0'));
      return H.wait(50);
    }).then(function () {
      var p = puts();
      check('14 episode tap plays the episode', p.length === 2 && JSON.stringify(p[1].body) === JSON.stringify({ uris: ['spotify:episode:Pep0'] }), p[1] && p[1].body);
      tab.calls.length = 0;
      click(tab, rowLink(tab, 'P Album 0'));
      return H.wait(50);
    }).then(function () {
      check('14 album tap opens the album', t.state.detail && t.state.detail.item.kind === 'album' && t.state.detail.item.id === 'Pal0');
      check('14 album songs asked', tab.calls.some(function (c) { return c.path === '/albums/Pal0/tracks'; }), tab.calls.map(function (c) { return c.path; }));
      check('14 album tap plays nothing', !puts().length);
      tab.calls.length = 0;
      t.closeDetail();
      check('14 back shows the same results, nothing asked', rowLink(tab, 'P Song 0') && searches(tab).length === 0);
      click(tab, rowLink(tab, 'P Artist 0'));
      check('14 artist tap opens the artist', t.state.detail && t.state.detail.kind === 'artist' && t.state.detail.item.id === 'Par0');
      t.closeDetail();
      click(tab, rowLink(tab, 'P Playlist 0'));
      check('14 playlist tap opens the playlist', t.state.detail && t.state.detail.item.kind === 'playlist' && t.state.detail.item.id === 'Ppl0');
      t.closeDetail();
      tab.calls.length = 0;
      click(tab, rowLink(tab, 'P Show 0'));
      return H.wait(50);
    }).then(function () {
      check('14 podcast tap opens the podcast', t.state.detail && t.state.detail.item.kind === 'show' && t.state.detail.item.id === 'Psh0');
      check('14 podcast episodes asked', tab.calls.some(function (c) { return c.path === '/shows/Psh0/episodes'; }));
      check('14 nothing played from opening', !puts().length);
    });
  });
});

// 15. Search paused by Spotify: nothing is sent, and the page says so.
tests.push(function () {
  var store = searchStore({ 'lib-cooloff': { search: { until: Date.now() + 600000, reason: 'rate', strikes: 0 } } });
  return setup(store).then(function (tab) {
    enter(tab, 'paused');
    return H.wait(50).then(function () {
      check('15 nothing sent while search is paused', searches(tab).length === 0, tab.calls);
      check('15 paused message in the list', /Spotify paused search/.test(errText(tab)), errText(tab));
      check('15 toast says search is paused', tab.toasts().some(function (m) { return /paused search/.test(m); }), tab.toasts());
    });
  });
});

// 16. Album songs through search while album details are paused.
function albumItem(id, name, extra) {
  var it = { kind: 'album', id: id, name: name, uri: 'spotify:album:' + id, url: 'https://open.spotify.com/album/' + id, img: '', sub: 'Album · Joni, Other', artist: 'Joni, Other', artist1: 'Joni', tracks: 3 };
  Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
  return it;
}
tests.push(function () {
  var store = searchStore({ 'lib-cooloff': { catalog: { until: Date.now() + 600000, reason: 'rate', strikes: 0 } } });
  var al3fail = true;
  return setup(store, { search: function (p) {
    if (/Blue Night/.test(p.q)) return { status: 200, json: { tracks: pg([
      trk('t3', 'Track 3', { album: 'al1', n: 3, total: 3 }), trk('x1', 'Other album', { album: 'zz', n: 1 }),
      trk('t2', 'Track 2', { album: 'al1', n: 2, total: 3 }), trk('t1', 'Track 1', { album: 'al1', n: 1, total: 3 })], true) } };
    if (/Long/.test(p.q)) {
      if (p.offset === '0') return { status: 200, json: { tracks: pg(range(10, function (i) { return trk('L' + i, 'Long ' + (i + 1), { album: 'al2', n: i + 1, total: 25 }); }), true) } };
      return { status: 200, json: { tracks: pg([trk('y1', 'Not this album', { album: 'zz' })], true) } };
    }
    if (/Broken/.test(p.q)) {
      if (al3fail) { al3fail = false; return BOOM; }
      return { status: 200, json: { tracks: pg([trk('b1', 'Fixed', { album: 'al3', n: 1, total: 1 })]) } };
    }
    return { status: 200, json: { tracks: pg([]) } };
  } }).then(function (tab) {
    var t = tab.t();
    function dnames() { return rowNames(tab, '#dlist'); }
    function dfootBtn() { return $(tab, 'dfoot').querySelector('button'); }
    check('16 albumQuery: quotes dropped, first artist', t.albumQuery({ name: 'Blue "Night"', artist1: 'Joni' }) === 'album:"Blue Night" artist:"Joni"', t.albumQuery({ name: 'Blue "Night"', artist1: 'Joni' }));
    check('16 albumQuery: artist from the artist list', t.albumQuery({ name: 'X', artist: 'A, B' }) === 'album:"X" artist:"A"', t.albumQuery({ name: 'X', artist: 'A, B' }));
    check('16 albumQuery: no artist, spaces tidied', t.albumQuery({ name: '  Spaced   out ' }) === 'album:"Spaced out"', t.albumQuery({ name: '  Spaced   out ' }));
    t.openDetail(albumItem('al1', 'Blue "Night"'));
    return H.wait(50).then(function () {
      var s = searches(tab);
      check('16 one search request', s.length === 1, s);
      check('16 search for album songs', s[0] && s[0].params.type === 'track' && s[0].params.limit === '10' && s[0].params.offset === '0' && s[0].params.q === 'album:"Blue Night" artist:"Joni"', s[0] && s[0].params);
      check('16 album details not asked while paused', !tab.calls.some(function (c) { return /^\/albums\//.test(c.path); }));
      check('16 only this album, in track order', JSON.stringify(dnames()) === '["Track 1","Track 2","Track 3"]', dnames());
      check('16 count says found', $(tab, 'dsum').textContent === '3 songs found', $(tab, 'dsum').textContent);
      check('16 says it came from search', /From search \(Spotify paused album details/.test(mainText(tab)), mainText(tab));
      check('16 complete album saved', (stored(store, 'lib-cache-album:al1') || { items: [] }).items.length === 3);
      check('16 no Load more when complete', !dfootBtn());
      tab.calls.length = 0;
      click(tab, rowLink(tab, 'Track 2'));
      return H.wait(50);
    }).then(function () {
      var p = tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
      check('16 song plays in the album', p.length === 1 && JSON.stringify(p[0].body) === JSON.stringify({ context_uri: 'spotify:album:al1', offset: { uri: 'spotify:track:t2' } }), p[0] && p[0].body);
      t.openDetail(albumItem('al2', 'Long', { tracks: 25 }));
      return H.wait(50);
    }).then(function () {
      check('16 partial: count of total', $(tab, 'dsum').textContent === '10 of 25 songs found', $(tab, 'dsum').textContent);
      check('16 partial: Load more', dfootBtn() && dfootBtn().textContent === 'Load more');
      tab.calls.length = 0;
      click(tab, dfootBtn());
      return H.wait(50);
    }).then(function () {
      var s = searches(tab);
      check('16 Load more asks the next 10', s.length === 1 && s[0].params.offset === '10' && /^album:"Long"/.test(s[0].params.q), s.map(function (c) { return c.params; }));
      check('16 page with nothing new ends it', dnames().length === 10 && !dfootBtn(), dnames().length);
      check('16 incomplete album not saved', store.getItem('lib-cache-album:al2') === null);
      t.openDetail(albumItem('al3', 'Broken', { tracks: 1 }));
      return H.wait(50);
    }).then(function () {
      var f = $(tab, 'dfoot');
      check('16 error shown', /Couldn’t search for this album’s songs \(Server boom\)\./.test(f.textContent), f.textContent);
      check('16 Try again offered', dfootBtn() && dfootBtn().textContent === 'Try again');
      tab.calls.length = 0;
      click(tab, dfootBtn());
      return H.wait(50);
    }).then(function () {
      check('16 Try again searches again', searches(tab).length === 1);
      check('16 songs after the retry', JSON.stringify(dnames()) === '["Fixed"]', dnames());
      t.openDetail(albumItem('al4', 'Nowhere', { tracks: 5 }));
      return H.wait(50);
    }).then(function () {
      check('16 nothing found says so', /Search didn’t find this album’s songs/.test($(tab, 'dfoot').textContent), $(tab, 'dfoot').textContent);
    });
  });
});

// 17. Album search when search is paused too: nothing is sent.
tests.push(function () {
  var until = Date.now() + 600000;
  var store = searchStore({ 'lib-cooloff': { catalog: { until: until, reason: 'rate', strikes: 0 }, search: { until: until, reason: 'rate', strikes: 0 } } });
  return setup(store).then(function (tab) {
    tab.t().openDetail(albumItem('al9', 'Quiet'));
    return H.wait(50).then(function () {
      check('17 no request while both are paused', tab.calls.filter(function (c) { return c.path === '/search' || /^\/albums\//.test(c.path); }).length === 0, tab.calls);
      check('17 says search is paused', /paused/.test($(tab, 'dfoot').textContent) && /search/.test($(tab, 'dfoot').textContent), $(tab, 'dfoot').textContent);
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
