'use strict';
// Tap feedback tests (smooth/tap-feedback): pressed look on the bar, top bar and sheets (touch listeners + scoped tap
// highlight), sheet slide-in, Now Playing close slide, theme-color metas. jsdom has no layout, no :active and drops
// -webkit- properties, so CSS is checked in the page's source text. Run: node test.js [path to index.html]
if (process.argv[2]) process.env.SRC = process.argv[2];
var fs = require('fs');
var path = require('path');
var H = require('./harness');
var SRC = process.env.SRC || path.resolve(__dirname, '..', '..', '..', 'index.html');
var TEXT = fs.readFileSync(SRC, 'utf8');
var CSS = (TEXT.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
var PLAYING = H.song('spotify:track:t1');

// CSS helpers on the source text (comments stripped).
var PLAIN = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
function rulesWith(decl) {   // [{ sel, body }] for every plain rule whose body contains decl
  var out = [], re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(PLAIN))) if (m[2].indexOf(decl) >= 0) out.push({ sel: m[1].trim(), body: m[2].trim() });
  return out;
}
function rule(sel) {   // body of the rule whose selector list is exactly sel
  var re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(PLAIN))) if (m[1].trim() === sel) return m[2].trim();
  return null;
}
function keyframes(name) {   // the text inside @keyframes name { ... }
  var i = PLAIN.indexOf('@keyframes ' + name + ' {');
  if (i < 0) return null;
  var depth = 0, start = PLAIN.indexOf('{', i);
  for (var j = start; j < PLAIN.length; j++) {
    if (PLAIN[j] === '{') depth++;
    else if (PLAIN[j] === '}' && --depth === 0) return PLAIN.slice(start + 1, j);
  }
  return null;
}
function props(block) { return (block.match(/[a-z-]+(?=\s*:)/g) || []).filter(function (p, i, a) { return a.indexOf(p) === i; }); }
function reducedBlocks() {   // bodies of every @media (prefers-reduced-motion: reduce) { ... } block
  var out = [], key = '@media (prefers-reduced-motion: reduce) {', i = 0;
  while ((i = PLAIN.indexOf(key, i)) >= 0) {
    var depth = 0, start = i + key.length - 1;
    for (var j = start; j < PLAIN.length; j++) {
      if (PLAIN[j] === '{') depth++;
      else if (PLAIN[j] === '}' && --depth === 0) { out.push(PLAIN.slice(start + 1, j)); break; }
    }
    i = start;
  }
  return out;
}

// listens: records every addEventListener call with its target and options.
function setup(store, opts) {
  opts = opts || {};
  var listens = [];
  var tab = H.makeTab(store, function (method, p) {
    if (p === '/me/player' && method === 'GET') return opts.player ? { status: 200, json: opts.player } : { status: 204 };
    if (p === '/me/player/devices') return { status: 200, json: { devices: [DEV] } };
  }, {
    matchMedia: opts.matchMedia,
    beforeParse: function (w) {
      var orig = w.EventTarget.prototype.addEventListener;
      w.EventTarget.prototype.addEventListener = function (type, fn, o) {
        listens.push({ type: type, target: this, passive: !!(o && typeof o === 'object' && o.passive) });
        return orig.apply(this, arguments);
      };
    }
  });
  tab.listens = listens;
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
function np(tab) { return d(tab).getElementById('np'); }
function click(tab, node) { node.dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function metas(tab) { return [].map.call(d(tab).querySelectorAll('meta[name="theme-color"]'), function (m) { return { media: m.getAttribute('media'), content: m.getAttribute('content') }; }); }
function pickTheme(tab, v) {
  var r = d(tab).querySelector('input[name="theme"][value="' + v + '"]');
  r.checked = true;
  r.dispatchEvent(new tab.w.Event('change', { bubbles: true }));
}

var tests = [];

// 1. Pressed look: a passive touchstart on #player, #top and every sheet; none on the document.
tests.push(function () {
  return setup(H.seedStore()).then(function (tab) {
    var doc = d(tab);
    function passiveTouch(node) { return tab.listens.some(function (l) { return l.type === 'touchstart' && l.target === node && l.passive; }); }
    check('1 passive touchstart on #player', passiveTouch(doc.getElementById('player')));
    check('1 passive touchstart on #top', passiveTouch(doc.getElementById('top')));
    var sheets = [].slice.call(doc.querySelectorAll('.sheet'));
    var missing = sheets.filter(function (s) { return !passiveTouch(s); }).map(function (s) { return s.id; });
    check('1 passive touchstart on every sheet', sheets.length >= 6 && missing.length === 0, { count: sheets.length, missing: missing });
    var wide = tab.listens.filter(function (l) { return l.type === 'touchstart' && (l.target === doc || l.target === tab.w || l.target === doc.body || l.target === doc.documentElement); });
    check('1 no touchstart on the document, window or body (list rows must not dim as a scroll starts)', wide.length === 0, wide.length);
    var notPassive = tab.listens.filter(function (l) { return (l.type === 'touchstart' || l.type === 'touchmove') && !l.passive; });
    check('1 every touch listener is passive (scrolling is never held up)', notPassive.length === 0, notPassive.length);
  });
});

// 2. Tap highlight: transparent only for buttons with their own pressed look in those containers.
tests.push(function () {
  var rs = rulesWith('-webkit-tap-highlight-color: transparent');
  var sels = [];
  rs.forEach(function (r) { r.sel.split(',').forEach(function (s) { sels.push(s.trim()); }); });
  var bare = sels.filter(function (s) { return /^(a|button|\.slider|\*|html|body)$/.test(s); });
  check('2 no tap-highlight rule on bare a, button or .slider', bare.length === 0, bare);
  ['#player button.act', '#player button.pinfo', '#top button.act', '.sheet button.act'].forEach(function (s) {
    check('2 transparent tap highlight on ' + s, sels.indexOf(s) >= 0, sels);
  });
  var stray = sels.filter(function (s) { return !/^(#player|#top|\.sheet) /.test(s) && s !== '.notes-text .ts' && s !== '.rmrow'; });   // .rmrow: main's v2.51 row menu rows (in a sheet, own :active)
  check('2 every transparent tap highlight is scoped to the bar, the top bar or a sheet', stray.length === 0, stray);
  ['.act:active', '.pinfo:active'].forEach(function (s) { check('2 ' + s + ' pressed style exists for those buttons', rule(s) !== null); });
});

// 3. Sheets slide up and the scrim fades in; off with Reduce Motion; re-renders don't replay it.
tests.push(function () {
  var up = keyframes('sheetUp'), fade = keyframes('sheetFade');
  check('3 sheetUp keyframes animate only transform', up && JSON.stringify(props(up)) === '["transform"]', up);
  check('3 sheetUp starts below the screen', up && /from\s*\{\s*transform:\s*translateY\(100%\)/.test(up), up);
  check('3 sheetFade keyframes animate only opacity', fade && JSON.stringify(props(fade)) === '["opacity"]', fade);
  var panel = rule('.sheet:not([hidden]) .sheet-panel'), back = rule('.sheet:not([hidden]) .sheet-back');
  check('3 panel slides in 0.22 s', panel && /animation:\s*sheetUp 0\.22s ease-out/.test(panel), panel);
  check('3 scrim fades in 0.22 s', back && /animation:\s*sheetFade 0\.22s ease-out/.test(back), back);
  var rm = reducedBlocks().join('\n');
  check('3 Reduce Motion turns both off', /\.sheet:not\(\[hidden\]\) \.sheet-panel,\s*\.sheet:not\(\[hidden\]\) \.sheet-back\s*\{\s*animation:\s*none/.test(rm), rm);
  return setup(H.seedStore(), { setPlayer: PLAYING }).then(function (tab) {
    var t = tab.t(), doc = d(tab), sh = doc.getElementById('sheet');
    var p = sh.querySelector('.sheet-panel'), b = sh.querySelector('.sheet-back');
    check('3 closed sheet: the slide rule does not match', !p.matches('.sheet:not([hidden]) .sheet-panel'));
    t.openSheet();
    check('3 open sheet: panel and scrim match the slide rules', p.matches('.sheet:not([hidden]) .sheet-panel') && b.matches('.sheet:not([hidden]) .sheet-back'));
    check('3 scroll lock from #20 still applies', doc.body.classList.contains('sheetopen'));
    var flips = 0, mo = new tab.w.MutationObserver(function (ms) { flips += ms.length; });
    mo.observe(sh, { attributes: true, attributeFilter: ['hidden'] });
    return H.wait(400).then(function () {   // the device list loads and the sheet re-renders while open
      return Promise.resolve().then(function () {
        check('3 re-render inside the open sheet does not toggle hidden (no replayed slide)', flips === 0 && !sh.hidden, flips);
        mo.disconnect();
        t.closeSheet();
        check('3 closing is instant: hidden and unlocked at once', sh.hidden && !doc.body.classList.contains('sheetopen'));
      });
    });
  });
});

// 4. Now Playing close slide: CSS that beats [hidden] on a phone.
tests.push(function () {
  var c = rule('.npfull[hidden].closing');
  check('4 .npfull[hidden].closing has display: block !important (beats [hidden] { display: none !important })', c && /display:\s*block\s*!important/.test(c), c);
  check('4 [hidden] is still display: none !important (why the !important above is needed)', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(PLAIN));
  check('4 closing runs npDown 0.2 s forwards, taps pass through', c && /animation:\s*npDown 0\.2s ease-in forwards/.test(c) && /pointer-events:\s*none/.test(c), c);
  var k = keyframes('npDown');
  check('4 npDown keyframes animate only transform, ending below the screen', k && JSON.stringify(props(k)) === '["transform"]' && /to\s*\{\s*transform:\s*translateY\(100%\)/.test(k), k);
});

// 5. Now Playing close slide: behaviour.
tests.push(function () {
  return setup(H.seedStore(), { setPlayer: PLAYING, player: PLAYING }).then(function (tab) {
    var t = tab.t(), n = np(tab), doc = d(tab);
    t.openNp();
    check('5 open: shown, no closing class', !n.hidden && !n.classList.contains('closing') && t.npShown());
    click(tab, doc.getElementById('npClose'));
    check('5 close button: hidden at once (scripts and VoiceOver see it closed)', n.hidden === true && t.npShown() === false);
    check('5 close button: closing class and inert during the slide', n.classList.contains('closing') && n.hasAttribute('inert'));
    check('5 close button: page behind is usable at once', !doc.querySelector('.wrap').hasAttribute('inert') && !doc.getElementById('player').hasAttribute('inert'));
    check('5 close button: focus back on the bar', doc.activeElement === doc.getElementById('pInfo'));
    check('5 close slide does not end the open state twice (body lock off)', !doc.body.classList.contains('npopen'));
    return H.wait(350).then(function () {
      check('5 after 350 ms: class and inert gone, still hidden', !n.classList.contains('closing') && !n.hasAttribute('inert') && n.hidden);
      // animationend ends it early; a child's bubbling animationend does not.
      t.openNp(); t.closeNp();
      var child = doc.getElementById('npTitle') || n.firstElementChild;
      child.dispatchEvent(new tab.w.Event('animationend', { bubbles: true }));
      check('5 a child animation ending does not cut the slide short', n.classList.contains('closing'));
      n.dispatchEvent(new tab.w.Event('animationend', { bubbles: true }));
      check('5 the slide ending removes class and inert', !n.classList.contains('closing') && !n.hasAttribute('inert'));
      // Reopen during the slide.
      t.openNp(); t.closeNp();
      check('5 closing again', n.classList.contains('closing'));
      t.openNp();
      check('5 reopen during the slide: no closing class, not inert, shown', !n.classList.contains('closing') && !n.hasAttribute('inert') && !n.hidden && t.npShown());
      return H.wait(350);
    }).then(function () {
      check('5 the old slide timer does not touch the reopened screen', !n.hidden && !n.classList.contains('closing') && !n.hasAttribute('inert'));
      // App-driven close stays instant.
      t.closeNp(false);
      check('5 closeNp(false): hidden, no closing class, not inert', n.hidden && !n.classList.contains('closing') && !n.hasAttribute('inert'));
      // Escape and swipe are closes you start.
      t.openNp();
      doc.dispatchEvent(new tab.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('5 Escape: hidden with the slide', n.hidden && n.classList.contains('closing'));
      return H.wait(350);
    }).then(function () {
      t.openNp();
      function touch(type, y) {
        var e = new tab.w.Event(type, { bubbles: true });
        var pt = [{ clientX: 100, clientY: y }];
        if (type === 'touchstart') e.touches = pt; else e.changedTouches = pt;
        n.dispatchEvent(e);
      }
      touch('touchstart', 100); touch('touchend', 260);
      check('5 swipe down: hidden with the slide', n.hidden && n.classList.contains('closing'));
    });
  });
});

// 6. Reduce Motion: closing is instant.
tests.push(function () {
  var mm = function (q) { return { matches: /prefers-reduced-motion:\s*reduce/.test(q), addEventListener: function () {}, addListener: function () {} }; };
  return setup(H.seedStore(), { setPlayer: PLAYING, player: PLAYING, matchMedia: mm }).then(function (tab) {
    var t = tab.t(), n = np(tab);
    t.openNp();
    click(tab, d(tab).getElementById('npClose'));
    check('6 Reduce Motion: hidden, no closing class, not inert', n.hidden && !n.classList.contains('closing') && !n.hasAttribute('inert'));
  });
});

// 7. theme-color: a light and a dark meta; a forced theme sets both to its colour, before paint and on change.
tests.push(function () {
  var LIGHT = '#f4f5f2', DARK = '#101418';
  return setup(H.seedStore()).then(function (tab) {
    var m = metas(tab);
    check('7 two theme-color metas, light then dark by media', m.length === 2 &&
      m[0].media === '(prefers-color-scheme: light)' && m[0].content === LIGHT &&
      m[1].media === '(prefers-color-scheme: dark)' && m[1].content === DARK, m);
    t7(tab);
  }).then(function () {
    var s = H.seedStore(); s.setItem('lib-theme', JSON.stringify('light'));
    return setup(s).then(function (tab) {
      var m = metas(tab);
      check('7 forced Light at load: both metas light', m.length === 2 && m.every(function (x) { return x.content === LIGHT; }), m);
      check('7 forced Light at load: data-theme set', d(tab).documentElement.getAttribute('data-theme') === 'light');
    });
  }).then(function () {
    var s = H.seedStore(); s.setItem('lib-theme', JSON.stringify('dark'));
    return setup(s).then(function (tab) {
      var m = metas(tab);
      check('7 forced Dark at load: both metas dark', m.length === 2 && m.every(function (x) { return x.content === DARK; }), m);
    });
  });
  function t7(tab) {
    tab.t().openDiag();
    pickTheme(tab, 'light');
    var m = metas(tab);
    check('7 choose Light: both metas light', m.every(function (x) { return x.content === LIGHT; }), m);
    pickTheme(tab, 'dark');
    m = metas(tab);
    check('7 choose Dark: both metas dark', m.every(function (x) { return x.content === DARK; }), m);
    pickTheme(tab, 'auto');
    m = metas(tab);
    check('7 back to Auto: each meta its own colour again', m[0].content === LIGHT && m[1].content === DARK, m);
    check('7 back to Auto: data-theme removed', !d(tab).documentElement.hasAttribute('data-theme'));
  }
});

var chain = Promise.resolve();
tests.forEach(function (f, i) { chain = chain.then(f).catch(function (e) { check('test ' + (i + 1) + ' crashed', false, String(e && e.stack || e)); }); });
chain.then(function () {
  console.log(results.join('\n'));
  var fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
});
