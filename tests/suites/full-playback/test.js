'use strict';
// v2.19 tests: Show songs plays full songs on the phone; own playlists aren't treated as someone else's.
// jsdom, mocked fetch, fake Spotify iFrame API. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var OTHER = { kind: 'playlist', id: 'pl9', name: 'Road Trip', uri: 'spotify:playlist:pl9', url: 'https://open.spotify.com/playlist/pl9', img: '', ownerId: 'someone', collaborative: false, count: 40, sub: 'Playlist' };
var MINE = { kind: 'playlist', id: 'pl1', name: 'Mine', uri: 'spotify:playlist:pl1', url: 'https://open.spotify.com/playlist/pl1', img: '', ownerId: 'me1', collaborative: false, count: 2, sub: 'Playlist' };
function track(id) {
  return { added_at: '2026-11-01T00:00:00Z', item: { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: 200000,
    album: { id: 'a1', name: 'Album', images: [] }, artists: [{ name: 'Artist' }] } };
}
function setup(opts) {
  opts = opts || {};
  var env = { script: opts.script || [], noDevice: false };
  var tab = H.makeTab(H.seedStore(), function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === path) { s.used = true; return { status: s.status, json: s.json }; }
    }
    if (path === '/me/player/devices') return { status: 200, json: { devices: env.noDevice ? [] : [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    if (!t.state.data) t.state.data = {};
    t.state.data.me = opts.me === undefined ? { id: 'me1' } : opts.me;
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function btn(tab, text) { return [].slice.call(d(tab).querySelectorAll('#dfoot button, .dbtns a, .dbtns button')).filter(function (b) { return b.textContent === text; })[0]; }
function apiScripts(tab) { return [].slice.call(d(tab).querySelectorAll('script[src]')).filter(function (s) { return /embed\/iframe-api\/v1/.test(s.src); }); }
// A stand-in for Spotify's iFrame API: replaces the element with an iframe and records what the page does.
function fakeApi(tab) {
  var api = { made: [] };
  api.createController = function (elm, opts, cb) {
    var f = d(tab).createElement('iframe');
    f.setAttribute('src', 'https://open.spotify.com/embed/fake');
    elm.parentNode.replaceChild(f, elm);
    var ctl = { opts: opts, frame: f, h: {}, paused: 0, destroyed: 0 };
    ctl.addListener = function (ev, fn) { (ctl.h[ev] = ctl.h[ev] || []).push(fn); };
    ctl.pause = function () { ctl.paused++; };
    ctl.destroy = function () { ctl.destroyed++; if (f.parentNode) f.parentNode.removeChild(f); };
    ctl.fire = function (ev, data) { (ctl.h[ev] || []).forEach(function (fn) { fn({ data: data }); }); };
    api.made.push(ctl);
    setTimeout(function () { cb(ctl); }, 0);
  };
  return api;
}
function openOther(tab) {
  tab.t().openDetail(OTHER);
  // Opening asks once whether the playlist is in your library (the heart); that's the old behaviour, not Show songs.
  return H.wait(300).then(function () {
    var heart = reqs(tab, 'GET', '/me/library/contains');
    tab.openCalls = tab.calls.slice();
    tab.calls.length = 0;
    return heart;
  });
}
function showSongs(tab, api) {
  click(tab, btn(tab, 'Show songs'));
  return H.wait(20).then(function () {
    if (api !== undefined) tab.w.onSpotifyIframeApiReady(api);
    return H.wait(30);
  });
}
function plays(tab) { return reqs(tab, 'PUT', '/me/player/play'); }

var tests = [];

// 1. Someone else's playlist: no list request; Show songs loads the iFrame API only on tap, with no Web API request.
tests.push(function () {
  return setup().then(function (tab) {
    return openOther(tab).then(function () {
      check('1 version looks like vN.NN (date)', /^v\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/.test(tab.t().VERSION), tab.t().VERSION);
      check('1 no list request for someone else\'s playlist', tab.openCalls.filter(function (c) { return /\/playlists\//.test(c.path); }).length === 0, tab.openCalls);
      check('1 restricted with Show songs button', tab.t().state.detail.restricted && !!btn(tab, 'Show songs'));
      check('1 nothing loads before the tap', apiScripts(tab).length === 0 && !d(tab).querySelector('.sembed-box'));
      var api = fakeApi(tab);
      return showSongs(tab, api).then(function () {
        check('1 API script added once', apiScripts(tab).length === 1);
        check('1 no Web API request from showing songs', tab.calls.length === 0, tab.calls);
        check('1 controller made with the playlist', api.made.length === 1 && /open\.spotify\.com\/playlist\/pl9/.test(api.made[0].opts.url), api.made[0] && api.made[0].opts);
        check('1 light mode: no dark style', api.made[0] && !/theme=0/.test(api.made[0].opts.url));
        check('1 player shown in the box', !!d(tab).querySelector('.sembed-box iframe') && !d(tab).querySelector('.sembed-hold'));
        var note = d(tab).querySelector('.sembed-box .snote');
        check('1 note says songs play in full on the phone', note && /play in full on your Spotify app/.test(note.textContent) && /30-second previews/.test(note.textContent), note && note.textContent);
        check('1 no autoplay: nothing paused, nothing played', api.made[0].paused === 0 && plays(tab).length === 0);
        check('1 Show songs button gone', !btn(tab, 'Show songs'));
      });
    });
  });
});

// 2. A song started inside the player: the preview stops and the full song plays on the phone, inside the playlist.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      var ctl = api.made[0];
      ctl.fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(60).then(function () {
        var p = plays(tab);
        check('2 preview paused', ctl.paused >= 1, ctl.paused);
        check('2 one play request', p.length === 1, tab.calls);
        check('2 plays the song inside the playlist on the phone', p[0] && p[0].body && p[0].body.context_uri === 'spotify:playlist:pl9' && p[0].body.offset && p[0].body.offset.uri === 'spotify:track:abc123' && /device_id=A/.test(p[0].query), p[0]);
        check('2 toast names the playlist', tab.toasts().some(function (m) { return /Playing “a song from Road Trip” on iPhone/.test(m); }), tab.toasts());
        // Progress updates for the same song don't send it again, but still keep the preview stopped.
        ctl.fire('playback_update', { playingURI: 'spotify:track:abc123', isPaused: false, isBuffering: false, position: 1200, duration: 30000 });
        ctl.fire('playback_update', { playingURI: 'spotify:track:abc123', isPaused: true, isBuffering: false, position: 1300, duration: 30000 });
        return H.wait(60).then(function () {
          check('2 repeat signals for one song send nothing more', plays(tab).length === 1, plays(tab).length);
          check('2 a playing update pauses again, a paused one does not', ctl.paused === 2, ctl.paused);
          // A different song right after: played too.
          ctl.fire('playback_update', { playingURI: 'spotify:track:zzz9', isPaused: false, isBuffering: false, position: 100, duration: 30000 });
          return H.wait(60);
        }).then(function () {
          var p2 = plays(tab);
          check('2 another song plays right away', p2.length === 2 && p2[1].body.offset.uri === 'spotify:track:zzz9', p2.map(function (c) { return c.body; }));
          check('2 buffering update ignored', (function () { var before = ctl.paused; ctl.fire('playback_update', { playingURI: 'spotify:track:q', isPaused: false, isBuffering: true }); return ctl.paused === before; })());
        });
      });
    });
  });
});

// 3. The player's own Play (playlist address, or none): the whole playlist plays, like Play above. Episodes keep their address.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      var ctl = api.made[0];
      ctl.fire('playback_started', { playingURI: 'spotify:playlist:pl9' });
      return H.wait(60).then(function () {
        var p = plays(tab);
        check('3 playlist address plays the whole playlist', p.length === 1 && p[0].body.context_uri === 'spotify:playlist:pl9' && !p[0].body.offset, p[0] && p[0].body);
        ctl.fire('playback_started', { playingURI: 'spotify:episode:ep7' });
        return H.wait(60);
      }).then(function () {
        var p = plays(tab);
        check('3 episode plays inside the playlist', p.length === 2 && p[1].body.offset && p[1].body.offset.uri === 'spotify:episode:ep7', p[1] && p[1].body);
        ctl.fire('playback_started', {});
        return H.wait(60);
      }).then(function () {
        var p = plays(tab);
        check('3 no address: whole playlist', p.length === 3 && p[2].body.context_uri === 'spotify:playlist:pl9' && !p[2].body.offset, p[2] && p[2].body);
        check('3 odd address is not used as a song', (function () { ctl.fire('playback_started', { playingURI: 'spotify:track:bad id"' }); return true; })());
        return H.wait(4100).then(function () { return null; });
      }).then(function () {
        var last = plays(tab).slice(-1)[0];
        check('3 odd address plays the playlist, not the address', last.body.context_uri === 'spotify:playlist:pl9' && !last.body.offset, last.body);
      });
    });
  });
});

// 4. No device known yet: the page checks devices first, then plays (same path as tapping a row).
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    tab.t().state.device = null; tab.t().state.deviceAt = 0;
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      tab.calls.length = 0;
      api.made[0].fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(300).then(function () {
        check('4 device check, then play', reqs(tab, 'GET', '/me/player/devices').length === 1 && plays(tab).length === 1, tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
      });
    });
  });
});

// 5. API doesn't load: the plain player stays, with the preview note.
tests.push(function () {
  return setup().then(function (tab) {
    return openOther(tab).then(function () { return showSongs(tab, null); }).then(function () {
      var f = d(tab).querySelector('.sembed-box iframe.sembed');
      check('5 plain embed shown', f && /open\.spotify\.com\/embed\/playlist\/pl9/.test(f.getAttribute('src')), f && f.getAttribute('src'));
      var note = d(tab).querySelector('.sembed-box .snote');
      check('5 note says previews only', note && /only as 30-second previews/.test(note.textContent) && /Play or Shuffle above/.test(note.textContent), note && note.textContent);
      check('5 no Web API request', tab.calls.length === 0, tab.calls);
      // Next playlist: no second script.
      tab.t().state.detail = null;
      return openOther(tab).then(function () { return showSongs(tab); }).then(function () {
        check('5 failed load not retried in this visit', apiScripts(tab).length === 1 && !!d(tab).querySelector('.sembed-box iframe.sembed'));
      });
    });
  });
});

// 6. Script error or timeout: the plain player.
tests.push(function () {
  return setup().then(function (tab) {
    return openOther(tab).then(function () { return showSongs(tab); }).then(function () {
      var s = apiScripts(tab)[0];
      s.onerror();
      return H.wait(30).then(function () {
        check('6 script error: plain embed', !!d(tab).querySelector('.sembed-box iframe.sembed') && /only as 30-second/.test(d(tab).querySelector('.sembed-box .snote').textContent));
        check('6 a late ready is ignored', (function () { tab.w.onSpotifyIframeApiReady(fakeApi(tab)); return tab.t().embedApi.state === 'failed'; })());
      });
    });
  });
});
tests.push(function () {
  return setup().then(function (tab) {
    return openOther(tab).then(function () { return showSongs(tab); }).then(function () {
      check('6 loading text while waiting', /Loading songs/.test(d(tab).querySelector('.sembed-box').textContent));
      return H.wait(8200);
    }).then(function () {
      check('6 timeout: plain embed', !!d(tab).querySelector('.sembed-box iframe.sembed'));
    });
  });
});

// 7. Light/dark switch rebuilds the player in the new style; the old one is destroyed.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      d(tab).documentElement.setAttribute('data-theme', 'dark');
      tab.t().syncEmbedTheme();
      return H.wait(40);
    }).then(function () {
      check('7 rebuilt once, dark style', api.made.length === 2 && /\?theme=0$/.test(api.made[1].opts.url), api.made.map(function (c) { return c.opts.url; }));
      check('7 old player destroyed', api.made[0].destroyed === 1);
      check('7 one player on screen', d(tab).querySelectorAll('.sembed-box').length === 1 && d(tab).querySelectorAll('.sembed-box iframe').length === 1);
      check('7 no Web API request', tab.calls.length === 0, tab.calls);
      tab.t().syncEmbedTheme();
      return H.wait(20).then(function () { check('7 same style: not rebuilt', api.made.length === 2); });
    });
  });
});

// 8. Leaving the playlist before the API answers: no player is made.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab); }).then(function () {
      tab.t().openDetail(MINE);
      tab.w.onSpotifyIframeApiReady(api);
      return H.wait(40);
    }).then(function () {
      check('8 no controller after leaving', api.made.length === 0);
      // An old controller's start signal after leaving does nothing.
      return null;
    });
  });
});
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      tab.t().openDetail(MINE);
      return H.wait(50);
    }).then(function () {
      tab.calls.length = 0;
      api.made[0].fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(40);
    }).then(function () {
      check('8 start signal after leaving sends nothing', plays(tab).length === 0, tab.calls);
    });
  });
});

// 9. Own playlists: still listed; and when your account hasn't loaded, the page asks instead of assuming it's someone else's.
tests.push(function () {
  return setup({ script: [{ m: 'GET', path: '/playlists/pl1/items', status: 200, json: { items: [track('t1'), track('t2')], next: null, total: 2 } }] }).then(function (tab) {
    tab.t().openDetail(MINE);
    return H.wait(100).then(function () {
      check('9 own playlist listed', !tab.t().state.detail.restricted && d(tab).querySelectorAll('#dlist li').length === 2, d(tab).querySelectorAll('#dlist li').length);
      check('9 no Show songs on own playlist', !btn(tab, 'Show songs'));
    });
  });
});
tests.push(function () {
  return setup({ me: null, script: [{ m: 'GET', path: '/playlists/pl1/items', status: 200, json: { items: [track('t1'), track('t2')], next: null, total: 2 } }] }).then(function (tab) {
    tab.t().openDetail(MINE);
    return H.wait(100).then(function () {
      check('9 account not loaded: own playlist still listed', !tab.t().state.detail.restricted && d(tab).querySelectorAll('#dlist li').length === 2, tab.calls);
    });
  });
});
tests.push(function () {
  return setup({ me: null, script: [{ m: 'GET', path: '/playlists/pl9/items', status: 403, json: { error: { status: 403, message: 'Forbidden' } } }] }).then(function (tab) {
    tab.t().openDetail(OTHER);
    return H.wait(100).then(function () {
      check('9 account not loaded, someone else\'s: 403 gives Show songs', tab.t().state.detail.restricted && !!btn(tab, 'Show songs'), tab.calls);
    });
  });
});
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    check('9 canList: owner unknown asks', t.canList({ ownerId: '', collaborative: false }) === true);
    check('9 canList: someone else\'s, account known', t.canList({ ownerId: 'x', collaborative: false }) === false);
    check('9 canList: collaborative', t.canList({ ownerId: 'x', collaborative: true }) === true);
    check('9 canList: mine', t.canList({ ownerId: 'me1', collaborative: false }) === true);
  });
});

// 10. Header Play on someone else's playlist is unchanged: the whole playlist on the phone.
tests.push(function () {
  return setup().then(function (tab) {
    return openOther(tab).then(function () {
      click(tab, btn(tab, 'Play'));
      return H.wait(60);
    }).then(function () {
      var p = plays(tab);
      check('10 header Play plays the playlist', p.length === 1 && p[0].body.context_uri === 'spotify:playlist:pl9', p[0] && p[0].body);
    });
  });
});

// 11. Page errors: none logged.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      api.made[0].fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(60);
    }).then(function () {
      var log = JSON.parse(tab.w.localStorage.getItem('lib-errors') || '[]');
      check('11 no page errors', !log.some(function (l) { return /Page|Embed/.test(l); }), log);
    });
  });
});


function cool(tab, g) { var c = {}; c[g] = { until: Date.now() + 600000, reason: 'quota', strikes: 1 }; tab.w.localStorage.setItem('lib-cooloff', JSON.stringify(c)); }

// 12. A pause that doesn't take never restarts the song on the phone; after the player reports a pause, the same song plays again.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      var ctl = api.made[0];
      ctl.fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(4300).then(function () {
        ctl.fire('playback_update', { playingURI: 'spotify:track:abc123', isPaused: false, isBuffering: false, position: 5000, duration: 30000 });
        return H.wait(60);
      }).then(function () {
        check('12 still playing after 4 s: not sent again', plays(tab).length === 1, plays(tab).length);
        ctl.fire('playback_update', { playingURI: 'spotify:track:abc123', isPaused: true, isBuffering: false });
        ctl.fire('playback_started', { playingURI: 'spotify:track:abc123' });
        return H.wait(60);
      }).then(function () {
        check('12 same song after a pause plays again', plays(tab).length === 2, plays(tab).length);
      });
    });
  });
});

// 13. No device open: no app is opened from the player's signal; the player reloads and a button gives a fresh tap.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab), went = [];
    tab.w.libNavigate = function (u) { went.push(u); };
    tab.env.noDevice = true;
    tab.t().state.device = null; tab.t().state.deviceAt = 0;
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      api.made[0].fire('playback_started', { playingURI: 'spotify:track:abc123' });
      return H.wait(300);
    }).then(function () {
      check('13 nothing opened without a tap', went.length === 0, went);
      check('13 no play request', plays(tab).length === 0);
      check('13 player reloaded (old destroyed, new made)', api.made[0].destroyed === 1 && api.made.length === 2, api.made.length);
      check('13 toast says Spotify isn\'t open', tab.toasts().some(function (m) { return /isn’t open on any device/.test(m); }), tab.toasts());
      var b = [].slice.call(d(tab).querySelectorAll('button')).filter(function (x) { return x.textContent === 'Open Spotify'; })[0];
      check('13 Open Spotify button shown', !!b);
      if (b) click(tab, b);
      return H.wait(50);
    }).then(function () {
      check('13 button opens the song link', went.length === 1 && went[0] === 'https://open.spotify.com/track/abc123', went);
      var p = JSON.parse(tab.w.localStorage.getItem(tab.t().K.pending) || 'null');
      check('13 tap remembered to play on return, inside the playlist', p && p.item && p.item.ctx === 'spotify:playlist:pl9' && p.item.uri === 'spotify:track:abc123', p);
    });
  });
});

// 14. Spotify paused playback requests: the preview is left alone, one toast, nothing sent.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      cool(tab, 'player');
      tab.w.__toasts = [];
      var ctl = api.made[0];
      ctl.fire('playback_started', { playingURI: 'spotify:track:abc123' });
      ctl.fire('playback_update', { playingURI: 'spotify:track:abc123', isPaused: false, isBuffering: false });
      return H.wait(60).then(function () {
        check('14 preview not paused while cooled off', ctl.paused === 0, ctl.paused);
        check('14 nothing sent', tab.calls.length === 0, tab.calls);
        check('14 one toast', tab.toasts().length === 1, tab.toasts());
      });
    });
  });
});

// 15. Catalog paused and account unknown: Show songs, not an error. A 403'd playlist isn't asked again this visit.
tests.push(function () {
  return setup({ me: null }).then(function (tab) {
    cool(tab, 'catalog');
    tab.t().openDetail(OTHER);
    return H.wait(100).then(function () {
      check('15 catalog paused: Show songs', tab.t().state.detail.restricted && !!btn(tab, 'Show songs') && !tab.t().state.detail.error, tab.t().state.detail.error);
      check('15 no list request', reqs(tab, 'GET', /\/playlists\//).length === 0);
    });
  });
});
tests.push(function () {
  return setup({ me: null, script: [{ m: 'GET', path: '/playlists/pl9/items', status: 403, json: { error: { status: 403, message: 'Forbidden' } } }] }).then(function (tab) {
    tab.t().openDetail(OTHER);
    return H.wait(100).then(function () {
      tab.t().openDetail(MINE);
      return H.wait(100);
    }).then(function () {
      tab.t().openDetail(OTHER);
      return H.wait(100);
    }).then(function () {
      check('15 403 asked once per visit', reqs(tab, 'GET', '/playlists/pl9/items').length === 1, reqs(tab, 'GET', '/playlists/pl9/items').length);
      check('15 reopened: Show songs', tab.t().state.detail.restricted && !!btn(tab, 'Show songs'));
    });
  });
});

// 16. Leaving the playlist destroys the player.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      tab.t().openDetail(MINE);
      return H.wait(50);
    }).then(function () {
      check('16 player destroyed when another list opens', api.made[0].destroyed === 1);
    });
  });
});

// 17. The "play in full" note appears only once Spotify's player is ready.
tests.push(function () {
  return setup().then(function (tab) {
    var api = fakeApi(tab);
    var real = api.createController;
    var held = null;
    api.createController = function (elm, opts, cb) { real(elm, opts, function (ctl) { held = function () { cb(ctl); }; }); };
    return openOther(tab).then(function () { return showSongs(tab, api); }).then(function () {
      check('17 no note before ready', !d(tab).querySelector('.sembed-box .snote'));
      held();
      check('17 note once ready', /play in full/.test((d(tab).querySelector('.sembed-box .snote') || {}).textContent || ''));
    });
  });
});

(async function () {
  for (var i = 0; i < tests.length; i++) {
    try { await tests[i](); } catch (e) { results.push('FAIL test ' + (i + 1) + ' threw ' + e.stack); }
  }
  results.forEach(function (r) { console.log(r); });
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})();
