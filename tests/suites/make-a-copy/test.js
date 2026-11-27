'use strict';
// Make a copy (v2.24, PR #7) tests: jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
// The feature never copies through the Web API: it shows how to copy someone else's playlist in the Spotify app,
// watches for the copy (lib-copy-watch), links it to the original after Refresh (lib-pl-copies) and says when
// the original has changed. These tests drive the page and check what shows, what is stored and what is sent.
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var ME = 'me1';
var ALL_CALLS = [];   // every request from every tab, for the "never touches the source" checks at the end
var HOUR = 3600e3;

function pl(id, name, ownerId, ownerName, o) {
  o = o || {};
  var p = { id: id, name: name, uri: 'spotify:playlist:' + id, images: [], owner: { id: ownerId, display_name: ownerName },
    collaborative: !!o.collab, tracks: { total: o.total || 0 } };
  if (o.snap !== undefined) p.snapshot_id = o.snap;
  return p;
}
function basePlaylists() {
  return [
    pl('o1', 'Road Trip', 'alice', 'Alice', { snap: 's1', total: 20 }),
    pl('o2', 'Shared Jams', 'bob', 'Bob', { collab: true, total: 5 }),
    pl('o3', 'Morning', 'carol', '', { total: 3 }),
    pl('m1', 'My Mix', ME, 'R', { total: 7 })
  ];
}
// env.playlists answers GET /me/playlists; env.plFail replaces that answer; env.items403 = {id: true}.
function setup(store, opts) {
  opts = opts || {};
  var env = { playlists: opts.playlists || basePlaylists(), plFail: null, items403: {} };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body || null;
    ALL_CALLS.push(call);
    if (method === 'GET' && path === '/me') return { status: 200, json: { id: ME, display_name: 'R' } };
    if (method === 'GET' && path === '/me/playlists') {
      if (env.plFail) return env.plFail;
      return { status: 200, json: { items: env.playlists, next: null, total: env.playlists.length } };
    }
    if (method === 'GET' && path === '/me/library/contains') {
      var n = String(q.get('uris') || '').split(',').filter(Boolean).length;
      var a = []; for (var i = 0; i < n; i++) a.push(true);
      return { status: 200, json: a };
    }
    var m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m && method === 'GET') {
      if (env.items403[m[1]]) return { status: 403, json: { error: { status: 403, message: 'Forbidden' } } };
      return { status: 200, json: { items: [], next: null, total: 0 } };
    }
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (!t.state.data || !t.state.data.me) throw new Error('library did not load');
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function box(tab) { return d(tab).getElementById('dcopy'); }
function boxShown(tab) { var b = box(tab); return !!b && !b.hidden; }
function noteEl(tab) { return d(tab).getElementById('dnote'); }
function noteText(tab) { var n = noteEl(tab); return n && !n.hidden ? n.textContent : ''; }
function btn(root, text) {
  if (!root) return null;
  var all = [].slice.call(root.querySelectorAll('button, a'));
  for (var i = 0; i < all.length; i++) { if (all[i].textContent.trim() === text) return all[i]; }
  return null;
}
function libItem(tab, id) {
  var list = tab.t().state.data.playlists;
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
  return null;
}
function open(tab, id) { tab.t().openDetail(libItem(tab, id)); return H.wait(60); }
function stored(store, k) { var v = store.getItem(k); return v == null ? null : JSON.parse(v); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function refresh(tab) { return tab.t().refresh().then(function () { return H.wait(60); }); }
function diagText(tab) { tab.t().openDiag(); return H.wait(60).then(function () { return d(tab).getElementById('diagOut').textContent; }); }
function rowSub(tab, name) {
  var rows = [].slice.call(d(tab).querySelectorAll('a.item'));
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i].querySelector('.name');
    if (n && n.textContent === name) return rows[i].getAttribute('data-sub') || '';
  }
  return null;
}
function addPl(tab, p) { tab.env.playlists = tab.env.playlists.concat([p]); }
function seedLink(store, origId, copyId, extra) {
  var m = stored(store, 'lib-pl-copies') || {};
  m[origId] = Object.assign({ copyId: copyId, name: 'Road Trip', ownerName: 'Alice', ownerId: 'alice', uri: 'spotify:playlist:' + origId,
    img: '', snap: 's1', count: 20, at: Date.now() }, extra || {});
  store.setItem('lib-pl-copies', JSON.stringify(m));
}
function seedWatch(store, w) {
  store.setItem('lib-copy-watch', JSON.stringify(Object.assign({ origId: 'o1', name: 'Road Trip', at: Date.now(), known: [], snap: 's1', count: 20,
    ownerName: 'Alice', ownerId: 'alice', uri: 'spotify:playlist:o1', img: '' }, w || {})));
}

var tests = [];
function cnt(re, s) { return (s.match(re) || []).length; }
function steps(tab) { return [].slice.call(box(tab).querySelectorAll('ol li')).map(function (li) { return li.textContent; }); }
function linkOf(store, id) { return (stored(store, 'lib-pl-copies') || {})[id] || null; }
function watchOrig(store) { return (stored(store, 'lib-copy-watch') || {}).origId || null; }
function asks(tab) { return /Is this your copy/.test(noteText(tab)); }
function linkedToasts(tab) { return tab.toasts().filter(function (x) { return /^Linked your copy/.test(x); }); }
function closeDiag(tab) { d(tab).getElementById('diag').hidden = true; }
function copiesLine(txt) { return txt.split('\n').filter(function (l) { return /^Playlist copies/.test(l); })[0] || ''; }

// 1. When Make a copy shows: someone else's playlist only.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    return open(tab, 'o1').then(function () {
      check('1 someone else\'s playlist: restricted view with a Make a copy button (no steps yet)',
        boxShown(tab) && !!btn(box(tab), 'Make a copy') && !box(tab).querySelector('ol') && /only lets personal apps list songs/.test(d(tab).getElementById('dfoot').textContent), box(tab).textContent);
      check('1 opening it asks for no song list and shows no copy note', reqs(tab, 'GET', /^\/playlists\/o1/).length === 0 && noteText(tab) === '', [tab.calls, noteText(tab)]);
      return open(tab, 'm1');
    }).then(function () {
      check('1 your own playlist: songs listed, no copy box', !boxShown(tab) && reqs(tab, 'GET', '/playlists/m1/items').length === 1, tab.calls);
      return open(tab, 'o2');
    }).then(function () {
      check('1 collaborative playlist: no copy box', !boxShown(tab));
      tab.t().openDetail({ kind: 'album', id: 'al1', name: 'An Album', uri: 'spotify:album:al1', url: 'https://open.spotify.com/album/al1', img: '' });
      return H.wait(60);
    }).then(function () {
      var album = !boxShown(tab);
      tab.t().openDetail({ kind: 'liked', name: 'Liked Songs', uri: null, url: 'https://open.spotify.com/collection/tracks', sub: 'Playlist' });
      return H.wait(60).then(function () { check('1 album and Liked Songs: no copy box', album && !boxShown(tab)); });
    });
  });
});

// 1b. A 403 on the song list of your own or a collaborative playlist: restricted, but still no Make a copy.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    tab.env.items403 = { m1: true, o2: true };
    return open(tab, 'm1').then(function () {
      check('1b own playlist answered 403: restricted, no copy box', tab.t().state.detail.restricted === true && !boxShown(tab));
      return open(tab, 'o2');
    }).then(function () {
      check('1b collaborative answered 403: restricted, no copy box', tab.t().state.detail.restricted === true && !boxShown(tab));
    });
  });
});

// 2. Tapping Make a copy: the steps, the link, the note, the watch, and no request.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    return open(tab, 'o1').then(function () {
      tab.calls.length = 0;
      var before = Date.now();
      var b = btn(box(tab), 'Make a copy');
      click(tab, b);
      var after = Date.now();
      var bx = box(tab), st = steps(tab);
      check('2 tap sends no request', tab.calls.length === 0, tab.calls);
      check('2 intro and five steps (Open in Spotify first, Refresh last); the button is gone',
        /Copy it in the Spotify app/.test(bx.textContent) && st.length === 5 && /Open in Spotify/.test(st[0]) && /Refresh/.test(st[4]) && !btn(bx, 'Make a copy'), st);
      var link = btn(bx, 'Open in Spotify');
      check('2 Open in Spotify links the original', !!link && link.tagName === 'A' && link.getAttribute('href') === 'https://open.spotify.com/playlist/o1', link && link.getAttribute('href'));
      check('2 note names the owner', /when Alice changes theirs/.test(bx.textContent), bx.textContent);
      var a = d(tab).activeElement;
      check('2 focus moves to the intro', !!a && bx.contains(a) && /^Copy it in the Spotify app/.test(a.textContent), a && a.textContent);
      var w = stored(store, 'lib-copy-watch');
      check('2 watch stored: original, name, and your own playlists only as known', w && w.origId === 'o1' && w.name === 'Road Trip' && JSON.stringify(w.known) === '["m1"]', w);
      check('2 watch keeps the baseline and the time', w && w.snap === 's1' && w.count === 20 && w.ownerName === 'Alice' && w.ownerId === 'alice' && w.uri === 'spotify:playlist:o1' && w.at >= before && w.at <= after, w);
      check('2 nothing linked yet', store.getItem('lib-pl-copies') === null, store.getItem('lib-pl-copies'));
      click(tab, b);   // double tap: the old (now removed) button again
      check('2 double tap: one set of steps, one watch, no request', box(tab).querySelectorAll('ol').length === 1 && steps(tab).length === 5 && watchOrig(store) === 'o1' && tab.calls.length === 0, tab.calls);
      return diagText(tab);
    }).then(function (txt) {
      check('2 Diagnostics says it is watching', copiesLine(txt) === 'Playlist copies linked: 0 · watching for a new copy', copiesLine(txt));
      closeDiag(tab);
      tab.t().closeDetail();
      return open(tab, 'o1');
    }).then(function () {
      check('2 reopening shows Make a copy again and keeps the watch', !!btn(box(tab), 'Make a copy') && watchOrig(store) === 'o1');
      return open(tab, 'o3');
    }).then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      check('2 no owner name: note says the owner; the new watch replaces the old', /when the owner changes theirs/.test(box(tab).textContent) && watchOrig(store) === 'o3', box(tab).textContent);
      tab.t().openDetail({ kind: 'playlist', id: 'x9', name: 'Pinned One', uri: 'spotify:playlist:x9', ownerId: 'zed', ownerName: 'Zed', img: '' });
      return H.wait(60);
    }).then(function () {
      var shown = boxShown(tab);
      click(tab, btn(box(tab), 'Make a copy'));
      var link = btn(box(tab), 'Open in Spotify'), w = stored(store, 'lib-copy-watch');
      check('2 playlist outside the library, no url: box shows, link built from the id', shown && !!link && link.getAttribute('href') === 'https://open.spotify.com/playlist/x9', link && link.getAttribute('href'));
      check('2 its watch comes from the item itself', w && w.origId === 'x9' && w.name === 'Pinned One' && w.ownerName === 'Zed' && w.uri === 'spotify:playlist:x9', w);
    });
  });
});

// 3. With the embedded player open (v2.27: Spotify's iFrame API, stubbed here), Make a copy doesn't reload it.
function fakeEmbedApi(tab) {
  var api = { made: [] };
  api.createController = function (elm, opts, cb) {
    var f = d(tab).createElement('iframe');
    f.setAttribute('src', 'https://open.spotify.com/embed/fake');
    elm.parentNode.replaceChild(f, elm);
    var ctl = { frame: f, destroyed: 0 };
    ctl.addListener = function () {};
    ctl.pause = function () {};
    ctl.destroy = function () { ctl.destroyed++; if (f.parentNode) f.parentNode.removeChild(f); };
    api.made.push(ctl);
    setTimeout(function () { cb(ctl); }, 0);
  };
  return api;
}
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var api = fakeEmbedApi(tab), fr, holder;
    return open(tab, 'o1').then(function () {
      click(tab, btn(d(tab).getElementById('dfoot'), 'Show songs'));
      return H.wait(20);
    }).then(function () {
      if (typeof tab.w.onSpotifyIframeApiReady === 'function') tab.w.onSpotifyIframeApiReady(api);
      return H.wait(30);
    }).then(function () {
      holder = d(tab).querySelector('#dfoot .sembed-box') || d(tab).querySelector('#dfoot iframe');
      fr = d(tab).querySelector('#dfoot iframe');
      click(tab, btn(box(tab), 'Make a copy'));
      return H.wait(30);
    }).then(function () {
      var fr2 = d(tab).querySelector('#dfoot iframe');
      var holder2 = d(tab).querySelector('#dfoot .sembed-box') || fr2;
      check('3 the same player stays open beside the steps (not rebuilt or reloaded)',
        !!fr && fr2 === fr && holder2 === holder && api.made.length === 1 && api.made[0].destroyed === 0 && steps(tab).length === 5,
        { fr: !!fr, same: fr2 === fr, made: api.made.length, destroyed: api.made[0] && api.made[0].destroyed, steps: steps(tab).length });
    });
  });
});

// 4. Refresh links the new copy by name, and the views and rows say so.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    return open(tab, 'o1').then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      addPl(tab, pl('c1', '  road   TRIP ', ME, 'R', { total: 20 }));   // case and spacing don't matter
      tab.calls.length = 0;
      return refresh(tab);
    }).then(function () {
      var m = stored(store, 'lib-pl-copies') || {}, c = m.o1 || {};
      check('4 toast says it linked', tab.toasts().indexOf('Linked your copy of “Road Trip”.') !== -1, tab.toasts());
      check('4 link stored under the original with its name, owner and baseline', Object.keys(m).length === 1 && c.copyId === 'c1' && c.name === 'Road Trip' && c.ownerName === 'Alice' && c.ownerId === 'alice' && c.snap === 's1' && c.count === 20 && c.uri === 'spotify:playlist:o1' && typeof c.at === 'number', m);
      check('4 watch ends', store.getItem('lib-copy-watch') === null);
      check('4 refresh sent only reads', tab.calls.length > 0 && tab.calls.every(function (x) { return x.method === 'GET'; }), tab.calls.map(function (x) { return x.method + ' ' + x.path; }));
      check('4 open original: copy box gone, note says You have a copy with Open your copy and Unlink',
        !boxShown(tab) && /You have a copy/.test(noteText(tab)) && !!btn(noteEl(tab), 'Open your copy') && !!btn(noteEl(tab), 'Unlink'), noteText(tab));
      return diagText(tab);
    }).then(function (txt) {
      check('4 Diagnostics counts the link and stops watching', copiesLine(txt) === 'Playlist copies linked: 1', copiesLine(txt));
      closeDiag(tab);
      tab.t().closeDetail();
      tab.t().setFilter('playlists');
      return H.wait(60);
    }).then(function () {
      check('4 rows: original says You have a copy, copy says Copy, others unchanged',
        / · You have a copy$/.test(rowSub(tab, 'Road Trip') || '') && / · Copy$/.test(rowSub(tab, '  road   TRIP ') || '') &&
        !/copy/i.test(rowSub(tab, 'My Mix') || 'x') && !/copy/i.test(rowSub(tab, 'Shared Jams') || 'x'),
        [rowSub(tab, 'Road Trip'), rowSub(tab, '  road   TRIP '), rowSub(tab, 'My Mix'), rowSub(tab, 'Shared Jams')]);
      var cache = store.getItem('lib-cache') || '';
      check('4 row labels are never stored in the library cache', cache.length > 0 && cache.indexOf('You have a copy') === -1 && cache.indexOf(' · Copy') === -1);
      return open(tab, 'o1');
    }).then(function () {
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'Open your copy'));
      return H.wait(60);
    }).then(function () {
      check('4 Open your copy opens the copy and lists its songs', tab.t().state.detail.item.id === 'c1' && reqs(tab, 'GET', '/playlists/c1/items').length === 1 && !boxShown(tab), tab.calls);
      check('4 copy says Copy of … by … with Open original and Unlink, no change note',
        /Copy of “Road Trip” by Alice/.test(noteText(tab)) && !!btn(noteEl(tab), 'Open original') && !!btn(noteEl(tab), 'Unlink') && !/has changed/.test(noteText(tab)), noteText(tab));
      click(tab, btn(noteEl(tab), 'Open original'));
      return H.wait(60);
    }).then(function () {
      check('4 Open original opens the original', tab.t().state.detail.item.id === 'o1' && /You have a copy/.test(noteText(tab)), noteText(tab));
      check('4 opening both sides sent only reads', tab.calls.every(function (x) { return x.method === 'GET'; }), tab.calls);
    });
  });
});

// 5. The original changed since you copied it; renames; an original you no longer follow.
tests.push(function () {
  var store = H.seedStore();
  seedLink(store, 'o1', 'c1');
  var pls = basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R', { total: 20 })]);
  function setO1(p) { return function (x) { return x.id === 'o1' ? p : x; }; }
  return setup(store, { playlists: pls }).then(function (tab) {
    check('5 a stored link to a copy you own survives the first refresh', (linkOf(store, 'o1') || {}).copyId === 'c1', store.getItem('lib-pl-copies'));
    return open(tab, 'c1').then(function () {
      check('5 same snapshot: no change note', /Copy of “Road Trip”/.test(noteText(tab)) && !/has changed/.test(noteText(tab)), noteText(tab));
      tab.env.playlists = tab.env.playlists.map(setO1(pl('o1', 'Road Trip 2026', 'alice', 'Alice B', { snap: 's2', total: 20 })));
      return refresh(tab);
    }).then(function () {
      var c = linkOf(store, 'o1');
      check('5 new snapshot: change note on the open copy', /The original has changed since you copied it\./.test(noteText(tab)), noteText(tab));
      check('5 rename and owner name follow the original; baseline snapshot and count stay',
        c.name === 'Road Trip 2026' && c.ownerName === 'Alice B' && c.snap === 's1' && c.count === 20 && /Copy of “Road Trip 2026” by Alice B/.test(noteText(tab)), [c, noteText(tab)]);
      seedLink(store, 'o1', 'c1', { snap: '', count: 20 });   // no snapshot known on either side: the song count decides
      tab.env.playlists = tab.env.playlists.map(setO1(pl('o1', 'Road Trip', 'alice', 'Alice', { total: 25 })));
      return refresh(tab);
    }).then(function () {
      check('5 no snapshot, new song count: change note', /has changed/.test(noteText(tab)), noteText(tab));
      tab.env.playlists = tab.env.playlists.map(setO1(pl('o1', 'Road Trip', 'alice', 'Alice', { total: 20 })));
      return refresh(tab);
    }).then(function () {
      check('5 no snapshot, same count: no change note', /Copy of/.test(noteText(tab)) && !/has changed/.test(noteText(tab)), noteText(tab));
      tab.env.playlists = tab.env.playlists.filter(function (p) { return p.id !== 'o1'; });   // you unfollow the original
      return refresh(tab);
    }).then(function () {
      check('5 unfollowed original: link kept, no change note', (linkOf(store, 'o1') || {}).copyId === 'c1' && /Copy of/.test(noteText(tab)) && !/has changed/.test(noteText(tab)), noteText(tab));
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'Open original'));
      return H.wait(60);
    }).then(function () {
      var it = tab.t().state.detail.item;
      check('5 Open original rebuilds the original from the link', it.id === 'o1' && it.kind === 'playlist' && it.url === 'https://open.spotify.com/playlist/o1' && it.ownerName === 'Alice' && it.uri === 'spotify:playlist:o1', it);
      check('5 the rebuilt original says You have a copy, asking nothing about it', /You have a copy/.test(noteText(tab)) && !boxShown(tab) && reqs(tab, 'GET', /^\/playlists\/o1/).length === 0 && tab.calls.every(function (x) { return x.method === 'GET'; }), [noteText(tab), tab.calls]);
    });
  });
});

// 6. A deleted copy (or one that's no longer yours): Refresh drops the link and Make a copy comes back.
tests.push(function () {
  var store = H.seedStore();
  seedLink(store, 'o1', 'c1');
  var pls = basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]);
  return setup(store, { playlists: pls }).then(function (tab) {
    return open(tab, 'o1').then(function () {
      check('6 linked original: no copy box', !boxShown(tab) && /You have a copy/.test(noteText(tab)));
      tab.env.playlists = tab.env.playlists.filter(function (p) { return p.id !== 'c1'; });
      return refresh(tab);
    }).then(function () {
      check('6 deleted copy: link dropped quietly', JSON.stringify(stored(store, 'lib-pl-copies')) === '{}' && tab.toasts().length === 0, [store.getItem('lib-pl-copies'), tab.toasts()]);
      check('6 deleted copy: Make a copy back on the open view, note cleared', boxShown(tab) && !!btn(box(tab), 'Make a copy') && !/copy/i.test(noteText(tab)), noteText(tab));
      tab.t().closeDetail();
      tab.t().setFilter('playlists');
      return H.wait(60);
    }).then(function () {
      check('6 deleted copy: row label gone', !/copy/i.test(rowSub(tab, 'Road Trip') || 'x'), rowSub(tab, 'Road Trip'));
    });
  });
});
tests.push(function () {
  var store = H.seedStore();
  seedLink(store, 'o1', 'c1');
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', 'zed', 'Zed')]) }).then(function () {
    check('6 link to a playlist you don\'t own is dropped on refresh', JSON.stringify(stored(store, 'lib-pl-copies')) === '{}', store.getItem('lib-pl-copies'));
  });
});

// 7. Two playlists with the name: no guess. The copy's view asks, Link it / No.
tests.push(function () {
  var store = H.seedStore();
  var linkBtn;
  return setup(store).then(function (tab) {
    return open(tab, 'o1').then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      addPl(tab, pl('c1', 'Road Trip', ME, 'R'));
      addPl(tab, pl('c2', 'road trip', ME, 'R'));
      return refresh(tab);
    }).then(function () {
      check('7 two matches: nothing linked, no toast, watch kept', !linkOf(store, 'o1') && tab.toasts().length === 0 && watchOrig(store) === 'o1', [store.getItem('lib-pl-copies'), tab.toasts()]);
      return open(tab, 'm1');
    }).then(function () {
      var mine = asks(tab);
      return open(tab, 'o2').then(function () { check('7 a playlist you had before, or someone else\'s: no question', !mine && !asks(tab)); });
    }).then(function () { return open(tab, 'c2'); }).then(function () {
      check('7 a new playlist of yours asks, with Link it and No', /Is this your copy of “Road Trip”\?/.test(noteText(tab)) && !!btn(noteEl(tab), 'Link it') && !!btn(noteEl(tab), 'No'), noteText(tab));
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'No'));
      check('7 No: question gone, remembered in the watch, nothing linked, nothing sent',
        !asks(tab) && ((stored(store, 'lib-copy-watch') || {}).known || []).indexOf('c2') !== -1 && !linkOf(store, 'o1') && tab.calls.length === 0, stored(store, 'lib-copy-watch'));
      return open(tab, 'c2');
    }).then(function () {
      var stuck = !asks(tab);
      return open(tab, 'c1').then(function () { check('7 No sticks on reopening; the other one still asks', stuck && asks(tab)); });
    }).then(function () {
      tab.calls.length = 0;
      linkBtn = btn(noteEl(tab), 'Link it');
      click(tab, linkBtn);
      var c = linkOf(store, 'o1') || {};
      check('7 Link it links with the watch\'s baseline and ends the watch', c.copyId === 'c1' && c.name === 'Road Trip' && c.snap === 's1' && store.getItem('lib-copy-watch') === null, c);
      check('7 Link it: one toast, view says Copy of, focus on Open original',
        linkedToasts(tab).length === 1 && /Copy of “Road Trip” by Alice/.test(noteText(tab)) && d(tab).activeElement && d(tab).activeElement.textContent === 'Open original', [tab.toasts(), noteText(tab)]);
      click(tab, linkBtn);   // double tap on the old button
      check('7 double tap: still one toast and one link, nothing sent', linkedToasts(tab).length === 1 && Object.keys(stored(store, 'lib-pl-copies')).length === 1 && linkOf(store, 'o1').copyId === 'c1' && tab.calls.length === 0, [tab.toasts(), tab.calls]);
      return open(tab, 'c2');
    }).then(function () {
      check('7 after linking nobody else asks', !asks(tab), noteText(tab));
    });
  });
});

// 8. A same-name playlist you already had isn't taken for the copy; the original never links to itself.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('m2', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    return open(tab, 'o1').then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      return refresh(tab);
    }).then(function () {
      check('8 older same-name playlist: known to the watch, not linked, watch kept', ((stored(store, 'lib-copy-watch') || {}).known || []).indexOf('m2') !== -1 && store.getItem('lib-pl-copies') === null && watchOrig(store) === 'o1', [store.getItem('lib-copy-watch'), store.getItem('lib-pl-copies')]);
      return open(tab, 'm2');
    }).then(function () {
      check('8 older same-name playlist: no question', !asks(tab), noteText(tab));
      tab.env.playlists = tab.env.playlists.map(function (p) { return p.id === 'o1' ? pl('o1', 'Road Trip', ME, 'R') : p; });   // the original becomes yours
      return refresh(tab);
    }).then(function () {
      check('8 the original is never linked to itself', !linkOf(store, 'o1'), store.getItem('lib-pl-copies'));
    });
  });
});

// 9. The watch lasts 24 hours; a watch made before the library was known asks instead of guessing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    seedWatch(store, { at: Date.now() - 25 * HOUR, known: ['m1'] });
    return refresh(tab).then(function () {
      check('9 25-hour-old watch: reads as none, no link, no toast', tab.t().readCopyWatch() === null && store.getItem('lib-pl-copies') === null && tab.toasts().length === 0, tab.toasts());
      return open(tab, 'c1');
    }).then(function () {
      var noAsk = !asks(tab);
      return diagText(tab).then(function (txt) { check('9 old watch: no question, Diagnostics not watching', noAsk && copiesLine(txt) === 'Playlist copies linked: 0', copiesLine(txt)); });
    }).then(function () {
      closeDiag(tab);
      var bad = [];
      seedWatch(store, { at: Date.now() + HOUR }); if (tab.t().readCopyWatch() !== null) bad.push('future');
      seedWatch(store, { known: 'm1' }); if (tab.t().readCopyWatch() !== null) bad.push('known string');
      seedWatch(store, { origId: 5 }); if (tab.t().readCopyWatch() !== null) bad.push('bad id');
      check('9 watch from the future, with a broken known list or a bad id reads as none', bad.length === 0, bad);
      seedWatch(store, { at: Date.now() - 23 * HOUR, known: null });
      check('9 23-hour-old watch still counts', !!tab.t().readCopyWatch());
      return refresh(tab);
    }).then(function () {
      check('9 known unknown: refresh doesn\'t guess', store.getItem('lib-pl-copies') === null && watchOrig(store) === 'o1', [store.getItem('lib-pl-copies'), store.getItem('lib-copy-watch')]);
      return open(tab, 'm1');
    }).then(function () {
      var asked = /Is this your copy of “Road Trip”/.test(noteText(tab));
      click(tab, btn(noteEl(tab), 'No'));
      var w = stored(store, 'lib-copy-watch') || {};
      check('9 known unknown: any playlist of yours asks; No goes to the no list', asked && w.known === null && JSON.stringify(w.no) === '["m1"]' && !asks(tab), w);
      return open(tab, 'c1');
    }).then(function () {
      var asked = asks(tab);
      click(tab, btn(noteEl(tab), 'Link it'));
      var c = linkOf(store, 'o1') || {};
      check('9 known unknown: the next one asks and Link it links with the watch\'s details', asked && c.copyId === 'c1' && c.ownerName === 'Alice' && c.count === 20, c);
    });
  });
});

// 9b. Link it after the watch ended elsewhere (another tab, or it expired): no link, the question goes.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    seedWatch(store, { known: ['m1'] });
    return open(tab, 'c1').then(function () {
      var b = btn(noteEl(tab), 'Link it');
      store.removeItem('lib-copy-watch');
      click(tab, b);
      check('9b ended watch: Link it links nothing, no toast, question redrawn away', !!b && store.getItem('lib-pl-copies') === null && tab.toasts().length === 0 && !asks(tab), [tab.toasts(), noteText(tab)]);
    });
  });
});

// 10. One copy links to one original: a newer link replaces the older one.
tests.push(function () {
  var store = H.seedStore();
  seedLink(store, 'o1', 'c1');
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Morning', ME, 'R')]) }).then(function (tab) {
    seedWatch(store, { origId: 'o3', name: 'Morning', known: ['m1'], ownerName: '', ownerId: 'carol', uri: 'spotify:playlist:o3', snap: '', count: 3 });
    return refresh(tab).then(function () {
      var m = stored(store, 'lib-pl-copies') || {};
      check('10 newer link replaces the older one, with a toast', Object.keys(m).join(',') === 'o3' && m.o3.copyId === 'c1' && tab.toasts().indexOf('Linked your copy of “Morning”.') !== -1, [m, tab.toasts()]);
      return open(tab, 'c1');
    }).then(function () {
      check('10 copy of a playlist with no owner name says just Copy of', /Copy of “Morning”/.test(noteText(tab)) && !/ by /.test(noteText(tab)), noteText(tab));
      return open(tab, 'o1');
    }).then(function () {
      check('10 the old original offers Make a copy again', boxShown(tab) && !/You have a copy/.test(noteText(tab)));
    });
  });
});

// 11. At most 50 links: the oldest goes.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    var m = {};
    for (var i = 0; i < 50; i++) m['k' + i] = { copyId: 'x' + i, name: 'P' + i, at: 1000 + i };
    store.setItem('lib-pl-copies', JSON.stringify(m));
    seedWatch(store, { known: ['m1'] });
    return open(tab, 'c1').then(function () {
      click(tab, btn(noteEl(tab), 'Link it'));
      var mm = stored(store, 'lib-pl-copies') || {};
      check('11 the 51st link keeps 50: the oldest dropped, the new one kept', Object.keys(mm).length === 50 && !mm.k0 && !!mm.k1 && (mm.o1 || {}).copyId === 'c1', Object.keys(mm).length);
    });
  });
});

// 12. Bad stored data is ignored, and the page still works.
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-pl-copies', JSON.stringify({ o1: { copyId: 'o1' }, o2: null, o3: { copyId: 5 }, o4: 'x', ok: { copyId: 'c1', name: 'Road Trip', at: 1 } }));
  store.setItem('lib-copy-watch', '{broken');
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    check('12 only the well-formed link is read; a broken watch reads as none', Object.keys(tab.t().readCopies()).join(',') === 'ok' && tab.t().readCopyWatch() === null, tab.t().readCopies());
    return open(tab, 'o1').then(function () {
      check('12 a link to itself doesn\'t hide Make a copy', boxShown(tab) && !!btn(box(tab), 'Make a copy'));
      return diagText(tab);
    }).then(function (txt) {
      check('12 Diagnostics counts one link', copiesLine(txt) === 'Playlist copies linked: 1', copiesLine(txt));
      closeDiag(tab);
      store.setItem('lib-pl-copies', '[1,2,3]');
      var list = JSON.stringify(tab.t().readCopies());
      store.setItem('lib-pl-copies', '{oops');
      check('12 a list, or unreadable text, reads as no links', list === '{}' && JSON.stringify(tab.t().readCopies()) === '{}', list);
      return open(tab, 'c1');
    }).then(function () {
      check('12 unreadable links: the copy view still draws', tab.t().state.detail.item.id === 'c1' && !/Copy of/.test(noteText(tab)));
    });
  });
});

// 13. Blocked storage: the steps still show, and nothing claims a link it couldn't keep.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    seedWatch(store, { known: ['m1'] });
    var real = store.setItem, errs = [];
    tab.w.addEventListener('error', function (e) { errs.push(String(e.message)); });
    store.setItem = function () { throw new Error('QuotaExceededError'); };
    return open(tab, 'o3').then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      check('13 blocked storage: steps still show (the stored watch can\'t change)', steps(tab).length === 5 && watchOrig(store) === 'o1');
      return open(tab, 'c1');
    }).then(function () {
      var b = btn(noteEl(tab), 'Link it');
      click(tab, b);
      check('13 blocked storage: Link it stores nothing and shows no "Linked" toast', !!b && store.getItem('lib-pl-copies') === null && linkedToasts(tab).length === 0, tab.toasts());
      return refresh(tab);
    }).then(function () {
      check('13 blocked storage: refresh claims no link either, and no page errors', linkedToasts(tab).length === 0 && errs.length === 0, [tab.toasts(), errs]);
      store.setItem = real;
    });
  });
});

// 14. Cool-offs: Make a copy and Link it need no requests; a paused, rate-limited or failed refresh links nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    var cool = {}, until = Date.now() + 10 * 60e3;
    ['player', 'library', 'search', 'catalog'].forEach(function (g) { cool[g] = { until: until, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: '600', last429: null }; });
    store.setItem('lib-cooloff', JSON.stringify(cool));
    return open(tab, 'o1').then(function () {
      tab.calls.length = 0;
      click(tab, btn(box(tab), 'Make a copy'));
      check('14 everything paused: Make a copy shows the steps and stores the watch, sending nothing', steps(tab).length === 5 && watchOrig(store) === 'o1' && tab.calls.length === 0, tab.calls);
      addPl(tab, pl('c2', 'Road Trip', ME, 'R'));
      return refresh(tab);
    }).then(function () {
      check('14 paused refresh: sends nothing, links nothing, keeps the watch', tab.calls.length === 0 && store.getItem('lib-pl-copies') === null && watchOrig(store) === 'o1', tab.calls);
      store.setItem('lib-copy-watch', JSON.stringify(Object.assign(stored(store, 'lib-copy-watch'), { known: null })));
      return open(tab, 'c1');
    }).then(function () {
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'Link it'));
      check('14 paused: Link it links and toasts, sending nothing', (linkOf(store, 'o1') || {}).copyId === 'c1' && linkedToasts(tab).length === 1 && tab.calls.length === 0, tab.calls);
    });
  });
});
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    return open(tab, 'o1').then(function () {
      click(tab, btn(box(tab), 'Make a copy'));
      addPl(tab, pl('c1', 'Road Trip', ME, 'R'));
      tab.env.plFail = { status: 429, json: { error: { status: 429, message: 'rate limit' } }, headers: { 'retry-after': '30' } };
      return refresh(tab);
    }).then(function () {
      check('14 429 on refresh: library paused, nothing linked, no toast, watch and steps kept',
        !!((stored(store, 'lib-cooloff') || {}).library || {}).until && store.getItem('lib-pl-copies') === null && linkedToasts(tab).length === 0 && watchOrig(store) === 'o1' && steps(tab).length === 5,
        [store.getItem('lib-cooloff'), tab.toasts()]);
      store.setItem('lib-cooloff', '{}');
      tab.env.plFail = { status: 500, json: { error: { status: 500, message: 'Server error' } } };
      tab.w.__toasts = [];
      return refresh(tab);
    }).then(function () {
      check('14 500 on refresh: error toast, nothing linked, watch kept', tab.toasts().some(function (x) { return /^Couldn’t refresh/.test(x); }) && store.getItem('lib-pl-copies') === null && watchOrig(store) === 'o1', tab.toasts());
      tab.env.plFail = null;
      return refresh(tab);
    }).then(function () {
      check('14 the next good refresh links', (linkOf(store, 'o1') || {}).copyId === 'c1', store.getItem('lib-pl-copies'));
    });
  });
});

// 15. Unlink, from either side; Open your copy after the copy vanished.
tests.push(function () {
  var store = H.seedStore();
  seedLink(store, 'o1', 'c1');
  return setup(store, { playlists: basePlaylists().concat([pl('c1', 'Road Trip', ME, 'R')]) }).then(function (tab) {
    return open(tab, 'o1').then(function () {
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'Unlink'));
      var a = d(tab).activeElement;
      check('15 Unlink on the original: link removed, nothing sent', JSON.stringify(stored(store, 'lib-pl-copies')) === '{}' && tab.calls.length === 0, [store.getItem('lib-pl-copies'), tab.calls]);
      check('15 Unlink on the original: note cleared, Make a copy back with focus', boxShown(tab) && !/copy/i.test(noteText(tab)) && !!a && a.textContent === 'Make a copy', a && a.textContent);
      seedLink(store, 'o1', 'c1');
      return open(tab, 'c1');
    }).then(function () {
      tab.calls.length = 0;
      click(tab, btn(noteEl(tab), 'Unlink'));
      check('15 Unlink on the copy: link removed, note cleared, nothing sent', JSON.stringify(stored(store, 'lib-pl-copies')) === '{}' && !/Copy of/.test(noteText(tab)) && tab.calls.length === 0, noteText(tab));
      seedLink(store, 'o1', 'c1');
      return open(tab, 'o1');
    }).then(function () {
      var b = btn(noteEl(tab), 'Open your copy'), st = tab.t().state;
      st.data.playlists = st.data.playlists.filter(function (p) { return p.id !== 'c1'; });   // the copy left the library meanwhile
      click(tab, b);
      check('15 Open your copy after the copy vanished: stays on the original, Make a copy comes back', !!b && st.detail.item.id === 'o1' && boxShown(tab) && !/You have a copy/.test(noteText(tab)), noteText(tab));
    });
  });
});

// 16. Two tabs sharing storage: Make a copy in one, the other's refresh links it, the first shows it on its refresh.
tests.push(function () {
  var store = H.seedStore();
  var pls = basePlaylists(), tabA;
  return setup(store, { playlists: pls }).then(function (a) {
    tabA = a;
    return open(tabA, 'o1');
  }).then(function () {
    click(tabA, btn(box(tabA), 'Make a copy'));
    return setup(store, { playlists: pls.concat([pl('c9', 'Road Trip', ME, 'R')]) });
  }).then(function () {
    check('16 the other tab links the copy on its first refresh', (linkOf(store, 'o1') || {}).copyId === 'c9', store.getItem('lib-pl-copies'));
    addPl(tabA, pl('c9', 'Road Trip', ME, 'R'));
    return refresh(tabA);
  }).then(function () {
    check('16 the first tab shows You have a copy after its refresh', /You have a copy/.test(noteText(tabA)) && !boxShown(tabA), noteText(tabA));
  });
});

function summary() {
  var writes = ALL_CALLS.filter(function (c) { return c.method !== 'GET'; });
  check('99 no write request was ever sent (no create, add, change or delete)', writes.length === 0, writes.map(function (c) { return c.method + ' ' + c.path; }));
  check('99 the copied (someone else\'s) playlists were never requested', !ALL_CALLS.some(function (c) { return /^\/playlists\/(o1|o3|x9)(\/|$)/.test(c.path); }), ALL_CALLS.filter(function (c) { return /^\/playlists\/o/.test(c.path); }).map(function (c) { return c.path; }));
  check('99 no /users/{id} request', !ALL_CALLS.some(function (c) { return /^\/users\//.test(c.path); }));
  results.forEach(function (r) { console.log(r); });
  var p = results.filter(function (r) { return r.indexOf('PASS') === 0; }).length;
  console.log('\n' + p + '/' + results.length + ' passed');
  process.exit(p === results.length ? 0 : 1);
}

tests.reduce(function (pr, fn, i) {
  return pr.then(fn).catch(function (e) { results.push('ERROR test ' + (i + 1) + ': ' + (e && e.stack || e)); });
}, Promise.resolve()).then(summary);
