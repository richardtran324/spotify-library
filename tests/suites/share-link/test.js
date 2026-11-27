'use strict';
// Share or copy link (v2.20) tests: jsdom, mocked fetch, mocked navigator.share / navigator.clipboard.
// Run: node tests/run.js <suite name>  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function track() {
  return { type: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song One', duration_ms: 240000,
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
    album: { id: 'a1', name: 'Album One', images: [], uri: 'spotify:album:a1', artists: [{ name: 'Artist A' }] },
    artists: [{ name: 'Artist A' }, { name: 'Artist B' }] };
}
function episode() {
  return { type: 'episode', id: 'e1', uri: 'spotify:episode:e1', name: 'Episode One', duration_ms: 3600000, images: [],
    show: { id: 's1', name: 'Money Show', images: [], uri: 'spotify:show:s1' } };
}
function playerFor(item) {
  return { item: item, currently_playing_type: item.type, context: item.type === 'track' ? { type: 'album', uri: 'spotify:album:a1' } : null,
    is_playing: true, progress_ms: 60000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function setup(opts) {
  opts = opts || {};
  var env = { player: opts.player || null };
  var tab = H.makeTab(H.seedStore(), function (method, path) {
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: opts.noDevice ? [] : [DEV] } };
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (!opts.noDevice) { t.state.device = DEV; t.state.deviceAt = Date.now(); }
    if (opts.setPlayer) { t.setPlayer(JSON.parse(JSON.stringify(opts.setPlayer))); t.state.playerAt = Date.now(); }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
// Mocks. mode: 'ok' resolves, 'abort' rejects AbortError, 'notallowed' rejects NotAllowedError, 'throw' throws, null = missing.
function mockShare(tab, mode) {
  var log = [];
  var nav = tab.w.navigator;
  if (!mode) { try { delete nav.share; } catch (e) {} Object.defineProperty(nav, 'share', { value: undefined, configurable: true, writable: true }); return log; }
  Object.defineProperty(nav, 'share', { configurable: true, writable: true, value: function (data) {
    log.push({ data: data, inGesture: !!tab.w.__inClick });
    if (mode === 'throw') throw new Error('boom');
    if (mode === 'ok') return Promise.resolve();
    var err = new Error(mode === 'abort' ? 'Share canceled' : 'Not allowed');
    err.name = mode === 'abort' ? 'AbortError' : 'NotAllowedError';
    return Promise.reject(err);
  } });
  return log;
}
function mockClipboard(tab, mode) {
  var log = [];
  var nav = tab.w.navigator;
  if (!mode) { Object.defineProperty(nav, 'clipboard', { value: undefined, configurable: true, writable: true }); return log; }
  Object.defineProperty(nav, 'clipboard', { configurable: true, writable: true, value: { writeText: function (txt) {
    log.push(txt);
    return mode === 'ok' ? Promise.resolve() : Promise.reject(new Error('denied'));
  } } });
  return log;
}
function click(tab, node) {
  tab.w.__inClick = true;
  try { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
  finally { tab.w.__inClick = false; }
}
function npShare(tab) { return [].slice.call(d(tab).querySelectorAll('#npOpts button')).filter(function (b) { return b.textContent === 'Share'; })[0]; }
function headShare(tab) { return d(tab).querySelector('.dhead button[aria-label^="Share"]'); }
function webCalls(tab) { return tab.calls.filter(function (c) { return c.path !== '/me/player' && c.path !== '/me/player/devices'; }); }

var tests = [];

// 1. Version.
tests.push(function () {
  return setup().then(function (tab) {
    check('1 version looks like vN.NN (date)', /^v\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/.test(tab.t().VERSION), tab.t().VERSION);
  });
});

// 2. Now Playing, song: title "name · artists", url from Spotify's link, called inside the tap, zero requests.
tests.push(function () {
  return setup({ setPlayer: playerFor(track()), player: playerFor(track()) }).then(function (tab) {
    tab.t().openNp();
    return H.wait(100).then(function () {
      var b = npShare(tab);
      check('2 Share button on Now Playing (song)', !!b, d(tab).getElementById('npOpts').textContent);
      var opts = [].slice.call(d(tab).querySelectorAll('#npOpts > *')).map(function (x) { return x.textContent; });
      check('2 Share sits just before Open in Spotify', opts.indexOf('Share') === opts.indexOf('Open in Spotify') - 1, opts);
      var log = mockShare(tab, 'ok'); mockClipboard(tab, 'ok');
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(50).then(function () {
        check('2 share called once', log.length === 1, log);
        check('2 share title', log[0] && log[0].data.title === 'Song One · Artist A, Artist B', log[0] && log[0].data);
        check('2 share url', log[0] && log[0].data.url === 'https://open.spotify.com/track/t1', log[0] && log[0].data);
        check('2 share called inside the tap (user gesture)', log[0] && log[0].inGesture === true);
        check('2 only title and url passed', log[0] && Object.keys(log[0].data).sort().join(',') === 'title,url', log[0] && log[0].data);
        check('2 no toast after a successful share', tab.w.__toasts.length === 0, tab.w.__toasts);
        check('2 zero Web API requests from Share', tab.calls.length === 0, tab.calls);
        check('2 Now Playing stays open', !d(tab).getElementById('np').hidden);
      });
    });
  });
});

// 3. Now Playing, episode: title "name · show", built episode url (no external_urls).
tests.push(function () {
  return setup({ setPlayer: playerFor(episode()), player: playerFor(episode()) }).then(function (tab) {
    tab.t().openNp();
    return H.wait(100).then(function () {
      var b = npShare(tab);
      check('3 Share button on Now Playing (episode)', !!b);
      var log = mockShare(tab, 'ok');
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(50).then(function () {
        check('3 episode title', log[0] && log[0].data.title === 'Episode One · Money Show', log[0] && log[0].data);
        check('3 episode url', log[0] && log[0].data.url === 'https://open.spotify.com/episode/e1', log[0] && log[0].data);
        check('3 episode in gesture', log[0] && log[0].inGesture);
        check('3 zero requests', tab.calls.length === 0, tab.calls);
      });
    });
  });
});

// 4. Local file (no id, no link): no Share button.
tests.push(function () {
  var loc = track(); loc.id = null; loc.is_local = true; delete loc.external_urls; loc.uri = 'spotify:local:a:b:c:1';
  return setup({ setPlayer: playerFor(loc), player: playerFor(loc) }).then(function (tab) {
    tab.t().openNp();
    return H.wait(100).then(function () {
      check('4 no Share for a local file', !npShare(tab), d(tab).getElementById('npOpts').textContent);
    });
  });
});

// 5. Detail headers: album, playlist, show, artist get Share with the right url and title.
function detailCase(n, item, wantUrl) {
  return function () {
    return setup().then(function (tab) {
      tab.t().openDetail(item);
      return H.wait(300).then(function () {
        var b = headShare(tab);
        check(n + ' ' + item.kind + ' header has Share', !!b, d(tab).querySelector('.dhead') && d(tab).querySelector('.dhead').innerHTML.slice(0, 300));
        if (!b) return;
        check(n + ' ' + item.kind + ' Share label names it', b.getAttribute('aria-label') === 'Share “' + item.name + '”', b.getAttribute('aria-label'));
        var log = mockShare(tab, 'ok');
        tab.calls.length = 0;
        click(tab, b);
        return H.wait(50).then(function () {
          check(n + ' ' + item.kind + ' share url', log[0] && log[0].data.url === wantUrl, log[0] && log[0].data);
          check(n + ' ' + item.kind + ' share title', log[0] && log[0].data.title === item.name, log[0] && log[0].data);
          check(n + ' ' + item.kind + ' in gesture', log[0] && log[0].inGesture);
          check(n + ' ' + item.kind + ' zero requests from Share', tab.calls.length === 0, tab.calls);
          check(n + ' ' + item.kind + ' no toast', tab.w.__toasts.length === 0, tab.w.__toasts);
        });
      });
    });
  };
}
tests.push(detailCase('5a', { kind: 'album', id: 'a1', uri: 'spotify:album:a1', name: 'Album One', url: 'https://open.spotify.com/album/a1', img: '', sub: 'Album · Artist A' }, 'https://open.spotify.com/album/a1'));
tests.push(detailCase('5b', { kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1', name: 'Road Trip', url: 'https://open.spotify.com/playlist/p1', img: '', sub: 'Playlist', ownerId: 'someone' }, 'https://open.spotify.com/playlist/p1'));
tests.push(detailCase('5c', { kind: 'show', id: 's1', uri: 'spotify:show:s1', name: 'Money Show', url: 'https://open.spotify.com/show/s1', img: '', sub: 'Podcast' }, 'https://open.spotify.com/show/s1'));
tests.push(detailCase('5d', { kind: 'artist', id: 'r1', uri: 'spotify:artist:r1', name: 'Artist A', url: 'https://open.spotify.com/artist/r1', img: '' }, 'https://open.spotify.com/artist/r1'));
// A playlist item with no url (built from kind + id).
tests.push(detailCase('5e', { kind: 'playlist', id: 'p2', uri: 'spotify:playlist:p2', name: 'No Link', img: '', sub: 'Playlist', ownerId: 'someone' }, 'https://open.spotify.com/playlist/p2'));

// 6. Liked Songs and Saved episodes: no Share button.
tests.push(function () {
  return setup().then(function (tab) {
    tab.t().openDetail({ kind: 'liked', name: 'Liked Songs', uri: null, url: 'https://open.spotify.com/collection/tracks', sub: 'Playlist' });
    return H.wait(300).then(function () {
      check('6 Liked Songs header shown', !!d(tab).querySelector('.dhead'));
      check('6 no Share for Liked Songs', !headShare(tab));
      tab.t().openDetail({ kind: 'episodes', name: 'Saved episodes', uri: null, url: 'https://open.spotify.com/collection/your-episodes', sub: 'Podcast' });
      return H.wait(300).then(function () {
        check('6 Saved episodes header shown', /Saved episodes/.test(d(tab).querySelector('.dhead').textContent));
        check('6 no Share for Saved episodes', !headShare(tab));
        var u = tab.t().shareUrl;
        check('6 shareUrl empty for collections', u({ kind: 'liked', url: 'https://open.spotify.com/collection/tracks' }) === '' && u({ kind: 'episodes', url: 'x' }) === '');
      });
    });
  });
});

// 7. shareUrl: uses mapper url, builds from kind + id, rejects a url of the wrong kind.
tests.push(function () {
  return setup().then(function (tab) {
    var u = tab.t().shareUrl;
    check('7 track', u({ kind: 'track', id: 't9', url: 'https://open.spotify.com/track/t9' }) === 'https://open.spotify.com/track/t9');
    check('7 episode built', u({ kind: 'episode', id: 'e9' }) === 'https://open.spotify.com/episode/e9');
    check('7 album built', u({ kind: 'album', id: 'a9' }) === 'https://open.spotify.com/album/a9');
    check('7 artist built', u({ kind: 'artist', id: 'r9' }) === 'https://open.spotify.com/artist/r9');
    check('7 show built', u({ kind: 'show', id: 's9' }) === 'https://open.spotify.com/show/s9');
    check('7 wrong-kind url ignored', u({ kind: 'album', id: 'a9', url: 'https://evil.example/album/a9' }) === 'https://open.spotify.com/album/a9');
    check('7 no id, no url', u({ kind: 'album' }) === '');
    check('7 resume kind has no link', u({ kind: 'resume', id: 'x' }) === '');
  });
});

// 8. AbortError (sheet closed) shows nothing and does not copy.
tests.push(function () {
  return setup({ setPlayer: playerFor(track()), player: playerFor(track()) }).then(function (tab) {
    tab.t().openNp();
    return H.wait(100).then(function () {
      var log = mockShare(tab, 'abort'); var clip = mockClipboard(tab, 'ok');
      tab.calls.length = 0;
      click(tab, npShare(tab));
      return H.wait(50).then(function () {
        check('8 share tried', log.length === 1);
        check('8 AbortError: no toast', tab.w.__toasts.length === 0, tab.w.__toasts);
        check('8 AbortError: no clipboard write', clip.length === 0, clip);
        check('8 zero requests', tab.calls.length === 0, tab.calls);
      });
    });
  });
});

// 9. share missing -> clipboard + "Link copied".
tests.push(function () {
  return setup().then(function (tab) {
    tab.t().openDetail({ kind: 'album', id: 'a1', uri: 'spotify:album:a1', name: 'Album One', url: 'https://open.spotify.com/album/a1', img: '', sub: 'Album' });
    return H.wait(300).then(function () {
      mockShare(tab, null); var clip = mockClipboard(tab, 'ok');
      tab.calls.length = 0;
      click(tab, headShare(tab));
      return H.wait(50).then(function () {
        check('9 clipboard got the link', clip.length === 1 && clip[0] === 'https://open.spotify.com/album/a1', clip);
        check('9 toast "Link copied"', tab.w.__toasts.length === 1 && tab.w.__toasts[0] === 'Link copied', tab.w.__toasts);
        check('9 zero requests', tab.calls.length === 0, tab.calls);
      });
    });
  });
});

// 10. share rejects with another error -> clipboard + toast.
tests.push(function () {
  return setup().then(function (tab) {
    tab.t().openDetail({ kind: 'show', id: 's1', uri: 'spotify:show:s1', name: 'Money Show', url: 'https://open.spotify.com/show/s1', img: '', sub: 'Podcast' });
    return H.wait(300).then(function () {
      var log = mockShare(tab, 'notallowed'); var clip = mockClipboard(tab, 'ok');
      click(tab, headShare(tab));
      return H.wait(50).then(function () {
        check('10 share tried first', log.length === 1);
        check('10 NotAllowedError falls back to copy', clip.length === 1 && clip[0] === 'https://open.spotify.com/show/s1', clip);
        check('10 toast "Link copied"', tab.w.__toasts.join('|') === 'Link copied', tab.w.__toasts);
      });
    });
  });
});

// 11. share throws synchronously -> clipboard.
tests.push(function () {
  return setup().then(function (tab) {
    mockShare(tab, 'throw'); var clip = mockClipboard(tab, 'ok');
    tab.t().shareLink('X', 'https://open.spotify.com/album/a1');
    return H.wait(50).then(function () {
      check('11 throw falls back to copy', clip.length === 1 && tab.w.__toasts.join('|') === 'Link copied', { clip: clip, toasts: tab.w.__toasts });
    });
  });
});

// 12. Both missing -> toast that shows the link to copy by hand.
tests.push(function () {
  return setup({ setPlayer: playerFor(episode()), player: playerFor(episode()) }).then(function (tab) {
    tab.t().openNp();
    return H.wait(100).then(function () {
      mockShare(tab, null); mockClipboard(tab, null);
      tab.calls.length = 0;
      click(tab, npShare(tab));
      return H.wait(50).then(function () {
        var t0 = tab.w.__toasts[0] || '';
        check('12 one fallback toast', tab.w.__toasts.length === 1, tab.w.__toasts);
        check('12 toast message', t0 === 'Copy this link:', t0);
        var toastEl = d(tab).getElementById('toast');
        var sel = toastEl.querySelector('.tsel');
        check('12 link shown as plain text', sel && sel.tagName === 'SPAN' && sel.textContent === 'https://open.spotify.com/episode/e1' && !toastEl.hidden, toastEl.innerHTML);
        check('12 no <a> in the toast (a tap would open Spotify)', !toastEl.querySelector('a'), toastEl.innerHTML);
        var css = [].slice.call(d(tab).querySelectorAll('style')).map(function (x) { return x.textContent; }).join('');
        check('12 one tap selects the link (user-select: all)', /\.toast \.tsel \{[^}]*-webkit-user-select: all;[^}]*user-select: all;/.test(css));
        var btn = toastEl.querySelector('.toastbtn');
        check('12 Close button after the link', btn && btn.textContent === 'Close' && sel && sel.nextSibling === btn);
        check('12 zero requests', tab.calls.length === 0, tab.calls);
        click(tab, btn);
        check('12 Close hides the toast', toastEl.hidden);
      });
    });
  });
});

// 13. share missing and clipboard rejects -> toast with the link.
tests.push(function () {
  return setup().then(function (tab) {
    mockShare(tab, null); var clip = mockClipboard(tab, 'fail');
    var w = tab.w, realST = w.setTimeout, delays = [];
    w.setTimeout = function (fn, ms) { delays.push(ms); return realST.apply(w, arguments); };
    tab.t().shareLink('X', 'https://open.spotify.com/artist/r1');
    return H.wait(50).then(function () {
      w.setTimeout = realST;
      var sel = d(tab).querySelector('#toast .tsel');
      check('13 clipboard tried', clip.length === 1);
      check('13 rejected copy shows the link', tab.w.__toasts.join('|') === 'Copy this link:' && sel && sel.textContent === 'https://open.spotify.com/artist/r1', { t: tab.w.__toasts, html: d(tab).getElementById('toast').innerHTML });
      check('13 link toast stays up 15 s', delays.indexOf(15000) !== -1 && delays.lastIndexOf(15000) > delays.lastIndexOf(8000), delays);
      return H.wait(8200);
    }).then(function () {
      check('13 still showing after 8 s', !d(tab).getElementById('toast').hidden);
    });
  });
});

// 14. share rejects (not abort) and clipboard rejects -> toast with the link.
tests.push(function () {
  return setup().then(function (tab) {
    mockShare(tab, 'notallowed'); mockClipboard(tab, 'fail');
    tab.t().shareLink('X', 'https://open.spotify.com/playlist/p1');
    return H.wait(50).then(function () {
      var sel = d(tab).querySelector('#toast .tsel');
      check('14 share + copy fail shows the link', tab.w.__toasts.join('|') === 'Copy this link:' && sel && sel.textContent === 'https://open.spotify.com/playlist/p1', tab.w.__toasts);
    });
  });
});

// 15. Share works with no device and while Spotify is asleep (no playback request, nothing about waking).
tests.push(function () {
  return setup({ noDevice: true, setPlayer: playerFor(track()) }).then(function (tab) {
    tab.t().state.device = null;
    tab.t().openNp();
    return H.wait(100).then(function () {
      var b = npShare(tab);
      check('15 Share shown with no device', !!b);
      var log = mockShare(tab, 'ok');
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(50).then(function () {
        check('15 share called with no device', log.length === 1 && log[0].data.url === 'https://open.spotify.com/track/t1');
        check('15 no requests and no wake message', webCalls(tab).length === 0 && tab.w.__toasts.length === 0, { calls: tab.calls, toasts: tab.w.__toasts });
      });
    });
  });
});

// 16. Share in a header does not navigate or play (no PUT, detail still open).
tests.push(function () {
  return setup().then(function (tab) {
    tab.t().openDetail({ kind: 'album', id: 'a1', uri: 'spotify:album:a1', name: 'Album One', url: 'https://open.spotify.com/album/a1', img: '', sub: 'Album' });
    return H.wait(300).then(function () {
      mockShare(tab, 'ok');
      tab.calls.length = 0;
      click(tab, headShare(tab));
      return H.wait(50).then(function () {
        check('16 no play request', tab.calls.filter(function (c) { return c.method === 'PUT'; }).length === 0, tab.calls);
        check('16 still on the album', tab.t().state.detail && tab.t().state.detail.item.id === 'a1');
      });
    });
  });
});

// 17. No new localStorage keys written by sharing.
tests.push(function () {
  return setup().then(function (tab) {
    var before = Object.keys(tab.w.localStorage._m()).sort().join(',');
    mockShare(tab, null); mockClipboard(tab, 'ok');
    tab.t().shareLink('X', 'https://open.spotify.com/album/a1');
    return H.wait(50).then(function () {
      var after = Object.keys(tab.w.localStorage._m()).sort().join(',');
      check('17 no storage keys added', before === after, { before: before, after: after });
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
