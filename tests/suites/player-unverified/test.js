'use strict';
// player-unverified: STARTUP-3 + STARTUP-6 (the bar from storage, unverified until Spotify answers) and
// STARTUP-4 (coming back from a feature sign-in).
var H = require('./harness');
if (process.argv[2]) process.env.SRC = process.argv[2];
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }
var ASLEEP = 'Spotify is asleep. Press play to wake it.';
var BASE = 'https://richardtran324.github.io/spotify-library/';

function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function playLabel(tab) { return $(tab, 'pPlay').getAttribute('aria-label'); }
function barShown(tab) { return !$(tab, 'player').hidden; }
// A saved playback in the format saveLastPlay writes, for H.song()'s item.
function lastPlay(p, extra) {
  var it = p.item;
  var o = {
    item: { uri: it.uri, id: it.id, name: it.name, type: it.type, duration_ms: it.duration_ms,
      album: { id: it.album.id, name: it.album.name, images: [], uri: it.album.uri }, artists: [{ name: 'Artist' }], show: null },
    context: { type: 'album', uri: 'spotify:album:a1' }, positionMs: p.progress_ms, deviceId: 'A', shuffle: false, repeat: 'off',
    at: Date.now() - 60000
  };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return o;
}
function seedPlayer(store, cacheAgeMs, lpExtra, json) {
  var p = json || H.song();
  store.setItem('lib-lastplay', JSON.stringify(lastPlay(p, lpExtra)));
  if (cacheAgeMs != null) store.setItem('lib-player-cache', JSON.stringify({ at: Date.now() - cacheAgeMs, by: 'old-copy', json: p }));
  return p;
}
// env.player: what GET /me/player answers (null: 204), after env.delay ms. env.script: other answers, by method + path.
function tabFor(store, env, url) {
  env.req = [];
  return H.makeTab(store, function (method, path, q, body, call) {
    call.body = body && typeof body.get === 'function' ? body.toString() : body;
    env.req.push(call);
    var k = method + ' ' + path;
    if (env.script && env.script[k]) return env.script[k](q, body, call);
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player, delay: env.delay || 0 } : { status: 204, delay: env.delay || 0 };
  }, url ? { url: url } : null);
}
function playerGets(env) { return env.req.filter(function (c) { return c.method === 'GET' && c.path === '/me/player'; }); }
function setHidden(tab, h) {
  Object.defineProperty(d(tab), 'hidden', { configurable: true, get: function () { return h; } });
  d(tab).dispatchEvent(new tab.w.Event('visibilitychange'));
}

var tests = [];

// 1. A 60 s cache of the song the saved playback has: the bar shows at once, unverified, and nothing is written.
tests.push(function () {
  var store = H.seedStore();
  seedPlayer(store, 60000);
  var lp0 = store.getItem('lib-lastplay'), pc0 = store.getItem('lib-player-cache');
  var later = H.song(); later.progress_ms = 125000;
  var env = { player: later, delay: 800 };
  var tab = tabFor(store, env);
  var t = tab.t();
  check('1 bar shown before any player answer', barShown(tab) && $(tab, 'pTitle').textContent === 'Song One', { shown: barShown(tab), title: $(tab, 'pTitle').textContent });
  check('1 marked unverified, not asleep', t.state.playerUnverified === true && t.state.playerIdle === false, { u: t.state.playerUnverified, idle: t.state.playerIdle });
  check('1 button says Play while unverified', playLabel(tab) === 'Play' && $(tab, 'pPlay').innerHTML.length > 0, playLabel(tab));
  check('1 no asleep line', $(tab, 'pSub').textContent !== ASLEEP && $(tab, 'pSub').textContent.indexOf('Artist') === 0, $(tab, 'pSub').textContent);
  check('1 saved playback and cache byte-identical at paint', store.getItem('lib-lastplay') === lp0 && store.getItem('lib-player-cache') === pc0);
  return H.wait(400).then(function () {
    check('1 position does not count on while unverified', t.curPos() === 60000, t.curPos());
    check('1 still nothing written before the answer', store.getItem('lib-lastplay') === lp0, JSON.parse(store.getItem('lib-lastplay')));
    check('1 still unverified before the answer', t.state.playerUnverified === true && playLabel(tab) === 'Play');
    return H.wait(800);
  }).then(function () {
    check('1 the answer clears the flag and shows Pause', t.state.playerUnverified === false && playLabel(tab) === 'Pause', { u: t.state.playerUnverified, l: playLabel(tab) });
    check('1 the answer saves the playback as usual', t.readLastPlay().positionMs === 125000, t.readLastPlay().positionMs);
  });
});

// 2. The cache said playing, then Spotify answers 204: the saved spot is not moved on (no freeze while unverified).
tests.push(function () {
  var store = H.seedStore();
  seedPlayer(store, 60000);
  var env = { player: null, delay: 300 };
  var tab = tabFor(store, env);
  var t = tab.t();
  check('2 bar shown at start', barShown(tab) && playLabel(tab) === 'Play');
  return H.wait(700).then(function () {
    var o = t.readLastPlay();
    check('2 one player check answered', playerGets(env).length >= 1, playerGets(env).length);
    check('2 saved spot unchanged by the 204', o && o.positionMs === 60000, o && o.positionMs);
    check('2 no freeze mark added', o && o.frozenAt === undefined, o && o.frozenAt);
    check('2 now shown asleep, Play, flag cleared', t.state.playerIdle === true && t.state.playerUnverified === false && playLabel(tab) === 'Play' && $(tab, 'pSub').textContent === ASLEEP, $(tab, 'pSub').textContent);
    check('2 asleep bar at the saved spot', t.curPos() === 60000, t.curPos());
  });
});

// 3. A cache older than the saved playback's freeze: the saved playback is shown (paused), and a 204 keeps its spot.
tests.push(function () {
  var store = H.seedStore();
  seedPlayer(store, 60000, { positionMs: 50000, frozenAt: Date.now() - 30000 });
  var lp0 = store.getItem('lib-lastplay');
  var env = { player: null, delay: 300 };
  var tab = tabFor(store, env);
  var t = tab.t();
  check('3 saved playback shown at start, paused', barShown(tab) && t.state.playerIdle === true && t.state.playerUnverified === true && playLabel(tab) === 'Play');
  check('3 at the frozen spot, not the cache\'s', t.curPos() === 50000, t.curPos());
  check('3 no asleep line before Spotify answers', $(tab, 'pSub').textContent !== ASLEEP, $(tab, 'pSub').textContent);
  check('3 nothing written', store.getItem('lib-lastplay') === lp0);
  return H.wait(700).then(function () {
    var o = t.readLastPlay();
    check('3 after the 204: spot and freeze time unchanged', o.positionMs === 50000 && o.frozenAt === JSON.parse(lp0).frozenAt, o);
    check('3 after the 204: asleep line', $(tab, 'pSub').textContent === ASLEEP, $(tab, 'pSub').textContent);
  });
});

// 4. A 10-minute-old cache: too old to show as current, so the saved playback shows (paused) until the answer.
tests.push(function () {
  var store = H.seedStore();
  seedPlayer(store, 10 * 60000);
  var env = { player: H.song(), delay: 500 };
  var tab = tabFor(store, env);
  var t = tab.t();
  check('4 bar shown at start from the saved playback', barShown(tab) && t.state.playerIdle === true && t.state.playerUnverified === true, { idle: t.state.playerIdle });
  check('4 button says Play', playLabel(tab) === 'Play');
  return H.wait(800).then(function () {
    check('4 a playing answer replaces it', t.state.playerIdle === false && t.state.playerUnverified === false && playLabel(tab) === 'Pause');
  });
});

// 5. A fresh cache but no saved playback (or another song): nothing painted from the cache.
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-player-cache', JSON.stringify({ at: Date.now() - 30000, by: 'old-copy', json: H.song() }));
  var tab5 = tabFor(store, { player: null, delay: 300 });
  check('5 no saved playback: bar hidden until the answer', !barShown(tab5) && !tab5.t().state.playerUnverified);
  var store2 = H.seedStore();
  seedPlayer(store2, 30000, null, H.song('spotify:track:other'));
  var lp = JSON.parse(store2.getItem('lib-lastplay'));
  lp.item.uri = 'spotify:track:t1'; lp.item.name = 'Saved Song';
  store2.setItem('lib-lastplay', JSON.stringify(lp));
  var tab6 = tabFor(store2, { player: null, delay: 300 });
  check('5 cache for another song: the saved playback is shown instead', barShown(tab6) && $(tab6, 'pTitle').textContent === 'Saved Song' && tab6.t().state.playerIdle === true, $(tab6, 'pTitle').textContent);
  return H.wait(500);
});

// 6. Play pressed while unverified: it's sent, shows as playing, and a 404 keeps the saved spot.
tests.push(function () {
  var store = H.seedStore();
  seedPlayer(store, 60000);
  var env = { player: null, delay: 3000, script: {
    'PUT /me/player/play': function () { return { status: 404, json: { error: { status: 404, message: 'Device not found' } } }; }
  } };
  var tab = tabFor(store, env);
  var t = tab.t();
  return H.wait(100).then(function () {
    $(tab, 'pPlay').click();
    check('6 shows Pause right away', playLabel(tab) === 'Pause', playLabel(tab));
    return H.wait(300);
  }).then(function () {
    var puts = env.req.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
    check('6 Play sent PUT /me/player/play to the cached device', puts.length >= 1 && /device_id=A/.test(puts[0].query), puts);
    var o = t.readLastPlay();
    check('6 the 404 keeps the saved spot (no freeze)', o && o.positionMs === 60000 && o.frozenAt === undefined, o && { p: o.positionMs, f: o.frozenAt });
    check('6 shown asleep after the 404', t.state.playerIdle === true && t.state.playerUnverified === false);
  });
});

// 7. Back after longer than the song had left: Play, no counting on, and a 204 doesn't freeze it at the end.
tests.push(function () {
  var store = H.seedStore();
  var p = H.song(); p.item.duration_ms = 180000; p.progress_ms = 60000;
  var env = { player: p };
  var tab = tabFor(store, env);
  var t = tab.t();
  return H.wait(300).then(function () {
    check('7 playing before leaving', playLabel(tab) === 'Pause' && t.state.playerUnverified === false, playLabel(tab));
    setHidden(tab, true);
    t.state.playerAt = Date.now() - 10 * 60000;   // it played 10 minutes ago…
    t.state.lastPollAt = Date.now() - 10 * 60000;   // …and was last checked then
    env.player = null;
    env.req.length = 0;
    setHidden(tab, false);
    check('7 button says Play before any answer', playLabel(tab) === 'Play' && t.state.playerUnverified === true, playLabel(tab));
    check('7 position stops at the song end', t.curPos() === 180000, t.curPos());
    check('7 nothing sent yet (return delay)', playerGets(env).length === 0, env.req.map(function (c) { return c.path; }));
    return H.wait(250);
  }).then(function () {
    check('7 still not counting on', t.curPos() === 180000 && playLabel(tab) === 'Play', t.curPos());
    return H.wait(1200);
  }).then(function () {
    var o = t.readLastPlay();
    check('7 the 204 arrived', playerGets(env).length >= 1, env.req.map(function (c) { return c.path; }));
    check('7 saved spot not moved to the end', o && o.positionMs === 60000 && o.frozenAt === undefined, o && { p: o.positionMs, f: o.frozenAt });
    check('7 flag cleared, asleep', t.state.playerUnverified === false && t.state.playerIdle === true);
  });
});

// 8. Back with time left on the song: unchanged (Pause, counting on).
tests.push(function () {
  var store = H.seedStore();
  var p = H.song(); p.item.duration_ms = 180000; p.progress_ms = 60000;
  var env = { player: p };
  var tab = tabFor(store, env);
  var t = tab.t();
  return H.wait(300).then(function () {
    setHidden(tab, true);
    t.state.playerAt = Date.now() - 30000;
    setHidden(tab, false);
    check('8 still Pause, not unverified', playLabel(tab) === 'Pause' && t.state.playerUnverified === false);
    check('8 position counts on', t.curPos() >= 90000 && t.curPos() < 92000, t.curPos());
  });
});

// ---------- coming back from a feature sign-in ----------
var NEW_SCOPE = H.SCOPE + ' user-read-currently-playing playlist-modify-private';
var P1 = { kind: 'playlist', id: 'P1', name: 'Morning Run', uri: 'spotify:playlist:P1', url: 'https://open.spotify.com/playlist/P1', img: '', sub: 'Playlist', ownerId: 'me1', collaborative: false, count: 3 };
function signInStore(token, ask) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify('fakeclient'));
  if (token) s.setItem('lib-token', JSON.stringify(token));
  s.setItem('lib-filter', JSON.stringify('playlists'));
  s.setItem('lib-cache', JSON.stringify({ at: Date.now(), me: { id: 'me1', name: 'R' }, playlists: [P1], albums: [], artists: [], likedTotal: 5, shows: [], episodesTotal: 0 }));
  s.setItem('lib-state', JSON.stringify('st1'));
  s.setItem('lib-verifier', JSON.stringify('v'));
  if (ask) s.setItem('lib-perm-ask', JSON.stringify(ask));
  return s;
}
function tokenCalls(env, grant) { return env.req.filter(function (c) { return c.path === '/api/token' && (!grant || String(c.body).indexOf('grant_type=' + grant) !== -1); }); }
function exchangeEnv(delay) {
  return { player: null, script: {
    'POST /api/token': function (q, body) {
      if (String(body).indexOf('grant_type=authorization_code') !== -1) return { status: 200, json: { access_token: 'new', refresh_token: 'r2', expires_in: 3600, scope: NEW_SCOPE }, delay: delay };
      return { status: 200, json: { access_token: 'renewed-old', expires_in: 3600, scope: H.SCOPE }, delay: 50 };
    },
    'GET /playlists/P1/items': function () { return { status: 200, json: { items: [], next: null, total: 0 } }; }
  } };
}

// 9. Sign in to Spotify from inside a playlist stores the playlist with the sign-in record.
tests.push(function () {
  var store = signInStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE });
  var env = exchangeEnv(0);
  var tab = tabFor(store, env);
  var t = tab.t();
  return H.wait(200).then(function () {
    t.openDetail(JSON.parse(JSON.stringify(P1)));
    t.openPerm('edit');
    // jsdom has no crypto.subtle; login() only needs a digest to build the address
    Object.defineProperty(tab.w.crypto, 'subtle', { configurable: true, value: { digest: function () { return tab.w.Promise.resolve(new tab.w.ArrayBuffer(32)); } } });
    $(tab, 'permGo').click();
    return H.wait(150);
  }).then(function () {
    var ask = JSON.parse(store.getItem('lib-perm-ask') || 'null');
    check('9 record keeps the feature', ask && ask.feature === 'edit', ask);
    check('9 record keeps the open playlist', ask && ask.item && ask.item.kind === 'playlist' && ask.item.id === 'P1' && ask.item.name === 'Morning Run' && ask.item.ownerId === 'me1', ask && ask.item);
    check('9 went to Spotify', (tab.w.__nav || []).length >= 1 && /accounts\.spotify\.com\/authorize/.test(tab.w.__nav[0].url), tab.w.__nav);
  });
});

// 10. Old token still valid: the page and the playlist show at once; the sign-in finishes alongside.
tests.push(function () {
  var store = signInStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE }, { feature: 'edit', at: Date.now() - 20000, item: P1 });
  var env = exchangeEnv(800);
  var tab = tabFor(store, env, BASE + '?code=abc&state=st1');
  var t = tab.t();
  check('10 page running before the token answer', t.state.started === true && !$(tab, 'top').hidden, t.state.started);
  check('10 the playlist is open again', t.state.detail && t.state.detail.item.id === 'P1', t.state.detail && t.state.detail.item);
  check('10 URL cleaned', tab.w.location.search === '', tab.w.location.search);
  return H.wait(300).then(function () {
    check('10 page not empty while the sign-in finishes', $(tab, 'main').textContent.length > 0 && t.state.detail && t.state.detail.item.id === 'P1');
    check('10 no token renewal sent', tokenCalls(env, 'refresh_token').length === 0, tokenCalls(env));
    return H.wait(800);
  }).then(function () {
    var tok = JSON.parse(store.getItem('lib-token'));
    check('10 new sign-in saved with the new permission', tok.access === 'new' && tok.scope.indexOf('playlist-modify-private') !== -1, tok);
    check('10 toast says the feature is ready', tab.toasts().indexOf('Editing your playlists is ready. Try it again.') !== -1, tab.toasts());
    check('10 still on the playlist', t.state.detail && t.state.detail.item.id === 'P1');
    check('10 started once (one library load)', env.req.filter(function (c) { return c.path === '/me/playlists'; }).length === 1, env.req.filter(function (c) { return c.path === '/me/playlists'; }).length);
    check('10 sign-in record removed', store.getItem('lib-perm-ask') === null);
  });
});

// 11. Old token expired: the old order is kept (no renewal before the exchange), with the Finishing card meanwhile.
tests.push(function () {
  var store = signInStore({ access: 'fake', refresh: 'r', expires: Date.now() - 1000, scope: H.SCOPE }, { feature: 'edit', at: Date.now() - 20000, item: P1 });
  var env = exchangeEnv(800);
  var tab = tabFor(store, env, BASE + '?code=abc&state=st1');
  var t = tab.t();
  return H.wait(300).then(function () {
    check('11 Finishing sign-in card while waiting', /Finishing sign-in/.test($(tab, 'main').textContent), $(tab, 'main').textContent);
    check('11 page not started yet', t.state.started === false && $(tab, 'top').hidden);
    check('11 no token renewal before the exchange', tokenCalls(env, 'refresh_token').length === 0 && env.req.filter(function (c) { return c.host === 'api.spotify.com'; }).length === 0, env.req.map(function (c) { return c.path; }));
    return H.wait(900);
  }).then(function () {
    var tok = JSON.parse(store.getItem('lib-token'));
    check('11 new sign-in saved and kept', tok.access === 'new' && tok.scope.indexOf('playlist-modify-private') !== -1, tok);
    check('11 never renewed the old token', tokenCalls(env, 'refresh_token').length === 0, tokenCalls(env));
    check('11 page running on the playlist', t.state.started === true && t.state.detail && t.state.detail.item.id === 'P1');
  });
});

// 12. First-ever sign-in: the Finishing card instead of an empty page, then the page.
tests.push(function () {
  var store = signInStore(null, null);
  var env = exchangeEnv(600);
  var tab = tabFor(store, env, BASE + '?code=abc&state=st1');
  var t = tab.t();
  check('12 Finishing card at once', /Finishing sign-in/.test($(tab, 'main').textContent) && $(tab, 'top').hidden, $(tab, 'main').textContent);
  return H.wait(900).then(function () {
    check('12 page running after the exchange', t.state.started === true && !$(tab, 'top').hidden && !/Finishing sign-in/.test($(tab, 'main').textContent));
    check('12 nothing reopened', !t.state.detail);
  });
});

// 13. Cancelled feature sign-in: back on the playlist, with the usual message.
tests.push(function () {
  var store = signInStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE }, { feature: 'edit', at: Date.now() - 20000, item: P1 });
  var env = exchangeEnv(0);
  var tab = tabFor(store, env, BASE + '?error=access_denied&state=st1');
  var t = tab.t();
  return H.wait(200).then(function () {
    check('13 back on the playlist', t.state.started === true && t.state.detail && t.state.detail.item.id === 'P1', t.state.detail && t.state.detail.item);
    check('13 cancelled message', tab.toasts().indexOf('Nothing changed. Editing your playlists still needs that permission.') !== -1, tab.toasts());
    check('13 nothing sent to accounts', tokenCalls(env).length === 0);
  });
});

// 14. Running early, the old token runs out before the exchange answers: the renewal waits for the new sign-in.
tests.push(function () {
  var store = signInStore({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE }, { feature: 'edit', at: Date.now() - 20000, item: P1 });
  var env = exchangeEnv(800);
  var tab = tabFor(store, env, BASE + '?code=abc&state=st1');
  var t = tab.t();
  var t0 = Date.now(), meAt = 0;
  return H.wait(100).then(function () {
    var tok = JSON.parse(store.getItem('lib-token')); tok.expires = 0; store.setItem('lib-token', JSON.stringify(tok));   // e.g. a 401 on an old-token call
    t.api('/me').then(function () { meAt = Date.now(); });
    return H.wait(300);
  }).then(function () {
    check('14 no renewal of the old token while the sign-in finishes', tokenCalls(env, 'refresh_token').length === 0, tokenCalls(env));
    check('14 the waiting request not sent yet', meAt === 0);
    return H.wait(700);
  }).then(function () {
    var tok = JSON.parse(store.getItem('lib-token'));
    check('14 new sign-in kept (never overwritten by a renewal)', tok.access === 'new' && tok.scope.indexOf('playlist-modify-private') !== -1 && tokenCalls(env, 'refresh_token').length === 0, { tok: tok, calls: tokenCalls(env) });
    check('14 the waiting request went out after the exchange', meAt > 0 && meAt - t0 >= 790, meAt - t0);
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
