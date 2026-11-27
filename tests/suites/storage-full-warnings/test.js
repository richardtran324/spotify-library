'use strict';
// Storage-full warnings (v2.50): set() reports failure (v2.38) and why (saveFailWhy), and Bookmarks and Skip intro
// say when a save didn't happen.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var FULL = 'Couldn’t save the bookmark: your phone’s storage for this page is full.';
function track(id, o) {
  o = o || {};
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: o.name || ('Song ' + id), duration_ms: 900000,
    external_urls: { spotify: 'https://open.spotify.com/track/' + id },
    artists: [{ id: 'ar1', name: o.artist || 'The Band' }], album: { id: 'al1', name: 'Album', images: [{ url: 'https://i/a.jpg', width: 300 }] } };
}
function playerWith(item, pos) {
  return { item: item, currently_playing_type: 'track', context: { type: 'album', uri: 'spotify:album:X' }, is_playing: false,
    progress_ms: pos || 0, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function bm(i) {
  return { uri: 'spotify:track:b' + i, id: 'b' + i, kind: 'track', name: 'Mark ' + i, by: 'Band', img: '',
    url: 'https://open.spotify.com/track/b' + i, pos: i * 1000, at: Date.now() - i * 60000 };
}
// A localStorage whose setItem throws for the keys in fail (name: QuotaExceededError unless failName is set).
function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(extra && extra.filter || 'home'));
  Object.keys(extra || {}).forEach(function (k) { if (k !== 'filter') s.setItem(k, JSON.stringify(extra[k])); });
  var orig = s.setItem;
  s.fail = {}; s.failName = 'QuotaExceededError';
  s.setItem = function (k, v) {
    if (s.fail[k] || s.fail['*']) { var e = new Error('The quota has been exceeded.'); e.name = s.failName; if (s.failName === 'QuotaExceededError') e.code = 22; throw e; }
    return orig.call(s, k, v);
  };
  return s;
}
function setup(store, opts) {
  opts = opts || {};
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/shows' && method === 'GET') return { status: 200, json: { items: [{ show: { id: 's1', name: 'Money Show', uri: 'spotify:show:s1', images: [], total_episodes: 1, publisher: 'P' } }], next: null, total: 1 } };
    if (path === '/shows/s1/episodes') return { status: 200, json: { items: [], next: null, total: 0 } };
    if (path === '/me/library/contains' || path === '/me/episodes/contains') return { status: 200, json: [] };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    t.state.recentTriedAt = Date.now();
    if (opts.setPlayer) t.setPlayer(JSON.parse(JSON.stringify(opts.setPlayer)));
    return H.wait(200);
  }).then(function () {
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function stored(store, k) { var v = store.getItem(k); return v ? JSON.parse(v) : null; }
function bmRows(tab) { return [].slice.call(d(tab).querySelectorAll('ul[aria-labelledby="hBm"] > li')); }
function finish(tab) { try { tab.w.close(); } catch (e) {} }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }

var tests = [];

// 1. set() returns true on success, false when storage refuses it; get() and old callers are unchanged.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('1 set returns true when saved', t.set('lib-test-x', { a: 1 }) === true && t.get('lib-test-x').a === 1);
    store.fail['lib-test-x'] = true;
    check('1 set returns false when storage is full', t.set('lib-test-x', { a: 2 }) === false);
    check('1 the old value is untouched', t.get('lib-test-x').a === 1);
    check('1 full: plain reason', t.saveFailWhy() === 'your phone’s storage for this page is full', t.saveFailWhy());
    store.failName = 'SecurityError';
    check('1 blocked: false too', t.set('lib-test-x', 3) === false);
    check('1 blocked: a different reason', t.saveFailWhy() === 'this browser isn’t letting the page save right now', t.saveFailWhy());
    check('1 return values are booleans', typeof t.set('lib-test-y', 1) === 'boolean');
    finish(tab);
  });
});

// 2. Bookmark with storage full: failure toast, no success toast, nothing stored, Home unchanged.
tests.push(function () {
  var store = seed({ 'lib-bookmarks': [bm(1)] });
  return setup(store, { setPlayer: playerWith(track('t1', { name: 'Blue Song' }), 60000) }).then(function (tab) {
    var t = tab.t();
    t.renderList();
    store.fail['lib-bookmarks'] = true;
    click(tab, $(tab, 'npBm'));
    return H.wait(50).then(function () {
      check('2 failure toast', tab.toasts().indexOf(FULL) !== -1, tab.toasts());
      check('2 no "Bookmarked" toast', !tab.toasts().some(function (m) { return /^Bookmarked/.test(m); }), tab.toasts());
      check('2 nothing new stored', stored(store, 'lib-bookmarks').length === 1);
      check('2 Home still lists one bookmark', bmRows(tab).length === 1, bmRows(tab).length);
      // Space again: the same tap saves and says so.
      store.fail = {}; tab.w.__toasts = [];
      click(tab, $(tab, 'npBm'));
      return H.wait(50);
    }).then(function () {
      check('2 after room is made, Bookmarked toast', /^Bookmarked “Blue Song” at 1:00$/.test(lastToast(tab)), tab.toasts());
      check('2 and it is stored', stored(store, 'lib-bookmarks').length === 2);
      finish(tab);
    });
  });
});

// 3. Long names and artists are capped (200 and 100 characters).
tests.push(function () {
  var store = seed();
  var long = new Array(400).join('x'), artist = new Array(300).join('y');
  return setup(store, { setPlayer: playerWith(track('t2', { name: long, artist: artist }), 1000) }).then(function (tab) {
    tab.t().addBookmark();
    var b = stored(store, 'lib-bookmarks')[0];
    check('3 name capped at 200', b && b.name.length === 200, b && b.name.length);
    check('3 by capped at 100', b && b.by.length === 100, b && b.by.length);
    check('3 short names unchanged', (function () { tab.t().setPlayer(playerWith(track('t3', { name: 'Short' }), 1000)); tab.t().addBookmark(); var x = stored(store, 'lib-bookmarks')[0]; return x.name === 'Short' && x.by === 'The Band'; })());
    finish(tab);
  });
});

// 4. Remove with storage full: says so, keeps the bookmark, offers no Undo. Undo with storage full: says so.
tests.push(function () {
  var store = seed({ 'lib-bookmarks': [bm(1), bm(2)] });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.renderList();
    return H.wait(50).then(function () {
      check('4 two bookmarks on Home', bmRows(tab).length === 2, bmRows(tab).length);
      store.fail['lib-bookmarks'] = true;
      click(tab, d(tab).querySelector('[data-bmrm="0"]'));
      return H.wait(50);
    }).then(function () {
      check('4 remove failure toast', lastToast(tab) === 'Couldn’t remove the bookmark: your phone’s storage for this page is full.', tab.toasts());
      check('4 no "Bookmark removed" toast', !tab.toasts().some(function (m) { return /removed/.test(m); }), tab.toasts());
      check('4 no Undo button', !$(tab, 'toast').querySelector('.toastbtn'));
      check('4 both still stored and listed', stored(store, 'lib-bookmarks').length === 2 && bmRows(tab).length === 2, bmRows(tab).length);
      // Remove works, then Undo fails.
      store.fail = {}; tab.w.__toasts = [];
      click(tab, d(tab).querySelector('[data-bmrm="0"]'));
      return H.wait(50);
    }).then(function () {
      check('4 remove with room: Bookmark removed with Undo', lastToast(tab) === 'Bookmark removed' && !!$(tab, 'toast').querySelector('.toastbtn'), tab.toasts());
      check('4 one left', stored(store, 'lib-bookmarks').length === 1);
      store.fail['lib-bookmarks'] = true; tab.w.__toasts = [];
      click(tab, $(tab, 'toast').querySelector('.toastbtn'));
      return H.wait(50);
    }).then(function () {
      check('4 undo failure toast', lastToast(tab) === 'Couldn’t bring back the bookmark: your phone’s storage for this page is full.', tab.toasts());
      check('4 still one stored and listed', stored(store, 'lib-bookmarks').length === 1 && bmRows(tab).length === 1, bmRows(tab).length);
      // Two removals, then a failing Undo: plural wording.
      store.fail = {}; tab.w.__toasts = [];
      t.removeBookmark(t.readBookmarks()[0]);
      store.setItem('lib-bookmarks', JSON.stringify([bm(5)]));
      t.removeBookmark(bm(5));
      store.fail['lib-bookmarks'] = true; tab.w.__toasts = [];
      click(tab, $(tab, 'toast').querySelector('.toastbtn'));
      return H.wait(50);
    }).then(function () {
      check('4 plural undo failure toast', lastToast(tab) === 'Couldn’t bring back the bookmarks: your phone’s storage for this page is full.', tab.toasts());
      check('4 writeBookmarks returns false when full', tab.t().writeBookmarks([bm(9)]) === false);
      store.fail = {};
      check('4 writeBookmarks returns true when saved', tab.t().writeBookmarks([bm(9)]) === true);
      finish(tab);
    });
  });
});

// 5. Skip intro with storage full and an older setting stored: says it couldn't save; the picker shows what applies.
function pick(tab, v) { var sel = $(tab, 'dintro'); sel.value = String(v); sel.dispatchEvent(new tab.w.Event('change', { bubbles: true })); }
function openShow(tab) { tab.t().openDetail({ kind: 'show', id: 's1', uri: 'spotify:show:s1', name: 'Money Show', url: 'https://open.spotify.com/show/s1', img: '' }); return H.wait(300); }
tests.push(function () {
  var intro = { 'spotify:show:s1': { s: 30, at: Date.now() - 1000 } };
  var store = seed({ filter: 'podcasts', 'lib-intro-skip': intro });
  return setup(store).then(function (tab) {
    var t = tab.t();
    return openShow(tab).then(function () {
      check('5 picker shows the stored 0:30', $(tab, 'dintro').value === '30', $(tab, 'dintro').value);
      store.fail['lib-intro-skip'] = true;
      pick(tab, 60);
      check('5 failure message, no claim it applies', lastToast(tab) === 'Couldn’t save Skip intro: your phone’s storage for this page is full.', tab.toasts());
      check('5 no success toast', !tab.toasts().some(function (m) { return /^Skip intro:/.test(m); }), tab.toasts());
      check('5 picker back to what applies (0:30)', $(tab, 'dintro').value === '30' && t.introSecs('spotify:show:s1') === 30, [$(tab, 'dintro').value, t.introSecs('spotify:show:s1')]);
      check('5 hint matches 0:30', !$(tab, 'dintroHint').hidden && /start at 0:30\./.test($(tab, 'dintroHint').textContent), $(tab, 'dintroHint').textContent);
      check('5 storage unchanged', stored(store, 'lib-intro-skip')['spotify:show:s1'].s === 30);
      tab.w.__toasts = [];
      pick(tab, 0);
      check('5 Off fails the same way', lastToast(tab) === 'Couldn’t save Skip intro: your phone’s storage for this page is full.' && $(tab, 'dintro').value === '30', [tab.toasts(), $(tab, 'dintro').value]);
      check('5 setIntro returns false', t.setIntro('spotify:show:s1', 90) === false);
      store.fail = {}; tab.w.__toasts = [];
      pick(tab, 60);
      check('5 with room: saved, usual toast', lastToast(tab) === 'Skip intro: episodes of “Money Show” start at 1:00' && stored(store, 'lib-intro-skip')['spotify:show:s1'].s === 60, tab.toasts());
      check('5 setIntro returns true', t.setIntro('spotify:show:s1', 60) === true);
      finish(tab);
    });
  });
});

// 6. Skip intro with storage full and nothing stored yet: the memory copy applies this visit, and the message says so.
tests.push(function () {
  var store = seed({ filter: 'podcasts' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    return openShow(tab).then(function () {
      store.fail['lib-intro-skip'] = true;
      pick(tab, 45);
      check('6 message says it applies until the page closes', lastToast(tab) === 'Couldn’t save Skip intro: your phone’s storage for this page is full. It applies until you close this page.', tab.toasts());
      check('6 picker keeps 0:45, and it is in use', $(tab, 'dintro').value === '45' && t.introSecs('spotify:show:s1') === 45, [$(tab, 'dintro').value, t.introSecs('spotify:show:s1')]);
      check('6 nothing stored', store.getItem('lib-intro-skip') === null);
      store.failName = 'SecurityError'; tab.w.__toasts = [];
      pick(tab, 90);
      check('6 blocked storage: its own reason', lastToast(tab) === 'Couldn’t save Skip intro: this browser isn’t letting the page save right now. It applies until you close this page.', tab.toasts());
      finish(tab);
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
