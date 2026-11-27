'use strict';
// Keep Spotify's "not playable" marks (v2.49): Recent's listening log and Liked songs by an artist, plus a check
// that saved playlists (v2.37, plPack / plUnpack) still keep them.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var IMG = 'https://i.scdn.co/image/ab67616d00004851';
var DAY = 24 * 60 * 60 * 1000;
// Song n. mark: 'market' (restrictions only: dimmed, still tappable), 'gone' (is_playable false: dimmed, blocked),
// 'both' (is_playable false with restrictions.reason explicit), or nothing.
function songObj(n, mark, artists) {
  var t = { type: 'track', id: 'T' + n, uri: 'spotify:track:T' + n, name: 'Track ' + n, duration_ms: 180000 + n,
    artists: artists || [{ id: 'ar2', name: 'Other' }], album: { id: 'al' + n, name: 'Record ' + n, release_date: '2020-01-01', images: [{ url: IMG + 'cover' + n, width: 300 }] } };
  if (mark === 'market') t.restrictions = { reason: 'market' };
  if (mark === 'gone') t.is_playable = false;
  if (mark === 'both') { t.is_playable = false; t.restrictions = { reason: 'explicit' }; }
  return t;
}
var MARKS = { 1: 'market', 2: 'gone', 3: 'both' };
function plEntry(n) { return { added_at: '2026-01-10T00:00:00Z', is_local: false, item: songObj(n, MARKS[n]) }; }
// env: content (playlist items), recent (recently played items), liked (Liked Songs entries)
function setup(store, env) {
  env = env || {};
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    var off = +(q.get('offset') || 0);
    if (method === 'GET' && path === '/me') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (method === 'GET' && path === '/me/playlists') return { status: 200, json: { items: [{ id: 'p1', name: 'Road trip', uri: 'spotify:playlist:p1', images: [],
      owner: { id: 'me1', display_name: 'R' }, collaborative: false, snapshot_id: 'S1', items: { total: (env.content || []).length } }], next: null, total: 1 } };
    if (method === 'GET' && path === '/playlists/p1/items') {
      var c = env.content || [];
      return { status: 200, json: { items: c.slice(off, off + 50), total: c.length, offset: off, limit: 50, next: null } };
    }
    if (path === '/me/player/recently-played') return { status: 200, json: { items: env.recent || [] } };
    if (method === 'GET' && path === '/me/tracks') { var l = env.liked || []; return { status: 200, json: { items: l, total: l.length, offset: 0, limit: 50, next: null } }; }
    if (method === 'GET' && path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    t.state.recentTriedAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function doc(tab) { return tab.w.document; }
function done(tab) { try { tab.w.close(); } catch (e) {} }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function plays(tab) { return tab.calls.filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; }); }
function rowByName(tab, sel, name) { return [].slice.call(doc(tab).querySelectorAll(sel + ' li.row')).filter(function (li) { var n = li.querySelector('.name'); return n && n.textContent === name; })[0]; }
function subOf(li) { return li ? li.querySelector('.sub').textContent : null; }
function seed(extra) {
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify('home'));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}
function logStore(store) { var v = store.getItem('lib-play-log'); return v ? JSON.parse(v) : null; }
function rp(n, at, mark) { return { track: songObj(n, mark), played_at: new Date(at).toISOString(), context: null }; }
// Taps a row and resolves after the click settles; returns [toasts, play requests] seen during the tap.
function tap(tab, li) {
  tab.calls.length = 0; tab.w.__toasts = [];
  click(tab, li.querySelector('a.item'));
  return H.wait(150).then(function () { return { toasts: tab.toasts().slice(), plays: plays(tab).length }; });
}

var tests = [];

// 1. The mark helpers: compact, only when present, and read back the same way as Spotify's own fields.
tests.push(function () {
  return setup(seed(), {}).then(function (tab) {
    var t = tab.t();
    check('1 unmarked song has no mark', t.nopeMark(songObj(0)) === '');
    check('1 restrictions only', t.nopeMark(songObj(1, 'market')) === 'market');
    check('1 is_playable false only', t.nopeMark(songObj(2, 'gone')) === '!');
    check('1 both', t.nopeMark(songObj(3, 'both')) === '!explicit');
    check('1 long or odd reason is cut and cleaned', t.nopeMark({ restrictions: { reason: 'a reason "with"\nodd <chars> that is long' } }) === 'areasonwithoddcharst', t.nopeMark({ restrictions: { reason: 'a reason "with"\nodd <chars> that is long' } }));
    check('1 reason with nothing left still dims', t.unplayableWhy(t.nopeMarkOnto({}, t.nopeMark({ restrictions: { reason: '"""' } }))) === 'Not available');
    [0, 1, 2, 3].forEach(function (n) {
      var s = songObj(n, MARKS[n]), b = t.nopeMarkOnto({}, t.nopeMark(s));
      check('1 round trip ' + (MARKS[n] || 'none') + ': same reason', t.unplayableWhy(b) === t.unplayableWhy(s), [t.unplayableWhy(b), t.unplayableWhy(s)]);
      check('1 round trip ' + (MARKS[n] || 'none') + ': same can-play', (b.is_playable === false) === (s.is_playable === false));
    });
    check('1 nopeMarkOnto ignores junk', JSON.stringify(t.nopeMarkOnto({}, 5)) === '{}' && JSON.stringify(t.nopeMarkOnto({}, '')) === '{}');
    done(tab);
  });
});

// 2. Saved playlist (already on main): plPack / plUnpack give mapTrack the same nope / noPlay.
tests.push(function () {
  return setup(seed(), {}).then(function (tab) {
    var t = tab.t(), parent = { kind: 'playlist', id: 'p1', uri: 'spotify:playlist:p1', name: 'Road trip' };
    [0, 1, 2, 3].forEach(function (n) {
      var src = plEntry(n), pk = t.plPack(src);
      var a = t.mapDetail(parent, src), b = t.mapDetail(parent, t.plUnpack(JSON.parse(JSON.stringify(pk))));
      check('2 song ' + n + ' nope kept', a.nope === b.nope, [a.nope, b.nope]);
      check('2 song ' + n + ' noPlay kept', a.noPlay === b.noPlay, [a.noPlay, b.noPlay]);
      check('2 song ' + n + ' stored mark only when present', n === 0 ? !('x' in pk) && !('p' in pk) : ('x' in pk) || pk.p === 0, pk);
    });
    done(tab);
  });
});

// 3. Saved-playlist round trip in the page: first visit saves, second visit opens the saved copy (no request);
// marked rows stay dimmed, an is_playable:false row blocks a tap, unmarked rows play as before.
tests.push(function () {
  var store = seed(), env = { content: [0, 1, 2, 3, 4].map(plEntry) };
  return setup(store, env).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.state.data.playlists.filter(function (p) { return p.id === 'p1'; })[0]);
    return H.wait(150).then(function () {
      var c = JSON.parse(store.getItem('lib-pl-saved') || '{}').p1;
      check('3 first visit saved the playlist', c && c.n.length === 5, c);
      check('3 saved marks only on marked songs', c && JSON.stringify(c.n.map(function (o) { return (o.p === 0 ? '!' : '') + (o.x || ''); })) === JSON.stringify(['', 'market', '!', '!explicit', '']), c && c.n);
      done(tab);
    });
  }).then(function () {
    return setup(store, env).then(function (tab) {
      var t = tab.t();
      t.openDetail(t.state.data.playlists.filter(function (p) { return p.id === 'p1'; })[0]);
      return H.wait(150).then(function () {
        var d = t.state.detail;
        check('3 second visit: opened from the saved copy (no playlist request)', d.plSavedAt > 0 && tab.calls.filter(function (c) { return c.path === '/playlists/p1/items'; }).length === 0, tab.calls.map(function (c) { return c.path; }));
        var r0 = rowByName(tab, '#dlist', 'Track 0'), r1 = rowByName(tab, '#dlist', 'Track 1'), r2 = rowByName(tab, '#dlist', 'Track 2'), r3 = rowByName(tab, '#dlist', 'Track 3');
        check('3 unmarked row not dimmed', r0 && !r0.classList.contains('nope') && !/Not available/.test(subOf(r0)), subOf(r0));
        check('3 restrictions row dimmed with its reason', r1 && r1.classList.contains('nope') && /Not available in your country$/.test(subOf(r1)), subOf(r1));
        check('3 is_playable:false row dimmed', r2 && r2.classList.contains('nope') && /Not available$/.test(subOf(r2)), subOf(r2));
        check('3 both: reason from restrictions', r3 && r3.classList.contains('nope') && /Explicit content is off$/.test(subOf(r3)), subOf(r3));
        return tap(tab, r2).then(function (x) {
          check('3 tap on is_playable:false row: reason toast, no play request', x.plays === 0 && x.toasts.indexOf('Not available.') !== -1, x);
          return tap(tab, r3);
        }).then(function (x) {
          check('3 tap on the explicit row: its reason, no play request', x.plays === 0 && x.toasts.indexOf('Explicit content is off.') !== -1, x);
          return tap(tab, r1);
        }).then(function (x) {
          check('3 restrictions-only row still tries to play', x.plays === 1, x);
          return tap(tab, r0);
        }).then(function (x) {
          check('3 unmarked row plays as before', x.plays === 1 && JSON.stringify(plays(tab)[0].body || null) !== 'null', x);
          done(tab);
        });
      });
    });
  });
});

// 4. Recent: songs in Spotify's latest answer carry the marks; the log stores a mark only for marked songs.
tests.push(function () {
  var now = Date.now(), store = seed();
  var recent = [rp(10, now - 60000), rp(11, now - 120000, 'market'), rp(12, now - 180000, 'gone'), rp(13, now - 240000, 'both')];
  return setup(store, { recent: recent }).then(function (tab) {
    var t = tab.t();
    t.setFilter('recent');
    return H.wait(300).then(function () {
      var L = logStore(store);
      check('4 log saved', L && L.e.length === 4, L);
      check('4 unmarked song: 4 fields, as before', L && L.t.T10.length === 4, L && L.t.T10);
      check('4 marked songs: a 5th field with the mark', L && L.t.T11[4] === 'market' && L.t.T12[4] === '!' && L.t.T13[4] === '!explicit', L && [L.t.T11, L.t.T12, L.t.T13]);
      var r10 = rowByName(tab, '#main', 'Track 10'), r11 = rowByName(tab, '#main', 'Track 11'), r12 = rowByName(tab, '#main', 'Track 12'), r13 = rowByName(tab, '#main', 'Track 13');
      check('4 unmarked row unchanged', r10 && !r10.classList.contains('nope') && subOf(r10) === 'Song · Other · Record 10 · 1 min ago', subOf(r10));
      check('4 restrictions row dimmed with reason', r11 && r11.classList.contains('nope') && / · Not available in your country$/.test(subOf(r11)), subOf(r11));
      check('4 is_playable:false row dimmed', r12 && r12.classList.contains('nope') && / · Not available$/.test(subOf(r12)), subOf(r12));
      check('4 both: explicit reason', r13 && r13.classList.contains('nope') && / · Explicit content is off$/.test(subOf(r13)), subOf(r13));
      var items = t.logRows(), by = {};
      items.forEach(function (i) { by[i.id] = i; });
      check('4 logItem returns nope/noPlay like mapTrack', ['T10', 'T11', 'T12', 'T13'].every(function (id, k) {
        var m = t.mapTrack(recent[k].track); return by[id].nope === m.nope && by[id].noPlay === m.noPlay;
      }), items.map(function (i) { return [i.id, i.nope, i.noPlay]; }));
      check('4 unmarked item has no nope/noPlay', by.T10.nope === undefined && by.T10.noPlay === undefined);
      return tap(tab, r12).then(function (x) {
        check('4 tap on is_playable:false row: toast, no play', x.plays === 0 && x.toasts.indexOf('Not available.') !== -1, x);
        return tap(tab, r10);
      }).then(function (x) {
        check('4 unmarked row plays', x.plays === 1, x);
        done(tab);
      });
    });
  });
});

// 5. Persisted older entries (not in the latest answer) stay dimmed and blocked; change detection follows the mark.
tests.push(function () {
  var now = Date.now(), old = now - 3 * DAY;
  var stored = { e: [[old, 'T20'], [old - 60000, 'T21'], [old - 120000, 'T22']], t: {
    T20: ['Old marked', 'Band', 'Rec', 'c20', '!market'], T21: ['Old dim', 'Band', 'Rec', 'c21', 'product'], T22: ['Old plain', 'Band', 'Rec', 'c22'] } };
  var store = seed({ 'lib-play-log': stored });
  var writes = 0, orig = store.setItem;
  store.setItem = function (k, v) { if (k === 'lib-play-log') writes++; return orig.call(store, k, v); };
  return setup(store, { recent: [rp(30, now - 60000)] }).then(function (tab) {
    var t = tab.t();
    t.setFilter('recent');
    return H.wait(300).then(function () {
      var a = rowByName(tab, '#main', 'Old marked'), b = rowByName(tab, '#main', 'Old dim'), c = rowByName(tab, '#main', 'Old plain');
      check('5 older blocked entry dimmed with its reason', a && a.classList.contains('nope') && / · Not available in your country$/.test(subOf(a)), subOf(a));
      check('5 older restrictions-only entry dimmed', b && b.classList.contains('nope') && / · Not available on your plan$/.test(subOf(b)), subOf(b));
      check('5 older unmarked entry unchanged', c && !c.classList.contains('nope') && !/Not available/.test(subOf(c)), subOf(c));
      return tap(tab, a).then(function (x) {
        check('5 tap on older blocked entry: toast, no play', x.plays === 0 && x.toasts.indexOf('Not available in your country.') !== -1, x);
        return tap(tab, b);
      }).then(function (x) {
        check('5 tap on older restrictions-only entry still plays', x.plays === 1, x);
        // Same answer again: nothing changed, so nothing is written.
        writes = 0;
        t.logMerge([rp(30, now - 60000)]);
        check('5 same answer: no storage write', writes === 0, writes);
        // Spotify now marks song 30: the meta changes and is written once.
        t.logMerge([rp(30, now - 60000, 'gone')]);
        var L = logStore(store);
        check('5 newly marked song: stored mark, one write', writes === 1 && L.t.T30[4] === '!', [writes, L.t.T30]);
        writes = 0;
        t.logMerge([rp(30, now - 60000, 'gone')]);
        check('5 same marked answer: no write', writes === 0, writes);
        // Spotify no longer marks it: the mark goes.
        t.logMerge([rp(30, now - 60000)]);
        L = logStore(store);
        check('5 mark cleared when Spotify stops marking it', writes === 1 && L.t.T30.length === 4, [writes, L.t.T30]);
        // Latest answer wins over the stored meta for display (this visit's logFull).
        t.logMerge([{ track: Object.assign(songObj(20), { name: 'Old marked' }), played_at: new Date(old).toISOString() }]);
        var it = t.logRows().filter(function (i) { return i.id === 'T20'; })[0];
        check('5 song back in the latest answer unmarked: row no longer dimmed', it && it.nope === undefined && it.noPlay === undefined, it);
        check('5 and its stored mark is dropped', logStore(store).t.T20.length === 4, logStore(store).t.T20);
        done(tab);
      });
    });
  });
});

// 6. Liked songs by an artist: Play and Shuffle leave out songs Spotify says can't play; none playable -> toast.
function likedEntry(n, mark) { return { added_at: new Date(Date.UTC(2026, 0, 1) + (1000 - n) * 60000).toISOString(), track: songObj(n, mark, [{ id: 'ar1', name: 'Nova' }]) }; }
function likedBy() { return { kind: 'likedby', artistId: 'ar1', artistName: 'Nova', name: 'Liked songs by Nova', uri: null, url: 'https://open.spotify.com/artist/ar1', img: '', sub: 'From your Liked Songs', uris: [] }; }
function openLikedBy(tab) {
  var t = tab.t();
  t.openDetail({ kind: 'liked', name: 'Liked Songs', uri: null, url: 'https://open.spotify.com/collection/tracks', sub: 'Playlist' });
  return H.wait(200).then(function () { t.closeDetail(); t.openDetail(likedBy()); return H.wait(150); });
}
function headBtn(tab, text) { return [].slice.call(doc(tab).querySelectorAll('.dhead a.btn')).filter(function (a) { return a.textContent === text; })[0]; }
tests.push(function () {
  var env = { liked: [likedEntry(40), likedEntry(41, 'gone'), likedEntry(42, 'market'), likedEntry(43)] };
  return setup(seed(), env).then(function (tab) {
    var t = tab.t();
    return openLikedBy(tab).then(function () {
      var d = t.state.detail;
      check('6 list has all 4 songs', d && d.item.kind === 'likedby' && d.items.length === 4, d && d.items && d.items.length);
      check('6 Play list leaves out the is_playable:false song', d && JSON.stringify(d.item.uris) === JSON.stringify(['spotify:track:T40', 'spotify:track:T42', 'spotify:track:T43']), d && d.item.uris);
      var r42 = d.items.filter(function (i) { return i.id === 'T42'; })[0];
      check('6 a row plays from itself, then wraps (marked song left out)', r42 && JSON.stringify(r42.uris) === JSON.stringify(['spotify:track:T42', 'spotify:track:T43', 'spotify:track:T40']), r42 && r42.uris);
      tab.calls.length = 0;
      click(tab, headBtn(tab, 'Play'));
      return H.wait(200).then(function () {
        var p = plays(tab)[0];
        check('6 Play sends only playable songs', p && p.body && JSON.stringify(p.body.uris) === JSON.stringify(['spotify:track:T40', 'spotify:track:T42', 'spotify:track:T43']), p && p.body);
        tab.calls.length = 0;
        click(tab, headBtn(tab, 'Shuffle'));
        return H.wait(200);
      }).then(function () {
        var p = plays(tab)[0];
        check('6 Shuffle sends only playable songs', p && p.body && p.body.uris.length === 3 && p.body.uris.indexOf('spotify:track:T41') === -1, p && p.body);
        done(tab);
      });
    });
  });
});
tests.push(function () {
  var env = { liked: [likedEntry(50, 'gone'), likedEntry(51, 'both')] };
  return setup(seed(), env).then(function (tab) {
    var t = tab.t();
    return openLikedBy(tab).then(function () {
      var d = t.state.detail;
      check('7 none playable: empty play list', d && d.item.uris.length === 0, d && d.item.uris);
      tab.calls.length = 0; tab.w.__toasts = [];
      click(tab, headBtn(tab, 'Play'));
      return H.wait(200).then(function () {
        check('7 Play: the row toast, no request', plays(tab).length === 0 && tab.toasts().indexOf('Not available.') !== -1, tab.toasts());
        tab.calls.length = 0; tab.w.__toasts = [];
        click(tab, headBtn(tab, 'Shuffle'));
        return H.wait(200);
      }).then(function () {
        check('7 Shuffle: same toast, no request', plays(tab).length === 0 && tab.calls.filter(function (c) { return c.method === 'PUT'; }).length === 0 && tab.toasts().indexOf('Not available.') !== -1, [tab.toasts(), tab.calls]);
        done(tab);
      });
    });
  });
});
tests.push(function () {
  var env = { liked: [likedEntry(60), likedEntry(61)] };
  return setup(seed(), env).then(function (tab) {
    var t = tab.t();
    return openLikedBy(tab).then(function () {
      var d = t.state.detail;
      check('8 unmarked songs: list unchanged', d && JSON.stringify(d.item.uris) === JSON.stringify(['spotify:track:T60', 'spotify:track:T61']) && d.item.nope === undefined, d && d.item);
      check('8 rows rotate as before', d && JSON.stringify(d.items[1].uris) === JSON.stringify(['spotify:track:T61', 'spotify:track:T60']), d && d.items[1].uris);
      done(tab);
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
