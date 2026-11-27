'use strict';
// Play on a whole list turns Spotify's Shuffle off; Shuffle turns it on; a song tap or Continue leaves it.
// Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var ALBUM = { kind: 'album', id: 'al1', uri: 'spotify:album:al1', name: 'Blue Album', url: 'https://open.spotify.com/album/al1', img: '' };
var PLAYLIST = { kind: 'playlist', id: 'pl1', uri: 'spotify:playlist:pl1', name: 'Road Trip', url: 'https://open.spotify.com/playlist/pl1', img: '' };
var SONG_IN_LIST = { kind: 'track', uri: 'spotify:track:t9', name: 'Song Nine', ctx: 'spotify:album:al1', url: 'https://open.spotify.com/track/t9' };
var CONTINUE = { kind: 'track', uri: 'spotify:track:t5', name: 'Song Five', ctx: 'spotify:playlist:pl1', positionMs: 83000, url: 'https://open.spotify.com/track/t5' };
var LONE_SONG = { kind: 'track', uri: 'spotify:track:t2', name: 'Song Two', url: 'https://open.spotify.com/track/t2' };

// opts.shuffleOn: what the last Now Playing check saw (null = no player known).
// opts.shuffleStatus: status for PUT /me/player/shuffle answers, in order (default 204).
function setup(opts) {
  opts = opts || {};
  var shuffleAnswers = (opts.shuffleStatus || []).slice();
  var tab = H.makeTab(H.seedStore(), function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (path === '/me/player/shuffle' && method === 'PUT') return { status: shuffleAnswers.length ? shuffleAnswers.shift() : 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R', country: 'US', product: 'premium' } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    if (opts.shuffleOn != null) {
      var p = H.song('spotify:track:t1', { playing: false });
      p.shuffle_state = !!opts.shuffleOn;
      t.setPlayer(p);
    } else {
      t.state.player = null;
    }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function playerPuts(tab) {
  return tab.calls.filter(function (c) { return c.method === 'PUT' && /^\/me\/player\/(play|shuffle)$/.test(c.path); })
    .map(function (c) { return c.path === '/me/player/shuffle' ? 'shuffle' + c.query.replace(/&.*$/, '') : 'play'; });
}
function shuffleCalls(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/shuffle'; }); }
function playCall(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; })[0]; }
function after(tab, fn) { return Promise.resolve(fn()).then(function () { return H.wait(150); }).then(function () { return tab; }); }

var tests = [];

// 1. Shuffle on, Play on an album: shuffle off first, then play the album in order.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    return after(tab, function () { return tab.t().play(ALBUM); }).then(function () {
      var seq = playerPuts(tab);
      check('1 shuffle off is sent before play', JSON.stringify(seq) === '["shuffle?state=false","play"]', seq);
      var s = shuffleCalls(tab)[0];
      check('1 shuffle off names the device', s && /[?&]device_id=A(&|$)/.test(s.query), s && s.query);
      var p = playCall(tab);
      check('1 play sends the album with no offset', p && p.body && p.body.context_uri === ALBUM.uri && !p.body.offset, p && p.body);
      check('1 bar now shows shuffle off', tab.t().state.player && tab.t().state.player.shuffle_state === false);
      check('1 toast says Playing', tab.w.__toasts.some(function (m) { return /^Playing “Blue Album”/.test(m); }), tab.w.__toasts);
    });
  });
});

// 2. Same for a playlist.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    return after(tab, function () { return tab.t().play(PLAYLIST); }).then(function () {
      var seq = playerPuts(tab);
      check('2 playlist: shuffle off then play', JSON.stringify(seq) === '["shuffle?state=false","play"]', seq);
    });
  });
});

// 3. Shuffle already off: no extra request.
tests.push(function () {
  return setup({ shuffleOn: false }).then(function (tab) {
    return after(tab, function () { return tab.t().play(ALBUM); }).then(function () {
      check('3 shuffle off already: only play is sent', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
    });
  });
});

// 4. No Now Playing answer known yet: no extra request.
tests.push(function () {
  return setup({ shuffleOn: null }).then(function (tab) {
    return after(tab, function () { return tab.t().play(ALBUM); }).then(function () {
      check('4 no player known: only play is sent', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
    });
  });
});

// 5. Shuffle button still turns shuffle on, whatever it was.
tests.push(function () {
  return setup({ shuffleOn: false }).then(function (tab) {
    return after(tab, function () { return tab.t().play(ALBUM, { shuffle: true }); }).then(function () {
      check('5 Shuffle: shuffle on then play', JSON.stringify(playerPuts(tab)) === '["shuffle?state=true","play"]', playerPuts(tab));
      check('5 bar now shows shuffle on', tab.t().state.player.shuffle_state === true);
      check('5 toast says Shuffling', tab.w.__toasts.some(function (m) { return /^Shuffling “Blue Album”/.test(m); }), tab.w.__toasts);
    });
  });
});

// 6. A song tapped inside a list keeps Spotify's shuffle.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    return after(tab, function () { return tab.t().play(SONG_IN_LIST); }).then(function () {
      check('6 song tap: no shuffle request', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
      check('6 bar still shows shuffle on', tab.t().state.player.shuffle_state === true);
    });
  });
});

// 7. Continue (a song inside the list, at a spot) keeps Spotify's shuffle.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    return after(tab, function () { return tab.t().play(CONTINUE); }).then(function () {
      check('7 Continue: no shuffle request', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
      var p = playCall(tab);
      check('7 Continue still sends offset and spot', p && p.body.offset && p.body.offset.uri === CONTINUE.uri && p.body.position_ms === 83000, p && p.body);
    });
  });
});

// 8. A single song (no list) keeps Spotify's shuffle.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    return after(tab, function () { return tab.t().play(LONE_SONG); }).then(function () {
      check('8 lone song: no shuffle request', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
    });
  });
});

// 9. A failed shuffle off is sent once more after play works.
tests.push(function () {
  return setup({ shuffleOn: true, shuffleStatus: [403, 204] }).then(function (tab) {
    return after(tab, function () { return tab.t().play(ALBUM); }).then(function () {
      var seq = playerPuts(tab);
      check('9 retry once after play', JSON.stringify(seq) === '["shuffle?state=false","play","shuffle?state=false"]', seq);
      check('9 bar shows shuffle off after the retry', tab.t().state.player.shuffle_state === false);
    });
  });
});

// 10. Liked Songs Play (whole collection) turns shuffle off too.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    var t = tab.t();
    t.state.data = t.state.data || {};
    t.state.data.me = t.state.data.me || { id: 'me1' };
    var liked = { kind: 'liked', id: 'liked', uri: t.likedCtx(), name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks', img: '' };
    return after(tab, function () { return t.play(liked); }).then(function () {
      check('10 Liked Songs: shuffle off then play', JSON.stringify(playerPuts(tab)) === '["shuffle?state=false","play"]', playerPuts(tab));
    });
  });
});

// 11. The list's own Play and Shuffle buttons.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    var t = tab.t(), doc = tab.w.document;
    t.openDetail(ALBUM);
    return H.wait(400).then(function () {
      tab.calls.length = 0;
      var btns = [].slice.call(doc.querySelectorAll('.dhead a.btn'));
      var playBtn = btns.filter(function (b) { return b.textContent === 'Play'; })[0];
      var shufBtn = btns.filter(function (b) { return b.textContent === 'Shuffle'; })[0];
      check('11 list shows Play and Shuffle', !!playBtn && !!shufBtn);
      if (!playBtn || !shufBtn) return;
      playBtn.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true }));
      return H.wait(200).then(function () {
        check('11 Play button: shuffle off then play', JSON.stringify(playerPuts(tab)) === '["shuffle?state=false","play"]', playerPuts(tab));
        tab.calls.length = 0;
        t.state.deviceAt = Date.now();
        shufBtn.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true }));
        return H.wait(200);
      }).then(function () {
        check('11 Shuffle button: shuffle on then play', JSON.stringify(playerPuts(tab)) === '["shuffle?state=true","play"]', playerPuts(tab));
      });
    });
  });
});

// 12. Liked songs by an artist (a song list with no context): Play turns shuffle off, a song tap doesn't.
tests.push(function () {
  return setup({ shuffleOn: true }).then(function (tab) {
    var t = tab.t();
    var list = { kind: 'likedby', artistId: 'ar1', name: 'Liked songs by Artist', uri: null, url: 'https://open.spotify.com/artist/ar1', img: '',
      uris: ['spotify:track:a', 'spotify:track:b', 'spotify:track:c'] };
    return after(tab, function () { return t.play(list); }).then(function () {
      check('12 liked-by-artist Play: shuffle off then play', JSON.stringify(playerPuts(tab)) === '["shuffle?state=false","play"]', playerPuts(tab));
      var p = playCall(tab);
      check('12 liked-by-artist Play keeps the song order', p && p.body && JSON.stringify(p.body.uris) === JSON.stringify(list.uris), p && p.body);
      t.state.player.shuffle_state = true;
      tab.calls.length = 0;
      var song = { kind: 'track', uri: 'spotify:track:b', name: 'B', ctx: null, url: 'https://open.spotify.com/track/b',
        uris: ['spotify:track:b', 'spotify:track:c', 'spotify:track:a'] };
      return after(tab, function () { return t.play(song); });
    }).then(function () {
      check('12 song tap in that list: no shuffle request', JSON.stringify(playerPuts(tab)) === '["play"]', playerPuts(tab));
    });
  });
});

var chain = Promise.resolve();
tests.forEach(function (fn, i) {
  chain = chain.then(fn).catch(function (e) { results.push('FAIL test ' + (i + 1) + ' threw  ' + (e && e.stack || e)); });
});
chain.then(function () {
  results.forEach(function (r) { console.log(r); });
  var fail = results.filter(function (r) { return /^FAIL/.test(r); }).length;
  console.log('\n' + (results.length - fail) + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
