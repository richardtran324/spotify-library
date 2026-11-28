'use strict';
// Keep changes made during a library load (v2.64): a follow, an unfollow or a playlist's song count changed
// while the library load is in flight (start-up or Refresh) stays after the load lands, in state.data and in
// the saved copy (lib-cache). jsdom, mocked fetch with delays. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var LOAD_MS = 3000;   // the slow part of the library load (GET /me/playlists)
function apiArtist(id, name) { return { id: id, name: name, uri: 'spotify:artist:' + id, type: 'artist', images: [], genres: [] }; }
function apiPlaylist(id, name, total) {
  return { id: id, name: name, uri: 'spotify:playlist:' + id, images: [], owner: { id: 'me1', display_name: 'R' },
    collaborative: false, snapshot_id: 'snap-' + id, items: { total: total } };
}
var OLD = apiArtist('x1', 'Old Fave'), OLD2 = apiArtist('x2', 'Second Fave');
var NEW = { id: 'n1', name: 'New Artist', uri: 'spotify:artist:n1' };
function copy(o) { return JSON.parse(JSON.stringify(o)); }

// opts.following: what GET /me/following answers (a copy is taken when the request is sent, so a later PUT
// isn't in an answer already on its way); opts.stateful: PUT/DELETE /me/library change that list.
// env.slow: delay of GET /me/playlists; env.failPlaylists: answer it with 500.
function setup(opts) {
  opts = opts || {};
  var s = H.seedStore();
  var tk = JSON.parse(s.getItem('lib-token'));
  tk.scope += ' user-follow-modify playlist-modify-private';
  s.setItem('lib-token', JSON.stringify(tk));
  var env = { following: (opts.following || [OLD]).slice(), playlists: opts.playlists || [apiPlaylist('p1', 'Mine', 10)],
    slow: opts.slow || 0, failPlaylists: false };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: copy(env.following), next: null, total: env.following.length } }, delay: env.slowFollowing || 0 };
    if (path === '/me/playlists') {
      if (env.failPlaylists) return { status: 500, json: { error: { status: 500, message: 'Server error' } }, delay: env.slow };
      return { status: 200, json: { items: copy(env.playlists), next: null, total: env.playlists.length }, delay: env.slow };
    }
    if (path === '/me/library' && (method === 'PUT' || method === 'DELETE')) {
      var uri = decodeURIComponent(q.get('uris') || ''), id = uri.split(':')[2];
      if (opts.stateful) {
        env.following = env.following.filter(function (a) { return a.id !== id; });
        if (method === 'PUT') env.following.unshift(apiArtist(id, id === 'n1' ? 'New Artist' : id));
      }
      return { status: 200, json: null };
    }
    if (/^\/playlists\/[^/]+\/items$/.test(path) && method === 'POST') return { status: 201, json: { snapshot_id: 'snap-new' } };
  });
  tab.s = s; tab.env = env;
  return H.wait(opts.startWait || 800).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    return tab;
  });
}
function ids(list) { return (list || []).map(function (a) { return a && a.id; }); }
function count(list, id) { return ids(list).filter(function (x) { return x === id; }).length; }
function cache(tab) { return JSON.parse(tab.s.getItem('lib-cache') || 'null') || {}; }
function cachePl(tab, id) { return (cache(tab).playlists || []).filter(function (p) { return p.id === id; })[0] || null; }
function dataPl(tab, id) { return ((tab.t().state.data || {}).playlists || []).filter(function (p) { return p.id === id; })[0] || null; }
function libWrites(tab) { return tab.calls.filter(function (c) { return c.path === '/me/library' && (c.method === 'PUT' || c.method === 'DELETE'); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }

var tests = [];

// 1. The repro: a follow 200 ms into a Refresh (3 s load) stays after the load lands, in memory and in lib-cache.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    check('1 start: followed list is the old one', JSON.stringify(ids(t.state.data.artists)) === '["x1"]', ids(t.state.data.artists));
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(200).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(300);
    }).then(function () {
      check('1 one PUT sent', libWrites(tab).length === 1 && libWrites(tab)[0].method === 'PUT', libWrites(tab));
      check('1 followed right after the tap', t.isFollowed('n1'), ids(t.state.data.artists));
      check('1 load still in flight', t.state.libLoading === true);
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      check('1 load landed', t.state.libLoading === false);
      check('1 still followed after the load (state.data)', t.isFollowed('n1') && count(t.state.data.artists, 'n1') === 1, ids(t.state.data.artists));
      check('1 old follow kept', count(t.state.data.artists, 'x1') === 1, ids(t.state.data.artists));
      check('1 still followed in lib-cache', count(cache(tab).artists, 'n1') === 1 && count(cache(tab).artists, 'x1') === 1, ids(cache(tab).artists));
      check('1 nothing left waiting after the load', t.libPending() === 0, t.libPending());
      check('1 no second PUT', libWrites(tab).length === 1, libWrites(tab));
    });
  });
});

// 2. An unfollow made during the load stays unfollowed (the load's answer, read before the tap, still lists it).
tests.push(function () {
  return setup({ following: [OLD, OLD2] }).then(function (tab) {
    var t = tab.t();
    check('2 start: both followed', t.isFollowed('x1') && t.isFollowed('x2'), ids(t.state.data.artists));
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(200).then(function () {
      t.toggleFollow({ id: 'x2', name: 'Second Fave', uri: 'spotify:artist:x2' }, null);
      return H.wait(300);
    }).then(function () {
      check('2 DELETE sent', libWrites(tab).length === 1 && libWrites(tab)[0].method === 'DELETE', libWrites(tab));
      check('2 unfollowed right after the tap', !t.isFollowed('x2'));
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      check('2 still unfollowed after the load (state.data)', !t.isFollowed('x2') && t.isFollowed('x1'), ids(t.state.data.artists));
      check('2 still unfollowed in lib-cache', JSON.stringify(ids(cache(tab).artists)) === '["x1"]', ids(cache(tab).artists));
    });
  });
});

// 3. A follow made before the load started isn't duplicated: Spotify's answer already has it.
tests.push(function () {
  return setup({ stateful: true }).then(function (tab) {
    var t = tab.t();
    t.toggleFollow(NEW, null);
    return H.wait(300).then(function () {
      check('3 followed before the load', t.isFollowed('n1'));
      tab.env.slow = LOAD_MS;
      t.refresh();
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      check('3 once in state.data after the load', count(t.state.data.artists, 'n1') === 1 && count(t.state.data.artists, 'x1') === 1, ids(t.state.data.artists));
      check('3 once in lib-cache', count(cache(tab).artists, 'n1') === 1, ids(cache(tab).artists));
    });
  });
});

// 4. A follow made during the load whose answer already includes it (read after the PUT) isn't doubled.
tests.push(function () {
  return setup({ following: [OLD] }).then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS;
    tab.env.following = [apiArtist('n1', 'New Artist'), OLD];   // this load's answer already lists n1
    t.refresh();
    return H.wait(200).then(function () {
      var fol = tab.calls.filter(function (c) { return c.path === '/me/following'; });
      check('4 the load asked for the followed list before the tap', fol.length === 2, fol.length);
      tab.env.following = [OLD];
      t.toggleFollow(NEW, null);
      return H.wait(LOAD_MS + 800);
    }).then(function () {
      check('4 once in state.data', count(t.state.data.artists, 'n1') === 1 && count(t.state.data.artists, 'x1') === 1, ids(t.state.data.artists));
      check('4 once in lib-cache', count(cache(tab).artists, 'n1') === 1, ids(cache(tab).artists));
    });
  });
});

// 5. Start-up load: a follow made while the very first library load is in flight stays.
tests.push(function () {
  return setup({ slow: LOAD_MS, startWait: 300 }).then(function (tab) {
    var t = tab.t();
    check('5 start-up load in flight', t.state.libLoading === true);
    // Nothing cached yet: the follow can only be made once the list is known, as on a later visit with a cache.
    t.state.data = { at: 1, me: { id: 'me1', name: 'R' }, playlists: [], albums: [], artists: [followRec('x1', 'Old Fave')], shows: [] };
    tab.s.setItem('lib-cache', JSON.stringify(t.state.data));
    t.toggleFollow(NEW, null);
    return H.wait(LOAD_MS + 500).then(function () {
      check('5 load landed', t.state.libLoading === false);
      check('5 still followed after the start-up load', t.isFollowed('n1'), ids(t.state.data.artists));
      check('5 in lib-cache', count(cache(tab).artists, 'n1') === 1, ids(cache(tab).artists));
    });
  });
});
function followRec(id, name) { return { kind: 'artist', id: id, name: name, uri: 'spotify:artist:' + id, url: '', img: '', sub: 'Artist' }; }

// 6. The header Refresh button: follow then unfollow the same artist during the load ends unfollowed.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS;
    click(tab, tab.w.document.getElementById('refreshBtn'));
    return H.wait(200).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(300);
    }).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(300);
    }).then(function () {
      check('6 PUT then DELETE sent', libWrites(tab).map(function (c) { return c.method; }).join(',') === 'PUT,DELETE', libWrites(tab));
      return H.wait(LOAD_MS);
    }).then(function () {
      check('6 ends unfollowed (state.data)', !t.isFollowed('n1') && t.isFollowed('x1'), ids(t.state.data.artists));
      check('6 ends unfollowed (lib-cache)', JSON.stringify(ids(cache(tab).artists)) === '["x1"]', ids(cache(tab).artists));
    });
  });
});

// 7. Add to playlist during the load: the playlist's song count stays 11, not the load's 10.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    check('7 start: 10 songs', dataPl(tab, 'p1') && dataPl(tab, 'p1').count === 10, dataPl(tab, 'p1'));
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(200).then(function () {
      t.sendAdd(t.libraryPlaylist('p1'), { uri: 'spotify:track:z1', name: 'Z' }, null);
      return H.wait(300);
    }).then(function () {
      var posts = tab.calls.filter(function (c) { return c.method === 'POST' && /\/items$/.test(c.path); });
      check('7 one add sent', posts.length === 1, posts);
      check('7 count 11 right after', dataPl(tab, 'p1').count === 11, dataPl(tab, 'p1'));
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      var p = dataPl(tab, 'p1'), c = cachePl(tab, 'p1');
      check('7 count 11 after the load (state.data)', p && p.count === 11 && / · 11 songs$/.test(p.sub), p);
      check('7 count 11 after the load (lib-cache)', c && c.count === 11 && / · 11 songs$/.test(c.sub), c);
    });
  });
});

// 8. Edit (a removal sets the count) during the load: the count it set stays.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(200).then(function () {
      t.setPlCount('p1', 9);
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      var p = dataPl(tab, 'p1'), c = cachePl(tab, 'p1');
      check('8 count 9 after the load (state.data)', p && p.count === 9 && / · 9 songs$/.test(p.sub), p);
      check('8 count 9 after the load (lib-cache)', c && c.count === 9, c);
    });
  });
});

// 9. A count change before the load isn't re-applied over a newer answer.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.setPlCount('p1', 11);
    tab.env.playlists = [apiPlaylist('p1', 'Mine', 14)];   // changed elsewhere since
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(LOAD_MS + 500).then(function () {
      check('9 newer answer wins (14)', dataPl(tab, 'p1').count === 14 && cachePl(tab, 'p1').count === 14, [dataPl(tab, 'p1'), cachePl(tab, 'p1')]);
    });
  });
});

// 10. Two loads in flight (Refresh tapped twice): a follow between them survives both answers.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(300).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(300);
    }).then(function () {
      tab.env.slowFollowing = LOAD_MS + 1000;   // the second load lands about 1.6 s after the first
      t.refresh();   // its answer doesn't list the follow either (the mock doesn't change the list)
      return H.wait(LOAD_MS - 400);
    }).then(function () {
      check('10 followed after the first load lands', t.isFollowed('n1'), ids(t.state.data.artists));
      check('10 still waiting for the second load', t.libPending() === 1, t.libPending());
      return H.wait(LOAD_MS);
    }).then(function () {
      check('10 followed after the second load lands', t.isFollowed('n1') && count(t.state.data.artists, 'n1') === 1, ids(t.state.data.artists));
      check('10 in lib-cache', count(cache(tab).artists, 'n1') === 1, ids(cache(tab).artists));
      check('10 nothing left waiting', t.libPending() === 0, t.libPending());
    });
  });
});

// 10b. A second Refresh after the tap shares the first load's playlists request (identical GETs in flight share
// one answer, v2.14), so its answer is partly from before the tap too: the follow still stays.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS;
    t.refresh();
    return H.wait(300).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(300);
    }).then(function () {
      t.refresh();
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      var pl = tab.calls.filter(function (c) { return c.path === '/me/playlists'; });
      check('10b both loads shared one playlists request', pl.length === 2, pl.length);   // one at start-up, one for both Refreshes
      check('10b followed after both loads land', t.isFollowed('n1') && count(t.state.data.artists, 'n1') === 1, ids(t.state.data.artists));
      check('10b in lib-cache', count(cache(tab).artists, 'n1') === 1, ids(cache(tab).artists));
      check('10b nothing left waiting', t.libPending() === 0, t.libPending());
    });
  });
});

// 11. A load that fails leaves the follow in place and keeps nothing waiting; the next load isn't affected.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    tab.env.slow = LOAD_MS; tab.env.failPlaylists = true;
    t.refresh();
    return H.wait(200).then(function () {
      t.toggleFollow(NEW, null);
      return H.wait(LOAD_MS + 500);
    }).then(function () {
      check('11 load failed, follow kept', t.state.libLoading === false && t.isFollowed('n1') && count(cache(tab).artists, 'n1') === 1, ids(t.state.data.artists));
      check('11 nothing waiting after a failed load', t.libPending() === 0, t.libPending());
      tab.env.failPlaylists = false; tab.env.slow = 0;
      tab.env.following = [OLD];   // say the follow was undone in the Spotify app since
      t.refresh();
      return H.wait(500);
    }).then(function () {
      check('11 a later load goes by Spotify again', !t.isFollowed('n1'), ids(t.state.data.artists));
    });
  });
});

// 12. No change is kept while no load is in flight.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    t.toggleFollow(NEW, null);
    return H.wait(300).then(function () {
      t.setPlCount('p1', 12);
      check('12 nothing kept outside a load', t.libPending() === 0, t.libPending());
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
