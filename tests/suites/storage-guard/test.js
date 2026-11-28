'use strict';
// Storage guard tests: when Safari's storage for the page is full, set() frees room only from copies Spotify can
// send again, tries once more and says whether it worked; writes you're told about say so when they fail.
// jsdom, mocked fetch, a localStorage that counts and refuses like WebKit's.
// Run: node tests/run.js storage-guard  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var nodeCrypto = require('crypto');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var BASE = 'https://richardtran324.github.io/spotify-library/';
var MB5 = 5 * 1024 * 1024;

// Counts like WebKit's StorageMap: bytes = length x (1 if every character is <= 0xFF, else 2), key + value; a
// replaced key gives back its old value. Throws QuotaExceededError past the quota. squeeze(n): n bytes left.
function quotaStore(quota) {
  var m = {}, size = 0, Q = quota || MB5, removed = [];
  function b(s) { s = String(s); return s.length * (/[^\x00-\xff]/.test(s) ? 2 : 1); }
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) {
      v = String(v);
      var n = size + (k in m ? -b(m[k]) : b(k)) + b(v);
      if (n > Q) { var e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
      m[k] = v; size = n;
    },
    removeItem: function (k) { if (k in m) { size -= b(k) + b(m[k]); delete m[k]; removed.push(k); } },
    clear: function () { m = {}; size = 0; },
    key: function (i) { return Object.keys(m)[i] || null; },
    get length() { return Object.keys(m).length; },
    _m: function () { return m; }, _size: function () { return size; }, _removed: removed,
    squeeze: function (left) { Q = size + left; }, open: function () { Q = MB5 * 4; }
  };
}

// Copies of what Spotify sends: the only keys the guard may remove (or, for notes and saved playlists, cut).
function allowed(k) {
  return k === 'lib-player-cache' || k === 'lib-pl-saved' || k === 'lib-ep-notes' || k === 'lib-latest' ||
    k.indexOf('lib-cache-show:') === 0 || k.indexOf('lib-cache-album:') === 0;
}
var now = Date.now();
// Kept only on this phone (or settings, or the library list the page starts from), plus a key of another app on
// the same github.io origin. Names carry ’ and emoji, so WebKit counts 2 bytes per character.
var LOCAL = {
  'lib-client-id': '0123456789abcdef0123456789ABCDEF',
  'lib-token': { access: 'fake', refresh: 'r', expires: now + 3600e3, scope: H.SCOPE },
  'lib-play-log': { e: [[now - 5000, 'lt1'], [now - 9000, 'lt2']], t: { lt1: ['Don’t Stop', 'Artist', 'Album', ''], lt2: ['Song 🎵', 'A', 'B', ''] } },
  'lib-ep-marks': { 'spotify:episode:m1': { played: true, at: now - 1000 } },
  'lib-bookmarks': [{ uri: 'spotify:track:bk1', id: 'bk1', kind: 'track', name: 'Kept’s song', by: 'A', img: '', url: '', pos: 1000, at: now - 2000 }],
  'lib-pins': [{ kind: 'playlist', id: 'p1', name: 'Pinned’s list', uri: 'spotify:playlist:p1', url: '', img: '', sub: '', ownerId: 'me1', collaborative: false }],
  'lib-ep-history': [{ uri: 'spotify:episode:h1', id: 'h1', name: 'Heard’s episode', show: { id: 'sh1', name: 'Show', images: [] }, duration_ms: 600000, positionMs: 1000, played: false, at: now - 3000 }],
  'lib-pl-copies': { orig1: { copyId: 'c1', name: 'Copy’s name', ownerName: 'O', ownerId: 'o', uri: 'spotify:playlist:c1', img: '', snap: 's', count: 3, at: now - 4000 } },
  'lib-ctx-last': { liked: { uri: 'spotify:track:x1', id: 'x1', name: 'Last’s song', positionMs: 1000, durMs: 200000, at: now - 5000 } },
  'lib-recent-searches': [{ q: 'beyoncé', at: now - 6000 }],
  'lib-intro-skip': { 'spotify:show:sh1': { s: 30, at: now - 7000 } },
  'lib-perm-ask': null,
  'lib-theme': 'dark',
  'lib-rewind': 'off',
  'lib-link-shuffle': true,
  'lib-ep-filters': { latest: { s: 'all', at: now - 8000 } },
  'lib-copy-watch': null,
  'other-app-data': 'another page on this origin 🎶'
};
function seed(store) {
  Object.keys(LOCAL).forEach(function (k) { if (LOCAL[k] !== null) store.setItem(k, JSON.stringify(LOCAL[k])); });
}
// Saved lists: n albums and n podcasts of about `chars` characters each, the oldest first; the other copies too.
function seedCaches(store, n, chars) {
  var pad = 'x'.repeat(chars || 12000);
  for (var i = 0; i < n; i++) {
    store.setItem('lib-cache-show:s' + i, JSON.stringify({ at: now - (100 - i) * 60000, total: 1, items: [{ id: 'e' + i, name: pad }] }));
    store.setItem('lib-cache-album:a' + i, JSON.stringify({ at: now - (100 - i) * 60000, total: 1, items: [{ id: 't' + i, name: pad }] }));
  }
  var pl = {};
  for (var j = 0; j < 6; j++) pl['pl' + j] = { s: 'snap', at: now - j * 1000, o: now - (10 - j) * 60000, t: 1, n: [{ i: 'q' + j, n: pad.slice(0, 2000), a: ['A'], l: 'L', d: 1000 }] };
  store.setItem('lib-pl-saved', JSON.stringify(pl));
  var notes = [];
  for (var k = 0; k < 6; k++) notes.push({ id: 'n' + k, t: pad.slice(0, 3000), at: now - k * 1000 });
  store.setItem('lib-ep-notes', JSON.stringify(notes));
  store.setItem('lib-player-cache', JSON.stringify({ at: now, by: 'other', json: null }));
}
function snap(store) { return Object.assign({}, store._m()); }
// Keys removed or changed between two snapshots that aren't Spotify copies.
function touchedLocal(before, after, except) {
  var out = [];
  Object.keys(before).forEach(function (k) {
    if (allowed(k) || (except && except.indexOf(k) !== -1)) return;
    if (!(k in after)) out.push('removed ' + k); else if (after[k] !== before[k]) out.push('changed ' + k);
  });
  return out;
}
function cacheCount(store) { return Object.keys(store._m()).filter(allowed).length; }

// Background writers (request meter, poller lock, player copy) may run between steps; they're allowed to write.
var NOISE = ['lib-reqmeter', 'lib-cat-meter', 'lib-poller', 'lib-errors', 'lib-cooloff', 'lib-cache', 'lib-filter', 'lib-lastplay', 'lib-show-seen', 'lib-ep-history'];

function setup(store, opts) {
  opts = opts || {};
  var env = { token: opts.token || null, script: opts.script || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body == null ? null : String(body);
    if (call.host === 'accounts.spotify.com') return env.token ? env.token(new URLSearchParams(String(body))) : { status: 500, json: { error: 'no_route' } };
    for (var i = 0; i < env.script.length; i++) { var s = env.script[i]; if (s.m === method && s.path === path) return { status: s.status, json: s.json }; }
    if (path === '/me/player/devices') return { status: 200, json: { devices: [] } };
  }, {
    url: opts.url || BASE,
    beforeParse: function (w) {
      var counter = 0;
      Object.defineProperty(w, 'crypto', { configurable: true, value: {
        getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (counter++ * 37 + 11) & 255; return a; },
        subtle: { digest: function (alg, data) { return nodeCrypto.webcrypto.subtle.digest(alg, data); } }
      } });
    }
  });
  tab.env = env;
  return H.wait(opts.wait === undefined ? 600 : opts.wait).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    tab.w.__toasts = [];
    tab.calls.length = 0;
    return tab;
  });
}
function navs(tab) { return (tab.w.__nav || []).filter(function (n) { return n.url.indexOf('https://accounts.spotify.com/') === 0; }); }
function tokenCalls(tab) { return tab.calls.filter(function (c) { return c.host === 'accounts.spotify.com'; }); }
function lastToast(tab) { var t = tab.toasts(); return t[t.length - 1] || ''; }
// Storage full of data only this phone has: no Spotify copy left to free (the page itself keeps writing a player
// copy), and one big key of another app fills it to `left` bytes free.
function fillWith(store, key, left) {
  var v = '';
  Object.keys(store._m()).filter(allowed).forEach(function (k) { store.removeItem(k); });
  store.open();
  var room = MB5 - store._size();
  v = 'z'.repeat(Math.max(0, room - key.length - 20));
  store.setItem(key, v);
  store.squeeze(left);
}

var tests = [];

// 1. set() says whether it stored; with only this phone's data in storage it removes nothing.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('1 set() is true when stored', t.set('lib-test-a', { a: 1 }) === true && store.getItem('lib-test-a') === '{"a":1}', store.getItem('lib-test-a'));
    var before = snap(store);
    store._removed.length = 0;
    store.squeeze(10);
    var r = t.set('lib-test-b', 'y'.repeat(500));
    check('1 set() is false when storage stays full', r === false && store.getItem('lib-test-b') === null, r);
    check('1 nothing of this phone\'s data was removed or changed', touchedLocal(before, snap(store), NOISE).length === 0 && store._removed.filter(function (k) { return !allowed(k); }).length === 0, [touchedLocal(before, snap(store), NOISE), store._removed]);
    tab.w.close();
  });
});

// 2. makeRoom with a need nothing can meet: every copy of Spotify's data may go, nothing else does.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    seedCaches(store, 8, 6000);
    t.set('lib-latest', { at: now, items: [], failed: 0 });
    var before = snap(store);
    store._removed.length = 0;
    var freed = t.makeRoom('lib-nothing', 1e9);
    var after = snap(store);
    check('2 frees the saved album and podcast lists, playlists, notes, Latest and the player copy',
      freed > 0 && cacheCount(store) === 0, Object.keys(after).filter(allowed));
    check('2 removes only keys on the list of Spotify copies', store._removed.every(allowed), store._removed);
    var bad = Object.keys(before).filter(function (k) { return !allowed(k) && after[k] !== before[k]; });
    check('2 every other key is byte-for-byte the same (token, Client ID, log, marks, bookmarks, pins, history, copies, settings, lib-cache, other apps)', bad.length === 0, bad);
    ['lib-token', 'lib-client-id', 'lib-play-log', 'lib-ep-marks', 'lib-bookmarks', 'lib-pins', 'lib-ep-history', 'lib-pl-copies', 'lib-ctx-last', 'lib-recent-searches', 'lib-intro-skip', 'lib-theme', 'other-app-data'].forEach(function (k) {
      check('2 kept ' + k, after[k] === before[k] && after[k] != null, k);
    });
    check('2 ROOM_STEPS names only Spotify copies', t.ROOM_STEPS.every(function (s) { return allowed(s[0]) || s[0] === 'lib-cache-show:' || s[0] === 'lib-cache-album:'; }), t.ROOM_STEPS.map(function (s) { return s[0]; }));
    tab.w.close();
  });
});

// 3. Order: the player copy and the oldest half of the podcast lists go first; enough freed stops there.
//    The list open on screen keeps its copy.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    seedCaches(store, 6, 12000);
    t.state.detail = { kind: 'show', item: { kind: 'show', id: 's0' } };   // the oldest podcast is open
    store._removed.length = 0;
    t.makeRoom('lib-x', 100);
    t.state.detail = null;
    var shows = Object.keys(store._m()).filter(function (k) { return k.indexOf('lib-cache-show:') === 0; }).sort();
    var albums = Object.keys(store._m()).filter(function (k) { return k.indexOf('lib-cache-album:') === 0; });
    check('3 player copy goes first', store._removed[0] === 'lib-player-cache', store._removed);
    check('3 oldest podcast lists go (half), the open one stays', shows.join() === 'lib-cache-show:s0,lib-cache-show:s4,lib-cache-show:s5', shows);
    check('3 albums, playlists and notes untouched once enough is free', albums.length === 6 && store.getItem('lib-pl-saved') && store.getItem('lib-ep-notes'), [albums.length, store._removed]);
    tab.w.close();
  });
});

// 4. A bookmark at the brim: room is made from the saved lists, the bookmark is kept, this phone's data stays.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.setPlayer(H.song('spotify:track:t1'));
    seedCaches(store, 6, 12000);
    var before = snap(store);
    store.squeeze(40);
    var n0 = cacheCount(store);
    t.addBookmark();
    var b = t.readBookmarks();
    check('4 bookmark saved at the brim', b.length === 2 && b[0].uri === 'spotify:track:t1', b.map(function (x) { return x.uri; }));
    check('4 toast says Bookmarked', /^Bookmarked “Song One”/.test(lastToast(tab)), tab.toasts());
    check('4 room came from saved lists', cacheCount(store) < n0, [n0, cacheCount(store)]);
    check('4 nothing else removed or changed (but the bookmark list)', touchedLocal(before, snap(store), NOISE.concat(['lib-bookmarks'])).length === 0, touchedLocal(before, snap(store), NOISE.concat(['lib-bookmarks'])));
    check('4 the old bookmark is still there', b.some(function (x) { return x.uri === 'spotify:track:bk1'; }), b);
    tab.w.close();
  });
});

// 5. Full of this phone's own data: the bookmark isn't saved and the toast says so; nothing is removed.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.setPlayer(H.song('spotify:track:t1'));
    fillWith(store, 'other-app-big', 0);
    var before = snap(store);
    store._removed.length = 0;
    t.addBookmark();
    check('5 bookmark not saved', t.readBookmarks().length === 1, t.readBookmarks());
    check('5 toast says it couldn’t be saved', lastToast(tab) === 'Couldn’t save the bookmark: your phone’s storage for this page is full.', tab.toasts());
    check('5 nothing of this phone\'s data removed', store._removed.filter(function (k) { return !allowed(k); }).length === 0 && touchedLocal(before, snap(store), NOISE).length === 0, [store._removed, touchedLocal(before, snap(store), NOISE)]);
    tab.w.close();
  });
});

// 6. Mark as played: saved at the brim with saved lists to drop; without them the toast says it lasts until reload.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    seedCaches(store, 4, 12000);
    store.squeeze(20);
    t.toggleMark({ uri: 'spotify:episode:e7', name: 'Ep Seven', sp: false });
    var m = JSON.parse(store.getItem('lib-ep-marks') || '{}');
    check('6 mark saved after making room', m['spotify:episode:e7'] && m['spotify:episode:e7'].played === true && m['spotify:episode:m1'], m);
    check('6 toast: on this phone', /as played on this phone$/.test(lastToast(tab)), tab.toasts());
    fillWith(store, 'other-app-big', 0);
    var before = store.getItem('lib-ep-marks');
    store._removed.length = 0;
    t.toggleMark({ uri: 'spotify:episode:e8', name: 'Ep Eight', sp: false });
    check('6 full: mark not in storage, the stored marks unchanged', store.getItem('lib-ep-marks') === before, store.getItem('lib-ep-marks'));
    check('6 full: toast says it lasts until reload', lastToast(tab) === 'Marked “Ep Eight” as played until you reload. Couldn’t save it: your phone’s storage for this page is full.', tab.toasts());
    check('6 full: nothing of this phone\'s data removed', store._removed.filter(function (k) { return !allowed(k); }).length === 0, store._removed);
    tab.w.close();
  });
});

// 7. Pin when full: the toast says it didn't work, pins unchanged.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    fillWith(store, 'other-app-big', 0);
    var before = store.getItem('lib-pins');
    t.togglePin({ kind: 'album', id: 'a9', name: 'Ninth Album', uri: 'spotify:album:a9', url: '', img: '', sub: '' });
    check('7 pins unchanged', store.getItem('lib-pins') === before, store.getItem('lib-pins'));
    check('7 toast says it couldn’t pin', lastToast(tab) === 'Couldn’t pin “Ninth Album”: your phone’s storage for this page is full.', tab.toasts());
    tab.w.close();
  });
});

// 8. IPHONE-2: a wait-mode tap. Full: the toast says so, an older waiting tap is cleared (it must not play
//    instead), nothing is sent to play. At the brim with saved lists: the tap is kept and the wait line shows.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t(), doc = tab.w.document;
    var item = { kind: 'track', id: 't9', name: 'Nine', uri: 'spotify:track:t9', url: 'https://open.spotify.com/track/t9' };
    store.setItem('lib-pending', JSON.stringify({ item: { kind: 'track', id: 'old', name: 'Older tap', uri: 'spotify:track:old' }, opts: {}, at: Date.now() - 1000, mode: 'wait' }));
    fillWith(store, 'other-app-big', 0);
    t.waitForPlay(item, {});
    return H.wait(50).then(function () {
      check('8 full: toast says the tap can’t wait', lastToast(tab) === 'Couldn’t hold “Nine” until Spotify wakes: your phone’s storage for this page is full. Open Spotify first, then tap it again.', tab.toasts());
      check('8 full: no waiting tap left (not the older one either)', store.getItem('lib-pending') === null, store.getItem('lib-pending'));
      check('8 full: no wait line', doc.getElementById('wake').hidden === true, doc.getElementById('wakeText').textContent);
      check('8 full: nothing sent to play', !tab.calls.some(function (c) { return c.method === 'PUT' && /\/me\/player\/play/.test(c.path); }), tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
      store.removeItem('other-app-big');
      seedCaches(store, 4, 12000);
      store.squeeze(30);
      tab.w.__toasts = [];
      t.waitForPlay(item, {});
      return H.wait(50);
    }).then(function () {
      var p = t.readPending();
      check('8 brim: tap kept after making room', p && p.item.id === 't9' && p.mode === 'wait', p);
      check('8 brim: wait line shows', doc.getElementById('wake').hidden === false && /Nine/.test(doc.getElementById('wakeText').textContent), doc.getElementById('wakeText').textContent);
      t.stopWake();
      tab.w.close();
    });
  });
});

// 9. Sign-in at the brim: the check values are saved (room from saved lists), and the callback finishes.
tests.push(function () {
  var store = quotaStore(); seed(store);
  var tab1;
  return setup(store).then(function (tab) {
    tab1 = tab;
    seedCaches(store, 4, 12000);
    store.squeeze(40);
    tab.t().login();
    return H.wait(100);
  }).then(function () {
    var nav = navs(tab1)[0];
    check('9 brim: lib-state and lib-verifier saved', !!store.getItem('lib-state') && !!store.getItem('lib-verifier'), [store.getItem('lib-state'), !!store.getItem('lib-verifier')]);
    check('9 brim: goes to Spotify', !!nav, tab1.w.__nav);
    var st = nav ? new URL(nav.url).searchParams.get('state') : 'none';
    tab1.w.close();
    store.open();
    return setup(store, { url: BASE + '?code=abc&state=' + st, token: function () { return { status: 200, json: { access_token: 'NEW', refresh_token: 'R2', expires_in: 3600, scope: H.SCOPE } }; } });
  }).then(function (tab2) {
    check('9 callback exchanges the code', JSON.parse(store.getItem('lib-token') || '{}').access === 'NEW', store.getItem('lib-token'));
    tab2.w.close();
  });
});

// 10. Full of this phone's own data: sign-in doesn't start, says why, and the old sign-in stays.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var tok = store.getItem('lib-token');
    fillWith(store, 'other-app-big', 0);
    tab.t().login();
    return H.wait(100).then(function () {
      check('10 full: no trip to Spotify', navs(tab).length === 0, tab.w.__nav);
      check('10 full: toast says why', lastToast(tab) === 'Couldn’t start sign-in: your phone’s storage for this page is full.', tab.toasts());
      check('10 full: old sign-in kept', store.getItem('lib-token') === tok, store.getItem('lib-token'));
      tab.w.close();
    });
  });
});

// 11. A renewed sign-in that can't be saved: kept for this visit (no second renewal), toast once, the stored one stays.
tests.push(function () {
  var store = quotaStore(); seed(store);
  store.setItem('lib-token', JSON.stringify({ access: 'OLD', refresh: 'r', expires: now + 3600e3, scope: H.SCOPE }));
  return setup(store, { token: function () { return { status: 200, json: { access_token: 'NEW', refresh_token: 'R2', expires_in: 3600, scope: H.SCOPE } }; } }).then(function (tab) {
    var t = tab.t();
    store.setItem('lib-token', JSON.stringify({ access: 'OLD', refresh: 'r', expires: 0, scope: H.SCOPE }));
    fillWith(store, 'other-app-big', 0);
    var stored = store.getItem('lib-token');
    tab.calls.length = 0;
    return t.accessToken().then(function (a) {
      check('11 the new access token is used', a === 'NEW', a);
      check('11 kept for this visit', t.get(t.K.token).access === 'NEW' && t.get(t.K.token).refresh === 'R2', t.get(t.K.token));
      check('11 the stored sign-in is not removed', store.getItem('lib-token') === stored, store.getItem('lib-token'));
      check('11 toast says the sign-in couldn’t be saved', tab.toasts().filter(function (m) { return /^Couldn’t save your sign-in on this phone: your phone’s storage for this page is full\./.test(m); }).length === 1, tab.toasts());
      return t.accessToken();
    }).then(function (a2) {
      check('11 no second renewal this visit', a2 === 'NEW' && tokenCalls(tab).length === 1, tokenCalls(tab).length);
      store.removeItem('other-app-big'); store.open();
      t.saveToken({ access_token: 'NEWER', expires_in: 3600, scope: H.SCOPE }, false);
      check('11 once storage has room it is saved again', JSON.parse(store.getItem('lib-token')).access === 'NEWER' && t.get(t.K.token).refresh === 'R2', store.getItem('lib-token'));
      tab.w.close();
    });
  });
});

// 12. The listening log at the brim is saved whole (room from saved lists), not cut in half.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    seedCaches(store, 4, 12000);
    var e = [], tt = {};
    for (var i = 0; i < 40; i++) { e.push([now - i * 60000, 'k' + i]); tt['k' + i] = ['Song ’' + i, 'A', 'B', '']; }
    var L = { e: e, t: tt };
    store.squeeze(40);
    t.logSave(L);
    var saved = JSON.parse(store.getItem('lib-play-log') || '{}');
    check('12 log saved whole', saved.e && saved.e.length === 40, saved.e && saved.e.length);
    tab.w.close();
  });
});

// 13. Storage that refuses every write (blocked): the page still starts; sign-in says it can't save; nothing removed.
tests.push(function () {
  var store = quotaStore(); seed(store);
  var real = store.setItem, removes = 0, realRemove = store.removeItem;
  store.setItem = function () { var e = new Error('The operation is insecure.'); e.name = 'SecurityError'; e.code = 18; throw e; };
  store.removeItem = function (k) { removes++; return realRemove.call(store, k); };
  return setup(store).then(function (tab) {
    check('13 page starts with blocked storage', !!tab.t() && !!tab.w.document.getElementById('main'), null);
    tab.t().login();
    return H.wait(100).then(function () {
      check('13 sign-in doesn’t start, toast says why', navs(tab).length === 0 && lastToast(tab) === 'Couldn’t start sign-in: this browser isn’t letting the page save right now.', [tab.w.__nav, tab.toasts()]);
      var t = tab.t();
      check('13 a blocked write makes no room (nothing removed by the guard)', t.store('lib-x', 'y') === false && store.getItem('lib-token') !== null, removes);
      store.setItem = real;
      tab.w.close();
    });
  });
});

// 14. Settings: the wake choice says whether it was saved.
tests.push(function () {
  var store = quotaStore(); seed(store);
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('14 wake choice saved', t.setWakeMode('link') === true && store.getItem('lib-wake') === 'link', store.getItem('lib-wake'));
    fillWith(store, 'other-app-big', 0);
    check('14 full: wake choice says false, old choice kept', t.setWakeMode('shortcut') === false && store.getItem('lib-wake') === 'link', store.getItem('lib-wake'));
    tab.w.close();
  });
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return /^FAIL/.test(r); }).length;
  console.log('\n' + (results.length - fails) + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});
