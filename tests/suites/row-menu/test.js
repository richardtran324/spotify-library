'use strict';
// Row menu (v2.53) tests: the ⋯ button on song and episode rows and its sheet. jsdom, mocked fetch,
// shared localStorage, mocked navigator.share / navigator.clipboard. Requests are counted per endpoint.
// Run: node tests/run.js row-menu  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var fs = require('fs');
var path = require('path');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var SRC = process.env.SRC || path.resolve(__dirname, '..', '..', '..', 'index.html');
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var DAY = 86400000;
function isoDaysAgo(n) { return new Date(Date.now() - n * DAY).toISOString().slice(0, 10); }
function art(id, name) { return { id: id, name: name, uri: 'spotify:artist:' + id, type: 'artist' }; }
function track(id, name, album, artists) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: name, duration_ms: 200000, album: album, artists: artists };
}
var ALB1 = { id: 'alb1', name: 'Big Album', uri: 'spotify:album:alb1', images: [], artists: [art('new1', 'New Artist')], total_tracks: 3 };
var ALB9 = { id: 'alb9', name: 'Saved Album', uri: 'spotify:album:alb9', images: [], artists: [art('fol1', 'Followed Artist'), art('new1', 'New Artist')], total_tracks: 1 };
var T1 = track('t1', 'Song One', ALB1, [art('fol1', 'Followed Artist'), art('new1', 'New Artist')]);
var T2 = track('t2', 'Song Two', ALB9, [art('fol1', 'Followed Artist')]);
var SHOW = { id: 's1', name: 'Money Show', uri: 'spotify:show:s1', images: [], total_episodes: 2, publisher: 'P' };
function latestItems() {   // Latest cache rows, as the page stores them (no Spotify object behind them)
  return [
    { id: 'e1', uri: 'spotify:episode:e1', name: 'Newest one', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(1), durMs: 3600000, positionMs: 0, played: false },
    { id: 'e2', uri: 'spotify:episode:e2', name: 'Half done', img: '', showId: 's1', showName: 'Money Show', date: isoDaysAgo(3), durMs: 3600000, positionMs: 1200000, played: false }
  ];
}
var SAVED_ALB9 = { at: Date.now() - 60000, total: 1, items: [{ id: 'x9', uri: 'spotify:track:x9', name: 'Nine', artists: [{ name: 'Followed Artist' }], track_number: 1, disc_number: 1, duration_ms: 1000 }] };

function store0(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(opts.filter || 'recent'));
  s.setItem('lib-latest', JSON.stringify({ at: Date.now() - 60000, items: latestItems(), failed: 0, newest: { s1: isoDaysAgo(1) }, asked: 1 }));
  if (opts.savedAlb9) s.setItem('lib-cache-album:alb9', JSON.stringify(SAVED_ALB9));
  if (opts.cool) s.setItem('lib-cooloff', JSON.stringify(opts.cool));
  if (opts.rowPlus === false) s.setItem('lib-row-plus', 'false');
  return s;
}
function setup(store, opts) {
  opts = opts || {};
  var env = { queueStatus: 204 };
  var tab = H.makeTab(store, function (method, p, q, body, call) {
    call.q = q.toString();
    if (p === '/me/player' && method === 'GET') return { status: 204 };
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (p === '/me/player/queue' && method === 'POST') return env.queueStatus === 429
      ? { status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } } } : { status: env.queueStatus };
    if (method === 'PUT' && /^\/me\/player\//.test(p)) return { status: 204 };
    if (p === '/me/player/recently-played') return { status: 200, json: { items: [
      { track: T1, played_at: new Date(Date.now() - 60000).toISOString(), context: null },
      { track: T2, played_at: new Date(Date.now() - 120000).toISOString(), context: null }
    ] } };
    if (p === '/me/following') return { status: 200, json: { artists: { items: [{ id: 'fol1', name: 'Followed Artist', uri: 'spotify:artist:fol1', images: [{ url: 'https://i.scdn.co/image/fol', width: 160 }], genres: [] }], next: null, total: 1 } } };
    if (p === '/me/albums') return { status: 200, json: { items: [{ added_at: '2026-01-01T00:00:00Z', album: ALB9 }], next: null, total: 1 } };
    if (p === '/me/shows') return { status: 200, json: { items: [{ show: SHOW }], next: null, total: 1 } };
    if (p === '/me/library/contains' || /\/contains$/.test(p)) return { status: 200, json: [] };
    var m = /^\/artists\/([^/]+)$/.exec(p);
    if (m) return { status: 200, json: { id: m[1], name: 'Artist ' + m[1], images: [{ url: 'https://i.scdn.co/image/' + m[1], width: 300 }] } };
    m = /^\/artists\/([^/]+)\/albums$/.exec(p);
    if (m) return { status: 200, json: { items: [{ id: 'r-' + m[1], name: 'Release', uri: 'spotify:album:r-' + m[1], album_type: 'album', release_date: '2024-01-01', total_tracks: 9, images: [], artists: [art(m[1], 'A')] }], next: null, total: 1 } };
    m = /^\/albums\/([^/]+)\/tracks$/.exec(p);
    if (m) return { status: 200, json: { items: [{ id: 'tt1', uri: 'spotify:track:tt1', name: 'Track', type: 'track', track_number: 1, duration_ms: 1000, artists: [art('new1', 'New Artist')] }], next: null, total: 1 } };
    if (p === '/search') return { status: 200, json: { albums: { items: [], next: null, total: 0 }, tracks: { items: [], next: null, total: 0 } } };
  });
  tab.env = env;
  return H.wait(700).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    t.renderList();
    return H.wait(100);
  }).then(function () {
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function q(tab, sel) { return d(tab).querySelector(sel); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) {
  tab.w.__inClick = true;
  try { return node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
  finally { tab.w.__inClick = false; }
}
function row(tab, uri) { return q(tab, 'li[data-puri="' + uri + '"]'); }
function more(tab, uri) { return q(tab, 'li[data-puri="' + uri + '"] button.more'); }
function menuOpen(tab) { return !q(tab, '#rowmenu').hidden; }
function opts(tab) { return qa(tab, '#rmList .rmrow').map(function (b) { return b.textContent; }); }
function opt(tab, act, n) { return qa(tab, '#rmList [data-act="' + act + '"]')[n || 0]; }
// Catalog requests (the ~21 an hour group): album songs, artists, single episodes, shows.
function cat(tab) { return tab.calls.filter(function (c) { return /^\/(albums|artists|episodes|shows)\//.test(c.path); }); }
function web(tab) { return tab.calls.filter(function (c) { return c.path !== '/me/player' && c.path !== '/me/player/devices'; }); }
function reqs(tab, method, re) { return tab.calls.filter(function (c) { return c.method === method && re.test(c.path); }); }
function keys(store) { return Object.keys(store._m()).sort().join(','); }
function mockShare(tab) {
  var log = [];
  Object.defineProperty(tab.w.navigator, 'share', { configurable: true, writable: true, value: function (data) { log.push({ data: data, inGesture: !!tab.w.__inClick }); return Promise.resolve(); } });
  return log;
}
function mockClipboard(tab) {
  var log = [];
  Object.defineProperty(tab.w.navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: function (txt) { log.push(txt); return Promise.resolve(); } } });
  return log;
}

var tests = [];

// 1. Version, and the ⋯ button takes no more width than the notes button it replaces on episode rows.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    check('1 version (v2.51 or later)', (+((/^v2\.(\d+)/.exec(t.VERSION) || [])[1]) >= 51), t.VERSION);   // renumbered from v2.53 on merge
    var html = fs.readFileSync(SRC, 'utf8');
    check('1 ⋯ is a plain 44 px row button (no width rule of its own)', html.indexOf('.act.more {') === -1 && /\.act \{[^}]*width: 44px; height: 44px/.test(html));
    check('1 menu rows are at least 44 px tall', /\.rmrow \{[^}]*min-height: 48px/.test(html));
    var rm = q(tab, '#rowmenu');
    check('1 menu is a modal dialog named by its title', rm.getAttribute('role') === 'dialog' && rm.getAttribute('aria-modal') === 'true' && rm.getAttribute('aria-labelledby') === 'rmTitle' && rm.hidden);
  });
});

// 2. A song row in Recent: heart, +, ⋯. Opening the menu sends nothing and stores nothing; Escape and the backdrop close it.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var r = row(tab, 'spotify:track:t1');
    check('2 Recent song row has heart, +, ⋯', !!r && r.querySelectorAll('.acts button').length === 3 && !!r.querySelector('.acts .heart') &&
      !!r.querySelector('button[aria-label="Add “Song One” to queue"]') && !!r.querySelector('.acts button.more'), r && r.querySelectorAll('.acts button').length);
    var mb = more(tab, 'spotify:track:t1');
    check('2 ⋯ label and popup', mb.getAttribute('aria-label') === 'More for “Song One” by Followed Artist, New Artist' && mb.getAttribute('aria-haspopup') === 'dialog' && mb.type === 'button');
    var before = keys(store);
    click(tab, mb);
    check('2 menu open', menuOpen(tab));
    check('2 opening sent no requests', tab.calls.length === 0, tab.calls);
    check('2 opening stored nothing', keys(store) === before, keys(store));
    check('2 title and artists', q(tab, '#rmTitle').textContent === 'Song One' && q(tab, '#rmMeta').textContent === 'Followed Artist, New Artist', q(tab, '#rmMeta').textContent);
    check('2 options in order', opts(tab).join('|') === 'Add to queue|Add to playlist|Go to album · Big Album|Go to artist · Followed Artist|Go to artist · New Artist|Share|Copy link|Open in Spotify', opts(tab));
    check('2 no episode options on a song', !opt(tab, 'notes') && !opt(tab, 'mark'));
    var open = opt(tab, 'open');
    check('2 Open in Spotify is a link to the song', open.tagName === 'A' && open.getAttribute('href') === 'https://open.spotify.com/track/t1', open.getAttribute('href'));
    check('2 focus on Close', d(tab).activeElement && d(tab).activeElement.id === 'rmClose');
    d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('2 Escape closes', !menuOpen(tab));
    check('2 focus back on ⋯', d(tab).activeElement === mb);
    click(tab, mb);
    click(tab, q(tab, '#rmBack'));
    check('2 backdrop closes', !menuOpen(tab));
    click(tab, mb);
    click(tab, q(tab, '#rmClose'));
    check('2 Close closes, focus back', !menuOpen(tab) && d(tab).activeElement === mb);
    check('2 still no requests', tab.calls.length === 0, tab.calls);
    var album = tab.t().itemRow({ kind: 'album', id: 'a', uri: 'spotify:album:a', name: 'A', url: 'https://open.spotify.com/album/a', sub: 'Album' });
    check('2 album rows have no ⋯', !album.querySelector('button.more'));
  });
});

// 3. Add to queue from the menu: one request, as the + does; a 429 pauses playback requests and the next tap sends nothing.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var mb = more(tab, 'spotify:track:t1');
    click(tab, mb); click(tab, opt(tab, 'queue'));
    return H.wait(60).then(function () {
      var qs = reqs(tab, 'POST', /^\/me\/player\/queue$/);
      check('3 one queue request with the song and device', qs.length === 1 && /uri=spotify%3Atrack%3At1/.test(qs[0].q) && /device_id=A/.test(qs[0].q), qs);
      check('3 nothing else sent', web(tab).length === 1, web(tab));
      check('3 toast', tab.toasts().indexOf('Added to queue') !== -1, tab.toasts());
      check('3 menu closed, focus back on ⋯', !menuOpen(tab) && d(tab).activeElement === mb);
      tab.env.queueStatus = 429; tab.calls.length = 0; tab.w.__toasts = [];
      click(tab, mb); click(tab, opt(tab, 'queue'));
      return H.wait(60);
    }).then(function () {
      check('3 429: one request', reqs(tab, 'POST', /^\/me\/player\/queue$/).length === 1, tab.calls);
      check('3 429: says Spotify paused it', tab.toasts().length >= 1, tab.toasts());
      check('3 429: playback paused', tab.t().state && JSON.stringify(JSON.parse(tab.w.localStorage.getItem('lib-cooloff') || '{}')).indexOf('player') !== -1, tab.w.localStorage.getItem('lib-cooloff'));
      tab.calls.length = 0; tab.w.__toasts = [];
      click(tab, more(tab, 'spotify:track:t1')); click(tab, opt(tab, 'queue'));
      return H.wait(60);
    }).then(function () {
      check('3 while paused: nothing sent', web(tab).length === 0, web(tab));
      check('3 while paused: no new message within 2.5 s of the last one', tab.toasts().length <= 1, tab.toasts());
    });
  });
});

// 4. Go to album (not saved, not in your library): one album request, Back returns; a second time this visit sends nothing.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t1')); click(tab, opt(tab, 'album'));
    return H.wait(200).then(function () {
      check('4 album opened', t.state.detail && t.state.detail.item.kind === 'album' && t.state.detail.item.id === 'alb1' && !menuOpen(tab), t.state.detail && t.state.detail.item);
      var w = cat(tab);
      check('4 one catalog request: the album songs', w.length === 1 && w[0].path === '/albums/alb1/tracks', w);
      check('4 otherwise only the usual heart check', web(tab).filter(function (c) { return !/^\/albums\//.test(c.path) && c.path !== '/me/library/contains'; }).length === 0, web(tab));
      check('4 focus on Back', d(tab).activeElement && d(tab).activeElement.classList.contains('back'));
      t.goBack();
      return H.wait(150);
    }).then(function () {
      check('4 Back returns to Recent', !t.state.detail && t.state.filter === 'recent' && !!row(tab, 'spotify:track:t1'));
      tab.calls.length = 0;
      click(tab, more(tab, 'spotify:track:t1')); click(tab, opt(tab, 'album'));
      return H.wait(200);
    }).then(function () {
      check('4 again this visit: no requests', web(tab).filter(function (c) { return /^\/albums\//.test(c.path); }).length === 0, web(tab));
      check('4 again: album shows', t.state.detail && t.state.detail.item.id === 'alb1');
    });
  });
});

// 5. Go to album saved on the phone: your library's copy, no request. Inside it, no Go to album, and Go to artist
//    (from the album's artists, since saved songs keep names only) costs 1 for a followed artist; Back returns to the album.
tests.push(function () {
  return setup(store0({ savedAlb9: true })).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t2'));
    check('5 Go to album names the album', opts(tab).indexOf('Go to album · Saved Album') !== -1, opts(tab));
    click(tab, opt(tab, 'album'));
    return H.wait(200).then(function () {
      check('5 saved album opened with no catalog requests', t.state.detail && t.state.detail.item.id === 'alb9' && cat(tab).length === 0, tab.calls);
      check('5 only the usual heart check', web(tab).every(function (c) { return c.path === '/me/library/contains'; }), web(tab));
      check('5 your library\'s album item', t.state.detail.item === (t.state.data.albums || []).filter(function (a) { return a.id === 'alb9'; })[0]);
      var mb = more(tab, 'spotify:track:x9');
      check('5 album song row has ⋯', !!mb);
      click(tab, mb);
      check('5 no Go to album inside that album', !opt(tab, 'album'), opts(tab));
      check('5 Go to artist from the album\'s artists', opts(tab).join('|').indexOf('Go to artist · Followed Artist') !== -1 && opts(tab).join('|').indexOf('New Artist') === -1, opts(tab));
      click(tab, opt(tab, 'artist'));
      return H.wait(200);
    }).then(function () {
      check('5 artist page opened', t.state.detail && t.state.detail.kind === 'artist' && t.state.detail.item.id === 'fol1');
      var w = cat(tab);
      check('5 followed artist: 1 catalog request (releases)', w.length === 1 && w[0].path === '/artists/fol1/albums', w);
      t.goBack();
      return H.wait(150);
    }).then(function () {
      check('5 Back returns to the album', t.state.detail && t.state.detail.item.id === 'alb9');
    });
  });
});

// 6. Go to artist (not followed) from Recent: 2 requests, as on the Now Playing screen.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t1')); click(tab, opt(tab, 'artist', 1));
    return H.wait(200).then(function () {
      check('6 artist page opened', t.state.detail && t.state.detail.kind === 'artist' && t.state.detail.item.id === 'new1');
      var w = cat(tab).map(function (c) { return c.path; }).sort();
      check('6 two catalog requests: picture and releases', w.join() === '/artists/new1,/artists/new1/albums', w);
    });
  });
});

// 7. Catalog paused: Go to album sends no album request (the album opens the way it does today while paused).
tests.push(function () {
  var cool = { catalog: { until: Date.now() + 30 * 60000, reason: 'quota', strikes: 1 } };
  return setup(store0({ cool: cool })).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t1'));
    check('7 menu opens while paused, no requests', menuOpen(tab) && tab.calls.length === 0);
    click(tab, opt(tab, 'album'));
    return H.wait(200).then(function () {
      check('7 album view opened', t.state.detail && t.state.detail.item.id === 'alb1');
      check('7 no album request while catalog is paused', reqs(tab, 'GET', /^\/albums\//).length === 0, tab.calls);
      var sr = reqs(tab, 'GET', /^\/search$/);
      check('7 the usual search fallback instead: one search request', sr.length === 1 && /type=track/.test(sr[0].q) && /album%3A%22Big\+Album%22|album%3A%22Big%20Album%22/.test(sr[0].q), tab.calls);
      check('7 nothing else but the heart check', web(tab).every(function (c) { return c.path === '/search' || c.path === '/me/library/contains'; }), web(tab));
    });
  });
});

// 8. Share and Copy link: the song's link, straight from the tap, no requests.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var share = mockShare(tab), clip = mockClipboard(tab);
    var mb = more(tab, 'spotify:track:t1');
    click(tab, mb); click(tab, opt(tab, 'share'));
    check('8 share sheet once, inside the tap', share.length === 1 && share[0].inGesture, share);
    check('8 share link and title', share[0] && share[0].data.url === 'https://open.spotify.com/track/t1' && share[0].data.title === 'Song One · Followed Artist, New Artist', share[0] && share[0].data);
    check('8 menu closed, focus back', !menuOpen(tab) && d(tab).activeElement === mb);
    click(tab, mb); click(tab, opt(tab, 'copy'));
    return H.wait(30).then(function () {
      check('8 copied the link', clip.length === 1 && clip[0] === 'https://open.spotify.com/track/t1', clip);
      check('8 Link copied', tab.toasts().indexOf('Link copied') !== -1, tab.toasts());
      check('8 no requests', tab.calls.length === 0, tab.calls);
    });
  });
});

// 9. Open in Spotify: the link is followed (not cancelled) and the menu closes.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    click(tab, more(tab, 'spotify:track:t1'));
    var a = opt(tab, 'open'), prevented = null;
    tab.w.addEventListener('click', function (ev) { prevented = ev.defaultPrevented; ev.preventDefault(); });   // jsdom can't navigate
    click(tab, a);
    check('9 link not cancelled by the page', prevented === false, prevented);
    check('9 menu closed', !menuOpen(tab));
    check('9 link still in the page while followed', d(tab).body.contains(a));
    check('9 no requests', tab.calls.length === 0, tab.calls);
  });
});

// 10. Episode rows (Podcasts → Latest, from the page's own cache): heart, +, ⋯; notes and Mark as played in the menu.
tests.push(function () {
  var store = store0({ filter: 'podcasts' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var r = row(tab, 'spotify:episode:e1');
    check('10 episode row: heart, +, ⋯ (three, as before)', !!r && r.querySelectorAll('.acts button').length === 3 && !!r.querySelector('button.more') && !r.querySelector('button[aria-label^="Notes for"]'), r && r.querySelectorAll('.acts button').length);
    var mb = more(tab, 'spotify:episode:e1');
    click(tab, mb);
    check('10 episode options', opts(tab).join('|') === 'Add to queue|Add to playlist|Episode notes|Mark as played|Share|Copy link|Open in Spotify', opts(tab));
    check('10 meta is the show', q(tab, '#rmMeta').textContent === 'Money Show', q(tab, '#rmMeta').textContent);
    check('10 episode link', opt(tab, 'open').getAttribute('href') === 'https://open.spotify.com/episode/e1');
    click(tab, opt(tab, 'mark'));
    check('10 marked played on this phone', t.markOf('spotify:episode:e1') && t.markOf('spotify:episode:e1').played === true, t.markOf('spotify:episode:e1'));
    check('10 toast with Undo', /Marked “Newest one” as played on this phone/.test(tab.toasts().join()), tab.toasts());
    check('10 mark sent nothing', tab.calls.length === 0, tab.calls);
    var mb2 = more(tab, 'spotify:episode:e1') || mb;
    click(tab, mb2);
    check('10 reopened: Mark as unplayed', !!opt(tab, 'mark') && opt(tab, 'mark').textContent === 'Mark as unplayed', opts(tab));
    click(tab, opt(tab, 'mark'));
    check('10 unmarked', !(t.markOf('spotify:episode:e1') && t.markOf('spotify:episode:e1').played));
    var mb3 = more(tab, 'spotify:episode:e2');
    click(tab, mb3); click(tab, opt(tab, 'notes'));
    check('10 notes sheet open for the episode', !q(tab, '#notes').hidden && q(tab, '#notesTitle').textContent === 'Half done' && !menuOpen(tab));
    check('10 notes opened with no request', tab.calls.length === 0, tab.calls);
    t.closeNotes();
    check('10 focus back on the row\'s ⋯', d(tab).activeElement === mb3);
  });
});

// 11. Episodes with a Spotify object (a podcast's own list): Add to playlist gets it; Go to album/artist never show.
tests.push(function () {
  var store = store0({ filter: 'podcasts' });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var ep = { type: 'episode', id: 'x1', uri: 'spotify:episode:x1', name: 'Mapped', release_date: isoDaysAgo(2), duration_ms: 60000, images: [], show: { id: 's1', name: 'Money Show', images: [] } };
    var li = t.itemRow(t.mapEpisode(ep, false));
    d(tab).getElementById('main').appendChild(li);
    click(tab, li.querySelector('button.more'));
    check('11 no Go to on episodes', !opt(tab, 'album') && !opt(tab, 'artist'), opts(tab));
    click(tab, opt(tab, 'addpl'));
    check('11 Add to playlist sheet with the episode', !q(tab, '#plsheet').hidden && /“Mapped” · Money Show/.test(q(tab, '#plBody').textContent), q(tab, '#plBody').textContent);
    check('11 no requests', tab.calls.length === 0, tab.calls);
    t.closePl();
  });
});

// 12. Add to playlist from a song row: v2.26's sheet, nothing sent until a playlist is picked; focus returns to ⋯.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var mb = more(tab, 'spotify:track:t1');
    click(tab, mb); click(tab, opt(tab, 'addpl'));
    check('12 sheet open', !q(tab, '#plsheet').hidden && q(tab, '#plTitle').textContent === 'Add to playlist' && !menuOpen(tab));
    check('12 names the song and artists', /“Song One” · Followed Artist, New Artist/.test(q(tab, '#plBody').textContent), q(tab, '#plBody').textContent);
    check('12 no requests', tab.calls.length === 0, tab.calls);
    click(tab, q(tab, '#plClose'));
    check('12 focus back on ⋯', q(tab, '#plsheet').hidden && d(tab).activeElement === mb);
  });
});

// 13. Setting: ＋ off moves Add to queue into ⋯ only (rows get heart and ⋯); on again removes the key.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openDiag();
    var box = q(tab, '#rowPlus');
    check('13 checkbox on by default', box && box.checked && t.rowPlusShown());
    box.checked = false; box.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
    t.closeDiag();
    check('13 stored as false', store.getItem('lib-row-plus') === 'false', store.getItem('lib-row-plus'));
    var r = row(tab, 'spotify:track:t1');
    check('13 song row: heart and ⋯', r.querySelectorAll('.acts button').length === 2 && !r.querySelector('button[aria-label^="Add “"]') && !!r.querySelector('button.more'), r.querySelectorAll('.acts button').length);
    tab.calls.length = 0;
    click(tab, more(tab, 'spotify:track:t1'));
    check('13 menu still has Add to queue', opts(tab)[0] === 'Add to queue', opts(tab));
    click(tab, opt(tab, 'queue'));
    return H.wait(60).then(function () {
      check('13 queued from the menu: one request', reqs(tab, 'POST', /^\/me\/player\/queue$/).length === 1 && cat(tab).length === 0, web(tab));
      check('13 episode rows too', t.itemRow({ kind: 'episode', id: 'e9', uri: 'spotify:episode:e9', name: 'E', url: 'https://open.spotify.com/episode/e9', sub: 'x' }).querySelectorAll('.acts button').length === 2);
      t.openDiag();
      check('13 checkbox shows off', !q(tab, '#rowPlus').checked);
      q(tab, '#rowPlus').checked = true; q(tab, '#rowPlus').dispatchEvent(new tab.w.Event('change', { bubbles: true }));
      t.closeDiag();
      check('13 on again: key removed', store.getItem('lib-row-plus') === null);
      check('13 + back on the row', !!row(tab, 'spotify:track:t1').querySelector('button[aria-label="Add “Song One” to queue"]'));
    });
  });
});

// 14. A stored false hides ＋ from the start; anything else counts as shown.
tests.push(function () {
  return setup(store0({ rowPlus: false })).then(function (tab) {
    check('14 stored false: no + on Recent rows', !row(tab, 'spotify:track:t1').querySelector('button[aria-label^="Add “"]'));
    tab.w.localStorage.setItem('lib-row-plus', '"yes"');
    check('14 other values: shown', tab.t().rowPlusShown());
    tab.w.localStorage.setItem('lib-row-plus', '{bad');
    check('14 unreadable value: shown', tab.t().rowPlusShown());
  });
});

// 15. Signing out closes the menu; a stale menu row then does nothing.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t1'));
    var qb = opt(tab, 'queue');
    t.stopApp();
    check('15 sign-out closes the menu', !menuOpen(tab));
    tab.calls.length = 0;
    click(tab, qb);
    return H.wait(50).then(function () {
      check('15 stale row sends nothing', reqs(tab, 'POST', /queue/).length === 0, tab.calls);
    });
  });
});

// 16. Storage full: the setting fails quietly and the page keeps working.
tests.push(function () {
  var store = store0();
  return setup(store).then(function (tab) {
    var t = tab.t();
    var orig = store.setItem;
    store.setItem = function (k, v) { if (k === 'lib-row-plus') { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(store, k, v); };
    t.openDiag();
    var box = q(tab, '#rowPlus');
    var threw = false;
    try { box.checked = false; box.dispatchEvent(new tab.w.Event('change', { bubbles: true })); } catch (e) { threw = true; }
    t.closeDiag();
    store.setItem = orig;
    check('16 no crash on a full store', !threw);
    check('16 checkbox shows the + is still on', box.checked);
    check('16 says it couldn\'t be saved', tab.toasts().indexOf('Couldn’t save that setting: this phone’s storage is full.') !== -1, tab.toasts());
    check('16 nothing stored, + still shown', store.getItem('lib-row-plus') === null && t.rowPlusShown() && !!row(tab, 'spotify:track:t1').querySelector('button[aria-label="Add “Song One” to queue"]'));
    click(tab, more(tab, 'spotify:track:t1'));
    check('16 menu still opens', menuOpen(tab));
  });
});

// 17. Search results: song rows get ⋯ and the same menu, with no extra search request.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    var li = t.itemRow({ kind: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song One', url: 'https://open.spotify.com/track/t1', sub: 'Song · Followed Artist', artist: 'Followed Artist' });
    d(tab).getElementById('main').appendChild(li);
    click(tab, li.querySelector('button.more'));
    check('17 menu from a mapped search row (album known from the answer)', opts(tab).indexOf('Go to album · Big Album') !== -1, opts(tab));
    check('17 no requests', tab.calls.length === 0, tab.calls);
    t.closeRowMenu();
  });
});

// 18. Mark does what its label said even if the mark changed while the menu was open (the player check clears marks);
//     focus lands on the redrawn row's ⋯.
tests.push(function () {
  return setup(store0({ filter: 'podcasts' })).then(function (tab) {
    var t = tab.t();
    var mb = more(tab, 'spotify:episode:e1');
    click(tab, mb); click(tab, opt(tab, 'mark'));
    var a = d(tab).activeElement;
    check('18 list redrawn by the mark', !d(tab).body.contains(mb));
    check('18 focus on the redrawn row\'s ⋯', !!a && a === more(tab, 'spotify:episode:e1'), a && a.outerHTML);
    click(tab, more(tab, 'spotify:episode:e1'));
    check('18 label says unplayed', opt(tab, 'mark').textContent === 'Mark as unplayed');
    t.writeMark('spotify:episode:e1', null); t.marksChanged();   // what the player check does when the episode plays again
    check('18 menu stays open over the redraw', menuOpen(tab));
    click(tab, opt(tab, 'mark'));
    var m = t.markOf('spotify:episode:e1');
    check('18 Mark as unplayed leaves it unplayed (not flipped to played)', !(m && m.played), m);
    check('18 toast says unplayed', /as unplayed on this phone/.test(tab.toasts().slice(-1)[0] || ''), tab.toasts());
    check('18 focus back on the row\'s ⋯ after Escape-free close', d(tab).activeElement === more(tab, 'spotify:episode:e1'));
    click(tab, more(tab, 'spotify:episode:e1'));
    t.renderList();   // a redraw while open: Close still finds the row
    click(tab, q(tab, '#rmClose'));
    check('18 Close after a redraw: focus on the new ⋯', d(tab).activeElement === more(tab, 'spotify:episode:e1'));
  });
});

// 19. Opening a song's own album (whose songs carry no album or artist ids) doesn't take Go to album / artist away elsewhere.
tests.push(function () {
  var store = store0({ savedAlb9: true });
  store.setItem('lib-cache-album:alb9', JSON.stringify({ at: Date.now() - 60000, total: 1, items: [{ id: 't2', uri: 'spotify:track:t2', name: 'Song Two', artists: [{ name: 'Followed Artist' }], track_number: 1, disc_number: 1, duration_ms: 1000 }] }));
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t2'));
    var before = opts(tab);
    click(tab, opt(tab, 'album'));
    return H.wait(200).then(function () {
      click(tab, more(tab, 'spotify:track:t2'));
      check('19 inside the album: artist from the album, no Go to album', !opt(tab, 'album') && opts(tab).indexOf('Go to artist · Followed Artist') !== -1, opts(tab));
      t.closeRowMenu();
      t.goBack(); return H.wait(200);
    }).then(function () {
      click(tab, more(tab, 'spotify:track:t2'));
      check('19 back in Recent: same menu as before', opts(tab).join('|') === before.join('|') && !!opt(tab, 'album'), [before, opts(tab)]);
    });
  });
});

// 20. Double tap: a real tap within 400 ms of opening or closing is ignored (on the sheet and on the page behind).
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t1'));
    check('20 a real tap right after opening is too soon', t.rmTooSoon({ isTrusted: true }));
    check('20 script clicks are never held back', !t.rmTooSoon({ isTrusted: false }) && !t.rmTooSoon(null));
    t.rmGuard.at = Date.now() - 500;
    check('20 after 400 ms taps count again', !t.rmTooSoon({ isTrusted: true }));
    t.rmGuard.ms = 1e9;   // keep the window open for the trusted-tap checks below
    var ev = { isTrusted: true, defaultPrevented: false, preventDefault: function () { this.defaultPrevented = true; } };
    var blocked = { isTrusted: true };
    // A real event can't be made in jsdom; check the guard the handlers use, then a script click still works.
    check('20 guard used by the menu rows', t.rmTooSoon(ev) && t.rmTooSoon(blocked));
    t.rmGuard.ms = 400;
    click(tab, opt(tab, 'queue'));
    return H.wait(60).then(function () {
      check('20 script click on a row still runs', reqs(tab, 'POST', /queue/).length === 1, tab.calls);
    });
  });
});

// 21. Back (popstate) closes the menu.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    click(tab, more(tab, 'spotify:track:t1'));
    tab.w.dispatchEvent(new tab.w.PopStateEvent('popstate', { state: null }));
    check('21 Back closes the menu', !menuOpen(tab));
    check('21 page unlocked', !d(tab).body.classList.contains('sheetopen'));
  });
});

// 22. Scroll lock: the page behind stays still while the menu is open (main's sheetopen).
tests.push(function () {
  return setup(store0()).then(function (tab) {
    click(tab, more(tab, 'spotify:track:t1'));
    check('22 locked while open', d(tab).body.classList.contains('sheetopen'));
    d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('22 unlocked after close', !d(tab).body.classList.contains('sheetopen'));
  });
});

// 23. The setting redraws an open song list (not only library lists), keeping the list.
tests.push(function () {
  var store = store0({ savedAlb9: true });
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, more(tab, 'spotify:track:t2')); click(tab, opt(tab, 'album'));
    return H.wait(200).then(function () {
      var r = row(tab, 'spotify:track:x9');
      check('23 album row has + first', !!r && !!r.querySelector('button[aria-label^="Add “"]'));
      t.openDiag();
      var box = q(tab, '#rowPlus');
      box.checked = false; box.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
      t.closeDiag();
      r = row(tab, 'spotify:track:x9');
      check('23 open song list redrawn without +', t.state.detail && t.state.detail.item.id === 'alb9' && !!r && !r.querySelector('button[aria-label^="Add “"]') && !!r.querySelector('button.more'));
      check('23 no requests for the redraw', cat(tab).length === 0, cat(tab));
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
