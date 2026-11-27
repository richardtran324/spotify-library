'use strict';
// Podcasts and artists tests: Latest episodes, podcast pages and their saved copies, Saved episodes, podcast history,
// album pages and artist pages. jsdom, mocked fetch (answers on timers), shared localStorage.
// Run: node tests/run.js podcasts-artists  (or: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var HOUR = 3600000, MIN = 60000;
function pad(n) { return (n < 10 ? '0' : '') + n; }
// A local calendar day n days ago, as Spotify writes release dates (the page compares them with local midnight).
function dayIso(n) { var t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - n); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
function showObj(k, name) { return { id: 's' + k, name: name || ('Show ' + k), uri: 'spotify:show:s' + k, images: [], total_episodes: 5 }; }
var SHOWS = []; for (var k = 1; k <= 14; k++) SHOWS.push(showObj(k));
// A Spotify episode object.
function spEp(id, showId, date, o) {
  o = o || {};
  var e = { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: o.name || ('Episode ' + id), release_date: date,
    duration_ms: o.dur || HOUR, images: [], show: { id: showId, name: o.showName || ('Show ' + showId.slice(1)), images: [] },
    description: 'Notes for ' + id, html_description: '<p>Notes for ' + id + '</p>', is_playable: o.unplayable ? false : true,
    resume_point: { fully_played: !!o.played, resume_position_ms: o.pos || 0 } };
  return e;
}
// Latest answer for show k: 5 episodes, released (12 - k) + 13 j days ago (all dates differ).
// e12-0 is started, e11-0 is played, e3-1 can't be played (dropped).
function latestAnswer(k) {
  var items = [];
  for (var j = 0; j < 5; j++) {
    var id = 'e' + k + '-' + j;
    items.push(spEp(id, 's' + k, dayIso((12 - k) + 13 * j), { pos: id === 'e12-0' ? 10 * MIN : 0, played: id === 'e11-0', unplayable: id === 'e3-1' }));
  }
  return { items: items, next: null, total: 5 };
}
// A cached Latest row (as the page stores it).
function lrow(id, showId, showName, days, o) {
  o = o || {};
  return { id: id, uri: 'spotify:episode:' + id, name: o.name || ('Episode ' + id), img: '', showId: showId, showName: showName, date: dayIso(days),
    durMs: o.dur || HOUR, positionMs: o.pos || 0, played: !!o.played };
}
// A saved podcast copy entry (as slEpisode keeps it).
function slEp(id, days, o) {
  o = o || {};
  return { id: id, uri: 'spotify:episode:' + id, name: o.name || ('Episode ' + id), release_date: dayIso(days), duration_ms: HOUR, images: [],
    resume_point: { fully_played: !!o.played, resume_position_ms: o.pos || 0 } };
}
// Show page answers: total episodes, newest first, `n` from `from`; `next` is Spotify's own link.
function showEps(showId, from, n, total) {
  var items = [];
  for (var i = from; i < Math.min(from + n, total); i++) items.push(spEp(showId + '-' + i, showId, dayIso(i), { showName: 'Pod ' + showId }));
  var more = from + n < total;
  return { items: items, total: total, next: more ? 'https://api.spotify.com/v1/shows/' + showId + '/episodes?offset=' + (from + n) + '&limit=50' : null };
}
function track(albumId, i, o) {
  o = o || {};
  return { type: 'track', id: albumId + 't' + i, uri: 'spotify:track:' + albumId + 't' + i, name: o.name || ('Track ' + i), track_number: o.num || i,
    disc_number: o.disc || 1, duration_ms: 200000, artists: [{ id: 'ar1', name: 'Main Artist' }], explicit: false, preview_url: null };
}
function albumTracks(albumId, from, n, total) {
  var items = [];
  for (var i = from; i < Math.min(from + n, total); i++) items.push(track(albumId, i + 1));
  var more = from + n < total;
  return { items: items, total: total, next: more ? 'https://api.spotify.com/v1/albums/' + albumId + '/tracks?offset=' + (from + n) + '&limit=50' : null };
}
function release(id, o) {
  o = o || {};
  var r = { id: id, name: o.name || ('Release ' + id), uri: 'spotify:album:' + id, release_date: o.date || '2020-01-01', total_tracks: o.n == null ? 9 : o.n,
    images: [], artists: [{ id: 'ar1', name: 'Main Artist' }] };
  if (o.type !== undefined) r.album_type = o.type;
  if (o.group !== undefined) r.album_group = o.group;
  return r;
}
function cool(group, ms) {
  var o = {};
  o[group] = { until: Date.now() + (ms || 10 * MIN), reason: 'rate', strikes: 0, quotaAt: 0, retryAfter: null,
    last429: { at: Date.now(), reason: 'rate limit', retryAfter: null, what: 'GET /x' } };
  return JSON.stringify(o);
}
function store0(o) {
  o = o || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(o.filter || 'podcasts'));
  if (o.latest) s.setItem('lib-latest', JSON.stringify(o.latest));
  return s;
}

// Open tabs: settle() waits at least `ms`, then until none of them has a request in flight (at most 8 s), so a
// slow machine doesn't cut a load short.
var LIVE = [];
function idle() { return LIVE.every(function (t) { return t.flight.now === 0; }); }
function settle(ms) {
  var end = Date.now() + 8000;
  function loop() { return H.wait(20).then(function () { return idle() || Date.now() > end ? H.wait(20).then(function () { return idle() || Date.now() > end ? null : loop(); }) : loop(); }); }
  return H.wait(ms).then(loop);
}
function close(tab) { LIVE = LIVE.filter(function (t) { return t !== tab; }); tab.w.close(); }

// env.shows: the saved podcasts (/me/shows); env.latest(id, q) / env.page(path, q) answer catalog requests;
// env.saved: /me/episodes items; env.player answers GET /me/player.
function setup(store, opts) {
  opts = opts || {};
  var env = { shows: opts.shows === undefined ? SHOWS : opts.shows, player: null, latest: opts.latest || null, page: opts.page || null,
    saved: opts.saved || [], savedTotal: opts.savedTotal, showsStatus: opts.showsStatus || 200 };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    call.q = q;
    var m;
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
    if (path === '/me/library/contains' || /\/contains$/.test(path)) return { status: 200, json: [] };
    if (path === '/me/shows') {
      if (env.showsStatus !== 200) return { status: env.showsStatus, json: { error: { status: env.showsStatus, message: 'Server error' } } };
      return { status: 200, json: { items: env.shows.map(function (s) { return { show: s }; }), next: null, total: env.shows.length } };
    }
    if (path === '/me/episodes') {
      if (q.get('limit') === '1') return { status: 200, json: { items: [], next: null, total: env.savedTotal == null ? env.saved.length : env.savedTotal } };
      return { status: 200, json: { items: env.saved.map(function (e) { return { added_at: '2026-11-01T00:00:00Z', episode: e }; }), next: null, total: env.saved.length } };
    }
    if ((m = /^\/shows\/([^/]+)\/episodes$/.exec(path)) && q.get('limit') === '5') {
      var r = env.latest ? env.latest(m[1], q) : null;
      if (r) return r;
      var kk = +m[1].slice(1);
      return { status: 200, json: latestAnswer(kk), delay: 20 };
    }
    if (env.page) { var a = env.page(path, q, method); if (a) return a; }
  });
  tab.env = env;
  LIVE.push(tab);
  return settle(opts.wait || 600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    tab.boot = tab.calls.slice();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function q(tab, sel) { return d(tab).querySelector(sel); }
function qa(tab, sel) { return [].slice.call(d(tab).querySelectorAll(sel)); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function reqs(list, method, path) { return list.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function latestReqs(list) { return list.filter(function (c) { return c.method === 'GET' && /^\/shows\/[^/]+\/episodes$/.test(c.path) && c.q && c.q.get('limit') === '5'; }); }
function catalog(list) { return list.filter(function (c) { return /^\/(shows|episodes|albums|artists|playlists)\//.test(c.path); }); }
function showIdOf(c) { return c.path.split('/')[2]; }
function rowUris(tab, sel) { return qa(tab, (sel || '#main ul.list') + ' li[data-puri]').map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }); }
function rowSub(tab, id) { var r = q(tab, 'ul.list li[data-puri="spotify:episode:' + id + '"] .sub'); return r ? r.textContent : null; }
function noteText(tab) { var n = q(tab, '.lnote'); return n ? n.textContent : ''; }
function refreshBtn(tab) { return qa(tab, '.lnote .linkbtn').filter(function (b) { return b.textContent === 'Refresh'; })[0]; }
function segBtn(tab, name) { return q(tab, '.seg [data-tab="' + name + '"]'); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function stored(store, k) { try { return JSON.parse(store.getItem(k) || 'null'); } catch (e) { return 'bad'; } }
function maxInFlight(list) {
  var ev = [];
  list.forEach(function (c) { ev.push([c.s, 1]); if (c.e) ev.push([c.e, -1]); });
  ev.sort(function (a, b) { return a[0] - b[0]; });
  var n = 0, max = 0;
  ev.forEach(function (x) { n += x[1]; max = Math.max(max, n); });
  return max;
}
function detailNote(tab) { var n = q(tab, '#dnote'); return n && !n.hidden ? n.textContent : ''; }
function detailSum(tab) { var n = q(tab, '#dsum'); return n && !n.hidden ? n.textContent : ''; }
function footBtn(tab, text, sel) { return qa(tab, (sel || '#dfoot') + ' button').filter(function (b) { return b.textContent === text; })[0]; }
function noteBtn(tab, text) { return qa(tab, '#dnote button').filter(function (b) { return b.textContent === text; })[0]; }
function dRows(tab) { return qa(tab, '#dlist li'); }
function dIds(tab) { return dRows(tab).map(function (li) { var a = li.querySelector('a.item'); return a ? a.getAttribute('href').split('/').pop() : ''; }); }
function showItem(id, name) { return { kind: 'show', id: id, uri: 'spotify:show:' + id, name: name || ('Pod ' + id), url: 'https://open.spotify.com/show/' + id, img: '', sub: 'Podcast' }; }
function albumItem(id, name) {
  return { kind: 'album', id: id, uri: 'spotify:album:' + id, name: name || ('Album ' + id), url: 'https://open.spotify.com/album/' + id, img: '', sub: 'Album · Main Artist',
    artist: 'Main Artist', artist1: 'Main Artist', released: '2020-01-01', tracks: null, byArtists: [{ id: 'ar1', name: 'Main Artist' }] };
}
function artistItem(id, img) { return { kind: 'artist', id: id, name: 'Artist ' + id, uri: 'spotify:artist:' + id, url: 'https://open.spotify.com/artist/' + id, img: img || '', sub: 'Artist' }; }

var tests = [];

// 1. First visit to Podcasts → Latest with nothing cached: the 12 first saved shows, 5 each, 2 at a time; the
//    newest 50 kept and shown newest first; saved podcast copies take the new episodes.
var tab1 = null, store1 = null;
tests.push(function () {
  store1 = store0();
  store1.setItem('lib-cache-show:s12', JSON.stringify({ at: Date.now() - 20 * HOUR, total: 30, items: [slEp('e12-1', 14), slEp('old12x', 40)] }));
  store1.setItem('lib-cache-show:s11', JSON.stringify({ at: Date.now() - 20 * HOUR, total: 30, items: [slEp('old11x', 60)] }));
  var at11 = stored(store1, 'lib-cache-show:s11').at;
  var t0 = Date.now();
  return setup(store1).then(function (tab) {
    tab1 = tab;
    var lr = latestReqs(tab.boot);
    check('1 asks 12 shows, not all 14', lr.length === 12, lr.map(showIdOf));
    check('1 first time: the first 12 in saved order', JSON.stringify(lr.map(showIdOf)) === JSON.stringify(SHOWS.slice(0, 12).map(function (s) { return s.id; })), lr.map(showIdOf));
    check('1 each asks the newest 5 from offset 0', lr.every(function (c) { return c.q.get('limit') === '5' && c.q.get('offset') === '0'; }), lr.map(function (c) { return c.query; }));
    check('1 at most 2 shows in flight', maxInFlight(lr) === 2, maxInFlight(lr));
    var c = stored(store1, 'lib-latest');
    check('1 saved on the phone: 50 newest', c && c.items.length === 50 && c.asked === 12 && c.failed === 0 && c.at >= t0, c && { n: c.items.length, asked: c.asked, failed: c.failed });
    var sorted = c.items.every(function (x, i) { return !i || c.items[i - 1].date >= x.date; });
    check('1 cache is newest first', sorted && c.items[0].id === 'e12-0' && c.items[1].id === 'e11-0', c.items.slice(0, 3).map(function (x) { return x.id; }));
    check('1 unplayable episode dropped', !c.items.some(function (x) { return x.id === 'e3-1'; }));
    check('1 newest date per show kept, only for asked shows', c.newest && c.newest.s12 === dayIso(0) && c.newest.s1 === dayIso(11) && !c.newest.s13, c.newest);
    check('1 cache rows keep no notes', JSON.stringify(c).indexOf('Notes for') === -1);
    var ids = rowUris(tab);
    check('1 list shows 50 rows newest first', ids.length === 50 && ids[0] === 'e12-0' && ids[2] === 'e10-0', ids.slice(0, 4));
    check('1 started row: show, Today, time left', /^Show 12 · Today · 50 min left/.test(rowSub(tab, 'e12-0')), rowSub(tab, 'e12-0'));
    check('1 played row: Yesterday · Played', /^Show 11 · Yesterday · Played/.test(rowSub(tab, 'e11-0')), rowSub(tab, 'e11-0'));
    function dot(id) { return !!q(tab, 'ul.list li[data-puri="spotify:episode:' + id + '"] .newdot'); }
    check('1 green dot only on new, unstarted episodes', dot('e10-0') && !dot('e12-0') && !dot('e11-0') && !dot('e12-1'), [dot('e10-0'), dot('e12-0'), dot('e11-0'), dot('e12-1')]);
    check('1 note says Updated just now, with Refresh', /Updated just now/.test(noteText(tab)) && !!refreshBtn(tab), noteText(tab));
    var s12 = stored(store1, 'lib-cache-show:s12'), s11 = stored(store1, 'lib-cache-show:s11');
    check('1 saved podcast copy gets the new episodes on top', s12 && JSON.stringify(s12.items.map(function (x) { return x.id; })) === JSON.stringify(['e12-0', 'e12-1', 'e12-2', 'e12-3', 'e12-4', 'old12x']), s12 && s12.items.map(function (x) { return x.id; }));
    check('1 overlapping copy counts as checked now', s12.at >= t0, s12.at - t0);
    check('1 copy without overlap keeps its age', s11 && s11.items[0].id === 'e11-0' && s11.items[5].id === 'old11x' && s11.at === at11, s11 && { at: s11.at, ids: s11.items.map(function (x) { return x.id; }) });
    check('1 no copies made for other shows; no notes in them', store1.getItem('lib-cache-show:s1') === null && store1.getItem('lib-cache-show:s12').indexOf('Notes for') === -1);
  });
});

// 2. Back to Latest within 12 hours: nothing asked, in this tab or after a reload. Shows tab orders by newest episode.
tests.push(function () {
  var tab = tab1;
  click(tab, segBtn(tab, 'shows'));
  return settle(50).then(function () {
    var names = qa(tab, '#main ul.list li a.item .name').map(function (n) { return n.textContent; });
    var expect = ['Saved episodes'];
    for (var k = 12; k >= 1; k--) expect.push('Show ' + k);
    expect.push('Show 13', 'Show 14');
    check('2 Shows: newest updated first, uncovered shows last in saved order', JSON.stringify(names) === JSON.stringify(expect), names);
    var sub = qa(tab, '#main ul.list li a.item').filter(function (a) { return a.querySelector('.name').textContent === 'Show 12'; })[0];
    check('2 Shows row says Latest Today', sub && /Latest Today/.test(sub.querySelector('.sub').textContent), sub && sub.querySelector('.sub').textContent);
    click(tab, segBtn(tab, 'latest'));
    return settle(100);
  }).then(function () {
    check('2 reopening Latest: no requests', latestReqs(tab.calls).length === 0, tab.calls.map(function (c) { return c.path; }));
    check('2 cache is fresh', tab.t().latestFresh(tab.t().state.latest.cache) === true);
    return setup(store1);
  }).then(function (tab2) {
    check('2 after a reload: no Latest requests', latestReqs(tab2.boot).length === 0, latestReqs(tab2.boot).map(showIdOf));
    check('2 after a reload: rows from the phone', rowUris(tab2).length === 50 && rowUris(tab2)[0] === 'e12-0', rowUris(tab2).length);
    close(tab2);
  });
});

// 3. Refresh: at most once per 5 minutes; after that it asks the 12 shows that published most recently.
tests.push(function () {
  var tab = tab1, t = tab.t();
  click(tab, refreshBtn(tab));
  return settle(100).then(function () {
    check('3 Refresh right away: toast, nothing sent', lastToast(tab) === 'Updated a moment ago. Try again in 5 minutes.' && latestReqs(tab.calls).length === 0, { toast: tab.toasts(), calls: tab.calls.length });
    t.state.latest.triedAt -= 6 * MIN;
    t.state.latest.cache.at -= 6 * MIN;
    t.state.latest.cache.newest.s13 = dayIso(0);   // a 13th show published today too (ties keep saved order); s1 is now the oldest
    var before = t.state.latest.cache.at;
    click(tab, refreshBtn(tab));
    return H.wait(5).then(function () {
      check('3 shows Updating… while loading, Refresh hidden', /Updating…/.test(noteText(tab)) && !refreshBtn(tab), noteText(tab));
      return settle(400);
    }).then(function () {
      var lr = latestReqs(tab.calls);
      check('3 after 5 minutes: 12 requests', lr.length === 12, lr.map(showIdOf));
      check('3 most recently updated shows first, ties in saved order', showIdOf(lr[0]) === 's12' && showIdOf(lr[1]) === 's13' && showIdOf(lr[2]) === 's11', lr.map(showIdOf));
      // #30 (audit/latest-episodes-fixes): with more than 12 saved shows and one never asked (s14), the last 6 of the 12
      // places go to the shows asked longest ago: s14 first, then the rest (all asked at once in 1) in saved order.
      check('3 six newest-updated shows, then the never-asked show and the longest-asked in saved order',
        JSON.stringify(lr.map(showIdOf)) === JSON.stringify(['s12', 's13', 's11', 's10', 's9', 's8', 's14', 's1', 's2', 's3', 's4', 's5']), lr.map(showIdOf));
      check('3 cache newer, note back to Updated just now', t.state.latest.cache.at > before && /Updated just now/.test(noteText(tab)) && !/Updating/.test(noteText(tab)), noteText(tab));
      close(tab);
    });
  });
});

// 4. A cache over 12 hours old reloads on open; a failed show keeps its old episodes; shows not asked keep theirs.
tests.push(function () {
  var newest = { s13: dayIso(0), s14: dayIso(1) };
  for (var k = 1; k <= 12; k++) newest['s' + k] = dayIso(20 + k);
  var oldItems = [lrow('old13', 's13', 'Show 13', 0), lrow('old14', 's14', 'Show 14', 1), lrow('old1', 's1', 'Show 1', 21), lrow('old11', 's11', 'Show 11', 31), lrow('old12', 's12', 'Show 12', 32)];
  var store = store0({ latest: { at: Date.now() - 13 * HOUR, items: oldItems, failed: 0, newest: newest, asked: 12 } });
  return setup(store, { latest: function (id) {
    if (id === 's13') return { status: 500, json: { error: { status: 500, message: 'Server error' } } };
    if (id === 's14') return { status: 200, json: { items: [spEp('n14', 's14', dayIso(0))], next: null, total: 1 } };
    return null;
  } }).then(function (tab) {
    var lr = latestReqs(tab.boot).map(showIdOf);
    check('4 stale cache reloads on open: 12 requests', lr.length === 12, lr);
    check('4 order follows the cache: s13, s14 first', lr[0] === 's13' && lr[1] === 's14', lr);
    check('4 the two oldest shows are not asked', lr.indexOf('s11') === -1 && lr.indexOf('s12') === -1, lr);
    var c = stored(store, 'lib-latest');
    var ids = c.items.map(function (x) { return x.id; });
    check('4 failed show keeps its cached episode', ids.indexOf('old13') !== -1, ids.slice(0, 8));
    check('4 shows not asked keep theirs', ids.indexOf('old11') !== -1 && ids.indexOf('old12') !== -1);
    check('4 answered shows replace theirs', ids.indexOf('old1') === -1 && ids.indexOf('old14') === -1 && ids.indexOf('n14') !== -1);
    check('4 failure counted and shown', c.failed === 1 && /Couldn’t load 1 show/.test(noteText(tab)), { failed: c.failed, note: noteText(tab) });
    check('4 newest dates kept for shows not asked', c.newest.s12 === dayIso(32), c.newest);
    close(tab);
  });
});

// 5. A cache dated in the future isn't trusted; a catalog pause blocks loading and Refresh.
tests.push(function () {
  var store = store0({ latest: { at: Date.now() + 2 * HOUR, items: [lrow('f1', 's1', 'Show 1', 0)], failed: 0, newest: {}, asked: 1 } });
  return setup(store).then(function (tab) {
    check('5 future-dated cache reloads', latestReqs(tab.boot).length === 12, latestReqs(tab.boot).length);
    close(tab);
    var st = store0({ latest: { at: Date.now() - 13 * HOUR, items: [lrow('p1', 's1', 'Show 1', 0)], failed: 0, newest: {}, asked: 1 } });
    st.setItem('lib-cooloff', cool('catalog'));
    return setup(st);
  }).then(function (tab) {
    check('5 paused: nothing asked on open', latestReqs(tab.boot).length === 0, latestReqs(tab.boot).map(showIdOf));
    check('5 paused: note says until when, and the age', /Paused by Spotify until \d+:\d\d [AP]M/.test(noteText(tab)) && /Updated 13 h ago/.test(noteText(tab)), noteText(tab));
    check('5 paused: old rows still shown', rowUris(tab).join() === 'p1', rowUris(tab));
    click(tab, refreshBtn(tab));
    return settle(100).then(function () {
      check('5 paused: Refresh sends nothing and says why', latestReqs(tab.calls).length === 0 && /Spotify paused podcast and album details/.test(lastToast(tab)), { toasts: tab.toasts(), n: tab.calls.length });
      close(tab);
    });
  });
});

// 6. A 429 during a load stops it: nothing more is sent, the pause is stored, what arrived is kept.
tests.push(function () {
  var store = store0();
  return setup(store, { latest: function (id) {
    if (id === 's1') return { status: 429, headers: { 'retry-after': '120' }, json: { error: { status: 429, message: 'API rate limit exceeded' } } };
    if (id === 's2') return { status: 200, json: latestAnswer(2), delay: 30 };
    return null;
  } }).then(function (tab) {
    var lr = latestReqs(tab.boot).map(showIdOf);
    check('6 stops after the 429: only the 2 in flight', JSON.stringify(lr) === '["s1","s2"]', lr);
    var cl = stored(store, 'lib-cooloff');
    check('6 catalog paused for Retry-After', cl && cl.catalog && cl.catalog.until > Date.now() + 100000 && cl.catalog.until < Date.now() + 130000, cl);
    var c = stored(store, 'lib-latest');
    check('6 what arrived is saved, the rest counted as not loaded', c && c.items.length === 5 && c.items[0].showId === 's2' && c.failed === 11, c && { n: c.items.length, failed: c.failed });
    check('6 note shows the pause', /Paused by Spotify until/.test(noteText(tab)), noteText(tab));
    return settle(300).then(function () {
      click(tab, refreshBtn(tab));
      return settle(100);
    }).then(function () {
      check('6 never asked again on its own, Refresh blocked', latestReqs(tab.calls).length === 0, tab.calls.map(function (x) { return x.path; }));
      close(tab);
    });
  });
});

// 7. Every show fails: an error, nothing cached, Play newest explains.
tests.push(function () {
  var store = store0();
  return setup(store, { latest: function () { return { status: 500, json: { error: { status: 500, message: 'Server error' } } }; } }).then(function (tab) {
    check('7 all 12 asked', latestReqs(tab.boot).length === 12);
    check('7 nothing cached', store.getItem('lib-latest') === null);
    check('7 error and Refresh shown', /Couldn’t load the latest episodes\./.test(noteText(tab)) && !!refreshBtn(tab), noteText(tab));
    click(tab, q(tab, '.lbar a.btn'));
    check('7 Play newest: toast, nothing played', lastToast(tab) === 'No unplayed episodes.' && reqs(tab.calls, 'PUT', '/me/player/play').length === 0, tab.toasts());
    close(tab);
  });
});

// 8. Header controls on a saved list: Play newest, Hide played, sort chips, name filter; history newer than the list wins.
tests.push(function () {
  var shows = [showObj('a', 'Alpha Show'), showObj('b', 'Beta Show')];
  var items = [
    lrow('p1', 'sb', 'Beta Show', 1, { name: 'Budget day', played: true }),
    lrow('p2', 'sa', 'Alpha Show', 3, { name: 'Cash flow', pos: 20 * MIN }),
    lrow('p3', 'sb', 'Beta Show', 10, { name: 'Debt talk' }),
    lrow('p4', 'sa', 'Alpha Show', 20, { name: 'Equity', played: true })
  ];
  var store = store0({ latest: { at: Date.now() - MIN, items: items, failed: 0, newest: { sa: dayIso(3), sb: dayIso(1) }, asked: 2 } });
  store.setItem('lib-ep-history', JSON.stringify([
    { uri: 'spotify:episode:p3', id: 'p3', name: 'Debt talk', show: { id: 'sb', name: 'Beta Show', images: [] }, duration_ms: HOUR, positionMs: 30 * MIN, played: false, at: Date.now() },
    { uri: 'spotify:episode:p1', id: 'p1', name: 'Budget day', show: { id: 'sb', name: 'Beta Show', images: [] }, duration_ms: HOUR, positionMs: MIN, played: false, at: Date.now() - 2 * HOUR }
  ]));
  return setup(store, { shows: shows }).then(function (tab) {
    check('8 fresh list: nothing asked', latestReqs(tab.boot).length === 0);
    check('8 history heard after the list wins', /30 min left$/.test(rowSub(tab, 'p3')), rowSub(tab, 'p3'));
    check('8 history older than the list doesn\'t', /Played$/.test(rowSub(tab, 'p1')), rowSub(tab, 'p1'));
    var play = q(tab, '.lbar a.btn');
    check('8 Play newest names the newest unfinished', /Cash flow/.test(play.getAttribute('aria-label')), play.getAttribute('aria-label'));
    click(tab, play);
    return settle(200).then(function () {
      var p = reqs(tab.calls, 'PUT', '/me/player/play');
      check('8 Play newest plays it from where you left off', p.length === 1 && JSON.stringify(p[0].body) === JSON.stringify({ uris: ['spotify:episode:p2'], position_ms: 20 * MIN }) && /device_id=A/.test(p[0].query), p.map(function (x) { return x.body; }));
      click(tab, q(tab, '.lbar .chip'));
      check('8 Hide played on: played rows hidden, setting kept', rowUris(tab).join() === 'p2,p3' && store.getItem('lib-hide-played') === 'true' && q(tab, '.lbar .chip').getAttribute('aria-pressed') === 'true', rowUris(tab));
      click(tab, q(tab, '.lbar .chip'));
      check('8 Hide played off: all back', rowUris(tab).join() === 'p1,p2,p3,p4' && store.getItem('lib-hide-played') === 'false', rowUris(tab));
      click(tab, q(tab, '.sortbar[data-view="latest"] [data-sort="oldest"]'));
      check('8 Oldest first', rowUris(tab).join() === 'p4,p3,p2,p1' && store.getItem('lib-sort-latest') === '"oldest"', rowUris(tab));
      check('8 Play newest ignores the sort', /Cash flow/.test(q(tab, '.lbar a.btn').getAttribute('aria-label')));
      click(tab, q(tab, '.sortbar[data-view="latest"] [data-sort="show"]'));
      check('8 Show A–Z, each show newest first', rowUris(tab).join() === 'p2,p4,p1,p3', rowUris(tab));
      click(tab, q(tab, '.sortbar[data-view="latest"] [data-sort="newest"]'));
      var box = q(tab, '#search');
      box.value = 'alpha';
      box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('8 name box filters by show too', rowUris(tab).join() === 'p2,p4', rowUris(tab));
      box.value = 'zzz';
      box.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('8 no match says so', /Nothing matches “zzz”\./.test(q(tab, '#main').textContent), q(tab, '#main').textContent.slice(-80));
      check('8 none of this sent a request', tab.calls.filter(function (c) { return c.method === 'GET' && /^\/shows\//.test(c.path); }).length === 0);
      close(tab);
    });
  });
});

// 9. Everything played with Hide played on; another copy's newer list is picked up from storage.
tests.push(function () {
  var items = [lrow('x1', 's1', 'Show 1', 1, { played: true }), lrow('x2', 's1', 'Show 1', 2, { played: true })];
  var store = store0({ latest: { at: Date.now() - 2 * MIN, items: items, failed: 0, newest: { s1: dayIso(1) }, asked: 1 } });
  store.setItem('lib-hide-played', 'true');
  return setup(store, { shows: [showObj(1)] }).then(function (tab) {
    check('9 all played and hidden: explains', /Everything here is played\. Turn off Hide played to see it\./.test(q(tab, '#main').textContent));
    var at0 = tab.t().state.latest.cache.at;
    store.setItem('lib-latest', JSON.stringify({ at: at0 + 1000, items: [lrow('y1', 's1', 'Show 1', 0)], failed: 0, newest: { s1: dayIso(0) }, asked: 1 }));
    store.setItem('lib-hide-played', 'false');
    click(tab, segBtn(tab, 'shows'));
    click(tab, segBtn(tab, 'latest'));
    return settle(50).then(function () {
      check('9 newer list from another copy shown', rowUris(tab).join() === 'y1' && tab.t().state.latest.cache.at === at0 + 1000, rowUris(tab));
      store.setItem('lib-latest', JSON.stringify({ at: at0 - 5000, items: [lrow('z1', 's1', 'Show 1', 0)], failed: 0, newest: {}, asked: 1 }));
      click(tab, segBtn(tab, 'shows'));
      click(tab, segBtn(tab, 'latest'));
      return settle(50);
    }).then(function () {
      check('9 an older stored list is ignored', rowUris(tab).join() === 'y1', rowUris(tab));
      check('9 picking it up sent nothing', latestReqs(tab.calls).length === 0);
      close(tab);
    });
  });
});

// 10. Home shows the newest 5 from the saved list (Hide played applies) and never loads Latest; See all opens it.
tests.push(function () {
  var items = [];
  for (var i = 0; i < 7; i++) items.push(lrow('h' + i, 's1', 'Show 1', i, { played: i === 1 || i === 3 }));
  var store = store0({ filter: 'home', latest: { at: Date.now() - MIN, items: items, failed: 0, newest: { s1: dayIso(0) }, asked: 1 } });
  return setup(store, { shows: [showObj(1)] }).then(function (tab) {
    function homeIds() { var h = q(tab, '#hLatest'); var ul = h && h.parentNode.nextElementSibling; return ul ? [].slice.call(ul.querySelectorAll('li[data-puri]')).map(function (li) { return li.getAttribute('data-puri').split(':').pop(); }) : []; }
    check('10 Home: newest 5', homeIds().join() === 'h0,h1,h2,h3,h4', homeIds());
    check('10 Home loads no Latest', latestReqs(tab.boot).length === 0);
    store.setItem('lib-hide-played', 'true');
    tab.t().renderList();
    check('10 Home with Hide played: 5 unplayed', homeIds().join() === 'h0,h2,h4,h5,h6', homeIds());
    click(tab, q(tab, '[data-see="hLatest"]'));
    return settle(100).then(function () {
      check('10 See all opens Podcasts → Latest', tab.t().state.filter === 'podcasts' && tab.t().state.podTab === 'latest' && !!q(tab, '.lbar'));
      check('10 fresh list: See all sends nothing', latestReqs(tab.calls).length === 0);
      close(tab);
    });
  });
});

// 11. No saved podcasts, or podcasts that failed to load.
tests.push(function () {
  return setup(store0(), { shows: [] }).then(function (tab) {
    check('11 no podcasts: says so, asks nothing', /You haven’t saved any podcasts yet\./.test(q(tab, '#main').textContent) && latestReqs(tab.boot).length === 0);
    close(tab);
    return setup(store0(), { showsStatus: 500 });
  }).then(function (tab) {
    check('11 podcasts failed: error with Refresh hint', /Couldn’t load your podcasts\. Tap Refresh to try again\./.test(q(tab, '#main').textContent), q(tab, '#main').textContent);
    close(tab);
  });
});

// 12. A podcast page: page 1 (50), saved on the phone without notes, Load more follows Spotify's next link.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  var t0 = Date.now();
  return setup(store, { shows: [], page: function (path, qs) {
    if (path === '/shows/p9/episodes' && qs.get('limit') === '50') return { status: 200, json: showEps('p9', +qs.get('offset'), 50, 120) };
  } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('p9'));
    return settle(150).then(function () {
      var r = reqs(tab.calls, 'GET', '/shows/p9/episodes');
      check('12 one request for page 1', r.length === 1 && r[0].q.get('limit') === '50' && r[0].q.get('offset') === '0', r.map(function (x) { return x.query; }));
      check('12 50 rows, newest first', dRows(tab).length === 50 && dIds(tab)[0] === 'p9-0' && dIds(tab)[49] === 'p9-49', dRows(tab).length);
      check('12 summary counts what is loaded', detailSum(tab) === '50 of 120 episodes loaded', detailSum(tab));
      var c = stored(store, 'lib-cache-show:p9');
      check('12 saved copy: 50 episodes, total, time', c && c.items.length === 50 && c.total === 120 && c.at >= t0, c && { n: c.items.length, total: c.total });
      check('12 saved copy keeps no notes or show object', JSON.stringify(c).indexOf('Notes for') === -1 && c.items[0].show === undefined && c.items[0].resume_point.fully_played === false);
      check('12 note: saved, checked, Check for new episodes', /Saved on this phone · checked just now/.test(detailNote(tab)) && !!noteBtn(tab, 'Check for new episodes'), detailNote(tab));
      var savedAt = c.at;
      click(tab, footBtn(tab, 'Load more'));
      return settle(150).then(function () {
        var r2 = reqs(tab.calls, 'GET', '/shows/p9/episodes');
        check('12 Load more asks offset 50', r2.length === 2 && r2[1].q.get('offset') === '50', r2.map(function (x) { return x.query; }));
        check('12 100 rows', dRows(tab).length === 100 && detailSum(tab) === '100 of 120 episodes loaded', detailSum(tab));
        var c2 = stored(store, 'lib-cache-show:p9');
        check('12 saved copy stays at the newest 50, same time', c2.items.length === 50 && c2.at === savedAt, { n: c2.items.length, same: c2.at === savedAt });
        click(tab, footBtn(tab, 'Load more'));
        return settle(150);
      }).then(function () {
        check('12 last page: all 120, length shown, no Load more', dRows(tab).length === 120 && /^120 episodes · \d+ hr/.test(detailSum(tab)) && !footBtn(tab, 'Load more'), detailSum(tab));
        t.closeDetail();
        tab.calls.length = 0;
        t.openDetail(showItem('p9'));
        return settle(150);
      }).then(function () {
        check('12 reopened this visit: from the phone, 0 requests', catalog(tab.calls).length === 0 && dRows(tab).length === 50, { calls: catalog(tab.calls).map(function (x) { return x.url; }), n: dRows(tab).length });
        check('12 reopened: Load more offered for the rest', !!footBtn(tab, 'Load more') && detailSum(tab) === '50 of 120 episodes loaded', detailSum(tab));
        close(tab);
        return setup(store, { shows: [] });
      }).then(function (tab2) {
        tab2.t().openDetail(showItem('p9'));
        return settle(150).then(function () {
          check('12 after a reload: 0 requests, saved list shown', catalog(tab2.calls).length === 0 && dRows(tab2).length === 50 && /Saved on this phone/.test(detailNote(tab2)), catalog(tab2.calls).length);
          close(tab2);
        });
      });
    });
  });
});

// 13. A saved copy over 12 hours old shows at once, then asks page 1 once; new episodes go on top.
//     Check for new episodes asks again even though the answer is kept for the visit.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  var old = Date.now() - 13 * HOUR;
  store.setItem('lib-cache-show:p5', JSON.stringify({ at: old, total: 3, items: [slEp('p5-old1', 5), slEp('p5-old2', 6), slEp('p5-old3', 7)] }));
  var answer = { items: [spEp('p5-new', 'p5', dayIso(0)), spEp('p5-old1', 'p5', dayIso(5)), spEp('p5-old2', 'p5', dayIso(6))], total: 4,
    next: 'https://api.spotify.com/v1/shows/p5/episodes?offset=3&limit=50' };
  return setup(store, { shows: [], page: function (path) {
    if (path === '/shows/p5/episodes') return { status: 200, json: answer, delay: 30 };
  } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('p5'));
    check('13 saved rows show at once', dIds(tab).join() === 'p5-old1,p5-old2,p5-old3', dIds(tab));
    check('13 note says Checking…', /Checking…/.test(detailNote(tab)), detailNote(tab));
    return settle(200).then(function () {
      var r = reqs(tab.calls, 'GET', '/shows/p5/episodes');
      check('13 exactly one request, page 1', r.length === 1 && r[0].q.get('offset') === '0' && r[0].q.get('limit') === '50', r.map(function (x) { return x.query; }));
      check('13 new episode on top, saved ones kept once', dIds(tab).join() === 'p5-new,p5-old1,p5-old2,p5-old3', dIds(tab));
      var c = stored(store, 'lib-cache-show:p5');
      check('13 saved copy updated and newer', c.items.length === 4 && c.items[0].id === 'p5-new' && c.at > old + 12 * HOUR, { n: c.items.length, at: c.at - old });
      click(tab, noteBtn(tab, 'Check for new episodes'));
      return settle(200);
    }).then(function () {
      check('13 Check for new episodes asks page 1 again', reqs(tab.calls, 'GET', '/shows/p5/episodes').length === 2, tab.calls.map(function (x) { return x.query; }));
      check('13 no duplicates after the check', dIds(tab).join() === 'p5-new,p5-old1,p5-old2,p5-old3', dIds(tab));
      close(tab);
    });
  });
});

// 14. Catalog paused: a saved copy still opens, says Spotify paused updates, and Load more sends nothing.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  store.setItem('lib-cache-show:p6', JSON.stringify({ at: Date.now() - 20 * HOUR, total: 5, items: [slEp('p6-a', 1), slEp('p6-b', 2), slEp('p6-c', 3)] }));
  store.setItem('lib-cooloff', cool('catalog'));
  return setup(store, { shows: [] }).then(function (tab) {
    tab.t().openDetail(showItem('p6'));
    return settle(100).then(function () {
      check('14 paused: saved rows shown, nothing sent', dRows(tab).length === 3 && catalog(tab.calls).length === 0, catalog(tab.calls).map(function (x) { return x.path; }));
      check('14 paused: note says saved and paused until', /^Saved .+ · Spotify paused updates until \d+:\d\d [AP]M$/.test(detailNote(tab)) && !noteBtn(tab, 'Check for new episodes'), detailNote(tab));
      tab.w.__toasts = [];
      click(tab, footBtn(tab, 'Load more'));
      return settle(100);
    }).then(function () {
      check('14 paused: Load more sends nothing, says why', catalog(tab.calls).length === 0 && /Spotify paused podcast and album details/.test(lastToast(tab)) && dRows(tab).length === 3, tab.toasts());
      close(tab);
    });
  });
});

// 15. A podcast only Latest knows opens from those episodes with 0 requests; Load more asks page 1 and merges.
tests.push(function () {
  var items = [lrow('s5a', 's5', 'Show 5', 1), lrow('zz', 's2', 'Show 2', 2), lrow('s5b', 's5', 'Show 5', 3, { pos: 10 * MIN })];
  var store = store0({ filter: 'albums', latest: { at: Date.now() - MIN, items: items, failed: 0, newest: { s5: dayIso(1) }, asked: 2 } });
  return setup(store, { shows: [], page: function (path, qs) {
    if (path === '/shows/s5/episodes' && qs.get('limit') === '50') return { status: 200, json: { items: [spEp('s5new', 's5', dayIso(0)), spEp('s5a', 's5', dayIso(1)), spEp('s5b', 's5', dayIso(3)), spEp('s5old', 's5', dayIso(30))], total: 4, next: null } };
  } }).then(function (tab) {
    tab.t().openDetail(showItem('s5', 'Show 5'));
    return settle(100).then(function () {
      check('15 from Latest: 0 requests, its episodes only', catalog(tab.calls).length === 0 && dIds(tab).join() === 's5a,s5b', dIds(tab));
      check('15 progress from Latest kept', dRows(tab)[1].querySelector('.sub').textContent.indexOf('50 min left') !== -1, dRows(tab)[1].querySelector('.sub').textContent);
      check('15 note says Newest episodes from Latest', /^Newest episodes from Latest/.test(detailNote(tab)), detailNote(tab));
      var c = stored(store, 'lib-cache-show:s5');
      check('15 kept as a seed copy', c && c.seed === true && c.items.length === 2, c);
      click(tab, footBtn(tab, 'Load more'));
      return settle(150);
    }).then(function () {
      var r = reqs(tab.calls, 'GET', '/shows/s5/episodes');
      check('15 Load more asks page 1', r.length === 1 && r[0].q.get('offset') === '0' && r[0].q.get('limit') === '50', r.map(function (x) { return x.query; }));
      check('15 merged without duplicates', dIds(tab).join() === 's5new,s5a,s5b,s5old' && !footBtn(tab, 'Load more'), dIds(tab));
      var c = stored(store, 'lib-cache-show:s5');
      check('15 now a full saved copy', c.items.length === 4 && !c.seed && /^Saved on this phone/.test(detailNote(tab)), { seed: c.seed, note: detailNote(tab) });
      close(tab);
    });
  });
});

// 16. Catalog paused and nothing saved: your saved episodes of the show plus the page's history, newest first, not saved.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  store.setItem('lib-cooloff', cool('catalog'));
  store.setItem('lib-ep-history', JSON.stringify([
    { uri: 'spotify:episode:h7', id: 'h7', name: 'Heard one', show: { id: 'p7', name: 'Pod p7', images: [] }, duration_ms: HOUR, positionMs: 5 * MIN, played: false, at: Date.now() - 2 * 86400000 },
    { uri: 'spotify:episode:hx', id: 'hx', name: 'Other show', show: { id: 'zz', name: 'Other', images: [] }, duration_ms: HOUR, positionMs: 0, played: false, at: Date.now() - HOUR }
  ]));
  var saved = [spEp('sv-old', 'p7', dayIso(30), { showName: 'Pod p7' }), spEp('sv-other', 'qq', dayIso(1)), spEp('sv-new', 'p7', dayIso(5), { showName: 'Pod p7' })];
  return setup(store, { shows: [], saved: saved }).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('p7'));
    return settle(150).then(function () {
      var se = reqs(tab.calls, 'GET', '/me/episodes');
      check('16 one library request for your saved episodes', se.length === 1 && se[0].q.get('limit') === '50' && se[0].q.get('offset') === '0', se.map(function (x) { return x.query; }));
      check('16 no catalog request', catalog(tab.calls).length === 0, catalog(tab.calls).map(function (x) { return x.path; }));
      check('16 this show only, newest first (heard day for history)', dIds(tab).join() === 'h7,sv-new,sv-old', dIds(tab));
      check('16 note explains the pause', /^Your saved and played episodes from this show \(Spotify paused the full list until \d+:\d\d [AP]M\)$/.test(detailNote(tab)), detailNote(tab));
      check('16 not saved as the show\'s list', store.getItem('lib-cache-show:p7') === null);
      t.closeDetail();
      tab.calls.length = 0;
      t.openDetail(showItem('p7'));
      return settle(150);
    }).then(function () {
      check('16 opened again within 10 minutes: no request', tab.calls.filter(function (c) { return c.path === '/me/episodes'; }).length === 0 && dRows(tab).length === 3, tab.calls.map(function (c) { return c.path; }));
      t.closeDetail();
      t.openDetail(showItem('p8'));
      return settle(100);
    }).then(function () {
      check('16 nothing known: says so', /You haven’t saved or played an episode of this show on this phone yet\./.test(q(tab, '#dfoot').textContent), q(tab, '#dfoot').textContent);
      close(tab);
      var st = store0({ filter: 'albums' });
      st.setItem('lib-cooloff', JSON.stringify(Object.assign(JSON.parse(cool('catalog')), JSON.parse(cool('library')))));
      return setup(st, { shows: [], saved: saved });
    }).then(function (tab2) {
      tab2.t().openDetail(showItem('p7'));
      return settle(100).then(function () {
        check('16 library paused too: nothing sent at all', tab2.calls.filter(function (c) { return c.path === '/me/episodes' || /^\/shows\//.test(c.path); }).length === 0, tab2.calls.map(function (c) { return c.path; }));
        close(tab2);
      });
    });
  });
});

// 17. Podcast page details: history newer than the saved copy wins; an error offers Try again; the saved-show cap
//     (60 copies already saved: saving one more drops the oldest).
tests.push(function () {
  var store = store0({ filter: 'albums' });
  var checked = Date.now() - HOUR;
  store.setItem('lib-cache-show:p4', JSON.stringify({ at: checked, total: 2, items: [slEp('p4-a', 1), slEp('p4-b', 2)] }));
  store.setItem('lib-ep-history', JSON.stringify([
    { uri: 'spotify:episode:p4-a', id: 'p4-a', name: 'A', show: { id: 'p4', name: 'Pod p4', images: [] }, duration_ms: HOUR, positionMs: 30 * MIN, played: false, at: Date.now() - MIN },
    { uri: 'spotify:episode:p4-b', id: 'p4-b', name: 'B', show: { id: 'p4', name: 'Pod p4', images: [] }, duration_ms: HOUR, positionMs: 30 * MIN, played: false, at: checked - HOUR }
  ]));
  for (var i = 0; i < 59; i++) store.setItem('lib-cache-show:cap' + i, JSON.stringify({ at: Date.now() - (100 - i) * HOUR, total: 1, items: [slEp('cap' + i + '-0', 1)] }));
  var fail = true;
  return setup(store, { shows: [], page: function (path) {
    if (path === '/shows/pe/episodes') return fail ? { status: 500, json: { error: { status: 500, message: 'Server error' } } } : { status: 200, json: showEps('pe', 0, 2, 2) };
  } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(showItem('p4'));
    return settle(100).then(function () {
      var subs = dRows(tab).map(function (li) { return li.querySelector('.sub').textContent; });
      check('17 history heard after the copy shows its progress', /30 min left$/.test(subs[0]) && !/min left/.test(subs[1]), subs);
      check('17 fresh copy: 0 requests', catalog(tab.calls).length === 0);
      t.closeDetail();
      t.openDetail(showItem('pe'));
      return settle(100);
    }).then(function () {
      check('17 error says what failed, offers Try again', /Couldn’t load episodes \(/.test(q(tab, '#dfoot').textContent) && !!footBtn(tab, 'Try again'), q(tab, '#dfoot').textContent);
      check('17 nothing saved after an error', store.getItem('lib-cache-show:pe') === null);
      fail = false;
      click(tab, footBtn(tab, 'Try again'));
      return settle(150);
    }).then(function () {
      check('17 Try again asks again and shows the list', reqs(tab.calls, 'GET', '/shows/pe/episodes').length === 2 && dRows(tab).length === 2, dRows(tab).length);
      var keys = Object.keys(store._m()).filter(function (k) { return k.indexOf('lib-cache-show:') === 0; });
      check('17 at most 60 saved podcasts: the oldest goes', keys.length === 60 && store.getItem('lib-cache-show:cap0') === null && store.getItem('lib-cache-show:cap1') !== null && store.getItem('lib-cache-show:pe') !== null, keys.length);
      close(tab);
    });
  });
});

// 18. Saved episodes: the row on Podcasts → Shows, its list (show names), not saved as a podcast copy.
tests.push(function () {
  var store = store0();
  store.setItem('lib-sort-shows', JSON.stringify('az'));
  var saved = [spEp('se1', 'sx', dayIso(1), { showName: 'Ex Show' }), spEp('se2', 'sy', dayIso(9), { showName: 'Why Show' })];
  return setup(store, { shows: [showObj(1)], saved: saved, latest: function () { return { status: 200, json: { items: [], next: null, total: 0 } }; } }).then(function (tab) {
    var t = tab.t();
    check('18 savedEpisodesItem wording', t.savedEpisodesItem({ episodesTotal: 1 }).sub === 'Podcast · 1 episode' && t.savedEpisodesItem({ episodesTotal: 3 }).sub === 'Podcast · 3 episodes');
    click(tab, segBtn(tab, 'shows'));
    var first = q(tab, '#main ul.list li a.item');
    check('18 Saved episodes first on Shows, with its count', first && first.querySelector('.name').textContent === 'Saved episodes' && first.querySelector('.sub').textContent === 'Podcast · 2 episodes', first && first.textContent);
    tab.calls.length = 0;
    click(tab, first);
    return settle(150).then(function () {
      var r = reqs(tab.calls, 'GET', '/me/episodes');
      check('18 opens with one request (50 from offset 0)', r.length === 1 && r[0].q.get('limit') === '50' && r[0].q.get('offset') === '0', r.map(function (x) { return x.query; }));
      var subs = dRows(tab).map(function (li) { return li.querySelector('.sub').textContent; });
      check('18 rows name their show', dRows(tab).length === 2 && /^Episode · Ex Show/.test(subs[0]) && /^Episode · Why Show/.test(subs[1]), subs);
      check('18 not saved as a podcast copy', Object.keys(store._m()).filter(function (k) { return k.indexOf('lib-cache-show:') === 0; }).length === 0);
      close(tab);
    });
  });
});

// 19. Podcast history: what the player check records, when it writes storage, Played, aging and the cap.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  var hist = [];
  for (var i = 0; i < 62; i++) hist.push({ uri: 'spotify:episode:old' + i, id: 'old' + i, name: 'Old ' + i, show: { id: 'so', name: 'Old Show', images: [] }, duration_ms: HOUR, positionMs: 0, played: false, at: Date.now() - (i + 1) * HOUR });
  hist.splice(3, 0, { uri: 'spotify:episode:ancient', id: 'ancient', name: 'Ancient', show: { id: 'so', name: 'Old Show', images: [] }, duration_ms: HOUR, positionMs: 0, played: false, at: Date.now() - 61 * 86400000 });
  hist.unshift({ uri: 'spotify:episode:future', id: 'future', name: 'Future', show: { id: 'so', name: 'Old Show', images: [] }, duration_ms: HOUR, positionMs: 0, played: false, at: Date.now() + 3 * HOUR });
  store.setItem('lib-ep-history', JSON.stringify(hist));
  return setup(store, { shows: [] }).then(function (tab) {
    var t = tab.t();
    var h = t.epHistory();
    check('19 load drops future and >60-day entries, keeps 60', h.length === 60 && !h.some(function (x) { return x.id === 'future' || x.id === 'ancient'; }) && h[0].id === 'old0', { n: h.length, first: h[0] && h[0].id });
    function ep(id, show) { return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Ep ' + id, duration_ms: HOUR, images: [{ url: 'big', width: 640 }, { url: 'small', width: 64 }], show: { id: show, name: 'Show ' + show, images: [{ url: 'sbig', width: 640 }, { url: 'ssmall', width: 300 }] } }; }
    function pl(it, pos, playing) { return { item: it, currently_playing_type: 'episode', context: { type: 'show', uri: 'spotify:show:' + it.show.id }, is_playing: playing !== false, progress_ms: pos, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() }; }
    t.setPlayer(pl(ep('n1', 'sh1'), 60000));
    var s = stored(store, 'lib-ep-history');
    var e = s[0];
    check('19 heard episode goes on top, written at once', e.uri === 'spotify:episode:n1' && e.positionMs === 60000 && e.played === false && e.duration_ms === HOUR && Math.abs(e.at - Date.now()) < 5000, e);
    check('19 keeps the show with one small cover', e.show.id === 'sh1' && e.show.name === 'Show sh1' && e.show.images.length === 1 && e.show.images[0].url === 'ssmall', e.show);
    check('19 cap holds at 60', s.length === 60, s.length);
    t.setPlayer(pl(ep('n1', 'sh1'), HOUR - 30000));
    var mem = t.epHistory()[0];
    check('19 last minute counts as Played (memory now)', mem.played === true && mem.positionMs === HOUR - 30000, mem);
    check('19 storage for the same episode waits (15 s)', stored(store, 'lib-ep-history')[0].positionMs === 60000, stored(store, 'lib-ep-history')[0].positionMs);
    t.setPlayer(pl(ep('n2', 'sh1'), 1000));
    s = stored(store, 'lib-ep-history');
    check('19 a new episode moves to the top and writes both', s[0].id === 'n2' && s[1].id === 'n1' && s[1].played === true, s.slice(0, 2).map(function (x) { return x.id + ':' + x.played; }));
    var jb = t.jumpEpisodes();
    check('19 Jump back in: one card per show, newest first, opens the show', jb[0].id === 'n2' && jb.filter(function (x) { return x.showName === 'Show sh1'; }).length === 1 && jb[0].show && jb[0].show.kind === 'show' && jb[0].show.id === 'sh1', jb.slice(0, 2).map(function (x) { return x.id; }));
    check('19 epPlayed: last minute of a long episode', t.epPlayed(HOUR - 60000, HOUR) === true && t.epPlayed(HOUR - 60001, HOUR) === false);
    check('19 epPlayed: 90% of a short clip; no length is never played', t.epPlayed(270000, 300000) === true && t.epPlayed(269999, 300000) === false && t.epPlayed(5000, 0) === false);
    close(tab);
  });
});

// 20. resumeOf (Spotify's resume point) and resumeItem (play again after Spotify fell asleep).
tests.push(function () {
  return setup(store0({ filter: 'albums' }), { shows: [] }).then(function (tab) {
    var t = tab.t();
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    check('20 resumeOf: finished', same(t.resumeOf({ resume_point: { fully_played: true, resume_position_ms: 5000 } }), { played: true, pos: 0 }));
    check('20 resumeOf: started', same(t.resumeOf({ resume_point: { fully_played: false, resume_position_ms: 5000 } }), { played: false, pos: 5000 }));
    check('20 resumeOf: none', same(t.resumeOf({}), { played: false, pos: 0 }) && same(t.resumeOf({ resume_point: { resume_position_ms: -3 } }), { played: false, pos: 0 }));
    check('20 resumeItem: nothing playing', t.resumeItem() === null);
    var trk = { type: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song', duration_ms: 200000, album: { id: 'a1', name: 'A', images: [] }, artists: [{ id: 'x', name: 'X' }] };
    t.setPlayer({ item: trk, context: { type: 'album', uri: 'spotify:album:a1' }, is_playing: false, progress_ms: 61234.6, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() });
    var r = t.resumeItem();
    check('20 resumeItem: song in an album continues inside it', r && r.kind === 'resume' && r.uri === 'spotify:track:t1' && r.ctx === 'spotify:album:a1' && r.positionMs === 61235, r);
    t.setPlayer({ item: trk, context: { type: 'artist', uri: 'spotify:artist:x' }, is_playing: false, progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() });
    check('20 resumeItem: artist context plays the song alone', t.resumeItem().ctx === null);
    t.setPlayer({ item: trk, context: { type: 'playlist', uri: 'spotify:playlist:p1' }, is_playing: false, progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() });
    check('20 resumeItem: playlist context kept', t.resumeItem().ctx === 'spotify:playlist:p1');
    close(tab);
  });
});

// 21. Album pages: page 1, saved on the phone, Load more completes the copy, 0 requests later, Reload from Spotify.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  return setup(store, { shows: [], page: function (path, qs) {
    if (path === '/albums/a7/tracks') return { status: 200, json: albumTracks('a7', +qs.get('offset'), 50, 60) };
  } }).then(function (tab) {
    var t = tab.t();
    check('21 albumPage and showPage build page URLs', t.albumPage('a 7', 50) === '/albums/a%207/tracks?limit=50&offset=50' && t.showPage('s1', 0) === '/shows/s1/episodes?limit=50&offset=0');
    t.openDetail(albumItem('a7'));
    return settle(150).then(function () {
      var r = reqs(tab.calls, 'GET', '/albums/a7/tracks');
      check('21 one request: 50 from offset 0', r.length === 1 && r[0].q.get('limit') === '50' && r[0].q.get('offset') === '0', r.map(function (x) { return x.query; }));
      check('21 50 of 60 songs', dRows(tab).length === 50 && detailSum(tab) === '50 of 60 songs loaded', detailSum(tab));
      var c = stored(store, 'lib-cache-album:a7');
      check('21 saved: minimal songs and the total', c && c.items.length === 50 && c.total === 60 && c.items[0].preview_url === undefined && c.items[0].track_number === 1, c && { n: c.items.length, total: c.total });
      check('21 note: Saved on this phone · Reload from Spotify', /Saved on this phone/.test(detailNote(tab)) && !!noteBtn(tab, 'Reload from Spotify'), detailNote(tab));
      click(tab, footBtn(tab, 'Load more'));
      return settle(150);
    }).then(function () {
      var r = reqs(tab.calls, 'GET', '/albums/a7/tracks');
      check('21 Load more asks offset 50', r.length === 2 && r[1].q.get('offset') === '50', r.map(function (x) { return x.query; }));
      check('21 whole album shown and saved', dRows(tab).length === 60 && /^60 songs · /.test(detailSum(tab)) && stored(store, 'lib-cache-album:a7').items.length === 60, detailSum(tab));
      close(tab);
      return setup(store, { shows: [], page: function (path, qs) {
        if (path === '/albums/a7/tracks') return { status: 200, json: albumTracks('a7', +qs.get('offset'), 50, 60) };
      } });
    }).then(function (tab2) {
      var t2 = tab2.t();
      t2.openDetail(albumItem('a7'));
      return settle(150).then(function () {
        check('21 saved album after a reload: 0 requests, all 60, no Load more', catalog(tab2.calls).length === 0 && dRows(tab2).length === 60 && !footBtn(tab2, 'Load more'), catalog(tab2.calls).length);
        click(tab2, noteBtn(tab2, 'Reload from Spotify'));
        return settle(150);
      }).then(function () {
        var r = reqs(tab2.calls, 'GET', '/albums/a7/tracks');
        check('21 Reload from Spotify: one request from offset 0', r.length === 1 && r[0].q.get('offset') === '0', r.map(function (x) { return x.query; }));
        check('21 reload starts the list over', dRows(tab2).length === 50 && !!footBtn(tab2, 'Load more'), dRows(tab2).length);
        store.setItem('lib-cooloff', cool('catalog'));
        tab2.w.__toasts = [];
        click(tab2, noteBtn(tab2, 'Reload from Spotify'));
        return settle(100);
      }).then(function () {
        check('21 Reload while paused: nothing sent, says why', reqs(tab2.calls, 'GET', '/albums/a7/tracks').length === 1 && /Spotify paused podcast and album details/.test(lastToast(tab2)), tab2.toasts());
        close(tab2);
      });
    });
  });
});

// 22. Artist pages: releases 10 at a time, grouped and newest first, Load more with duplicates dropped; a release
//     opens on top and Back returns with nothing asked; the same artist again this visit sends nothing.
tests.push(function () {
  var page1 = [
    release('r1', { type: 'album', date: '2019-05-01' }), release('r2', { type: 'single', date: '2023-01-01', n: 1 }), release('r3', { type: 'album', date: '2022-03-04' }),
    release('r4', { type: 'compilation', date: '2018' }), release('r5', { type: 'SINGLE', date: '2021-07-07' }), release('r6', { group: 'single', date: '2024-02-02' }),
    release('r7', { type: 'appears_on', date: '2015-01-01' }), release('r8', { group: 'compilation', date: '2020-01-01' }), release('r9', { type: 'album', date: '2024-09-09', n: 0 }),
    release('r10', { type: 'album', date: '2010-10-10' })
  ];
  var page2 = [release('r11', { type: 'album', date: '2025-01-01' }), release('r3', { type: 'album', date: '2022-03-04' }), release('r12', { type: 'single', date: '2012-01-01' }), release('r13', { type: 'compilation', date: '2026-01-01' })];
  var store = store0({ filter: 'albums' });
  return setup(store, { shows: [], page: function (path, qs) {
    if (path === '/artists/ar1/albums') return { status: 200, json: qs.get('offset') === '0' ? { items: page1, total: 13, next: 'x?offset=10' } : { items: page2, total: 13, next: null } };
    if (path === '/albums/r1/tracks') return { status: 200, json: albumTracks('r1', 0, 50, 2) };
  } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(artistItem('ar1', 'https://i.scdn.co/image/ar1'));
    return settle(150).then(function () {
      var r = reqs(tab.calls, 'GET', '/artists/ar1/albums');
      check('22 one request: all groups, 10 from offset 0', r.length === 1 && r[0].q.get('include_groups') === 'album,single,compilation' && r[0].q.get('limit') === '10' && r[0].q.get('offset') === '0', r.map(function (x) { return x.query; }));
      check('22 picture known: no artist lookup', reqs(tab.calls, 'GET', '/artists/ar1').length === 0);
      var heads = qa(tab, '#alist h2').map(function (h) { return h.textContent; });
      check('22 three groups in order', JSON.stringify(heads) === JSON.stringify(['Albums', 'Singles & EPs', 'Compilations']), heads);
      function group(i) { var ul = qa(tab, '#alist ul.list')[i]; return ul ? [].slice.call(ul.querySelectorAll('a.item')).map(function (a) { return a.getAttribute('href').split('/').pop(); }) : []; }
      check('22 Albums newest first (unknown types count as albums)', group(0).join() === 'r9,r3,r1,r7,r10', group(0));
      check('22 Singles: album_type any case, or album_group', group(1).join() === 'r6,r2,r5', group(1));
      check('22 Compilations newest first', group(2).join() === 'r8,r4', group(2));
      var subs = qa(tab, '#alist a.item .sub').map(function (s) { return s.textContent; });
      check('22 release lines: year · songs', subs.indexOf('2023 · 1 song') !== -1 && subs.indexOf('2019 · 9 songs') !== -1 && subs.indexOf('2024') !== -1, subs);
      check('22 summary: 10 of 13 releases loaded', detailSum(tab) === '10 of 13 releases loaded', detailSum(tab));
      click(tab, footBtn(tab, 'Load more', '#afoot'));
      return settle(150);
    }).then(function () {
      var r = reqs(tab.calls, 'GET', '/artists/ar1/albums');
      check('22 Load more asks offset 10', r.length === 2 && r[1].q.get('offset') === '10', r.map(function (x) { return x.query; }));
      check('22 duplicate dropped: 13 releases', qa(tab, '#alist a.item').length === 13 && detailSum(tab) === '13 releases' && !footBtn(tab, 'Load more', '#afoot'), detailSum(tab));
      var albums = [].slice.call(qa(tab, '#alist ul.list')[0].querySelectorAll('a.item')).map(function (a) { return a.getAttribute('href').split('/').pop(); });
      check('22 new releases sorted into their group', albums[0] === 'r11' && qa(tab, '#alist ul.list')[2].querySelector('a.item').getAttribute('href').split('/').pop() === 'r13', albums);
      tab.calls.length = 0;
      click(tab, q(tab, '#alist a.item[href$="/r1"]'));
      return settle(150);
    }).then(function () {
      check('22 release opens on top of the artist', t.state.detail.item.id === 'r1' && t.state.detailStack.length === 1 && t.state.detailStack[0].kind === 'artist', t.state.detailStack.length);
      check('22 release asks its songs once', reqs(tab.calls, 'GET', '/albums/r1/tracks').length === 1);
      tab.calls.length = 0;
      t.goBack();
      return settle(150);
    }).then(function () {
      check('22 Back returns to the artist, all 13, nothing asked', t.state.detail && t.state.detail.kind === 'artist' && qa(tab, '#alist a.item').length === 13 && catalog(tab.calls).length === 0, catalog(tab.calls).map(function (x) { return x.path; }));
      t.closeDetail();
      t.openDetail(artistItem('ar1', 'https://i.scdn.co/image/ar1'));
      return settle(150);
    }).then(function () {
      click(tab, footBtn(tab, 'Load more', '#afoot'));
      return settle(150);
    }).then(function () {
      check('22 same artist again this visit: both pages from memory', catalog(tab.calls).length === 0 && qa(tab, '#alist a.item').length === 13, catalog(tab.calls).map(function (x) { return x.query; }));
      close(tab);
    });
  });
});

// 23. Artist page errors: Try again, no releases, a 429; mapArtist and releaseGroup.
tests.push(function () {
  var mode = 'fail';
  var store = store0({ filter: 'albums' });
  return setup(store, { shows: [], page: function (path) {
    if (path === '/artists/ar2/albums') {
      if (mode === 'fail') return { status: 500, json: { error: { status: 500, message: 'Server error' } } };
      return { status: 200, json: { items: [release('q1', { type: 'album', date: '2020-01-01' })], total: 1, next: null } };
    }
    if (path === '/artists/ar3/albums') return { status: 200, json: { items: [], total: 0, next: null } };
    if (path === '/artists/ar4/albums') return { status: 429, headers: { 'retry-after': '60' }, json: { error: { status: 429, message: 'API rate limit exceeded' } } };
  } }).then(function (tab) {
    var t = tab.t();
    t.openDetail(artistItem('ar2', 'x.jpg'));
    return settle(150).then(function () {
      check('23 error says what failed, offers Try again', /Couldn’t load releases \(/.test(q(tab, '#afoot').textContent) && !!footBtn(tab, 'Try again', '#afoot'), q(tab, '#afoot').textContent);
      mode = 'ok';
      click(tab, footBtn(tab, 'Try again', '#afoot'));
      return settle(150);
    }).then(function () {
      check('23 Try again asks again and lists it', reqs(tab.calls, 'GET', '/artists/ar2/albums').length === 2 && qa(tab, '#alist a.item').length === 1 && detailSum(tab) === '1 release', detailSum(tab));
      t.closeDetail();
      t.openDetail(artistItem('ar3', 'x.jpg'));
      return settle(150);
    }).then(function () {
      check('23 no releases: says so, no summary', /No releases here\./.test(q(tab, '#afoot').textContent) && detailSum(tab) === '', q(tab, '#afoot').textContent);
      t.closeDetail();
      tab.w.__toasts = [];
      t.openDetail(artistItem('ar4', 'x.jpg'));
      return settle(150);
    }).then(function () {
      check('23 429: pause text inline and as a toast', /Spotify paused podcast and album details/.test(q(tab, '#afoot').textContent) && /Spotify paused podcast and album details/.test(lastToast(tab)), { foot: q(tab, '#afoot').textContent, toasts: tab.toasts() });
      var n = reqs(tab.calls, 'GET', '/artists/ar4/albums').length;
      click(tab, footBtn(tab, 'Try again', '#afoot'));
      return settle(100).then(function () {
        check('23 Try again while paused sends nothing', reqs(tab.calls, 'GET', '/artists/ar4/albums').length === n, n);
        var a = t.mapArtist({ id: 'z1', name: 'Zed', uri: 'spotify:artist:z1', genres: ['indie pop', 'rock'], images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }, { url: 'tiny', width: 64 }] });
        check('23 mapArtist: first genre and a small picture', a.kind === 'artist' && a.sub === 'Artist · indie pop' && a.img === 'mid' && a.url === 'https://open.spotify.com/artist/z1', a);
        check('23 mapArtist: no genres, no id', t.mapArtist({ id: 'z2', name: 'Z', uri: 'u', images: [] }).sub === 'Artist' && t.mapArtist({ name: 'No id' }) === null && t.mapArtist(null) === null);
        check('23 releaseGroup', t.releaseGroup({ album_type: 'Compilation' }) === 'compilation' && t.releaseGroup({ album_group: 'single' }) === 'single' && t.releaseGroup({}) === 'album' && t.releaseGroup({ album_type: 'appears_on' }) === 'album');
        close(tab);
      });
    });
  });
});

// 24. latestShows and showFresh directly.
tests.push(function () {
  return setup(store0({ filter: 'albums' }), { shows: [] }).then(function (tab) {
    var t = tab.t();
    var all = SHOWS.slice();
    t.state.latest.cache = null;
    check('24 no cache: first 12 in saved order', t.latestShows(all).map(function (s) { return s.id; }).join() === SHOWS.slice(0, 12).map(function (s) { return s.id; }).join());
    t.state.latest.cache = { at: Date.now(), items: [], newest: { s14: '2026-01-02', s7: '2026-01-02', s2: '2025-12-01' } };
    var ids = t.latestShows(all).map(function (s) { return s.id; });
    check('24 newest first, ties in saved order, then the rest', ids.length === 12 && ids.slice(0, 4).join() === 's7,s14,s2,s1' && ids.indexOf('s12') === -1, ids);
    check('24 showFresh: 12 hours', t.showFresh(Date.now() - 11 * HOUR) === true && t.showFresh(Date.now() - 13 * HOUR) === false && t.showFresh(Date.now() + 2 * HOUR) === false);
    check('24 latestFresh rejects broken caches', t.latestFresh(null) === false && t.latestFresh({ at: 'x' }) === false && t.latestFresh({ at: Date.now() - 11 * HOUR }) === true);
    close(tab);
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
