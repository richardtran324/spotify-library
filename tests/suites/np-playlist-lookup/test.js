'use strict';
// v2.62 tests: the Now Playing screen's lookup of a playlist outside your library (GET /playlists/{id}).
// A lasting refusal (403, 404 …) is remembered for the visit and never asked again; no internet, a 5xx or a 429 is.
// Run: node tests/run.js np-playlist-lookup  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var PL = '37i9dQZF1DXcBWIGoYBM5M';   // a Spotify editorial playlist id, not in the library
var PL2 = '37i9dQZF1DX0XUsuxWHRQd';
function track(id) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: 200000,
    album: { id: 'al', name: 'Al', images: [], uri: 'spotify:album:al' }, artists: [{ id: 'ar', name: 'A' }] };
}
function playerFor(id, pl) {
  return { item: track(id), currently_playing_type: 'track', context: { type: 'playlist', uri: 'spotify:playlist:' + (pl || PL) },
    is_playing: true, progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
// env.pl[id]: 'ok' | a status number | 'net' (no answer at all: fetch rejects with a TypeError, like Safari's "Load failed")
function setup() {
  var env = { pl: {} };
  var tab = H.makeTab(H.seedStore(), function (method, path) {
    var m = /^\/playlists\/([A-Za-z0-9]+)$/.exec(path);
    if (m && method === 'GET') {
      var a = env.pl[m[1]];
      if (a === 'net') throw new TypeError('Load failed');
      if (a === 'ok') return { status: 200, json: { id: m[1], name: 'Today’s Top Hits', uri: 'spotify:playlist:' + m[1], images: [], owner: { id: 'spotify', display_name: 'Spotify' }, tracks: { total: 50 } } };
      if (a === 429) return { status: 429, headers: { 'retry-after': '0' }, json: { error: { status: 429, message: 'API rate limit exceeded' } } };
      if (typeof a === 'number') return { status: a, json: { error: { status: a, message: a === 404 ? 'Resource not found' : a === 403 ? 'Forbidden' : 'Server error' } } };
    }
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function plCalls(tab, id) { return tab.calls.filter(function (c) { return c.path === '/playlists/' + (id || PL); }).length; }
function plButton(tab) {
  return [].slice.call(tab.w.document.querySelectorAll('#npOpts button')).filter(function (b) { return /^Open playlist/.test(b.textContent); })[0];
}
// Opens Now Playing on song s1, then plays songs one after another from the same playlist (the Now Playing check).
function songs(tab, ids, pl) {
  var t = tab.t();
  return ids.reduce(function (pr, id) {
    return pr.then(function () {
      t.setPlayer(playerFor(id, pl)); t.state.playerAt = Date.now();
      if (tab.w.document.getElementById('np').hidden) t.openNp();
      return H.wait(60);
    });
  }, Promise.resolve());
}
var FIVE = ['s1', 's2', 's3', 's4', 's5'];

var tests = [];

// 1. Version.
tests.push(function () {
  return setup().then(function (tab) {
    check('1 version looks like vN.NN (date)', /^v\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/.test(tab.t().VERSION), tab.t().VERSION);
  });
});

// 2. 404 (Spotify doesn't share the playlist): 5 songs of the same playlist send exactly 1 request.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 404;
    return songs(tab, FIVE).then(function () {
      check('2 404: 5 songs send exactly 1 GET /playlists/{id}', plCalls(tab) === 1, plCalls(tab));
      var b = plButton(tab);
      check('2 404: the button still says Open playlist (no name)', b && b.textContent === 'Open playlist', b && b.textContent);
      check('2 404: no toast for the automatic lookup', tab.w.__toasts.length === 0, tab.w.__toasts);
      // A tap shows the same refusal without asking again.
      b.click();
      return H.wait(60).then(function () {
        check('2 404: a tap on Open playlist sends nothing more', plCalls(tab) === 1, plCalls(tab));
        var ts = tab.w.__toasts.join(' / ');
        check('2 404: the tap says it couldn’t open the playlist', /Couldn.t open the playlist/.test(ts), tab.w.__toasts);
        check('2 404: Now Playing stays open', !tab.w.document.getElementById('np').hidden);
      });
    });
  });
});

// 3. 403: also lasting.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 403;
    return songs(tab, FIVE).then(function () {
      check('3 403: 5 songs send exactly 1 GET /playlists/{id}', plCalls(tab) === 1, plCalls(tab));
    });
  });
});

// 4. No internet: asked again on the next song, and once answered the name shows.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 'net';
    return songs(tab, ['s1']).then(function () {
      check('4 no internet: first song asks once', plCalls(tab) === 1, plCalls(tab));
      return songs(tab, ['s2']);
    }).then(function () {
      check('4 no internet: next song asks again', plCalls(tab) === 2, plCalls(tab));
      tab.env.pl[PL] = 'ok';
      return songs(tab, ['s3']);
    }).then(function () {
      check('4 back online: next song asks again', plCalls(tab) === 3, plCalls(tab));
      var b = plButton(tab);
      check('4 back online: the button shows the name', b && b.textContent === 'Open playlist · Today’s Top Hits', b && b.textContent);
    });
  });
});

// 5. A Spotify server error (500, 503): not remembered.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 500;
    return songs(tab, ['s1', 's2']).then(function () {
      check('5 500: each song asks again', plCalls(tab) === 2, plCalls(tab));
      tab.env.pl[PL] = 503;
      return songs(tab, ['s3']);
    }).then(function () {
      check('5 503: asked again too', plCalls(tab) === 3, plCalls(tab));
      tab.env.pl[PL] = 'ok';
      return songs(tab, ['s4']);
    }).then(function () {
      check('5 after the errors a 200 is asked for and shown', plCalls(tab) === 4 && plButton(tab).textContent === 'Open playlist · Today’s Top Hits', { n: plCalls(tab), b: plButton(tab).textContent });
    });
  });
});

// 6. A 429 (with Retry-After 0, so no pause stays): not remembered as a refusal.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 429;
    return songs(tab, ['s1']).then(function () {
      check('6 429: first song asks once', plCalls(tab) === 1, plCalls(tab));
      tab.w.localStorage.removeItem(tab.t().K.cool);   // the pause is over
      tab.env.pl[PL] = 'ok';
      return H.wait(20).then(function () { return songs(tab, ['s2']); });
    }).then(function () {
      check('6 429: after the pause the next song asks again', plCalls(tab) === 2, plCalls(tab));
    });
  });
});

// 7. 200: asked once and reused for the other songs.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 'ok';
    return songs(tab, FIVE).then(function () {
      check('7 200: 5 songs send exactly 1 GET /playlists/{id}', plCalls(tab) === 1, plCalls(tab));
      var b = plButton(tab);
      check('7 200: the button shows the name', b && b.textContent === 'Open playlist · Today’s Top Hits', b && b.textContent);
    });
  });
});

// 8. The refusal is per playlist: another playlist is still asked for, and closing and reopening Now Playing asks nothing.
tests.push(function () {
  return setup().then(function (tab) {
    tab.env.pl[PL] = 404; tab.env.pl[PL2] = 'ok';
    return songs(tab, ['s1', 's2']).then(function () {
      return songs(tab, ['s3'], PL2);
    }).then(function () {
      check('8 another playlist is asked for', plCalls(tab, PL2) === 1, plCalls(tab, PL2));
      check('8 its name shows', plButton(tab) && plButton(tab).textContent === 'Open playlist · Today’s Top Hits', plButton(tab) && plButton(tab).textContent);
      return songs(tab, ['s4', 's5']);
    }).then(function () {
      tab.t().closeNp(false);
      return H.wait(50).then(function () { return songs(tab, ['s6']); });
    }).then(function () {
      check('8 back on the refused playlist (and after reopening) nothing more is asked', plCalls(tab, PL) === 1, plCalls(tab, PL));
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
