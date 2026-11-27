'use strict';
// Edit your playlists (v2.26) tests: Add to playlist, Edit mode (remove, move up/down), the permission sheet,
// snapshot_id handling, errors, cool-offs and Find in list while editing. jsdom, mocked fetch, shared localStorage.
// The mock keeps its own copy of each playlist and applies every change the page sends, so the tests can check
// that the list on screen matches what Spotify would hold. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var EDIT_SCOPE = 'playlist-modify-private';
var API = 'https://api.spotify.com/v1';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];
function track(id) {
  var n = +id.replace(/\D/g, '');
  var name = id.charAt(0) === 's' ? WORDS[n] : 'Track ' + n;
  return { type: 'track', id: id, uri: 'spotify:track:' + id, name: name, duration_ms: 180000 + n * 1000,
    artists: [{ id: 'ar' + (n % 2), name: n % 2 ? 'Band B' : 'Band A' }], album: { id: 'al1', name: 'Record', images: [] } };
}
function episode(id) {
  return { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: 'Episode ' + id, duration_ms: 1800000, images: [],
    show: { id: 'sh1', name: 'Money Show', images: [] }, release_date: '2026-11-20', resume_point: { fully_played: false, resume_position_ms: 0 } };
}
function trackIds(pre, from, to) { var a = []; for (var i = from; i < to; i++) a.push(pre + i); return a; }
// The library: p1/p4/p5 are mine, p2 is a friend's collaborative playlist, p3 is someone else's.
function freshPlaylists() {
  return {
    p1: { name: 'Road trip', owner: 'me1', collab: false, snap: 'v0', ids: ['s0', 's1', 's2', 's0', 's3', 's4'] },
    p2: { name: 'Band jams', owner: 'friend', collab: true, snap: 'v0', ids: ['s5', 's6'] },
    p3: { name: 'Top hits', owner: 'spotify', collab: false, snap: 'v0', ids: ['s8'] },
    p4: { name: 'Long mix', owner: 'me1', collab: false, snap: 'v0', ids: trackIds('t', 0, 60) },
    p5: { name: 'Empty one', owner: 'me1', collab: false, snap: 'v0', ids: [] }
  };
}
function apiPlaylist(id, p) {
  return { id: id, name: p.name, uri: 'spotify:playlist:' + id, images: [], collaborative: p.collab, snapshot_id: p.snap,
    owner: { id: p.owner, display_name: p.owner === 'me1' ? 'R' : p.owner }, items: { total: p.ids.length } };
}
function store(granted, extra) {
  var s = H.seedStore();
  s.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE + (granted ? ' ' + EDIT_SCOPE : '') }));
  Object.keys(extra || {}).forEach(function (k) { s.setItem(k, JSON.stringify(extra[k])); });
  return s;
}

// env.pls: the mock's playlists. env.writes: queue of answers for the next POST/PUT/DELETE on /playlists/{id}/items
// ({status, json, headers, delay}); none: the change is applied and answered with a new snapshot_id.
// env.getDelay(path, offset): delay for a page GET.
function setup(s, opts) {
  opts = opts || {};
  var env = { pls: freshPlaylists(), writes: [], getDelay: null, seq: 0 };
  var tab = H.makeTab(s, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (call.host === 'accounts.spotify.com') return { status: 400, json: { error: 'invalid_grant' } };
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/playlists') {
      return { status: 200, json: { items: Object.keys(env.pls).map(function (k) { return apiPlaylist(k, env.pls[k]); }), next: null, total: 5 } };
    }
    var m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m && env.pls[m[1]]) {
      var pl = env.pls[m[1]];
      if (method === 'GET') {
        var off = +(q.get('offset') || 0), lim = +(q.get('limit') || 50);
        var items = pl.ids.slice(off, off + lim).map(function (id) { return { added_at: '2026-01-0' + (1 + (+id.replace(/\D/g, '') % 9)) + 'T00:00:00Z', is_local: false, item: id.indexOf('e') === 0 ? episode(id) : track(id) }; });
        return { status: 200, delay: env.getDelay ? env.getDelay(m[1], off) : 0,
          json: { items: items, total: pl.ids.length, offset: off, limit: lim, next: off + lim < pl.ids.length ? API + path + '?offset=' + (off + lim) + '&limit=' + lim : null } };
      }
      call.snapBefore = pl.snap;
      var over = env.writes.shift();
      if (over && over.throws) throw new Error(over.throws);
      if (over && over.status) return over;
      var b = call.body || {};
      if (method === 'POST') {
        var add = (b.uris || []).map(function (u) { return u.split(':')[2]; });
        if (typeof b.position === 'number') pl.ids.splice.apply(pl.ids, [b.position, 0].concat(add)); else pl.ids = pl.ids.concat(add);
      } else if (method === 'DELETE') {
        var gone = (b.items || []).map(function (x) { return x.uri.split(':')[2]; });
        pl.ids = pl.ids.filter(function (id) { return gone.indexOf(id) === -1; });
      } else if (method === 'PUT') {
        var len = b.range_length || 1, mv = pl.ids.splice(b.range_start, len);
        var at = b.insert_before > b.range_start ? b.insert_before - len : b.insert_before;
        pl.ids.splice.apply(pl.ids, [at, 0].concat(mv));
      }
      pl.snap = 'v' + (++env.seq);
      return { status: method === 'POST' ? 201 : 200, json: { snapshot_id: pl.snap }, delay: over && over.delay || 0 };
    }
    if (path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player' && method === 'GET') return { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  }, { beforeParse: function (w) { H.addSubtle(w); } });
  tab.env = env;
  return H.wait(opts.startWait || 600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    tab.w.__nav = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function esc(tab) { d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function writes(tab) { return tab.calls.filter(function (c) { return /^\/playlists\/[^/]+\/items$/.test(c.path) && c.method !== 'GET'; }); }
function api(tab) { return tab.calls.filter(function (c) { return c.host === 'api.spotify.com' && c.path !== '/me/player' && c.path !== '/me/player/devices'; }); }
function rows(tab) { return [].slice.call(d(tab).querySelectorAll('#dlist li.row')); }
function rowNames(tab) { return rows(tab).map(function (li) { return li.querySelector('.name').textContent; }); }
function names(ids) { return ids.map(function (id) { return id.indexOf('e') === 0 ? 'Episode ' + id : track(id).name; }); }
function editBtn(tab, k, which) { var li = rows(tab)[k]; return li ? li.querySelector('[data-edit="' + which + '"]') : null; }
function editBtns(tab) { return [].slice.call(d(tab).querySelectorAll('#dlist [data-edit]')); }
function permOpen(tab) { return !$(tab, 'perm').hidden; }
function plOpen(tab) { return !$(tab, 'plsheet').hidden; }
function lastToast(tab) { var t = tab.toasts(); return t[t.length - 1] || ''; }
function cachePl(s, id) { var c = JSON.parse(s.getItem('lib-cache') || 'null'); return c && (c.playlists || []).filter(function (p) { return p.id === id; })[0]; }
function boxShown(tab) { var b = $(tab, 'dfindBox'); return !!b && !b.hidden; }
function typeFind(tab, text) { var inp = $(tab, 'dfind'); inp.value = text; inp.dispatchEvent(new tab.w.Event('input', { bubbles: true })); }
function openPl(tab, id, wait) {
  var t = tab.t();
  t.openDetail(t.libraryPlaylist(id) || { kind: 'playlist', id: id, uri: 'spotify:playlist:' + id, name: id, url: 'https://open.spotify.com/playlist/' + id, img: '', sub: 'Playlist' });
  return H.wait(wait || 150).then(function () { tab.calls.length = 0; tab.w.__toasts = []; return tab; });
}
function startEdit(tab) { click(tab, $(tab, 'deditBtn')); return tab; }
function playerFor(item) {
  return { item: item, currently_playing_type: item.type, context: { type: 'album', uri: 'spotify:album:al1' }, is_playing: true, progress_ms: 1000,
    device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
function npOption(tab, label) {
  return [].slice.call(d(tab).querySelectorAll('#npOpts button')).filter(function (b) { return b.textContent === label; })[0] || null;
}
function plRows(tab) { return [].slice.call(d(tab).querySelectorAll('#plList .devrow')); }
function plRow(tab, id) { return d(tab).querySelector('#plList .devrow[data-pl="' + id + '"]'); }

var tests = [];

// 1. Who gets Edit: my playlists and collaborative ones, with songs; not others' playlists, albums or Liked Songs.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    check('1 library loaded with my id', t.state.data && t.state.data.me && t.state.data.me.id === 'me1', t.state.data && t.state.data.me);
    check('1 canEdit: mine and collaborative only', t.canEdit(t.libraryPlaylist('p1')) && t.canEdit(t.libraryPlaylist('p2')) && !t.canEdit(t.libraryPlaylist('p3')),
      ['p1', 'p2', 'p3'].map(function (id) { return t.canEdit(t.libraryPlaylist(id)); }));
    return openPl(tab, 'p1').then(function () {
      check('1 my playlist: Edit button', !!$(tab, 'deditBtn') && /Road trip/.test($(tab, 'deditBtn').getAttribute('aria-label')), $(tab, 'dedit').innerHTML);
      check('1 normal rows have no edit buttons', editBtns(tab).length === 0 && rowNames(tab).join(',') === names(['s0', 's1', 's2', 's0', 's3', 's4']).join(','), rowNames(tab));
      check('1 opening a list sends no write', writes(tab).length === 0);
      return openPl(tab, 'p2');
    }).then(function () {
      check('1 collaborative playlist: Edit button', !!$(tab, 'deditBtn'));
      return openPl(tab, 'p3');
    }).then(function () {
      check('1 someone else\'s playlist: no Edit, no list request', !$(tab, 'deditBtn') && reqs(tab, 'GET', '/playlists/p3/items').length === 0, tab.calls);
      return openPl(tab, 'p5');
    }).then(function () {
      check('1 my empty playlist: no Edit', !$(tab, 'deditBtn') && /No songs here/.test($(tab, 'dfoot').textContent), $(tab, 'dfoot').textContent);
      t.openDetail({ kind: 'liked', name: 'Liked Songs', uri: null, url: 'https://open.spotify.com/collection/tracks', sub: 'Playlist' });
      return H.wait(150);
    }).then(function () {
      check('1 Liked Songs: no Edit', !$(tab, 'deditBtn'));
    });
  });
});

// 2. Edit mode: playlist order, arrows and −, sort and Find hidden, Done brings the saved sort back.
tests.push(function () {
  var s = store(true, { 'lib-sort-d-playlist': 'az' });
  return setup(s).then(function (tab) {
    return openPl(tab, 'p1').then(function () {
      var sorted = rowNames(tab);
      check('2 saved sort applies outside Edit', sorted.join(',') === 'Alpha,Alpha,Bravo,Charlie,Delta,Echo', sorted);
      check('2 sort bar and find box shown outside Edit', !!d(tab).querySelector('#dsort .sortbar') && boxShown(tab));
      startEdit(tab);
      check('2 Edit shows playlist order', rowNames(tab).join(',') === names(['s0', 's1', 's2', 's0', 's3', 's4']).join(','), rowNames(tab));
      check('2 every row has up, down and remove', rows(tab).every(function (li) { return li.querySelectorAll('[data-edit]').length === 3; }));
      check('2 first row can\'t move up, last can\'t move down', editBtn(tab, 0, 'up').disabled && !editBtn(tab, 0, 'down').disabled && editBtn(tab, 5, 'down').disabled && !editBtn(tab, 5, 'up').disabled);
      check('2 remove enabled on every row', rows(tab).every(function (li, k) { return !editBtn(tab, k, 'rm').disabled; }));
      check('2 buttons are labelled with the song', /Move “Bravo” up/.test(editBtn(tab, 1, 'up').getAttribute('aria-label')) && /Remove “Bravo” from this playlist/.test(editBtn(tab, 1, 'rm').getAttribute('aria-label')));
      check('2 sort bar hidden while editing', $(tab, 'dsort').textContent === '');
      check('2 find box hidden while editing', !boxShown(tab));
      check('2 hint explains, Done focused', /Shown in playlist order/.test($(tab, 'dedit').textContent) && d(tab).activeElement === $(tab, 'deditDone'), $(tab, 'dedit').textContent);
      check('2 Edit button gone while editing', !$(tab, 'deditBtn'));
      check('2 entering Edit sends nothing', api(tab).length === 0, tab.calls);
      click(tab, $(tab, 'deditDone'));
      check('2 Done: saved sort back, no edit buttons', rowNames(tab).join(',') === sorted.join(',') && editBtns(tab).length === 0, rowNames(tab));
      check('2 Done: Edit button back and focused', !!$(tab, 'deditBtn') && d(tab).activeElement === $(tab, 'deditBtn'));
      check('2 Done: sort bar and find box back', !!d(tab).querySelector('#dsort .sortbar') && boxShown(tab));
      check('2 sort choice unchanged on the phone', s.getItem('lib-sort-d-playlist') === '"az"', s.getItem('lib-sort-d-playlist'));
    });
  });
});

// 3. Without playlist-modify-private: every edit opens the permission sheet first and sends nothing.
tests.push(function () {
  var s = store(false, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    check('3 edit not granted with the everyday scopes', t.hasFeature('edit') === false && t.FEATURE_SCOPES.edit.scopes.join() === EDIT_SCOPE);
    return openPl(tab, 'p1').then(function () {
      startEdit(tab);
      check('3 Edit mode opens without the permission', editBtns(tab).length === 18 && !permOpen(tab));
      var rm = editBtn(tab, 1, 'rm');
      click(tab, rm);
      var body = $(tab, 'permBody').textContent;
      check('3 − opens the permission sheet, not the confirm', permOpen(tab) && !plOpen(tab));
      check('3 sheet names the feature', /Editing your playlists needs one more Spotify permission/.test(body), body);
      check('3 sheet names the new Spotify line', d(tab).querySelector('#permBody li') && d(tab).querySelector('#permBody li').textContent === 'Manage your private playlists');
      check('3 focus on Sign in to Spotify', d(tab).activeElement === $(tab, 'permGo'));
      check('3 opening the sheet sent nothing and stored nothing', api(tab).length === 0 && s.getItem('lib-perm-ask') === null, tab.calls);
      click(tab, $(tab, 'permClose'));
      check('3 Not now closes, focus back on −', !permOpen(tab) && d(tab).activeElement === rm);
      click(tab, editBtn(tab, 0, 'down'));
      check('3 a move opens the sheet too', permOpen(tab) && writes(tab).length === 0);
      esc(tab);
      check('3 Escape closes the sheet', !permOpen(tab));
      check('3 the list is unchanged', rowNames(tab).join(',') === names(['s0', 's1', 's2', 's0', 's3', 's4']).join(','));
      t.setPlayer(playerFor(track('s7')));
      t.openNp();
      return H.wait(50);
    }).then(function () {
      click(tab, npOption(tab, 'Add to playlist'));
      check('3 Add to playlist sheet opens without the permission', plOpen(tab) && plRows(tab).length > 0);
      click(tab, plRow(tab, 'p1'));
      check('3 picking a playlist opens the permission sheet, sends nothing', permOpen(tab) && writes(tab).length === 0, tab.calls);
      var at0 = Date.now();
      click(tab, $(tab, 'permGo'));
      return H.wait(150).then(function () {
        var ask = JSON.parse(s.getItem('lib-perm-ask') || 'null');
        check('3 Sign in to Spotify stores the edit sign-in', ask && ask.feature === 'edit' && ask.at >= at0, ask);
        var n = (tab.w.__nav || []).map(function (x) { return x.url; });
        check('3 one navigation to Spotify authorize', n.length === 1 && /^https:\/\/accounts\.spotify\.com\/authorize\?/.test(n[0]), n);
        var sc = n[0] ? (new URL(n[0]).searchParams.get('scope') || '').split(' ') : [];
        check('3 asks the everyday scopes plus playlist-modify-private', sc.indexOf(EDIT_SCOPE) !== -1 && t.SCOPE_LIST.every(function (x) { return sc.indexOf(x) !== -1; }) && sc.length === t.SCOPE_LIST.length + 1, sc);
        check('3 still no write sent', writes(tab).length === 0);
      });
    });
  });
});

// 4. Add to playlist from Now Playing: only mine and collaborative ones, pinned first, a name filter, one POST.
tests.push(function () {
  var pin = { kind: 'playlist', id: 'p5', name: 'Empty one', uri: 'spotify:playlist:p5', url: 'https://open.spotify.com/playlist/p5', img: '', sub: 'Playlist', ownerId: 'me1' };
  var s = store(true, { 'lib-pins': [pin] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerFor(track('s7')));
    t.openNp();
    return H.wait(50).then(function () {
      var opt = npOption(tab, 'Add to playlist');
      check('4 Now Playing offers Add to playlist', !!opt, $(tab, 'npOpts').textContent);
      tab.calls.length = 0;
      click(tab, opt);
      check('4 sheet opens with the song', plOpen(tab) && $(tab, 'plTitle').textContent === 'Add to playlist' && /“Hotel” · Band B/.test($(tab, 'plBody').textContent), $(tab, 'plBody').textContent);
      check('4 opening sends nothing', api(tab).length === 0, tab.calls);
      var ids = plRows(tab).map(function (b) { return b.getAttribute('data-pl'); });
      check('4 pinned first, then mine and collaborative; not someone else\'s', ids.join(',') === 'p5,p1,p2,p4', ids);
      var heads = [].slice.call(d(tab).querySelectorAll('#plList h3')).map(function (h) { return h.textContent; });
      check('4 group headings', heads.join('|') === 'Pinned|Your playlists', heads);
      check('4 collaborative marked, counts shown', /Collaborative/.test(plRow(tab, 'p2').textContent) && /6 songs/.test(plRow(tab, 'p1').textContent), plRow(tab, 'p2').textContent);
      check('4 focus on Close, not the filter', d(tab).activeElement === $(tab, 'plClose'));
      var f = $(tab, 'plFilter');
      f.value = 'JAM'; f.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('4 filter by name, any case', plRows(tab).map(function (b) { return b.getAttribute('data-pl'); }).join(',') === 'p2');
      f.value = 'zzz'; f.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('4 no match says so', plRows(tab).length === 0 && /No playlist matches “zzz”/.test($(tab, 'plList').textContent));
      f.value = ''; f.dispatchEvent(new tab.w.Event('input', { bubbles: true }));
      check('4 filtering sends nothing', api(tab).length === 0);
      click(tab, plRow(tab, 'p5'));
      check('4 rows locked while sending', plRows(tab).every(function (b) { return b.disabled; }));
      click(tab, plRow(tab, 'p1'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('4 one POST to the picked playlist', w.length === 1 && w[0].method === 'POST' && w[0].path === '/playlists/p5/items', w);
      check('4 body is just the song\'s uri (Spotify adds at the end)', w[0] && JSON.stringify(w[0].body) === JSON.stringify({ uris: ['spotify:track:s7'] }), w[0] && w[0].body);
      check('4 toast and sheet closed', lastToast(tab) === 'Added to “Empty one”' && !plOpen(tab), tab.toasts());
      check('4 Spotify\'s copy has the song', tab.env.pls.p5.ids.join() === 's7');
      var c = cachePl(s, 'p5');
      check('4 song count saved on the phone', c && c.count === 1 && / · 1 songs$/.test(c.sub), c);
      check('4 Now Playing still open', !$(tab, 'np').hidden);
    });
  });
});

// 5. Adding to a playlist open on screen: Already in this playlist? only for loaded songs; the song appears at the end.
tests.push(function () {
  var s = store(true, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p1').then(function () {
      t.setPlayer(playerFor(track('s7')));
      t.openNp();
      return H.wait(50);
    }).then(function () {
      click(tab, npOption(tab, 'Add to playlist'));
      click(tab, plRow(tab, 'p1'));
      check('5 new song: no duplicate question', !/Already in this playlist/.test($(tab, 'plBody').textContent));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('5 one POST, list shows it at the end', w.length === 1 && rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(',') && rowNames(tab)[6] === 'Hotel', rowNames(tab));
      check('5 song count on screen and on the phone', /^7 songs/.test($(tab, 'dsum').textContent) && cachePl(s, 'p1').count === 7, $(tab, 'dsum').textContent);
      check('5 the answer\'s snapshot is kept for the next edit', t.editSnap(t.state.detail) === tab.env.pls.p1.snap, t.editSnap(t.state.detail));
      tab.calls.length = 0;
      t.setPlayer(playerFor(track('s0')));
      t.openAddPl();
      click(tab, plRow(tab, 'p1'));
      check('5 loaded song: asks first', /Already in this playlist\. Add again\?/.test($(tab, 'plBody').textContent) && /“Alpha” is already in “Road trip”/.test($(tab, 'plBody').textContent), $(tab, 'plBody').textContent);
      check('5 asking sends nothing, focus on Add again', writes(tab).length === 0 && d(tab).activeElement === $(tab, 'plGo'));
      click(tab, $(tab, 'plClose'));
      check('5 Cancel goes back to the list', plOpen(tab) && plRows(tab).length === 4 && writes(tab).length === 0);
      click(tab, plRow(tab, 'p1'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('5 Add again sends one POST', w.length === 1 && JSON.stringify(w[0].body) === JSON.stringify({ uris: ['spotify:track:s0'] }), w);
      check('5 list matches Spotify\'s copy (8 songs)', rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(',') && tab.env.pls.p1.ids.length === 8, rowNames(tab));
      tab.calls.length = 0;
      t.setPlayer(playerFor(track('s5')));
      t.openAddPl();
      click(tab, plRow(tab, 'p2'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('5 song in a playlist not loaded this visit: added without asking', w.length === 1 && w[0].path === '/playlists/p2/items' && tab.env.pls.p2.ids.join() === 's5,s6,s5', { w: w, ids: tab.env.pls.p2.ids });
      check('5 no GET to check for duplicates', reqs(tab, 'GET', '/playlists/p2/items').length === 0);
      check('5 open list unchanged by another playlist\'s add', rowNames(tab).length === 8);
    });
  });
});

// 6. Adding to a long playlist loaded only in part: only the count changes; Load more brings the song in.
tests.push(function () {
  var s = store(true, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p4').then(function () {
      check('6 first page only', rows(tab).length === 50 && /50 of 60 songs loaded/.test($(tab, 'dsum').textContent), $(tab, 'dsum').textContent);
      t.setPlayer(playerFor(track('s9')));
      t.openAddPl();
      click(tab, plRow(tab, 'p4'));
      return H.wait(150);
    }).then(function () {
      check('6 rows unchanged, total grows', rows(tab).length === 50 && /50 of 61 songs loaded/.test($(tab, 'dsum').textContent) && cachePl(s, 'p4').count === 61, $(tab, 'dsum').textContent);
      tab.calls.length = 0;
      click(tab, d(tab).querySelector('#dfoot .btn'));
      return H.wait(150);
    }).then(function () {
      var g = reqs(tab, 'GET', '/playlists/p4/items');
      check('6 Load more asks for the rest', g.length === 1 && /offset=50/.test(g[0].query), g);
      check('6 the added song is last, list matches Spotify', rowNames(tab).length === 61 && rowNames(tab)[60] === 'Juliet' && rowNames(tab).join(',') === names(tab.env.pls.p4.ids).join(','), rowNames(tab).slice(-3));
    });
  });
});

// 7. Episodes can be added; local files and nothing playing can't.
tests.push(function () {
  var s = store(true, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    t.setPlayer(playerFor(episode('e1')));
    t.openNp();
    return H.wait(50).then(function () {
      check('7 episode: Add to playlist offered', !!npOption(tab, 'Add to playlist'));
      click(tab, npOption(tab, 'Add to playlist'));
      check('7 episode named with its show', /“Episode e1” · Money Show/.test($(tab, 'plBody').textContent), $(tab, 'plBody').textContent);
      click(tab, plRow(tab, 'p2'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('7 episode uri posted', w.length === 1 && JSON.stringify(w[0].body) === JSON.stringify({ uris: ['spotify:episode:e1'] }), w);
      check('7 collaborative playlist accepts it', lastToast(tab) === 'Added to “Band jams”');
      t.closeNp();
      var local = track('s3'); local.uri = 'spotify:local:Band:Record:Delta:180'; local.id = null; local.is_local = true;
      t.setPlayer(playerFor(local));
      t.openNp();
      return H.wait(50);
    }).then(function () {
      check('7 local file: no Add to playlist', !npOption(tab, 'Add to playlist'), $(tab, 'npOpts').textContent);
      tab.calls.length = 0;
      t.openAddPl();
      check('7 local file: toast, no sheet, nothing sent', !plOpen(tab) && lastToast(tab) === 'Only Spotify songs and episodes can be added to a playlist.' && writes(tab).length === 0, tab.toasts());
    });
  });
});

// 8. Remove: a confirm first, one DELETE with the uri, every copy goes, snapshot_id from the last answer.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p1').then(function () {
      startEdit(tab);
      click(tab, editBtn(tab, 1, 'rm'));
      var txt = $(tab, 'plBody').textContent;
      check('8 confirm names the song, the playlist and every copy', plOpen(tab) && $(tab, 'plTitle').textContent === 'Remove song' && /Remove “Bravo” from “Road trip”\?/.test(txt) && /removes every copy/.test(txt), txt);
      check('8 focus on Cancel, nothing sent', d(tab).activeElement === $(tab, 'plClose') && writes(tab).length === 0);
      click(tab, $(tab, 'plClose'));
      check('8 Cancel: closed, nothing sent, list unchanged', !plOpen(tab) && writes(tab).length === 0 && rows(tab).length === 6);
      click(tab, editBtn(tab, 1, 'rm'));
      esc(tab);
      check('8 Escape cancels too', !plOpen(tab) && writes(tab).length === 0);
      click(tab, editBtn(tab, 1, 'rm'));
      click(tab, $(tab, 'plBack'));
      check('8 backdrop cancels too', !plOpen(tab) && writes(tab).length === 0);
      click(tab, editBtn(tab, 1, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('8 one DELETE with the uri', w.length === 1 && w[0].method === 'DELETE' && w[0].path === '/playlists/p1/items' && JSON.stringify(w[0].body.items) === JSON.stringify([{ uri: 'spotify:track:s1' }]), w);
      check('8 first edit: no snapshot known, none sent', w[0] && !('snapshot_id' in w[0].body), w[0] && w[0].body);
      check('8 toast and list', lastToast(tab) === 'Removed “Bravo” from “Road trip”' && rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','), { t: tab.toasts(), r: rowNames(tab) });
      check('8 still editing, focus on a remove button', editBtns(tab).length === 15 && d(tab).activeElement && d(tab).activeElement.getAttribute('data-edit') === 'rm');
      tab.calls.length = 0;
      click(tab, editBtn(tab, 0, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('8 second edit sends the snapshot Spotify last answered', w.length === 1 && w[0].body.snapshot_id === w[0].snapBefore && w[0].body.snapshot_id === 'v1', w[0] && w[0].body);
      check('8 both copies of the duplicate gone', rowNames(tab).join(',') === 'Charlie,Delta,Echo' && tab.env.pls.p1.ids.join() === 's2,s3,s4', rowNames(tab));
      check('8 count on screen, on the item and on the phone', /^3 songs/.test($(tab, 'dsum').textContent) && t.state.detail.item.count === 3 && cachePl(s, 'p1').count === 3 && / · 3 songs$/.test(cachePl(s, 'p1').sub), { sum: $(tab, 'dsum').textContent, c: cachePl(s, 'p1') });
      check('8 move buttons follow the new ends', editBtn(tab, 0, 'up').disabled && editBtn(tab, 2, 'down').disabled && !editBtn(tab, 1, 'up').disabled);
    });
  });
});

// 9. Move: PUT range_start / insert_before / range_length, snapshot chained, list matches Spotify; kept for the visit.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p1').then(function () {
      startEdit(tab);
      click(tab, editBtn(tab, 0, 'down'));
      check('9 buttons locked while sending', editBtns(tab).every(function (b) { return b.disabled; }) && t.plEdit.busy === true);
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('9 down: one PUT', w.length === 1 && w[0].method === 'PUT' && w[0].path === '/playlists/p1/items', w);
      check('9 down body: 0 before 2, length 1, no snapshot yet', w[0] && JSON.stringify(w[0].body) === JSON.stringify({ range_start: 0, insert_before: 2, range_length: 1 }), w[0] && w[0].body);
      check('9 list matches Spotify after down', rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(',') && rowNames(tab)[1] === 'Alpha', rowNames(tab));
      check('9 focus follows the song (its down button)', d(tab).activeElement === editBtn(tab, 1, 'down'));
      check('9 buttons unlocked', !t.plEdit.busy && !editBtn(tab, 2, 'up').disabled);
      tab.calls.length = 0;
      click(tab, editBtn(tab, 2, 'up'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('9 up body: 2 before 1 with the last snapshot', w[0] && JSON.stringify(w[0].body) === JSON.stringify({ range_start: 2, insert_before: 1, range_length: 1, snapshot_id: 'v1' }), w[0] && w[0].body);
      check('9 list matches Spotify after up', rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','), { page: rowNames(tab), spotify: names(tab.env.pls.p1.ids) });
      check('9 focus on the moved song\'s up button', d(tab).activeElement === editBtn(tab, 1, 'up'));
      tab.calls.length = 0;
      click(tab, editBtn(tab, 4, 'down'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('9 second-to-last to last: insert_before is the length', w[0] && w[0].body.range_start === 4 && w[0].body.insert_before === 6 && w[0].body.snapshot_id === 'v2', w[0] && w[0].body);
      check('9 list matches Spotify after the move to last', rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(',') && editBtn(tab, 5, 'down').disabled, rowNames(tab));
      check('9 a move keeps the count', cachePl(s, 'p1').count === 6);
      var order = rowNames(tab).join(',');
      click(tab, $(tab, 'deditDone'));
      t.goBack(); t.closeDetail();
      return openPl(tab, 'p1').then(function () {
        check('9 reopened from this visit\'s pages: no request, edited order', api(tab).filter(function (c) { return c.method === 'GET' && /^\/playlists\//.test(c.path); }).length === 0 && rowNames(tab).join(',') === order, { calls: tab.calls, r: rowNames(tab) });
        check('9 reopened list knows the last snapshot', t.editSnap(t.state.detail) === 'v3', t.editSnap(t.state.detail));
        check('9 reopened list starts outside Edit', !t.state.detail.editing && !!$(tab, 'deditBtn') && editBtns(tab).length === 0);
        startEdit(tab);
        click(tab, editBtn(tab, 1, 'up'));
        return H.wait(150);
      }).then(function () {
        var w = writes(tab);
        check('9 edit after reopening chains the snapshot', w.length === 1 && w[0].body.snapshot_id === 'v3' && rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','), w[0] && w[0].body);
      });
    });
  });
});

// 10. One change at a time: a second tap while one is in flight sends nothing; Load more is off meanwhile.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p4').then(function () {
      startEdit(tab);
      tab.env.writes.push({ delay: 300 });
      click(tab, editBtn(tab, 0, 'down'));
      var more = d(tab).querySelector('#dfoot .btn');
      check('10 Load more off while sending', more && more.disabled, more && more.outerHTML);
      editBtn(tab, 3, 'down').disabled = false;   // even if a tap got through, the page sends nothing
      click(tab, editBtn(tab, 3, 'down'));
      click(tab, editBtn(tab, 5, 'rm'));
      check('10 no confirm while busy', !plOpen(tab));
      return H.wait(100).then(function () {
        check('10 only one request in flight', writes(tab).length === 1 && tab.flight.now <= 1, writes(tab));
        return H.wait(350);
      });
    }).then(function () {
      check('10 after the answer: one write in all, unlocked', writes(tab).length === 1 && !t.plEdit.busy && !editBtn(tab, 3, 'down').disabled && !d(tab).querySelector('#dfoot .btn').disabled);
      check('10 list matches Spotify', rowNames(tab).join(',') === names(tab.env.pls.p4.ids.slice(0, 50)).join(','));
    });
  });
});

// 11. Errors: nothing changes on screen or in the kept pages; the right message for each; the sheet for a lost scope.
tests.push(function () {
  var s = store(true, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    var before = names(['s0', 's1', 's2', 's0', 's3', 's4']).join(',');
    return openPl(tab, 'p1').then(function () {
      startEdit(tab);
      tab.env.writes.push({ status: 500, json: { error: { status: 500, message: 'Server error' } } });
      var b = editBtn(tab, 0, 'down');
      click(tab, b);
      return H.wait(150).then(function () {
        check('11 move refused: list unchanged', rowNames(tab).join(',') === before && tab.env.pls.p1.ids.join() === 's0,s1,s2,s0,s3,s4', rowNames(tab));
        check('11 move refused: toast names the song and the reason', lastToast(tab) === 'Couldn’t move “Alpha” (Server error).', tab.toasts());
        check('11 move refused: unlocked, focus back on the button, no snapshot kept', !t.plEdit.busy && !editBtn(tab, 0, 'down').disabled && d(tab).activeElement === b && t.editSnap(t.state.detail) === null);
      });
    }).then(function () {
      tab.env.writes.push({ status: 403, json: { error: { status: 403, message: 'Forbidden' } } });
      click(tab, editBtn(tab, 2, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150).then(function () {
        check('11 403 not about scope: says Spotify didn\'t allow it', lastToast(tab) === 'Spotify didn’t allow this change from this page (Forbidden).' && !permOpen(tab), tab.toasts());
        check('11 403: list unchanged', rowNames(tab).join(',') === before);
      });
    }).then(function () {
      tab.env.writes.push({ throws: 'Network down' });
      click(tab, editBtn(tab, 3, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150).then(function () {
        check('11 network failure: toast, list unchanged', lastToast(tab) === 'Couldn’t remove “Alpha” (Network down).' && rowNames(tab).join(',') === before, tab.toasts());
        check('11 network failure: unlocked', !t.plEdit.busy && !editBtn(tab, 3, 'rm').disabled);
      });
    }).then(function () {
      tab.env.writes.push({ status: 403, json: { error: { status: 403, message: 'Insufficient client scope' } } });
      tab.w.__toasts = [];
      click(tab, editBtn(tab, 1, 'up'));
      return H.wait(150).then(function () {
        check('11 403 about scope: the permission sheet opens', permOpen(tab) && /Editing your playlists/.test($(tab, 'permBody').textContent));
        check('11 403 about scope: no error toast, no general scope banner', tab.toasts().length === 0 && !t.state.scopeProblem, { t: tab.toasts(), sp: t.state.scopeProblem });
        check('11 403 about scope: list unchanged', rowNames(tab).join(',') === before);
        click(tab, $(tab, 'permClose'));
      });
    }).then(function () {
      var count0 = cachePl(s, 'p4').count;
      t.setPlayer(playerFor(track('s7')));
      t.openAddPl();
      tab.env.writes.push({ status: 500, json: { error: { status: 500, message: 'Server error' } } });
      click(tab, plRow(tab, 'p4'));
      return H.wait(150).then(function () {
        check('11 add refused: toast, sheet stays open and usable', lastToast(tab) === 'Couldn’t add to “Long mix” (Server error).' && plOpen(tab) && !plRow(tab, 'p4').disabled, tab.toasts());
        check('11 add refused: count unchanged', cachePl(s, 'p4').count === count0 && tab.env.pls.p4.ids.length === 60);
        check('11 every refusal logged no snapshot and left Spotify\'s copy alone', tab.env.pls.p1.snap === 'v0' && tab.env.pls.p4.snap === 'v0');
      });
    });
  });
});

// 12. Rate limits and pauses: a 429 pauses the library group; a pause sends nothing; a catalog pause doesn't block edits.
tests.push(function () {
  var s = store(true, { 'lib-pins': [] });
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p1').then(function () {
      startEdit(tab);
      tab.env.writes.push({ status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } }, headers: { 'retry-after': '30' } });
      var at0 = Date.now();
      click(tab, editBtn(tab, 0, 'down'));
      return H.wait(150).then(function () {
        var c = JSON.parse(s.getItem('lib-cooloff') || '{}');
        check('12 429: library paused for Retry-After', c.library && c.library.until >= at0 + 29000 && c.library.until <= Date.now() + 31000 && t.coolLeft('library') > 0, c);
        check('12 429: the page says your library is paused', /Spotify paused your library/.test(lastToast(tab)), tab.toasts());
        check('12 429: list unchanged, unlocked', rowNames(tab).join(',') === names(['s0', 's1', 's2', 's0', 's3', 's4']).join(',') && !t.plEdit.busy);
        tab.calls.length = 0;
        click(tab, editBtn(tab, 1, 'down'));
        click(tab, editBtn(tab, 2, 'rm'));
        check('12 paused: the confirm still opens', plOpen(tab));
        click(tab, $(tab, 'plGo'));
        return H.wait(100);
      });
    }).then(function () {
      check('12 paused: move and remove send nothing', writes(tab).length === 0, tab.calls);
      check('12 paused: confirm stays so it can be tried later', plOpen(tab));
      t.closePl();
      t.setPlayer(playerFor(track('s7')));
      t.openAddPl();
      click(tab, plRow(tab, 'p4'));
      return H.wait(100);
    }).then(function () {
      check('12 paused: add sends nothing', writes(tab).length === 0 && plOpen(tab));
      t.closePl();
      var now = Date.now();
      s.setItem('lib-cooloff', JSON.stringify({ catalog: { until: now + 600000, reason: 'quota', strikes: 1, quotaAt: now, retryAfter: null, last429: { at: now, reason: 'quota', retryAfter: null, what: 'GET /playlists/p1/items' } } }));
      check('12 library free, catalog paused', !t.coolLeft('library') && t.coolLeft('catalog') > 0);
      click(tab, editBtn(tab, 0, 'down'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('12 catalog pause: edits still go (library group)', w.length === 1 && w[0].method === 'PUT' && rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','), w);
    });
  });
});

// 13. Long playlists: moves only among loaded songs; Load more after a remove carries on at the right offset.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p4').then(function () {
      startEdit(tab);
      check('13 hint says moves cover the 50 loaded', /Songs move only among the 50 loaded so far/.test($(tab, 'dedit').textContent), $(tab, 'dedit').textContent);
      check('13 last loaded song can\'t move down', editBtn(tab, 49, 'down').disabled && !editBtn(tab, 48, 'down').disabled);
      click(tab, editBtn(tab, 10, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      check('13 removed: 49 rows, 59 in all', rows(tab).length === 49 && /49 of 59 songs loaded/.test($(tab, 'dsum').textContent), $(tab, 'dsum').textContent);
      tab.calls.length = 0;
      click(tab, d(tab).querySelector('#dfoot .btn'));
      return H.wait(150);
    }).then(function () {
      var g = reqs(tab, 'GET', '/playlists/p4/items');
      check('13 Load more asks from offset 49 (moved back by one)', g.length === 1 && /offset=49/.test(g[0].query), g);
      check('13 no song skipped or repeated', rowNames(tab).join(',') === names(tab.env.pls.p4.ids).join(',') && rows(tab).length === 59, rowNames(tab).slice(45, 52));
      check('13 new rows arrive in Edit with their buttons', editBtns(tab).length === 59 * 3 && !/loaded so far/.test($(tab, 'dedit').textContent));
      check('13 the old last row can move down now', !editBtn(tab, 48, 'down').disabled && editBtn(tab, 58, 'down').disabled);
      tab.calls.length = 0;
      click(tab, editBtn(tab, 48, 'down'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('13 move across the old page edge', w[0] && w[0].body.range_start === 48 && w[0].body.insert_before === 50 && rowNames(tab).join(',') === names(tab.env.pls.p4.ids).join(','), w[0] && w[0].body);
    });
  });
});

// 14. Find in list while editing: hidden, every loaded song shown; Done brings the filter back.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p1').then(function () {
      typeFind(tab, 'charlie');
      check('14 find filters the list', rowNames(tab).join(',') === 'Charlie');
      startEdit(tab);
      check('14 Edit hides the find box and shows every song', !boxShown(tab) && rowNames(tab).length === 6 && editBtns(tab).length === 18, rowNames(tab));
      check('14 the typed text is kept', t.state.detail.find === 'charlie');
      click(tab, editBtn(tab, 2, 'up'));
      return H.wait(150);
    }).then(function () {
      check('14 a move while a filter is kept uses the real place', writes(tab)[0] && writes(tab)[0].body.range_start === 2 && writes(tab)[0].body.insert_before === 1 && rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','), writes(tab)[0] && writes(tab)[0].body);
      click(tab, $(tab, 'deditDone'));
      check('14 Done: find box back with its text, filter applied again', boxShown(tab) && $(tab, 'dfind').value === 'charlie' && rowNames(tab).join(',') === 'Charlie', rowNames(tab));
      typeFind(tab, '');
      check('14 clearing shows the edited order', rowNames(tab).join(',') === names(tab.env.pls.p1.ids).join(','));
    });
  });
});

// 15. Edit stops a running Search all (what it already asked for still arrives).
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    tab.env.getDelay = function (id, off) { return off >= 50 ? 250 : 0; };
    return openPl(tab, 'p4').then(function () {
      typeFind(tab, 'track 5');
      click(tab, $(tab, 'dfindAll'));
      return H.wait(30);
    }).then(function () {
      check('15 Search all running', !!t.state.detail.findRun && reqs(tab, 'GET', '/playlists/p4/items').length === 1);
      startEdit(tab);
      check('15 Edit stops it', t.state.detail.findRun && t.state.detail.findRun.stop === true && t.state.detail.editing);
      check('15 edit buttons locked while its page is coming', editBtns(tab).every(function (b) { return b.disabled; }));
      return H.wait(400);
    }).then(function () {
      check('15 the page it asked for arrives; nothing more is asked', t.state.detail.items.length === 60 && reqs(tab, 'GET', '/playlists/p4/items').length === 1 && !t.state.detail.findRun);
      check('15 still editing, buttons unlocked', t.state.detail.editing && !editBtn(tab, 0, 'down').disabled);
    });
  });
});

// 16. Leaving: Back while editing ends Edit; the next visit starts outside it. Collaborative playlists edit the same way.
tests.push(function () {
  var s = store(true);
  return setup(s).then(function (tab) {
    var t = tab.t();
    return openPl(tab, 'p2').then(function () {
      startEdit(tab);
      click(tab, editBtn(tab, 1, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      var w = writes(tab);
      check('16 collaborative: DELETE to its own path', w.length === 1 && w[0].path === '/playlists/p2/items' && tab.env.pls.p2.ids.join() === 's5' && lastToast(tab) === 'Removed “Golf” from “Band jams”', { w: w, t: tab.toasts() });
      check('16 collaborative: one song left, no arrows to use', rows(tab).length === 1 && editBtn(tab, 0, 'up').disabled && editBtn(tab, 0, 'down').disabled);
      t.closeDetail();
      check('16 Back leaves the list (and Edit)', !t.state.detail);
      return openPl(tab, 'p2');
    }).then(function () {
      check('16 reopened: outside Edit, from this visit\'s pages', !t.state.detail.editing && editBtns(tab).length === 0 && !!$(tab, 'deditBtn') && rowNames(tab).join(',') === 'Foxtrot' && tab.calls.filter(function (c) { return /^\/playlists\//.test(c.path); }).length === 0, { r: rowNames(tab), c: tab.calls });
      startEdit(tab);
      click(tab, editBtn(tab, 0, 'rm'));
      click(tab, $(tab, 'plGo'));
      return H.wait(150);
    }).then(function () {
      check('16 removing the last song empties the list', rows(tab).length === 0 && tab.env.pls.p2.ids.length === 0 && /No songs here/.test($(tab, 'dfoot').textContent), $(tab, 'dfoot').textContent);
      check('16 the last edit sent the snapshot from the first', writes(tab)[0].body.snapshot_id === 'v1', writes(tab)[0].body);
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
