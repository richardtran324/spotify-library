'use strict';
// Checks for six fixes found by tests: "1 song" (not "1 songs") everywhere a song count is shown; rows that arrive
// after Edit was tapped during Search all are edit rows; signing out closes the Add to playlist and permission
// sheets; a sign-in callback with no check value is refused; a podcast page kept this visit isn't asked again
// after reopening; a search while search is paused isn't saved as a recent search.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var BASE = 'https://richardtran324.github.io/spotify-library/';
var API = 'https://api.spotify.com/v1';
var EDIT_SCOPE = 'playlist-modify-private';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var MIN = 60000, HOUR = 60 * MIN;

// ---------- helpers ----------
var LIVE = [];
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function txt(node) { return node ? node.textContent : null; }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function getJ(store, k) { var v = store.getItem(k); return v ? JSON.parse(v) : null; }
function heading(tab) { var h = $(tab, 'main').querySelector('h2'); return h ? h.textContent : ''; }
function errText(tab) { var e = $(tab, 'main').querySelector('.err'); return e ? e.textContent : ''; }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function tokenReqs(tab) { return tab.env.all.filter(function (c) { return c.host === 'accounts.spotify.com'; }); }
function plOpen(tab) { return !$(tab, 'plsheet').hidden; }
function permOpen(tab) { return !$(tab, 'perm').hidden; }
// Polls fn every 20 ms until it is true or `ms` pass; resolves with the last value.
function until(fn, ms) {
  var end = Date.now() + (ms || 3000);
  return new Promise(function (resolve) {
    (function loop() {
      var v = false;
      try { v = fn(); } catch (e) { v = false; }
      if (v || Date.now() > end) return resolve(!!v);
      setTimeout(loop, 20);
    })();
  });
}
function close(tab) { LIVE = LIVE.filter(function (t) { return t !== tab; }); try { tab.w.close(); } catch (e) {} }

function store(o) {
  o = o || {};
  var s = H.seedStore();
  s.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE + (o.edit ? ' ' + EDIT_SCOPE : '') }));
  Object.keys(o.extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(o.extra[k])); });
  return s;
}
// opts.route answers first; then the library (env.pls, liked total), playlist pages and adds, the player.
// env.pageDelay(id, offset) holds back a playlist page; env.auth answers accounts.spotify.com.
function setup(s, opts) {
  opts = opts || {};
  var env = { pls: opts.pls || {}, liked: opts.liked == null ? 0 : opts.liked, pageDelay: null, auth: opts.auth || null, seq: 0, all: [] };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    call.q = q; call.body = body == null ? null : String(body);
    env.all.push(call);   // every request since the page loaded (tab.calls is cleared after start)
    if (call.host === 'accounts.spotify.com') return env.auth ? env.auth(new URLSearchParams(String(body))) : { status: 400, json: { error: 'invalid_grant' } };
    if (opts.route) { var r = opts.route(method, path, q, body, call); if (r) return r; }
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/playlists') {
      return { status: 200, json: { items: Object.keys(env.pls).map(function (k) { return apiPlaylist(k, env.pls[k]); }), next: null, total: Object.keys(env.pls).length } };
    }
    if (path === '/me/tracks') return { status: 200, json: { items: [], next: null, total: env.liked } };
    var m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m && env.pls[m[1]]) {
      var pl = env.pls[m[1]];
      if (method === 'GET') {
        var off = +(q.get('offset') || 0), lim = +(q.get('limit') || 50);
        var items = pl.ids.slice(off, off + lim).map(function (id) { return { added_at: '2026-01-01T00:00:00Z', is_local: false, item: track(id) }; });
        return { status: 200, delay: env.pageDelay ? env.pageDelay(m[1], off) : 0,
          json: { items: items, total: pl.ids.length, offset: off, limit: lim, next: off + lim < pl.ids.length ? API + path + '?offset=' + (off + lim) + '&limit=' + lim : null } };
      }
      if (method === 'POST') {
        pl.ids = pl.ids.concat((JSON.parse(body || '{}').uris || []).map(function (u) { return u.split(':')[2]; }));
        pl.snap = 'v' + (++env.seq);
        return { status: 201, json: { snapshot_id: pl.snap } };
      }
    }
    if (path === '/me/library/contains' || /\/contains$/.test(path)) return { status: 200, json: (q.get('uris') || q.get('ids') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  }, { url: opts.url || BASE });
  tab.env = env;
  LIVE.push(tab);
  return H.wait(opts.wait || 400).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    return opts.noLibrary ? true : until(function () { return !!t.state.data; }, 3000);
  }).then(function () {
    var t = tab.t();
    if (t.state.started) { t.state.device = DEV; t.state.deviceAt = Date.now() + HOUR; }
    tab.calls.length = 0;
    tab.w.__toasts = tab.w.__toasts || [];
    return tab;
  });
}
function apiPlaylist(id, p) {
  return { id: id, name: p.name, uri: 'spotify:playlist:' + id, images: [], collaborative: false, snapshot_id: p.snap || 'v0',
    owner: { id: p.owner || 'me1', display_name: p.owner && p.owner !== 'me1' ? p.owner : 'R' }, items: { total: p.ids.length } };
}
function track(id) {
  var n = +String(id).replace(/\D/g, '');
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Track ' + n, duration_ms: 180000 + n * 1000,
    artists: [{ id: 'ar1', name: 'Band A' }], album: { id: 'al1', name: 'Record', images: [] } };
}
function ids(pre, from, to) { var a = []; for (var i = from; i < to; i++) a.push(pre + i); return a; }
function playerFor(item) {
  return { item: item, currently_playing_type: item.type, context: { type: 'album', uri: 'spotify:album:al1' }, is_playing: true, progress_ms: 1000,
    device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function plRow(tab, id) { return d(tab).querySelector('#plList .devrow[data-pl="' + id + '"]'); }
function plRowSub(tab, id) { var r = plRow(tab, id); return r ? txt(r.querySelector('.sub')) : null; }
function libRowSub(tab, name) {
  var a = qa(tab, '#main ul.list a.item').filter(function (x) { return txt(x.querySelector('.name')) === name; })[0];
  return a ? txt(a.querySelector('.sub')) : null;
}
function cardSubOf(tab, name) {
  var a = qa(tab, '#main ul.cl[aria-labelledby="hPlaylists"] a.clcard').filter(function (x) { return txt(x.querySelector('.clname')) === name; })[0];
  return a ? txt(a.querySelector('.sub')) : null;
}
function cachePl(s, id) { var c = getJ(s, 'lib-cache'); return c && (c.playlists || []).filter(function (p) { return p.id === id; })[0]; }

var tests = [];

// ---------- 1. "1 song", not "1 songs" ----------
function countLibrary() {
  return {
    pOne: { name: 'Single Mix', ids: ['s1'] },
    pNone: { name: 'Blank Mix', ids: [] },
    pTwo: { name: 'Pair Mix', ids: ['s2', 's3'] }
  };
}
// 1a. Library rows, Liked Songs and Home cards from a real library load.
tests.push(function () {
  var s = store({ edit: true, extra: { 'lib-filter': 'home', 'lib-pins': [] } });
  return setup(s, { pls: countLibrary(), liked: 1 }).then(function (tab) {
    var t = tab.t();
    check('1 home: Liked Songs with 1 song says "1 song"', txt(d(tab).querySelector('#main ul.list.hero .sub')) === 'Playlist · 1 song', txt(d(tab).querySelector('#main ul.list.hero .sub')));
    check('1 home card: playlist with 1 song says "1 song"', cardSubOf(tab, 'Single Mix') === '1 song', cardSubOf(tab, 'Single Mix'));
    check('1 home card: 2 songs and 0 songs as before', cardSubOf(tab, 'Pair Mix') === '2 songs' && cardSubOf(tab, 'Blank Mix') === 'Playlist', [cardSubOf(tab, 'Pair Mix'), cardSubOf(tab, 'Blank Mix')]);
    t.setFilter('playlists');
    check('1 playlists tab: row with 1 song says "1 song"', libRowSub(tab, 'Single Mix') === 'Playlist · R · 1 song', libRowSub(tab, 'Single Mix'));
    check('1 playlists tab: 2 songs and 0 songs as before', libRowSub(tab, 'Pair Mix') === 'Playlist · R · 2 songs' && libRowSub(tab, 'Blank Mix') === 'Playlist · R', [libRowSub(tab, 'Pair Mix'), libRowSub(tab, 'Blank Mix')]);
    check('1 playlists tab: Liked Songs with 1 song says "1 song"', libRowSub(tab, 'Liked Songs') === 'Playlist · 1 song', libRowSub(tab, 'Liked Songs'));
    check('1 saved library copy says "1 song"', (cachePl(s, 'pOne') || {}).sub === 'Playlist · R · 1 song', cachePl(s, 'pOne'));
    var ow = { id: 'me1', display_name: 'R' };
    check('1 mapPlaylist: 1 song / 2 songs / none', t.mapPlaylist({ id: 'x', owner: ow, items: { total: 1 } }).sub === 'Playlist · R · 1 song' &&
      t.mapPlaylist({ id: 'x', owner: ow, tracks: { total: 2 } }).sub === 'Playlist · R · 2 songs' && t.mapPlaylist({ id: 'x', owner: ow, items: { total: 0 } }).sub === 'Playlist · R',
      [1, 2, 0].map(function (n) { return t.mapPlaylist({ id: 'x', owner: ow, items: { total: n } }).sub; }));
    check('1 likedItem: 1 song / 2 songs / 0 songs', t.likedItem({ likedTotal: 1 }).sub === 'Playlist · 1 song' && t.likedItem({ likedTotal: 2 }).sub === 'Playlist · 2 songs' && t.likedItem({ likedTotal: 0 }).sub === 'Playlist · 0 songs',
      [1, 2, 0].map(function (n) { return t.likedItem({ likedTotal: n }).sub; }));
    check('1 cardSub: 1 song / 2 songs / Playlist', t.cardSub({ kind: 'playlist', count: 1 }) === '1 song' && t.cardSub({ kind: 'playlist', count: 2 }) === '2 songs' && t.cardSub({ kind: 'playlist', count: 0 }) === 'Playlist',
      [1, 2, 0].map(function (n) { return t.cardSub({ kind: 'playlist', count: n }); }));
    close(tab);
  });
});
// 1b. The Add to playlist sheet, an add that makes 1 song, and setPlCount over an old saved "· 1 songs".
tests.push(function () {
  var s = store({ edit: true, extra: { 'lib-filter': 'playlists', 'lib-pins': [] } });
  return setup(s, { pls: countLibrary() }).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerFor(track('s7')));
    t.openAddPl();
    check('1 sheet: playlist with 1 song says "1 song"', plOpen(tab) && plRowSub(tab, 'pOne') === '1 song', plRowSub(tab, 'pOne'));
    check('1 sheet: 2 songs and 0 songs as before', plRowSub(tab, 'pTwo') === '2 songs' && plRowSub(tab, 'pNone') === '', [plRowSub(tab, 'pTwo'), plRowSub(tab, 'pNone')]);
    click(tab, plRow(tab, 'pNone'));
    return until(function () { return !plOpen(tab); }, 2000).then(function () {
      var p = t.libraryPlaylist('pNone') || {};
      check('1 add to an empty playlist: "· 1 song" in the library and saved copy', reqs(tab, 'POST', '/playlists/pNone/items').length === 1 && p.count === 1 && p.sub === 'Playlist · R · 1 song' &&
        (cachePl(s, 'pNone') || {}).sub === 'Playlist · R · 1 song', { sub: p.sub, saved: cachePl(s, 'pNone'), toasts: tab.toasts() });
      t.setFilter('home'); t.setFilter('playlists');   // drawn again from the library
      check('1 the playlists tab shows it', libRowSub(tab, 'Blank Mix') === 'Playlist · R · 1 song', libRowSub(tab, 'Blank Mix'));
      var two = t.libraryPlaylist('pTwo');
      two.sub = 'Playlist · R · 1 songs';   // as an older version of the page saved it
      t.setPlCount('pTwo', 1);
      check('1 setPlCount: an old saved "· 1 songs" becomes "· 1 song"', two.sub === 'Playlist · R · 1 song' && (cachePl(s, 'pTwo') || {}).sub === 'Playlist · R · 1 song', two.sub);
      t.setPlCount('pTwo', 2);
      check('1 setPlCount: "· 1 song" then 2 becomes "· 2 songs"', two.sub === 'Playlist · R · 2 songs', two.sub);
      t.setPlCount('pTwo', 0);
      check('1 setPlCount: 0 drops the count', two.sub === 'Playlist · R' && two.count === 0, two.sub);
      close(tab);
    });
  });
});

// ---------- 2. Edit tapped while Search all still has a page coming ----------
// A playlist page is a catalog request, so Search all asks one page at a time; Edit stops it after the page in flight,
// which then arrives while editing.
tests.push(function () {
  var s = store({ edit: true, extra: { 'lib-filter': 'playlists', 'lib-pins': [] } });
  return setup(s, { pls: { pLong: { name: 'Long mix', ids: ids('t', 0, 130) } } }).then(function (tab) {
    var t = tab.t();
    tab.env.pageDelay = function (id, off) { return off >= 100 ? 300 : off >= 50 ? 150 : 0; };
    t.openDetail(t.libraryPlaylist('pLong'));
    return until(function () { return qa(tab, '#dlist li.row').length === 50 && !t.state.detail.loading; }, 2000).then(function () {
      var inp = $(tab, 'dfind');
      inp.value = 'track 12'; inp.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      var all = $(tab, 'dfindAll');
      check('2 Search all offered', !!all, $(tab, 'dfoot') && $(tab, 'dfoot').textContent);
      tab.calls.length = 0;
      click(tab, all);
      return H.wait(30);
    }).then(function () {
      check('2 Search all running, page 2 asked', !!t.state.detail.findRun && reqs(tab, 'GET', '/playlists/pLong/items').length === 1, tab.calls.map(function (c) { return c.url; }));
      click(tab, $(tab, 'deditBtn'));
      check('2 Edit on while pages are coming', t.state.detail.editing === true && qa(tab, '#dlist li.editrow').length === 50);
      return until(function () { return !t.state.detail.findRun && t.state.detail.items.length === 100; }, 4000);
    }).then(function () {
      return H.wait(30);
    }).then(function () {
      var li = qa(tab, '#dlist li');
      var late = li.slice(50);
      var plain = li.filter(function (x) { return !x.classList.contains('editrow'); });
      check('2 every loaded row shown, still editing', li.length === 100 && t.state.detail.editing === true, { n: li.length, editing: t.state.detail.editing });
      check('2 rows that came late are edit rows, none plain', late.length === 50 && plain.length === 0, { late: late.length, plain: plain.length, firstPlain: plain[0] && plain[0].className });
      check('2 each late row has −, up and down', late.length === 50 && late.every(function (x) { return x.querySelector('[data-edit="rm"]') && x.querySelector('[data-edit="up"]') && x.querySelector('[data-edit="down"]'); }));
      var b = function (k, w) { var r = li[k]; return r && r.querySelector('[data-edit="' + w + '"]'); };
      check('2 the old last row can move down now; the new last row can\'t', b(49, 'down') && !b(49, 'down').disabled && b(99, 'down') && b(99, 'down').disabled && !b(99, 'up').disabled,
        { r49: b(49, 'down') && b(49, 'down').disabled, r99: b(99, 'down') && b(99, 'down').disabled });
      check('2 nothing more asked; Load more left for the rest', reqs(tab, 'GET', '/playlists/pLong/items').length === 1 && !!footBtn(tab, 'Load more'), $(tab, 'dfoot').textContent);
      close(tab);
    });
  });
});

// ---------- 3. Signing out closes the Add to playlist and permission sheets ----------
// 3a. Both open (no edit permission yet), then the sign-in screen.
tests.push(function () {
  var s = store({ edit: false, extra: { 'lib-filter': 'playlists', 'lib-pins': [] } });
  return setup(s, { pls: countLibrary() }).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerFor(track('s7')));
    t.openAddPl();
    click(tab, plRow(tab, 'pOne'));
    check('3 Add to playlist and permission sheets open', plOpen(tab) && permOpen(tab), { pl: plOpen(tab), perm: permOpen(tab) });
    t.renderSignIn();
    check('3 sign-in screen closes both sheets', heading(tab) === 'Sign in' && !plOpen(tab) && !permOpen(tab), { h: heading(tab), pl: plOpen(tab), perm: permOpen(tab) });
    close(tab);
  });
});
// 3b. A signed-out error while adding (the refresh is refused): the sheet goes with the sign-in.
tests.push(function () {
  var s = store({ edit: true, extra: { 'lib-filter': 'playlists', 'lib-pins': [] } });
  return setup(s, { pls: countLibrary() }).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerFor(track('s7')));
    t.openAddPl();
    var tok = getJ(s, 'lib-token');
    tok.expires = Date.now() - 1000;   // needs a refresh, which Spotify refuses (invalid_grant)
    s.setItem('lib-token', JSON.stringify(tok));
    click(tab, plRow(tab, 'pTwo'));
    return until(function () { return heading(tab) === 'Sign in'; }, 2000).then(function () {
      check('3 signed out while adding: sign-in screen', heading(tab) === 'Sign in' && tokenReqs(tab).length === 1 && s.getItem('lib-token') === null, { h: heading(tab), auth: tokenReqs(tab).length });
      check('3 signed out while adding: Add to playlist sheet closed', !plOpen(tab) && reqs(tab, 'POST', '/playlists/pTwo/items').length === 0);
      close(tab);
    });
  });
});
// 3c. The permission sheet open, then the setup screen (Change Client ID path).
tests.push(function () {
  var s = store({ edit: false, extra: { 'lib-filter': 'playlists', 'lib-pins': [] } });
  return setup(s, { pls: countLibrary() }).then(function (tab) {
    var t = tab.t();
    var ok = t.needFeature('edit');
    check('3 permission sheet open', ok === false && permOpen(tab));
    t.renderSetup();
    check('3 setup screen closes the permission sheet', !!$(tab, 'clientId') && !permOpen(tab) && !plOpen(tab), { perm: permOpen(tab) });
    close(tab);
  });
});

// ---------- 4. Sign-in callback without a check value ----------
var CLIENT = '0123456789abcdef0123456789ABCDEF';
function clientStore(extra) {
  var s = H.makeStore();
  s.setItem('lib-client-id', JSON.stringify(CLIENT));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
function okAuth() { return { status: 200, json: { access_token: 'NEW', refresh_token: 'RN', expires_in: 3600, scope: H.SCOPE, token_type: 'Bearer' } }; }
// 4a. ?code= with no state and nothing saved, not signed in: refused, no token request.
tests.push(function () {
  var s = clientStore();
  return setup(s, { url: BASE + '?code=abc', auth: okAuth, noLibrary: true }).then(function (tab) {
    check('4 no state, none saved, signed out: no token request', tokenReqs(tab).length === 0 && s.getItem('lib-token') === null, tokenReqs(tab).map(function (c) { return c.url; }));
    check('4 no state, none saved, signed out: sign-in screen says the check failed', heading(tab) === 'Sign in' && errText(tab) === 'Sign-in check failed. Please try again.' && tab.t().state.started === false, { h: heading(tab), e: errText(tab) });
    check('4 address cleaned', tab.w.location.href === BASE, tab.w.location.href);
    close(tab);
  });
});
// 4b. The same with a working sign-in: stays signed in and says so.
tests.push(function () {
  var s = H.seedStore();
  return setup(s, { url: BASE + '?code=abc', auth: okAuth, noLibrary: true, wait: 500 }).then(function (tab) {
    var tok = getJ(s, 'lib-token') || {};
    check('4 no state, none saved, signed in: no token request, token kept', tokenReqs(tab).length === 0 && tok.access === 'fake', { auth: tokenReqs(tab).length, tok: tok.access });
    check('4 no state, none saved, signed in: app started with a toast', tab.t().state.started === true && tab.toasts().indexOf('Sign-in check failed. You’re still signed in.') !== -1, { started: tab.t().state.started, toasts: tab.toasts() });
    close(tab);
  });
});
// 4c. A state sent but none saved, signed in: same as 4b.
tests.push(function () {
  var s = H.seedStore();
  return setup(s, { url: BASE + '?code=abc&state=st1', auth: okAuth, noLibrary: true, wait: 500 }).then(function (tab) {
    check('4 state but none saved, signed in: stays signed in', tokenReqs(tab).length === 0 && tab.t().state.started === true && tab.toasts().indexOf('Sign-in check failed. You’re still signed in.') !== -1,
      { auth: tokenReqs(tab).length, started: tab.t().state.started, toasts: tab.toasts(), h: heading(tab) });
    close(tab);
  });
});
// 4d. A normal callback still signs in.
tests.push(function () {
  var s = clientStore({ 'lib-verifier': 'V'.repeat(64), 'lib-state': 'st1' });
  return setup(s, { url: BASE + '?code=abc&state=st1', auth: okAuth, noLibrary: true, wait: 500 }).then(function (tab) {
    var tr = tokenReqs(tab), f = new URLSearchParams(tr[0] ? tr[0].body || '' : '');
    var tok = getJ(s, 'lib-token') || {};
    check('4 matching state: one token request, signed in', tr.length === 1 && tok.access === 'NEW' && tab.t().state.started === true && s.getItem('lib-state') === null, { n: tr.length, tok: tok.access });
    close(tab);
  });
});
// 4e. ?error= with nothing saved: the cancelled message, as before.
tests.push(function () {
  var s = clientStore();
  return setup(s, { url: BASE + '?error=access_denied', auth: okAuth, noLibrary: true }).then(function (tab) {
    check('4 error callback: cancelled message, nothing sent', heading(tab) === 'Sign in' && errText(tab) === 'Spotify sign-in was cancelled or failed (access_denied).' && tokenReqs(tab).length === 0, { e: errText(tab) });
    close(tab);
  });
});

// ---------- 5. A podcast's page 2 isn't asked again after reopening ----------
function spEp(id, showId, days) {
  return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Episode ' + id, release_date: new Date(Date.now() - days * 24 * HOUR).toISOString().slice(0, 10),
    duration_ms: HOUR, images: [], show: { id: showId, name: 'Pod ' + showId, images: [] }, description: 'Notes', html_description: '<p>Notes</p>', is_playable: true,
    resume_point: { fully_played: false, resume_position_ms: 0 } };
}
// Spotify's own answer: `next` is its full link.
function showEps(showId, from, n, total) {
  var items = [];
  for (var i = from; i < Math.min(from + n, total); i++) items.push(spEp(showId + '-' + i, showId, i));
  return { items: items, total: total, offset: from, limit: n, next: from + n < total ? API + '/shows/' + showId + '/episodes?offset=' + (from + n) + '&limit=' + n : null };
}
function showItem(id) { return { kind: 'show', id: id, uri: 'spotify:show:' + id, name: 'Pod ' + id, url: 'https://open.spotify.com/show/' + id, img: '', sub: 'Podcast' }; }
function footBtn(tab, text) { return qa(tab, '#dfoot button').filter(function (b) { return b.textContent === text; })[0]; }
tests.push(function () {
  var s = store({ extra: { 'lib-filter': 'albums' } });
  return setup(s, { route: function (method, path, q) {
    if (path === '/shows/pq/episodes' && q.get('limit') === '50') return { status: 200, json: showEps('pq', +q.get('offset'), 50, 120), delay: 20 };
  } }).then(function (tab) {
    var t = tab.t();
    function eps() { return reqs(tab, 'GET', '/shows/pq/episodes'); }
    function rows() { return qa(tab, '#dlist li').length; }
    t.openDetail(showItem('pq'));
    return until(function () { return rows() === 50 && !t.state.detail.loading; }, 2000).then(function () {
      check('5 page 1: one request, 50 episodes', eps().length === 1 && rows() === 50, eps().map(function (c) { return c.query; }));
      click(tab, footBtn(tab, 'Load more'));
      return until(function () { return rows() === 100 && !t.state.detail.loading; }, 2000);
    }).then(function () {
      check('5 Load more: page 2 asked once', eps().length === 2 && /offset=50/.test(eps()[1].query) && rows() === 100, eps().map(function (c) { return c.query; }));
      t.closeDetail();
      t.openDetail(showItem('pq'));
      return until(function () { return rows() === 50; }, 2000);
    }).then(function () {
      return H.wait(60);
    }).then(function () {
      check('5 reopened this visit: the saved 50, nothing asked', eps().length === 2 && rows() === 50 && !!footBtn(tab, 'Load more'), { n: eps().length, rows: rows() });
      click(tab, footBtn(tab, 'Load more'));
      return until(function () { return rows() === 100 && !t.state.detail.loading; }, 2000);
    }).then(function () {
      check('5 reopened, Load more: page 2 comes from this visit, not asked again', eps().length === 2 && rows() === 100, { asked: eps().map(function (c) { return c.query; }), rows: rows() });
      click(tab, footBtn(tab, 'Load more'));
      return until(function () { return rows() === 120 && !t.state.detail.loading; }, 2000);
    }).then(function () {
      var e = eps();
      check('5 then Load more asks page 3 once', e.length === 3 && /offset=100/.test(e[2].query) && rows() === 120 && !footBtn(tab, 'Load more'), { asked: e.map(function (c) { return c.query; }), rows: rows() });
      close(tab);
    });
  });
});

// ---------- 6. A search while search is paused isn't a recent search ----------
function coolRec(group) {
  var o = {};
  o[group] = { until: Date.now() + 10 * MIN, reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null,
    last429: { at: Date.now(), reason: 'rate limit', retryAfter: null, what: 'GET /search' } };
  return o;
}
function emptyAll() {
  var p = { items: [], next: null, total: 0 };
  return { tracks: p, artists: p, albums: p, playlists: p, shows: p, episodes: p };
}
function searchIn(tab, q) {
  var box = $(tab, 'search');
  box.value = q;
  box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
  box.dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function recentQs(s) { return (getJ(s, 'lib-recent-searches') || []).map(function (x) { return x.q; }); }
tests.push(function () {
  var route = function (method, path) { if (path === '/search') return { status: 200, json: emptyAll() }; };
  var s = store({ extra: { 'lib-filter': 'search', 'lib-cooloff': coolRec('search') } });
  return setup(s, { route: route }).then(function (tab) {
    var t = tab.t();
    check('6 search is paused', t.coolLeft('search') > 0);
    searchIn(tab, 'paused words');
    return H.wait(700).then(function () {
      check('6 paused: nothing sent', reqs(tab, 'GET', '/search').length === 0, tab.calls.map(function (c) { return c.path; }));
      check('6 paused: not saved as a recent search', recentQs(s).indexOf('paused words') === -1 && t.recentSearches().length === 0, recentQs(s));
      close(tab);
      var s2 = store({ extra: { 'lib-filter': 'search' } });
      return setup(s2, { route: route }).then(function (tab2) {
        searchIn(tab2, 'paused words');
        return until(function () { return reqs(tab2, 'GET', '/search').length > 0; }, 2000).then(function () {
          check('6 not paused: the same search is sent and saved', reqs(tab2, 'GET', '/search').length === 1 && recentQs(s2)[0] === 'paused words', { n: reqs(tab2, 'GET', '/search').length, recent: recentQs(s2) });
          close(tab2);
        });
      });
    });
  });
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  LIVE.slice().forEach(close);
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
});
