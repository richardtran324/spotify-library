'use strict';
// Home stays steady (smooth/home-steady): an unchanged library or Recently played answer doesn't redraw Home,
// Jump back in is there on the first draw (saved from the last open), and card strips keep their sideways scroll
// across the redraws that remain and Back. jsdom, mocked fetch (answers on a timer), shared localStorage.
// Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function rawPl(id, owner, name) { return { id: id, uri: 'spotify:playlist:' + id, name: name || ('List ' + id), images: [], owner: { id: owner, display_name: owner }, collaborative: false, items: { total: 10 } }; }
function rawAlbum(id, name) { return { id: id, uri: 'spotify:album:' + id, name: name || ('Album ' + id), images: [], artists: [{ name: 'Band ' + id }], release_date: '2020-01-01', total_tracks: 10 }; }
function baseLib() {
  return {
    playlists: [rawPl('P1', 'me1', 'Morning Run'), rawPl('P2', 'other', 'Their Mix'), rawPl('P3', 'me1', 'Evening'), rawPl('P4', 'me1', 'Gym')],
    albums: [rawAlbum('A1', 'First Album')]
  };
}
var PINS = [
  { kind: 'album', id: 'A1', name: 'First Album', uri: 'spotify:album:A1', url: 'https://open.spotify.com/album/A1', img: '', sub: 'Album' },
  { kind: 'playlist', id: 'P4', name: 'Gym', uri: 'spotify:playlist:P4', url: 'https://open.spotify.com/playlist/P4', img: '', sub: 'Playlist', ownerId: 'me1' }
];
var T0 = Date.now();
function track(id, albumId) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: 200000, album: rawAlbum(albumId || 'AX'), artists: [{ name: 'Band' }] };
}
// Fixed played_at times, so two answers built from the same list are the same answer.
function rp(id, albumId, ctx, minsAgo) { return { track: track(id, albumId), played_at: new Date(T0 - minsAgo * 60000).toISOString(), context: ctx }; }
function plCtx(id) { return { type: 'playlist', uri: 'spotify:playlist:' + id, href: 'https://api.spotify.com/v1/playlists/' + id }; }
function albCtx(id) { return { type: 'album', uri: 'spotify:album:' + id }; }
var LIKED = { type: 'collection', uri: 'spotify:user:me1:collection' };
var RECENT = [rp('t1', 'B1', albCtx('B1'), 5), rp('t2', 'B2', plCtx('P1'), 20), rp('t3', 'B3', LIKED, 40), rp('t4', 'B4', albCtx('B4'), 60)];

function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('home'));
  s.setItem('lib-pins', JSON.stringify(PINS));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
// A per-element scrollLeft that keeps what's set (jsdom's is always 0); strips are 1000 px wide in a 300 px box.
function scrollSpy(w) {
  var vals = new WeakMap();
  Object.defineProperty(w.HTMLElement.prototype, 'scrollLeft', { configurable: true,
    get: function () { return vals.get(this) || 0; }, set: function (v) { vals.set(this, +v || 0); } });
  Object.defineProperty(w.HTMLElement.prototype, 'scrollWidth', { configurable: true, get: function () { return this.classList.contains('cl') ? 1000 : 0; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get: function () { return this.classList.contains('cl') ? 300 : 0; } });
}
// opts: {lib, recent, delay, spy}
function open(store, opts) {
  opts = opts || {};
  var env = { lib: opts.lib || baseLib(), recent: opts.recent || RECENT };
  var delay = opts.delay == null ? 200 : opts.delay;
  var tab = H.makeTab(store, function (method, path) {
    var r;
    if (path === '/me') r = { status: 200, json: { id: 'me1', display_name: 'R' } };
    else if (path === '/me/playlists') r = { status: 200, json: { items: env.lib.playlists, next: null, total: env.lib.playlists.length } };
    else if (path === '/me/albums') r = { status: 200, json: { items: env.lib.albums.map(function (a) { return { album: a }; }), next: null } };
    else if (path === '/me/tracks') r = { status: 200, json: { items: [], next: null, total: 100 } };
    else if (path === '/me/player/recently-played') r = { status: 200, json: { items: env.recent } };
    else if (path === '/me/player/devices') r = { status: 200, json: { devices: [DEV] } };
    if (r) r.delay = delay;
    return r;
  }, { beforeParse: opts.spy ? scrollSpy : null });
  tab.env = env;
  return tab;
}
function d(tab) { return tab.w.document; }
function strip(tab, id) { return d(tab).querySelector('#main ul.cl[aria-labelledby="' + id + '"]'); }
function names(tab, id) { var u = strip(tab, id); return u ? [].map.call(u.querySelectorAll('.clname'), function (n) { return n.textContent; }) : null; }
function sections(tab) { return [].map.call(d(tab).querySelectorAll('#main h2.sect[id]'), function (h) { return h.id; }).join(' > '); }
function recentCalls(tab) { return tab.calls.filter(function (c) { return c.path === '/me/player/recently-played'; }); }
// Counts nodes removed from #main (a full redraw removes every child).
function watch(tab) {
  var n = { removed: 0 };
  var mo = new tab.w.MutationObserver(function (ms) { ms.forEach(function (m) { n.removed += m.removedNodes.length; }); });
  mo.observe(d(tab).getElementById('main'), { childList: true });
  n.stop = function () { mo.takeRecords().forEach(function (m) { n.removed += m.removedNodes.length; }); mo.disconnect(); return n.removed; };
  return n;
}
function finish(tab) { try { tab.t().stopApp(); } catch (e) {} tab.w.close(); }
// A first open that saves the library and the Jump back in cards, as an earlier visit would.
function earlierVisit(store) {
  var tab = open(store, { delay: 0 });
  return H.wait(300).then(function () {
    tab.t().loadRecent();
    return H.wait(300);
  }).then(function () { finish(tab); });
}

var tests = [];

// 1. Second open with the same answers: Jump back in is in the first draw, and nothing redraws Home afterwards.
tests.push(function () {
  var store = seed();
  return earlierVisit(store).then(function () {
    var saved = JSON.parse(store.getItem('lib-jump') || 'null');
    check('1 Jump back in saved after the answer', saved && Array.isArray(saved.jump) && saved.jump.length === 4 && typeof saved.at === 'number', saved);
    var tab = open(store);
    var t = tab.t();
    check('1 first draw has Jump back in', !!strip(tab, 'hJump'), sections(tab));
    check('1 first draw: sections in order', sections(tab) === 'hPinned > hJump > hPlaylists', sections(tab));
    check('1 first draw: the saved cards', JSON.stringify(names(tab, 'hJump')) === JSON.stringify(['Album B1', 'Morning Run', 'Liked Songs', 'Album B4']), names(tab, 'hJump'));
    var pl0 = strip(tab, 'hPlaylists'), jp0 = strip(tab, 'hJump'), pin0 = strip(tab, 'hPinned');
    var w = watch(tab);
    return H.wait(600).then(function () {
      check('1 library answered', t.state.libAt > 0 && !t.state.libLoading, t.state.libAt);
      check('1 same library: Your playlists strip is the same node', strip(tab, 'hPlaylists') === pl0);
      check('1 same library: Pinned strip is the same node', strip(tab, 'hPinned') === pin0);
      t.state.recentTriedAt = 0; t.state.bgHoldUntil = 0;
      t.renderList();   // a deliberate redraw: Home asks Recently played (after the hold)
      w.stop();
      pl0 = strip(tab, 'hPlaylists'); jp0 = strip(tab, 'hJump');
      w = watch(tab);
      return H.wait(600);
    }).then(function () {
      check('1 Recently played asked once', recentCalls(tab).length === 1, recentCalls(tab).length);
      check('1 same Recently played: no redraw at the start or on the answer', w.stop() === 0, w.removed);
      check('1 same Recently played: Jump back in strip is the same node', strip(tab, 'hJump') === jp0);
      check('1 same Recently played: Your playlists strip is the same node', strip(tab, 'hPlaylists') === pl0);
      check('1 state holds the fresh cards', t.state.recent.jump && t.state.recent.jump.length === 4 && !t.state.recent.loading);
      finish(tab);
    });
  });
});

// 2. A changed library or changed Recently played still redraws, and shows the change.
tests.push(function () {
  var store = seed();
  return earlierVisit(store).then(function () {
    var lib = baseLib();
    lib.playlists.push(rawPl('P9', 'me1', 'Brand New'));
    var tab = open(store, { lib: lib, recent: [rp('t9', 'B9', albCtx('B9'), 1)].concat(RECENT) });
    var t = tab.t();
    var pl0 = strip(tab, 'hPlaylists');
    return H.wait(600).then(function () {
      check('2 new playlist: Home redrawn', strip(tab, 'hPlaylists') !== pl0);
      check('2 new playlist: its card shows', (names(tab, 'hPlaylists') || []).indexOf('Brand New') !== -1, names(tab, 'hPlaylists'));
      var jp0 = strip(tab, 'hJump');
      t.loadRecent();
      return H.wait(600).then(function () {
        check('2 new play: Jump back in redrawn', strip(tab, 'hJump') !== jp0);
        check('2 new play: its card first', (names(tab, 'hJump') || [])[0] === 'Album B9', names(tab, 'hJump'));
        var saved = JSON.parse(store.getItem('lib-jump'));
        check('2 new play: saved for the next open', saved.jump[0].uri === 'spotify:track:t9', saved.jump.map(function (j) { return j.uri; }));
        finish(tab);
      });
    });
  });
});

// 3. No saved cards (first open, or older than 24 h): the strip appears when the answer arrives, as before.
tests.push(function () {
  var store = seed();
  return earlierVisit(store).then(function () {
    var saved = JSON.parse(store.getItem('lib-jump'));
    saved.at = Date.now() - 25 * 3600e3;
    store.setItem('lib-jump', JSON.stringify(saved));
    var tab = open(store);
    var t = tab.t();
    check('3 cards older than 24 h are not shown', !strip(tab, 'hJump') && t.state.recent.jump === null, sections(tab));
    return H.wait(600).then(function () {
      t.loadRecent();
      return H.wait(600);
    }).then(function () {
      check('3 the strip appears with the answer', JSON.stringify(names(tab, 'hJump')) === JSON.stringify(['Album B1', 'Morning Run', 'Liked Songs', 'Album B4']), names(tab, 'hJump'));
      finish(tab);
    });
  }).then(function () {
    var s2 = seed();
    var tab = open(s2);
    var t = tab.t();
    check('3 nothing saved: no strip on the first draw', !strip(tab, 'hJump'));
    return H.wait(600).then(function () {
      t.loadRecent();
      return H.wait(600);
    }).then(function () {
      check('3 nothing saved: the strip appears with the answer', (names(tab, 'hJump') || []).length === 4, names(tab, 'hJump'));
      finish(tab);
    });
  });
});

// 4. Saved cards are checked against the library: a playlist no longer in it is left out; others open the current list.
tests.push(function () {
  var store = seed();
  return earlierVisit(store).then(function () {
    var cache = JSON.parse(store.getItem('lib-cache'));
    cache.playlists = cache.playlists.filter(function (p) { return p.id !== 'P1'; });
    store.setItem('lib-cache', JSON.stringify(cache));
    var tab = open(store);
    var t = tab.t();
    check('4 removed playlist card left out', JSON.stringify(names(tab, 'hJump')) === JSON.stringify(['Album B1', 'Liked Songs', 'Album B4']), names(tab, 'hJump'));
    var liked = t.state.recent.jump.filter(function (j) { return j.liked; })[0];
    check('4 Liked Songs card reads the saved count', liked && liked.liked.kind === 'liked', liked && liked.liked);
    finish(tab);
  });
});

// 5. Recent still shows Loading while it loads; a Recent open still redraws on the answer.
tests.push(function () {
  var store = seed();
  var tab = open(store);
  var t = tab.t();
  return H.wait(600).then(function () {
    t.setFilter('recent');
    var txt = d(tab).getElementById('main').textContent;
    check('5 Recent shows Loading', /Loading recently played/.test(txt), txt.slice(0, 80));
    return H.wait(600);
  }).then(function () {
    var txt = d(tab).getElementById('main').textContent;
    check('5 Recent shows the songs', /Song t1/.test(txt), txt.slice(0, 120));
    finish(tab);
  });
});

// 6. Card strips keep their sideways scroll across a redraw and across open + Back, clamped; not while filtering.
tests.push(function () {
  var store = seed();
  return earlierVisit(store).then(function () {
    var tab = open(store, { spy: true });
    var t = tab.t();
    return H.wait(600).then(function () {
      strip(tab, 'hPlaylists').scrollLeft = 250;
      strip(tab, 'hJump').scrollLeft = 120;
      strip(tab, 'hPinned').scrollLeft = 900;   // more than the strip scrolls (700): clamped on the way back
      var old = strip(tab, 'hPlaylists');
      t.renderList();
      check('6 redraw made new strips', strip(tab, 'hPlaylists') !== old);
      check('6 redraw: Your playlists back at 250', strip(tab, 'hPlaylists').scrollLeft === 250, strip(tab, 'hPlaylists').scrollLeft);
      check('6 redraw: Jump back in back at 120', strip(tab, 'hJump').scrollLeft === 120, strip(tab, 'hJump').scrollLeft);
      check('6 redraw: Pinned clamped to 700', strip(tab, 'hPinned').scrollLeft === 700, strip(tab, 'hPinned').scrollLeft);
      strip(tab, 'hPlaylists').scrollLeft = 300;
      var card = strip(tab, 'hPlaylists').querySelector('a.clcard');
      card.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true }));
      check('6 card opened its list', !!t.state.detail);
      return H.wait(300);
    }).then(function () {
      t.closeDetail();
      check('6 Back: Your playlists back at 300', strip(tab, 'hPlaylists') && strip(tab, 'hPlaylists').scrollLeft === 300, strip(tab, 'hPlaylists') && strip(tab, 'hPlaylists').scrollLeft);
      check('6 Back: Jump back in back at 120', strip(tab, 'hJump').scrollLeft === 120, strip(tab, 'hJump').scrollLeft);
      // While the name box filters, strips start at their first card; clearing it brings the spots back.
      t.state.query = 'e';
      t.renderList();
      check('6 filtering: strips start at the first card', strip(tab, 'hPlaylists') && strip(tab, 'hPlaylists').scrollLeft === 0, strip(tab, 'hPlaylists') && strip(tab, 'hPlaylists').scrollLeft);
      strip(tab, 'hPlaylists').scrollLeft = 50;
      t.state.query = '';
      t.renderList();
      check('6 filter cleared: spot from before the filter', strip(tab, 'hPlaylists').scrollLeft === 300, strip(tab, 'hPlaylists').scrollLeft);
      // Each filter keeps its own: another tab's strips don't take Home's spots, and Home's come back.
      t.setFilter('podcasts');
      t.setFilter('home');
      check('6 back on Home from another filter: spot kept', strip(tab, 'hPlaylists').scrollLeft === 300, strip(tab, 'hPlaylists').scrollLeft);
      finish(tab);
    });
  });
});

// 7. matchCopies says whether it changed a copy link (refresh redraws then).
tests.push(function () {
  var store = seed({ 'lib-pl-copies': { P2: { copyId: 'GONE', name: 'Their Mix', ownerName: 'other', ownerId: 'other', uri: 'spotify:playlist:P2', img: '', snap: '', count: 10, at: Date.now() } } });
  var tab = open(store);
  var t = tab.t();
  return H.wait(600).then(function () {
    var data = t.state.data;
    check('7 nothing to change: false', t.matchCopies(data) === false);
    store.setItem('lib-pl-copies', JSON.stringify({ P2: { copyId: 'GONE2', name: 'Their Mix', uri: 'spotify:playlist:P2', at: Date.now() } }));
    check('7 a link to a deleted copy dropped: true', t.matchCopies(data) === true);
    finish(tab);
  });
});

(function run(i) {
  if (i >= tests.length) {
    results.forEach(function (r) { console.log(r); });
    var fails = results.filter(function (r) { return /^FAIL/.test(r); }).length;
    console.log('\n' + (results.length - fails) + ' passed, ' + fails + ' failed');
    process.exit(fails ? 1 : 0);
  }
  Promise.resolve().then(tests[i]).then(function () { run(i + 1); }, function (e) {
    results.push('ERROR test ' + (i + 1) + ': ' + (e && e.stack || e));
    run(i + 1);
  });
})(0);
