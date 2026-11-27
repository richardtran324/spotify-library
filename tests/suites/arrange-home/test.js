'use strict';
// Edit Home (v2.59) tests: section order and show/hide in one localStorage key, Reset, unknown/new sections,
// the two optional sections (Recently saved albums, Recently liked songs) and zero requests.
// jsdom, mocked fetch, shared localStorage. Run: node tests/run.js arrange-home  (or: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }
function eq(name, a, b) { check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }

var KEY = 'lib-home-layout';
var DEFAULT_ORDER = ['liked', 'pinned', 'continue', 'bookmarks', 'jump', 'latest', 'playlists', 'albums', 'likedRecent'];
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function rawPl(id, owner, name) { return { id: id, uri: 'spotify:playlist:' + id, name: name || ('List ' + id), images: [], owner: { id: owner, display_name: owner }, collaborative: false, items: { total: 10 } }; }
function rawAlbum(id, name) { return { id: id, uri: 'spotify:album:' + id, name: name || ('Album ' + id), images: [], artists: [{ name: 'Band ' + id }], release_date: '2020-01-01', total_tracks: 10 }; }
function rawTrack(n) {
  return { type: 'track', id: 'L' + n, uri: 'spotify:track:L' + n, name: 'Liked ' + n, duration_ms: 200000,
    album: rawAlbum('LA' + n, 'Liked album ' + n), artists: [{ name: 'Singer ' + n }] };
}
var ALBUMS = [];
for (var n = 1; n <= 10; n++) ALBUMS.push(rawAlbum('A' + n, 'Album ' + n));   // Spotify's order: newest saved first
var LIKED_TRACKS = [];
for (n = 1; n <= 12; n++) LIKED_TRACKS.push(rawTrack(n));
var LIB = {
  playlists: [rawPl('P1', 'me1', 'Morning Run'), rawPl('P2', 'other', 'Their Mix')],
  shows: [{ id: 'S1', uri: 'spotify:show:S1', name: 'Money Show', images: [], total_episodes: 20 }]
};
var PINS = [
  { kind: 'playlist', id: 'P1', name: 'Morning Run', uri: 'spotify:playlist:P1', url: 'https://open.spotify.com/playlist/P1', img: '', sub: 'Playlist', ownerId: 'me1' },
  { kind: 'album', id: 'A1', name: 'Album 1', uri: 'spotify:album:A1', url: 'https://open.spotify.com/album/A1', img: '', sub: 'Album' }
];
var LATEST = { at: Date.now() - 3600e3, items: [
  { id: 'e1', uri: 'spotify:episode:e1', name: 'Newest', showId: 'S1', showName: 'Money Show', date: '2026-11-26', durMs: 3600000, positionMs: 0, played: false }
], failed: 0, newest: { S1: '2026-11-26' } };
var EP_HIST = [{ uri: 'spotify:episode:e9', id: 'e9', name: 'Half heard', show: { id: 'S1', name: 'Money Show', images: [] }, duration_ms: 3600000, positionMs: 900000, played: false, at: Date.now() - 3600e3 }];

function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('home'));
  s.setItem('lib-pins', JSON.stringify(PINS));
  s.setItem('lib-latest', JSON.stringify(LATEST));
  s.setItem('lib-ep-history', JSON.stringify(EP_HIST));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, typeof extra[k] === 'string' ? extra[k] : JSON.stringify(extra[k])); });
  return s;
}
// opts: {likedStatus, keepRecentClock}
function setup(store, opts) {
  opts = opts || {};
  var env = { likedStatus: opts.likedStatus || 200, recent: opts.recent || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (path === '/me') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/playlists') return { status: 200, json: { items: LIB.playlists, next: null, total: 2 } };
    if (path === '/me/albums') return { status: 200, json: { items: ALBUMS.map(function (a) { return { album: a }; }), next: null, total: ALBUMS.length } };
    if (path === '/me/following') return { status: 200, json: { artists: { items: [], next: null } } };
    if (path === '/me/shows') return { status: 200, json: { items: LIB.shows.map(function (s) { return { show: s }; }), next: null } };
    if (path === '/me/tracks') {
      if (q.get('limit') === '1') return { status: 200, json: { items: [], next: null, total: LIKED_TRACKS.length } };
      if (env.likedStatus !== 200) return { status: env.likedStatus, json: { error: { status: env.likedStatus, message: 'API rate limit exceeded' } } };
      return { status: 200, json: { items: LIKED_TRACKS.map(function (t, i) { return { added_at: new Date(Date.now() - i * 86400e3).toISOString(), track: t }; }), next: null, total: LIKED_TRACKS.length } };
    }
    if (path === '/me/player/recently-played') return { status: 200, json: { items: env.recent || [] } };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (path === '/me/library/contains') return { status: 200, json: [] };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (!opts.keepRecentClock) t.state.recentTriedAt = Date.now();   // Home's recently-played load is tested on purpose
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
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function key(tab, k) { d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: k, bubbles: true })); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return (!method || c.method === method) && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function group(c) {   // as the page's coolGroup
  if (/^\/me\/player\/recently-played/.test(c.path)) return 'library';
  if (/^\/me\/player(\/|$)/.test(c.path)) return 'player';
  if (/^\/me(\/|$)/.test(c.path)) return 'library';
  if (/^\/search/.test(c.path)) return 'search';
  return 'catalog';
}
function byGroup(tab) { var o = {}; tab.calls.forEach(function (c) { var g = group(c); o[g] = (o[g] || 0) + 1; }); return o; }
// Home's sections as drawn, top to bottom.
var HEAD_IDS = { hPinned: 'pinned', clHead: 'continue', hBm: 'bookmarks', hJump: 'jump', hLatest: 'latest', hPlaylists: 'playlists', hAlbums: 'albums', hLikedRecent: 'likedRecent' };
function homeOrder(tab) {
  var out = [];
  [].slice.call(q(tab, '#main').children).forEach(function (c) {
    if (c.matches('ul.list.hero')) out.push('liked');
    var h = c.matches('h2.sect') ? c : c.querySelector && c.querySelector('h2.sect');
    if (h && HEAD_IDS[h.id]) out.push(HEAD_IDS[h.id]);
  });
  return out;
}
function sheetOrder(tab) { return qa(tab, '#homeSheetList li.hsrow').map(function (li) { return li.getAttribute('data-sect'); }); }
function row(tab, id) { return q(tab, '#homeSheetList li[data-sect="' + id + '"]'); }
function btn(tab, id, which) { return row(tab, id).querySelector('[data-hs="' + which + '"]'); }
function toggle(tab, id, on) {
  var sw = btn(tab, id, 'show');
  sw.checked = on;
  sw.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
}
function stored(store) { var v = store.getItem(KEY); return v == null ? null : JSON.parse(v); }
function cards(tab, id) { return qa(tab, 'ul[aria-labelledby="' + id + '"] > li'); }
function cardNames(tab, id) { return cards(tab, id).map(function (li) { return li.querySelector('.clname').textContent; }); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function finish(tab) { try { tab.t().stopApp(); } catch (e) {} tab.w.close(); }

var tests = [];

// 1. Default: today's Home, Edit Home at the bottom, nothing stored, no request.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.renderList();
    return H.wait(100).then(function () {
      eq('1 default order is today’s', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists']);
      check('1 optional sections are off', !q(tab, '#hAlbums') && !q(tab, '#hLikedRecent'));
      var main = q(tab, '#main');
      var last = main.lastElementChild;
      check('1 Edit Home is the last thing on Home', last && last.className === 'homeedit' && last.querySelector('#homeEdit').textContent === 'Edit Home', last && last.outerHTML);
      check('1 nothing stored', store.getItem(KEY) === null);
      eq('1 layout reads as the default', [t.readHomeLayout().order, Object.keys(t.readHomeLayout().hidden).sort()], [DEFAULT_ORDER, ['albums', 'likedRecent']]);
      check('1 pinned playlist left out of Your playlists', cardNames(tab, 'hPlaylists').indexOf('Morning Run') === -1, cardNames(tab, 'hPlaylists'));
      check('1 pinned cards keep their play buttons (v2.23)', cards(tab, 'hPinned').every(function (li) { return !!li.querySelector('button.cardplay'); }));
      check('1 Continue listening keeps its mark button (v2.21)', !!q(tab, 'ul.cl li[data-puri="spotify:episode:e9"] button.clmark'));
      check('1 version is v2.57 or later', (+((/^v2\.(\d+)/.exec((/var VERSION = '(v[0-9.]+)/.exec(require('fs').readFileSync(process.env.SRC || require('path').resolve(__dirname, '../../../index.html'), 'utf8')) || [])[1] || '') || [])[1]) >= 57));   // renumbered from v2.59 on merge
      check('1 Home render: zero requests', tab.calls.length === 0, tab.calls);
      finish(tab);
    });
  });
});

// 2. The sheet: rows in order, 44 px arrows, switches, ends disabled, focus, Escape, backdrop.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var edit = q(tab, '#homeEdit');
    click(tab, edit);
    check('2 sheet opens', !q(tab, '#homeSheet').hidden);
    check('2 focus on Done', d(tab).activeElement === q(tab, '#homeSheetClose'), d(tab).activeElement && d(tab).activeElement.id);
    eq('2 rows in default order', sheetOrder(tab), DEFAULT_ORDER);
    eq('2 row names', qa(tab, '#homeSheetList .setname').map(function (n) { return n.textContent; }),
      ['Liked Songs', 'Pinned', 'Continue listening', 'Bookmarks', 'Jump back in', 'Latest episodes', 'Your playlists', 'Recently saved albums', 'Recently liked songs']);
    eq('2 switches: seven on, two optional off', qa(tab, '#homeSheetList input[role="switch"]').map(function (s) { return s.checked; }), [true, true, true, true, true, true, true, false, false]);
    check('2 first up and last down are disabled', btn(tab, 'liked', 'up').disabled && btn(tab, 'likedRecent', 'down').disabled && !btn(tab, 'liked', 'down').disabled && !btn(tab, 'likedRecent', 'up').disabled);
    check('2 arrows say what they move and where it is', btn(tab, 'pinned', 'up').getAttribute('aria-label') === 'Move “Pinned” up, 2 of 9' && btn(tab, 'pinned', 'down').getAttribute('aria-label') === 'Move “Pinned” down, 2 of 9', btn(tab, 'pinned', 'up').getAttribute('aria-label'));
    var css0 = Array.prototype.map.call(d(tab).querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    check('2 rows scroll inside the sheet; buttons stay put', /#homeSheet \.sheet-panel \{ overflow: hidden; \}/.test(css0) && /\.hslist \{[^}]*flex: 1 1 auto; min-height: 0; overflow: auto;/.test(css0) && /#homeSheet \.sheet-btns \{ flex: none; \}/.test(css0));
    check('2 switch is labelled', btn(tab, 'albums', 'show').getAttribute('aria-label') === 'Show “Recently saved albums” on Home');
    check('2 optional sections explain themselves', /first 8 of your Albums list/.test(row(tab, 'albums').textContent) && /Nothing extra is asked/.test(row(tab, 'likedRecent').textContent));
    check('2 Reset disabled at the default', q(tab, '#homeReset').disabled);
    var css = Array.prototype.map.call(d(tab).querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    check('2 arrows are 44 px', /\.act\.hsmove \{ width: 44px; height: 44px; \}/.test(css));
    check('2 switch tap area at least 44 px', /\.hsswitchwrap \{[^}]*min-width: 60px; min-height: 44px;/.test(css));
    check('2 Edit Home link at least 44 px', /\.homeedit \.linkbtn \{[^}]*min-height: 44px;/.test(css));
    check('2 switch has no animation with reduced motion', /prefers-reduced-motion: reduce\) \{ \.hsswitch, \.hsswitch::before \{ transition: none; \} \}/.test(css));
    check('2 sheet colours come from theme tokens', !/\.hs[a-z]+[^{]*\{[^}]*#(?!fff\b)[0-9a-f]{3,6}/i.test(css), 'hard-coded colour');
    key(tab, 'Escape');
    check('2 Escape closes it', q(tab, '#homeSheet').hidden);
    check('2 focus back on Edit Home', d(tab).activeElement === q(tab, '#homeEdit'), d(tab).activeElement && d(tab).activeElement.id);
    click(tab, q(tab, '#homeEdit'));
    click(tab, q(tab, '#homeSheetBack'));
    check('2 backdrop closes it', q(tab, '#homeSheet').hidden);
    check('2 opening and closing: zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
  });
});

// 3. Moving: Home follows at once, focus stays on the arrow, it's announced, stored, zero requests.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    click(tab, q(tab, '#homeEdit'));
    click(tab, btn(tab, 'continue', 'up'));
    click(tab, btn(tab, 'continue', 'up'));
    eq('3 sheet: Continue listening first', sheetOrder(tab).slice(0, 3), ['continue', 'liked', 'pinned']);
    eq('3 Home redrawn behind the sheet', homeOrder(tab), ['continue', 'liked', 'pinned', 'jump', 'latest', 'playlists']);
    check('3 at the top: focus moves to its down arrow', d(tab).activeElement === btn(tab, 'continue', 'down'), d(tab).activeElement && d(tab).activeElement.getAttribute('aria-label'));
    check('3 announcement waits until focus has moved', q(tab, '#homeSheetLive').textContent === '');
    check('3 the focused arrow says the new place', d(tab).activeElement.getAttribute('aria-label') === 'Move “Continue listening” down, 1 of 9', d(tab).activeElement.getAttribute('aria-label'));
    eq('3 stored order and hidden set', stored(store), { order: ['continue', 'liked', 'pinned', 'bookmarks', 'jump', 'latest', 'playlists', 'albums', 'likedRecent'], hidden: ['albums', 'likedRecent'] });
    check('3 Reset enabled', !q(tab, '#homeReset').disabled);
    return H.wait(250).then(function () {
    check('3 announced after the focus move', q(tab, '#homeSheetLive').textContent === 'Continue listening: 1 of 9.', q(tab, '#homeSheetLive').textContent);
    click(tab, btn(tab, 'playlists', 'down'));
    check('3 moving down keeps focus on the down arrow', d(tab).activeElement === btn(tab, 'playlists', 'down'), d(tab).activeElement && d(tab).activeElement.getAttribute('aria-label'));
    eq('3 Your playlists after Recently saved albums', sheetOrder(tab).slice(6, 9), ['albums', 'playlists', 'likedRecent']);
    check('3 the disabled arrow does nothing', (function () { var b = btn(tab, 'continue', 'up'); click(tab, b); return b.disabled && sheetOrder(tab)[0] === 'continue'; })());
    check('3 moving: zero requests', tab.calls.length === 0, tab.calls);
    click(tab, q(tab, '#homeSheetClose'));
    check('3 Done closes, focus on the new Edit Home', q(tab, '#homeSheet').hidden && d(tab).activeElement === q(tab, '#homeEdit'));
    finish(tab);
    // A new tab on the same storage keeps the order.
    return setup(store).then(function (tab2) {
      eq('3 order survives a reload', homeOrder(tab2), ['continue', 'liked', 'pinned', 'jump', 'latest', 'playlists']);
      finish(tab2);
    });
    });
  });
});

// 4. Hiding: the section goes; a hidden Pinned lets pinned playlists back into Your playlists; Reset.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    click(tab, q(tab, '#homeEdit'));
    toggle(tab, 'pinned', false);
    eq('4 Pinned gone from Home', homeOrder(tab), ['liked', 'continue', 'jump', 'latest', 'playlists']);
    check('4 pinned playlist now in Your playlists', cardNames(tab, 'hPlaylists').indexOf('Morning Run') !== -1, cardNames(tab, 'hPlaylists'));
    check('4 focus stays on the switch', d(tab).activeElement === btn(tab, 'pinned', 'show'));
    eq('4 stored hidden set', stored(store).hidden, ['pinned', 'albums', 'likedRecent']);
    toggle(tab, 'liked', false); toggle(tab, 'latest', false);
    eq('4 more hidden', homeOrder(tab), ['continue', 'jump', 'playlists']);
    return H.wait(250).then(function () {
    check('4 announced', q(tab, '#homeSheetLive').textContent === 'Latest episodes hidden.', q(tab, '#homeSheetLive').textContent);
    click(tab, q(tab, '#homeReset'));
    eq('4 Reset: today’s Home again', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists']);
    check('4 Reset removes the key', store.getItem(KEY) === null);
    eq('4 Reset: sheet back to default', sheetOrder(tab), DEFAULT_ORDER);
    check('4 Reset: switches back', btn(tab, 'pinned', 'show').checked && !btn(tab, 'albums', 'show').checked);
    check('4 Reset: focus on Done, Reset disabled', d(tab).activeElement === q(tab, '#homeSheetClose') && q(tab, '#homeReset').disabled);
    return H.wait(250);
    }).then(function () {
    check('4 Reset announced', q(tab, '#homeSheetLive').textContent === 'Home is back to the usual order.', q(tab, '#homeSheetLive').textContent);
    // Turning something on and off again by hand is the default too: nothing is stored.
    toggle(tab, 'albums', true); toggle(tab, 'albums', false);
    check('4 back at the default by hand: key removed', store.getItem(KEY) === null, store.getItem(KEY));
    check('4 hiding: zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
    });
  });
});

// 5. Everything hidden: a plain line and Edit Home stay.
tests.push(function () {
  var store = seed({ 'lib-home-layout': { order: DEFAULT_ORDER, hidden: DEFAULT_ORDER } });
  return setup(store).then(function (tab) {
    eq('5 no sections', homeOrder(tab), []);
    check('5 says every section is hidden', q(tab, '#main p.empty') && q(tab, '#main p.empty').textContent === 'Every Home section is hidden.');
    check('5 Edit Home still there', !!q(tab, '#homeEdit'));
    finish(tab);
  });
});

// 6. Stored values: unknown ids dropped, new sections at their default place, junk ignored.
tests.push(function () {
  var store = seed({ 'lib-home-layout': { order: ['playlists', 'bogus', 'liked', 'playlists', 7], hidden: ['bogus', 'liked', 'pinned'] } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    var l = t.readHomeLayout();
    eq('6 unknown and repeated ids dropped; missing ones at their default place', l.order, ['playlists', 'pinned', 'continue', 'bookmarks', 'jump', 'latest', 'liked', 'albums', 'likedRecent']);
    eq('6 hidden: only known ids that were in the saved order, plus new optional ones', Object.keys(l.hidden).sort(), ['albums', 'liked', 'likedRecent']);
    eq('6 Home follows', homeOrder(tab), ['playlists', 'pinned', 'continue', 'jump', 'latest']);
    // An order saved before the optional sections existed: they arrive hidden, at the end.
    store.setItem(KEY, JSON.stringify({ order: ['latest', 'liked', 'pinned', 'continue', 'jump', 'playlists'], hidden: [] }));
    l = t.readHomeLayout();
    eq('6 older layout: optional sections added, off', [l.order, Object.keys(l.hidden).sort()], [['latest', 'liked', 'pinned', 'bookmarks', 'continue', 'jump', 'playlists', 'albums', 'likedRecent'], ['albums', 'likedRecent']]);
    ['not json', '"text"', '[1,2]', '{"order":"x","hidden":5}', 'null'].forEach(function (v) {
      store.setItem(KEY, v);
      eq('6 junk ' + v + ' reads as the default', t.readHomeLayout().order, DEFAULT_ORDER);
    });
    store.setItem(KEY, 'not json');
    t.renderList();
    eq('6 junk: Home draws the default', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists']);
    check('6 stored value stays tiny', JSON.stringify({ order: DEFAULT_ORDER, hidden: DEFAULT_ORDER }).length < 300);
    check('6 zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
  });
});

// 7. Recently saved albums: first 8 in Spotify's order, play buttons, See all, name filter, zero requests.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    click(tab, q(tab, '#homeEdit'));
    toggle(tab, 'albums', true);
    eq('7 shown after Your playlists', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists', 'albums']);
    eq('7 first 8 of the Albums list, newest saved first', cardNames(tab, 'hAlbums'), ['Album 1', 'Album 2', 'Album 3', 'Album 4', 'Album 5', 'Album 6', 'Album 7', 'Album 8']);
    check('7 each card has a play button', cards(tab, 'hAlbums').every(function (li) { return !!li.querySelector('button.cardplay'); }));
    check('7 showing it: zero requests', tab.calls.length === 0, tab.calls);
    click(tab, q(tab, '#homeSheetClose'));
    click(tab, cards(tab, 'hAlbums')[2].querySelector('button.cardplay'));
    return H.wait(150).then(function () {
      var p = reqs(tab, 'PUT', '/me/player/play');
      check('7 play button: one player request', p.length === 1 && tab.calls.length === 1 && JSON.stringify(p[0].body) === '{"context_uri":"spotify:album:A3"}', tab.calls);
      // The name box: all albums are looked through while you type; Edit Home hides.
      tab.calls.length = 0;
      t.state.query = 'Album 1';
      t.renderList();
      eq('7 typed: matches from the whole Albums list', cardNames(tab, 'hAlbums'), ['Album 1', 'Album 10']);
      check('7 typed: no Edit Home', !q(tab, '#homeEdit'));
      t.state.query = '';
      t.renderList();
      click(tab, q(tab, 'button[data-see="hAlbums"]'));
      return H.wait(100);
    }).then(function () {
      check('7 See all opens Albums', t.state.filter === 'albums', t.state.filter);
      check('7 typing and See all: zero requests', tab.calls.length === 0, tab.calls);
      finish(tab);
    });
  });
});

// 8. Recently liked songs: a hint until Liked Songs is opened; then its first 8 from memory, no request of its own.
tests.push(function () {
  var store = seed({ 'lib-home-layout': { order: ['likedRecent', 'liked', 'pinned', 'continue', 'jump', 'latest', 'playlists', 'albums'], hidden: ['albums'] } });
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('8 not in memory: heading and hint', q(tab, '#hLikedRecent') && /Shows after you open Liked Songs/.test(q(tab, '.hshint').textContent));
    check('8 not in memory: no cards', cards(tab, 'hLikedRecent').length === 0);
    check('8 likedRecentItems is null', t.likedRecentItems() === null);
    check('8 hint render: zero requests', tab.calls.length === 0, tab.calls);
    store.setItem(KEY, JSON.stringify({ order: DEFAULT_ORDER, hidden: ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists', 'albums'] }));
    t.renderList();
    check('8 only the hint: no “Nothing here yet.” beside it', !!q(tab, '.hshint') && !q(tab, '#main p.empty'), q(tab, '#main p.empty') && q(tab, '#main p.empty').textContent);
    store.setItem(KEY, JSON.stringify({ order: ['likedRecent', 'liked', 'pinned', 'continue', 'jump', 'latest', 'playlists', 'albums'], hidden: ['albums'] }));
    t.state.query = 'Liked';
    t.renderList();
    check('8 typed: the hint is left out', !q(tab, '.hshint'));
    t.state.query = '';
    t.renderList();
    click(tab, q(tab, '.hshint .linkbtn'));   // Open Liked Songs: the usual one library request, only on this tap
    return H.wait(200).then(function () {
      var tr = reqs(tab, 'GET', '/me/tracks');
      check('8 opening Liked Songs: one library request', tr.length === 1 && /offset=0/.test(tr[0].query), tab.calls);
      eq('8 requests by group while opening', byGroup(tab), { library: 1 });
      t.closeDetail();
      tab.calls.length = 0;
      return H.wait(100);
    }).then(function () {
      check('8 back on Home', t.onHome());
      eq('8 first 8 liked songs, newest first', cardNames(tab, 'hLikedRecent'), ['Liked 1', 'Liked 2', 'Liked 3', 'Liked 4', 'Liked 5', 'Liked 6', 'Liked 7', 'Liked 8']);
      check('8 hint gone', !q(tab, '.hshint'));
      check('8 Home with Recently liked songs: zero requests', tab.calls.length === 0, tab.calls);
      t.state.saved['spotify:track:L2'] = false;   // unliked on this page meanwhile
      t.renderList();
      check('8 a song unliked here drops out', cardNames(tab, 'hLikedRecent').indexOf('Liked 2') === -1 && cardNames(tab, 'hLikedRecent').length === 7, cardNames(tab, 'hLikedRecent'));
      click(tab, cards(tab, 'hLikedRecent')[0].querySelector('a.clcard'));
      return H.wait(150);
    }).then(function () {
      var p = reqs(tab, 'PUT', '/me/player/play');
      check('8 a tap plays the song: one player request', p.length === 1 && tab.calls.length === 1 && p[0].body && (JSON.stringify(p[0].body).indexOf('spotify:track:L1') !== -1), tab.calls);
      // Refresh while the library is paused reloads nothing, so the songs stay.
      store.setItem('lib-cooloff', JSON.stringify({ library: { until: Date.now() + 600000, reason: 'rate', strikes: 0 } }));
      tab.calls.length = 0;
      click(tab, q(tab, '#refreshBtn'));
      t.renderList();
      check('8 Refresh with library paused: songs stay', t.likedRecentItems() && t.likedRecentItems().length === 7, t.likedRecentItems());
      check('8 Refresh with library paused: no library request', reqs(tab, null, /^\/me(\/(?!player)|$)/).length === 0, tab.calls);
      store.removeItem('lib-cooloff');
      // Refresh that reloads forgets the in-memory page: the hint comes back (Refresh's own requests are its usual ones).
      click(tab, q(tab, '#refreshBtn'));
      return H.wait(400);
    }).then(function () {
      t.renderList();
      check('8 after Refresh: hint again', t.likedRecentItems() === null && !!q(tab, '.hshint'));
      check('8 Refresh asks Liked Songs’ count only, not the list', reqs(tab, 'GET', '/me/tracks').every(function (c) { return /limit=1(&|$)/.test(c.query); }), reqs(tab, 'GET', '/me/tracks'));
      click(tab, q(tab, '.hshint .linkbtn'));
      return H.wait(200);
    }).then(function () {
      t.closeDetail();
      check('8 reopened: songs back', t.likedRecentItems() && t.likedRecentItems().length > 0);
      t.stopApp();
      check('8 sign-out forgets them', t.likedRecentItems() === null);
      finish(tab);
    });
  });
});

// 9. Recently liked songs when opening Liked Songs gets a 429: nothing kept, the hint stays, no retry.
tests.push(function () {
  var store = seed({ 'lib-home-layout': { order: DEFAULT_ORDER, hidden: ['albums'] } });
  return setup(store, { likedStatus: 429 }).then(function (tab) {
    var t = tab.t();
    click(tab, q(tab, '.hshint .linkbtn'));
    return H.wait(300).then(function () {
      check('9 one request, refused', reqs(tab, 'GET', '/me/tracks').length === 1, tab.calls);
      t.closeDetail();
      tab.calls.length = 0;
      return H.wait(100);
    }).then(function () {
      check('9 library paused by the 429', t.coolLeft('library') > 0);
      check('9 nothing kept: hint stays', t.likedRecentItems() === null && !!q(tab, '.hshint'));
      click(tab, q(tab, '#homeEdit'));
      click(tab, btn(tab, 'likedRecent', 'up'));
      toggle(tab, 'albums', true);
      check('9 Edit Home works while library is paused', sheetOrder(tab).indexOf('likedRecent') === 7 && !!q(tab, '#hAlbums'));
      check('9 paused library: zero requests from Home or the sheet', tab.calls.length === 0, tab.calls);
      finish(tab);
    });
  });
});

// 10. A hidden Jump back in only hides the strip: recently played is asked exactly as on main (once, library group),
// and it still fills v2.23's Continue · song for a list played while the page wasn't looking.
function recentRun(hidden) {
  var store = seed({ 'lib-home-layout': { order: DEFAULT_ORDER, hidden: hidden } });
  var recent = [{ track: rawTrack(50), played_at: new Date(Date.now() - 20 * 60000).toISOString(), context: { type: 'album', uri: 'spotify:album:A5' } }];
  return setup(store, { keepRecentClock: true, recent: recent }).then(function (tab) {
    var t = tab.t();
    tab.calls.length = 0;
    t.state.recentTriedAt = 0;
    t.state.bgHoldUntil = 0;   // past the start-up hold on background extras
    t.renderList();
    return H.wait(3000).then(function () {   // longer than the page's 2.5 s gap between background requests
      var out = { rp: reqs(tab, 'GET', '/me/player/recently-played').length, groups: byGroup(tab), ctx: t.readCtxLast()['spotify:album:A5'], jumpShown: !!q(tab, '#hJump') };
      t.renderList();
      return H.wait(300).then(function () { out.rp2 = reqs(tab, 'GET', '/me/player/recently-played').length; finish(tab); return out; });
    });
  });
}
tests.push(function () {
  var shown;
  return recentRun(['albums', 'likedRecent']).then(function (r) {
    shown = r;
    return recentRun(['jump', 'albums', 'likedRecent']);
  }).then(function (hid) {
    check('10 hidden Jump back in: strip hidden', !hid.jumpShown && shown.jumpShown);
    check('10 hidden Jump back in: recently played still asked once', hid.rp === 1, hid);
    eq('10 request counts match the default layout (main)', [hid.rp, hid.rp2, hid.groups], [shown.rp, shown.rp2, shown.groups]);
    check('10 a second render within 15 minutes asks nothing more', hid.rp2 === 1, hid);
    check('10 Continue · song filled from recently played with Jump hidden', hid.ctx && hid.ctx.uri === 'spotify:track:L50', hid.ctx);
  });
});

// 11. Storage refuses the layout: a toast, and Home keeps the change for this visit.
tests.push(function () {
  var store = seed();
  var realSet = store.setItem;
  store.setItem = function (k, v) { if (k === KEY) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(store, k, v); };
  return setup(store).then(function (tab) {
    click(tab, q(tab, '#homeEdit'));
    click(tab, btn(tab, 'playlists', 'up'));
    check('11 toast says it couldn’t save', lastToast(tab) === 'Couldn’t save on this phone. Home keeps this layout until you close the page.', tab.toasts());
    check('11 nothing stored', store.getItem(KEY) === null);
    eq('11 Home still follows (memory)', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'playlists', 'latest']);
    eq('11 sheet shows the change', sheetOrder(tab).slice(4, 7), ['jump', 'playlists', 'latest']);
    click(tab, btn(tab, 'playlists', 'up'));
    check('11 toast once per opening, not on every tap', tab.toasts().length === 1, tab.toasts());
    eq('11 a second move builds on the first', sheetOrder(tab).slice(4, 6), ['playlists', 'jump']);
    click(tab, q(tab, '#homeSheetClose'));
    click(tab, q(tab, '#homeEdit'));
    click(tab, btn(tab, 'playlists', 'down'));
    check('11 opening the sheet again warns again', tab.toasts().length === 2, tab.toasts());
    click(tab, q(tab, '#homeReset'));
    eq('11 Reset clears the memory copy', homeOrder(tab), ['liked', 'pinned', 'continue', 'jump', 'latest', 'playlists']);
    check('11 zero requests', tab.calls.length === 0, tab.calls);
    finish(tab);
  });
});

// 12. Signing out closes the sheet; other tabs and views don't show Edit Home.
tests.push(function () {
  var store = seed();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.setFilter('playlists');
    check('12 no Edit Home on Playlists', !q(tab, '#homeEdit'));
    t.setFilter('home');
    click(tab, q(tab, '#homeEdit'));
    t.stopApp();
    check('12 sign-out closes the sheet', q(tab, '#homeSheet').hidden);
    tab.w.close();
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
