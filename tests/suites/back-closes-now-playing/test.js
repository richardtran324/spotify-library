'use strict';
// NAV-2 tests: Back (the button or the edge swipe) closes Now Playing, not the list under it.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var STEP = 150;   // ms for a history traversal to land (jsdom: usually under 30 ms, slower when the page is busy)
var BASE = 'https://richardtran324.github.io/spotify-library/';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function art(id, name) { return { id: id, name: name, uri: 'spotify:artist:' + id, type: 'artist' }; }
function track() {
  return { type: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song One', duration_ms: 200000,
    album: { id: 'alb1', name: 'Big Album', uri: 'spotify:album:alb1', images: [], artists: [art('new1', 'New Artist')] },
    artists: [art('new1', 'New Artist')] };
}
function playerFor(item) {
  return { item: item, currently_playing_type: item.type, context: { type: 'album', uri: 'spotify:album:alb1' }, is_playing: true,
    progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function album(id, name) {
  return { kind: 'album', id: id, uri: 'spotify:album:' + id, name: name, url: 'https://open.spotify.com/album/' + id, img: '', sub: 'Album · New Artist' };
}
var ALB2 = album('alb2', 'Other Album');
var ALB3 = album('alb3', 'Third Album');
var LIKED = { kind: 'liked', id: 'liked', uri: 'spotify:collection', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks', img: '', sub: 'Playlist' };

function routes(env) {
  return function (method, path) {
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
    var m = /^\/artists\/([^/]+)$/.exec(path);
    if (m) return { status: 200, json: { id: m[1], name: 'Artist ' + m[1], images: [] } };
    if (/^\/artists\/[^/]+\/albums$/.test(path)) return { status: 200, json: { items: [], next: null, total: 0 } };
    if (/^\/albums\/[^/]+\/tracks$/.test(path)) return { status: 200, json: { items: [{ id: 'tt1', uri: 'spotify:track:tt1', name: 'Track', type: 'track', track_number: 1, duration_ms: 1000, artists: [art('new1', 'New Artist')] }], next: null, total: 1 } };
  };
}
// Wraps history so every call the page makes is recorded; tab.nav(-1) etc. go through the originals (not recorded).
function spyHistory(tab) {
  var h = tab.w.history, orig = {};
  tab.hlog = [];
  ['back', 'go', 'forward', 'pushState', 'replaceState'].forEach(function (k) {
    orig[k] = h[k];
    h[k] = function () {
      tab.hlog.push(k === 'go' ? 'go(' + arguments[0] + ')' : k === 'pushState' || k === 'replaceState' ? k + ':' + JSON.stringify(arguments[0]) : k);
      return orig[k].apply(h, arguments);
    };
  });
  tab.nav = function (delta) { orig.go.call(h, delta); return H.wait(STEP); };
  tab.orig = orig;
}
function setup(opts) {
  opts = opts || {};
  var env = { player: opts.noPlayer ? null : playerFor(track()) };
  var tab = H.makeTab(opts.store || H.seedStore(), routes(env), opts.tabOpts);
  tab.env = env;
  return H.wait(opts.startWait || 500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    if (env.player) { t.setPlayer(JSON.parse(JSON.stringify(env.player))); t.state.playerAt = Date.now(); }
    spyHistory(tab);
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function npOpen(tab) { return !d(tab).getElementById('np').hidden; }
function hs(tab) { return tab.w.history.state; }
function onNp(tab) { var s = hs(tab); return !!(s && s.np); }
function hash(tab) { return tab.w.location.hash; }
function depthOf(tab) { var st = tab.t().state; return st.detail ? st.detailStack.length + 1 : 0; }
function viewName(tab) { var st = tab.t().state; return st.detail ? st.detail.item.name : null; }
function backs(tab) { return tab.hlog.filter(function (x) { return x === 'back' || /^go\(/.test(x); }); }
function pushes(tab) { return tab.hlog.filter(function (x) { return /^pushState/.test(x); }); }
function npBtn(tab, re) { return [].slice.call(d(tab).querySelectorAll('#npOpts button')).filter(function (b) { return re.test(b.textContent); })[0]; }
function snap(tab) { return { np: npOpen(tab), view: viewName(tab), depth: depthOf(tab), hash: hash(tab), state: hs(tab), len: tab.w.history.length, log: tab.hlog.slice() }; }
function touch(tab, type, x, y) {
  var e = new tab.w.Event(type, { bubbles: true });
  var pt = [{ clientX: x, clientY: y }];
  e.touches = type === 'touchend' ? [] : pt;
  e.changedTouches = pt;
  d(tab).getElementById('np').dispatchEvent(e);
}

var tests = [];

// 1. Back with Now Playing over an album closes Now Playing; the album stays. A second Back closes the album.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    var len0 = tab.w.history.length;
    t.openNp();
    check('1 Now Playing open', npOpen(tab));
    check('1 its own entry at the album\'s depth and address', onNp(tab) && hs(tab).depth === 1 && hash(tab) === '#detail' && tab.w.history.length === len0 + 1, snap(tab));
    tab.hlog.length = 0;
    return tab.nav(-1).then(function () {
      check('1 Back closes Now Playing', !npOpen(tab), snap(tab));
      check('1 the album is still open, address #detail', viewName(tab) === 'Other Album' && hash(tab) === '#detail' && hs(tab).depth === 1, snap(tab));
      check('1 popstate made no history call of its own', tab.hlog.length === 0, tab.hlog);
      check('1 focus back on the player bar', d(tab).activeElement === d(tab).getElementById('pInfo'), d(tab).activeElement && d(tab).activeElement.id);
      return tab.nav(-1);
    }).then(function () {
      check('1 second Back closes the album', viewName(tab) === null && hash(tab) === '', snap(tab));
      tab.w.close();
    });
  });
});

// 2. On the library itself: Back closes Now Playing and stays on the page.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var url0 = tab.w.location.href, len0 = tab.w.history.length;
    t.openNp();
    check('2 entry at depth 0, same address', onNp(tab) && hs(tab).depth === 0 && tab.w.location.href === url0 && tab.w.history.length === len0 + 1, snap(tab));
    return tab.nav(-1).then(function () {
      check('2 Back closes Now Playing, library still shown', !npOpen(tab) && viewName(tab) === null && tab.w.location.href === url0 && !onNp(tab), snap(tab));
      tab.w.close();
    });
  });
});

// 3–5. The X button, swipe down and Escape hide Now Playing at once, then step back once; one Back then closes the album.
function closeCase(n, label, act) {
  tests.push(function () {
    return setup().then(function (tab) {
      var t = tab.t();
      t.openDetail(ALB2);
      var len0 = tab.w.history.length;
      t.openNp();
      tab.hlog.length = 0;
      act(tab);
      check(n + ' ' + label + ': hidden at once', !npOpen(tab), snap(tab));
      check(n + ' ' + label + ': exactly one Back, in the same moment', backs(tab).length === 1 && backs(tab)[0] === 'back' && pushes(tab).length === 0, tab.hlog);
      return H.wait(STEP).then(function () {
        check(n + ' ' + label + ': album still open on its own entry', viewName(tab) === 'Other Album' && hash(tab) === '#detail' && !onNp(tab) && hs(tab).depth === 1, snap(tab));
        check(n + ' ' + label + ': popstate added nothing', tab.hlog.length === 1, tab.hlog);
        return tab.nav(-1);
      }).then(function () {
        check(n + ' ' + label + ': next Back closes the album (no dead Back)', viewName(tab) === null && hash(tab) === '', snap(tab));
        check(n + ' ' + label + ': history length bounded', tab.w.history.length === len0 + 1, { len: tab.w.history.length, len0: len0 });
        tab.w.close();
      });
    });
  });
}
closeCase(3, 'X button', function (tab) { click(tab, d(tab).getElementById('npClose')); });
closeCase(4, 'swipe down', function (tab) { touch(tab, 'touchstart', 100, 50); touch(tab, 'touchend', 105, 200); });
closeCase(5, 'Escape', function (tab) { d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

// 6. A sheet over Now Playing: Escape closes the sheet only, with no history call.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    t.openNp();
    t.openSheet(d(tab).getElementById('npDev'));
    tab.hlog.length = 0;
    d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('6 Escape closes the device sheet, Now Playing stays', d(tab).getElementById('sheet').hidden && npOpen(tab), snap(tab));
    check('6 no history call', tab.hlog.length === 0, tab.hlog);
    tab.w.close();
  });
});

// 7. Open album from Now Playing over the library: the Now Playing entry becomes the album's (no Back, no push).
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var len0 = tab.w.history.length;
    t.openNp();
    tab.hlog.length = 0;
    click(tab, npBtn(tab, /^Open album/));
    check('7 album open, Now Playing closed', !npOpen(tab) && viewName(tab) === 'Big Album', snap(tab));
    check('7 replaceState only, depth 1', backs(tab).length === 0 && pushes(tab).length === 0 && tab.hlog.length === 1 && /^replaceState:\{"detail":true,"depth":1\}/.test(tab.hlog[0]), tab.hlog);
    check('7 one entry more than before Now Playing, address #detail', tab.w.history.length === len0 + 1 && hash(tab) === '#detail' && !onNp(tab), snap(tab));
    return tab.nav(-1).then(function () {
      check('7 one Back returns to the library', viewName(tab) === null && hash(tab) === '' && !npOpen(tab), snap(tab));
      tab.w.close();
    });
  });
});

// 8. Open album from Now Playing over another album: the list is replaced, one Back steps off the entry, no push.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    var len0 = tab.w.history.length;
    t.openNp();
    tab.hlog.length = 0;
    click(tab, npBtn(tab, /^Open album/));
    check('8 album replaced right away', viewName(tab) === 'Big Album' && depthOf(tab) === 1 && !npOpen(tab), snap(tab));
    check('8 one Back, no push', backs(tab).length === 1 && backs(tab)[0] === 'back' && pushes(tab).length === 0, tab.hlog);
    return H.wait(STEP).then(function () {
      check('8 on the list\'s entry, depth 1', !onNp(tab) && hs(tab).depth === 1 && hash(tab) === '#detail' && viewName(tab) === 'Big Album', snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('8 one Back returns to the library', viewName(tab) === null && hash(tab) === '', snap(tab));
      check('8 length bounded', tab.w.history.length === len0 + 1, tab.w.history.length);
      tab.w.close();
    });
  });
});

// 9. Open album from Now Playing over an artist page: goes on top through the Now Playing entry (replaceState).
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(t.artistItem(art('zz9', 'Other Artist')));
    t.openNp();
    tab.hlog.length = 0;
    click(tab, npBtn(tab, /^Open album/));
    check('9 album on top of the artist', viewName(tab) === 'Big Album' && depthOf(tab) === 2 && t.state.detailStack[0].kind === 'artist', snap(tab));
    check('9 replaceState to depth 2 only', tab.hlog.length === 1 && /^replaceState:\{"detail":true,"depth":2\}/.test(tab.hlog[0]), tab.hlog);
    return tab.nav(-1).then(function () {
      check('9 Back returns to the artist', viewName(tab) === 'Artist zz9' || (t.state.detail && t.state.detail.kind === 'artist'), snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('9 next Back returns to the library', viewName(tab) === null, snap(tab));
      tab.w.close();
    });
  });
});

// 10. Open artist from Now Playing when the album was opened from that artist: one history.go(-2), never two Backs.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(t.artistItem(art('new1', 'New Artist')));
    t.openDetail(album('alb1', 'Big Album'), { push: true });
    var len0 = tab.w.history.length;
    t.openNp();
    tab.hlog.length = 0;
    click(tab, npBtn(tab, /^Open artist/));
    check('10 Now Playing hidden at once', !npOpen(tab), snap(tab));
    check('10 one go(-2) and nothing else', tab.hlog.length === 1 && tab.hlog[0] === 'go(-2)', tab.hlog);
    return H.wait(STEP).then(function () {
      check('10 back on the artist page, depth 1', t.state.detail && t.state.detail.kind === 'artist' && depthOf(tab) === 1 && hs(tab).depth === 1 && !onNp(tab), snap(tab));
      check('10 entries kept for Forward, nothing added', tab.w.history.length === len0 + 1, tab.w.history.length);
      return tab.nav(-1);
    }).then(function () {
      check('10 next Back returns to the library', viewName(tab) === null && hash(tab) === '', snap(tab));
      tab.w.close();
    });
  });
});

// 11. Open artist from Now Playing when that artist's page is already open: Now Playing closes with one Back.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(t.artistItem(art('new1', 'New Artist')));
    t.openNp();
    tab.hlog.length = 0;
    click(tab, npBtn(tab, /^Open artist/));
    check('11 one Back', tab.hlog.length === 1 && tab.hlog[0] === 'back', tab.hlog);
    return H.wait(STEP).then(function () {
      check('11 artist page stays, on its entry', !npOpen(tab) && t.state.detail.kind === 'artist' && depthOf(tab) === 1 && !onNp(tab) && hs(tab).depth === 1, snap(tab));
      tab.w.close();
    });
  });
});

// 12. A tap that opens a list right after X waits for the Back: one new entry, the right view.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    var len0 = tab.w.history.length;
    t.openNp();
    tab.hlog.length = 0;
    click(tab, d(tab).getElementById('npClose'));
    t.openDetail(ALB3, { push: true });   // as a tap on an artist or release in the list would
    check('12 held until popstate (nothing pushed yet)', viewName(tab) === 'Other Album' && pushes(tab).length === 0, snap(tab));
    return H.wait(STEP).then(function () {
      check('12 then opened on top of the album', viewName(tab) === 'Third Album' && depthOf(tab) === 2 && t.state.detailStack[0].item.name === 'Other Album', snap(tab));
      check('12 exactly one new entry, depth 2', pushes(tab).length === 1 && tab.w.history.length === len0 + 1 && hs(tab).depth === 2 && !onNp(tab), snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('12 Back returns to the album', viewName(tab) === 'Other Album' && depthOf(tab) === 1, snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('12 next Back returns to the library', viewName(tab) === null, snap(tab));
      tab.w.close();
    });
  });
});

// 13. Same from the library, and the 300 ms limit when no popstate comes.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var len0 = tab.w.history.length;
    t.openNp();
    click(tab, d(tab).getElementById('npClose'));
    t.openDetail(ALB2);
    return H.wait(STEP).then(function () {
      check('13 library: list opened after the Back, on its own entry', viewName(tab) === 'Other Album' && hs(tab).depth === 1 && hash(tab) === '#detail' && tab.w.history.length === len0 + 1, snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('13 one Back returns to the library', viewName(tab) === null && hash(tab) === '', snap(tab));
      // No popstate: Back does nothing (as when the browser drops it); the held tap still runs after 300 ms.
      t.openNp();
      tab.w.history.back = function () { tab.hlog.push('back(dropped)'); };
      click(tab, d(tab).getElementById('npClose'));
      t.openDetail(ALB3);
      check('13 held while waiting', viewName(tab) === null, snap(tab));
      return H.wait(150);
    }).then(function () {
      check('13 still held at 150 ms', viewName(tab) === null, snap(tab));
      return H.wait(250);
    }).then(function () {
      check('13 runs by 400 ms', viewName(tab) === 'Third Album', snap(tab));
      tab.w.close();
    });
  });
});

// 14. Tapping the player bar right after X: Now Playing reopens after the Back, with one entry.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    var len0 = tab.w.history.length;
    t.openNp();
    click(tab, d(tab).getElementById('npClose'));
    click(tab, d(tab).getElementById('pInfo'));
    return H.wait(STEP).then(function () {
      check('14 Now Playing open again on one entry', npOpen(tab) && onNp(tab) && hs(tab).depth === 1 && tab.w.history.length === len0 + 1, snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('14 Back closes it, album stays', !npOpen(tab) && viewName(tab) === 'Other Album', snap(tab));
      tab.w.close();
    });
  });
});

// 15. Five open/close cycles (X and Back in turn): history length stays bounded, the album stays.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    var len0 = tab.w.history.length;
    var p = Promise.resolve(), lens = [];
    for (var i = 0; i < 5; i++) {
      (function (i) {
        p = p.then(function () {
          t.openNp();
          if (i % 2) click(tab, d(tab).getElementById('npClose'));
          else return tab.nav(-1);
        }).then(function () { return H.wait(STEP); }).then(function () { lens.push(tab.w.history.length); });
      })(i);
    }
    return p.then(function () {
      check('15 length never above one extra entry', lens.every(function (n) { return n <= len0 + 1; }), { lens: lens, len0: len0 });
      check('15 album still open, Now Playing closed, on its entry', viewName(tab) === 'Other Album' && !npOpen(tab) && !onNp(tab) && hs(tab).depth === 1, snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('15 one Back closes the album', viewName(tab) === null, snap(tab));
      tab.w.close();
    });
  });
});

// 16. Open in Spotify leaves the entry (a Back would race the link); coming back to the page steps off it.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    t.openNp();
    tab.hlog.length = 0;
    var a = [].slice.call(d(tab).querySelectorAll('#npOpts a')).filter(function (x) { return x.textContent === 'Open in Spotify'; })[0];
    a.addEventListener('click', function (e) { e.preventDefault(); });   // jsdom: don't follow the link
    click(tab, a);
    check('16 Now Playing hidden, no history call', !npOpen(tab) && tab.hlog.length === 0 && onNp(tab), snap(tab));
    // Reopening while the entry is still there reuses it.
    t.openNp();
    check('16 reopening reuses the leftover entry', npOpen(tab) && pushes(tab).length === 0, snap(tab));
    click(tab, a);
    d(tab).dispatchEvent(new tab.w.Event('visibilitychange'));
    check('16 coming back steps off the entry once', backs(tab).length === 1, tab.hlog);
    return H.wait(STEP).then(function () {
      check('16 album still open on its entry', viewName(tab) === 'Other Album' && !onNp(tab) && hs(tab).depth === 1 && !npOpen(tab), snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('16 next Back closes the album', viewName(tab) === null, snap(tab));
      tab.w.close();
    });
  });
});

// 17. Forward into the Now Playing entry reopens it while something plays; with nothing playing it steps back off.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    t.openNp();
    return tab.nav(-1).then(function () {
      tab.hlog.length = 0;
      return tab.nav(1);
    }).then(function () {
      check('17 Forward reopens Now Playing, album under it', npOpen(tab) && onNp(tab) && viewName(tab) === 'Other Album', snap(tab));
      check('17 no entry added', pushes(tab).length === 0, tab.hlog);
      return tab.nav(-1);
    }).then(function () {
      check('17 Back closes it again', !npOpen(tab) && viewName(tab) === 'Other Album', snap(tab));
      t.state.player = null;
      tab.hlog.length = 0;
      return tab.nav(1);
    }).then(function () {
      return H.wait(STEP);
    }).then(function () {
      check('17 nothing playing: Forward steps back off it', !npOpen(tab) && !onNp(tab) && viewName(tab) === 'Other Album' && hs(tab).depth === 1, snap(tab));
      check('17 one Back issued', backs(tab).length === 1, tab.hlog);
      tab.w.close();
    });
  });
});

// 18. Closes the page makes itself: nothing playing any more, and sign-out.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(ALB2);
    t.openNp();
    tab.hlog.length = 0;
    t.state.player = null;
    t.paintPlayer();
    check('18 nothing playing: hidden, one Back', !npOpen(tab) && backs(tab).length === 1, snap(tab));
    return H.wait(STEP).then(function () {
      check('18 nothing playing: album still open on its entry', viewName(tab) === 'Other Album' && !onNp(tab) && hs(tab).depth === 1, snap(tab));
      tab.w.close();
    });
  }).then(function () {
    return setup();
  }).then(function (tab) {
    var t = tab.t();
    t.openNp();
    tab.hlog.length = 0;
    t.stopApp();
    check('18 sign-out: hidden, one Back', !npOpen(tab) && backs(tab).length === 1, tab.hlog);
    return H.wait(STEP).then(function () {
      check('18 sign-out: off the entry', !onNp(tab), snap(tab));
      tab.w.close();
    });
  });
});

// 19. A long-press Back over several entries closes Now Playing and the lists it passes.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.openDetail(t.artistItem(art('zz9', 'Other Artist')));
    t.openDetail(ALB2, { push: true });
    t.openNp();
    return tab.nav(-3).then(function () {
      check('19 Now Playing and both views closed', !npOpen(tab) && viewName(tab) === null && hash(tab) === '', snap(tab));
      tab.w.close();
    });
  });
});

// 20. Reload (#42 keep place) on the Now Playing entry: views come back on their own entries, no dead Back.
function placeFrom(build) {
  return setup().then(function (tab) {
    build(tab.t());
    tab.t().kpSave();
    var s = tab.w.sessionStorage.getItem('lib-place');
    tab.w.close();
    return s;
  });
}
function reloadTab(place, entries, store) {
  return setup({ store: store, tabOpts: { url: BASE, beforeParse: function (w) {
    if (place) w.sessionStorage.setItem('lib-place', place);
    entries.forEach(function (e, i) {
      if (i === 0) w.history.replaceState(e.state, '', e.url);
      else w.history.pushState(e.state, '', e.url);
    });
  } } });
}
tests.push(function () {
  return placeFrom(function (t) { t.openDetail(LIKED); }).then(function (place) {
    check('20 a place was saved', !!place && /Liked Songs/.test(place), place);
    return reloadTab(place, [
      { state: null, url: BASE },
      { state: { detail: true, depth: 1 }, url: BASE + '#detail' },
      { state: { np: 1, depth: 1 }, url: BASE + '#detail' }
    ]);
  }).then(function (tab) {
    check('20 Liked Songs back, Now Playing not showing', viewName(tab) === 'Liked Songs' && !npOpen(tab), snap(tab));
    check('20 stepped back onto the view\'s own entry', !onNp(tab) && hs(tab) && hs(tab).detail && hs(tab).depth === 1 && hash(tab) === '#detail', snap(tab));
    check('20 nothing pushed or replaced over the entries', tab.w.history.length === 3, tab.w.history.length);
    return tab.nav(-1).then(function () {
      check('20 one Back returns to the library (no dead Back)', viewName(tab) === null && hash(tab) === '', snap(tab));
      return tab.nav(1);
    }).then(function () {
      check('20 Forward to the closed view\'s entry: address put back in step, as before', viewName(tab) === null && hs(tab) === null && hash(tab) === '', snap(tab));
      return tab.nav(1);
    }).then(function () {
      return H.wait(STEP);
    }).then(function () {
      check('20 Forward into the old Now Playing entry: Now Playing reopens (something plays), entry in step', npOpen(tab) && onNp(tab) && hs(tab).depth === 0 && hash(tab) === '', snap(tab));
      return tab.nav(-1);
    }).then(function () {
      check('20 Back closes it again', !npOpen(tab) && viewName(tab) === null, snap(tab));
      tab.w.close();
    });
  });
});

// 21. Reload on a Now Playing entry over the library (depth 0): boot steps back off it.
tests.push(function () {
  return reloadTab(null, [
    { state: null, url: BASE },
    { state: { np: 1, depth: 0 }, url: BASE }
  ]).then(function (tab) {
    check('21 no view, Now Playing not showing, off the entry', viewName(tab) === null && !npOpen(tab) && !onNp(tab), snap(tab));
    tab.w.close();
  });
});

// 22. Reload where the saved views don't match the entries: the first view takes over the Now Playing entry.
tests.push(function () {
  return placeFrom(function (t) { t.openDetail(t.artistItem(art('zz9', 'Other Artist'))); t.openDetail(LIKED, { push: true }); }).then(function (place) {
    return reloadTab(place, [
      { state: null, url: BASE },
      { state: { detail: true, depth: 1 }, url: BASE + '#detail' },
      { state: { np: 1, depth: 1 }, url: BASE + '#detail' }
    ]);
  }).then(function (tab) {
    check('22 both views back', viewName(tab) === 'Liked Songs' && depthOf(tab) === 2, snap(tab));
    check('22 on the top view\'s entry, not Now Playing\'s', !onNp(tab) && hs(tab).depth === 2 && !npOpen(tab), snap(tab));
    return tab.nav(-1).then(function () {
      check('22 Back returns to the artist page', depthOf(tab) === 1 && tab.t().state.detail.kind === 'artist', snap(tab));
      tab.w.close();
    });
  });
});

var chain = Promise.resolve();
tests.forEach(function (f) { chain = chain.then(f).catch(function (e) { check('test threw', false, e && e.stack); }); });
chain.then(function () {
  results.forEach(function (r) { console.log(r); });
  var fail = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fail) + '/' + results.length + ' passed');
  process.exit(fail ? 1 : 0);
});
