'use strict';
// Compact view (v2.51) tests: jsdom, mocked fetch, shared localStorage, a small layout stub (jsdom has no layout).
// Chip strip in one row that scrolls sideways, header title and status that hide on scroll, Compact player setting.
// Run: node tests/run.js compact-view  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var FILTER_IDX = { home: 0, playlists: 1, albums: 2, artists: 3, podcasts: 4, recent: 5, all: 6, search: 7 };
var STATUS_TOP = 50, STATUS_H = 22;   // the status line's box in the stub: --slim-h should be 72px

// Layout stub: chips are 80 px wide, 10 px apart, starting at 16 px; the strip is L.stripW wide; the status line
// sits at STATUS_TOP with STATUS_H height; window.pageYOffset is L.y; scrollLeft writes are counted.
function layout(L) {
  return function (w) {
    var P = w.HTMLElement.prototype;
    function isChip(e) { return e.classList && e.classList.contains('chip') && e.getAttribute('data-filter'); }
    function def(name, fn) { Object.defineProperty(P, name, { configurable: true, get: fn }); }
    def('offsetLeft', function () { return isChip(this) ? 16 + FILTER_IDX[this.getAttribute('data-filter')] * 90 : 0; });
    def('offsetWidth', function () { return isChip(this) ? 80 : 0; });
    def('clientWidth', function () { return this.classList && this.classList.contains('filters') ? L.stripW : 0; });
    def('offsetTop', function () { return this.id === 'status' ? STATUS_TOP : 0; });
    def('offsetHeight', function () { return this.id === 'status' ? (L.statusH || STATUS_H) : 0; });
    Object.defineProperty(P, 'scrollLeft', { configurable: true,
      get: function () { return this._sl || 0; }, set: function (v) { this._sl = v; L.scrollSets++; } });
    Object.defineProperty(w, 'pageYOffset', { configurable: true, get: function () { return L.y; } });
    Object.defineProperty(w, 'innerWidth', { configurable: true, get: function () { return L.w; } });
    Object.defineProperty(w, 'innerHeight', { configurable: true, get: function () { return L.h; } });
    if (L.matchMedia) w.matchMedia = L.matchMedia;
  };
}
function group(p) {   // the page's request groups (coolGroup)
  if (/^\/me\/player\/recently-played/.test(p)) return 'library';
  if (/^\/me\/player(\/|$)/.test(p)) return 'player';
  if (/^\/search/.test(p)) return 'search';
  if (/^\/(shows|episodes|albums|artists)\//.test(p)) return 'catalog';
  return 'library';
}
function counts(tab) {
  var c = { player: 0, library: 0, search: 0, catalog: 0 };
  tab.calls.forEach(function (x) { c[group(x.path)]++; });
  return c;
}
function none(tab) { return tab.calls.length === 0; }

function store0(opts) {
  opts = opts || {};
  var s = H.seedStore();
  s.setItem('lib-filter', JSON.stringify(opts.filter || 'home'));
  if (opts.compact !== undefined) s.setItem('lib-compact-player', opts.compact);
  if (opts.cool) s.setItem('lib-cooloff', JSON.stringify(opts.cool));
  return s;
}
function setup(store, opts) {
  opts = opts || {};
  var L = { y: 0, w: 375, h: 700, stripW: opts.stripW === undefined ? 300 : opts.stripW, scrollSets: 0, matchMedia: opts.matchMedia };
  var env = { player: opts.player || null };
  var tab = H.makeTab(store, function (method, path) {
    if (path === '/me/player' && method === 'GET') return env.player ? { status: 200, json: env.player } : { status: 204 };
    if (path === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
    if (path === '/me/library/contains') return { status: 200, json: [false] };
    if (/^\/me\/player\//.test(path) && method !== 'GET') return { status: 204 };
  }, { beforeParse: layout(L) });
  tab.L = L; tab.env = env;
  return H.wait(600).then(function () {
    var t = tab.t();
    if (!t) throw new Error('page did not start');
    t.state.device = DEV; t.state.deviceAt = Date.now(); t.state.devicesAt = Date.now();
    if (opts.player) { t.setPlayer(JSON.parse(JSON.stringify(opts.player))); t.state.playerAt = Date.now(); }
    return H.wait(100);
  }).then(function () {
    tab.calls.length = 0;
    tab.w.__toasts = [];
    return tab;
  });
}
function d(tab) { return tab.w.document; }
function $(tab, id) { return d(tab).getElementById(id); }
function q(tab, sel) { return d(tab).querySelector(sel); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function strip(tab) { return q(tab, '.filters'); }
function slimOn(tab) { return $(tab, 'top').classList.contains('slim'); }
function scrollTo(tab, y) { tab.L.y = y; tab.w.dispatchEvent(new tab.w.Event('scroll')); }
function scrollSteps(tab, from, to, step) {   // like a finger drag: many small scroll events
  var dir = to > from ? 1 : -1;
  for (var y = from; dir > 0 ? y <= to : y >= to; y += dir * step) scrollTo(tab, y);
  if (tab.L.y !== to) scrollTo(tab, to);
}
function css(tab, el) { return tab.w.getComputedStyle(el); }
function styleText(tab) { return [].map.call(d(tab).querySelectorAll('style'), function (s) { return s.textContent; }).join('\n'); }
function lastToast(tab) { var a = tab.toasts(); return a[a.length - 1] || ''; }
function setBox(tab, checked) { var b = $(tab, 'compactPlayer'); b.checked = checked; b.dispatchEvent(new tab.w.Event('change', { bubbles: true })); }

var tests = [];

// 1. Version, defaults, and the chip strip's CSS: one row, sideways scroll, 44 px tap height.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    check('1 version is v2.51', /^v2\.51 /.test(t.VERSION), t.VERSION);
    var s = css(tab, strip(tab));
    check('1 chips never wrap', s.flexWrap === 'nowrap', s.flexWrap);
    check('1 strip scrolls sideways', s.overflowX === 'auto', s.overflowX);
    var chip = q(tab, '.filters .chip');
    check('1 chips keep their width', css(tab, chip).flexShrink === '0' || css(tab, chip).flex.indexOf('none') === 0 || css(tab, chip).flex === '0 0 auto', css(tab, chip).flex);
    check('1 chip tap area is 44px tall', css(tab, chip).minHeight === '44px', css(tab, chip).minHeight);
    var pressed = q(tab, '.filters .chip[aria-pressed="true"]');
    check('1 pressed chip still paints only its 36px pill', css(tab, pressed).backgroundClip === 'padding-box', css(tab, pressed).backgroundClip);
    check('1 all 8 chips still there, Home first', d(tab).querySelectorAll('.filters .chip').length === 8 && chip.getAttribute('data-filter') === 'home');
    check('1 header not slim at start', !slimOn(tab));
    check('1 compact player off by default', !t.compactPlayer() && !d(tab).body.classList.contains('compact-player'));
    check('1 no compact key stored', tab.dom.window.localStorage.getItem('lib-compact-player') === null);
    check('1 Home chip already in view: strip not scrolled', strip(tab).scrollLeft === 0, strip(tab).scrollLeft);
  });
});

// 2. The selected chip is kept scrolled into view (only the strip moves; zero requests from the strip itself).
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    t.chipIntoView(q(tab, '.filters .chip[data-filter="search"]'));
    check('2 last chip (Search Spotify) scrolled into view', strip(tab).scrollLeft === 16 + 7 * 90 + 80 + 16 - 300, strip(tab).scrollLeft);
    check('2 chipIntoView: zero requests', none(tab), tab.calls);
    var sets = tab.L.scrollSets;
    t.chipIntoView(q(tab, '.filters .chip[data-filter="all"]'));
    check('2 a chip already in view: strip left alone', tab.L.scrollSets === sets && strip(tab).scrollLeft === 442, strip(tab).scrollLeft);
    t.chipIntoView(q(tab, '.filters .chip[data-filter="home"]'));
    check('2 first chip: back to the start', strip(tab).scrollLeft === 0, strip(tab).scrollLeft);
    t.chipIntoView(q(tab, '.filters .chip[data-filter="podcasts"]'));
    check('2 a chip past the right edge: just enough to show it plus 16px', strip(tab).scrollLeft === 16 + 4 * 90 + 80 + 16 - 300, strip(tab).scrollLeft);
    t.chipIntoView(null);
    check('2 no chip: nothing happens', strip(tab).scrollLeft === 172);
    tab.calls.length = 0;
    click(tab, q(tab, '.filters .chip[data-filter="artists"]'));
    check('2 tapping a chip: pressed and kept in view', q(tab, '.filters .chip[data-filter="artists"]').getAttribute('aria-pressed') === 'true' && strip(tab).scrollLeft === 172, strip(tab).scrollLeft);
    t.setFilter('search');
    check('2 setFilter(search) scrolls it into view', strip(tab).scrollLeft === 442, strip(tab).scrollLeft);
    t.setFilter('home');
    check('2 setFilter(home) scrolls back', strip(tab).scrollLeft === 0, strip(tab).scrollLeft);
  });
});

// 3. Start on the last chip (remembered filter): it's in view from the start. Header not laid out: nothing scrolls.
tests.push(function () {
  return setup(store0({ filter: 'search' })).then(function (tab) {
    check('3 remembered Search Spotify chip is in view at start', strip(tab).scrollLeft === 442 && q(tab, '.filters .chip[data-filter="search"]').getAttribute('aria-pressed') === 'true', strip(tab).scrollLeft);
    return setup(store0({ filter: 'search' }), { stripW: 0 });
  }).then(function (tab) {
    check('3 strip with no width (hidden header): no scroll writes', tab.L.scrollSets === 0 && strip(tab).scrollLeft === 0, tab.L.scrollSets);
  });
});

// 4. Scrolling down hides the title row and status line; scrolling up shows them; small jitters don't flip it.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t(), top = $(tab, 'top');
    scrollSteps(tab, 0, t.SLIM_MIN_Y, 10);
    check('4 near the top: still shown', !slimOn(tab));
    scrollSteps(tab, t.SLIM_MIN_Y, 400, 10);
    check('4 scrolling down: slim', slimOn(tab));
    check('4 --slim-h is the status line bottom', top.style.getPropertyValue('--slim-h') === (STATUS_TOP + STATUS_H) + 'px', top.style.getPropertyValue('--slim-h'));
    check('4 title row and status hidden (visibility)', css(tab, q(tab, '.toprow')).visibility === 'hidden' && css(tab, $(tab, 'status')).visibility === 'hidden');
    check('4 search box and chips stay visible', css(tab, $(tab, 'search')).visibility !== 'hidden' && css(tab, strip(tab)).visibility !== 'hidden' && css(tab, strip(tab)).display !== 'none');
    scrollTo(tab, 395);
    check('4 a 5px move up: still slim', slimOn(tab));
    scrollTo(tab, 400);
    scrollTo(tab, 393);
    check('4 direction change resets the count (7px up): still slim', slimOn(tab));
    scrollTo(tab, 380);
    check('4 scrolling up 20px: shown again', !slimOn(tab));
    scrollTo(tab, 386);
    check('4 a 6px move down: still shown', !slimOn(tab));
    scrollSteps(tab, 386, 600, 4);
    check('4 down again: slim', slimOn(tab));
    scrollTo(tab, 60);
    check('4 jump near the top: shown', !slimOn(tab));
    scrollTo(tab, 60);
    check('4 no movement: no change', !slimOn(tab));
    check('4 scrolling: zero requests', none(tab), counts(tab));
  });
});

// 5. Never while a text field is focused (iPhone keyboard up): no hide, and no show either.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    $(tab, 'search').focus();
    check('5 search focused: frozen', t.slimFrozen() === true);
    scrollSteps(tab, 0, 500, 20);
    check('5 search focused: never hides', !slimOn(tab));
    $(tab, 'search').blur();
    scrollSteps(tab, 500, 800, 20);
    check('5 after blur: hides again', slimOn(tab));
    $(tab, 'search').focus();
    scrollSteps(tab, 800, 300, 20);
    check('5 focused while slim: nothing moves', slimOn(tab));
    $(tab, 'search').blur();
    // Any text field, e.g. Find in songs: an input in the list counts too.
    var inp = d(tab).createElement('input'); inp.type = 'search'; $(tab, 'main').appendChild(inp); inp.focus();
    scrollSteps(tab, 300, 150, 20);
    check('5 another text field focused: still nothing moves', slimOn(tab));
    inp.blur();
    var cb = d(tab).createElement('input'); cb.type = 'checkbox'; $(tab, 'main').appendChild(cb); cb.focus();
    check('5 a checkbox with focus does not freeze', t.slimFrozen() === false);
    cb.blur();
    scrollSteps(tab, 150, 130, 5);
    check('5 after blur: scrolling up shows it', !slimOn(tab));
    scrollSteps(tab, 130, 700, 20);
    check('5 slim again', slimOn(tab));
    $(tab, 'diagBtn').focus();
    check('5 focus moving onto Diagnostics (in the title row): shown', !slimOn(tab));
    check('5 a focused header button does not freeze scrolling', t.slimFrozen() === false);
    scrollSteps(tab, 700, 1200, 20);
    check('5 with Diagnostics still focused (a sheet gave focus back), scrolling down hides it', slimOn(tab));
    $(tab, 'diagBtn').blur();
    $(tab, 'devBtn').hidden = false; $(tab, 'devBtn').focus();
    check('5 focus onto the status line device button: shown', !slimOn(tab));
    $(tab, 'devBtn').blur();
    check('5 zero requests', none(tab), counts(tab));
  });
});

// 6. Never while the wake message shows; it comes back at once when the message appears.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t();
    scrollSteps(tab, 0, 500, 20);
    check('6 slim before the message', slimOn(tab));
    t.showWake('Press play in Control Center or on the lock screen. “Song” starts as soon as Spotify wakes.', { pulse: true, open: true });
    check('6 wake message: shown at once', !slimOn(tab) && !$(tab, 'wake').hidden);
    scrollSteps(tab, 500, 1200, 20);
    check('6 wake message showing: scrolling down never hides', !slimOn(tab));
    t.setSlim(true);
    check('6 setSlim(true) refused while the message shows', !slimOn(tab));
    t.stopWake();
    scrollSteps(tab, 1200, 1500, 20);
    check('6 message gone: hides again', slimOn(tab));
    t.showWake(null);
    check('6 showWake(null) leaves it slim', slimOn(tab));
    check('6 zero requests', none(tab), counts(tab));
  });
});

// 7. Safari's bounce at the bottom is not a change of direction; Now Playing open freezes it.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var de = d(tab).documentElement;
    Object.defineProperty(de, 'scrollHeight', { configurable: true, get: function () { return 1000 + tab.w.innerHeight; } });
    scrollSteps(tab, 0, 1000, 25);
    check('7 slim at the bottom', slimOn(tab));
    scrollTo(tab, 1080); scrollTo(tab, 1040); scrollTo(tab, 1000);
    check('7 bounce past the bottom and back: still slim', slimOn(tab));
    d(tab).body.classList.add('npopen');
    scrollTo(tab, 200);
    check('7 Now Playing open: frozen', slimOn(tab));
    d(tab).body.classList.remove('npopen');
    scrollTo(tab, 180);
    check('7 closed again: scrolling up shows it', !slimOn(tab));
    scrollTo(tab, -40);
    check('7 bounce above the top: shown', !slimOn(tab));
  });
});

// 8. Motion: a short slide normally, instant under reduced motion (CSS); sign-out resets it.
tests.push(function () {
  var reduce = function (q) { return { matches: /reduce/.test(q), addEventListener: function () {}, addListener: function () {} }; };
  return setup(store0(), { matchMedia: reduce }).then(function (tab) {
    var txt = styleText(tab);
    check('8 the header slides (transition on top)', /header\.top \{ transition: top 0\.2s/.test(txt));
    var rm = txt.match(/@media \(prefers-reduced-motion: reduce\) \{\s*header\.top, header\.top\.slim \.toprow, header\.top\.slim \.status \{ transition: none; \}/);
    check('8 reduced motion: no transition (instant)', !!rm);
    check('8 slim offset keeps the safe area', /header\.top\.slim \{ top: calc\(env\(safe-area-inset-top, 0px\) - var\(--slim-h, 0px\)\); \}/.test(txt));
    scrollSteps(tab, 0, 500, 20);
    check('8 slim', slimOn(tab));
    tab.t().stopApp();
    check('8 sign-out: header no longer slim', !slimOn(tab));
    scrollSteps(tab, 0, 900, 20);
    check('8 signed out: scrolling never slims', !slimOn(tab));
  });
});

// 9. Song list (detail) view: hides the same way; opening it and coming back keeps the strip and chips.
tests.push(function () {
  var store = store0({ filter: 'albums' });
  store.setItem('lib-cache', JSON.stringify({ at: Date.now(), me: { id: 'me1' }, playlists: [], albums: [{ kind: 'album', id: 'al1', name: 'Blue', uri: 'spotify:album:al1', img: '', sub: 'X' }], artists: [], shows: [] }));
  return setup(store).then(function (tab) {
    var t = tab.t();
    check('9 albums chip in view', strip(tab).scrollLeft === 0 && q(tab, '.filters .chip[data-filter="albums"]').getAttribute('aria-pressed') === 'true');
    scrollSteps(tab, 0, 500, 20);
    check('9 slim in the list', slimOn(tab));
    scrollTo(tab, 0);
    check('9 back at the top: shown', !slimOn(tab));
    var r = t.openDetail({ kind: 'album', id: 'al1', name: 'Blue', uri: 'spotify:album:al1', img: '', sub: 'X' });
    return Promise.resolve(r).then(function () { return H.wait(150); }).then(function () {
      check('9 detail view open', $(tab, 'top').classList.contains('detail'));
      tab.calls.length = 0;
      scrollSteps(tab, 0, 500, 20);
      check('9 slim in the song list too', slimOn(tab) && $(tab, 'top').classList.contains('detail'));
      scrollSteps(tab, 500, 460, 5);
      check('9 scrolling up in the song list: shown', !slimOn(tab));
      check('9 detail scrolling: zero requests', none(tab), counts(tab));
    });
  });
});

// 10. Compact player setting: off by default, on via Diagnostics, stored, zero requests, Diagnostics line.
tests.push(function () {
  var store = store0();
  return setup(store, { player: H.song() }).then(function (tab) {
    var t = tab.t();
    t.openDiag();
    return H.wait(200).then(function () {
      check('10 setting is in Diagnostics, unchecked', !!$(tab, 'compactPlayer') && $(tab, 'compactPlayer').checked === false);
      check('10 its label', /Compact player/.test($(tab, 'compactPlayer').parentNode.textContent));
      check('10 Diagnostics says off', /Compact player: off/.test($(tab, 'diagOut').textContent), $(tab, 'diagOut').textContent.slice(0, 300));
      check('10 checkbox row is a 44px tap target', css(tab, $(tab, 'compactPlayer').parentNode).minHeight === '44px');
      t.closeDiag();
      tab.calls.length = 0;
      setBox(tab, true);
      check('10 on: body class', d(tab).body.classList.contains('compact-player'));
      check('10 on: stored as true', store.getItem('lib-compact-player') === 'true', store.getItem('lib-compact-player'));
      check('10 on: zero requests', none(tab), counts(tab));
      check('10 on: no toast', tab.toasts().length === 0, tab.toasts());
      t.openDiag();
      return H.wait(200);
    }).then(function () {
      check('10 reopened Diagnostics shows it checked', $(tab, 'compactPlayer').checked === true);
      check('10 Diagnostics says on', /Compact player: on/.test($(tab, 'diagOut').textContent));
      t.closeDiag();
      tab.calls.length = 0;
      setBox(tab, false);
      check('10 off: class gone', !d(tab).body.classList.contains('compact-player'));
      check('10 off: key removed', store.getItem('lib-compact-player') === null);
      check('10 off: zero requests', none(tab), counts(tab));
    });
  });
});

// 10b. Closing Diagnostics gives focus back to its button (main's sheet focus rule); the header still hides afterwards.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    click(tab, $(tab, 'diagBtn'));
    return H.wait(200).then(function () {
      click(tab, $(tab, 'diagClose'));
      return H.wait(100);
    }).then(function () {
      check('10b focus back on Diagnostics', d(tab).activeElement === $(tab, 'diagBtn'), d(tab).activeElement && d(tab).activeElement.id);
      scrollSteps(tab, 0, 600, 20);
      check('10b scrolling down after closing Diagnostics still hides the title row', slimOn(tab));
      scrollSteps(tab, 600, 560, 5);
      check('10b and scrolling up shows it', !slimOn(tab));
    });
  });
});

// 11. Compact bar: one row (cover, title, Play/Pause, Next); other controls hidden from the bar, still on the
//     full Now Playing screen; padding and toast offset follow the shorter bar.
tests.push(function () {
  return setup(store0({ compact: 'true' }), { player: H.song() }).then(function (tab) {
    var b = d(tab).body;
    check('11 stored setting applies at start', b.classList.contains('compact-player') && b.classList.contains('has-player') && !$(tab, 'player').hidden);
    ['pQueue', 'pHeart', 'pShuffle', 'pPrev', 'pRepeat'].forEach(function (id) {
      check('11 ' + id + ' hidden from the bar', css(tab, $(tab, id)).display === 'none', css(tab, $(tab, id)).display);
    });
    ['pInfo', 'pCover', 'pPlay', 'pNext'].forEach(function (id) {
      check('11 ' + id + ' still in the bar', css(tab, $(tab, id)).display !== 'none');
    });
    check('11 one row: inner is a flex row', css(tab, q(tab, '.pinner')).display === 'flex' && css(tab, q(tab, '.pctl')).marginTop === '0px');
    check('11 Play/Pause is 44px', css(tab, $(tab, 'pPlay')).width === '44px' && css(tab, $(tab, 'pPlay')).height === '44px');
    check('11 Next is 44px (40px in the usual bar)', css(tab, $(tab, 'pNext')).width === '44px' && css(tab, $(tab, 'pNext')).height === '44px', css(tab, $(tab, 'pNext')).width);
    check('11 cover tap area 44px', css(tab, $(tab, 'pCover')).height === '44px');
    var txt = styleText(tab);
    check('11 body padding follows the shorter bar (88px + safe area)', /body\.compact-player\.has-player \{ padding-bottom: calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\); \}/.test(txt));
    check('11 toast offset follows (84px + safe area)', /body\.compact-player\.has-player \.toast \{ bottom: calc\(84px \+ env\(safe-area-inset-bottom, 0px\)\); \}/.test(txt));
    check('11 bar keeps the bottom safe area', /\.player \{[^}]*padding-bottom: env\(safe-area-inset-bottom, 0px\)/.test(txt));
    // Full Now Playing screen still has every control.
    tab.t().openNp();
    var np = $(tab, 'np');
    check('11 tapping the title opens Now Playing', !np.hidden);
    ['npShuffle', 'npPrev', 'npPlay', 'npNext', 'npRepeat', 'npHeart', 'npQueue'].forEach(function (id) {
      check('11 Now Playing screen keeps ' + id, css(tab, $(tab, id)).display !== 'none');
    });
    tab.t().closeNp();
  });
});

// 12. Compact bar buttons send what the usual bar sends (same counts per group); paused player group sends nothing.
tests.push(function () {
  var counted = {};
  function run(compact) {
    return setup(store0(compact ? { compact: 'true' } : {}), { player: H.song() }).then(function (tab) {
      click(tab, $(tab, 'pNext'));
      return H.wait(50).then(function () {
        counted[compact ? 'compact' : 'usual'] = { c: counts(tab), paths: tab.calls.map(function (x) { return x.method + ' ' + x.path; }) };
      });
    });
  }
  return run(false).then(function () { return run(true); }).then(function () {
    check('12 Next in the compact bar: one player request', counted.compact.c.player === 1 && counted.compact.paths[0] === 'POST /me/player/next', counted.compact);
    check('12 same requests per group as the usual bar', JSON.stringify(counted.compact.c) === JSON.stringify(counted.usual.c), counted);
    var now = Date.now();
    return setup(store0({ compact: 'true', cool: { player: { until: now + 600000, reason: 'rate', strikes: 0 } } }), { player: H.song() });
  }).then(function (tab) {
    click(tab, $(tab, 'pNext'));
    click(tab, $(tab, 'pPlay'));
    return H.wait(50).then(function () {
      check('12 player group paused: Next and Play send nothing', counts(tab).player === 0, tab.calls);
      check('12 page still compact while paused', d(tab).body.classList.contains('compact-player'));
    });
  });
});

// 13. Asleep in the compact bar: the idle line is kept to one line; tapping Play still resumes through the usual path.
tests.push(function () {
  return setup(store0({ compact: 'true' }), { player: H.song() }).then(function (tab) {
    var t = tab.t();
    t.setPlayer(null);   // Spotify went to sleep: the last song shows as paused
    var sub = $(tab, 'pSub');
    check('13 asleep line shows', sub.classList.contains('idle') && /asleep/.test(sub.textContent), sub.textContent);
    check('13 one line in the compact bar', css(tab, sub).webkitLineClamp === '1' || /body\.compact-player \.pinfo \.sub\.idle \{ -webkit-line-clamp: 1; \}/.test(styleText(tab)));
    check('13 Play still shown', css(tab, $(tab, 'pPlay')).display !== 'none' && $(tab, 'pPlay').getAttribute('aria-label') === 'Play');
    check('13 full message still on the Now Playing screen', /asleep/.test($(tab, 'npIdle').textContent));
  });
});

// 14. Storage limits: a full or blocked storage still applies the setting for this visit and says so;
//     a bad stored value counts as off; another tab's change applies here.
tests.push(function () {
  var store = store0();
  var realSet = store.setItem, realRemove = store.removeItem;
  return setup(store, { player: H.song() }).then(function (tab) {
    var t = tab.t();
    store.setItem = function (k, v) { if (k === 'lib-compact-player') { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(store, k, v); };
    setBox(tab, true);
    check('14 quota: still applies now', d(tab).body.classList.contains('compact-player') && t.compactPlayer() === true);
    check('14 quota: says it lasts until reload', /Couldn’t save this setting on this phone\. It applies until you reload the page\./.test(lastToast(tab)), tab.toasts());
    check('14 quota: nothing stored', store.getItem('lib-compact-player') === null);
    store.removeItem = function (k) { if (k === 'lib-compact-player') throw new Error('blocked'); return realRemove.call(store, k); };
    setBox(tab, false);
    check('14 blocked remove: off applies now', !d(tab).body.classList.contains('compact-player') && t.compactPlayer() === false);
    store.setItem = realSet; store.removeItem = realRemove;
    tab.w.__toasts = [];
    setBox(tab, true);
    check('14 storage works again: stored, no toast', store.getItem('lib-compact-player') === 'true' && tab.toasts().length === 0, tab.toasts());
    // Another tab turns it off.
    store.removeItem('lib-compact-player');
    tab.w.dispatchEvent(new tab.w.StorageEvent('storage', { key: 'lib-compact-player', newValue: null }));
    check('14 another tab turned it off: applies here', !d(tab).body.classList.contains('compact-player'));
    check('14 zero requests', counts(tab).player === 0 && counts(tab).library === 0 && counts(tab).search === 0 && counts(tab).catalog === 0, tab.calls);
    return setup(store0({ compact: 'not json' }), { player: H.song() });
  }).then(function (tab) {
    check('14 unreadable value: off', !d(tab).body.classList.contains('compact-player'));
    return setup(store0({ compact: '"yes"' }), { player: H.song() });
  }).then(function (tab) {
    check('14 any value but true: off', !d(tab).body.classList.contains('compact-player'));
  });
});

// 15. Nearby features: no player means no bar and no padding; the usual bar is unchanged with the setting off;
//     theme setting unaffected; Home "See all" still selects (and shows) its chip.
tests.push(function () {
  return setup(store0({ compact: 'true' })).then(function (tab) {
    check('15 nothing playing: bar hidden, no has-player', $(tab, 'player').hidden && !d(tab).body.classList.contains('has-player'));
    return setup(store0(), { player: H.song() });
  }).then(function (tab) {
    ['pQueue', 'pHeart', 'pShuffle', 'pPrev', 'pRepeat', 'pPlay', 'pNext'].forEach(function (id) {
      check('15 usual bar keeps ' + id, css(tab, $(tab, id)).display !== 'none');
    });
    check('15 usual bar keeps two rows (pctl margin)', css(tab, q(tab, '.pctl')).marginTop === '2px');
    var r = d(tab).querySelector('input[name="theme"][value="dark"]');
    r.checked = true; r.dispatchEvent(new tab.w.Event('change'));
    check('15 theme still works next to it', d(tab).documentElement.getAttribute('data-theme') === 'dark' && !d(tab).body.classList.contains('compact-player'));
    tab.t().setFilter('playlists');
    check('15 setFilter still presses only one chip', d(tab).querySelectorAll('.filters .chip[aria-pressed="true"]').length === 1);
  });
});

// 16. Review fix: typing near the top. The filter shrinks the list, Safari moves to the top while the search box is
//     focused: the header comes back at once (and on focusout if no scroll event follows), so a short list isn't stuck.
tests.push(function () {
  return setup(store0({ filter: 'all' })).then(function (tab) {
    var t = tab.t(), box = $(tab, 'search');
    scrollSteps(tab, 0, 2000, 20);
    check('16 slim after scrolling down', slimOn(tab));
    box.focus();
    scrollTo(tab, 0);
    check('16 at the top while typing: shown at once', !slimOn(tab));
    box.blur(); scrollTo(tab, 0);
    check('16 after blur at the top: shown', !slimOn(tab));
    // Slim, focused, page moves to the top with no scroll event after blur: focusout shows it.
    scrollSteps(tab, 0, 2000, 20);
    box.focus();
    tab.L.y = 0;   // moved without a scroll event reaching the page
    check('16 still slim before blur (no event yet)', slimOn(tab));
    box.blur();
    return H.wait(20).then(function () {
      check('16 focusout near the top: shown', !slimOn(tab));
      scrollTo(tab, 0);
      check('16 a scroll event with no movement at the top: still shown', !slimOn(tab));
      scrollSteps(tab, 0, 1500, 20);
      box.focus(); box.blur();
      return H.wait(20);
    }).then(function () {
      check('16 focusout far down: stays slim', slimOn(tab));
      var c = counts(tab);   // only the page's own timed player check may run meanwhile
      check('16 no library, search or catalog requests', c.library === 0 && c.search === 0 && c.catalog === 0, tab.calls);
    });
  });
});

// 17. Review fix: the status line changes length while slim (device check, cool-off line): --slim-h follows.
tests.push(function () {
  return setup(store0()).then(function (tab) {
    var t = tab.t(), top = $(tab, 'top');
    scrollSteps(tab, 0, 600, 20);
    check('17 slim with a one-line status', slimOn(tab) && top.style.getPropertyValue('--slim-h') === '72px', top.style.getPropertyValue('--slim-h'));
    tab.L.statusH = 44;
    t.state.device = null; t.state.deviceChecked = true;
    t.showStatus();
    check('17 status wraps to two lines: re-measured by showStatus', top.style.getPropertyValue('--slim-h') === '94px', top.style.getPropertyValue('--slim-h'));
    tab.L.statusH = 22;
    t.paintCool();
    check('17 re-measured by paintCool', top.style.getPropertyValue('--slim-h') === '72px', top.style.getPropertyValue('--slim-h'));
    tab.L.statusH = 30;
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('17 re-measured on resize', top.style.getPropertyValue('--slim-h') === '80px', top.style.getPropertyValue('--slim-h'));
    scrollTo(tab, 50);
    tab.L.statusH = 44; t.showStatus();
    check('17 not slim: showStatus leaves it alone', !slimOn(tab) && top.style.getPropertyValue('--slim-h') === '80px', top.style.getPropertyValue('--slim-h'));
  });
});

// 18. Review fix: Safari's toolbar collapsing (height-only resize) keeps a sideways swipe; rotating re-centres.
tests.push(function () {
  return setup(store0({ filter: 'home' })).then(function (tab) {
    strip(tab).scrollLeft = 300;   // the user swiped the chips sideways
    tab.L.h = 760;
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('18 toolbar collapse (height only): swipe kept', strip(tab).scrollLeft === 300, strip(tab).scrollLeft);
    tab.L.w = 667; tab.L.stripW = 600;
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('18 rotation (width change): selected chip back in view', strip(tab).scrollLeft === 0, strip(tab).scrollLeft);
    strip(tab).scrollLeft = 120;
    tab.w.dispatchEvent(new tab.w.Event('resize'));
    check('18 another height-only resize: swipe kept', strip(tab).scrollLeft === 120, strip(tab).scrollLeft);
  });
});

// 19. Review fix: another tab's change applies before sign-in too, and repaints an open Diagnostics checkbox.
tests.push(function () {
  var store = H.makeStore();
  store.setItem('lib-client-id', JSON.stringify('fakeclient'));   // no token: the sign-in screen
  var tab = H.makeTab(store, function () {}, { beforeParse: layout({ y: 0, w: 375, h: 700, stripW: 300, scrollSets: 0 }) });
  return H.wait(500).then(function () {
    var t = tab.t();
    check('19 signed out', t.state.started === false);
    store.setItem('lib-compact-player', 'true');
    tab.w.dispatchEvent(new tab.w.StorageEvent('storage', { key: 'lib-compact-player', newValue: 'true' }));
    check('19 another tab turned it on before sign-in: applies', d(tab).body.classList.contains('compact-player'));
    check('19 nothing sent', tab.calls.length === 0, tab.calls);
    return setup(store0(), { player: H.song() });
  }).then(function (tab) {
    var t = tab.t();
    t.openDiag();
    return H.wait(200).then(function () {
      check('19 diag open, unchecked', $(tab, 'compactPlayer').checked === false);
      tab.dom.window.localStorage.setItem('lib-compact-player', 'true');
      tab.w.dispatchEvent(new tab.w.StorageEvent('storage', { key: 'lib-compact-player', newValue: 'true' }));
      check('19 open Diagnostics checkbox repainted', $(tab, 'compactPlayer').checked === true && d(tab).body.classList.contains('compact-player'));
      t.closeDiag();
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
