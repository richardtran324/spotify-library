'use strict';
// Small pure helpers and link builders, called directly: jsdom, mocked fetch, shared localStorage.
// Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
process.env.TZ = process.env.TZ || 'UTC';   // clock and date checks build their inputs in local time anyway
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }
function eq(name, got, want) { var g = JSON.stringify(got), w = JSON.stringify(want); check(name, g === w, { got: got, want: want }); }

var MIN = 60000, HOUR = 3600000, DAY = 86400000;
// "Today" for date checks: Fri 27 Nov 2026, 12:00 local time.
var NOW = new Date(2026, 10, 27, 12, 0, 0).getTime();
function localeDay(y, m, d, opts) { return new Date(y, m, d).toLocaleDateString(undefined, opts); }

function setup(store) {
  var tab = H.makeTab(store || H.seedStore(), function (method, path) {
    if (path === '/me/player' && method === 'GET') return { status: 204 };
  });
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
// Replaces the window's Date so `new Date()` and Date.now() read `ms`; returns a function that puts it back.
function freeze(tab, ms) {
  var R = tab.w.Date;
  class FD extends R {
    constructor() { if (arguments.length) super(...arguments); else super(ms); }
    static now() { return ms; }
  }
  tab.w.Date = FD;
  return function () { tab.w.Date = R; };
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function names(list) { return list.map(function (x) { return x.name; }); }

var tests = [];

// 1. Durations and clock times.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    eq('1 fmtDur 0 rounds up to 1 min', t.fmtDur(0), '1 min');
    eq('1 fmtDur negative is 1 min', t.fmtDur(-5 * MIN), '1 min');
    eq('1 fmtDur rounds to the nearest minute', [t.fmtDur(29999), t.fmtDur(90000), t.fmtDur(59 * MIN)], ['1 min', '2 min', '59 min']);
    eq('1 fmtDur whole hour has no minutes', t.fmtDur(HOUR), '1 hr');
    eq('1 fmtDur hours and minutes', [t.fmtDur(61 * MIN), t.fmtDur(125 * MIN), t.fmtDur(10 * HOUR)], ['1 hr 1 min', '2 hr 5 min', '10 hr']);

    eq('1 fmtTime zero and negative', [t.fmtTime(0), t.fmtTime(-3000)], ['0:00', '0:00']);
    eq('1 fmtTime floors seconds', [t.fmtTime(59999), t.fmtTime(61000), t.fmtTime(600000)], ['0:59', '1:01', '10:00']);
    eq('1 fmtTime hours pad minutes', [t.fmtTime(HOUR), t.fmtTime(3723000), t.fmtTime(36000000 + 5000)], ['1:00:00', '1:02:03', '10:00:05']);

    eq('1 fmtLeft zero', t.fmtLeft(0), '0:00 left');
    eq('1 fmtLeft rounds up to the second', [t.fmtLeft(1), t.fmtLeft(59001), t.fmtLeft(30000)], ['0:01 left', '1:00 left', '0:30 left']);
    eq('1 fmtLeft hours', [t.fmtLeft(HOUR), t.fmtLeft(3661000), t.fmtLeft(2 * HOUR + 9 * MIN)], ['1:00:00 left', '1:01:01 left', '2:09:00 left']);

    function at(h, m, s) { return new Date(2026, 0, 1, h, m, s).getTime(); }
    eq('1 clockSec midnight is 12 AM', t.clockSec(at(0, 5, 9)), '12:05:09 AM');
    eq('1 clockSec noon is 12 PM', t.clockSec(at(12, 30, 5)), '12:30:05 PM');
    eq('1 clockSec afternoon and late night', [t.clockSec(at(13, 0, 0)), t.clockSec(at(23, 59, 59)), t.clockSec(at(9, 7, 3))], ['1:00:00 PM', '11:59:59 PM', '9:07:03 AM']);

    eq('1 ageText seconds', [t.ageText(0), t.ageText(-100), t.ageText(59400)], ['0 s', '0 s', '59 s']);
    eq('1 ageText rounds into minutes', [t.ageText(59600), t.ageText(90000), t.ageText(59 * MIN)], ['1 min', '2 min', '59 min']);
    eq('1 ageText hours', [t.ageText(HOUR), t.ageText(89 * MIN), t.ageText(125 * MIN)], ['1 h', '1 h 29 min', '2 h 5 min']);

    var old = t.state.player;
    t.state.player = null;
    var none = t.npDuration();
    t.state.player = { item: { uri: 'spotify:track:x' } };
    var noDur = t.npDuration();
    t.state.player = { item: { uri: 'spotify:track:x', duration_ms: 215000 } };
    var dur = t.npDuration();
    t.state.player = old;
    eq('1 npDuration: none, missing, set', [none, noDur, dur], [0, 0, 215000]);

    eq('1 epWhen played wins', t.epWhen(true, 600000, HOUR), 'Played');
    eq('1 epWhen minutes left', t.epWhen(false, 10 * MIN, HOUR), '50 min left');
    eq('1 epWhen nearly done is at least 1 min', [t.epWhen(false, HOUR - 10000, HOUR), t.epWhen(false, HOUR + MIN, HOUR)], ['1 min left', '1 min left']);
    eq('1 epWhen not started shows length', [t.epWhen(false, 0, HOUR), t.epWhen(false, 0, 42 * MIN)], ['1 hr', '42 min']);
    eq('1 epWhen no length', [t.epWhen(false, 0, 0), t.epWhen(false, 5000, 0)], ['', '']);
    check('1 no requests from helpers', tab.calls.length === 0, tab.calls);
  });
});

// 2. Dates relative to a fixed today.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var undo = freeze(tab, NOW);
    try {
      eq('2 daysAgo today, yesterday, a week', [t.daysAgo('2026-11-27'), t.daysAgo('2026-11-26'), t.daysAgo('2026-11-20')], [0, 1, 7]);
      eq('2 daysAgo month and year only start on day 1', [t.daysAgo('2026-11'), t.daysAgo('2026')], [26, 330]);
      eq('2 daysAgo future is negative', t.daysAgo('2026-12-01'), -4);
      eq('2 daysAgo unreadable is null', [t.daysAgo(''), t.daysAgo(null), t.daysAgo('2026-1-5'), t.daysAgo('2026-11-27T10:00:00Z')], [null, null, null, null]);

      eq('2 fmtDate this year leaves the year off', t.fmtDate('2026-11-18'), localeDay(2026, 10, 18, { month: 'short', day: 'numeric' }));
      check('2 fmtDate this year has no "2026"', t.fmtDate('2026-03-05').indexOf('2026') < 0, t.fmtDate('2026-03-05'));
      eq('2 fmtDate another year keeps it', t.fmtDate('2025-11-18'), localeDay(2025, 10, 18, { month: 'short', day: 'numeric', year: 'numeric' }));
      eq('2 fmtDate month precision', t.fmtDate('2024-03'), localeDay(2024, 2, 1, { month: 'short', year: 'numeric' }));
      eq('2 fmtDate month precision this year keeps the year', t.fmtDate('2026-03'), localeDay(2026, 2, 1, { month: 'short', year: 'numeric' }));
      eq('2 fmtDate year only', t.fmtDate('1999'), '1999');
      eq('2 fmtDate unreadable is empty', [t.fmtDate(''), t.fmtDate(null), t.fmtDate(undefined), t.fmtDate('soon'), t.fmtDate('2026-11-18T10:00:00Z')], ['', '', '', '', '']);

      eq('2 relDate Today and Yesterday', [t.relDate('2026-11-27'), t.relDate('2026-11-26')], ['Today', 'Yesterday']);
      eq('2 relDate older day is the date', t.relDate('2026-11-18'), t.fmtDate('2026-11-18'));
      eq('2 relDate tomorrow is a date, not Today', t.relDate('2026-11-28'), t.fmtDate('2026-11-28'));
      eq('2 relDate month or year only is never Today', [t.relDate('2026-11'), t.relDate('2026')], [t.fmtDate('2026-11'), '2026']);
      eq('2 relDate empty', [t.relDate(''), t.relDate(null)], ['', '']);

      eq('2 agoAt 0 is empty', t.agoAt(0), '');
      eq('2 agoAt just now (past and future)', [t.agoAt(NOW - 20000), t.agoAt(NOW + 5 * MIN)], ['just now', 'just now']);
      eq('2 agoAt minutes', [t.agoAt(NOW - 5 * MIN), t.agoAt(NOW - 59 * MIN)], ['5 min ago', '59 min ago']);
      eq('2 agoAt hours and days', [t.agoAt(NOW - 3 * HOUR), t.agoAt(NOW - 23 * HOUR), t.agoAt(NOW - 3 * DAY)], ['3 h ago', '23 h ago', '3 d ago']);

      eq('2 isoDay pads month and day', [t.isoDay(new Date(2026, 0, 5, 23, 59).getTime()), t.isoDay(new Date(2026, 10, 27).getTime())], ['2026-01-05', '2026-11-27']);
      eq('2 shortDay is month and day', t.shortDay(new Date(2026, 0, 5).getTime()), localeDay(2026, 0, 5, { month: 'short', day: 'numeric' }));
    } finally { undo(); }
    var nowYear = new Date().getFullYear();
    check('2 restoring Date brings back real time', tab.w.Date.now() > NOW - 400 * DAY && new tab.w.Date().getFullYear() >= nowYear - 1);
  });
});

// 3. Counts, lists, text comparison and HTML to text.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    eq('3 fmtCount groups thousands', [t.fmtCount(0), t.fmtCount(999), t.fmtCount(1000), t.fmtCount(1234567)], ['0', '999', '1,000', '1,234,567']);
    eq('3 fmtCount negative and string', [t.fmtCount(-1234), t.fmtCount('12345')], ['-1,234', '12,345']);

    eq('3 andList 0, 1, 2, 3', [t.andList([]), t.andList(['a']), t.andList(['a', 'b']), t.andList(['a', 'b', 'c'])], ['', 'a', 'a and b', 'a, b and c']);

    eq('3 sortText drops a leading The only', [t.sortText('The Beatles'), t.sortText('the  who'), t.sortText('Theory'), t.sortText('Into The Wild')], ['Beatles', 'who', 'Theory', 'Into The Wild']);
    eq('3 sortText empty for missing', [t.sortText(null), t.sortText(undefined), t.sortText(0)], ['', '', '']);
    check('3 cmpText ignores The, case and accents', t.cmpText('The Beatles', 'beatles') === 0 && t.cmpText('Éclair', 'eclair') === 0);
    check('3 cmpText numbers compare as numbers', t.cmpText('Track 2', 'Track 10') < 0 && t.cmpText('Track 10', 'Track 9') > 0);
    check('3 cmpText alphabetical', t.cmpText('ABBA', 'The Who') < 0 && t.cmpText('Zed', 'apple') > 0);
    check('3 byName uses cmpText on names', t.byName({ name: 'The Cure' }, { name: 'Blur' }) > 0 && t.byName({ name: 'a' }, { name: 'A' }) === 0);
    eq('3 cmpAsc order, ties, missing last', [t.cmpAsc('2024', '2025'), t.cmpAsc('2025', '2024'), t.cmpAsc('x', 'x'), t.cmpAsc('', '2024'), t.cmpAsc('2024', null)], [-1, 1, 0, 1, -1]);
    eq('3 cmpDesc order, ties, missing last', [t.cmpDesc('2024', '2025'), t.cmpDesc('2025', '2024'), t.cmpDesc('', ''), t.cmpDesc(null, '2024'), t.cmpDesc('2024', undefined)], [1, -1, 0, 1, -1]);

    eq('3 htmlText plain text passes through', t.htmlText('Line one\nLine two  spaced\n\na < b'), 'Line one\nLine two  spaced\n\na < b');
    var txt = t.htmlText('<p>Hello   <b>world</b></p><p>Two<br>lines</p><ul><li>One</li><li>Two</li></ul>');
    check('3 htmlText keeps words, collapses spaces', /Hello world/.test(txt) && txt.indexOf('<') < 0, txt);
    check('3 htmlText br and paragraphs make line breaks', /Two\nlines/.test(txt) && /world\n+Two/.test(txt), txt);
    check('3 htmlText list items are bulleted lines', /\n• One\n• Two/.test(txt), txt);
    eq('3 htmlText pre keeps spacing', t.htmlText('<pre>a   b\n  c</pre>').trim(), 'a   b\n  c');
    var bad = t.htmlText('<p>Safe</p><script>window.__xss = 1</script><style>p{}</style><img src="x" onerror="window.__xss2 = 1">');
    check('3 htmlText drops script and style text', bad.indexOf('__xss') < 0 && bad.indexOf('p{}') < 0 && /Safe/.test(bad), bad);
    eq('3 htmlText entities become text', t.htmlText('<p>Tom &amp; Jerry &lt;3</p>').trim(), 'Tom & Jerry <3');
    return H.wait(50).then(function () {
      check('3 htmlText runs nothing', tab.w.__xss === undefined && tab.w.__xss2 === undefined);
    });
  });
});

// 4. Sorting and the stored sort choice.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    var albums = [
      { name: 'The Zebra', artist: 'Beta', released: '2020-01-01' },
      { name: 'apple', artist: 'The Alpha', released: '' },
      { name: 'Mango', artist: 'alpha', released: '2023-05' },
      { name: 'Banana', artist: 'Beta', released: '2023-05' }
    ];
    store.removeItem('lib-sort-albums');
    eq('4 sortMode default is the first option', t.sortMode('albums'), 'saved');
    check('4 sortIsDefault with nothing stored', t.sortIsDefault('albums') === true);
    var same = t.sortList('albums', albums);
    check('4 default order is a copy in the same order', same !== albums && JSON.stringify(names(same)) === JSON.stringify(names(albums)));

    store.setItem('lib-sort-albums', JSON.stringify('az'));
    eq('4 sortMode reads lib-sort-<view>', t.sortMode('albums'), 'az');
    check('4 sortIsDefault false when changed', t.sortIsDefault('albums') === false);
    eq('4 albums A-Z ignores The and case', names(t.sortList('albums', albums)), ['apple', 'Banana', 'Mango', 'The Zebra']);
    eq('4 sortList leaves the input alone', names(albums), ['The Zebra', 'apple', 'Mango', 'Banana']);

    store.setItem('lib-sort-albums', JSON.stringify('artist'));
    eq('4 albums Artist A-Z, then name', names(t.sortList('albums', albums)), ['apple', 'Mango', 'Banana', 'The Zebra']);

    store.setItem('lib-sort-albums', JSON.stringify('released'));
    eq('4 albums Release date newest first, ties stable, missing last', names(t.sortList('albums', albums)), ['Mango', 'Banana', 'The Zebra', 'apple']);

    store.setItem('lib-sort-albums', JSON.stringify('bogus'));
    eq('4 unknown stored choice falls back to default', t.sortMode('albums'), 'saved');
    store.setItem('lib-sort-albums', 'not json');
    eq('4 unreadable stored choice falls back to default', t.sortMode('albums'), 'saved');
    store.removeItem('lib-sort-albums');

    store.setItem('lib-sort-playlists', JSON.stringify('songs'));
    var pls = [{ name: 'A', count: 3 }, { name: 'B' }, { name: 'C', count: 40 }, { name: 'D', count: 3 }];
    eq('4 playlists Most songs, missing count as 0, ties stable', names(t.sortList('playlists', pls)), ['C', 'A', 'D', 'B']);
    store.removeItem('lib-sort-playlists');

    store.setItem('lib-sort-d-episodes', JSON.stringify('oldest'));
    var eps = [{ name: 'e1', date: '2026-11-01' }, { name: 'e2', date: '' }, { name: 'e3', date: '2025-01-01' }];
    eq('4 episodes Oldest first, undated last', names(t.sortList('d-episodes', eps)), ['e3', 'e1', 'e2']);
    store.setItem('lib-sort-d-episodes', JSON.stringify('newest'));
    eq('4 episodes Newest first, undated last', names(t.sortList('d-episodes', eps)), ['e1', 'e3', 'e2']);
    store.removeItem('lib-sort-d-episodes');

    eq('4 unknown view: no mode, default, copy', [t.sortMode('nope'), t.sortIsDefault('nope'), names(t.sortList('nope', pls))], ['', true, ['A', 'B', 'C', 'D']]);

    store.removeItem('lib-sort-shows');
    store.setItem(t.K.showSort, JSON.stringify('az'));
    eq('4 Shows falls back to the v2.7 choice', t.sortMode('shows'), 'az');
    store.setItem('lib-sort-shows', JSON.stringify('saved'));
    eq('4 lib-sort-shows wins over the v2.7 choice', t.sortMode('shows'), 'saved');
    store.removeItem('lib-sort-shows'); store.removeItem(t.K.showSort);

    var undo = freeze(tab, NOW);
    var oldLatest = t.state.latest.cache;
    try {
      t.state.latest.cache = { items: [{ showId: 's2', date: '2026-11-26' }, { showId: 's3', date: '2026-11-10' }, { showId: 's2', date: '2026-10-01' }] };
      var shows = [{ id: 's1', name: 'One', sub: 'Podcast' }, { id: 's3', name: 'Three', sub: 'Podcast' }, { id: 's2', name: 'Two', sub: 'Podcast' }];
      var up = t.sortList('shows', shows);
      eq('4 Shows Recently updated: newest episode first, uncovered last', up.map(function (s) { return s.id; }), ['s2', 's3', 's1']);
      eq('4 Shows Recently updated says when', up[0].sub, 'Podcast · Latest Yesterday');
      eq('4 Shows Recently updated older date', up[1].sub, 'Podcast · Latest ' + t.fmtDate('2026-11-10'));
      check('4 Shows Recently updated leaves the saved rows alone', shows[2].sub === 'Podcast' && up[2] === shows[0]);
      t.state.latest.cache = null;
      check('4 Shows Recently updated without a feed keeps the order', JSON.stringify(t.sortList('shows', shows).map(function (s) { return s.id; })) === '["s1","s3","s2"]');
    } finally { t.state.latest.cache = oldLatest; undo(); }

    var a = [{ id: 'a', at: 100 }, { id: 'b', at: 300 }], b = [{ id: 'c', at: 300 }, { id: 'd' }, { id: 'e', at: 200 }];
    eq('4 byTime newest first, ties keep order, no time last', t.byTime([a, null, b]).map(function (x) { return x.id; }), ['b', 'c', 'e', 'a', 'd']);
    eq('4 byTime of nothing', t.byTime([]), []);
    check('4 no requests from sorting', tab.calls.length === 0, tab.calls);
  });
});

// 5. Link builders.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    eq('5 spotifyUrl prefers external_urls', t.spotifyUrl({ id: 't1', type: 'track', external_urls: { spotify: 'https://open.spotify.com/track/t1?si=x' } }), 'https://open.spotify.com/track/t1?si=x');
    eq('5 spotifyUrl track and episode', [t.spotifyUrl({ id: 't1', type: 'track' }), t.spotifyUrl({ id: 'e1', type: 'episode' })], ['https://open.spotify.com/track/t1', 'https://open.spotify.com/episode/e1']);
    eq('5 spotifyUrl no id is empty', t.spotifyUrl({ type: 'track', external_urls: {} }), '');

    eq('5 releaseUrl encodes the id and pages by 10', t.releaseUrl({ item: { id: 'a b/c' }, offset: 20 }), '/artists/a%20b%2Fc/albums?include_groups=album,single,compilation&limit=10&offset=20');
    eq('5 releaseUrl first page', t.releaseUrl({ item: { id: 'x1' }, offset: 0 }), '/artists/x1/albums?include_groups=album,single,compilation&limit=10&offset=0');

    var oldData = t.state.data;
    t.state.data = Object.assign({}, oldData || {}, { me: { id: 'me1' } });
    try {
      eq('5 detailUrl album', t.detailUrl({ kind: 'album', id: 'al 1' }), '/albums/al%201/tracks?limit=50&offset=0');
      eq('5 detailUrl liked', t.detailUrl({ kind: 'liked' }), '/me/tracks?limit=50&offset=0');
      eq('5 detailUrl own playlist', t.detailUrl({ kind: 'playlist', id: 'p/1', ownerId: 'me1' }), '/playlists/p%2F1/items?limit=50&offset=0');
      eq('5 detailUrl collaborative playlist', t.detailUrl({ kind: 'playlist', id: 'p2', ownerId: 'other', collaborative: true }), '/playlists/p2/items?limit=50&offset=0');
      eq('5 detailUrl someone else\'s playlist has none', t.detailUrl({ kind: 'playlist', id: 'p3', ownerId: 'other' }), null);
      eq('5 detailUrl show', t.detailUrl({ kind: 'show', id: 's1' }), '/shows/s1/episodes?limit=50&offset=0');
      eq('5 detailUrl saved episodes', t.detailUrl({ kind: 'episodes' }), '/me/episodes?limit=50&offset=0');
      eq('5 detailUrl track and artist have none', [t.detailUrl({ kind: 'track', id: 't' }), t.detailUrl({ kind: 'artist', id: 'a' })], [null, null]);
      eq('5 detailUrl playlist with unknown owner tries the list', t.detailUrl({ kind: 'playlist', id: 'p4' }), '/playlists/p4/items?limit=50&offset=0');
      t.state.data = Object.assign({}, oldData || {}, { me: null });
      eq('5 detailUrl playlist before profile data tries the list', t.detailUrl({ kind: 'playlist', id: 'p1', ownerId: 'other' }), '/playlists/p1/items?limit=50&offset=0');
    } finally { t.state.data = oldData; }

    var root = d(tab).documentElement, was = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    var dark = t.embedSrc('pl 1');
    root.setAttribute('data-theme', 'light');
    var light = t.embedSrc('pl 1');
    root.removeAttribute('data-theme');
    var system = t.embedSrc('pl1');   // matchMedia says light in this harness
    if (was != null) root.setAttribute('data-theme', was);
    eq('5 embedSrc dark theme', dark, 'https://open.spotify.com/embed/playlist/pl%201?utm_source=generator&theme=0');
    eq('5 embedSrc light theme', light, 'https://open.spotify.com/embed/playlist/pl%201?utm_source=generator');
    eq('5 embedSrc follows the phone when unset', system, 'https://open.spotify.com/embed/playlist/pl1?utm_source=generator');
    check('5 no requests from link builders', tab.calls.length === 0, tab.calls);
  });
});

// 6. Mappers from Spotify objects to rows.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t();
    var imgs = [{ url: 'big', width: 640, height: 640 }, { url: 'mid', width: 300, height: 300 }, { url: 'small', width: 64, height: 64 }];
    var tr = { id: 't1', uri: 'spotify:track:t1', name: 'Song', type: 'track', duration_ms: 200000,
      artists: [{ name: 'A' }, null, { name: '' }, { name: 'B' }], album: { name: 'LP', images: imgs } };
    var m = t.mapTrack(tr);
    eq('6 mapTrack song row', { kind: m.kind, url: m.url, sub: m.sub, artist: m.artist, durMs: m.durMs, img: m.img },
      { kind: 'track', url: 'https://open.spotify.com/track/t1', sub: 'Song · A, B · LP', artist: 'A, B', durMs: 200000, img: 'mid' });
    eq('6 mapTrack missing id, uri or object is null', [t.mapTrack(null), t.mapTrack({ id: 'x' }), t.mapTrack({ uri: 'spotify:track:x' })], [null, null, null]);
    var bare = t.mapTrack({ id: 't2', uri: 'spotify:track:t2' });
    eq('6 mapTrack defaults', { name: bare.name, sub: bare.sub, img: bare.img, durMs: bare.durMs }, { name: 'Untitled', sub: 'Song · ', img: '', durMs: 0 });
    var o = t.mapTrack(tr, { sub: 'Custom', noImg: true, num: 4, ctx: 'spotify:album:a1' });
    eq('6 mapTrack options', { sub: o.sub, img: o.img, num: o.num, ctx: o.ctx }, { sub: 'Custom', img: '', num: 4, ctx: 'spotify:album:a1' });
    var ep = t.mapTrack({ id: 'e1', uri: 'spotify:episode:e1', type: 'episode', name: 'Ep', show: { name: 'Show', images: [{ url: 'showimg' }] } });
    eq('6 mapTrack episode', { kind: ep.kind, url: ep.url, sub: ep.sub, img: ep.img, artist: ep.artist },
      { kind: 'episode', url: 'https://open.spotify.com/episode/e1', sub: 'Episode · Show', img: 'showimg', artist: 'Show' });
    eq('6 mapTrack episode without a show', t.mapTrack({ id: 'e2', uri: 'spotify:episode:e2', type: 'episode' }).sub, 'Episode · Podcast');
    eq('6 cover pick: all big takes the last', t.mapTrack({ id: 't3', uri: 'u', album: { images: [{ url: 'x', width: 900 }, { url: 'y', width: 640 }] } }).img, 'y');
    eq('6 cover pick: no width counts as small', t.mapTrack({ id: 't4', uri: 'u', album: { images: [{ url: 'x' }, { url: 'y', width: 64 }] } }).img, 'x');

    var p = t.mapPlaylist({ id: 'p1', uri: 'spotify:playlist:p1', name: 'Mix', collaborative: 1, owner: { id: 'u1', display_name: 'Rae' }, items: { total: 12 }, images: imgs });
    eq('6 mapPlaylist row', { kind: p.kind, url: p.url, sub: p.sub, count: p.count, ownerId: p.ownerId, collaborative: p.collaborative, img: p.img },
      { kind: 'playlist', url: 'https://open.spotify.com/playlist/p1', sub: 'Playlist · Rae · 12 songs', count: 12, ownerId: 'u1', collaborative: true, img: 'mid' });
    eq('6 mapPlaylist older tracks.total', t.mapPlaylist({ id: 'p2', tracks: { total: 7 } }).count, 7);
    var p0 = t.mapPlaylist({ id: 'p3' });
    eq('6 mapPlaylist empty and unnamed', { name: p0.name, sub: p0.sub, count: p0.count, ownerId: p0.ownerId, collaborative: p0.collaborative }, { name: 'Untitled', sub: 'Playlist', count: 0, ownerId: '', collaborative: false });
    eq('6 mapPlaylist missing id is null', [t.mapPlaylist(null), t.mapPlaylist({ name: 'x' })], [null, null]);

    eq('6 mapArtist with a genre', t.mapArtist({ id: 'a1', uri: 'spotify:artist:a1', name: 'Band', genres: ['indie', 'rock'] }).sub, 'Artist · indie');
    var ar = t.mapArtist({ id: 'a2', name: 'Solo', genres: [] });
    eq('6 mapArtist without genres', { sub: ar.sub, url: ar.url, kind: ar.kind }, { sub: 'Artist', url: 'https://open.spotify.com/artist/a2', kind: 'artist' });
    eq('6 mapArtist missing id is null', t.mapArtist({ name: 'x' }), null);

    eq('6 mapShow episode counts, singular and plural', [t.mapShow({ id: 's', total_episodes: 1 }).sub, t.mapShow({ id: 's', total_episodes: 0 }).sub, t.mapShow({ id: 's', total_episodes: 250 }).sub],
      ['Podcast · 1 episode', 'Podcast · 0 episodes', 'Podcast · 250 episodes']);
    eq('6 mapShow publisher when no count', t.mapShow({ id: 's', publisher: 'Pub' }).sub, 'Podcast · Pub');
    var sh = t.mapShow({ id: 's9', uri: 'spotify:show:s9' });
    eq('6 mapShow bare', { name: sh.name, sub: sh.sub, url: sh.url }, { name: 'Untitled', sub: 'Podcast', url: 'https://open.spotify.com/show/s9' });
    eq('6 mapShow missing id is null', t.mapShow({}), null);
  });
});

// 7. Song and episode list rows (mapDetail, mapRaw) and the minimal saved copies (slTrack, slEpisode, smallImages).
tests.push(function () {
  var store = H.seedStore();
  var now = Date.now();
  store.setItem('lib-ep-history', JSON.stringify([
    { uri: 'spotify:episode:h1', id: 'h1', name: 'Heard', show: { id: 's1', name: 'Show', images: [] }, duration_ms: HOUR, positionMs: 20 * MIN, played: false, at: now - 5 * MIN },
    { uri: 'spotify:episode:h2', id: 'h2', name: 'Done', show: { id: 's1', name: 'Show', images: [] }, duration_ms: HOUR, positionMs: 0, played: true, at: now - 5 * MIN }
  ]));
  return setup(store).then(function (tab) {
    var t = tab.t();
    var oldData = t.state.data;
    t.state.data = Object.assign({}, oldData || {}, { me: { id: 'me1' } });
    try {
      var album = { kind: 'album', id: 'al1', uri: 'spotify:album:al1', name: 'The LP' };
      var at = t.mapDetail(album, { id: 't1', uri: 'spotify:track:t1', name: 'Song', track_number: 3, artists: [{ name: 'A' }, { name: 'B' }], duration_ms: 1000 });
      eq('7 album row: number, artists, context, album name, no cover',
        { num: at.num, sub: at.sub, ctx: at.ctx, albumName: at.albumName, img: at.img }, { num: 3, sub: 'A, B', ctx: 'spotify:album:al1', albumName: 'The LP', img: '' });
      eq('7 null row is null', t.mapDetail(album, null), null);

      var pl = { kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1' };
      var pr = t.mapDetail(pl, { added_at: '2026-11-01T00:00:00Z', item: { id: 't2', uri: 'spotify:track:t2', name: 'S2', type: 'track', artists: [{ name: 'X' }], album: { name: 'Alb', images: [] } } });
      eq('7 playlist row', { sub: pr.sub, ctx: pr.ctx, added: pr.added, albumName: pr.albumName }, { sub: 'X · Alb', ctx: 'spotify:playlist:p1', added: '2026-11-01T00:00:00Z', albumName: 'Alb' });
      eq('7 playlist row from the older track field', t.mapDetail(pl, { track: { id: 't3', uri: 'spotify:track:t3', artists: [] } }).id, 't3');
      eq('7 local file and empty row are skipped', [t.mapDetail(pl, { is_local: true, track: { id: 'l', uri: 'spotify:local:x' } }), t.mapDetail(pl, { added_at: 'x' })], [null, null]);
      var pe = t.mapDetail(pl, { item: { id: 'e5', uri: 'spotify:episode:e5', type: 'episode', show: { name: 'Pod' } } });
      eq('7 episode in a playlist shows its podcast', { kind: pe.kind, sub: pe.sub }, { kind: 'episode', sub: 'Pod' });
      check('7 a playlist row is not marked saved', t.state.saved['spotify:track:t2'] === undefined);

      delete t.state.saved['spotify:track:t9'];
      var lr = t.mapDetail({ kind: 'liked' }, { added_at: '2026-10-10T00:00:00Z', track: { id: 't9', uri: 'spotify:track:t9', artists: [{ name: 'Q' }] } });
      eq('7 Liked Songs row plays in your Liked Songs', lr.ctx, 'spotify:user:me1:collection');
      check('7 Liked Songs row is marked saved', t.state.saved['spotify:track:t9'] === true);
      t.state.saved['spotify:track:t8'] = false;
      t.mapDetail({ kind: 'liked' }, { track: { id: 't8', uri: 'spotify:track:t8', artists: [] } });
      check('7 a known unsaved state is not overwritten', t.state.saved['spotify:track:t8'] === false);

      var undo = freeze(tab, NOW);
      try {
        var se = t.mapDetail({ kind: 'show', id: 's1' }, { id: 'e1', uri: 'spotify:episode:e1', name: 'Ep', release_date: '2026-11-18', duration_ms: HOUR,
          show: { name: 'Show' }, resume_point: { fully_played: false, resume_position_ms: 15 * MIN } });
        eq('7 show row: date and time left', { kind: se.kind, sub: se.sub, date: se.date, positionMs: se.positionMs, played: se.played },
          { kind: 'episode', sub: 'Episode · ' + t.fmtDate('2026-11-18') + ' · 45 min left', date: '2026-11-18', positionMs: 15 * MIN, played: false });
        var sp = t.mapDetail({ kind: 'show', id: 's1' }, { id: 'e2', uri: 'spotify:episode:e2', name: 'Ep2', release_date: '', duration_ms: 30 * MIN, show: { name: 'Show' }, resume_point: { fully_played: true, resume_position_ms: 0 } });
        eq('7 show row played, no date falls back to show name', sp.sub, 'Episode · Show · Played');
        delete t.state.saved['spotify:episode:e3'];
        var ee = t.mapDetail({ kind: 'episodes' }, { episode: { id: 'e3', uri: 'spotify:episode:e3', name: 'E3', release_date: '2026-11-01', duration_ms: 20 * MIN, show: { name: 'Pod' } } });
        eq('7 Saved episodes row names the show', ee.sub, 'Episode · Pod · 20 min');
        check('7 Saved episodes row is marked saved', t.state.saved['spotify:episode:e3'] === true);
        eq('7 Saved episodes empty row is null', t.mapDetail({ kind: 'episodes' }, { episode: null }), null);
      } finally { undo(); }

      var dshow = { item: { kind: 'show', id: 's1' }, checkedAt: now - HOUR };
      var raw1 = { id: 'h1', uri: 'spotify:episode:h1', name: 'Heard', release_date: '2026-11-01', duration_ms: HOUR, resume_point: { fully_played: false, resume_position_ms: 0 } };
      var r1 = t.mapRaw(dshow, raw1);
      eq('7 mapRaw takes the newer position heard by the page', r1.positionMs, 20 * MIN);
      check('7 mapRaw does not change the saved copy', raw1.resume_point.resume_position_ms === 0);
      var r2 = t.mapRaw(dshow, { id: 'h2', uri: 'spotify:episode:h2', name: 'Done', duration_ms: HOUR, resume_point: { fully_played: false, resume_position_ms: 10 * MIN } });
      check('7 mapRaw takes played from the page\'s history', r2.played === true && /Played$/.test(r2.sub), r2.sub);
      var r3 = t.mapRaw({ item: { kind: 'show', id: 's1' }, checkedAt: now + MIN }, raw1);
      eq('7 mapRaw keeps Spotify\'s position when it was checked later', r3.positionMs, 0);
      var r4 = t.mapRaw({ item: { kind: 'album', id: 'al1', uri: 'spotify:album:al1', name: 'LP' } }, { id: 't1', uri: 'spotify:track:t1', track_number: 2, artists: [] });
      eq('7 mapRaw for an album is mapDetail', { num: r4.num, ctx: r4.ctx }, { num: 2, ctx: 'spotify:album:al1' });
    } finally { t.state.data = oldData; }

    var st = t.slTrack({ id: 't1', uri: 'spotify:track:t1', name: 'S', artists: [{ name: 'A', id: 'a1', href: 'h' }, null], track_number: 5, disc_number: 2, duration_ms: 9000, album: { name: 'x' }, available_markets: ['US'] });
    eq('7 slTrack keeps only what rows need', st, { id: 't1', uri: 'spotify:track:t1', name: 'S', artists: [{ name: 'A' }, { name: '' }], track_number: 5, disc_number: 2, duration_ms: 9000 });
    eq('7 slTrack defaults', t.slTrack({ id: 't2', uri: 'u' }), { id: 't2', uri: 'u', name: '', artists: [], track_number: 0, disc_number: 1, duration_ms: 0 });

    var se2 = t.slEpisode({ id: 'e1', uri: 'spotify:episode:e1', name: 'E', release_date: '2026-11-01', duration_ms: 5000, html_description: '<p>long</p>',
      images: [{ url: 'big', width: 640, height: 640 }, { url: 'small', width: 64, height: 64 }], resume_point: { fully_played: 0, resume_position_ms: 1234 } });
    eq('7 slEpisode keeps a small cover and the resume point', se2, { id: 'e1', uri: 'spotify:episode:e1', name: 'E', release_date: '2026-11-01', duration_ms: 5000, images: [{ url: 'small' }], resume_point: { fully_played: false, resume_position_ms: 1234 } });
    var se3 = t.slEpisode({ id: 'e2', uri: 'u', images: [], show: { images: [{ url: 'showimg', width: 300 }] }, resume_point: { fully_played: true } });
    eq('7 slEpisode falls back to the show cover', se3.images, [{ url: 'showimg' }]);
    eq('7 slEpisode resume point defaults', se3.resume_point, { fully_played: true, resume_position_ms: 0 });
    var se4 = t.slEpisode({ id: 'e3', uri: 'u' });
    check('7 slEpisode without resume point or images', !('resume_point' in se4) && JSON.stringify(se4.images) === '[]' && se4.release_date === '' && se4.name === '', se4);

    eq('7 smallImages none', [t.smallImages(null), t.smallImages([])], [[], []]);
    eq('7 smallImages first small one', t.smallImages([{ url: 'a', width: 640, height: 640 }, { url: 'b', width: 300, height: 300 }, { url: 'c', width: 64, height: 64 }]), [{ url: 'b', width: 300, height: 300 }]);
    eq('7 smallImages unknown size', t.smallImages([{ url: 'a' }]), [{ url: 'a', width: null, height: null }]);
    eq('7 smallImages all big takes the last', t.smallImages([{ url: 'a', width: 900 }, { url: 'b', width: 640, height: 640 }]), [{ url: 'b', width: 640, height: 640 }]);
    eq('7 smallImages without a url', t.smallImages([{ width: 64 }]), []);
    check('7 no requests from list mappers', tab.calls.length === 0, tab.calls);
  });
});

// 8. HTML-building helpers: text stays text.
tests.push(function () {
  return setup().then(function (tab) {
    var t = tab.t(), doc = d(tab);
    var HOSTILE = '<img src="x" onerror="window.__xss = 1"><b>bold</b>';
    var n = t.el('div', { text: HOSTILE, class: 'a b', 'data-x': 'say "hi" <b>', 'data-zero': 0, 'data-null': null, title: undefined });
    check('8 el text is inserted as text', n.children.length === 0 && n.textContent === HOSTILE, n.innerHTML);
    eq('8 el class and attributes', [n.className, n.getAttribute('data-x'), n.getAttribute('data-zero')], ['a b', 'say "hi" <b>', '0']);
    check('8 el skips null and undefined attributes', !n.hasAttribute('data-null') && !n.hasAttribute('title') && !n.hasAttribute('text'));
    var kids = t.el('ul', null, [t.el('li', { text: 'one' }), null, undefined, t.el('li', { text: 'two' })]);
    eq('8 el appends kids, skipping empty ones', [kids.tagName, kids.children.length, kids.textContent], ['UL', 2, 'onetwo']);
    eq('8 el empty text', t.el('span', { text: '' }).textContent, '');

    var s = t.svg('<path d="M0 0"/>');
    check('8 svg wraps the icon, hidden from screen readers', /^<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M0 0"\/><\/svg>$/.test(s), s);

    var got = [];
    var b = t.iconBtn(t.svg('<circle r="1"/>'), 'Add “' + HOSTILE + '” to queue', function (ev) { got.push(ev.type); });
    doc.body.appendChild(b);
    check('8 iconBtn is a button with the label as an attribute', b.tagName === 'BUTTON' && b.type === 'button' && b.getAttribute('aria-label') === 'Add “' + HOSTILE + '” to queue');
    check('8 iconBtn label adds no elements', b.querySelectorAll('img, b').length === 0 && b.querySelectorAll('svg').length === 1);
    click(tab, b);
    eq('8 iconBtn tap runs its action', got, ['click']);
    b.remove();

    eq('8 coverFor artist is round', t.coverFor({ kind: 'artist', img: 'pic' }).className, 'cover round');
    var ci = t.coverFor({ kind: 'album', img: 'https://i/1' }, 'big');
    eq('8 coverFor picture', [ci.tagName, ci.getAttribute('src'), ci.getAttribute('alt'), ci.className], ['IMG', 'https://i/1', '', 'cover big']);
    var cn = t.coverFor({ kind: 'playlist', img: '' });
    eq('8 coverFor no picture is an empty hidden box', [cn.tagName, cn.getAttribute('aria-hidden'), cn.className], ['DIV', 'true', 'cover']);
    var cl = t.coverFor({ kind: 'liked' }, 'big');
    eq('8 coverFor Liked Songs heart', [cl.className, cl.textContent], ['cover liked big', '♥']);
    var ce = t.coverFor({ kind: 'episodes' });
    check('8 coverFor Saved episodes icon', ce.className === 'cover eps' && ce.querySelector('svg') !== null);
    var cnum = t.coverFor({ kind: 'track', num: 0, img: 'x' });
    eq('8 coverFor track number (even 0) replaces the picture', [cnum.className, cnum.textContent], ['cover num', '0']);

    var item = t.mapTrack({ id: 'tx', uri: 'spotify:track:tx', type: 'track', name: HOSTILE, artists: [{ name: '<i>Artist</i>' }], album: { name: 'A&B', images: [] } });
    var li = t.itemRow(item);
    doc.body.appendChild(li);
    var nameNode = li.querySelector('.name'), subNode = li.querySelector('.sub');
    check('8 a row shows a hostile name as text', nameNode && nameNode.textContent === HOSTILE && nameNode.children.length === 0, nameNode && nameNode.innerHTML);
    check('8 a row shows a hostile artist as text', subNode && subNode.textContent.indexOf('<i>Artist</i> · A&B') >= 0 && !li.querySelector('i'), subNode && subNode.innerHTML);
    check('8 a row adds no image from the name', li.querySelectorAll('img').length === 0 && !li.querySelector('b'));
    var acts = [].slice.call(li.querySelectorAll('button[aria-label]')).map(function (x) { return x.getAttribute('aria-label'); });
    check('8 row buttons carry the name in their labels', acts.some(function (l) { return l.indexOf(HOSTILE) >= 0; }), acts);
    li.remove();
    return H.wait(50).then(function () {
      check('8 nothing in the text ran', tab.w.__xss === undefined);
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
