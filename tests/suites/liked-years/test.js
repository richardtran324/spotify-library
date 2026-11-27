'use strict';
// Years in Liked Songs (v2.56) tests: jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
// Song n's like date, newest first like Spotify: 0-29 in 2026, 30-79 in 2025, 80-149 in 2023 (no 2024), 150+ in 2021.
// Midday UTC in mid-month, so no time zone moves a song into another month or year.
function likedAt(n) {
  if (n < 30) return '2026-06-15T12:00:00Z';
  if (n < 80) return '2025-06-15T12:00:00Z';
  if (n < 150) return '2023-06-15T12:00:00Z';
  return '2021-03-10T12:00:00Z';
}
function songObj(n, prefix) {
  prefix = prefix || 't';
  var name = 'Track ' + n;
  if (n === 7) name = 'Café del Mar';
  if (n === 222) name = 'Zebra Crossing';
  return { type: 'track', id: prefix + n, uri: 'spotify:track:' + prefix + n, name: name, duration_ms: 200000,
    artists: [{ name: 'Band ' + (n % 10) }], album: { id: 'al' + (n % 7), name: 'Record ' + (n % 7), images: [] } };
}
// env: liked (total), dates (n -> added_at, null for none), pl (playlist total), fail (path@offset -> status), delay (ms)
function setup(store, env, tabOpts) {
  env = env || {};
  var dates = env.dates || likedAt;
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    var off = +(q.get('offset') || 0);
    if (method === 'GET' && env.fail && env.fail[path + '@' + off]) return { status: env.fail[path + '@' + off], json: { error: { status: 429, message: 'API rate limit exceeded' } }, delay: env.delayOf ? env.delayOf(off) : env.delay || 0 };
    if (method === 'GET' && (path === '/me/tracks' || path === '/playlists/p1/items')) {
      var total = path === '/me/tracks' ? env.liked || 0 : env.pl || 0, items = [];
      for (var i = off; i < Math.min(total, off + 50); i++) {
        var o = {}, dt = dates(i);
        if (dt !== undefined) o.added_at = dt;
        o[path === '/me/tracks' ? 'track' : 'item'] = songObj(i, path === '/me/tracks' ? 't' : 'p');
        items.push(o);
      }
      return { status: 200, delay: env.delayOf ? env.delayOf(off) : env.delay || 0, json: { items: items, total: total, offset: off, limit: 50,
        next: off + 50 < total ? 'https://api.spotify.com/v1' + path + '?offset=' + (off + 50) + '&limit=50' : null } };
    }
    if (method === 'GET' && path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  }, tabOpts);
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
// Records every window.scrollTo call; reduced motion on when asked.
function scrollOpts(reduce) {
  return {
    matchMedia: function (q) { return { matches: !!reduce && /reduce/.test(q), addEventListener: function () {}, addListener: function () {} }; },
    beforeParse: function (w) {
      w.__scrolls = [];
      w.scrollTo = function (a, b) { w.__scrolls.push(a && typeof a === 'object' ? a : { top: b }); };
    }
  };
}
function doc(tab) { return tab.w.document; }
function $(tab, id) { return doc(tab).getElementById(id); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function byGroup(tab) {
  var t = tab.t(), g = {};
  tab.calls.forEach(function (c) { var k = t.coolGroup(c.path, c.method) || 'other'; g[k] = (g[k] || 0) + 1; });
  return g;
}
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function rows(tab) { return [].slice.call(doc(tab).querySelectorAll('#dlist li.row')); }
function heads(tab) { return [].slice.call(doc(tab).querySelectorAll('#dlist li.yhead')).map(function (h) { return h.textContent; }); }
function chips(tab) {
  var box = $(tab, 'dyears');
  if (!box || box.hidden) return null;
  return [].slice.call(box.querySelectorAll('button.chip')).map(function (b) { return b.textContent + (b.disabled ? '(off)' : ''); });
}
function chip(tab, y) { return doc(tab).querySelector('#dyears [data-year="' + y + '"]'); }
function subOf(tab, uri) { var a = doc(tab).querySelector('li[data-puri="' + uri + '"] .sub'); return a ? a.textContent : null; }
function footText(tab) { return $(tab, 'dfoot').textContent; }
function loadMore(tab) { return [].slice.call(doc(tab).querySelectorAll('#dfoot button')).filter(function (b) { return b.textContent === 'Load more'; })[0]; }
function type(tab, text) {
  var inp = $(tab, 'dfind');
  inp.focus(); inp.value = text;
  inp.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
  return inp;
}
function sortChip(tab, key) { return doc(tab).querySelector('#dsort [data-sort="' + key + '"]'); }
function offsets(calls) { return calls.map(function (c) { return +new URLSearchParams(c.query).get('offset'); }); }
function maxOverlap(calls) {
  var ev = [];
  calls.forEach(function (c) { ev.push([c.s, 1]); ev.push([c.e || 1e9, -1]); });
  ev.sort(function (a, b) { return a[0] - b[0]; });
  var n = 0, m = 0;
  ev.forEach(function (x) { n += x[1]; m = Math.max(m, n); });
  return m;
}
function settled(tab, ms) {
  var t = tab.t(), until = Date.now() + (ms || 10000);
  function go() { var d = t.state.detail; return (!d.loading && !d.findRun && tab.flight.now === 0) || Date.now() > until ? H.wait(50) : H.wait(50).then(go); }
  return H.wait(50).then(go);
}
function pauseGroup(store, g, mins) {
  var c = {}; c[g] = { until: Date.now() + (mins || 10) * 60000, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null, last429: null };
  store.setItem('lib-cooloff', JSON.stringify(c));
}
// The header row and a stand-in position: jsdom has no layout, so the test gives the header and the top bar sizes.
function placeHead(tab, y, top, barH) {
  var h = $(tab, 'ly-' + y);
  if (h) h.getBoundingClientRect = function () { return { top: top, bottom: top + 30, left: 0, right: 375, height: 30, width: 375 }; };
  $(tab, 'top').getBoundingClientRect = function () { return { top: 0, bottom: barH, left: 0, right: 375, height: barH, width: 375 }; };
  return h;
}
var LIKED = { kind: 'liked', id: 'liked', uri: 'spotify:collection', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks', img: '', sub: 'Playlist' };
function ownPl(t) { return { kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1', name: 'Road trip', url: 'https://open.spotify.com/playlist/p1', img: '', sub: 'Playlist', ownerId: t.state.data.me.id }; }

var tests = [];

// 1. Headers in Recently liked order: where the year changes, years only, no counts, rows untouched, no extra requests.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240 }).then(function (tab) {
    var t = tab.t();
    var keys0 = Object.keys(store._m()).sort().join(',');
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('1 one page, one library request, nothing else', reqs(tab, 'GET', '/me/tracks').length === 1 && JSON.stringify(byGroup(tab)) === JSON.stringify({ library: 1 }), { g: byGroup(tab), calls: tab.calls.map(function (c) { return c.path; }) });
      check('1 headers 2026 then 2025', JSON.stringify(heads(tab)) === '["2026","2025"]', heads(tab));
      check('1 still 50 song rows', rows(tab).length === 50, rows(tab).length);
      var lis = [].slice.call(doc(tab).querySelectorAll('#dlist > li'));
      check('1 2026 header first, before song 0', lis[0].className === 'yhead' && lis[1].getAttribute('data-puri') === 'spotify:track:t0');
      var h25 = $(tab, 'ly-2025');
      check('1 2025 header right before the first 2025 song (30)', h25 && h25.nextElementSibling.getAttribute('data-puri') === 'spotify:track:t30' && h25.previousElementSibling.getAttribute('data-puri') === 'spotify:track:t29');
      check('1 header text is only the year (no counts)', [].slice.call(doc(tab).querySelectorAll('.yhead')).every(function (h) { return /^\d{4}$/.test(h.textContent) && h.querySelector('h3'); }));
      check('1 header can take focus for jumps', h25.getAttribute('tabindex') === '-1');
      check('1 subtitle ends with Liked Jun 2026', subOf(tab, 'spotify:track:t0') === 'Band 0 · Record 0 · Liked Jun 2026', subOf(tab, 'spotify:track:t0'));
      check('1 subtitle for 2025', /· Liked Jun 2025$/.test(subOf(tab, 'spotify:track:t31')), subOf(tab, 'spotify:track:t31'));
      var a = doc(tab).querySelector('li[data-puri="spotify:track:t0"] a.item');
      check('1 row label (VoiceOver) includes the like date', /Liked Jun 2026/.test(a.getAttribute('aria-label') || a.getAttribute('data-sub')), a.getAttribute('aria-label'));
      check('1 summary still counts loaded songs only', /50 of 240 songs loaded/.test($(tab, 'dsum').textContent), $(tab, 'dsum').textContent);
      check('1 nothing new stored', Object.keys(store._m()).sort().join(',') === keys0, Object.keys(store._m()));
      check('1 nothing in the page text looks like a per-year count', !/\b\d+ (songs|likes) in 20\d\d|liked in 20\d\d/i.test(doc(tab).getElementById('main').textContent));
    });
  });
});

// 2. Jump to year: chips for loaded years plus Older; a tap scrolls to the header (below the top bar) and focuses it.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240 }, scrollOpts(false)).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('2 chip row: 2026, 2025, Older', JSON.stringify(chips(tab)) === '["2026","2025","Older"]', chips(tab));
      var box = $(tab, 'dyears');
      check('2 chip row sits between sort and list', $(tab, 'dsort').compareDocumentPosition(box) & 4 && box.compareDocumentPosition($(tab, 'dlist')) & 4);
      check('2 group label for VoiceOver', box.querySelector('[role="group"]').getAttribute('aria-label') === 'Jump to year');
      check('2 chip names', chip(tab, '2025').getAttribute('aria-label') === 'Jump to 2025' && chip(tab, 'older').getAttribute('aria-label') === 'Load older years');
      tab.calls.length = 0;
      tab.w.__scrolls.length = 0;
      tab.w.pageYOffset = 0;
      placeHead(tab, '2025', 900, 100);
      click(tab, chip(tab, '2025'));
      var s = tab.w.__scrolls;
      check('2 one scroll, to the header less the top bar and 8px', s.length === 1 && s[0].top === 792, s);
      check('2 smooth without reduced motion', s[0] && s[0].behavior === 'smooth', s);
      check('2 header focused', doc(tab).activeElement === $(tab, 'ly-2025'));
      check('2 tapping a chip sends nothing', tab.calls.length === 0, tab.calls);
      // Already scrolled down: the page offset counts.
      tab.w.pageYOffset = 500; tab.w.__scrolls.length = 0;
      placeHead(tab, '2026', -300, 100);
      click(tab, chip(tab, '2026'));
      check('2 scroll back up to 2026', tab.w.__scrolls[0] && tab.w.__scrolls[0].top === 92, tab.w.__scrolls);
      // Never a negative scroll.
      tab.w.pageYOffset = 0; tab.w.__scrolls.length = 0;
      placeHead(tab, '2026', 20, 100);
      click(tab, chip(tab, '2026'));
      check('2 clamps at the top', tab.w.__scrolls[0] && tab.w.__scrolls[0].top === 0, tab.w.__scrolls);
      check('2 unknown year does nothing', (function () { tab.w.__scrolls.length = 0; t.jumpYear('1999'); return tab.w.__scrolls.length === 0; })());
    });
  });
});

// 3. Reduced motion: the jump doesn't animate.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240 }, scrollOpts(true)).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.w.__scrolls.length = 0;
      click(tab, chip(tab, '2025'));
      check('3 reduced motion: behavior auto', tab.w.__scrolls[0] && tab.w.__scrolls[0].behavior === 'auto', tab.w.__scrolls);
    });
  });
});

// 4. Load more appends a page: a year carried over gets no second header, a new year gets one, chips follow.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      click(tab, loadMore(tab));
      check('4 Older chip off while loading', chip(tab, 'older') && chip(tab, 'older').disabled);
      return H.wait(300);
    }).then(function () {
      check('4 one more request', reqs(tab, 'GET', '/me/tracks').length === 1 && tab.calls.length === 1, tab.calls.map(function (c) { return c.path; }));
      check('4 headers 2026, 2025, 2023 (2025 not repeated)', JSON.stringify(heads(tab)) === '["2026","2025","2023"]', heads(tab));
      check('4 100 song rows', rows(tab).length === 100);
      var h23 = $(tab, 'ly-2023');
      check('4 2023 header before song 80', h23 && h23.nextElementSibling.getAttribute('data-puri') === 'spotify:track:t80');
      check('4 chips now include 2023, Older on again', JSON.stringify(chips(tab)) === '["2026","2025","2023","Older"]', chips(tab));
      check('4 appended rows have the subtitle', /Liked Jun 2023$/.test(subOf(tab, 'spotify:track:t99')), subOf(tab, 'spotify:track:t99'));
    });
  });
});

// 5. Older: Search all (library, 2 at a time, 50 each), then a jump to the first year that wasn't loaded; memo reuse.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240, delay: 30 }, scrollOpts(false)).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0; tab.w.__scrolls.length = 0;
      var p = t.findPlan(t.state.detail);
      check('5 plan is library, 4 requests', p && p.group === 'library' && p.reqs === 4 && !p.disabled, p);
      click(tab, chip(tab, 'older'));
      check('5 Older starts Search all (Stop shown)', /Loading songs…/.test(footText(tab)) && /Stop/.test(footText(tab)), footText(tab));
      check('5 Older off while it runs', chip(tab, 'older').disabled);
      return settled(tab);
    }).then(function () {
      var got = reqs(tab, 'GET', '/me/tracks');
      check('5 four requests, offsets 50..200', got.length === 4 && JSON.stringify(offsets(got).sort(function (a, b) { return a - b; })) === '[50,100,150,200]', offsets(got));
      check('5 only library group', JSON.stringify(byGroup(tab)) === JSON.stringify({ library: 4 }), byGroup(tab));
      check('5 at most 2 at a time', maxOverlap(got) <= 2, maxOverlap(got));
      check('5 all four years have headers', JSON.stringify(heads(tab)) === '["2026","2025","2023","2021"]', heads(tab));
      check('5 one header per year', heads(tab).length === 4);
      check('5 chips without Older once all loaded', JSON.stringify(chips(tab)) === '["2026","2025","2023","2021"]', chips(tab));
      check('5 jumped to 2023, the first new year', doc(tab).activeElement === $(tab, 'ly-2023') && tab.w.__scrolls.length === 1, { a: doc(tab).activeElement && doc(tab).activeElement.id, s: tab.w.__scrolls });
      check('5 2021 rows say Liked Mar 2021', /· Liked Mar 2021$/.test(subOf(tab, 'spotify:track:t200')), subOf(tab, 'spotify:track:t200'));
      check('5 no toast', tab.toasts().length === 0, tab.toasts());
      // Back and open again: page 1 again, then Older reuses the visit's answer with no requests.
      t.goBack(); t.closeDetail();
      tab.calls.length = 0;
      t.openDetail(LIKED);
      return H.wait(300);
    }).then(function () {
      check('5 reopen asks page 1 only', reqs(tab, 'GET', '/me/tracks').length === 1, tab.calls.length);
      tab.calls.length = 0; tab.w.__scrolls.length = 0;
      click(tab, chip(tab, 'older'));
      return H.wait(100);
    }).then(function () {
      check('5 memo: Older sends nothing', tab.calls.length === 0, tab.calls);
      check('5 memo: all years and a jump to 2023', heads(tab).length === 4 && doc(tab).activeElement === $(tab, 'ly-2023') && tab.w.__scrolls.length === 1, { h: heads(tab), s: tab.w.__scrolls });
      check('5 nothing stored for years', !Object.keys(store._m()).some(function (k) { return /year|liked/i.test(k); }), Object.keys(store._m()));
    });
  });
});

// 6. Older honours the cap: 1,000 songs per tap, then the next tap carries on.
tests.push(function () {
  return setup(H.seedStore(), { liked: 1600, dates: function (n) { return (2026 - Math.floor(n / 400)) + '-06-15T12:00:00Z'; } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('6 one year so far: chip row shows 2026 and Older', JSON.stringify(chips(tab)) === '["2026","Older"]', chips(tab));
      tab.calls.length = 0;
      click(tab, chip(tab, 'older'));
      return settled(tab);
    }).then(function () {
      var d = tab.t().state.detail;
      check('6 first tap: 20 requests, 1,050 songs', reqs(tab, 'GET', '/me/tracks').length === 20 && d.items.length === 1050, { r: reqs(tab, 'GET', '/me/tracks').length, n: d.items.length });
      check('6 jumped to 2025', doc(tab).activeElement === $(tab, 'ly-2025'), doc(tab).activeElement && doc(tab).activeElement.id);
      check('6 years so far 2026, 2025, 2024', JSON.stringify(heads(tab)) === '["2026","2025","2024"]', heads(tab));
      check('6 Older still offered', chip(tab, 'older') && !chip(tab, 'older').disabled);
      tab.calls.length = 0;
      click(tab, chip(tab, 'older'));
      return settled(tab);
    }).then(function () {
      check('6 second tap: 11 requests from 1,050', reqs(tab, 'GET', '/me/tracks').length === 11 && Math.min.apply(null, offsets(reqs(tab, 'GET', '/me/tracks'))) === 1050, offsets(reqs(tab, 'GET', '/me/tracks')));
      check('6 jumped to 2023', doc(tab).activeElement === $(tab, 'ly-2023'));
    });
  });
});

// 7. Older with no older year in what arrives: a toast says so; then with nothing left, "No older years."
tests.push(function () {
  return setup(H.seedStore(), { liked: 120, dates: function () { return '2026-02-15T12:00:00Z'; } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      click(tab, chip(tab, 'older'));
      return settled(tab);
    }).then(function () {
      check('7 two requests', reqs(tab, 'GET', '/me/tracks').length === 2);
      check('7 toast: no older years', JSON.stringify(tab.toasts()) === '["No older years."]', tab.toasts());
      check('7 one year, nothing left: chip row hidden', chips(tab) === null && JSON.stringify(heads(tab)) === '["2026"]', { c: chips(tab), h: heads(tab) });
    });
  });
});

// 8. Library paused: Older is off and the pause is explained; tapping it sends nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      pauseGroup(store, 'library');
      t.paintYears(t.state.detail);
      tab.calls.length = 0;
      var b = chip(tab, 'older');
      check('8 Older off while library is paused', b && b.disabled, chips(tab));
      check('8 pause note under the chips', /paus/i.test($(tab, 'dyears').textContent), $(tab, 'dyears').textContent);
      click(tab, b);
      t.searchAll(t.state.detail);   // even a direct call: Find in list's own guard
      return H.wait(200);
    }).then(function () {
      check('8 no requests while paused', reqs(tab, 'GET', '/me/tracks').length === 0, tab.calls);
      check('8 year chips still work', !chip(tab, '2025').disabled);
    });
  });
});

// 9. A 429 during Older stops it: what arrived stays, a jump to the new year, no more requests, Older off with the note.
tests.push(function () {
  var store = H.seedStore(), fail = {};
  fail['/me/tracks@150'] = 429;
  return setup(store, { liked: 500, delay: 20, fail: fail }, scrollOpts(false)).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      click(tab, chip(tab, 'older'));
      return settled(tab);
    }).then(function () {
      var d = t.state.detail, got = reqs(tab, 'GET', '/me/tracks');
      check('9 stopped after the 429 (at most 4 asked)', got.length >= 3 && got.length <= 4, offsets(got));
      check('9 contiguous pages kept (150 songs)', d.items.length === 150 && d.items.every(function (x, i) { return x.uri === 'spotify:track:t' + i; }), d.items.length);
      check('9 library paused', t.coolLeft('library') > 0);
      check('9 jumped to 2023 from what arrived', doc(tab).activeElement === $(tab, 'ly-2023'), doc(tab).activeElement && doc(tab).activeElement.id);
      check('9 headers 2026, 2025, 2023', JSON.stringify(heads(tab)) === '["2026","2025","2023"]', heads(tab));
      check('9 Older off, pause note', chip(tab, 'older').disabled && /paus/i.test($(tab, 'dyears').textContent), $(tab, 'dyears').textContent);
      check('9 one pause toast, no "no older" toast', tab.toasts().length === 1 && !/older/i.test(tab.toasts()[0]), tab.toasts());
      var n = tab.calls.length;
      return H.wait(300).then(function () { check('9 no requests after it stopped', tab.calls.length === n, tab.calls.length - n); });
    });
  });
});

// 10. Missing like dates: no headers, chips or subtitle at all; a page that brings one removes headers already drawn.
tests.push(function () {
  return setup(H.seedStore(), { liked: 100, dates: function (n) { return n === 12 ? undefined : likedAt(n); } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('10 one missing date: no headers', heads(tab).length === 0 && rows(tab).length === 50, heads(tab));
      check('10 no chip row', chips(tab) === null);
      check('10 no Liked subtitle anywhere', rows(tab).every(function (li) { return !/Liked/.test(li.querySelector('.sub').textContent); }));
      check('10 subtitle as before', subOf(tab, 'spotify:track:t0') === 'Band 0 · Record 0', subOf(tab, 'spotify:track:t0'));
    });
  }).then(function () {
    return setup(H.seedStore(), { liked: 50, dates: function (n) { return n === 40 ? '1970-01-01T00:00:00Z' : n === 41 ? 'not a date' : likedAt(n); } });
  }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('10 a 1970 or unreadable date counts as missing', heads(tab).length === 0 && chips(tab) === null, heads(tab));
      check('10 likedYM edge values', t.likedYM({ added: '1970-01-01T00:00:00Z' }) === '' && t.likedYM({ added: '' }) === '' && t.likedYM({}) === '' && t.likedYM({ added: '2021-03-10T12:00:00Z' }) === '2021-03');
      check('10 likedSub empty without a date', t.likedSub({}) === '' && t.likedSub({ added: '2021-03-10T12:00:00Z' }) === ' · Liked Mar 2021');
    });
  }).then(function () {
    return setup(H.seedStore(), { liked: 100, dates: function (n) { return n === 70 ? null : likedAt(n); } });
  }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('10 page 1 all dated: headers', heads(tab).length === 2);
      click(tab, loadMore(tab));
      return H.wait(300);
    }).then(function () {
      check('10 page 2 with a null date: headers gone, all 100 rows', heads(tab).length === 0 && rows(tab).length === 100, { h: heads(tab), n: rows(tab).length });
      check('10 chip row gone', chips(tab) === null);
      check('10 rows in Spotify order', rows(tab).every(function (li, i) { return li.getAttribute('data-puri') === 'spotify:track:t' + i; }));
    });
  });
});

// 11. Only Recently liked, and not while finding: other sorts and Find text hide headers and chips; back again restores them.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { liked: 240 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      var keys0 = Object.keys(store._m());
      tab.calls.length = 0;
      click(tab, sortChip(tab, 'az'));
      check('11 A–Z: no headers, no chips', heads(tab).length === 0 && chips(tab) === null, { h: heads(tab), c: chips(tab) });
      check('11 A–Z: subtitle without Liked', subOf(tab, 'spotify:track:t0') === 'Band 0 · Record 0', subOf(tab, 'spotify:track:t0'));
      click(tab, sortChip(tab, 'artist'));
      check('11 Artist A–Z: no headers', heads(tab).length === 0 && chips(tab) === null);
      click(tab, sortChip(tab, 'default'));
      check('11 Recently liked again: headers and chips back', JSON.stringify(heads(tab)) === '["2026","2025"]' && chips(tab) && chips(tab).length === 3, { h: heads(tab), c: chips(tab) });
      type(tab, 'cafe');
      check('11 Find text: no headers or chips, the match shows', heads(tab).length === 0 && chips(tab) === null && rows(tab).length === 1, { h: heads(tab), n: rows(tab).length });
      check('11 Find text: subtitle without Liked', !/Liked/.test(rows(tab)[0].querySelector('.sub').textContent));
      type(tab, '');
      check('11 cleared: headers back', heads(tab).length === 2 && rows(tab).length === 50);
      check('11 no requests from any of it', tab.calls.length === 0, tab.calls);
      var added = Object.keys(store._m()).filter(function (k) { return keys0.indexOf(k) === -1; });
      check('11 only the existing sort key stored', JSON.stringify(added) === '["lib-sort-d-liked"]', added);
      // A stored A–Z choice: open with no headers.
      t.goBack(); t.closeDetail();
      store.setItem('lib-sort-d-liked', JSON.stringify('az'));
      t.openDetail(LIKED);
      return H.wait(300).then(function () {
        check('11 opened in A–Z: no headers', heads(tab).length === 0 && chips(tab) === null);
        check('11 likedYearsOn false', t.likedYearsOn(t.state.detail) === false);
      });
    });
  });
});

// 12. Only Liked Songs: your own playlist (any order) and Saved-episodes-free views get no headers.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { pl: 80 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(ownPl(t));
    return H.wait(300).then(function () {
      check('12 playlist: no headers or chips', heads(tab).length === 0 && chips(tab) === null && rows(tab).length === 50, { h: heads(tab), n: rows(tab).length });
      click(tab, sortChip(tab, 'added'));
      check('12 playlist Recently added: still none', heads(tab).length === 0 && chips(tab) === null);
      check('12 playlist subtitle unchanged', !/Liked/.test(rows(tab)[0].querySelector('.sub').textContent));
    });
  });
});

// 13. Empty and short lists.
tests.push(function () {
  return setup(H.seedStore(), { liked: 0 }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('13 empty: no headers, no chips, the usual note', heads(tab).length === 0 && chips(tab) === null && /No songs here/.test(footText(tab)), footText(tab));
      check('13 empty: likedYearsOn false', t.likedYearsOn(t.state.detail) === false);
    });
  }).then(function () {
    return setup(H.seedStore(), { liked: 20 });
  }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('13 one year, all loaded: header, no chip row', JSON.stringify(heads(tab)) === '["2026"]' && chips(tab) === null, { h: heads(tab), c: chips(tab) });
    });
  }).then(function () {
    return setup(H.seedStore(), { liked: 1 });
  }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      check('13 a single song: one header and the row', JSON.stringify(heads(tab)) === '["2026"]' && rows(tab).length === 1);
    });
  });
});

// 14. Nearby features: a tap still plays in Liked Songs' context; Back keeps no pending jump; time zone rule.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240, delay: 30 }, scrollOpts(false)).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.calls.length = 0;
      click(tab, doc(tab).querySelector('li[data-puri="spotify:track:t31"] a.item'));
      return H.wait(200);
    }).then(function () {
      var p = reqs(tab, 'PUT', '/me/player/play'), body = p[0] && p[0].body;
      check('14 one play request', p.length === 1, tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
      check('14 plays song 31 in Liked Songs context', body && body.context_uri === 'spotify:user:' + t.state.data.me.id + ':collection' && body.offset && body.offset.uri === 'spotify:track:t31', body);
      // Older started, then the list is left: the load stops and reopening doesn't jump on its own.
      click(tab, chip(tab, 'older'));
      t.goBack(); t.closeDetail();
      return H.wait(400);
    }).then(function () {
      tab.w.__scrolls.length = 0;
      t.openDetail(LIKED);
      return H.wait(300);
    }).then(function () {
      check('14 reopened: no jump of its own', tab.w.__scrolls.every(function (s) { return s.top === 0; }), tab.w.__scrolls);
      check('14 no pending jump', !t.state.detail.lyJump);
      // Years follow this phone's time zone, the same way the Date the test runs in reads them.
      var iso = '2025-12-31T23:30:00Z', d = new Date(iso);
      var want = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      check('14 local year and month', t.likedYM({ added: iso }) === want, [t.likedYM({ added: iso }), want]);
      check('14 LY_MIN is 2008', t.LY_MIN === 2008 && t.likedYM({ added: '2008-01-15T12:00:00Z' }) === '2008-01' && t.likedYM({ added: '2007-12-15T12:00:00Z' }) === '');
    });
  });
});

// 15. Phone layout rules in the stylesheet: 44px chips, headers clear the sticky top bar.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240 }).then(function (tab) {
    var css = [].slice.call(doc(tab).querySelectorAll('style')).map(function (s) { return s.textContent; }).join('\n');
    check('15 year chips at least 44px tall and wide', /\.yearbar \.chip \{[^}]*min-height: 44px;[^}]*min-width: 44px;/.test(css));
    check('15 headers have scroll margin', /li\.yhead \{[^}]*scroll-margin-top/.test(css));
    check('15 header colours use theme tokens', /\.yhead h3 \{[^}]*color: var\(--muted\)/.test(css));
  });
});

// 16. Review fix: Older waiting behind an earlier load that ends in a 429 doesn't get stuck on "Loading songs…".
tests.push(function () {
  var store = H.seedStore(), fail = {};
  fail['/me/tracks@100'] = 429;
  return setup(store, { liked: 500, fail: fail, delayOf: function (off) { return off ? 600 : 10; } }, scrollOpts(false)).then(function (tab) {
    var t = tab.t(), d2;
    t.openDetail(LIKED);
    return H.wait(200).then(function () {
      click(tab, chip(tab, 'older'));   // run A: offsets 50 and 100 in flight; 100 answers 429
      t.goBack(); t.closeDetail();
      t.openDetail(LIKED);
      return H.wait(150);
    }).then(function () {
      d2 = t.state.detail;
      click(tab, chip(tab, 'older'));   // waits for run A
      check('16 second Older waits behind the first', d2.findRun && d2.findRun.waiting && !!d2.lyJump, d2.findRun);
      return H.wait(1200);
    }).then(function () {
      check('16 library paused by the 429', t.coolLeft('library') > 0);
      check('16 not stuck: no load, no run, no pending jump', !d2.loading && !d2.findRun && !d2.lyJump, { l: d2.loading, r: d2.findRun, j: d2.lyJump });
      check('16 footer no longer says Loading', !/Loading songs/.test(footText(tab)) && !/Stop/.test(footText(tab)), footText(tab));
      check('16 Load more back', !!loadMore(tab), footText(tab));
      check('16 Older off with the pause note', chip(tab, 'older').disabled && /paus/i.test($(tab, 'dyears').textContent), $(tab, 'dyears').textContent);
      check('16 the waiting list sent nothing', reqs(tab, 'GET', '/me/tracks').filter(function (c) { return +new URLSearchParams(c.query).get('offset') > 100; }).length === 0, offsets(reqs(tab, 'GET', '/me/tracks')));
      // Later, after the pause: Load more doesn't trigger a stale jump.
      store.setItem('lib-cooloff', '{}');
      tab.w.__scrolls.length = 0;
      click(tab, loadMore(tab));
      return H.wait(800);
    }).then(function () {
      check('16 Load more later: no stale jump', tab.w.__scrolls.length === 0 && !/^ly-/.test((doc(tab).activeElement || {}).id || ''), { s: tab.w.__scrolls, a: doc(tab).activeElement && doc(tab).activeElement.id });
      check('16 Older on again once the pause is over', chip(tab, 'older') && !chip(tab, 'older').disabled);
    });
  });
});

// 17. Review fix: the end-of-Older jump doesn't scroll or take focus while a sheet or Now Playing is open.
tests.push(function () {
  return setup(H.seedStore(), { liked: 240, delay: 40 }, scrollOpts(false)).then(function (tab) {
    var t = tab.t(), qb;
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.w.__scrolls.length = 0;
      click(tab, chip(tab, 'older'));
      var q = $(tab, 'queue');
      q.hidden = false;   // Up next opens over the list while Older loads
      qb = q.querySelector('button');
      qb.focus();
      return settled(tab);
    }).then(function () {
      check('17 Older finished', heads(tab).length === 4 && !t.state.detail.lyJump);
      check('17 sheet open: no scroll', tab.w.__scrolls.length === 0, tab.w.__scrolls);
      check('17 sheet open: focus stays in the sheet', doc(tab).activeElement === qb, doc(tab).activeElement && (doc(tab).activeElement.id || doc(tab).activeElement.textContent));
      $(tab, 'queue').hidden = true;
      tab.w.__scrolls.length = 0;
      click(tab, chip(tab, '2023'));
      check('17 sheet closed: chips jump as usual', tab.w.__scrolls.length === 1 && doc(tab).activeElement === $(tab, 'ly-2023'));
    });
  }).then(function () {
    return setup(H.seedStore(), { liked: 240, delay: 40 }, scrollOpts(false));
  }).then(function (tab) {
    var t = tab.t();
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      tab.w.__scrolls.length = 0;
      click(tab, chip(tab, 'older'));
      doc(tab).body.classList.add('npopen');   // Now Playing open
      return settled(tab);
    }).then(function () {
      check('17 Now Playing open: no scroll, no header focus', tab.w.__scrolls.length === 0 && !/^ly-/.test((doc(tab).activeElement || {}).id || ''), tab.w.__scrolls);
      check('17 Now Playing open: jump dropped, not kept', !t.state.detail.lyJump);
    });
  });
});

// 18. Review fix: the chip row isn't rebuilt by a page that changes nothing; Older only toggles.
tests.push(function () {
  return setup(H.seedStore(), { liked: 400, delay: 30, dates: function (n) { return n < 300 ? '2026-06-15T12:00:00Z' : '2025-06-15T12:00:00Z'; } }).then(function (tab) {
    var t = tab.t(), c26, cOld;
    t.openDetail(LIKED);
    return H.wait(300).then(function () {
      c26 = chip(tab, '2026'); cOld = chip(tab, 'older');
      check('18 chips 2026 and Older', JSON.stringify(chips(tab)) === '["2026","Older"]', chips(tab));
      click(tab, loadMore(tab));
      check('18 same Older element turned off while loading', chip(tab, 'older') === cOld && cOld.disabled);
      return H.wait(300);
    }).then(function () {
      check('18 appended page: 2026 chip is the same element', chip(tab, '2026') === c26);
      check('18 appended page: Older is the same element, on again', chip(tab, 'older') === cOld && !cOld.disabled);
      // Older over several pages: no rebuild until a new year arrives.
      var seen = [];
      var obs = new tab.w.MutationObserver(function (m) { m.forEach(function (x) { if (x.type === 'childList') seen.push(x.addedNodes.length + x.removedNodes.length); }); });
      obs.observe($(tab, 'dyears'), { childList: true, subtree: true });
      cOld.focus();
      click(tab, cOld);
      return H.wait(110).then(function () {
        check('18 mid-load: chips not rebuilt yet', chip(tab, '2026') === c26 && chip(tab, 'older') === cOld, seen);
        return settled(tab);
      }).then(function () {
        obs.disconnect();
        check('18 rebuilt once the new year (2025) and the end arrived', JSON.stringify(chips(tab)) === '["2026","2025"]' && chip(tab, '2026') !== c26, chips(tab));
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
