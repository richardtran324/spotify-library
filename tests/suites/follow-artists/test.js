'use strict';
// Follow artists + feature permission sign-in (v2.25) tests: jsdom, mocked fetch, shared localStorage.
// Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var crypto = require('crypto');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var FOLLOW_SCOPE = 'user-follow-modify';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function apiArtist(id, name) { return { id: id, name: name, uri: 'spotify:artist:' + id, type: 'artist', images: [{ url: 'https://i.scdn.co/image/' + id, width: 300 }], genres: [] }; }
var FOL = apiArtist('fol1', 'Followed Artist');
var NEW = apiArtist('new1', 'New Artist');
var NEW2 = apiArtist('new2', 'Other Artist');

// A store signed in with the everyday scopes; granted: also user-follow-modify.
function store(granted) {
  var s = H.seedStore();
  if (granted) s.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE + ' ' + FOLLOW_SCOPE }));
  return s;
}
function artistItem(a) { return { kind: 'artist', id: a.id, name: a.name, uri: a.uri, url: 'https://open.spotify.com/artist/' + a.id, img: '', sub: 'Artist' }; }

// env.lib: queue of answers for PUT/DELETE /me/library ({status, json, delay, throws}); default 200 after 0 ms.
// env.following: the followed artists GET /me/following answers (null: 403).
function setup(s, opts) {
  opts = opts || {};
  var env = { lib: [], following: opts.following === undefined ? [FOL] : opts.following, tokenAnswer: opts.tokenAnswer || null };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    call.body = body;
    if (call.host === 'accounts.spotify.com' && path === '/api/token') {
      call.form = body ? String(body) : '';
      return env.tokenAnswer || { status: 400, json: { error: 'invalid_grant' } };
    }
    if (path === '/me/library' && (method === 'PUT' || method === 'DELETE')) {
      var a = env.lib.shift() || { status: 200 };
      if (a.throws) throw new Error(a.throws);
      return { status: a.status, json: a.json, delay: a.delay || 0, headers: a.headers };
    }
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (path === '/me/following') {
      if (!env.following) return { status: 403, json: { error: { status: 403, message: 'Insufficient client scope' } } };
      return { status: 200, json: { artists: { items: env.following, next: null, total: env.following.length } } };
    }
    if (path === '/search') return { status: 200, json: { artists: { items: [NEW, FOL], next: null, total: 2 }, tracks: { items: [] }, albums: { items: [] }, playlists: { items: [] }, shows: { items: [] }, episodes: { items: [] } } };
    var m = /^\/artists\/([^/]+)\/albums$/.exec(path);
    if (m) return { status: 200, json: { items: [], next: null, total: 0 } };
    m = /^\/artists\/([^/]+)$/.exec(path);
    if (m) return { status: 200, json: apiArtist(m[1], 'Artist ' + m[1]) };
  }, { url: opts.url, beforeParse: function (w) { H.addSubtle(w); } });
  tab.env = env;
  return H.wait(opts.startWait || 600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (t.state) { t.state.device = DEV; t.state.deviceAt = Date.now(); }
    if (opts.keep) return tab;
    tab.calls.length = 0;
    tab.w.__toasts = [];
    tab.w.__nav = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function esc(tab) { d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
function api(tab) { return tab.calls.filter(function (c) { return c.host === 'api.spotify.com'; }); }
function libWrites(tab) { return tab.calls.filter(function (c) { return c.path === '/me/library' && (c.method === 'PUT' || c.method === 'DELETE'); }); }
function permOpen(tab) { return !d(tab).getElementById('perm').hidden; }
function permText(tab) { return d(tab).getElementById('permBody').textContent; }
function followBtn(tab) { return d(tab).querySelector('.dhead [data-follow]'); }
function heart(tab, id) { return d(tab).querySelector('.followheart[data-follow="' + id + '"]'); }
function lastToast(tab) { var t = tab.toasts(); return t[t.length - 1] || ''; }
function undoBtn(tab) { var b = d(tab).querySelector('#toast .toastbtn'); return b && !d(tab).getElementById('toast').hidden ? b : null; }
function navs(tab) { return (tab.w.__nav || []).map(function (n) { return n.url; }); }
function authParams(url) { var u = new URL(url); return u.searchParams; }
function scopesOf(url) { return (authParams(url).get('scope') || '').split(' ').filter(Boolean); }
function cacheArtists(s) { var c = JSON.parse(s.getItem('lib-cache') || 'null'); return c && c.artists ? c.artists.map(function (a) { return a.id; }) : null; }
function openArtist(tab, a) {
  tab.t().openDetail(tab.t().artistItem({ id: a.id, name: a.name }));
  return H.wait(150).then(function () { tab.calls.length = 0; tab.w.__toasts = []; return tab; });
}
function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; }); }

var tests = [];

// 1. Sign-in scopes: the everyday sign-in asks for no feature scope; a feature sign-in adds only its scope.
tests.push(function () {
  var s = store(false);
  return setup(s).then(function (tab) {
    var t = tab.t();
    check('1 follow not granted with the everyday scopes', t.hasFeature('follow') === false);
    t.login();
    return H.wait(100).then(function () {
      var n = navs(tab);
      check('1 everyday sign-in goes to Spotify authorize', n.length === 1 && /^https:\/\/accounts\.spotify\.com\/authorize\?/.test(n[0]), n);
      var sc = n[0] ? scopesOf(n[0]) : [];
      check('1 everyday sign-in asks exactly the everyday scopes', sameSet(sc, t.SCOPE_LIST.slice()), sc);
      check('1 everyday sign-in has no feature scope', sc.indexOf(FOLLOW_SCOPE) === -1 && sc.indexOf('playlist-modify-private') === -1, sc);
      tab.w.__nav = [];
      // The banner's Sign in again passes a click event, which must not count as extra scopes.
      d(tab).getElementById('banner').hidden = false;
      click(tab, d(tab).getElementById('bannerBtn'));
      return H.wait(100);
    }).then(function () {
      var n = navs(tab);
      var sc = n[0] ? scopesOf(n[0]) : [];
      check('1 banner sign-in: a click event adds nothing', n.length === 1 && sameSet(sc, t.SCOPE_LIST.slice()), sc);
      tab.w.__nav = [];
      t.login(t.FEATURE_SCOPES.follow.scopes);
      return H.wait(100);
    }).then(function () {
      var n = navs(tab);
      var sc = n[0] ? scopesOf(n[0]) : [];
      var extra = sc.filter(function (x) { return t.SCOPE_LIST.indexOf(x) === -1; });
      check('1 feature sign-in adds only user-follow-modify', JSON.stringify(extra) === JSON.stringify([FOLLOW_SCOPE]), sc);
      check('1 feature sign-in keeps every everyday scope', t.SCOPE_LIST.every(function (x) { return sc.indexOf(x) !== -1; }), sc);
      check('1 no API request sent by sign-in', api(tab).length === 0, api(tab));
    });
  });
});

// 2. A granted feature scope stays on later everyday sign-ins.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    check('2 follow granted when the token has user-follow-modify', t.hasFeature('follow') === true);
    check('2 needFeature goes ahead without a sheet', t.needFeature('follow') === true && !permOpen(tab));
    t.login();
    return H.wait(100).then(function () {
      var sc = navs(tab)[0] ? scopesOf(navs(tab)[0]) : [];
      var extra = sc.filter(function (x) { return t.SCOPE_LIST.indexOf(x) === -1; });
      check('2 later sign-in keeps the granted follow scope', JSON.stringify(extra) === JSON.stringify([FOLLOW_SCOPE]), sc);
      check('2 an ungranted feature scope is not added', sc.indexOf('playlist-modify-private') === -1, sc);
    });
  });
});

// 3. Artist page: Following / Follow comes from the followed list, with no contains request.
tests.push(function () {
  var s = store(false);
  return setup(s).then(function (tab) {
    var t = tab.t();
    check('3 followed list loaded from GET /me/following', t.followKnown() && t.isFollowed('fol1') && !t.isFollowed('new1'));
    tab.calls.length = 0;
    t.openDetail(t.artistItem({ id: 'fol1', name: 'Followed Artist' }));
    return H.wait(150).then(function () {
      var b = followBtn(tab);
      check('3 followed artist shows Following', b && !b.hidden && b.textContent === 'Following' && b.getAttribute('aria-pressed') === 'true', b && b.outerHTML);
      check('3 Following label says tap to unfollow', b && /^Following “Followed Artist”, tap to unfollow$/.test(b.getAttribute('aria-label')), b && b.getAttribute('aria-label'));
      check('3 no follow-state check request', tab.calls.filter(function (c) { return /contains|\/me\/following|\/me\/library/.test(c.path); }).length === 0, tab.calls);
      t.closeDetail();
      tab.calls.length = 0;
      t.openDetail(t.artistItem({ id: 'new1', name: 'New Artist' }));
      return H.wait(150);
    }).then(function () {
      var b = followBtn(tab);
      check('3 other artist shows Follow', b && !b.hidden && b.textContent === 'Follow' && b.getAttribute('aria-pressed') === 'false', b && b.outerHTML);
      check('3 Follow label', b && b.getAttribute('aria-label') === 'Follow “New Artist”', b && b.getAttribute('aria-label'));
      check('3 still no follow-state request', tab.calls.filter(function (c) { return /contains|\/me\/following|\/me\/library/.test(c.path); }).length === 0, tab.calls);
    });
  });
});

// 4. While the followed list isn't known (GET /me/following refused), the button stays hidden.
tests.push(function () {
  return setup(store(false), { following: null }).then(function (tab) {
    var t = tab.t();
    check('4 followed list unknown after a refused load', t.followKnown() === false);
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      check('4 Follow button hidden', b && b.hidden === true, b && b.outerHTML);
    });
  });
});

// 5. Permission sheet: opening sends nothing; Not now / backdrop / Escape store nothing and send nothing.
tests.push(function () {
  var s = store(false);
  return setup(s).then(function (tab) {
    return openArtist(tab, NEW).then(function () {
      var before = JSON.stringify(s._m());
      var b = followBtn(tab);
      click(tab, b);
      return H.wait(100).then(function () {
        check('5 tap without the scope opens the sheet', permOpen(tab));
        check('5 sheet names the feature and the new Spotify line', /Follow artists needs one more Spotify permission/.test(permText(tab)) &&
          d(tab).querySelector('#permBody li') && d(tab).querySelector('#permBody li').textContent === 'Manage who you are following', permText(tab));
        check('5 focus on Sign in to Spotify', d(tab).activeElement && d(tab).activeElement.id === 'permGo');
        check('5 opening sent and stored nothing', tab.calls.length === 0 && JSON.stringify(s._m()) === before, tab.calls);
        check('5 button unchanged', b.textContent === 'Follow' && !b.hasAttribute('aria-busy'));
        click(tab, d(tab).getElementById('permClose'));
        check('5 Not now closes', !permOpen(tab));
        check('5 Not now stores nothing', JSON.stringify(s._m()) === before && s.getItem('lib-perm-ask') === null);
        check('5 focus back on Follow', d(tab).activeElement === b);
        click(tab, b);
        click(tab, d(tab).getElementById('permBack'));
        check('5 backdrop closes', !permOpen(tab));
        click(tab, b);
        esc(tab);
        check('5 Escape closes the sheet', !permOpen(tab));
        check('5 Escape left the artist page open', !!tab.t().state.detail && tab.t().state.detail.item.id === 'new1');
        return H.wait(100);
      }).then(function () {
        check('5 after three closes: nothing sent, stored or shown, no sign-in', tab.calls.length === 0 && navs(tab).length === 0 && JSON.stringify(s._m()) === before && tab.toasts().length === 0, { calls: tab.calls, nav: navs(tab), t: tab.toasts() });
      });
    });
  });
});

// 6. Sign in to Spotify on the sheet starts the sign-in with the extra scope and comes back to the page.
tests.push(function () {
  var s = store(false);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openArtist(tab, NEW).then(function () {
      click(tab, followBtn(tab));
      var at0 = Date.now();
      click(tab, d(tab).getElementById('permGo'));
      return H.wait(150).then(function () {
        var ask = JSON.parse(s.getItem('lib-perm-ask') || 'null');
        check('6 sign-in in progress stored', ask && ask.feature === 'follow' && ask.at >= at0 && ask.at <= Date.now(), ask);
        var n = navs(tab);
        check('6 one navigation to Spotify authorize', n.length === 1 && /^https:\/\/accounts\.spotify\.com\/authorize\?/.test(n[0]), n);
        var p = n[0] ? authParams(n[0]) : new URLSearchParams();
        var sc = (p.get('scope') || '').split(' ');
        check('6 asks the everyday scopes plus user-follow-modify', sameSet(sc, t.SCOPE_LIST.concat([FOLLOW_SCOPE])), sc);
        check('6 comes back to this page', p.get('redirect_uri') === t.REDIRECT && p.get('redirect_uri') === 'https://richardtran324.github.io/spotify-library/', p.get('redirect_uri'));
        check('6 PKCE: code flow with S256', p.get('response_type') === 'code' && p.get('code_challenge_method') === 'S256' && p.get('client_id') === 'fakeclient');
        var verifier = JSON.parse(s.getItem('lib-verifier') || 'null');
        var want = verifier ? crypto.createHash('sha256').update(verifier).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') : null;
        check('6 code_challenge is SHA-256 of the stored verifier', want && p.get('code_challenge') === want, { got: p.get('code_challenge'), want: want });
        check('6 state matches the stored state', p.get('state') && p.get('state') === JSON.parse(s.getItem('lib-state') || 'null'));
        check('6 no API request sent', api(tab).length === 0, api(tab));
      });
    });
  });
});

// 7. Coming back from a feature sign-in: approved, not added, cancelled, stale.
function callbackTab(s, query, tokenAnswer) {
  return setup(s, { url: 'https://richardtran324.github.io/spotify-library/?' + query, tokenAnswer: tokenAnswer, startWait: 800, keep: true });
}
function seedAsk(s, ageMs) {
  s.setItem('lib-perm-ask', JSON.stringify({ feature: 'follow', at: Date.now() - (ageMs || 1000) }));
  s.setItem('lib-state', JSON.stringify('ST1'));
  s.setItem('lib-verifier', JSON.stringify('VER1'));
}
tests.push(function () {
  var s = store(false);
  seedAsk(s);
  var tab0;
  return setup(s, { url: 'https://richardtran324.github.io/spotify-library/?code=C1&state=ST1', startWait: 800, keep: true,
    tokenAnswer: { status: 200, json: { access_token: 'new', refresh_token: 'r2', expires_in: 3600, scope: H.SCOPE + ' ' + FOLLOW_SCOPE } } }).then(function (tab) {
    tab0 = tab;
    var tab = tab0, t = tab.t();
    check('7a toast says the feature is ready', tab.toasts().indexOf('Follow artists is ready. Try it again.') !== -1, tab.toasts());
    var tok = JSON.parse(s.getItem('lib-token') || 'null');
    check('7a new token keeps the granted scope', tok && tok.access === 'new' && tok.scope.split(' ').indexOf(FOLLOW_SCOPE) !== -1, tok);
    check('7a sign-in-in-progress record removed', s.getItem('lib-perm-ask') === null);
    check('7a back on the page (address cleaned)', tab.w.location.search === '', tab.w.location.href);
    check('7a feature now granted', t.hasFeature('follow') === true);
    return openArtist(tab, NEW).then(function () {
      click(tab, followBtn(tab));
      return H.wait(100);
    }).then(function () {
      check('7a next tap follows with no sheet', !permOpen(tab) && libWrites(tab).length === 1 && libWrites(tab)[0].method === 'PUT', libWrites(tab));
    });
  });
});
// The token request itself (checked on a tab that records it from the start).
tests.push(function () {
  var s = store(false);
  seedAsk(s);
  var calls = [];
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    if (path === '/api/token') { call.form = String(body); return { status: 200, json: { access_token: 'n2', expires_in: 3600, scope: H.SCOPE } }; }
    if (path === '/me/player') return { status: 204 };
  }, { url: 'https://richardtran324.github.io/spotify-library/?code=C9&state=ST1', beforeParse: function (w) { H.addSubtle(w); } });
  return H.wait(800).then(function () {
    var tc = tab.calls.filter(function (c) { return c.path === '/api/token'; });
    var f = tc[0] ? new URLSearchParams(tc[0].form) : new URLSearchParams();
    check('7b one POST to the token endpoint', tc.length === 1 && tc[0].method === 'POST' && tc[0].host === 'accounts.spotify.com', tc);
    check('7b exchanges the code with the stored verifier', f.get('grant_type') === 'authorization_code' && f.get('code') === 'C9' && f.get('code_verifier') === 'VER1', String(f));
    check('7b scope not added: toast says so', tab.toasts().indexOf('Spotify didn’t add the permission follow artists needs.') !== -1, tab.toasts());
    check('7b feature still not granted', tab.t().hasFeature('follow') === false);
    check('7b page started (library loaded)', tab.calls.some(function (c) { return c.path === '/me/playlists'; }));
  });
});
tests.push(function () {
  var s = store(false);
  seedAsk(s);
  var tokBefore = s.getItem('lib-token');
  return callbackTab(s, 'error=access_denied&state=ST1').then(function (tab) {
    return H.wait(10).then(function () {
      var all = tab.w.document.getElementById('toast').textContent;
      check('7c cancelled: toast says nothing changed', /^Nothing changed\. Follow artists still needs that permission\./.test(all), all);
      check('7c cancelled: no token request, library loads', !tab.calls.some(function (c) { return c.path === '/api/token'; }) && tab.calls.some(function (c) { return c.path === '/me/playlists'; }), tab.calls.map(function (c) { return c.path; }));
      check('7c cancelled: old sign-in kept', s.getItem('lib-token') === tokBefore);
      check('7c cancelled: record removed', s.getItem('lib-perm-ask') === null);
      check('7c cancelled: still signed in (no sign-in screen)', !/Spotify sign-in was cancelled/.test(d(tab).getElementById('main').textContent) && tab.t().state.started === true);
    });
  });
});
tests.push(function () {
  var s = store(false);
  seedAsk(s, 31 * 60000);   // older than 30 minutes: not a feature sign-in any more
  return callbackTab(s, 'error=access_denied&state=ST1').then(function (tab) {
    // #15 (AUTH-2): an ordinary cancelled sign-in while still holding a token now keeps you signed in.
    var txt = d(tab).getElementById('main').textContent, toasts = tab.toasts();
    check('7d stale record: treated as an ordinary cancelled sign-in (still signed in)', toasts.indexOf('Sign-in was cancelled. You’re still signed in.') !== -1 &&
      !toasts.some(function (x) { return /^Nothing changed\./.test(x); }) && !/Spotify sign-in was cancelled or failed/.test(txt) && tab.t().state.started === true, { toasts: toasts, main: txt.slice(0, 200) });
    check('7d stale record removed', s.getItem('lib-perm-ask') === null);
  });
});

// 8. Follow / unfollow requests, button state while in flight, list and saved copy updated, Undo.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      tab.env.lib.push({ status: 200, delay: 200 });
      click(tab, b);
      return H.wait(50).then(function () {
        var w = libWrites(tab);
        check('8 follow sends one PUT /me/library', w.length === 1 && w[0].method === 'PUT', w);
        var q = w[0] ? new URLSearchParams(w[0].query) : new URLSearchParams();
        check('8 follow request carries the artist URI', q.get('uris') === 'spotify:artist:new1' && Array.from(q.keys()).length === 1, w[0] && w[0].query);
        check('8 follow request has no body', w[0] && (w[0].body === undefined || w[0].body === null), w[0] && w[0].body);
        check('8 no /me/following write', !tab.calls.some(function (c) { return c.path.indexOf('/me/following') === 0 && c.method !== 'GET'; }));
        check('8 busy while in flight', b.getAttribute('aria-busy') === 'true');
        check('8 not flipped before Spotify answers', b.textContent === 'Follow' && t.isFollowed('new1') === false);
        click(tab, b);
        check('8 second tap while busy sends nothing', libWrites(tab).length === 1);
        return H.wait(250);
      }).then(function () {
        check('8 after yes: Following', b.textContent === 'Following' && b.getAttribute('aria-pressed') === 'true' && !b.hasAttribute('aria-busy'), b.outerHTML);
        check('8 followed list updated in memory', t.isFollowed('new1') && t.state.data.artists[0].id === 'new1');
        check('8 saved library copy updated', (cacheArtists(s) || []).indexOf('new1') === 0, cacheArtists(s));
        check('8 toast with Undo', lastToast(tab) === 'Following “New Artist”' && !!undoBtn(tab), { t: tab.toasts(), u: !!undoBtn(tab) });
        tab.calls.length = 0;
        click(tab, undoBtn(tab));
        return H.wait(100);
      }).then(function () {
        var w = libWrites(tab);
        check('8 Undo sends DELETE with the same URI', w.length === 1 && w[0].method === 'DELETE' && new URLSearchParams(w[0].query).get('uris') === 'spotify:artist:new1', w);
        check('8 Undo: back to Follow', b.textContent === 'Follow' && !t.isFollowed('new1'));
        check('8 Undo toast has no Undo', lastToast(tab) === 'Unfollowed “New Artist”' && !undoBtn(tab), { t: tab.toasts(), u: !!undoBtn(tab) });
        check('8 saved copy after Undo', (cacheArtists(s) || []).indexOf('new1') === -1 && (cacheArtists(s) || []).indexOf('fol1') !== -1, cacheArtists(s));
        t.closeDetail();
        return openArtist(tab, FOL);
      }).then(function () {
        var b2 = followBtn(tab);
        click(tab, b2);
        return H.wait(100).then(function () {
          var w = libWrites(tab);
          check('8 unfollow sends DELETE /me/library?uris=spotify:artist:fol1', w.length === 1 && w[0].method === 'DELETE' && new URLSearchParams(w[0].query).get('uris') === 'spotify:artist:fol1', w);
          check('8 unfollow: Follow and toast with Undo', b2.textContent === 'Follow' && lastToast(tab) === 'Unfollowed “Followed Artist”' && !!undoBtn(tab), { b: b2.textContent, t: tab.toasts() });
          check('8 unfollow: gone from the list and saved copy', !t.isFollowed('fol1') && (cacheArtists(s) || []).indexOf('fol1') === -1, cacheArtists(s));
          tab.calls.length = 0;
          click(tab, undoBtn(tab));
          return H.wait(100);
        }).then(function () {
          var w = libWrites(tab);
          check('8 Undo of unfollow sends PUT', w.length === 1 && w[0].method === 'PUT', w);
          check('8 Undo of unfollow: Following again', b2.textContent === 'Following' && lastToast(tab) === 'Following “Followed Artist” again' && !undoBtn(tab), { b: b2.textContent, t: tab.toasts() });
        });
      });
    });
  });
});

// 9. Errors: nothing changes (button, list, saved copy); the right message.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    var cache0 = JSON.stringify(cacheArtists(s));
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      function tap(ans) {
        tab.env.lib.push(ans);
        tab.w.__toasts = [];
        d(tab).getElementById('toast').hidden = true;
        click(tab, b);
        return H.wait(100);
      }
      return tap({ status: 500, json: { error: { status: 500, message: 'Server error' } } }).then(function () {
        // #41: 5xx and no-internet errors are said in plain words; other answers keep Spotify's text
        check('9 500: toast in plain words', lastToast(tab) === 'Couldn’t follow “New Artist”. Spotify isn’t answering right now.', tab.toasts());
        check('9 500: still Follow, not busy', b.textContent === 'Follow' && b.getAttribute('aria-pressed') === 'false' && !b.hasAttribute('aria-busy'));
        check('9 500: list and saved copy unchanged', !t.isFollowed('new1') && JSON.stringify(cacheArtists(s)) === cache0);
        return tap({ status: 502 });
      }).then(function () {
        check('9 502 without a body: same plain words', lastToast(tab) === 'Couldn’t follow “New Artist”. Spotify isn’t answering right now.', tab.toasts());   // #41
        return tap({ status: 400, json: { error: { status: 400, message: 'Invalid uri' } } });
      }).then(function () {
        check('9 400: didn’t accept following from this page', lastToast(tab) === 'Spotify didn’t accept following from this page.', tab.toasts());
        check('9 400: nothing changed', b.textContent === 'Follow' && !t.isFollowed('new1') && JSON.stringify(cacheArtists(s)) === cache0);
        return tap({ throws: 'Load failed' });
      }).then(function () {
        check('9 network error: toast says no internet', lastToast(tab) === 'Couldn’t follow “New Artist”. No internet connection.', tab.toasts());   // #41
        check('9 network error: not busy, still Follow', !b.hasAttribute('aria-busy') && b.textContent === 'Follow');
        return tap({ status: 403, json: { error: { status: 403, message: 'Forbidden' } } });
      }).then(function () {
        check('9 403 without scope words: plain toast, no sheet', lastToast(tab) === 'Couldn’t follow “New Artist” (Forbidden).' && !permOpen(tab), tab.toasts());
        tab.env.lib.push({ status: 200 });
        click(tab, b);
        return H.wait(100);
      }).then(function () {
        check('9 a later tap succeeds', b.textContent === 'Following' && t.isFollowed('new1'));
        // Unfollow failing keeps Following.
        return tap({ status: 400, json: { error: { status: 400, message: 'Nope' } } });
      }).then(function () {
        check('9 unfollow 400: didn’t accept unfollowing', lastToast(tab) === 'Spotify didn’t accept unfollowing from this page.', tab.toasts());
        check('9 unfollow 400: still Following', b.textContent === 'Following' && t.isFollowed('new1'));
        return tap({ status: 500 });
      }).then(function () {
        check('9 unfollow 500: Couldn’t unfollow', lastToast(tab) === 'Couldn’t unfollow “New Artist”. Spotify isn’t answering right now.', tab.toasts());   // #41
      });
    });
  });
});

// 10. A 403 that names the scope: the permission sheet opens; the everyday banner is not raised.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      tab.env.lib.push({ status: 403, json: { error: { status: 403, message: 'Insufficient client scope' } } });
      click(tab, b);
      return H.wait(100).then(function () {
        check('10 403 scope: sheet opens', permOpen(tab) && /Follow artists needs one more Spotify permission/.test(permText(tab)));
        check('10 403 scope: no toast', tab.toasts().length === 0, tab.toasts());
        check('10 403 scope: button unchanged and not busy', b.textContent === 'Follow' && !b.hasAttribute('aria-busy') && !t.isFollowed('new1'));
        check('10 403 scope: everyday banner not raised', t.state.scopeProblem !== true && d(tab).getElementById('banner').hidden === true);
        check('10 featureDenied reads scope or permission words only on 403', t.featureDenied('follow', { status: 403, json: { error: { message: 'Permissions missing' } } }) &&
          !t.featureDenied('follow', { status: 401, json: { error: { message: 'scope' } } }) && !t.featureDenied('follow', { status: 403, json: { error: { message: 'Forbidden' } } }));
        click(tab, d(tab).getElementById('permClose'));
        check('10 Not now returns focus to the button', d(tab).activeElement === b);
      });
    });
  });
});

// 11. Search Spotify: a heart on artist rows follows and unfollows; the Artists filter changes at once.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    t.setFilter('search');
    d(tab).getElementById('search').value = 'artist';
    t.runSearch('artist');
    return H.wait(200).then(function () {
      var hNew = heart(tab, 'new1'), hFol = heart(tab, 'fol1');
      check('11 artist rows have a follow heart', !!hNew && !!hFol && !hNew.hidden && !hFol.hidden);
      check('11 heart labels and state', hNew && hNew.getAttribute('aria-label') === 'Follow “New Artist”' && hNew.getAttribute('aria-pressed') === 'false' &&
        hFol.getAttribute('aria-label') === 'Unfollow “Followed Artist”' && hFol.getAttribute('aria-pressed') === 'true', [hNew && hNew.outerHTML, hFol && hFol.outerHTML]);
      check('11 showing search results sent no follow-state request', !tab.calls.some(function (c) { return /contains|\/me\/following|\/me\/library/.test(c.path); }), tab.calls);
      tab.calls.length = 0;
      click(tab, hNew);
      return H.wait(100);
    }).then(function () {
      var w = libWrites(tab), hNew = heart(tab, 'new1');
      check('11 heart sends PUT /me/library?uris=spotify:artist:new1', w.length === 1 && w[0].method === 'PUT' && new URLSearchParams(w[0].query).get('uris') === 'spotify:artist:new1', w);
      check('11 heart now on', hNew && hNew.getAttribute('aria-pressed') === 'true' && hNew.getAttribute('aria-label') === 'Unfollow “New Artist”');
      check('11 tapping the heart did not open the artist', !t.state.detail && t.state.filter === 'search');
      var rec = t.state.data.artists.filter(function (a) { return a.id === 'new1'; })[0];
      check('11 followed record has name and URI', rec && rec.name === 'New Artist' && rec.uri === 'spotify:artist:new1' && rec.kind === 'artist', rec);
      tab.calls.length = 0;
      click(tab, heart(tab, 'fol1'));
      return H.wait(100);
    }).then(function () {
      var w = libWrites(tab);
      check('11 heart on a followed artist sends DELETE', w.length === 1 && w[0].method === 'DELETE' && new URLSearchParams(w[0].query).get('uris') === 'spotify:artist:fol1', w);
      t.setFilter('artists');
      var main = d(tab).getElementById('main');
      var hrefs = [].slice.call(main.querySelectorAll('a.item')).map(function (a) { return a.getAttribute('href'); });
      check('11 Artists filter shows the new follow', hrefs.indexOf('https://open.spotify.com/artist/new1') !== -1, hrefs);
      check('11 Artists filter drops the unfollowed artist', hrefs.indexOf('https://open.spotify.com/artist/fol1') === -1, hrefs);
      check('11 no follow heart outside Search', main.querySelectorAll('.followheart').length === 0);
    });
  });
});

// 12. Heart without the permission opens the sheet; Sign in from there asks the follow scope.
tests.push(function () {
  var s = store(false);
  return setup(s).then(function (tab) {
    var t = tab.t();
    t.setFilter('search');
    t.runSearch('artist');
    return H.wait(200).then(function () {
      tab.calls.length = 0;
      var h = heart(tab, 'new1');
      click(tab, h);
      check('12 heart without the scope opens the sheet', permOpen(tab));
      check('12 nothing sent', tab.calls.length === 0, tab.calls);
      click(tab, d(tab).getElementById('permGo'));
      return H.wait(150);
    }).then(function () {
      var sc = navs(tab)[0] ? scopesOf(navs(tab)[0]) : [];
      check('12 sign-in from the heart asks user-follow-modify', sc.indexOf(FOLLOW_SCOPE) !== -1, sc);
      check('12 still nothing sent to the API', api(tab).length === 0, api(tab));
    });
  });
});

// 13. Cool-off: a paused library group sends nothing; a 429 pauses it.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      tab.env.lib.push({ status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } }, headers: { 'retry-after': '120' } });
      click(tab, b);
      return H.wait(100).then(function () {
        var c = JSON.parse(s.getItem('lib-cooloff') || 'null');
        var lib = c && c.library;
        check('13 429 pauses the library group', lib && lib.until > Date.now() + 100000 && lib.until <= Date.now() + 121000, c);
        check('13 429 recorded as PUT /me/library', lib && lib.last429 && lib.last429.what === 'PUT /me/library', lib);
        check('13 429: toast says your library is paused', /^Spotify paused your library until \d{1,2}:\d\d [AP]M\./.test(lastToast(tab)), tab.toasts());
        check('13 429: button not flipped, not busy', b.textContent === 'Follow' && !b.hasAttribute('aria-busy') && !t.isFollowed('new1'));
        check('13 429: other groups untouched', c && !c.catalog && !c.player && !c.search, c);
        tab.calls.length = 0;
        tab.w.__toasts = [];
        d(tab).getElementById('toast').hidden = true;
        click(tab, b);
        return H.wait(100);
      }).then(function () {
        check('13 while paused: nothing sent', libWrites(tab).length === 0, tab.calls);
        check('13 while paused: toast says when', /^Spotify paused your library until \d{1,2}:\d\d [AP]M\./.test(lastToast(tab)), tab.toasts());
        check('13 while paused: not busy', !b.hasAttribute('aria-busy') && b.textContent === 'Follow');
      });
    });
  });
});
tests.push(function () {
  // A pause set before the tap (another copy of the page) blocks it too; a pause in another group does not.
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openArtist(tab, NEW).then(function () {
      var b = followBtn(tab);
      s.setItem('lib-cooloff', JSON.stringify({ catalog: { until: Date.now() + 300000, reason: 'rate', strikes: 0 } }));
      click(tab, b);
      return H.wait(100).then(function () {
        check('13b a catalog pause does not block follow', libWrites(tab).length === 1 && b.textContent === 'Following', tab.calls);
        s.setItem('lib-cooloff', JSON.stringify({ library: { until: Date.now() + 300000, reason: 'rate', strikes: 0 } }));
        tab.calls.length = 0;
        tab.w.__toasts = [];
        d(tab).getElementById('toast').hidden = true;
        click(tab, b);
        return H.wait(100);
      }).then(function () {
        check('13b a library pause from another copy: nothing sent', tab.calls.length === 0, tab.calls);
        check('13b toast names the pause', /^Spotify paused your library until/.test(lastToast(tab)), tab.toasts());
        check('13b still Following', b.textContent === 'Following' && t.isFollowed('new1'));
      });
    });
  });
});
tests.push(function () {
  // Without the permission, the sheet comes first even while paused (nothing is sent either way).
  var s = store(false);
  s.setItem('lib-cooloff', JSON.stringify({ library: { until: Date.now() + 300000, reason: 'rate', strikes: 0 } }));
  return setup(s).then(function (tab) {
    var t = tab.t();
    t.state.data = t.state.data || { artists: [] };
    if (!Array.isArray(t.state.data.artists)) t.state.data.artists = [];
    t.openDetail(t.artistItem({ id: 'new1', name: 'New Artist' }));
    return H.wait(100).then(function () {
      tab.calls.length = 0;
      t.toggleFollow(t.artistItem({ id: 'new1', name: 'New Artist' }), followBtn(tab));
      check('13c no scope and paused: sheet opens', permOpen(tab));
      check('13c no scope and paused: nothing sent', tab.calls.length === 0, tab.calls);
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
