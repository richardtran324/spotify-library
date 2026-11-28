'use strict';
// Smoother Search Spotify: results stay on screen while the next query loads (SEARCH-1), dragging the list puts the
// keyboard away (SEARCH-2), "See all …" starts from the All answer (SEARCH-3), a failed search says so in plain
// words with Try again and is asked again when the connection is back (SEARCH-4, FLOWS-2).
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var HD = H.delayed;
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var ALL_TYPES = 'track,artist,album,playlist,show,episode';

// ---------- Spotify objects ----------
function trk(id, name) {
  return { id: id, uri: 'spotify:track:' + id, name: name, type: 'track', artists: [{ id: 'ar1', name: 'Art' }],
    album: { id: 'alx', name: 'Alb', images: [] }, duration_ms: 200000, track_number: 1, disc_number: 1 };
}
function art(id, name) { return { id: id, uri: 'spotify:artist:' + id, name: name, images: [], genres: ['pop'] }; }
function pg(items, more) { return { items: items, next: more ? 'https://api.spotify.com/v1/search?offset=x' : null, total: 100 }; }
function range(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
function songs(p, n, more) { return pg(range(n, function (i) { return trk(p + 's' + i, p + ' Song ' + i); }), more); }
function allAnswer(p, o) {
  o = o || {};
  return { tracks: songs(p, o.songs || 3, o.songsMore), artists: pg([art(p + 'ar0', p + ' Artist 0'), art(p + 'ar1', p + ' Artist 1')], false),
    albums: pg([]), playlists: pg([]), shows: pg([]), episodes: pg([]) };
}
var BOOM = { status: 503, json: { error: { status: 503, message: 'Service unavailable' } } };

// ---------- tab setup ----------
// opts.search(params, call) answers GET /search ({status, json, delay?}); throwing a TypeError is "no internet".
function setup(store, opts, Hx) {
  opts = opts || {};
  Hx = Hx || H;
  var env = { search: opts.search || function () { return { status: 200, json: allAnswer('X') }; } };
  var tab = Hx.makeTab(store, function (method, path, q, body, call) {
    call.params = {};
    q.forEach(function (v, k) { call.params[k] = v; });
    if (path === '/search' && method === 'GET') return env.search(call.params, call);
    if (path === '/me/tracks' && method === 'GET') return { status: 200, json: { items: range(5, function (i) { return { added_at: '2026-01-01T00:00:00Z', track: trk('lk' + i, 'Liked ' + i) }; }), total: 5, next: null } };
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
    t.state.device = DEV; t.state.deviceAt = Date.now() + 3600e3;
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
function rowNames(tab, sel) { return [].slice.call(d(tab).querySelectorAll((sel || '#main') + ' a.item .name')).map(function (n) { return n.textContent; }); }
function chip(tab, t) { return d(tab).querySelector('.schip[data-stype="' + t + '"]'); }
function errText(tab) { var e = main(tab).querySelector('.err'); return e ? e.textContent : ''; }
function retryBtn(tab) { return $(tab, 'searchRetry'); }
function stale(tab) { return main(tab).querySelector('.sstale'); }
function busyLine(tab) { var b = main(tab).querySelector('.sbusy'); return b ? b.textContent : ''; }
function plainSearching(tab) { var p = main(tab).querySelector('p.empty'); return !!p && p.textContent === 'Searching…'; }
function footBtn(tab) { var f = $(tab, 'sfoot'); return f ? f.querySelector('button') : null; }
function touch(tab, type, target, x, y) {
  var ev = new tab.w.Event(type, { bubbles: true, cancelable: false });
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  target.dispatchEvent(ev);
}
function drag(tab, target, dy) { touch(tab, 'touchstart', target, 50, 100); touch(tab, 'touchmove', target, 50, 100 + dy); touch(tab, 'touchend', target); }

var tests = [];

// 1. SEARCH-1, All view: while "taylor" loads, the "tay" rows stay (dimmed, busy) under one status line.
tests.push(function () {
  var store = searchStore();
  var delay = { tay: 10, taylor: 200 };
  return setup(store, { search: function (p) { return { status: 200, json: allAnswer(p.q), delay: delay[p.q] || 10 }; } }, HD).then(function (tab) {
    enter(tab, 'tay');
    return HD.wait(3).then(function () {
      check('1 first search ever: plain Searching…', plainSearching(tab) && !stale(tab), mainText(tab));
      return HD.wait(60);
    }).then(function () {
      check('1 tay rows', rowNames(tab)[0] === 'tay Song 0', rowNames(tab));
      typeIn(tab, 'taylor');
      return HD.wait(300);
    }).then(function () {
      check('1 during the typing pause the rows stay as they were', rowNames(tab)[0] === 'tay Song 0' && !stale(tab), mainText(tab));
      return HD.wait(300);
    }).then(function () {
      check('1 request for taylor in flight', searches(tab).length === 2 && searches(tab)[1].params.q === 'taylor', searches(tab).map(function (c) { return c.params.q; }));
      check('1 while loading: tay rows still shown', rowNames(tab)[0] === 'tay Song 0' && rowNames(tab).length === 5, rowNames(tab));
      check('1 while loading: no plain Searching…', !plainSearching(tab), mainText(tab));
      check('1 while loading: rows marked busy', !!stale(tab) && stale(tab).getAttribute('aria-busy') === 'true' && stale(tab).querySelectorAll('a.item').length === 5);
      check('1 while loading: one status line names the new query', busyLine(tab) === 'Searching for “taylor”…', busyLine(tab));
      return HD.wait(250);
    }).then(function () {
      check('1 answer: only taylor rows', rowNames(tab)[0] === 'taylor Song 0' && rowNames(tab).every(function (n) { return n.indexOf('taylor ') === 0; }), rowNames(tab));
      check('1 answer: busy mark and status line gone', !stale(tab) && !main(tab).querySelector('[aria-busy]') && !busyLine(tab), main(tab).innerHTML.slice(0, 200));
    });
  });
});

// 2. SEARCH-1, one type: the stale song list keeps its place, without Load more; the answer brings Load more back.
tests.push(function () {
  var store = searchStore({ 'lib-searchtype': 'track' });
  return setup(store, { search: function (p) { return { status: 200, json: { tracks: songs(p.q, 10, true) }, delay: p.q === 'taylor' ? 200 : 10 }; } }, HD).then(function (tab) {
    enter(tab, 'tay');
    return HD.wait(60).then(function () {
      check('2 tay songs with Load more', rowNames(tab, '#slist').length === 10 && footBtn(tab) && footBtn(tab).textContent === 'Load more');
      enter(tab, 'taylor');
      return HD.wait(40);
    }).then(function () {
      check('2 while loading: tay songs kept in the list', rowNames(tab, '#slist')[0] === 'tay Song 0' && !!stale(tab) && stale(tab).contains($(tab, 'slist')), rowNames(tab, '#slist'));
      check('2 while loading: no Load more under old rows', !$(tab, 'sfoot'));
      check('2 while loading: status line', busyLine(tab) === 'Searching for “taylor”…', busyLine(tab));
      return HD.wait(250);
    }).then(function () {
      check('2 answer: taylor songs and Load more', rowNames(tab, '#slist')[0] === 'taylor Song 0' && !stale(tab) && footBtn(tab) && footBtn(tab).textContent === 'Load more');
    });
  });
});

// 3. SEARCH-1 limits: another result type, a cleared box, or a late answer for an older query.
tests.push(function () {
  var store = searchStore({ 'lib-searchtype': 'track' });
  var delay = { ta: 300, taylor: 30 };
  return setup(store, { search: function (p) {
    var json = p.type === 'track' ? { tracks: songs(p.q, 2) } : allAnswer(p.q);
    return { status: 200, json: json, delay: p.type === 'track' ? (delay[p.q] || 10) : 200 };
  } }, HD).then(function (tab) {
    enter(tab, 'abc');
    return HD.wait(50).then(function () {
      check('3 abc songs', rowNames(tab, '#slist')[0] === 'abc Song 0');
      click(tab, chip(tab, 'all'));
      return HD.wait(20);
    }).then(function () {
      check('3 another type: plain Searching…, no song rows under the All chip', plainSearching(tab) && !stale(tab) && !rowNames(tab).length, mainText(tab));
      return HD.wait(250);
    }).then(function () {
      check('3 All answer drawn', rowNames(tab)[0] === 'abc Song 0' && main(tab).querySelectorAll('h2.sect').length === 2);
      typeIn(tab, '');
      typeIn(tab, 'xy');
      return HD.wait(560);
    }).then(function () {
      check('3 after clearing the box: plain Searching…', plainSearching(tab) && !stale(tab), mainText(tab));
      return HD.wait(250);
    }).then(function () {
      click(tab, chip(tab, 'track'));
      return HD.wait(50);
    }).then(function () {
      enter(tab, 'ta');
      return HD.wait(5);
    }).then(function () {
      enter(tab, 'taylor');
      return HD.wait(100);
    }).then(function () {
      check('3 newer answer shown', rowNames(tab, '#slist')[0] === 'taylor Song 0', rowNames(tab, '#slist'));
      return HD.wait(350);
    }).then(function () {
      check('3 late older answer changes nothing', rowNames(tab, '#slist')[0] === 'taylor Song 0' && !stale(tab) && !busyLine(tab), rowNames(tab, '#slist'));
    });
  });
});

// 4. SEARCH-2: dragging the list puts the keyboard away; taps, tiny moves and drags on a text box don't.
tests.push(function () {
  var store = searchStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    enter(tab, 'drag');
    return H.wait(50).then(function () {
      var row = main(tab).querySelector('a.item');
      box(tab).focus();
      touch(tab, 'touchstart', row, 50, 100); touch(tab, 'touchend', row);
      check('4 a tap keeps the keyboard', d(tab).activeElement === box(tab));
      drag(tab, row, 3);
      check('4 a 3 px move keeps the keyboard', d(tab).activeElement === box(tab));
      drag(tab, row, 30);
      check('4 a 30 px drag on the results puts the keyboard away', d(tab).activeElement !== box(tab), d(tab).activeElement && d(tab).activeElement.id);
      box(tab).focus();
      touch(tab, 'touchstart', row, 50, 100); touch(tab, 'touchmove', row, 62, 100);
      check('4 a sideways drag counts too', d(tab).activeElement !== box(tab));
      row.focus();
      drag(tab, row, 40);
      check('4 focus on a row: left alone', d(tab).activeElement === row);
      t.setFilter('home');
      t.openDetail({ kind: 'liked', id: 'liked', uri: 'spotify:collection', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks', img: '', sub: 'Playlist' });
      return H.wait(200);
    }).then(function () {
      var f = $(tab, 'dfind');
      var b = $(tab, 'dfindBox');
      check('4 Find in list box shown', !!f && !!b && !b.hidden);
      if (!f) return;
      f.focus();
      drag(tab, f, 40);
      check('4 a drag that starts on the Find box keeps it (caret, selection)', d(tab).activeElement === f);
      var row = d(tab).querySelector('#dlist a.item');
      drag(tab, row, 40);
      check('4 a drag on the song list puts the Find keyboard away', d(tab).activeElement !== f);
    });
  });
});

// 5. SEARCH-3: See all starts from the All answer: no request, no Searching…, Load more goes on at offset 10.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) {
    if (p.type === 'track') return { status: 200, json: { tracks: songs('more', 10, false) } };
    return { status: 200, json: allAnswer('S', { songs: 10, songsMore: true }) };
  } }).then(function (tab) {
    var t = tab.t();
    enter(tab, 'seeall');
    return H.wait(50).then(function () {
      check('5 one All request', searches(tab).length === 1 && searches(tab)[0].params.type === ALL_TYPES);
      check('5 the All answer adds one cache entry, not one per type', Object.keys(t.searchCache).filter(function (k) { return /\nseeall$/.test(k); }).length === 1, Object.keys(t.searchCache));
      click(tab, main(tab).querySelector('button[data-see="track"]'));
      check('5 See all songs: drawn at once, no Searching…', rowNames(tab, '#slist').length === 10 && !plainSearching(tab) && !stale(tab), mainText(tab));
      check('5 See all songs: nothing asked', searches(tab).length === 1, searches(tab).map(function (c) { return c.params; }));
      check('5 Songs chip pressed and focused', chip(tab, 'track').getAttribute('aria-pressed') === 'true' && d(tab).activeElement === chip(tab, 'track'));
      check('5 Load more offered', footBtn(tab) && footBtn(tab).textContent === 'Load more');
      click(tab, footBtn(tab));
      return H.wait(50);
    }).then(function () {
      var s = searches(tab);
      check('5 Load more asks songs from offset 10', s.length === 2 && s[1].params.type === 'track' && s[1].params.offset === '10' && s[1].params.q === 'seeall', s.map(function (c) { return c.params; }));
      check('5 rows added, the end reached', rowNames(tab, '#slist').length === 20 && !footBtn(tab), rowNames(tab, '#slist').length);
      click(tab, chip(tab, 'artist'));
      check('5 Artists chip: rows from the All answer, nothing asked', JSON.stringify(rowNames(tab, '#slist')) === '["S Artist 0","S Artist 1"]' && searches(tab).length === 2, rowNames(tab, '#slist'));
      check('5 Artists: Spotify said there are no more, so no Load more', !footBtn(tab));
    });
  });
});

// 6. SEARCH-3: a chip while the All answer is still loading searches that type as before.
tests.push(function () {
  var store = searchStore();
  return setup(store, { search: function (p) {
    if (p.type === 'artist') return { status: 200, json: { artists: pg([art('x1', 'Xavier')]) }, delay: 10 };
    return { status: 200, json: allAnswer('S'), delay: 200 };
  } }, HD).then(function (tab) {
    enter(tab, 'early');
    return HD.wait(20).then(function () {
      click(tab, chip(tab, 'artist'));
      return HD.wait(60);
    }).then(function () {
      var s = searches(tab);
      check('6 asks artists from offset 0', s.length === 2 && s[1].params.type === 'artist' && s[1].params.offset === '0', s.map(function (c) { return c.params; }));
      check('6 artist rows', JSON.stringify(rowNames(tab, '#slist')) === '["Xavier"]', rowNames(tab, '#slist'));
    });
  });
});

// 7. SEARCH-4 / FLOWS-2: plain words and Try again; Try again searches once and keeps the keyboard down.
tests.push(function () {
  var store = searchStore();
  var n = 0;
  return setup(store, { search: function (p) { return ++n === 1 ? BOOM : { status: 200, json: allAnswer('R') }; } }).then(function (tab) {
    enter(tab, 'retry');
    return H.wait(50).then(function () {
      check('7 plain words', errText(tab) === 'Couldn’t search. Spotify isn’t answering right now.', errText(tab));
      check('7 Try again offered', retryBtn(tab) && retryBtn(tab).textContent === 'Try again');
      click(tab, retryBtn(tab));
      return H.wait(50);
    }).then(function () {
      check('7 Try again sends one search', searches(tab).length === 2 && searches(tab)[1].params.q === 'retry', searches(tab).length);
      check('7 results drawn, error gone', rowNames(tab)[0] === 'R Song 0' && !errText(tab) && !retryBtn(tab), mainText(tab));
      check('7 Try again does not open the keyboard', d(tab).activeElement !== box(tab));
    });
  });
});

// 8. No internet: plain words, then one search when the connection is back (the online catch-up); none otherwise.
tests.push(function () {
  var store = searchStore();
  var offline = true;
  return setup(store, { search: function (p) {
    if (offline) throw new TypeError('Load failed');
    return { status: 200, json: allAnswer('N') };
  } }).then(function (tab) {
    enter(tab, 'netless');
    return H.wait(50).then(function () {
      check('8 offline: plain words', errText(tab) === 'Couldn’t search. No internet connection.', errText(tab));
      check('8 offline: Try again offered', !!retryBtn(tab));
      offline = false;
      tab.calls.length = 0;
      tab.w.dispatchEvent(new tab.w.Event('online'));
      return H.wait(1300);
    }).then(function () {
      var s = searches(tab);
      check('8 back online: the failed search is asked once', s.length === 1 && s[0].params.q === 'netless', s.map(function (c) { return c.params; }));
      check('8 back online: results drawn', rowNames(tab)[0] === 'N Song 0', mainText(tab));
      tab.calls.length = 0;
      tab.skew += 6000;
      tab.w.dispatchEvent(new tab.w.Event('offline'));
      tab.w.dispatchEvent(new tab.w.Event('online'));
      return H.wait(1300);
    }).then(function () {
      check('8 online again with nothing failed: no search', searches(tab).length === 0, searches(tab).map(function (c) { return c.params; }));
    });
  });
});

// 9. The paused case: nothing sent, the pause text alone (no Try again).
tests.push(function () {
  var store = searchStore({ 'lib-cooloff': { search: { until: Date.now() + 600000, reason: 'rate', strikes: 0 } } });
  return setup(store).then(function (tab) {
    enter(tab, 'paused query');
    return H.wait(50).then(function () {
      check('9 nothing sent', searches(tab).length === 0, tab.calls);
      check('9 paused text shown', /Spotify paused search/.test(errText(tab)), errText(tab));
      check('9 no Try again while paused', !retryBtn(tab));
      tab.w.dispatchEvent(new tab.w.Event('offline'));
      tab.w.dispatchEvent(new tab.w.Event('online'));
      return H.wait(1300);
    }).then(function () {
      check('9 back online while paused: still nothing sent', searches(tab).length === 0);
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
