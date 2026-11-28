'use strict';
// Small fixes (smooth audit, Nov 27): a tagless html_description falls back to Spotify's plain description
// (PODCASTS-5), plus regression checks that saved playlists keep Spotify's not-playable marks (BUGS-2) and reopen
// after a reload with no request (#53 with #39's memoKey). "1 song" and the stateless callback are in #56.
// jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var BASE = 'https://richardtran324.github.io/spotify-library/';
var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };

function track(id, extra) {
  var t = { type: 'track', id: id, uri: 'spotify:track:' + id, name: 'Song ' + id, duration_ms: 200000,
    artists: [{ id: 'ar1', name: 'Band' }], album: { id: 'al1', name: 'Record', images: [], release_date: '2020-01-01' } };
  return Object.assign(t, extra || {});
}
// p1 (mine, 3 songs, s2 not playable), p2 (mine, 1 song), p3 (mine, 2 songs).
var PLS = {
  p1: { name: 'Road trip', snap: 'v1', ids: ['s1', 's2', 's3'] },
  p2: { name: 'Just one', snap: 'v1', ids: ['s4'] },
  p3: { name: 'Two', snap: 'v1', ids: ['s5', 's6'] }
};
function trackFor(id) { return id === 's2' ? track(id, { is_playable: false, restrictions: { reason: 'market' } }) : track(id); }

function libStore(extraScope, liked) {
  var s = H.seedStore();
  s.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: H.SCOPE + (extraScope ? ' ' + extraScope : '') }));
  s.__liked = liked == null ? 5 : liked;
  return s;
}
function libTab(s, opts) {
  opts = opts || {};
  var tab = H.makeTab(s, function (method, path, q) {
    if (path === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
    if (path === '/me/tracks') return { status: 200, json: { items: [], next: null, total: s.__liked } };
    if (path === '/me/playlists') {
      return { status: 200, json: { next: null, total: 3, items: Object.keys(PLS).map(function (k) {
        var p = PLS[k];
        return { id: k, name: p.name, uri: 'spotify:playlist:' + k, images: [], collaborative: false, snapshot_id: p.snap,
          owner: { id: 'me1', display_name: 'R' }, items: { total: p.ids.length } };
      }) } };
    }
    var m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m && PLS[m[1]] && method === 'GET') {
      var ids = PLS[m[1]].ids, off = +(q.get('offset') || 0);
      return { status: 200, json: { items: ids.slice(off, off + 50).map(function (id) { return { added_at: '2026-01-01T00:00:00Z', is_local: false, item: trackFor(id) }; }),
        total: ids.length, offset: off, limit: 50, next: null } };
    }
    if (path === '/me/library/contains') return { status: 200, json: (q.get('uris') || '').split(',').map(function () { return false; }) };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  }, { url: opts.url || BASE });
  return H.wait(400).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    tab.t().state.device = DEV; tab.t().state.deviceAt = Date.now();
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function plGets(tab, id) { return tab.calls.filter(function (c) { return c.method === 'GET' && c.path === '/playlists/' + id + '/items'; }); }
function rowFor(tab, id) {
  return [].slice.call(d(tab).querySelectorAll('#dlist li.row')).filter(function (li) {
    var a = li.querySelector('a[href]'); return a && new RegExp('/track/' + id + '$').test(a.getAttribute('href') || '');
  })[0] || null;
}

var tests = [];

// 1. Saved playlist copies keep Spotify's not-playable marks.
tests.push(function () {
  return libTab(libStore()).then(function (tab) {
    var t = tab.t();
    var bad = t.plPack({ added_at: 'x', item: track('b1', { is_playable: false, restrictions: { reason: 'market' } }) });
    var ok = t.plPack({ added_at: 'x', item: track('g1') });
    var onlyR = t.plPack({ item: track('r1', { restrictions: { reason: 'explicit-content-and-some-more-words' } }) });
    check('1 pack: p 0 and x market', bad.p === 0 && bad.x === 'market', bad);
    check('1 pack: a normal song has neither key', !('p' in ok) && !('x' in ok), ok);
    check('1 pack: reason cut at 20 characters', onlyR.x === 'explicit-content-and' && !('p' in onlyR), onlyR);
    var back = t.mapTrack(t.plUnpack(bad).track), fine = t.mapTrack(t.plUnpack(ok).track), dim = t.mapTrack(t.plUnpack(onlyR).track);
    check('1 unpack: row is marked and a tap plays nothing', !!back.nope && back.noPlay === true, back);
    check('1 unpack: a normal song is plain', !fine.nope && !fine.noPlay, fine);
    check('1 unpack: restriction alone dims only', !!dim.nope && !dim.noPlay, dim);
    check('1 unpack of an old entry (no keys) is plain', !t.mapTrack(t.plUnpack({ i: 'o1', n: 'Old', d: 1, a: ['A'], l: 'L' }).track).nope);
  });
});

// 2. The same, through the page: open, reload, reopen from the saved copy.
tests.push(function () {
  var s = libStore();
  return libTab(s).then(function (tab) {
    var t = tab.t();
    t.openDetail(t.libraryPlaylist('p1'));
    return H.wait(150).then(function () {
      var li = rowFor(tab, 's2');
      check('2 fresh load: s2 marked', !!li && /\bnope\b/.test(li.className), li && li.className);
      var saved = JSON.parse(s.getItem('lib-pl-saved') || 'null');
      var e = saved && saved.p1 && saved.p1.n.filter(function (x) { return x && x.i === 's2'; })[0];
      var e1 = saved && saved.p1 && saved.p1.n.filter(function (x) { return x && x.i === 's1'; })[0];
      check('2 saved entry has p 0 and x market', !!e && e.p === 0 && e.x === 'market', saved);
      check('2 a normal song in the copy has neither', !!e1 && !('p' in e1) && !('x' in e1), e1);
      tab.w.close();
      return libTab(s);
    }).then(function (tab2) {
      var t2 = tab2.t();
      t2.openDetail(t2.libraryPlaylist('p1'));
      return H.wait(150).then(function () {
        check('2 reopened from the saved copy (no request)', plGets(tab2, 'p1').length === 0 && !!t2.state.detail.plSavedAt, plGets(tab2, 'p1'));
        var li = rowFor(tab2, 's2');
        check('2 reopened: s2 still marked with the reason', !!li && /\bnope\b/.test(li.className) && /Not available/.test(li.textContent), li && [li.className, li.textContent]);
        var n = tab2.calls.length;
        var a = li && (li.querySelector('a.item') || li.querySelector('a[href]'));
        if (a) click(tab2, a);
        return H.wait(50).then(function () {
          var plays = tab2.calls.slice(n).filter(function (c) { return c.method === 'PUT' && c.path === '/me/player/play'; });
          check('2 reopened: a tap on s2 sends no play request', plays.length === 0, plays);
          var ok = rowFor(tab2, 's1');
          check('2 reopened: s1 plain', !!ok && !/\bnope\b/.test(ok.className), ok && ok.className);
        });
      });
    });
  });
});

// 3. Episode notes: a tagless html_description uses Spotify's plain description.
tests.push(function () {
  return libTab(libStore()).then(function (tab) {
    var n = tab.t().notesText;
    check('3 "Q&amp;A" tagless: plain description wins', n({ html_description: 'Q&amp;A', description: 'Q&A' }) === 'Q&A', n({ html_description: 'Q&amp;A', description: 'Q&A' }));
    check('3 tagless with no description: as before', n({ html_description: 'Line one\nLine two' }) === 'Line one\nLine two' && n({ html_description: 'Plain', description: '' }) === 'Plain');
    check('3 real HTML still parsed (keeps line breaks)', n({ html_description: '<p>One</p><p>Two &amp; three</p>', description: 'One Two & three' }) === 'One\n\nTwo & three',
      n({ html_description: '<p>One</p><p>Two &amp; three</p>', description: 'One Two & three' }));
    check('3 only a description: used', n({ description: 'Just text' }) === 'Just text');
    check('3 neither: null', n({}) === null);
  });
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
});
