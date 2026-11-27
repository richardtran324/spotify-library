'use strict';
// Episode notes (v2.18) tests: jsdom, mocked fetch, shared localStorage. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var NOTES_HTML = '<p>Today we talk budgets.</p><p>Chapters:</p><p>(00:00) Intro<br>(12:34) Forecasting<br>1:02:03 Wrap up</p>' +
  '<p>This episode is brought to you by Acme. Visit <a href="https://acme.example/promo">acme.example/promo</a> for 20% off.</p>' +
  '<p>John 3:16 is not a timestamp. Doors open at 10:30 am.</p>' +
  '<script>window.__xss = 1</script><img src="x" onerror="window.__xss2 = 1"><ul><li>One</li><li>Two</li></ul>';
function episode(id, opts) {
  opts = opts || {};
  var e = { type: 'episode', id: id, uri: 'spotify:episode:' + id, name: opts.name || ('Episode ' + id), release_date: '2026-11-20',
    duration_ms: opts.dur || 3900000, images: [], show: { id: 's1', name: 'Money Show', images: [] },
    resume_point: { fully_played: false, resume_position_ms: 0 } };
  if (opts.html !== undefined) e.html_description = opts.html;
  if (opts.desc !== undefined) e.description = opts.desc;
  return e;
}
function playerFor(ep, playing) {
  return { item: ep, currently_playing_type: 'episode', context: null, is_playing: playing !== false, progress_ms: 60000,
    device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
}
// script: [{m, path, q?, status, json}] matched once each, in order; env.player answers GET /me/player.
function setup(store, opts) {
  opts = opts || {};
  var env = { player: opts.player || null, script: opts.script || [] };
  var tab = H.makeTab(store, function (method, path, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    for (var i = 0; i < env.script.length; i++) {
      var s = env.script[i];
      if (!s.used && s.m === method && s.path === path && (!s.q || s.q(q))) { s.used = true; return { status: s.status, json: s.json }; }
    }
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: env.noDevice ? [] : [DEV] } };
    if (method === 'PUT' && /^\/me\/player\//.test(path)) return { status: 204 };
  });
  tab.env = env;
  return H.wait(500).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now();
    if (opts.setPlayer) { t.setPlayer(JSON.parse(JSON.stringify(opts.setPlayer))); t.state.playerAt = Date.now(); }
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function sheetOpen(tab) { return !d(tab).getElementById('notes').hidden; }
function stamps(tab) { return [].slice.call(d(tab).querySelectorAll('#notesBody .ts')); }
function bodyText(tab) { return d(tab).getElementById('notesBody').textContent; }
function reqs(tab, method, path) { return tab.calls.filter(function (c) { return c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path); }); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }

var tests = [];

// 1. Timestamp finder.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var f = tab.t().findStamps;
    function ms(line, dur) { return f(line, dur || 0).map(function (s) { return s.ms; }); }
    check('1 (00:00) Intro', JSON.stringify(ms('(00:00) Intro')) === '[0]', ms('(00:00) Intro'));
    check('1 12:34 at line start', JSON.stringify(ms('12:34 Forecasting')) === '[754000]');
    check('1 1:02:03 hours', JSON.stringify(ms('1:02:03 Wrap up')) === '[3723000]');
    check('1 [5:07] bracketed one-digit', JSON.stringify(ms('Skip to [5:07] for the answer')) === '[307000]');
    check('1 one-digit after punctuation', JSON.stringify(ms('Chapters: 0:00 Intro, 5:30 News; 9:15 Q&A')) === '[0,330000,555000]', ms('Chapters: 0:00 Intro, 5:30 News; 9:15 Q&A'));
    check('1 two-digit inside a line', JSON.stringify(ms('We get to it around 23:10 in')) === '[1390000]');
    check('1 "John 3:16" is text', ms('John 3:16 says').length === 0, ms('John 3:16 says'));
    check('1 "10:30 am" is a clock time', ms('Doors open at 10:30 am.').length === 0 && ms('Live 9:00 p.m. show').length === 0);
    check('1 bad seconds and long runs are text', ms('12:60 and 1:2:3 and 12:345 and 1:02:03:04').length === 0, ms('12:60 and 1:2:3 and 12:345 and 1:02:03:04'));
    check('1 past the end is text', JSON.stringify(ms('(10:00) a (59:00) b', 1800000)) === '[600000]');
    check('1 decimal 3:45.5 is text', ms('ratio 13:45.5').length === 0);
    check('1 after an emoji or arrow', JSON.stringify(ms('⏱ 3:45 Topic')) === '[225000]' && JSON.stringify(ms('→ 3:45 Topic')) === '[225000]');
    check('1 "05:30: Topic" counts', JSON.stringify(ms('05:30: Topic')) === '[330000]', ms('05:30: Topic'));
    check('1 "19:30 CET" is a clock time', ms('Doors 19:30 CET, starts 20:00 GMT').length === 0, ms('Doors 19:30 CET, starts 20:00 GMT'));
    check('1 "Intro 0:00" after a word stays text (known limit)', ms('Intro 0:00').length === 0);
    var one = f('Go (12:34) now', 0)[0];
    check('1 button covers only the digits', one && one.text === '12:34' && one.start === 4, one);
  });
});

// 2. Plain text from html_description: line breaks, no HTML run, links as text.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    var txt = t.notesText(episode('e1', { html: NOTES_HTML, desc: 'flat' }));
    return H.wait(100).then(function () {
      check('2 paragraphs become lines', /Today we talk budgets\.\n\nChapters:\n\n\(00:00\) Intro\n\(12:34\) Forecasting\n1:02:03 Wrap up/.test(txt), txt);
      check('2 script text dropped, nothing ran', txt.indexOf('__xss') === -1 && tab.w.__xss === undefined && tab.w.__xss2 === undefined, { txt: txt, x: tab.w.__xss, x2: tab.w.__xss2 });
      check('2 list items get bullets', /• One\n• Two/.test(txt), txt);
      check('2 sponsor read kept as written', txt.indexOf('This episode is brought to you by Acme. Visit acme.example/promo for 20% off.') !== -1, txt);
      check('2 falls back to description', t.notesText(episode('e2', { desc: '  Line one\r\nLine two  ' })) === 'Line one\nLine two');
      check('2 empty notes are known-empty', t.notesText(episode('e3', { desc: '', html: '' })) === '');
      check('2 no fields means unknown', t.notesText(episode('e4')) === null);
      check('2 <li><p> keeps the bullet on the line', /^• \(00:00\) Intro\n+• \(05:30\) News$/.test(t.notesText(episode('e5', { html: '<ul><li><p>(00:00) Intro</p></li><li><p>(05:30) News</p></li></ul>' }))), t.notesText(episode('e5', { html: '<ul><li><p>(00:00) Intro</p></li><li><p>(05:30) News</p></li></ul>' })));
      check('2 tag-free html keeps its line breaks', t.notesText(episode('e6', { html: 'Line one\n0:00 Intro\n5:30 News' })) === 'Line one\n0:00 Intro\n5:30 News');
      check('2 <pre> keeps its line breaks', /0:00 Intro\n5:30 News/.test(t.notesText(episode('e8', { html: '<p>x</p><pre>0:00 Intro\n5:30 News</pre>' }))));
    });
  });
});

// 3. A podcast's episode list: notes kept in memory only, Notes button on rows, sheet opens with 0 requests.
tests.push(function () {
  var store = H.seedStore();
  var eps = [episode('e1', { html: NOTES_HTML, desc: 'x' }), episode('e2', { desc: '' })];
  return setup(store, { script: [{ m: 'GET', path: '/shows/s1/episodes', status: 200, json: { items: eps, next: null, total: 2 } }] }).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'show', id: 's1', uri: 'spotify:show:s1', name: 'Money Show', url: 'https://open.spotify.com/show/s1', img: '' });
    return H.wait(600).then(function () {
      var saved = store.getItem('lib-cache-show:s1') || '';
      check('3 episode list loaded once', reqs(tab, 'GET', '/shows/s1/episodes').length === 1, tab.calls);
      check('3 saved copy has no notes', saved.length > 0 && saved.indexOf('budgets') === -1 && saved.indexOf('description') === -1, saved.slice(0, 200));
      check('3 not parsed until asked', !!t.epNotesRaw.e1 && !Object.prototype.hasOwnProperty.call(t.epNotes, 'e1'));
      check('3 notes kept in memory', t.notesFor('e1') && /Forecasting/.test(t.notesFor('e1').t));
      check('3 nothing written to the notes cache yet', store.getItem('lib-ep-notes') === null, store.getItem('lib-ep-notes'));
      var btn = d(tab).querySelector('li[data-puri="spotify:episode:e1"] button[aria-label^="Notes for"]');
      check('3 row has a Notes button', !!btn);
      tab.calls.length = 0;
      click(tab, btn);
      check('3 sheet open', sheetOpen(tab));
      check('3 title and meta', d(tab).getElementById('notesTitle').textContent === 'Episode e1' && /Money Show · .* · 1 hr 5 min/.test(d(tab).getElementById('notesMeta').textContent), d(tab).getElementById('notesMeta').textContent);
      check('3 three timestamp buttons', stamps(tab).map(function (b) { return b.textContent; }).join(',') === '00:00,12:34,1:02:03', stamps(tab).map(function (b) { return b.textContent; }));
      check('3 no links in the notes', d(tab).querySelectorAll('#notesBody a').length === 0);
      check('3 opening sent nothing', tab.calls.length === 0, tab.calls);
      var c = JSON.parse(store.getItem('lib-ep-notes') || '[]');
      check('3 opened notes kept on the phone', c.length === 1 && c[0].id === 'e1' && /Forecasting/.test(c[0].t), c);
      check('3 focus on Close', d(tab).activeElement && d(tab).activeElement.id === 'notesClose');
      d(tab).dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('3 Escape closes', !sheetOpen(tab));
      check('3 focus back on the row button', d(tab).activeElement === btn);
      var btn2 = d(tab).querySelector('li[data-puri="spotify:episode:e2"] button[aria-label^="Notes for"]');
      click(tab, btn2);
      check('3 empty notes say so', /This episode has no notes\./.test(bodyText(tab)) && !d(tab).querySelector('#notesBody .btn'), bodyText(tab));
      click(tab, d(tab).getElementById('notesBack'));
      check('3 backdrop closes', !sheetOpen(tab));
    });
  });
});

// 4. Timestamp when something else (or nothing) plays: plays the episode from there through the tap path.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.keepNotes(episode('e1', { html: NOTES_HTML }));
    t.openNotes(t.notesEp(t.latestItem({ id: 'e1', uri: 'spotify:episode:e1', name: 'Episode e1', showName: 'Money Show', date: '2026-11-20', durMs: 3900000, positionMs: 0, played: false })));
    var b = stamps(tab);
    click(tab, b[1]);
    return H.wait(300).then(function () {
      var plays = reqs(tab, 'PUT', '/me/player/play');
      check('4 one play request', plays.length === 1, tab.calls);
      check('4 plays that episode at 12:34', plays[0] && JSON.stringify(plays[0].body) === JSON.stringify({ uris: ['spotify:episode:e1'], position_ms: 754000 }) && /device_id=A/.test(plays[0].query), plays[0]);
      check('4 no seek', reqs(tab, 'PUT', '/me/player/seek').length === 0);
      check('4 sheet stays open', sheetOpen(tab));
      tab.calls.length = 0;
      click(tab, stamps(tab)[0]);
      return H.wait(300).then(function () {
        var p2 = reqs(tab, 'PUT', '/me/player/play');
        check('4 (00:00) sends position_ms 0, not the resume point', p2[0] && p2[0].body.position_ms === 0, p2[0] && p2[0].body);
      });
    });
  });
});

// 5. Timestamp while this episode plays: one seek.
tests.push(function () {
  var store = H.seedStore();
  var ep = episode('e1', { html: NOTES_HTML });
  var pl = playerFor(ep, true);
  return setup(store, { player: pl, setPlayer: pl }).then(function (tab) {
    var t = tab.t();
    t.openNotes(t.notesEp(t.state.player.item));
    click(tab, stamps(tab)[2]);
    return H.wait(300).then(function () {
      var seeks = reqs(tab, 'PUT', '/me/player/seek');
      check('5 one seek to 1:02:03', seeks.length === 1 && /position_ms=3723000/.test(seeks[0].query), tab.calls);
      check('5 no play', reqs(tab, 'PUT', '/me/player/play').length === 0);
      check('5 toast says where', tab.toasts().indexOf('Jumped to 1:02:03') !== -1, tab.toasts());
    });
  });
});

// 6. Same episode but paused: plays from there (one play request, not a seek).
tests.push(function () {
  var store = H.seedStore();
  var ep = episode('e1', { html: NOTES_HTML });
  var pl = playerFor(ep, false);
  return setup(store, { player: pl, setPlayer: pl }).then(function (tab) {
    var t = tab.t();
    t.openNotes(t.notesEp(t.state.player.item));
    click(tab, stamps(tab)[1]);
    return H.wait(300).then(function () {
      var plays = reqs(tab, 'PUT', '/me/player/play');
      check('6 paused: play at 12:34', plays.length === 1 && plays[0].body.position_ms === 754000 && reqs(tab, 'PUT', '/me/player/seek').length === 0, tab.calls);
    });
  });
});

// 7. Now Playing: Episode notes option, notes from the player answer, saved once per episode.
tests.push(function () {
  var store = H.seedStore();
  var ep = episode('e7', { html: NOTES_HTML, desc: 'flat' });
  var pl = playerFor(ep, true);
  var writes = 0;
  var orig = store.setItem;
  store.setItem = function (k, v) { if (k === 'lib-ep-notes') writes++; return orig.call(store, k, v); };
  return setup(store, { player: pl, setPlayer: pl }).then(function (tab) {
    var t = tab.t();
    t.setPlayer(JSON.parse(JSON.stringify(pl)));
    t.setPlayer(JSON.parse(JSON.stringify(pl)));
    check('7 notes saved once for the playing episode', writes === 1 && t.readNotes()[0].id === 'e7', { writes: writes });
    t.openNp();
    return H.wait(200).then(function () {
      var opt = [].slice.call(d(tab).querySelectorAll('#npOpts button')).filter(function (b) { return b.textContent === 'Episode notes'; })[0];
      check('7 Now Playing has Episode notes', !!opt, d(tab).getElementById('npOpts').textContent);
      tab.calls.length = 0;
      click(tab, opt);
      check('7 sheet shows the notes with 0 requests', sheetOpen(tab) && /Forecasting/.test(bodyText(tab)) && tab.calls.length === 0, tab.calls);
      check('7 sheet sits above Now Playing', !d(tab).getElementById('np').hidden);
      tab.w.__t.openDiag();
      var song = { item: { type: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song', duration_ms: 200000, album: { id: 'a1', name: 'A', images: [] }, artists: [{ name: 'X' }] },
        context: null, is_playing: true, progress_ms: 1000, device: DEV, shuffle_state: false, repeat_state: 'off', timestamp: Date.now() };
      t.closeNotes();
      return H.wait(1500).then(function () {
        var out = d(tab).getElementById('diagOut').textContent;
        check('7 Diagnostics shows notes counts and the answer\'s length', /Episode notes: 1 on this phone, 1 this visit · Now playing: 4 characters \(HTML \d+\)/.test(out), out.split('\n').filter(function (l) { return /Episode notes/.test(l); }));
        t.setPlayer(song);
        return H.wait(100);
      }).then(function () {
        var opt2 = [].slice.call(d(tab).querySelectorAll('#npOpts button')).filter(function (b) { return b.textContent === 'Episode notes'; });
        check('7 no Episode notes for songs', opt2.length === 0);
      });
    });
  });
});

// 8. A row with no notes in hand (Latest or history after a reload): Load notes = 1 catalog GET, kept after.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { script: [{ m: 'GET', path: '/episodes/e9', status: 200, json: episode('e9', { html: '<p>(05:00) Topic one</p>', desc: '(05:00) Topic one' }) }] }).then(function (tab) {
    var t = tab.t();
    var row = t.histRow({ id: 'e9', uri: 'spotify:episode:e9', name: 'Ep nine', show: { name: 'Money Show', images: [] }, duration_ms: 1800000, positionMs: 0, played: false, at: Date.now() });
    t.openNotes(t.notesEp(row));
    check('8 offers Load notes, sent nothing', /aren’t on this phone yet/.test(bodyText(tab)) && tab.calls.length === 0, bodyText(tab));
    var lb = d(tab).querySelector('#notesBody .btn');
    click(tab, lb);
    click(tab, lb);   // a double tap still sends one request
    return H.wait(300).then(function () {
      check('8 one GET /episodes/e9', reqs(tab, 'GET', '/episodes/e9').length === 1, tab.calls);
      check('8 notes shown with a timestamp', stamps(tab).length === 1 && stamps(tab)[0].textContent === '05:00', bodyText(tab));
      t.closeNotes();
      tab.calls.length = 0;
      t.openNotes(t.notesEp(row));
      check('8 reopening sends nothing', tab.calls.length === 0 && stamps(tab).length === 1);
      // A fresh tab (after a reload) still has them on the phone.
      return setup(store).then(function (tab2) {
        var t2 = tab2.t();
        t2.openNotes(t2.notesEp(row));
        check('8 after reload: from the phone, 0 requests', stamps(tab2).length === 1 && tab2.calls.length === 0, tab2.calls);
      });
    });
  });
});

// 9. Load notes while Spotify has paused podcast details: nothing sent, the pause is explained.
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-cooloff', JSON.stringify({ catalog: { until: Date.now() + 600000, reason: 'quota', strikes: 1, quotaAt: Date.now(), retryAfter: null, last429: { at: Date.now(), reason: 'quota', retryAfter: null, what: 'GET /episodes/x' } } }));
  return setup(store).then(function (tab) {
    var t = tab.t();
    t.openNotes({ id: 'e10', uri: 'spotify:episode:e10', name: 'Ep ten', showName: '', date: '', durMs: 0, url: '' });
    click(tab, d(tab).querySelector('#notesBody .btn'));
    return H.wait(200).then(function () {
      check('9 no request while paused', reqs(tab, 'GET', /^\/episodes\//).length === 0, tab.calls);
      check('9 explains the pause', !!d(tab).querySelector('#notesBody .err') && d(tab).querySelector('#notesBody .err').textContent.length > 5, bodyText(tab));
    });
  });
});

// 10. Phone cache limits: 40 episodes, 4,000 characters, "Load full notes" for a cut one.
tests.push(function () {
  var store = H.seedStore();
  var long = '(00:00) Start\n' + new Array(5000).join('x') + '\n(30:00) Late chapter';
  return setup(store, { script: [{ m: 'GET', path: '/episodes/long', status: 200, json: episode('long', { desc: long }) }] }).then(function (tab) {
    var t = tab.t();
    for (var i = 0; i < 45; i++) t.saveNotes('n' + i, 'notes ' + i);
    var c = t.readNotes();
    check('10 at most 40 kept, newest first', c.length === 40 && c[0].id === 'n44' && c[39].id === 'n5', { len: c.length, first: c[0].id, last: c[39] && c[39].id });
    t.saveNotes('long', long);
    var rec = t.readNotes()[0];
    check('10 cut to 4,000 characters and marked', rec.id === 'long' && rec.t.length === 4000 && rec.cut === true, { len: rec.t.length, cut: rec.cut });
    return setup(store, { script: [{ m: 'GET', path: '/episodes/long', status: 200, json: episode('long', { desc: long }) }] }).then(function (tab2) {
      var t2 = tab2.t();
      t2.openNotes({ id: 'long', uri: 'spotify:episode:long', name: 'Long', showName: '', date: '', durMs: 0, url: '' });
      check('10 cut notes offer Load full notes', /cut short on this phone/.test(bodyText(tab2)) && stamps(tab2).length === 1, bodyText(tab2).slice(0, 80));
      click(tab2, [].slice.call(d(tab2).querySelectorAll('#notesBody .btn')).filter(function (b) { return /Load full notes/.test(b.textContent); })[0]);
      return H.wait(300).then(function () {
        check('10 full notes after one request', reqs(tab2, 'GET', '/episodes/long').length === 1 && stamps(tab2).length === 2 && !/cut short/.test(bodyText(tab2)), { calls: tab2.calls, n: stamps(tab2).length });
      });
    });
  });
});

// 11. Saved episodes and search answers carry notes too (through the episode mapper).
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { script: [{ m: 'GET', path: '/me/episodes', q: function (q) { return q.get('limit') === '50'; }, status: 200, json: { items: [{ added_at: '2026-11-20T00:00:00Z', episode: episode('e11', { desc: '(01:00) Saved one' }) }], next: null, total: 1 } }] }).then(function (tab) {
    var t = tab.t();
    t.openDetail({ kind: 'episodes', name: 'Saved episodes', uri: null, url: 'https://open.spotify.com/collection/your-episodes' });
    return H.wait(500).then(function () {
      check('11 Saved episodes notes in memory', t.notesFor('e11') && t.notesFor('e11').t === '(01:00) Saved one', t.notesFor('e11'));
      var btn = d(tab).querySelector('li[data-puri="spotify:episode:e11"] button[aria-label^="Notes for"]');
      check('11 Saved episodes rows have Notes', !!btn);
    });
  });
});

// 12. Songs get no Notes button; the row's heart and + are still there for episodes.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    var song = t.itemRow({ kind: 'track', id: 't1', uri: 'spotify:track:t1', name: 'Song', url: 'https://open.spotify.com/track/t1', sub: 'x' });
    var ep = t.itemRow({ kind: 'episode', id: 'e1', uri: 'spotify:episode:e1', name: 'Ep', url: 'https://open.spotify.com/episode/e1', sub: 'x' });
    check('12 no Notes on songs', !song.querySelector('button[aria-label^="Notes for"]'));
    check('12 episode row: heart, +, Notes', ep.querySelectorAll('.acts button').length === 3 && !!ep.querySelector('button[aria-label^="Notes for"]'), ep.querySelectorAll('.acts button').length);
  });
});

// 13. Spotify asleep (no device, default wait mode): a "0:00" tap is saved to play at 0 after the wake, sheet closes.
tests.push(function () {
  var store = H.seedStore();
  return setup(store).then(function (tab) {
    var t = tab.t();
    tab.env.noDevice = true;
    t.state.device = null; t.state.deviceAt = 0; t.state.devicesAt = 0; t.state.active = null; t.state.devices = [];
    t.keepNotes(episode('e1', { html: NOTES_HTML }));
    t.openNotes({ id: 'e1', uri: 'spotify:episode:e1', name: 'Episode e1', showName: '', date: '', durMs: 3900000, url: '' });
    click(tab, stamps(tab)[0]);
    return H.wait(500).then(function () {
      var pend = JSON.parse(store.getItem('lib-pending') || 'null');
      check('13 waiting play kept at 0:00', pend && pend.item.uri === 'spotify:episode:e1' && pend.item.positionMs === 0 && pend.item.exactPos === true, pend);
      check('13 body would send position_ms 0', pend && t.playBody(pend.item).position_ms === 0, pend && t.playBody(pend.item));
      check('13 sheet closed so the wake line shows', !sheetOpen(tab));
      check('13 nothing played yet', reqs(tab, 'PUT', '/me/player/play').length === 0, tab.calls);
    });
  });
});
// 14. Signing out closes the notes sheet.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    t.openNotes({ id: 'e1', uri: 'spotify:episode:e1', name: 'E', showName: '', date: '', durMs: 0, url: '' });
    t.stopApp();
    check('14 sign-out closes notes', !sheetOpen(tab));
  });
});
// 15. Load notes when the player check already brought them: no request.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var t = tab.t();
    t.openNotes({ id: 'e15', uri: 'spotify:episode:e15', name: 'E', showName: '', date: '', durMs: 0, url: '' });
    t.keepNotes(episode('e15', { desc: '(01:00) Hi' }));
    click(tab, d(tab).querySelector('#notesBody .btn'));
    check('15 no request, notes drawn', tab.calls.filter(function (c) { return /^\/episodes\//.test(c.path); }).length === 0 && stamps(tab).length === 1, tab.calls);
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
