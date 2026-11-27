'use strict';
// Find in list (v2.22) tests: jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
// Song n: a few have accents and special artists or albums, so the matching rules can be checked.
function songObj(n, prefix) {
  prefix = prefix || 't';
  var name = 'Track ' + n, artist = 'Band ' + (n % 10), album = 'Record ' + (n % 7);
  if (n === 7) { name = 'Café del Mar'; artist = 'Energy 52'; }
  if (n === 120) { name = 'Halo'; artist = 'Beyoncé'; }
  if (n === 130) { album = 'Mañana Sessions'; }
  if (n === 210) { name = 'Don’t Stop'; artist = 'Fleetwood Mac'; album = 'Rumours'; }
  if (n === 222) { name = 'Zebra Crossing'; }
  return { type: 'track', id: prefix + n, uri: 'spotify:track:' + prefix + n, name: name, duration_ms: 200000,
    artists: [{ name: artist }], album: { id: 'al' + (n % 7), name: album, images: [] } };
}
function pageOf(path, total, offset, prefix, key) {
  var items = [];
  for (var i = offset; i < Math.min(total, offset + 50); i++) { var o = { added_at: '2026-01-01T00:00:00Z' }; o[key || 'track'] = songObj(i, prefix); items.push(o); }
  return { items: items, total: total, offset: offset, limit: 50,
    next: offset + 50 < total ? 'https://api.spotify.com/v1' + path + '?offset=' + (offset + 50) + '&limit=50' : null };
}
function episodeObj(n) {
  return { type: 'episode', id: 'e' + n, uri: 'spotify:episode:e' + n, name: n === 3 ? 'Budget season' : 'Episode ' + n, release_date: '2026-11-0' + (n % 9 + 1),
    duration_ms: 1800000, images: [], show: { id: 's' + (n % 2), name: n % 2 ? 'Planet Money' : 'Économie Hebdo', images: [] },
    resume_point: { fully_played: false, resume_position_ms: 0 } };
}
// env: liked (total), pl (total), fail (offset -> status), delay (ms), cool (group -> true)
function setup(store, env) {
  env = env || {};
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    var off = +(q.get('offset') || 0);
    if (method === 'GET' && env.fail && env.fail[path + '@' + off]) return { status: env.fail[path + '@' + off], json: { error: { status: 429, message: 'API rate limit exceeded' } }, delay: env.delay || 0 };
    if (method === 'GET' && path === '/me/tracks' && env.liked != null) return { status: 200, json: pageOf(path, env.liked, off), delay: env.delayOf ? env.delayOf(off) : env.delay || 0 };
    if (method === 'GET' && path === '/playlists/p1/items') return { status: 200, json: pageOf(path, env.pl || 0, off, 'p', 'item'), delay: env.delay || 0 };
    if (method === 'GET' && path === '/albums/al9/tracks') {
      var items = [];
      for (var i = off; i < Math.min(60, off + 50); i++) { var s = songObj(i, 'a'); s.track_number = i + 1; s.disc_number = 1; items.push(s); }
      return { status: 200, json: { items: items, total: 60, next: off + 50 < 60 ? 'https://api.spotify.com/v1/albums/al9/tracks?offset=' + (off + 50) + '&limit=50' : null } };
    }
    if (method === 'GET' && path === '/me/episodes') {
      var eps = [];
      for (var k = off; k < Math.min(env.eps || 0, off + 50); k++) eps.push({ added_at: '2026-01-01T00:00:00Z', episode: episodeObj(k) });
      return { status: 200, json: { items: eps, total: env.eps || 0, next: off + 50 < (env.eps || 0) ? 'https://api.spotify.com/v1/me/episodes?offset=' + (off + 50) + '&limit=50' : null } };
    }
    if (method === 'GET' && path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function doc(tab) { return tab.w.document; }
function $(tab, id) { return doc(tab).getElementById(id); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function rows(tab) { return [].slice.call(doc(tab).querySelectorAll('#dlist li.row')); }
function rowNames(tab) { return rows(tab).map(function (li) { return li.querySelector('.name').textContent; }); }
function type(tab, text, caret) {
  var inp = $(tab, 'dfind');
  inp.focus();
  inp.value = text;
  var c = caret == null ? text.length : caret;
  inp.setSelectionRange(c, c);
  inp.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
  return inp;
}
function boxShown(tab) { var b = $(tab, 'dfindBox'); return !!b && !b.hidden; }
function allBtn(tab) { return $(tab, 'dfindAll'); }
function footText(tab) { return $(tab, 'dfoot').textContent; }
function hasLoadMore(tab) { return [].slice.call(doc(tab).querySelectorAll('#dfoot button')).some(function (b) { return b.textContent === 'Load more'; }); }
function maxOverlap(calls) {
  var ev = [];
  calls.forEach(function (c) { ev.push([c.s, 1]); ev.push([c.e || 1e9, -1]); });
  ev.sort(function (a, b) { return a[0] - b[0]; });
  var n = 0, m = 0;
  ev.forEach(function (x) { n += x[1]; m = Math.max(m, n); });
  return m;
}
function offsets(calls) { return calls.map(function (c) { return +new URLSearchParams(c.query).get('offset'); }); }
function pauseGroup(store, g, mins) {
  var c = {}; c[g] = { until: Date.now() + (mins || 10) * 60000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: null };
  store.setItem('lib-cooloff', JSON.stringify(c));
}
var LIKED = { kind: 'liked', id: 'liked', uri: 'spotify:collection', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks', img: '', sub: 'Playlist' };
function ownPl(t) { return { kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1', name: 'Road trip', url: 'https://open.spotify.com/playlist/p1', img: '', sub: 'Playlist', ownerId: t.state.data.me.id }; }

var tests = [];

// 1. Matching rules: case and accent blind, title, artist and album, every word somewhere.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    function hit(item, q) { return t.findHit(item, t.foldText(q).trim().split(/\s+/)); }
    var cafe = { name: 'Café del Mar', artist: 'Energy 52', albumName: 'Café del Mar (Remixes)' };
    var halo = { name: 'Halo', artist: 'Beyoncé', albumName: 'I Am... Sasha Fierce' };
    var man = { name: 'Morning', artist: 'Band', albumName: 'Mañana Sessions' };
    var dont = { name: 'Don’t Stop', artist: 'Fleetwood Mac', albumName: 'Rumours' };
    check('1 fold strips accents and case', t.foldText('ÉCOLE Ñandú Crème Brûlée') === 'ecole nandu creme brulee', t.foldText('ÉCOLE Ñandú Crème Brûlée'));
    check('1 plain query finds accented title', hit(cafe, 'cafe'));
    check('1 accented query finds plain text too', hit({ name: 'Cafe', artist: '', albumName: '' }, 'Café'));
    check('1 upper case query', hit(cafe, 'CAFÉ DEL'));
    check('1 artist field', hit(halo, 'beyonce') && hit(cafe, 'energy'));
    check('1 album field', hit(man, 'manana') && hit(halo, 'sasha'));
    check('1 words across fields', hit(dont, 'stop fleetwood') && hit(halo, 'halo beyonce'));
    check('1 every word must match', !hit(dont, 'stop beyonce'));
    check('1 straight apostrophe finds curly', hit(dont, "don't"));
    check('1 no match', !hit(halo, 'zebra'));
    check('1 empty query is no filter', t.findTokens({ item: LIKED, find: '   ', items: [] }) === null);
  });
});

// 2. Liked Songs: box shows, typing filters, focus and caret stay, no requests from typing, clearing restores.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('2 one page loaded', reqs(tab, 'GET', '/me/tracks').length === 1 && rows(tab).length === 50, { r: reqs(tab, 'GET', '/me/tracks').length, n: rows(tab).length });
      check('2 find box shown', boxShown(tab));
      check('2 box is under the header, above the list', $(tab, 'dfindBox').compareDocumentPosition($(tab, 'dlist')) & 4);
      check('2 placeholder', $(tab, 'dfind').placeholder === 'Find in songs');
      check('2 Load more before typing', hasLoadMore(tab));
      tab.calls.length = 0;
      var inp = type(tab, 'cafe', 2);
      check('2 filters to the match', JSON.stringify(rowNames(tab)) === '["Café del Mar"]', rowNames(tab));
      check('2 focus kept on the same box', doc(tab).activeElement === inp && $(tab, 'dfind') === inp);
      check('2 caret kept', inp.selectionStart === 2 && inp.selectionEnd === 2, [inp.selectionStart, inp.selectionEnd]);
      check('2 Search all offered instead of Load more', !!allBtn(tab) && allBtn(tab).textContent === 'Search all 240 songs' && !hasLoadMore(tab), footText(tab));
      check('2 note gives library request count', /Loads 190 more songs \(4 requests\)/.test(footText(tab)), footText(tab));
      type(tab, 'Energy 52');
      check('2 artist filter', JSON.stringify(rowNames(tab)) === '["Café del Mar"]', rowNames(tab));
      type(tab, 'record 3');
      check('2 album filter (every song on Record 3 shows)', [3, 10, 17, 24, 31, 38, 45].every(function (n) { return rowNames(tab).indexOf('Track ' + n) !== -1; }) && rowNames(tab).indexOf('Track 4') === -1, rowNames(tab));
      type(tab, 'zzz');
      check('2 no match message', rows(tab).length === 0 && /No songs match “zzz” in the 50 loaded\./.test(footText(tab)), footText(tab));
      check('2 box stays with no matches', boxShown(tab) && doc(tab).activeElement === inp);
      type(tab, '');
      check('2 clearing restores the list', rows(tab).length === 50);
      check('2 clearing restores Load more', hasLoadMore(tab) && !allBtn(tab));
      return H.wait(300).then(function () {
        check('2 no requests from typing', tab.calls.length === 0, tab.calls);
        // A redraw of the same view (as when a view on top closes) keeps the focus, the text and the caret.
        type(tab, 'halo', 1);
        t.renderDetail();
        var again = $(tab, 'dfind');
        check('2 redraw keeps text', again && again.value === 'halo');
        check('2 redraw keeps focus and caret', doc(tab).activeElement === again && again.selectionStart === 1, { a: doc(tab).activeElement && doc(tab).activeElement.id, s: again.selectionStart });
        // Enter hides the keyboard.
        again.dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        check('2 Enter blurs', doc(tab).activeElement !== again);
      });
    });
  });
});

// 3. Tapping a match plays it in Liked Songs' context, same as unfiltered.
tests.push(function () {
  return setup(H.seedStore(), { liked: 60 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      var unfiltered = doc(tab).querySelector('li[data-puri="spotify:track:t7"] a.item');
      click(tab, unfiltered);
      return H.wait(200);
    }).then(function () {
      var plays = reqs(tab, 'PUT', '/me/player/play');
      var plain = plays[0] && plays[0].body;
      tab.calls.length = 0;
      type(tab, 'CAFE');
      click(tab, doc(tab).querySelector('#dlist a.item'));
      return H.wait(200).then(function () {
        var p2 = reqs(tab, 'PUT', '/me/player/play');
        var body = p2[0] && p2[0].body;
        check('3 one play request', p2.length === 1, tab.calls);
        check('3 plays in Liked Songs context with offset', body && body.context_uri === 'spotify:user:' + t.state.data.me.id + ':collection' && body.offset && body.offset.uri === 'spotify:track:t7', body);
        check('3 same body as unfiltered tap', JSON.stringify(body) === JSON.stringify(plain), { plain: plain, body: body });
      });
    });
  });
});

// 4. Search all on Liked Songs: library group, 50 per call, at most 2 at a time, in order, kept for the visit.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240, delay: 30 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      var inp = type(tab, 'zebra');
      check('4 nothing loaded yet matches', rows(tab).length === 0);
      check('4 plan is library, 4 requests', (function () { var p = t.findPlan(t.state.detail); return p && p.group === 'library' && p.reqs === 4 && !p.disabled; })(), t.findPlan(t.state.detail));
      click(tab, allBtn(tab));
      check('4 progress shown with Stop', /Loading songs…/.test(footText(tab)) && /Stop/.test(footText(tab)), footText(tab));
      return H.wait(400).then(function () {
        var got = reqs(tab, 'GET', '/me/tracks');
        check('4 four requests', got.length === 4, offsets(got));
        check('4 offsets 50..200', JSON.stringify(offsets(got).sort(function (a, b) { return a - b; })) === '[50,100,150,200]', offsets(got));
        check('4 limit 50', got.every(function (c) { return new URLSearchParams(c.query).get('limit') === '50'; }));
        check('4 grouped as library', got.every(function (c) { return t.coolGroup(c.path) === 'library'; }));
        check('4 at most 2 at a time', maxOverlap(got) === 2, maxOverlap(got));
        check('4 no other requests', tab.calls.length === 4, tab.calls.map(function (c) { return c.path; }));
        var d = t.state.detail;
        check('4 all 240 loaded, in order', d.items.length === 240 && d.items.every(function (x, i) { return x.uri === 'spotify:track:t' + i; }), d.items.length);
        check('4 no more pages', d.next === null && !allBtn(tab));
        check('4 match from a later page shows', JSON.stringify(rowNames(tab)) === '["Zebra Crossing"]', rowNames(tab));
        check('4 focus kept through the load', doc(tab).activeElement === inp && inp.value === 'zebra');
        check('4 summary counts all', /240 songs/.test($(tab, 'dsum').textContent), $(tab, 'dsum').textContent);
        type(tab, '');
        check('4 clearing shows all 240 and no Load more', rows(tab).length === 240 && !hasLoadMore(tab));
        // Back and open again: page 1 is asked again, Search all reuses this visit's answer (no requests).
        t.goBack(); t.closeDetail();
        tab.calls.length = 0;
        t.openDetail(LIKED);
        return H.wait(300);
      }).then(function () {
        check('4 reopen asks page 1 only', reqs(tab, 'GET', '/me/tracks').length === 1);
        type(tab, 'zebra');
        check('4 reopen note: already loaded', /Already loaded this visit/.test(footText(tab)), footText(tab));
        tab.calls.length = 0;
        click(tab, allBtn(tab));
        return H.wait(200).then(function () {
          check('4 memo: no requests', tab.calls.length === 0, tab.calls);
          check('4 memo: match shows', JSON.stringify(rowNames(tab)) === '["Zebra Crossing"]', rowNames(tab));
          check('4 nothing stored in localStorage for it', !Object.keys(store._m()).some(function (k) { return /find/i.test(k); }));
        });
      });
    });
  });
});

// 5. A 429 stops Search all: no new requests after it, contiguous pages kept, Load more carries on.
tests.push(function () {
  var store = H.seedStore();
  var fail = {}; fail['/me/tracks@150'] = 429;
  return setup(store, { liked: 500, delay: 20, fail: fail }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      type(tab, 'track');
      click(tab, allBtn(tab));
      // Wait until the run has stopped (up to 10 s), not a fixed time, so a slow machine doesn't cut it short.
      var until = Date.now() + 10000;
      function settled() { var d = t.state.detail; return (!d.loading && !d.findRun && tab.flight.now === 0) || Date.now() > until ? Promise.resolve() : H.wait(50).then(settled); }
      return H.wait(100).then(settled);
    }).then(function () {
      var got = reqs(tab, 'GET', '/me/tracks');
      var offs = offsets(got);
      var at429 = offs.indexOf(150);
      check('5 stopped soon after the 429', got.length <= 4 && at429 !== -1, offs);
      check('5 nothing sent after the 429 answered', got.every(function (c) { return c.s < got[at429].e; }), got.map(function (c) { return [c.s, c.e]; }));
      var d = t.state.detail;
      check('5 pages before it kept', d.items.length === 150, d.items.length);
      check('5 Load more resumes at 150', /offset=150/.test(d.next), d.next);
      check('5 library paused', t.coolLeft('library') > 0);
      check('5 toast says paused', tab.toasts().some(function (m) { return /paused/.test(m); }), tab.toasts());
      check('5 not loading any more', !d.loading && !d.findRun);
      check('5 button now off with pause note', allBtn(tab) && allBtn(tab).disabled && /paused/.test(footText(tab)), footText(tab));
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      return H.wait(100).then(function () { check('5 tap while paused sends nothing', tab.calls.length === 0, tab.calls); });
    });
  });
});

// 6. Library already paused: Search all is off, a tap sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 120 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      pauseGroup(store, 'library');
      tab.calls.length = 0;
      type(tab, 'x');
      check('6 disabled while library paused', allBtn(tab) && allBtn(tab).disabled, footText(tab));
      t.searchAll(t.state.detail);
      return H.wait(100).then(function () { check('6 nothing sent', tab.calls.length === 0, tab.calls); });
    });
  });
});

// 7. Own playlist: catalog group, request count on the button, one at a time, kept by apiCached.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { pl: 150, delay: 20 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      check('7 page 1 only on open', reqs(tab, 'GET', '/playlists/p1/items').length === 1);
      check('7 box shown on own playlist', boxShown(tab));
      tab.calls.length = 0;
      type(tab, 'track 1');
      check('7 typing sends nothing', tab.calls.length === 0, tab.calls);
      var b = allBtn(tab);
      check('7 button names request count', b && b.textContent === 'Search all 150 songs (2 requests)' && !b.disabled, b && b.textContent);
      click(tab, b);
      return H.wait(400);
    }).then(function () {
      var got = reqs(tab, 'GET', '/playlists/p1/items');
      check('7 exactly 2 requests', got.length === 2 && JSON.stringify(offsets(got)) === '[50,100]', offsets(got));
      check('7 grouped as catalog', got.every(function (c) { return t.coolGroup(c.path, 'GET') === 'catalog'; }));
      check('7 one at a time', maxOverlap(got) === 1, maxOverlap(got));
      var d = t.state.detail;
      check('7 all 150 loaded', d.items.length === 150 && d.next === null, d.items.length);
      check('7 rows are in the playlist context', d.items[120].ctx === 'spotify:playlist:p1');
      check('7 pages kept for the visit', Object.keys(t.catMemo()).filter(function (k) { return /playlists\/p1\/items/.test(k); }).length >= 3);
      // Play from a filtered row: playlist context with offset.
      tab.calls.length = 0;
      type(tab, 'track 149');
      click(tab, doc(tab).querySelector('#dlist a.item'));
      return H.wait(200).then(function () {
        var body = reqs(tab, 'PUT', '/me/player/play')[0];
        body = body && body.body;
        check('7 filtered tap plays in playlist context', body && body.context_uri === 'spotify:playlist:p1' && body.offset.uri === 'spotify:track:p149', body);
      });
    });
  });
});

// 8. Cap: exactly 4 catalog requests allowed; 5 is off and a tap sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { pl: 250 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      type(tab, 'q');
      var b = allBtn(tab);
      check('8 four requests allowed', b && !b.disabled && /\(4 requests\)/.test(b.textContent), b && b.textContent);
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(300);
    }).then(function () {
      check('8 four sent', reqs(tab, 'GET', '/playlists/p1/items').length === 4, offsets(tab.calls));
    });
  }).then(function () {
    var store = H.seedStore();
    return setup(store, { pl: 300 }).then(function (tab) {
      var t = tab.t();
      t.openDetail(ownPl(t));
      return H.wait(300).then(function () {
        type(tab, 'q');
        var b = allBtn(tab);
        check('8 five requests is off', b && b.disabled && /\(5 requests\)/.test(b.textContent), b && b.textContent);
        check('8 cap note', /needs 5 requests/.test(footText(tab)) && /Load more/.test(footText(tab)), footText(tab));
        tab.calls.length = 0;
        click(tab, b);
        t.searchAll(t.state.detail);
        return H.wait(200).then(function () {
          check('8 nothing sent over the cap', tab.calls.length === 0, tab.calls);
          type(tab, '');
          check('8 clearing gives Load more back', hasLoadMore(tab));
        });
      });
    });
  });
});

// 9. Catalog paused: off with the pause text; a tap sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { pl: 120 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      pauseGroup(store, 'catalog');
      tab.calls.length = 0;
      type(tab, 'track');
      var b = allBtn(tab);
      check('9 off while catalog paused', b && b.disabled, b && b.textContent);
      check('9 pause text shown', /paused/.test(footText(tab)), footText(tab));
      t.searchAll(t.state.detail);
      return H.wait(200).then(function () { check('9 nothing sent', tab.calls.length === 0, tab.calls); });
    });
  });
});

// 10. A 429 on a playlist page stops it (catalog).
tests.push(function () {
  var store = H.seedStore();
  var fail = {}; fail['/playlists/p1/items@100'] = 429;
  return setup(store, { pl: 250, fail: fail }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      type(tab, 'x');
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      return H.wait(300);
    }).then(function () {
      var got = reqs(tab, 'GET', '/playlists/p1/items');
      check('10 stopped at the 429', JSON.stringify(offsets(got)) === '[50,100]', offsets(got));
      check('10 catalog paused', t.coolLeft('catalog') > 0);
      check('10 kept 100', t.state.detail.items.length === 100 && /offset=100/.test(t.state.detail.next), t.state.detail.items.length);
    });
  });
});

// 11. Someone else's playlist: no box; v2.16 Show songs still works.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'playlist', id: 'o1', uri: 'spotify:playlist:o1', name: 'Theirs', url: 'https://open.spotify.com/playlist/o1', img: '', sub: 'Playlist', ownerId: 'someone' });
    return H.wait(200).then(function () {
      check('11 no find box', !boxShown(tab));
      check('11 no catalog request', tab.calls.filter(function (c) { return /playlists/.test(c.path); }).length === 0, tab.calls);
      var show = [].slice.call(doc(tab).querySelectorAll('#dfoot button')).filter(function (b) { return b.textContent === 'Show songs'; })[0];
      check('11 Show songs button', !!show);
      click(tab, show);
      // v2.27: the tap opens the player box (the iFrame API player, or the plain embed as a fallback).
      check('11 embed opens', !!doc(tab).querySelector('#dfoot .sembed-box, #dfoot iframe.sembed'));
      check('11 still no box', !boxShown(tab));
    });
  });
});

// 12. Partial saved album: box, Search all (1 catalog request), saved copy completed.
tests.push(function () {
  var store = H.seedStore();
  var items = [];
  for (var i = 0; i < 50; i++) { var s = songObj(i, 'a'); items.push({ id: s.id, uri: s.uri, name: s.name, artists: s.artists, track_number: i + 1, disc_number: 1, duration_ms: 200000 }); }
  store.setItem('lib-cache-album:al9', JSON.stringify({ at: Date.now(), total: 60, items: items }));
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'album', id: 'al9', uri: 'spotify:album:al9', name: 'Grande Récolte', url: 'https://open.spotify.com/album/al9', img: '', sub: 'Album · Band', artist: 'Band' });
    return H.wait(200).then(function () {
      check('12 saved copy, no request on open', tab.calls.filter(function (c) { return /albums/.test(c.path); }).length === 0, tab.calls);
      check('12 box shown', boxShown(tab));
      type(tab, 'recolte');
      check('12 album name matches every song', rows(tab).length === 50, rows(tab).length);
      type(tab, 'track 55');
      var b = allBtn(tab);
      check('12 one request', b && b.textContent === 'Search all 60 songs (1 request)' && !b.disabled, b && b.textContent);
      click(tab, b);
      return H.wait(300);
    }).then(function () {
      var got = reqs(tab, 'GET', '/albums/al9/tracks');
      check('12 one album request at offset 50', got.length === 1 && offsets(got)[0] === 50, offsets(got));
      check('12 match found', JSON.stringify(rowNames(tab)) === '["Track 55"]', rowNames(tab));
      var c = JSON.parse(store.getItem('lib-cache-album:al9'));
      check('12 saved copy now whole', c.items.length === 60 && c.total === 60, c.items.length);
      check('12 album rows still in album context', t.state.detail.items[55].ctx === 'spotify:album:al9');
    });
  });
});

// 13. Saved episodes: box, show name matches, accents.
tests.push(function () {
  return setup(H.seedStore(), { eps: 12 }).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'episodes', id: 'saved', uri: 'spotify:collection:your-episodes', name: 'Saved episodes', url: 'https://open.spotify.com/collection/your-episodes', img: '', sub: '' });
    return H.wait(300).then(function () {
      check('13 box on saved episodes', boxShown(tab) && $(tab, 'dfind').placeholder === 'Find in episodes');
      type(tab, 'economie');
      check('13 show name, accent blind', rows(tab).length === 6, rows(tab).length);
      type(tab, 'budget');
      check('13 title', JSON.stringify(rowNames(tab)) === '["Budget season"]', rowNames(tab));
      check('13 everything loaded: no Search all', !allBtn(tab) && /No episodes|/.test(footText(tab)));
    });
  });
});

// 14. Speed: ~2,000 loaded songs; typing is debounced and a filter pass stays quick; at most FIND_SHOW rows drawn.
tests.push(function () {
  return setup(H.seedStore(), { liked: 2000 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      type(tab, 'x');
      click(tab, allBtn(tab));
      return H.wait(800);
    }).then(function () {
      click(tab, allBtn(tab));   // 20 per tap: a second tap for the rest
      return H.wait(800);
    }).then(function () {
      var d = t.state.detail;
      check('14 2,000 loaded with 39 library calls over two taps', d.items.length === 2000 && reqs(tab, 'GET', '/me/tracks').length === 40, { n: d.items.length, r: reqs(tab, 'GET', '/me/tracks').length });
      var inp = type(tab, 'track');
      check('14 long list waits for a pause in typing', rows(tab).length !== t.FIND_SHOW);
      return H.wait(250).then(function () {
        check('14 at most FIND_SHOW rows drawn', rows(tab).length === t.FIND_SHOW, rows(tab).length);
        check('14 says how many match', /Showing the first 300 of 1,99\d matches/.test(footText(tab)), footText(tab));
        var t0 = Date.now();
        for (var k = 0; k < 5; k++) { inp.value = 'band ' + k + ' record'; inp.dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
        var per = (Date.now() - t0) / 5;
        check('14 one filter pass on 2,000 rows is quick (jsdom, < 1 s)', per < 1000, per);
        type(tab, 'beyonce halo');
        return H.wait(250).then(function () {
          check('14 exact match in 2,000', JSON.stringify(rowNames(tab)) === '["Halo"]', rowNames(tab));
          check('14 focus kept', doc(tab).activeElement === $(tab, 'dfind'));
        });
      });
    });
  });
});

// 15. Stop button ends the run; Load more continues from where it stopped.
tests.push(function () {
  return setup(H.seedStore(), { liked: 600, delay: 40 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      type(tab, 'x');
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      var stop = [].slice.call(doc(tab).querySelectorAll('#dfoot button')).filter(function (b) { return b.textContent === 'Stop'; })[0];
      click(tab, stop);
      return H.wait(300);
    }).then(function () {
      var d = t.state.detail;
      check('15 stopped after the in-flight pair', reqs(tab, 'GET', '/me/tracks').length === 2, offsets(tab.calls));
      check('15 kept them', d.items.length === 150 && /offset=150/.test(d.next) && !d.loading, { n: d.items.length, next: d.next });
      type(tab, '');
      check('15 Load more back', hasLoadMore(tab));
    });
  });
});

// 16. Own playlist opened again this visit: pages are kept, so Search all costs nothing, even while catalog is paused.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { pl: 150 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      type(tab, 'x');
      click(tab, allBtn(tab));
      return H.wait(300);
    }).then(function () {
      t.goBack(); t.closeDetail();
      pauseGroup(store, 'catalog');
      tab.calls.length = 0;
      t.openDetail(ownPl(t));
      return H.wait(300);
    }).then(function () {
      type(tab, 'track 140');
      var b = allBtn(tab);
      check('16 no request count, enabled', b && b.textContent === 'Search all 150 songs' && !b.disabled, b && b.textContent);
      check('16 note says no requests', /No requests/.test(footText(tab)), footText(tab));
      click(tab, b);
      return H.wait(300).then(function () {
        check('16 no catalog request (only the heart check for the shown row)', tab.calls.every(function (c) { return c.path === '/me/library/contains'; }) && tab.calls.length <= 1, tab.calls);
        check('16 match found', JSON.stringify(rowNames(tab)) === '["Track 140"]', rowNames(tab));
      });
    });
  });
});

// 17. Load more still running while the box has text: the footer says Loading, not Search all.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240, delay: 80 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(400).then(function () {
      check('17 page 1 in', t.state.detail.items.length === 50);
      // Load more, then type before it answers.
      var more = [].slice.call(doc(tab).querySelectorAll('#dfoot button')).filter(function (b) { return b.textContent === 'Load more'; })[0];
      click(tab, more);
      type(tab, 'track 7');
      check('17 loading shown, no Search all', /Loading songs/.test(footText(tab)) && !allBtn(tab), footText(tab));
      return H.wait(300).then(function () {
        check('17 then Search all for the rest', allBtn(tab) && allBtn(tab).textContent === 'Search all 240 songs', footText(tab));
        check('17 matches cover both pages', rowNames(tab).indexOf('Track 70') !== -1 && rowNames(tab).indexOf('Track 7') === -1 && rowNames(tab).indexOf('Track 71') !== -1, rowNames(tab));
      });
    });
  });
});

// 18. Leaving the list mid-run stops Search all: Back, and a list replacing it. A list under another view keeps loading.
tests.push(function () {
  return setup(H.seedStore(), { liked: 1000, delay: 40 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      type(tab, 'x');
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      return H.wait(100);
    }).then(function () {
      var d = t.state.detail;
      t.closeDetail();
      var at = reqs(tab, 'GET', '/me/tracks').length;
      return H.wait(800).then(function () {
        var after = reqs(tab, 'GET', '/me/tracks').length;
        check('18 Back: nothing new sent', after === at, { at: at, after: after });
        check('18 Back: run ended', !d.findRun && !d.loading);
        // Replaced (opened from Now Playing without push).
        t.openDetail(LIKED);
        return H.wait(300);
      });
    }).then(function () {
      type(tab, 'x');
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      return H.wait(100);
    }).then(function () {
      var d = t.state.detail;
      t.openDetail({ kind: 'album', id: 'al9', uri: 'spotify:album:al9', name: 'Other', url: 'https://open.spotify.com/album/al9', img: '', sub: 'Album · Band' });
      var at = reqs(tab, 'GET', '/me/tracks').length;
      return H.wait(800).then(function () {
        check('18 replaced: nothing new sent', reqs(tab, 'GET', '/me/tracks').length === at, { at: at, after: reqs(tab, 'GET', '/me/tracks').length });
        check('18 replaced: run ended', !d.findRun && !d.loading);
        t.closeDetail();
        t.openDetail(LIKED);
        return H.wait(300);
      });
    }).then(function () {
      // Under another view (pushed): keeps loading to the end.
      type(tab, 'x');
      tab.calls.length = 0;
      var d = t.state.detail;
      click(tab, allBtn(tab));
      t.openDetail({ kind: 'album', id: 'al9', uri: 'spotify:album:al9', name: 'Other', url: 'https://open.spotify.com/album/al9', img: '', sub: 'Album · Band' }, { push: true });
      return H.wait(1200).then(function () {
        check('18 pushed over: finishes all 19 requests', reqs(tab, 'GET', '/me/tracks').length === 19 && d.items.length === 1000 && d.next === null && false === !!d.findRun, { r: reqs(tab, 'GET', '/me/tracks').length, n: d.items.length, next: d.next });
      });
    });
  });
});

// 19. No double run: reopen and tap Search all while the old one's answers are still coming.
tests.push(function () {
  return setup(H.seedStore(), { liked: 600, delayOf: function (off) { return off <= 100 ? 10 : 300; } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(500).then(function () {
      type(tab, 'x');
      tab.calls.length = 0;
      click(tab, allBtn(tab));
      return H.wait(80);   // pages 50 and 100 are in; 150 and 200 are on their way
    }).then(function () {
      var old = t.state.detail;
      t.closeDetail();
      t.openDetail(LIKED);
      return H.wait(100).then(function () {   // page 1 is in; the old pair is still in flight
        check('19 old pair still in flight', tab.calls.filter(function (c) { return c.path === '/me/tracks' && !c.e; }).length >= 1, tab.calls.map(function (c) { return [c.query, c.e]; }));
        type(tab, 'x');
        click(tab, allBtn(tab));
        check('19 new load waits (shows loading)', /Loading songs/.test(footText(tab)), footText(tab));
        return H.wait(2500);
      }).then(function () {
        var got = reqs(tab, 'GET', '/me/tracks').filter(function (c) { return c.query.indexOf('offset=0') === -1; });
        check('19 never more than 2 Search all requests at once', maxOverlap(got) <= 2, maxOverlap(got));
        var d = t.state.detail;
        check('19 new load completes', d !== old && d.items.length === 600 && d.next === null && !d.findRun, { n: d.items.length, next: d.next });
        check('19 old view stopped early', old.items.length < 600 && !old.findRun, old.items.length);
      });
    });
  });
});

// 20. An album finishing while another view is on top: rows follow the saved copy.
tests.push(function () {
  var store = H.seedStore();
  var items = [];
  for (var i = 0; i < 50; i++) { var s = songObj(i, 'a'); items.push({ id: s.id, uri: s.uri, name: s.name, artists: s.artists, track_number: i + 1, disc_number: 1, duration_ms: 200000 }); }
  store.setItem('lib-cache-album:al9', JSON.stringify({ at: Date.now(), total: 60, items: items }));
  return setup(store, { delay: 0 }).then(function (tab) {
    var t = tab.t();
    var AL = { kind: 'album', id: 'al9', uri: 'spotify:album:al9', name: 'Al', url: 'https://open.spotify.com/album/al9', img: '', sub: 'Album · Band' };
    t.openDetail(AL);
    return H.wait(200).then(function () {
      var d = t.state.detail;
      type(tab, 'track');
      click(tab, allBtn(tab));
      t.openDetail({ kind: 'artist', id: 'ar1', name: 'Band', uri: 'spotify:artist:ar1', url: 'https://open.spotify.com/artist/ar1', img: 'x', sub: 'Artist' }, { push: true });
      return H.wait(400).then(function () {
        check('20 off screen: items follow raw', d.raw.length === 60 && d.items.length === 60 && d.next === null, { raw: d.raw.length, items: d.items.length, next: d.next });
        t.closeDetail();
        check('20 back on the album: its rows', t.state.detail === d && rows(tab).length === 60 - 1, rows(tab).length);   // "Track 7" is "Café del Mar": no "track" in it
      });
    });
  });
});

// 21. Library cap: 20 requests per tap; the button says how many more; another tap continues.
tests.push(function () {
  return setup(H.seedStore(), { liked: 1600 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      type(tab, 'x');
      var b = allBtn(tab);
      check('21 capped label', b && b.textContent === 'Search 1,000 more', b && b.textContent);
      check('21 capped note', /Loads 1,000 more songs \(20 requests\), 550 left after that/.test(footText(tab)), footText(tab));
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(500);
    }).then(function () {
      var got = reqs(tab, 'GET', '/me/tracks');
      var d = t.state.detail;
      check('21 first tap: 20 requests', got.length === 20 && Math.max.apply(null, offsets(got)) === 1000, offsets(got));
      check('21 stops at 1,050', d.items.length === 1050 && /offset=1050/.test(d.next), { n: d.items.length, next: d.next });
      var b = allBtn(tab);
      check('21 then Search all for the rest', b && b.textContent === 'Search all 1,600 songs' && /Loads 550 more songs \(11 requests\)\./.test(footText(tab)), footText(tab));
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(400).then(function () {
        var g2 = reqs(tab, 'GET', '/me/tracks');
        check('21 second tap continues: 11 requests from 1,050', g2.length === 11 && Math.min.apply(null, offsets(g2)) === 1050, offsets(g2));
        check('21 all 1,600 loaded in order', d.items.length === 1600 && d.items.every(function (x, i) { return x.uri === 'spotify:track:t' + i; }) && d.next === null);
      });
    });
  });
});

var i = 0;
function next() {
  if (i >= tests.length) {
    results.forEach(function (r) { console.log(r); });
    var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
    console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
    process.exit(fails ? 1 : 0);
  }
  var f = tests[i++];
  f().then(next, function (e) { results.push('FAIL test ' + i + ' threw ' + (e && e.stack)); next(); });
}
next();
