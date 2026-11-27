'use strict';
// Three small shortcuts (v2.23) tests: pinned play buttons (E1), Continue in a list (E2), playlists and Liked Songs
// in Jump back in (E3). jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var DAY = 24 * 60 * 60 * 1000;
function rawPl(id, owner, name) { return { id: id, uri: 'spotify:playlist:' + id, name: name || ('List ' + id), images: [], owner: { id: owner, display_name: owner }, collaborative: false, items: { total: 10 } }; }
function rawAlbum(id, name) { return { id: id, uri: 'spotify:album:' + id, name: name || ('Album ' + id), images: [], artists: [{ name: 'Band ' + id }], release_date: '2020-01-01', total_tracks: 10 }; }
var LIB = {
  playlists: [rawPl('P1', 'me1', 'Morning Run'), rawPl('P2', 'other', 'Their Mix')],
  albums: [rawAlbum('A1', 'First Album')],
  artists: [{ id: 'R1', uri: 'spotify:artist:R1', name: 'Some Artist', images: [], genres: [] }],
  shows: [{ id: 'S1', uri: 'spotify:show:S1', name: 'Money Show', images: [], total_episodes: 20 },
          { id: 'S2', uri: 'spotify:show:S2', name: 'Quiet Show', images: [], total_episodes: 5 }]
};
var PINS = [
  { kind: 'playlist', id: 'P1', name: 'Morning Run', uri: 'spotify:playlist:P1', url: 'https://open.spotify.com/playlist/P1', img: '', sub: 'Playlist', ownerId: 'me1' },
  { kind: 'album', id: 'A1', name: 'First Album', uri: 'spotify:album:A1', url: 'https://open.spotify.com/album/A1', img: '', sub: 'Album' },
  { kind: 'artist', id: 'R1', name: 'Some Artist', uri: 'spotify:artist:R1', url: 'https://open.spotify.com/artist/R1', img: '', sub: 'Artist' },
  { kind: 'show', id: 'S1', name: 'Money Show', uri: 'spotify:show:S1', url: 'https://open.spotify.com/show/S1', img: '', sub: 'Podcast' },
  { kind: 'show', id: 'S2', name: 'Quiet Show', uri: 'spotify:show:S2', url: 'https://open.spotify.com/show/S2', img: '', sub: 'Podcast' }
];
function track(id, albumId, dur) {
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: dur === undefined ? 200000 : dur,
    album: rawAlbum(albumId || 'AX'), artists: [{ name: 'Band' }] };
}
function rp(id, albumId, ctx, minsAgo) {
  return { track: track(id, albumId), played_at: new Date(Date.now() - minsAgo * 60000).toISOString(), context: ctx };
}
function plCtx(id) { return { type: 'playlist', uri: 'spotify:playlist:' + id, href: 'https://api.spotify.com/v1/playlists/' + id }; }
function albCtx(id) { return { type: 'album', uri: 'spotify:album:' + id }; }
var LIKED = { type: 'collection', uri: 'spotify:user:me1:collection' };
function playerWith(t, ctx, pos, playing) {
  return { item: t, currently_playing_type: t.type, context: ctx || null, is_playing: playing !== false, progress_ms: pos || 0,
    device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}

function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('home'));
  s.setItem('lib-pins', JSON.stringify(PINS));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
// opts: {recent: [items], noDevice, setPlayer}
function setup(store, opts) {
  opts = opts || {};
  var env = { player: null, recent: opts.recent || [], noDevice: !!opts.noDevice };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/playlists') return { status: 200, json: { items: LIB.playlists, next: null, total: 2 } };
    if (path === '/me/albums') return { status: 200, json: { items: LIB.albums.map(function (a) { return { album: a }; }), next: null } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: LIB.artists, next: null } } };
    if (path === '/me/shows') return { status: 200, json: { items: LIB.shows.map(function (s) { return { show: s }; }), next: null } };
    if (path === '/me/tracks') return { status: 200, json: { items: [], next: null, total: 100 } };
    if (path === '/me/player/recently-played') return { status: 200, json: { items: env.recent } };
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: env.noDevice ? [] : [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (opts.noDevice) { t.state.device = null; t.state.deviceAt = 0; }
    else { t.state.device = DEV; t.state.deviceAt = Date.now(); }
    t.state.recentTriedAt = Date.now();   // Home's own recently-played load is tested on purpose, not by accident
    if (opts.setPlayer) t.setPlayer(JSON.parse(JSON.stringify(opts.setPlayer)));
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return (!method || c.method === method) && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
var CATALOG = /^\/(shows|episodes|albums|artists|tracks|playlists)(\/|$)/;
function catalog(tab) { return tab.calls.filter(function (c) { return CATALOG.test(c.path) && c.method === 'GET'; }); }
function plays(tab) { return reqs(tab, 'PUT', '/me/player/play'); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function stripCards(tab, id) { return [].slice.call(d(tab).querySelectorAll('ul[aria-labelledby="' + id + '"] > li')); }
function cardByName(tab, id, name) { return stripCards(tab, id).filter(function (li) { var n = li.querySelector('.clname'); return n && n.textContent === name; })[0]; }
function contBtn(tab) { var b = d(tab).getElementById('dcont'); return b && !b.hidden ? b.querySelector('a.btn') : null; }
function ctxStore(store) { var v = store.getItem('lib-ctx-last'); return v ? JSON.parse(v) : null; }
function finish(tab) { try { tab.t().stopApp(); } catch (e) {} tab.w.close(); }

var tests = [];

// 1. E1: Pinned cards get round play buttons; render sends nothing to the catalog.
tests.push(function () {
  var store = seed({ 'lib-latest': { at: Date.now() - 3600e3, items: [
    { id: 'e2', uri: 'spotify:episode:e2', name: 'Newest', showId: 'S1', showName: 'Money Show', date: '2026-11-26', durMs: 3600000, positionMs: 0, played: true },
    { id: 'e1', uri: 'spotify:episode:e1', name: 'Older', showId: 'S1', showName: 'Money Show', date: '2026-11-20', durMs: 3600000, positionMs: 600000, played: false }
  ], failed: 0, newest: { S1: '2026-11-26' } } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.renderList();
    return H.wait(300).then(function () {
      var cards = stripCards(tab, 'hPinned');
      check('1 five pinned cards', cards.length === 5, cards.length);
      function hasPlay(name) { var c = cardByName(tab, 'hPinned', name); return !!(c && c.querySelector('button.cardplay')); }
      check('1 playlist, album, artist have play buttons', hasPlay('Morning Run') && hasPlay('First Album') && hasPlay('Some Artist'));
      check('1 podcast with a held episode has a button', hasPlay('Money Show'));
      check('1 podcast with nothing held has no button', !hasPlay('Quiet Show'));
      var lab = cardByName(tab, 'hPinned', 'Money Show').querySelector('button.cardplay').getAttribute('aria-label');
      check('1 podcast button resumes the newest unfinished episode', lab === 'Resume “Older”', lab);
      check('1 Home render: no catalog request', catalog(tab).length === 0, tab.calls);
      check('1 Home render: no request at all', tab.calls.length === 0, tab.calls);
      // Taps: each sends exactly one player call.
      tab.calls.length = 0;
      click(tab, cardByName(tab, 'hPinned', 'Morning Run').querySelector('button.cardplay'));
      return H.wait(150).then(function () {
        var p = plays(tab);
        check('1 pinned playlist: one play call', p.length === 1 && tab.calls.length === 1, tab.calls);
        check('1 pinned playlist plays its context', p[0] && JSON.stringify(p[0].body) === '{"context_uri":"spotify:playlist:P1"}', p[0] && p[0].body);
        check('1 button did not open the list', !t.state.detail);
        tab.calls.length = 0;
        click(tab, cardByName(tab, 'hPinned', 'First Album').querySelector('button.cardplay'));
        return H.wait(150);
      }).then(function () {
        var p = plays(tab);
        check('1 pinned album plays from track 1', p.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:album:A1"}', p[0] && p[0].body);
        tab.calls.length = 0;
        click(tab, cardByName(tab, 'hPinned', 'Some Artist').querySelector('button.cardplay'));
        return H.wait(150);
      }).then(function () {
        var p = plays(tab);
        check('1 pinned artist plays the artist', p.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:artist:R1"}', p[0] && p[0].body);
        tab.calls.length = 0;
        click(tab, cardByName(tab, 'hPinned', 'Money Show').querySelector('button.cardplay'));
        return H.wait(150);
      }).then(function () {
        var p = plays(tab);
        check('1 pinned podcast resumes, one call, no catalog', p.length === 1 && catalog(tab).length === 0 && JSON.stringify(p[0].body) === '{"uris":["spotify:episode:e1"],"position_ms":600000}', tab.calls);
        // The card itself still opens the list.
        click(tab, cardByName(tab, 'hPinned', 'First Album').querySelector('a.clcard'));
        return H.wait(100);
      }).then(function () {
        check('1 card tap still opens the album', t.state.detail && t.state.detail.item.uri === 'spotify:album:A1');
        finish(tab);
      });
    });
  });
});

// 2. E1: picking a pinned podcast's episode from held data.
tests.push(function () {
  var now = Date.now();
  var store = seed({
    'lib-cache-show:S2': { at: now - 2 * 3600e3, total: 3, items: [
      { id: 'q3', uri: 'spotify:episode:q3', name: 'Q3', release_date: '2026-11-25', duration_ms: 1800000, images: [], resume_point: { fully_played: true, resume_position_ms: 0 } },
      { id: 'q2', uri: 'spotify:episode:q2', name: 'Q2', release_date: '2026-11-18', duration_ms: 1800000, images: [], resume_point: { fully_played: false, resume_position_ms: 0 } },
      { id: 'q1', uri: 'spotify:episode:q1', name: 'Q1', release_date: '2026-11-11', duration_ms: 1800000, images: [], resume_point: { fully_played: false, resume_position_ms: 0 } }
    ] },
    'lib-ep-history': [
      { uri: 'spotify:episode:q2', id: 'q2', name: 'Q2', show: { id: 'S2', name: 'Quiet Show', images: [] }, duration_ms: 1800000, positionMs: 420000, played: false, at: now - 60000 }
    ]
  });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var ep = t.heldShowEpisode('S2');
    check('2 saved list: played newest skipped', ep && ep.uri === 'spotify:episode:q2', ep);
    check('2 newer history position wins', ep && ep.positionMs === 420000, ep);
    check('2 nothing held: null', t.heldShowEpisode('S9') === null);
    // History only (no saved list, no Latest): its episode counts.
    store.setItem('lib-ep-history', JSON.stringify([{ uri: 'spotify:episode:h1', id: 'h1', name: 'H1', show: { id: 'S7', name: 'Other', images: [] }, duration_ms: 1000000, positionMs: 1000, played: false, at: now - 1000 }]));
    var hist = t.epHistory();   // loaded once per visit; refresh the memory copy for this check
    hist.unshift({ uri: 'spotify:episode:h1', id: 'h1', name: 'H1', show: { id: 'S7', name: 'Other', images: [] }, duration_ms: 1000000, positionMs: 1000, played: false, at: now - 1000 });
    var h = t.heldShowEpisode('S7');
    check('2 history only: resumes it', h && h.uri === 'spotify:episode:h1' && h.positionMs === 1000, h);
    // Every held episode played: same pick as the podcast's Play (the newest), from the start.
    store.setItem('lib-cache-show:S8', JSON.stringify({ at: now, total: 2, items: [
      { id: 'z2', uri: 'spotify:episode:z2', name: 'Z2', release_date: '2026-11-20', duration_ms: 100, images: [], resume_point: { fully_played: true, resume_position_ms: 0 } },
      { id: 'z1', uri: 'spotify:episode:z1', name: 'Z1', release_date: '2026-11-10', duration_ms: 100, images: [], resume_point: { fully_played: true, resume_position_ms: 50 } }
    ] }));
    var z = t.heldShowEpisode('S8');
    check('2 all played: newest, from the start', z && z.uri === 'spotify:episode:z2' && z.positionMs === 0, z);
    // An older episode in progress, known only from history (heard just now), doesn't beat a newer unplayed release.
    store.setItem('lib-cache-show:S6', JSON.stringify({ at: now - 3600e3, total: 2, items: [
      { id: 'n2', uri: 'spotify:episode:n2', name: 'N2', release_date: '2026-11-25', duration_ms: 1800000, images: [], resume_point: { fully_played: false, resume_position_ms: 0 } },
      { id: 'n1', uri: 'spotify:episode:n1', name: 'N1', release_date: '2026-11-18', duration_ms: 1800000, images: [], resume_point: { fully_played: true, resume_position_ms: 0 } }
    ] }));
    hist.unshift({ uri: 'spotify:episode:old1', id: 'old1', name: 'Old1', show: { id: 'S6', name: 'Six', images: [] }, duration_ms: 1800000, positionMs: 600000, played: false, at: now - 60000 });
    var six = t.heldShowEpisode('S6');
    check('2 newer unplayed release beats an older history-only episode heard today', six && six.uri === 'spotify:episode:n2', six);
    // A history episode that a list dates uses that date: n1 heard today but played, so n2 still wins.
    hist.unshift({ uri: 'spotify:episode:n1', id: 'n1', name: 'N1', show: { id: 'S6', name: 'Six', images: [] }, duration_ms: 1800000, positionMs: 300000, played: false, at: now - 1000 });
    var six2 = t.heldShowEpisode('S6');
    check('2 dated history episode sorts by release date (newer release first)', six2 && six2.uri === 'spotify:episode:n2', six2);
    // Only undated episodes: newest heard first, then firstUnplayed's rule (played skipped).
    hist.unshift({ uri: 'spotify:episode:u2', id: 'u2', name: 'U2', show: { id: 'S5', name: 'Five', images: [] }, duration_ms: 100000, positionMs: 0, played: true, at: now - 500 });
    hist.push({ uri: 'spotify:episode:u1', id: 'u1', name: 'U1', show: { id: 'S5', name: 'Five', images: [] }, duration_ms: 100000, positionMs: 4000, played: false, at: now - 5 * DAY });
    var five = t.heldShowEpisode('S5');
    check('2 undated only: newest heard unplayed', five && five.uri === 'spotify:episode:u1' && five.positionMs === 4000, five);
    check('2 no request for any of it', tab.calls.length === 0, tab.calls);
    t.renderList();
    return H.wait(200).then(function () {
      var c = cardByName(tab, 'hPinned', 'Quiet Show');
      check('2 pinned podcast with a saved list gets a button', !!(c && c.querySelector('button.cardplay')));
      check('2 still no catalog request', catalog(tab).length === 0, tab.calls);
      finish(tab);
    });
  });
});

// 3. E1: asleep / no device: the pinned tap goes through the usual wait path (no play call; pending saved).
tests.push(function () {
  var store = seed();
  return setup(store, { noDevice: true }).then(function (tab) {
    var t = tab.t();
    t.state.deviceChecked = true; t.state.devicesAt = Date.now(); t.state.deviceError = '';
    t.renderList();
    return H.wait(100).then(function () {
      tab.calls.length = 0;
      click(tab, cardByName(tab, 'hPinned', 'Morning Run').querySelector('button.cardplay'));
      return H.wait(200);
    }).then(function () {
      var pend = JSON.parse(store.getItem('lib-pending') || 'null');
      check('3 no device: no play call', plays(tab).length === 0, tab.calls);
      check('3 no device: tap waits for Spotify (pending saved)', pend && pend.item && pend.item.uri === 'spotify:playlist:P1' && pend.mode === 'wait', pend);
      check('3 wake line shows', !d(tab).getElementById('wake').hidden);
      finish(tab);
    });
  });
});

// 4. E3: Jump back in shows library playlists and Liked Songs; non-library playlists stay albums; no catalog call.
tests.push(function () {
  var recent = [
    rp('x1', 'B1', plCtx('P1'), 1),
    rp('x2', 'B2', plCtx('P1'), 5),
    rp('x3', 'B3', LIKED, 8),
    rp('x4', 'B4', plCtx('P3'), 12),   // P3 isn't in the library
    rp('x5', 'A5', albCtx('A5'), 20),
    rp('x6', 'B6', plCtx('P2'), 25),   // someone else's playlist, in the library
    rp('x7', 'B7', LIKED, 30),
    rp('x1', 'B1', plCtx('P1'), 40)    // replay of x1: one Recent row
  ];
  var store = seed();
  return setup(store, { recent: recent }).then(function (tab) {
    var t = tab.t();
    t.loadRecent();
    return H.wait(300).then(function () {
      var jump = t.state.recent.jump;
      check('4 one recently-played request, nothing else', tab.calls.length === 1 && tab.calls[0].path === '/me/player/recently-played', tab.calls);
      check('4 no playlist lookup for P3', reqs(tab, null, /\/playlists\//).length === 0);
      var kinds = jump.map(function (j) { return j.playlist ? 'pl:' + j.playlist.id : j.liked ? 'liked' : j.album ? 'al:' + j.album.id : '?'; });
      check('4 cards in newest-play order, one per list', JSON.stringify(kinds) === '["pl:P1","liked","al:B4","al:A5","pl:P2"]', kinds);
      var p1 = jump[0];
      check('4 playlist card plays inside it', p1.ctx === 'spotify:playlist:P1' && p1.uri === 'spotify:track:x1', p1);
      check('4 Liked Songs card plays in Liked Songs', jump[1].ctx === 'spotify:user:me1:collection' && jump[1].uri === 'spotify:track:x3', jump[1]);
      check('4 non-library playlist song keeps its album card (ctx unchanged)', jump[2].album.id === 'B4' && jump[2].ctx === 'spotify:playlist:P3', jump[2]);
      check('4 Recent tab keeps every song', t.state.recent.items.length === 7, t.state.recent.items.length);
      t.renderList();
      return H.wait(200);
    }).then(function () {
      var names = stripCards(tab, 'hJump').map(function (li) { return li.querySelector('.clname').textContent; });
      check('4 Home shows the playlist and Liked Songs cards', names[0] === 'Morning Run' && names[1] === 'Liked Songs' && names.indexOf('Their Mix') !== -1, names);
      var card = cardByName(tab, 'hJump', 'Morning Run');
      check('4 playlist card sub is the song', card.querySelector('.sub').textContent === 'Song x1');
      check('4 Liked card has the heart cover', !!cardByName(tab, 'hJump', 'Liked Songs').querySelector('.cover.liked'));
      check('4 Home render: no catalog request', catalog(tab).length === 0, tab.calls);
      tab.calls.length = 0;
      click(tab, card.querySelector('button.cardplay'));
      return H.wait(150);
    }).then(function () {
      var p = plays(tab);
      check('4 play button: one call, continues inside the playlist', p.length === 1 && tab.calls.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:playlist:P1","offset":{"uri":"spotify:track:x1"}}', tab.calls);
      click(tab, cardByName(tab, 'hJump', 'Morning Run').querySelector('a.clcard'));
      return H.wait(100);
    }).then(function () {
      check('4 card tap opens the playlist', t.state.detail && t.state.detail.item.kind === 'playlist' && t.state.detail.item.id === 'P1');
      t.closeDetail();
      click(tab, cardByName(tab, 'hJump', 'Liked Songs').querySelector('a.clcard'));
      return H.wait(100);
    }).then(function () {
      check('4 Liked card opens Liked Songs', t.state.detail && t.state.detail.item.kind === 'liked');
      finish(tab);
    });
  });
});

// 5. E3: before the library is known, playlist songs stay album cards (still no lookup).
tests.push(function () {
  var store = seed();
  return setup(store, { recent: [rp('x1', 'B1', plCtx('P1'), 1)] }).then(function (tab) {
    var t = tab.t();
    var keep = t.state.data;
    t.state.data = Object.assign({}, keep, { playlists: [] });
    t.loadRecent();
    return H.wait(200).then(function () {
      var j = t.state.recent.jump;
      check('5 not in library: album card', j.length === 1 && j[0].album && !j[0].playlist, j);
      check('5 no catalog request', catalog(tab).length === 0, tab.calls);
      t.state.data = keep;
      finish(tab);
    });
  });
});

// 6. E2: the player check records the last song per album / playlist / Liked Songs; others are ignored.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerWith(track('s1', 'A1'), plCtx('P1'), 50000));
    var s = ctxStore(store);
    var e = s && s['spotify:playlist:P1'];
    check('6 playlist entry stored', e && e.uri === 'spotify:track:s1' && e.name === 'Song s1' && e.positionMs === 50000 && e.durMs === 200000 && Math.abs(e.at - Date.now()) < 2000, s);
    t.setPlayer(playerWith(track('s2', 'A1'), { type: 'playlist', uri: 'spotify:user:me1:playlist:P2' }, 1000));
    check('6 old-style playlist URI keys by id', !!(ctxStore(store) || {})['spotify:playlist:P2'], ctxStore(store));
    t.setPlayer(playerWith(track('s3', 'A1'), albCtx('A1'), 2000));
    t.setPlayer(playerWith(track('s4', 'A1'), LIKED, 3000));
    s = ctxStore(store);
    check('6 album and Liked Songs entries', s['spotify:album:A1'].uri === 'spotify:track:s3' && s.liked.uri === 'spotify:track:s4', s);
    t.setPlayer(playerWith(track('s5', 'A1'), { type: 'artist', uri: 'spotify:artist:R1' }, 3000));
    t.setPlayer(playerWith(track('s6', 'A1'), null, 3000));
    var ep = { type: 'episode', id: 'e1', uri: 'spotify:episode:e1', name: 'E', duration_ms: 100000, show: { id: 'S1', name: 'Money Show', images: [] }, images: [] };
    t.setPlayer(playerWith(ep, { type: 'show', uri: 'spotify:show:S1' }, 3000));
    s = ctxStore(store);
    check('6 artist, no context and episodes are not recorded', Object.keys(s).length === 4, Object.keys(s));
    // Same song a moment later: memory moves, storage waits up to 15 s; a new song writes at once.
    t.setPlayer(playerWith(track('s3', 'A1'), albCtx('A1'), 9000));
    check('6 memory current', t.readCtxLast()['spotify:album:A1'].positionMs === 9000);
    check('6 storage throttled for the same song', ctxStore(store)['spotify:album:A1'].positionMs === 2000, ctxStore(store)['spotify:album:A1']);
    t.setPlayer(playerWith(track('s7', 'A1'), albCtx('A1'), 100));
    check('6 new song written right away', ctxStore(store)['spotify:album:A1'].uri === 'spotify:track:s7');
    check('6 no request from recording', tab.calls.filter(function (c) { return c.path !== '/me/player/devices'; }).length === 0, tab.calls);
    // Asleep: the frozen spot is kept.
    t.setPlayer(playerWith(track('s8', 'A1'), plCtx('P1'), 120000));
    t.state.playerAt = Date.now();
    t.setPlayer(null);
    var fz = t.readCtxLast()['spotify:playlist:P1'];
    check('6 going asleep keeps the song and spot', fz.uri === 'spotify:track:s8' && fz.positionMs >= 120000 && fz.positionMs < 125000, fz);
    finish(tab);
  });
});

// 7. E2: Recently played fills gaps only where the page has nothing newer.
tests.push(function () {
  var now = Date.now();
  var store = seed({ 'lib-ctx-last': {
    'spotify:album:A1': { uri: 'spotify:track:mine', id: 'mine', name: 'Mine', positionMs: 30000, durMs: 200000, at: now - 60000 },
    'spotify:playlist:P2': { uri: 'spotify:track:old', id: 'old', name: 'Old', positionMs: 30000, durMs: 200000, at: now - 3 * 3600e3 }
  } });
  var recent = [
    rp('r1', 'A1', albCtx('A1'), 10),      // older than the page's entry: ignored
    rp('r2', 'B2', plCtx('P2'), 30),       // newer than the page's entry: replaces it
    rp('r3', 'B3', plCtx('P9'), 40),       // no entry: filled (not in library, still fine to remember)
    rp('r4', 'B3', plCtx('P9'), 50),       // older play in the same list: ignored
    rp('r5', 'B5', null, 5)
  ];
  return setup(store, { recent: recent }).then(function (tab) {
    var t = tab.t();
    t.loadRecent();
    return H.wait(200).then(function () {
      var s = ctxStore(store);
      check('7 page entry newer: kept', s['spotify:album:A1'].uri === 'spotify:track:mine' && s['spotify:album:A1'].positionMs === 30000, s['spotify:album:A1']);
      check('7 older page entry replaced, from the start', s['spotify:playlist:P2'].uri === 'spotify:track:r2' && s['spotify:playlist:P2'].positionMs === 0, s['spotify:playlist:P2']);
      check('7 gap filled with the newest play', s['spotify:playlist:P9'].uri === 'spotify:track:r3', s['spotify:playlist:P9']);
      check('7 no context: nothing', Object.keys(s).length === 3, Object.keys(s));
      check('7 only the recently-played request', tab.calls.length === 1, tab.calls);
      finish(tab);
    });
  });
});

// 8. E2: lib-ctx-last caps at 40 and drops entries older than 30 days (and future ones).
tests.push(function () {
  var now = Date.now(), m = {};
  for (var i = 0; i < 45; i++) m['spotify:album:N' + i] = { uri: 'spotify:track:n' + i, id: 'n' + i, name: 'N' + i, positionMs: 1000, durMs: 200000, at: now - i * 60000 };
  m['spotify:album:OLD'] = { uri: 'spotify:track:o', id: 'o', name: 'O', positionMs: 1000, durMs: 200000, at: now - 31 * DAY };
  m['spotify:album:FUT'] = { uri: 'spotify:track:f', id: 'f', name: 'F', positionMs: 1000, durMs: 200000, at: now + DAY };
  m['spotify:album:BAD'] = { id: 'b', name: 'B', at: now };
  var store = seed({ 'lib-ctx-last': m });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var r = t.readCtxLast();
    var keys = Object.keys(r);
    check('8 at most 40 kept', keys.length === 40, keys.length);
    check('8 the newest kept, the oldest dropped', !!r['spotify:album:N0'] && !!r['spotify:album:N39'] && !r['spotify:album:N40'] && !r['spotify:album:N44']);
    check('8 aged, future and broken entries dropped', !r['spotify:album:OLD'] && !r['spotify:album:FUT'] && !r['spotify:album:BAD']);
    t.setPlayer(playerWith(track('new', 'A1'), albCtx('A1'), 1000));
    var s = ctxStore(store);
    check('8 storage after a write: 40, newest in, oldest out', Object.keys(s).length === 40 && !!s['spotify:album:A1'] && !s['spotify:album:N39'] && !s['spotify:album:OLD'], Object.keys(s).length);
    // Blocked storage: nothing throws.
    var ok = true;
    var orig = store.setItem;
    store.setItem = function () { throw new Error('QuotaExceeded'); };
    try { t.setPlayer(playerWith(track('new2', 'A1'), albCtx('A1'), 1000)); } catch (e) { ok = false; }
    store.setItem = orig;
    check('8 full storage does not throw', ok && t.readCtxLast()['spotify:album:A1'].uri === 'spotify:track:new2');
    finish(tab);
  });
});

// 9. E2: the Continue button in album, playlist and Liked Songs headers; one play call; hide rules.
tests.push(function () {
  var now = Date.now();
  var store = seed({ 'lib-ctx-last': {
    'spotify:album:A1': { uri: 'spotify:track:c1', id: 'c1', name: 'Halfway Song', positionMs: 95000, durMs: 200000, at: now - 3600e3 },
    'spotify:playlist:P1': { uri: 'spotify:track:c2', id: 'c2', name: 'Near End', positionMs: 175000, durMs: 200000, at: now - 3600e3 },
    'spotify:playlist:P2': { uri: 'spotify:track:c3', id: 'c3', name: 'No Length', positionMs: 900000, durMs: 0, at: now - 3600e3 },
    'liked': { uri: 'spotify:track:c4', id: 'c4', name: 'Liked One', positionMs: 0, durMs: 200000, at: now - 3600e3 }
  }, 'lib-cache-album:A1': { at: now, total: 1, items: [{ id: 'c1', uri: 'spotify:track:c1', name: 'Halfway Song', track_number: 1, duration_ms: 200000, artists: [{ name: 'Band' }] }] } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var album = t.state.data.albums[0];
    t.openDetail(album);
    return H.wait(150).then(function () {
      var b = contBtn(tab);
      check('9 album: Continue shows the song', b && b.textContent === 'Continue · Halfway Song', b && b.textContent);
      check('9 album: opening sent no catalog or player request (only the usual heart check)', tab.calls.filter(function (c) { return c.path !== '/me/library/contains'; }).length === 0, tab.calls);
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(150);
    }).then(function () {
      var p = plays(tab);
      check('9 tap: one play call', p.length === 1 && tab.calls.length === 1, tab.calls);
      check('9 tap: plays in the album at the song and spot', p[0] && JSON.stringify(p[0].body) === '{"context_uri":"spotify:album:A1","offset":{"uri":"spotify:track:c1"},"position_ms":95000}', p[0] && p[0].body);
      // That song playing now: hidden. Paused: shown again.
      t.setPlayer(playerWith(track('c1', 'A1'), albCtx('A1'), 100000));
      check('9 hidden while that song plays', !contBtn(tab));
      t.setPlayer(playerWith(track('c1', 'A1'), albCtx('A1'), 101000, false));
      var b2 = contBtn(tab);
      check('9 shown again when paused, with the newer spot on tap', !!b2);
      tab.calls.length = 0;
      click(tab, b2);
      return H.wait(150);
    }).then(function () {
      var p = plays(tab);
      check('9 paused spot used', p[0] && p[0].body.position_ms === 101000, p[0] && p[0].body);
      // Within the last 30 s: hidden.
      t.setPlayer(playerWith(track('c1', 'A1'), albCtx('A1'), 185000, false));
      check('9 hidden in the last 30 s', !contBtn(tab));
      t.closeDetail();
      t.openDetail(t.state.data.playlists[0]);   // P1: near the end
      return H.wait(150);
    }).then(function () {
      check('9 playlist near the end: hidden', !contBtn(tab));
      t.closeDetail();
      t.openDetail(t.state.data.playlists[1]);   // P2: length unknown
      return H.wait(150);
    }).then(function () {
      var b = contBtn(tab);
      check('9 length unknown: shown', b && b.textContent === 'Continue · No Length', b && b.textContent);
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(150);
    }).then(function () {
      var p = plays(tab);
      check('9 playlist: plays in the playlist', p.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:playlist:P2","offset":{"uri":"spotify:track:c3"},"position_ms":900000}', p[0] && p[0].body);
      t.closeDetail();
      t.openDetail({ kind: 'liked', name: 'Liked Songs', uri: null, url: 'https://open.spotify.com/collection/tracks', sub: 'Playlist' });
      return H.wait(150);
    }).then(function () {
      var b = contBtn(tab);
      check('9 Liked Songs: Continue shows', b && b.textContent === 'Continue · Liked One', b && b.textContent);
      tab.calls.length = 0;
      click(tab, b);
      return H.wait(150);
    }).then(function () {
      var p = plays(tab);
      check('9 Liked Songs: plays in Liked Songs from the start', p.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:user:me1:collection","offset":{"uri":"spotify:track:c4"}}', p[0] && p[0].body);
      t.closeDetail();
      t.openDetail({ kind: 'album', id: 'A2', uri: 'spotify:album:A2', name: 'Unheard', url: 'https://open.spotify.com/album/A2', img: '', sub: 'Album' });
      return H.wait(150);
    }).then(function () {
      check('9 no entry: hidden', !contBtn(tab));
      t.closeDetail();
      t.openDetail(t.state.data.shows[0]);
      return H.wait(150);
    }).then(function () {
      check('9 podcast header: no Continue', !contBtn(tab));
      finish(tab);
    });
  });
});

// 10. E2: asleep / no device: the Continue tap waits for Spotify with the context and spot kept.
tests.push(function () {
  var now = Date.now();
  var store = seed({ 'lib-ctx-last': { 'spotify:album:A1': { uri: 'spotify:track:c1', id: 'c1', name: 'Halfway Song', positionMs: 95000, durMs: 200000, at: now - 1000 } },
    'lib-cache-album:A1': { at: now, total: 1, items: [{ id: 'c1', uri: 'spotify:track:c1', name: 'Halfway Song', track_number: 1, duration_ms: 200000, artists: [{ name: 'Band' }] }] } });
  return setup(store, { noDevice: true }).then(function (tab) {
    var t = tab.t();
    t.state.deviceChecked = true; t.state.devicesAt = Date.now(); t.state.deviceError = '';
    t.openDetail(t.state.data.albums[0]);
    return H.wait(150).then(function () {
      tab.calls.length = 0;
      click(tab, contBtn(tab));
      return H.wait(200);
    }).then(function () {
      var pend = JSON.parse(store.getItem('lib-pending') || 'null');
      check('10 no device: no play call', plays(tab).length === 0, tab.calls);
      check('10 pending keeps list, song and spot', pend && pend.item.ctx === 'spotify:album:A1' && pend.item.uri === 'spotify:track:c1' && pend.item.positionMs === 95000, pend);
      // Spotify shows up: the pending tap plays with the same body.
      tab.env.noDevice = false;
      return H.wait(7000);
    }).then(function () {
      var p = plays(tab);
      check('10 wakes: one play in the album at the spot', p.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:album:A1","offset":{"uri":"spotify:track:c1"},"position_ms":95000}', tab.calls.map(function (c) { return c.method + ' ' + c.path; }));
      finish(tab);
    });
  });
});

// 11. Player paused by Spotify (cool-off): taps send nothing.
tests.push(function () {
  var store = seed({ 'lib-cooloff': { player: { until: Date.now() + 600000, reason: 'rate', strikes: 1 } } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.renderList();
    return H.wait(100).then(function () {
      tab.calls.length = 0;
      click(tab, cardByName(tab, 'hPinned', 'Morning Run').querySelector('button.cardplay'));
      return H.wait(150);
    }).then(function () {
      check('11 player paused: pinned tap sends nothing', tab.calls.length === 0, tab.calls);
      finish(tab);
    });
  });
});

var i = 0;
function next() {
  if (i >= tests.length) {
    results.forEach(function (r) { console.log(r); });
    var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
    console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
    process.exit(fails ? 1 : 0);
  }
  var f = tests[i++];
  f().then(next, function (e) { results.push('FAIL test ' + i + ' threw: ' + (e && e.stack)); next(); });
}
next();
