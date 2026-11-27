'use strict';
// Go to artist (v2.19) tests: jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var FOL_IMG = 'https://i.scdn.co/image/followed-small';
function art(id, name) { return { id: id, name: name, uri: 'spotify:artist:' + id, type: 'artist' }; }
function track(artists, opts) {
  opts = opts || {};
  return { type: 'track', id: opts.id || 't1', uri: 'spotify:track:' + (opts.id || 't1'), name: opts.name || 'Song One', duration_ms: 200000,
    album: { id: 'alb1', name: 'Big Album', uri: 'spotify:album:alb1', images: [], artists: [art('new1', 'New Artist')] },
    artists: artists };
}
function episode() {
  return { type: 'episode', id: 'e1', uri: 'spotify:episode:e1', name: 'Ep', duration_ms: 3000000, images: [],
    show: { id: 's1', name: 'Show', uri: 'spotify:show:s1', images: [] } };
}
function playerFor(item, ctx) {
  return { item: item, currently_playing_type: item.type, context: ctx || { type: 'album', uri: 'spotify:album:alb1' }, is_playing: true,
    progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function release(id, artistId) {
  return { id: id, name: 'Release ' + id, uri: 'spotify:album:' + id, album_type: 'album', release_date: '2024-01-01', total_tracks: 9,
    images: [], artists: [art(artistId, 'Artist ' + artistId)] };
}

function setup(store, opts) {
  opts = opts || {};
  var env = { player: opts.player || null, noDevice: !!opts.noDevice };
  var tab = H.makeTab(store, function (method, path, q) {
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: env.noDevice ? [] : [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
    if (path === '/me/following') return { status: 200, json: { artists: { items: [
      { id: 'fol1', name: 'Followed Artist', uri: 'spotify:artist:fol1', images: [{ url: FOL_IMG, width: 160 }], genres: [] }
    ], next: null, total: 1 } } };
    if (path === '/me/albums') return { status: 200, json: { items: [{ album: { id: 'alb9', name: 'Saved Album', uri: 'spotify:album:alb9', images: [],
      artists: [art('fol1', 'Followed Artist'), art('new1', 'New Artist')], total_tracks: 2 } }], next: null, total: 1 } };
    var m = /^\/artists\/([^/]+)$/.exec(path);
    if (m) return { status: 200, json: { id: m[1], name: 'Artist ' + m[1], images: [{ url: 'https://i.scdn.co/image/' + m[1] + '-api', width: 300 }] } };
    m = /^\/artists\/([^/]+)\/albums$/.exec(path);
    if (m) return { status: 200, json: { items: [release('r-' + m[1], m[1])], next: null, total: 1 } };
    m = /^\/albums\/([^/]+)\/tracks$/.exec(path);
    if (m) return { status: 200, json: { items: [{ id: 'tt1', uri: 'spotify:track:tt1', name: 'Track', type: 'track', track_number: 1, duration_ms: 1000, artists: [art('new1', 'New Artist')] }], next: null, total: 1 } };
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    if (!opts.noDevice) { t.state.device = DEV; t.state.deviceAt = Date.now(); }
    else { t.state.device = null; }
    if (env.player) { t.setPlayer(JSON.parse(JSON.stringify(env.player))); t.state.playerAt = Date.now(); }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function npButtons(tab) { return [].slice.call(d(tab).querySelectorAll('#npOpts button')); }
function artistBtns(tab) { return npButtons(tab).filter(function (b) { return /^Open artist · /.test(b.textContent); }); }
function catalog(tab) { return tab.calls.filter(function (c) { return /^\/(artists|albums|shows|episodes|playlists)\//.test(c.path); }); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function npOpen(tab) { return !d(tab).getElementById('np').hidden; }
function coverSrc(tab) { var i = d(tab).querySelector('#acover img'); return i ? i.getAttribute('src') : ''; }

var tests = [];

// 1. Songs get one button per artist; showing them sends nothing.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(track([art('new1', 'New Artist')])) }).then(function (tab) {
    tab.t().openNp();
    var b = artistBtns(tab);
    check('1 one artist: one button', b.length === 1 && b[0].textContent === 'Open artist · New Artist', b.map(function (x) { return x.textContent; }));
    var labels = npButtons(tab).map(function (x) { return x.textContent; });
    check('1 after Open album', labels.indexOf('Open artist · New Artist') === labels.indexOf('Open album · Big Album') + 1, labels);
    return H.wait(100).then(function () {
      check('1 showing the buttons sends no catalog request', catalog(tab).length === 0, catalog(tab));
      tab.w.close();
    });
  });
});

// 2. Featured artists: up to 3, no duplicates, no local artists without an id.
tests.push(function () {
  var many = [art('ft1', 'Main'), art('ft1', 'Main'), { name: 'Local guy', id: null, uri: null }, art('ft2', 'Feat Two'), art('ft3', 'Feat Three'), art('ft4', 'Feat Four')];
  return setup(H.seedStore(), { player: playerFor(track(many)) }).then(function (tab) {
    tab.t().openNp();
    var b = artistBtns(tab).map(function (x) { return x.textContent; });
    check('2 up to 3 artists, deduped, local skipped', JSON.stringify(b) === JSON.stringify(['Open artist · Main', 'Open artist · Feat Two', 'Open artist · Feat Three']), b);
    // A featured artist opens the right page.
    click(tab, artistBtns(tab)[2]);
    var st = tab.t().state;
    check('2 featured artist opens its own page', st.detail && st.detail.kind === 'artist' && st.detail.item.id === 'ft3' && st.detail.item.name === 'Feat Three', st.detail && st.detail.item);
    check('2 item has what the page needs', st.detail.item.uri === 'spotify:artist:ft3' && st.detail.item.url === 'https://open.spotify.com/artist/ft3', st.detail.item);
    return H.wait(100).then(function () {
      check('2 new artist: picture + releases (2 catalog)', catalog(tab).length === 2 && reqs(tab, 'GET', '/artists/ft3').length === 1 && reqs(tab, 'GET', '/artists/ft3/albums').length === 1, catalog(tab));
      check('2 page shows the fetched picture', coverSrc(tab).indexOf('ft3-api') !== -1, coverSrc(tab));
      check('2 h2 shows the name', d(tab).querySelector('.dname').textContent === 'Feat Three');
      tab.w.close();
    });
  });
});

// 3. Episodes get none.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(episode(), null) }).then(function (tab) {
    tab.t().openNp();
    check('3 episode: no Open artist', artistBtns(tab).length === 0, npButtons(tab).map(function (x) { return x.textContent; }));
    var opts = tab.t().npOptions(playerFor(episode(), null));
    check('3 npOptions has no artist entry for episodes', !opts.some(function (o) { return o.artist; }), opts);
    tab.w.close();
  });
});

// 4. Followed artist: cached picture, 1 catalog request; opened twice: 0. Back returns to the list.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(track([art('fol1', 'Followed Artist'), art('new1', 'New Artist')])) }).then(function (tab) {
    var t = tab.t();
    check('4 followed list loaded', t.state.data && t.state.data.artists && t.state.data.artists[0].id === 'fol1');
    t.openNp();
    click(tab, artistBtns(tab)[0]);
    check('4 Now Playing closes', !npOpen(tab));
    check('4 artist page open', t.state.detail && t.state.detail.kind === 'artist' && t.state.detail.item.id === 'fol1');
    check('4 reuses the library item', t.state.detail.item === t.state.data.artists[0]);
    return H.wait(100).then(function () {
      check('4 followed: exactly 1 catalog request (releases)', catalog(tab).length === 1 && reqs(tab, 'GET', '/artists/fol1/albums').length === 1, catalog(tab));
      check('4 followed: no GET /artists/{id}', reqs(tab, 'GET', '/artists/fol1').length === 0);
      check('4 cached picture shown', coverSrc(tab) === FOL_IMG, coverSrc(tab));
      check('4 releases listed', d(tab).querySelectorAll('#alist li').length === 1);
      t.goBack();
      return H.wait(100);
    }).then(function () {
      check('4 Back returns to the list', !t.state.detail && !d(tab).getElementById('top').classList.contains('detail'), t.state.detail && t.state.detail.item);
      tab.calls.length = 0;
      t.openNp();
      click(tab, artistBtns(tab)[0]);
      return H.wait(100);
    }).then(function () {
      check('4 followed opened again: 0 requests', catalog(tab).length === 0, catalog(tab));
      check('4 releases shown from memory', d(tab).querySelectorAll('#alist li').length === 1);
      t.goBack();
      return H.wait(100);
    }).then(function () {
      tab.calls.length = 0;
      t.openNp();
      click(tab, artistBtns(tab)[1]);
      return H.wait(100);
    }).then(function () {
      check('4 new artist: 2 catalog requests', catalog(tab).length === 2 && reqs(tab, 'GET', '/artists/new1').length === 1 && reqs(tab, 'GET', '/artists/new1/albums').length === 1, catalog(tab));
      t.goBack();
      return H.wait(100);
    }).then(function () {
      tab.calls.length = 0;
      t.openNp();
      click(tab, artistBtns(tab)[1]);
      return H.wait(100);
    }).then(function () {
      check('4 new artist opened twice: 0 requests', catalog(tab).length === 0, catalog(tab));
      check('4 picture from memory', coverSrc(tab).indexOf('new1-api') !== -1, coverSrc(tab));
      check('4 no playback request from opening', reqs(tab, 'PUT', /^\/me\/player/).length === 0);
      tab.w.close();
    });
  });
});

// 5. Back from an artist opened over an album list returns to the list you started from (same as Open album);
//    opened over another artist page, it goes on top and Back returns to that artist.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(track([art('new1', 'New Artist'), art('ft2', 'Feat Two')])) }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.mapAlbum({ id: 'alb5', name: 'Other', uri: 'spotify:album:alb5', images: [], artists: [art('x1', 'X')] }));
    return H.wait(100).then(function () {
      t.openNp();
      click(tab, artistBtns(tab)[0]);
      check('5 over an album: replaces it', t.state.detail.item.id === 'new1' && t.state.detailStack.length === 0, t.state.detailStack.length);
      return H.wait(100);
    }).then(function () {
      t.openNp();
      click(tab, artistBtns(tab)[1]);
      check('5 over an artist: on top', t.state.detail.item.id === 'ft2' && t.state.detailStack.length === 1 && t.state.detailStack[0].item.id === 'new1');
      return H.wait(100);
    }).then(function () {
      t.goBack();
      return H.wait(100);
    }).then(function () {
      check('5 Back returns to the first artist', t.state.detail && t.state.detail.item.id === 'new1', t.state.detail && t.state.detail.item);
      t.goBack();
      return H.wait(100);
    }).then(function () {
      check('5 Back again returns to the list', !t.state.detail);
      // Same artist as the page you're on: just closes Now Playing.
      t.openDetail(t.artistItem({ id: 'new1', name: 'New Artist' }));
      return H.wait(100);
    }).then(function () {
      var before = t.state.detailStack.length;
      tab.calls.length = 0;
      t.openNp();
      click(tab, artistBtns(tab)[0]);
      check('5 same artist from Now Playing: just closes it', !npOpen(tab) && t.state.detailStack.length === before && t.state.detail.item.id === 'new1');
      check('5 same artist: no requests', catalog(tab).length === 0);
      tab.w.close();
    });
  });
});

// 6. Album header: artist names are buttons; Back returns to the album; nothing asked again.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    var saved = t.state.data.albums[0];
    check('6 library albums keep their artists', saved.byArtists && saved.byArtists.length === 2 && saved.byArtists[0].id === 'fol1', saved);
    check('6 cached library has them too', JSON.parse(tab.w.localStorage.getItem('lib-cache')).albums[0].byArtists.length === 2);
    t.openDetail(saved);
    return H.wait(100).then(function () {
      var sub = d(tab).querySelector('.dhead .sub');
      var bs = [].slice.call(sub.querySelectorAll('button.linkbtn'));
      check('6 header text unchanged', sub.textContent === 'Album · Followed Artist, New Artist', sub.textContent);
      check('6 two artist buttons', bs.length === 2 && bs[1].getAttribute('aria-label') === 'Open artist · New Artist');
      tab.calls.length = 0;
      click(tab, bs[0]);
      check('6 opens on top of the album', t.state.detail.kind === 'artist' && t.state.detail.item.id === 'fol1' && t.state.detailStack.length === 1);
      return H.wait(100);
    }).then(function () {
      check('6 followed from header: 1 catalog request', catalog(tab).length === 1 && reqs(tab, 'GET', '/artists/fol1/albums').length === 1, catalog(tab));
      tab.calls.length = 0;
      t.goBack();
      return H.wait(100);
    }).then(function () {
      check('6 Back returns to the album', t.state.detail && t.state.detail.item.id === 'alb9' && d(tab).querySelector('.dname').textContent === 'Saved Album');
      check('6 album not asked again', catalog(tab).length === 0, catalog(tab));
      // Open a release from the artist page: it shows the year, no artist buttons.
      return H.wait(10);
    }).then(function () {
      var bs = d(tab).querySelectorAll('.dhead .sub button.linkbtn');
      click(tab, bs[1]);
      return H.wait(100);
    }).then(function () {
      check('6 new artist from header', t.state.detail.item.id === 'new1');
      var row = d(tab).querySelector('#alist li');
      var rel = t.state.detail.items[0];
      t.openDetail(rel, { push: true });
      return H.wait(100);
    }).then(function () {
      check('6 release header shows year, no artist buttons', d(tab).querySelectorAll('.dhead .sub button').length === 0 && /^2024/.test(d(tab).querySelector('.dhead .sub').textContent), d(tab).querySelector('.dhead .sub').textContent);
      tab.w.close();
    });
  });
});

// 7. Album opened from Now Playing on top of an artist page: tapping that same artist goes back instead of stacking.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(track([art('new1', 'New Artist')])) }).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.artistItem({ id: 'new1', name: 'New Artist' }));
    return H.wait(100).then(function () {
      t.openNp();
      click(tab, npButtons(tab)[0]);   // Open album · Big Album (on top of the artist)
      check('7 album on top of the artist', t.state.detail.item.id === 'alb1' && t.state.detailStack.length === 1);
      return H.wait(100);
    }).then(function () {
      var b = d(tab).querySelector('.dhead .sub button.linkbtn');
      check('7 album header has the artist button', !!b && b.textContent === 'New Artist');
      click(tab, b);
      return H.wait(100);
    }).then(function () {
      check('7 goes back to the artist page, no extra level', t.state.detail.kind === 'artist' && t.state.detail.item.id === 'new1' && t.state.detailStack.length === 0, t.state.detailStack.length);
      // Same from Now Playing: album opened from artist new1, then Open artist · New Artist goes back to it.
      t.openNp();
      click(tab, npButtons(tab)[0]);   // Open album · Big Album, on top of the artist again
      return H.wait(100);
    }).then(function () {
      check('7 album on top of the artist again', t.state.detail.item.id === 'alb1' && t.state.detailStack.length === 1);
      tab.calls.length = 0;
      t.openNp();
      click(tab, artistBtns(tab)[0]);
      return H.wait(100);
    }).then(function () {
      check('7 Now Playing: goes back to the artist, no second copy', !npOpen(tab) && t.state.detail.kind === 'artist' && t.state.detail.item.id === 'new1' && t.state.detailStack.length === 0, t.state.detailStack.length);
      check('7 Now Playing back: no requests', catalog(tab).length === 0, catalog(tab));
      tab.w.close();
    });
  });
});

// 8. Catalog paused: the usual pause message, nothing sent. A followed artist still shows its picture.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { player: playerFor(track([art('fol1', 'Followed Artist'), art('new1', 'New Artist')])) }).then(function (tab) {
    var t = tab.t();
    store.setItem('lib-cooloff', JSON.stringify({ catalog: { until: Date.now() + 600000, reason: 'quota', strikes: 1, quotaAt: Date.now(), retryAfter: null, last429: { at: Date.now(), reason: 'quota', retryAfter: null, what: 'GET /artists/x' } } }));
    t.openNp();
    click(tab, artistBtns(tab)[1]);
    return H.wait(100).then(function () {
      check('8 paused: page opens', t.state.detail && t.state.detail.item.id === 'new1');
      check('8 paused: no catalog request', catalog(tab).length === 0, catalog(tab));
      var err = d(tab).querySelector('#afoot .err');
      check('8 paused: usual pause message', !!err && /paused/i.test(err.textContent), err && err.textContent);
      check('8 paused: one toast', tab.toasts().length === 1 && /paused/i.test(tab.toasts()[0]), tab.toasts());
      t.goBack();
      return H.wait(100);
    }).then(function () {
      t.openNp();
      click(tab, artistBtns(tab)[0]);
      return H.wait(100);
    }).then(function () {
      check('8 paused followed: no request', catalog(tab).length === 0, catalog(tab));
      check('8 paused followed: cached picture still shown', coverSrc(tab) === FOL_IMG, coverSrc(tab));
      // Pause ends: Try again sends releases only for the followed artist.
      store.removeItem('lib-cooloff');
      tab.calls.length = 0;
      click(tab, d(tab).querySelector('#afoot button'));
      return H.wait(100);
    }).then(function () {
      check('8 after pause, Try again: 1 request (followed)', catalog(tab).length === 1 && reqs(tab, 'GET', '/artists/fol1/albums').length === 1, catalog(tab));
      tab.w.close();
    });
  });
});

// 9. Asleep / no device: opening an artist plays nothing and needs no device.
tests.push(function () {
  return setup(H.seedStore(), { player: playerFor(track([art('new1', 'New Artist')])), noDevice: true }).then(function (tab) {
    var t = tab.t();
    t.state.asleep = true;
    t.openNp();
    click(tab, artistBtns(tab)[0]);
    return H.wait(100).then(function () {
      check('9 no device: artist page opens', t.state.detail && t.state.detail.item.id === 'new1');
      check('9 no device: no play or transfer request', reqs(tab, 'PUT', /^\/me\/player/).length === 0, reqs(tab, 'PUT', /^\/me\/player/));
      check('9 no device: no wake message toast', !tab.toasts().some(function (x) { return /wake|press play/i.test(x); }), tab.toasts());
      tab.w.close();
    });
  });
});

// 10. Helpers: artistRefs caps and cleans; pins keep album artists; search artists with a picture skip GET /artists/{id}.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    var r = t.artistRefs([art('a', 'A'), null, { id: 'b' }, art('a', 'A again'), art('c', 'C'), art('d', 'D'), art('e', 'E')]);
    check('10 artistRefs: 3, deduped, name required', JSON.stringify(r) === JSON.stringify([{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]), r);
    check('10 artistRefs: empty for none', t.artistRefs(undefined).length === 0);
    var alb = t.mapAlbum({ id: 'p1', name: 'P', uri: 'spotify:album:p1', images: [], artists: [art('a', 'A')] });
    var pin = t.pinRecord(alb);
    check('10 pin keeps album artists', pin.byArtists && pin.byArtists[0].id === 'a');
    check('10 pin of an artist has no byArtists', t.pinRecord(t.artistItem({ id: 'z', name: 'Z' })).byArtists === undefined);
    var ni = t.artistItem({ id: 'q', name: 'Q' });
    check('10 new artist item shape', ni.kind === 'artist' && ni.uri === 'spotify:artist:q' && ni.img === '' && ni.name === 'Q');
    // An artist opened from search already has a picture: only the releases are asked.
    tab.calls.length = 0;
    t.openDetail({ kind: 'artist', id: 'srch', name: 'S', uri: 'spotify:artist:srch', url: 'https://open.spotify.com/artist/srch', img: 'https://i/x', sub: 'Artist' });
    return H.wait(100).then(function () {
      check('10 artist with a picture: 1 request', catalog(tab).length === 1 && reqs(tab, 'GET', '/artists/srch').length === 0, catalog(tab));
      // Album without stored artists (older cache): plain text, no buttons.
      t.openDetail({ kind: 'album', id: 'old', name: 'Old', uri: 'spotify:album:old', url: 'u', img: '', sub: 'Album · Someone' });
      return H.wait(100);
    }).then(function () {
      check('10 old cached album: plain header', d(tab).querySelectorAll('.dhead .sub button').length === 0 && d(tab).querySelector('.dhead .sub').textContent === 'Album · Someone');
      // Four artists: three buttons, the fourth stays text.
      t.openDetail(t.mapAlbum({ id: 'four', name: 'Four', uri: 'spotify:album:four', images: [], artists: [art('a', 'A'), art('b', 'B'), art('c', 'C'), art('e', 'E')] }));
      return H.wait(100);
    }).then(function () {
      var sub = d(tab).querySelector('.dhead .sub');
      check('10 four artists: 3 buttons, full text kept', sub.querySelectorAll('button').length === 3 && sub.textContent === 'Album · A, B, C, E', sub.textContent);
      click(tab, sub.querySelectorAll('button')[2]);
      check('10 header tap focuses Back on the artist page', d(tab).activeElement && d(tab).activeElement.classList.contains('back'), d(tab).activeElement && d(tab).activeElement.className);
      tab.w.close();
    });
  });
});

var chain = Promise.resolve();
tests.forEach(function (f) { chain = chain.then(f).catch(function (e) { check('test threw', false, e && e.stack); }); });
chain.then(function () {
  results.forEach(function (r) { console.log(r); });
  var fail = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fail) + '/' + results.length + ' passed');
  process.exit(fail ? 1 : 0);
});
