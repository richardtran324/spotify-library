'use strict';
// Recents sort and By you (v2.50) tests: jsdom, mocked fetch, shared localStorage.
// Recents (Playlists, Albums, Podcasts → Shows) puts what was played most recently first, from what the page already
// holds (lib-ctx-last, Home's Recently played contexts, lib-ep-history), then the rest in the default order.
// By you (Playlists) shows only playlists you own. Both send no requests.
// Run: node tests/run.js recents-sort  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
function isoDaysAgo(n) { return new Date(Date.now() - n * DAY).toISOString().slice(0, 10); }

// ---------- fixtures ----------
function rawPl(id, owner, name, n) {
  return { id: id, uri: 'spotify:playlist:' + id, name: name, images: [], owner: { id: owner, display_name: owner }, collaborative: false, items: { total: n } };
}
function rawAlbum(id, name, artist, date) {
  return { id: id, uri: 'spotify:album:' + id, name: name, images: [], artists: [{ id: 'X' + id, name: artist }], release_date: date, total_tracks: 10 };
}
function rawShow(id, name) { return { id: id, uri: 'spotify:show:' + id, name: name, images: [], total_episodes: 20 }; }
function lib() {
  return {
    // Library order (Default): Morning Run, Their Mix, the Alpha List, Zed 2, Zed 10, Guest List.
    playlists: [rawPl('P1', 'me1', 'Morning Run', 10), rawPl('P2', 'other', 'Their Mix', 50), rawPl('P3', 'me1', 'the Alpha List', 5),
      rawPl('P4', 'me1', 'Zed 2', 20), rawPl('P5', 'me1', 'Zed 10', 7), rawPl('P6', 'friend', 'Guest List', 3)],
    // Saved order (Recently saved): Blue, apple, Céline.
    albums: [rawAlbum('A1', 'Blue', 'Zeta', '2019-05-01'), rawAlbum('A2', 'apple', 'Alpha', '2021-01-01'), rawAlbum('A3', 'Céline', 'Mid', '2020')],
    // Saved order: Money Show, Tech Talk, History Hour.
    shows: [rawShow('S1', 'Money Show'), rawShow('S2', 'Tech Talk'), rawShow('S3', 'History Hour')],
    likedTotal: 12, episodesTotal: 3
  };
}
function ctxEntry(at) { return { uri: 'spotify:track:t' + at, id: 't' + at, name: 'Song', positionMs: 1000, durMs: 200000, at: at }; }
function histEntry(id, showId, at) {
  return { uri: 'spotify:episode:' + id, id: id, name: 'Ep ' + id, show: { id: showId, name: 'Show ' + showId, images: [] }, duration_ms: 1800000, positionMs: 60000, played: false, at: at };
}
function routes(env) {
  return function (method, path, q, body, call) {
    if (env.over) { var o = env.over(method, path, q, call); if (o) return o; }
    var L = env.lib;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'Rich' } };
    if (path === '/me/playlists') return { status: 200, json: { items: L.playlists, next: null, total: L.playlists.length } };
    if (path === '/me/albums') return { status: 200, json: { items: L.albums.map(function (a) { return { added_at: '2026-01-01T00:00:00Z', album: a }; }), next: null } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: [], next: null } } };
    if (path === '/me/shows') return { status: 200, json: { items: L.shows.map(function (s) { return { show: s }; }), next: null } };
    if (path === '/me/tracks') return { status: 200, json: { items: [], next: null, total: L.likedTotal } };
    if (path === '/me/episodes') return { status: 200, json: { items: [], next: null, total: L.episodesTotal } };
    if (path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  };
}
// extra: {key: value} stored as JSON before the page starts.
function seed(extra, filter) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(filter || 'playlists'));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, typeof extra[k] === 'string' && extra[k].charAt(0) === '!' ? extra[k].slice(1) : JSON.stringify(extra[k])); });
  return s;
}
function setup(store, opts) {
  opts = opts || {};
  var env = { lib: opts.lib || lib(), over: opts.over || null };
  var tab = H.makeTab(store, routes(env));
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (opts.podShows) { t.state.podTab = 'shows'; }
    if (opts.recentJump) t.state.recent.jump = opts.recentJump;
    t.renderList();
    return H.wait(50);
  }).then(function () {
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
function mainList(tab) { var uls = qa(tab, '#main > ul.list'); return uls[uls.length - 1]; }
function mainNames(tab) { var ul = mainList(tab); return ul ? [].slice.call(ul.querySelectorAll('li a.item .name')).map(function (n) { return n.textContent; }) : []; }
function pinNames(tab) { var uls = qa(tab, '#main > ul.list'); return uls.length > 1 ? [].slice.call(uls[0].querySelectorAll('li a.item .name')).map(function (n) { return n.textContent; }) : []; }
function chip(tab, view, label) { return qa(tab, '.sortbar[data-view="' + view + '"] button.chip').filter(function (b) { return b.textContent === label; })[0]; }
function labels(tab, view) { return qa(tab, '.sortbar[data-view="' + view + '"] button.chip').map(function (b) { return b.textContent; }); }
function byYou(tab) { return q(tab, '.sortbar[data-view="playlists"] button[data-own]'); }
function stored(store, k) { var v = store.getItem(k); return v == null ? null : JSON.parse(v); }
function emptyText(tab) { var p = q(tab, '#main p.empty'); return p ? p.textContent : null; }
function homeCards(tab) { return qa(tab, 'ul.cl[aria-labelledby="hPlaylists"] .clname').map(function (n) { return n.textContent; }); }
function typeFind(tab, text) { var box = q(tab, '#search'); box.value = text; box.dispatchEvent(new tab.w.Event('input', { bubbles: true })); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function finish(tab) { try { tab.t().stopApp(); } catch (e) {} try { tab.w.close(); } catch (e) {} }

var DEFAULT_PL = ['Liked Songs', 'Morning Run', 'Their Mix', 'the Alpha List', 'Zed 2', 'Zed 10', 'Guest List'];
var tests = [];

// 1. The chips: Recents on Playlists, Albums and Shows, By you on Playlists; default order and choice unchanged.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    check('1 playlist chips: Recents after Default, By you last', eq(labels(tab, 'playlists'), ['Default', 'Recents', 'A–Z', 'Most songs', 'By you']), labels(tab, 'playlists'));
    check('1 Default still pressed, By you off', chip(tab, 'playlists', 'Default').getAttribute('aria-pressed') === 'true' && byYou(tab).getAttribute('aria-pressed') === 'false');
    check('1 default order unchanged', eq(mainNames(tab), DEFAULT_PL), mainNames(tab));
    check('1 By you has a plain label and a separator before it', byYou(tab).getAttribute('aria-label') === 'By you: only playlists you own' && !!q(tab, '.sortbar[data-view="playlists"] .sortsep[aria-hidden="true"]'));
    check('1 nothing stored before a tap', store.getItem('lib-pl-byyou') === null && store.getItem('lib-sort-playlists') === null);
    tab.t().setFilter('albums');
    check('1 album chips: Recents second, Recently saved pressed', eq(labels(tab, 'albums'), ['Recently saved', 'Recents', 'A–Z', 'Artist A–Z', 'Release date']) && chip(tab, 'albums', 'Recently saved').getAttribute('aria-pressed') === 'true', labels(tab, 'albums'));
    check('1 no By you on Albums', !q(tab, 'button[data-own]'));
    tab.t().state.podTab = 'shows'; tab.t().setFilter('podcasts');
    check('1 show chips: Recents second', eq(labels(tab, 'shows'), ['Recently updated', 'Recents', 'A–Z', 'Recently saved']), labels(tab, 'shows'));
    tab.t().setFilter('artists');
    check('1 no Recents on Artists', labels(tab, 'artists').indexOf('Recents') === -1 || labels(tab, 'artists').length === 0, labels(tab, 'artists'));
    check('1 switching tabs: zero requests to the library', tab.calls.filter(function (c) { return /^\/(me\/playlists|me\/albums|me\/shows|playlists|albums|shows)/.test(c.path); }).length === 0, tab.calls);
    finish(tab);
  });
});

// 2. Recents on Playlists from lib-ctx-last: played first, newest first, then the rest in library order; remembered.
tests.push(function () {
  var now = Date.now();
  var ctx = {};
  ctx['spotify:playlist:P4'] = ctxEntry(now - HOUR);
  ctx['spotify:playlist:P6'] = ctxEntry(now - 10 * MIN);
  ctx['spotify:album:A3'] = ctxEntry(now - 5 * MIN);
  ctx.liked = ctxEntry(now - MIN);
  var store = seed({ 'lib-ctx-last': ctx });
  return setup(store).then(function (tab) {
    click(tab, chip(tab, 'playlists', 'Recents'));
    var want = ['Liked Songs', 'Guest List', 'Zed 2', 'Morning Run', 'Their Mix', 'the Alpha List', 'Zed 10'];
    check('2 played playlists first (newest first), rest in library order, Liked Songs stays first', eq(mainNames(tab), want), mainNames(tab));
    check('2 choice stored like other sorts', stored(store, 'lib-sort-playlists') === 'recents', store.getItem('lib-sort-playlists'));
    check('2 Recents pressed and focused', chip(tab, 'playlists', 'Recents').getAttribute('aria-pressed') === 'true' && d(tab).activeElement === chip(tab, 'playlists', 'Recents'));
    check('2 zero requests', tab.calls.length === 0, tab.calls);
    // A playlist heard now (what the player check records) moves to the top on the next draw.
    tab.t().noteCtxSong({ type: 'track', uri: 'spotify:track:new', id: 'new', name: 'New', duration_ms: 200000 }, { type: 'playlist', uri: 'spotify:playlist:P5' }, 5000, true);
    tab.t().renderList();
    check('2 a playlist just heard moves to the top', mainNames(tab)[1] === 'Zed 10' && mainNames(tab)[2] === 'Guest List', mainNames(tab));
    check('2 still zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
    return setup(store);
  }).then(function (tab2) {
    check('2 remembered after a reload', chip(tab2, 'playlists', 'Recents').getAttribute('aria-pressed') === 'true' && mainNames(tab2)[1] === 'Zed 10', mainNames(tab2));
    check('2 reload: same library requests as any start (no extra)', tab2.boot.filter(function (c) { return /^\/(playlists|albums|shows|episodes|artists)\//.test(c.path); }).length === 0, tab2.boot.map(function (c) { return c.path; }));
    // Home's Your playlists follows the Playlists order.
    tab2.t().setFilter('home');
    check('2 Home Your playlists follows Recents', eq(homeCards(tab2).slice(0, 3), ['Zed 10', 'Guest List', 'Zed 2']), homeCards(tab2));
    tab2.t().setFilter('playlists');
    click(tab2, chip(tab2, 'playlists', 'Default'));
    check('2 Default brings back library order', eq(mainNames(tab2), DEFAULT_PL) && stored(store, 'lib-sort-playlists') === 'default', mainNames(tab2));
    check('2 reload tab: zero requests for the taps', tab2.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab2.calls);
    finish(tab2);
  });
});

// 3. Recents on Albums: lib-ctx-last plus Home's Recently played contexts; a song's album without an album context doesn't count.
tests.push(function () {
  var now = Date.now();
  var ctx = {};
  ctx['spotify:album:A3'] = ctxEntry(now - 2 * HOUR);
  ctx['spotify:playlist:P1'] = ctxEntry(now - MIN);
  var jump = [
    { kind: 'track', id: 'j1', uri: 'spotify:track:j1', name: 'J1', at: now - 30 * MIN, ctx: 'spotify:album:A2', album: { id: 'A2', uri: 'spotify:album:A2', name: 'apple' } },
    { kind: 'track', id: 'j2', uri: 'spotify:track:j2', name: 'J2', at: now - 5 * MIN, ctx: null, album: { id: 'A1', uri: 'spotify:album:A1', name: 'Blue' } },   // heard elsewhere (an artist page)
    { kind: 'track', id: 'j3', uri: 'spotify:track:j3', name: 'J3', at: now - 3 * HOUR, ctx: 'spotify:album:A3', album: { id: 'A3', uri: 'spotify:album:A3', name: 'Céline' } }   // older than lib-ctx-last: the newer time wins
  ];
  var store = seed({ 'lib-ctx-last': ctx }, 'albums');
  return setup(store, { recentJump: jump }).then(function (tab) {
    click(tab, chip(tab, 'albums', 'Recents'));
    check('3 albums: Recently played context first, then lib-ctx-last, then the rest', eq(mainNames(tab), ['apple', 'Céline', 'Blue']), mainNames(tab));
    var times = tab.t().recentTimes('albums');
    check('3 newer time of the two sources wins', times['spotify:album:A3'] === now - 2 * HOUR, times);
    check('3 an album heard outside the album does not count', !times['spotify:album:A1'], times);
    check('3 stored per view', stored(store, 'lib-sort-albums') === 'recents' && store.getItem('lib-sort-playlists') === null);
    check('3 zero requests', tab.calls.length === 0, tab.calls);
    tab.t().setFilter('playlists');
    check('3 Playlists keeps its own sort (Default)', eq(mainNames(tab), DEFAULT_PL), mainNames(tab));
    finish(tab);
  });
});

// 4. Recents on Podcasts → Shows from the podcast history; the rest in the default (Recently updated) order.
tests.push(function () {
  var now = Date.now();
  var hist = [histEntry('e9', 'S3', now - 20 * MIN), histEntry('e8', 'S3', now - 2 * DAY), histEntry('e7', 'S9', now - HOUR)];   // S9 not saved
  // Latest cache: Tech Talk has the newest episode, so Recently updated is Tech Talk, Money Show, History Hour.
  var latest = { at: now - MIN, failed: 0, asked: 1, items: [], newest: { S1: isoDaysAgo(3), S2: isoDaysAgo(1), S3: isoDaysAgo(9) } };
  var store = seed({ 'lib-ep-history': hist, 'lib-latest': latest }, 'podcasts');
  return setup(store, { podShows: true }).then(function (tab) {
    var names = mainNames(tab);
    check('4 default (Recently updated) order', eq(names, ['Saved episodes', 'Tech Talk', 'Money Show', 'History Hour']), names);
    click(tab, chip(tab, 'shows', 'Recents'));
    names = mainNames(tab);
    check('4 played show first, then Recently updated order, Saved episodes stays first', eq(names, ['Saved episodes', 'History Hour', 'Tech Talk', 'Money Show']), names);
    check('4 stored', stored(store, 'lib-sort-shows') === 'recents');
    check('4 zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
  });
});

// 5. Nothing played yet, or broken and expired records: Recents is the default order, no error.
tests.push(function () {
  var now = Date.now();
  var ctx = { 'spotify:playlist:P5': ctxEntry(now - 40 * DAY), 'spotify:playlist:P3': { uri: 'x', at: 'soon' }, 'spotify:playlist:P2': null, 'spotify:playlist:P6': ctxEntry(now + DAY) };
  var store = seed({ 'lib-ctx-last': ctx, 'lib-sort-playlists': 'recents', 'lib-ep-history': '!{not json', 'lib-sort-shows': 'recents' });
  return setup(store).then(function (tab) {
    check('5 expired, malformed and future entries ignored: default order', eq(mainNames(tab), DEFAULT_PL), mainNames(tab));
    check('5 Recents pressed from storage', chip(tab, 'playlists', 'Recents').getAttribute('aria-pressed') === 'true');
    tab.t().state.podTab = 'shows'; tab.t().setFilter('podcasts');
    check('5 shows: broken history, default order', eq(mainNames(tab), ['Saved episodes', 'Money Show', 'Tech Talk', 'History Hour']), mainNames(tab));
    check('5 no error toast', tab.toasts().length === 0, tab.toasts());
    check('5 zero requests', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    finish(tab);
    return setup(seed({ 'lib-sort-albums': 'recents' }, 'albums'));
  }).then(function (tab) {
    check('5 empty records: albums in saved order', eq(mainNames(tab), ['Blue', 'apple', 'Céline']), mainNames(tab));
    check('5 unknown stored sort value falls back to default', (function () { tab.w.localStorage.setItem('lib-sort-albums', JSON.stringify('bogus')); tab.t().renderList(); return chip(tab, 'albums', 'Recently saved').getAttribute('aria-pressed') === 'true'; })());
    finish(tab);
  });
});

// 6. By you: only playlists you own, together with sorts, Find in list and pins; remembered; zero requests.
tests.push(function () {
  var now = Date.now();
  var ctx = {};
  ctx['spotify:playlist:P2'] = ctxEntry(now - MIN);      // someone else's, played last
  ctx['spotify:playlist:P5'] = ctxEntry(now - HOUR);
  var pins = [{ kind: 'playlist', id: 'P6', name: 'Guest List', uri: 'spotify:playlist:P6', url: 'https://open.spotify.com/playlist/P6', img: '', sub: '', ownerId: 'friend' },
    { kind: 'playlist', id: 'P3', name: 'the Alpha List', uri: 'spotify:playlist:P3', url: 'https://open.spotify.com/playlist/P3', img: '', sub: '', ownerId: 'me1' }];
  var store = seed({ 'lib-ctx-last': ctx, 'lib-pins': pins });
  return setup(store).then(function (tab) {
    check('6 pinned before: both', eq(pinNames(tab), ['Guest List', 'the Alpha List']), pinNames(tab));
    click(tab, byYou(tab));
    check('6 By you: only your playlists, Liked Songs kept', eq(mainNames(tab), ['Liked Songs', 'Morning Run', 'Zed 2', 'Zed 10']), mainNames(tab));
    check('6 pinned: someone else’s pin hidden, yours stays', eq(pinNames(tab), ['the Alpha List']), pinNames(tab));
    check('6 pins themselves unchanged', stored(store, 'lib-pins').length === 2);
    check('6 stored true, pressed, focused', stored(store, 'lib-pl-byyou') === true && byYou(tab).getAttribute('aria-pressed') === 'true' && d(tab).activeElement === byYou(tab));
    click(tab, chip(tab, 'playlists', 'Recents'));
    check('6 with Recents: your played ones first (theirs left out)', eq(mainNames(tab), ['Liked Songs', 'Zed 10', 'Morning Run', 'Zed 2']), mainNames(tab));
    click(tab, chip(tab, 'playlists', 'A–Z'));
    check('6 with A–Z', eq(mainNames(tab), ['Liked Songs', 'Morning Run', 'Zed 2', 'Zed 10']), mainNames(tab));
    check('6 By you stays on across sorts', byYou(tab).getAttribute('aria-pressed') === 'true');
    typeFind(tab, 'zed');
    check('6 with Find in list', eq(mainNames(tab), ['Zed 2', 'Zed 10']), mainNames(tab));
    typeFind(tab, 'mix');
    check('6 Find matches only someone else’s: says nothing matches', emptyText(tab) === 'Nothing matches “mix”.' || emptyText(tab) === 'Nothing else matches “mix”.', emptyText(tab));
    check('6 chips still there while nothing matches', !!byYou(tab));
    typeFind(tab, '');
    tab.t().setFilter('home');
    check('6 Home Your playlists ignores By you', homeCards(tab).indexOf('Their Mix') !== -1, homeCards(tab));
    tab.t().setFilter('all');
    check('6 All ignores By you', !!Array.prototype.filter.call(d(tab).querySelectorAll('#main a.item .name'), function (n) { return n.textContent === 'Their Mix'; }).length);
    check('6 zero requests for every tap', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    tab.t().setFilter('playlists');
    finish(tab);
    return setup(store);
  }).then(function (tab) {
    check('6 remembered after a reload', byYou(tab).getAttribute('aria-pressed') === 'true' && eq(mainNames(tab), ['Liked Songs', 'Morning Run', 'Zed 2', 'Zed 10']), mainNames(tab));
    click(tab, byYou(tab));
    check('6 off again: everything back, pinned ones above (A–Z kept)', eq(mainNames(tab), ['Liked Songs', 'Morning Run', 'Their Mix', 'Zed 2', 'Zed 10']) && stored(store, 'lib-pl-byyou') === false, mainNames(tab));
    check('6 pins back', eq(pinNames(tab), ['Guest List', 'the Alpha List']), pinNames(tab));
    check('6 zero requests', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    finish(tab);
  });
});

// 7. By you edge cases: you own none (the chip stays to turn it off), only one playlist, and the page doesn't know who you are.
tests.push(function () {
  var l = lib();
  l.playlists = [rawPl('Q1', 'other', 'Not Mine', 4)];
  var store = seed({ 'lib-pl-byyou': true });
  return setup(store, { lib: l }).then(function (tab) {
    check('7 none of yours: plain message', emptyText(tab) === 'You don’t own any playlists yet. Tap “By you” to show them all.', emptyText(tab));
    check('7 Liked Songs still listed', eq(mainNames(tab), ['Liked Songs']), mainNames(tab));
    check('7 chip shown even with one playlist, so it can be turned off', !!byYou(tab) && byYou(tab).getAttribute('aria-pressed') === 'true');
    click(tab, byYou(tab));
    check('7 off: the playlist is back', eq(mainNames(tab), ['Liked Songs', 'Not Mine']), mainNames(tab));
    check('7 off: one playlist, no sort row (as before)', !q(tab, '.sortbar[data-view="playlists"]'));
    // The page doesn't know who you are: no chip, and a stored choice doesn't hide anything.
    store.setItem('lib-pl-byyou', 'true');
    tab.t().state.data.me = null;
    tab.t().renderList();
    check('7 no account id: filter not applied', eq(mainNames(tab), ['Liked Songs', 'Not Mine']), mainNames(tab));
    check('7 no account id: no By you chip', !byYou(tab));
    check('7 zero requests', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    finish(tab);
  });
});

// 8. Storage full or blocked: By you still works for this visit; Recents taps don't throw; nothing sent.
tests.push(function () {
  var store = seed();
  var realSet = store.setItem;
  return setup(store).then(function (tab) {
    store.setItem = function (k, v) { if (k === 'lib-pl-byyou' || /^lib-sort-/.test(k)) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(store, k, v); };
    var threw = null;
    try { click(tab, byYou(tab)); } catch (e) { threw = e.message; }
    check('8 quota error: no throw', threw === null, threw);
    check('8 quota error: By you holds in memory', tab.t().byYouOn() === true && eq(mainNames(tab), ['Liked Songs', 'Morning Run', 'the Alpha List', 'Zed 2', 'Zed 10']), mainNames(tab));
    check('8 nothing stored', store.getItem('lib-pl-byyou') === null);
    click(tab, byYou(tab));
    check('8 quota error: off again in memory', tab.t().byYouOn() === false && eq(mainNames(tab), DEFAULT_PL), mainNames(tab));
    try { click(tab, chip(tab, 'playlists', 'Recents')); } catch (e) { threw = e.message; }
    check('8 quota error on a sort tap: no throw, list still drawn', threw === null && mainNames(tab).length === 7, threw);
    check('8 zero requests', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    store.setItem = realSet;
    finish(tab);
    // A stale stored true with a later failed write of false: memory decides.
    var s2 = seed({ 'lib-pl-byyou': true });
    return setup(s2).then(function (tab2) {
      var rs = s2.setItem;
      s2.setItem = function (k, v) { if (k === 'lib-pl-byyou') throw new Error('QuotaExceededError'); return rs.call(s2, k, v); };
      click(tab2, byYou(tab2));
      check('8 failed write clears the stale value: off', tab2.t().byYouOn() === false && s2.getItem('lib-pl-byyou') === null && eq(mainNames(tab2), DEFAULT_PL), [s2.getItem('lib-pl-byyou'), mainNames(tab2)]);
      s2.setItem = rs;
      finish(tab2);
    });
  });
});

// 9. Paused groups: with every group cooling off after a 429, Recents and By you still work and send nothing.
tests.push(function () {
  var now = Date.now();
  var ctx = {};
  ctx['spotify:playlist:P5'] = ctxEntry(now - MIN);
  var store = seed({ 'lib-ctx-last': ctx });
  return setup(store).then(function (tab) {
    var until = Date.now() + 10 * MIN;
    store.setItem('lib-cooloff', JSON.stringify({ player: { until: until, reason: 'rate', strikes: 1 }, library: { until: until, reason: 'quota', strikes: 1 }, search: { until: until, reason: 'rate', strikes: 1 }, catalog: { until: until, reason: 'quota', strikes: 1 } }));
    click(tab, chip(tab, 'playlists', 'Recents'));
    click(tab, byYou(tab));
    check('9 paused: Recents and By you applied', eq(mainNames(tab), ['Liked Songs', 'Zed 10', 'Morning Run', 'the Alpha List', 'Zed 2']), mainNames(tab));
    tab.t().setFilter('albums'); click(tab, chip(tab, 'albums', 'Recents'));
    tab.t().state.podTab = 'shows'; tab.t().setFilter('podcasts'); click(tab, chip(tab, 'shows', 'Recents'));
    check('9 paused: zero requests in every group', tab.calls.length === 0, tab.calls);
    check('9 paused: no slow-down toast from these taps', tab.toasts().filter(function (m) { return /slow down/i.test(m); }).length === 0, tab.toasts());
    finish(tab);
  });
});

// 10. Nearby: the other sorts, Most songs and Pinned order are unchanged; byRecents is stable and doesn't change the items.
tests.push(function () {
  var now = Date.now();
  var ctx = {};
  ctx['spotify:playlist:P4'] = ctxEntry(now - MIN);
  var pins = [{ kind: 'playlist', id: 'P5', name: 'Zed 10', uri: 'spotify:playlist:P5', url: 'https://open.spotify.com/playlist/P5', img: '', sub: '', ownerId: 'me1' },
    { kind: 'playlist', id: 'P4', name: 'Zed 2', uri: 'spotify:playlist:P4', url: 'https://open.spotify.com/playlist/P4', img: '', sub: '', ownerId: 'me1' }];
  var store = seed({ 'lib-ctx-last': ctx, 'lib-pins': pins });
  return setup(store).then(function (tab) {
    click(tab, chip(tab, 'playlists', 'Recents'));
    check('10 Pinned keeps pin order under Recents', eq(pinNames(tab), ['Zed 10', 'Zed 2']), pinNames(tab));
    check('10 a pinned playlist is not repeated below', mainNames(tab).indexOf('Zed 2') === -1 && mainNames(tab)[0] === 'Liked Songs', mainNames(tab));
    click(tab, chip(tab, 'playlists', 'Most songs'));
    check('10 Most songs unchanged', eq(mainNames(tab), ['Liked Songs', 'Their Mix', 'Morning Run', 'the Alpha List', 'Guest List']), mainNames(tab));
    var t = tab.t();
    var list = t.state.data.playlists;
    var before = JSON.stringify(list);
    var out = t.byRecents('playlists', list);
    check('10 byRecents returns a new array and leaves items alone', out !== list && JSON.stringify(list) === before && out.length === list.length);
    check('10 byRecents on an empty list', eq(t.byRecents('albums', []), []));
    check('10 unknown view: no times', eq(t.recentTimes('artists'), {}));
    check('10 zero requests', tab.calls.filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
    finish(tab);
  });
});

// 11. Layout: the touch area is 44 px tall; the chips keep their look.
tests.push(function () {
  return setup(seed()).then(function (tab) {
    var css = Array.prototype.map.call(d(tab).querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    check('11 44 px touch area on sort chips (34 px + 5 px above and below)', /\.sortbar \.chip::after \{[^}]*top: -5px; bottom: -5px;/.test(css) && /\.sortbar \.chip \{[^}]*min-height: 34px/.test(css));
    check('11 separator uses the line token (both themes)', /\.sortsep \{[^}]*background: var\(--line\)/.test(css));
    check('11 wrapped rows 10 px apart, so touch areas (5 px each way) don’t overlap', /\.sortbar \{[^}]*gap: 10px 6px/.test(css), css.match(/\.sortbar \{[^}]*\}/));
    var grp = q(tab, '.sortbar[data-view="playlists"] .owngrp');
    check('11 separator and By you wrap together', !!grp && grp.children.length === 2 && grp.children[0].className === 'sortsep' && grp.children[1] === byYou(tab) && /\.owngrp \{[^}]*display: inline-flex/.test(css));
    finish(tab);
  });
});

// 12. Shows on Recents don't reorder under the finger when the podcast history changes (player check); next navigation does.
tests.push(function () {
  var now = Date.now();
  var hist = [histEntry('e9', 'S3', now - 20 * MIN), histEntry('e5', 'S2', now - HOUR)];
  var store = seed({ 'lib-ep-history': hist, 'lib-sort-shows': 'recents' }, 'podcasts');
  return setup(store, { podShows: true }).then(function (tab) {
    var t = tab.t();
    var before = mainNames(tab);
    check('12 Recents order to start', eq(before, ['Saved episodes', 'History Hour', 'Tech Talk', 'Money Show']), before);
    var calls0 = tab.calls.length;
    // The player check hears an episode of Money Show: the history changes and Podcasts redraws.
    t.noteEpisode({ type: 'episode', uri: 'spotify:episode:m1', id: 'm1', name: 'Money now', duration_ms: 1800000, show: { id: 'S1', name: 'Money Show', images: [] } }, 120000, true);
    return H.wait(30).then(function () {
      check('12 history has the new episode first', t.epHistory()[0].uri === 'spotify:episode:m1', t.epHistory()[0]);
      check('12 the redraw keeps the row order', eq(mainNames(tab), before), mainNames(tab));
      t.epHistChanged();
      return H.wait(30);
    }).then(function () {
      check('12 a second redraw still keeps it', eq(mainNames(tab), before), mainNames(tab));
      check('12 other draws are not held after the redraw', eq(t.recentTimes('shows')['show:S1'] > 0, true));
      t.setFilter('podcasts');
      check('12 next navigation: the show just heard moves to the top', eq(mainNames(tab), ['Saved episodes', 'Money Show', 'History Hour', 'Tech Talk']), mainNames(tab));
      check('12 zero requests to library or catalog', tab.calls.slice(calls0).filter(function (c) { return !/^\/me\/player/.test(c.path); }).length === 0, tab.calls);
      finish(tab);
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
