'use strict';
// iPhone Text Size / Dynamic Type (v2.47) tests: jsdom, mocked fetch, shared localStorage.
// jsdom has no layout and doesn't know -apple-system-body, so the iPhone is simulated: CSS.supports, matchMedia('(hover: none)')
// and the <html> computed font size (the system body size while no inline size is set) are stubbed per tab.
// Run: node tests/run.js dynamic-type  (or, after npm ci in tests/: node test.js [path to index.html])
if (process.argv[2]) process.env.SRC = process.argv[2];
var fs = require('fs');
var path = require('path');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var SRC = process.env.SRC || path.resolve(__dirname, '..', '..', '..', 'index.html');
var HTML = fs.readFileSync(SRC, 'utf8');
var CSS_TEXT = (HTML.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

// iphone: { touch: bool, supports: bool, sys: px, throws: bool }; null = a plain desktop browser (the harness default).
function setup(iphone, store, routes) {
  var sim = iphone ? { touch: iphone.touch !== false, supports: iphone.supports !== false, sys: iphone.sys || 17, throws: !!iphone.throws, reads: 0 } : null;
  var tabOpts = {};
  if (sim) {
    tabOpts.matchMedia = function (qs) {
      var m = /hover:\s*none/.test(qs) ? sim.touch : /hover:\s*hover/.test(qs) ? !sim.touch : false;
      return { matches: m, media: qs, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
    };
    tabOpts.beforeParse = function (w) {
      w.CSS = { supports: function (p, v) { return sim.supports && p === 'font' && v === '-apple-system-body'; }, escape: function (s) { return s; } };
      var orig = w.getComputedStyle.bind(w);
      w.getComputedStyle = function (el, pseudo) {
        if (el === w.document.documentElement) {
          sim.reads++;
          if (sim.throws) throw new Error('no style');
          return { fontSize: el.style.fontSize || (sim.sys + 'px'), getPropertyValue: function (n) { return n === 'font-size' ? (el.style.fontSize || sim.sys + 'px') : ''; } };
        }
        return orig(el, pseudo);
      };
    };
  }
  var tab = H.makeTab(store || H.seedStore(), routes || function (method, p) {
    if (p === '/me/playlists' && method === 'GET') return { status: 200, json: { items: [{ id: 'p1', name: 'A playlist with a very long name that would be cut off on a phone', uri: 'spotify:playlist:p1', images: [], owner: { id: 'me1', display_name: 'R' }, tracks: { total: 3 }, items: { total: 3 } }], next: null, total: 1 } };
    if (p === '/me' && method === 'GET') return { status: 200, json: { id: 'me1', display_name: 'R' } };
  }, tabOpts);
  tab.sim = sim;
  return H.wait(600).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    return tab;
  });
}
function root(tab) { return tab.w.document.documentElement; }
function inline(tab) { return root(tab).style.fontSize; }
function big(tab) { return root(tab).classList.contains('bigtype'); }
function lts(tab) { return tab.w.libTextSize; }
function diagText(tab) { tab.t().openDiag(); return tab.w.document.getElementById('diagOut').textContent; }
function textLine(tab) { var m = diagText(tab).match(/Text size: [^\n]*/); return m ? m[0] : ''; }
function fire(tab, type, hidden) {
  if (hidden != null) Object.defineProperty(tab.w.document, 'hidden', { value: hidden, configurable: true });
  if (type === 'pageshow') tab.w.dispatchEvent(new tab.w.Event('pageshow'));
  else tab.w.document.dispatchEvent(new tab.w.Event('visibilitychange'));
}
function keys(store) { return Object.keys(store._m()).sort().join(','); }
function done(tab) { try { tab.t().stopApp(); } catch (e) {} try { tab.w.close(); } catch (e) {} }

var tests = [];

// 1. Desktop / Mac (the harness default: no hover:none, no CSS.supports): nothing changes.
tests.push(function () {
  return setup(null).then(function (tab) {
    check('1 desktop: no inline root size', inline(tab) === '', inline(tab));
    check('1 desktop: no bigtype class', !big(tab));
    check('1 desktop: libTextSize reports 0', lts(tab).px === 0 && lts(tab)() === 0);
    check('1 desktop: Diagnostics says browser default', textLine(tab) === 'Text size: browser default', textLine(tab));
    check('1 version is v2.47', tab.t().VERSION === 'v2.47 (2026-11-27)' && /Page v2\.47 \(2026-11-27\)/.test(diagText(tab)), tab.t().VERSION);
    done(tab);
  });
});

// 2. A touch screen whose browser doesn't know -apple-system-body, and a Safari with a mouse (hover: hover): unchanged.
tests.push(function () {
  return setup({ supports: false, sys: 23 }).then(function (tab) {
    check('2 touch without -apple-system-body: unchanged', inline(tab) === '' && !big(tab) && lts(tab).px === 0, inline(tab));
    check('2 ...and the root size is never read', tab.sim.reads === 0, tab.sim.reads);
    done(tab);
    return setup({ touch: false, sys: 23 });
  }).then(function (tab) {
    check('2 Safari with hover (Mac, iPad trackpad): unchanged', inline(tab) === '' && !big(tab) && lts(tab).px === 0, inline(tab));
    done(tab);
  });
});

// 3. iPhone at the default Text Size (system body 17px): root 16px, looks as before.
tests.push(function () {
  return setup({ sys: 17 }).then(function (tab) {
    check('3 default Text Size: root scaled to 16px', inline(tab) === '16px', inline(tab));
    check('3 default Text Size: names do not wrap (no bigtype)', !big(tab));
    check('3 Diagnostics shows system and page size', textLine(tab) === 'Text size: iPhone Text Size 17px → page 16px', textLine(tab));
    done(tab);
  });
});

// 4. Bigger Text Sizes scale by 16/17, mark bigtype from one step up, and cap at 28px.
tests.push(function () {
  var cases = [[14, '13.18px', false], [19, '17.88px', true], [21, '19.76px', true], [23, '21.65px', true], [53, '28px', true]];
  var chain = Promise.resolve();
  cases.forEach(function (c) {
    chain = chain.then(function () { return setup({ sys: c[0] }); }).then(function (tab) {
      check('4 system ' + c[0] + 'px → root ' + c[1], inline(tab) === c[1], inline(tab));
      check('4 system ' + c[0] + 'px bigtype ' + c[2], big(tab) === c[2]);
      if (c[0] === 53) check('4 capped size noted in Diagnostics with wrap note', /53px → page 28px \(song names wrap\)/.test(textLine(tab)), textLine(tab));
      done(tab);
    });
  });
  return chain;
});

// 5. Changing Text Size while the page is open: re-checked on return (visibilitychange visible, pageshow), not while hidden.
tests.push(function () {
  return setup({ sys: 17 }).then(function (tab) {
    tab.sim.sys = 23;
    fire(tab, 'visibilitychange', true);
    check('5 hidden: not re-checked', inline(tab) === '16px' && !big(tab), inline(tab));
    fire(tab, 'visibilitychange', false);
    check('5 back on screen: new size applied', inline(tab) === '21.65px' && big(tab), inline(tab));
    tab.sim.sys = 17;
    fire(tab, 'pageshow');
    check('5 pageshow (Back from memory): back to default', inline(tab) === '16px' && !big(tab), inline(tab));
    check('5 repeated checks do not compound the scale', lts(tab)() === 16 && lts(tab)() === 16 && inline(tab) === '16px', inline(tab));
    done(tab);
  });
});

// 6. A failing style read leaves the page as on desktop and the page still starts.
tests.push(function () {
  return setup({ sys: 23, throws: true }).then(function (tab) {
    check('6 style read throws: no inline size, no bigtype', inline(tab) === '' && !big(tab) && lts(tab).px === 0, inline(tab));
    check('6 page still started and Diagnostics works', /Text size: browser default/.test(diagText(tab)), textLine(tab));
    done(tab);
  });
});

// 7. Zero requests and zero storage: many checks send nothing to Spotify and write nothing.
tests.push(function () {
  var store = H.seedStore();
  return setup({ sys: 21 }, store).then(function (tab) {
    return H.wait(300).then(function () {
      var before = tab.calls.length, k0 = keys(store);
      for (var i = 0; i < 25; i++) { tab.sim.sys = 17 + (i % 7); lts(tab)(); }
      return H.wait(300).then(function () {
        var extra = tab.calls.slice(before).map(function (c) { return c.method + ' ' + c.path; });
        check('7 25 Text Size checks send 0 requests (every group)', extra.length === 0, extra);
        check('7 ...and store nothing', keys(store) === k0, keys(store));
        check('7 the feature adds no storage key', !/text|font|dyn/i.test(keys(store)), keys(store));
        done(tab);
      });
    });
  });
});

// 8. Desktop vs iPhone start the same requests (the feature adds none at start).
tests.push(function () {
  var a, b;
  function sig(tab) { return tab.calls.map(function (c) { return c.method + ' ' + c.path; }).sort().join('|'); }
  return setup(null).then(function (tab) { return H.wait(300).then(function () { a = sig(tab); done(tab); }); })
    .then(function () { return setup({ sys: 23 }); })
    .then(function (tab) { return H.wait(300).then(function () { b = sig(tab); done(tab); }); })
    .then(function () { check('8 same start-up requests on desktop and on a big-text iPhone', a === b, { desktop: a, iphone: b }); });
});

// 9. The CSS: guarded by @supports and hover:none, keeps the font family, search >= 16px, tap targets >= 44px, desktop rules unchanged.
tests.push(function () {
  var i = CSS_TEXT.indexOf('@supports (font: -apple-system-body)');
  var block = i >= 0 ? CSS_TEXT.slice(i) : '';
  check('9 @supports (font: -apple-system-body) block exists', i >= 0);
  check('9 ...with @media (hover: none) inside', /^@supports \(font: -apple-system-body\) \{\s*@media \(hover: none\) \{/.test(block), block.slice(0, 80));
  check('9 html uses -apple-system-body and keeps var(--font)', /html \{ font: -apple-system-body; font-family: var\(--font\); \}/.test(block));
  check('9 body is 1rem on iPhone', /body \{[^}]*font-size: 1rem;/.test(block));
  check('9 search and fields never below 16px', /\.search, \.field \{ font-size: max\(16px, 1rem\); \}/.test(block));
  check('9 row buttons at least 44px', /\.act \{ width: clamp\(44px, [^)]+\); height: clamp\(44px, [^)]+\); \}/.test(block));
  check('9 play button at least 44px', /\.act\.big \{ width: clamp\(44px, [^)]+\); height: clamp\(44px, [^)]+\); \}/.test(block));
  check('9 covers and player bar scale in rem', /\.cover \{ width: min\(3\.5rem, 72px\); height: min\(3\.5rem, 72px\); \}/.test(block) && /\.pcover \{ width: min\(2\.75rem, 56px\)/.test(block) && /\.pinner \{ padding: 0\.5rem /.test(block));
  check('9 player bar keeps safe-area padding', /\.pinner \{[^}]*env\(safe-area-inset-right[^}]*env\(safe-area-inset-left/.test(block) && /has-player \{ padding-bottom: calc\([^}]*safe-area-inset-bottom/.test(block));
  check('9 big text: list names wrap to two lines', /html\.bigtype ul\.list \.name \{[^}]*white-space: normal;[^}]*-webkit-line-clamp: 2;/.test(block));
  check('9 bigtype rule is inside the guard', block.indexOf('html.bigtype') > 0);
  var before = i >= 0 ? CSS_TEXT.slice(0, i) : CSS_TEXT;
  check('9 desktop body stays 16px', /body \{[^}]*font-size: 16px;/.test(before));
  check('9 desktop search stays 16px, .act 40px, cover 56px', /\.search \{[^}]*font-size: 16px;/.test(before) && /\.act \{\s*width: 40px; height: 40px;/.test(before) && /\.cover \{\s*width: 56px; height: 56px;/.test(before));
  check('9 nothing outside the guard uses -apple-system-body', before.replace(/\/\*[\s\S]*?\*\//g, '').indexOf('-apple-system-body') < 0);
  check('9 five bar controls keep the 20px gap (fit at 375px: 5 x 48 + 4 x 20 = 320)', !/\.pctl \{/.test(block) && /\.pctl \{[^}]*gap: 20px;/.test(before));
  check('9 row button growth capped at 48px (name keeps room at 375px)', /\.act \{ width: clamp\(44px, 2\.5rem, 48px\)/.test(block));
  check('9 no new animation (reduced motion unaffected)', !/animation|transition/.test(block));
  // jsdom's CSSOM still parses the sheet and the rest of the page's rules
  var tabCheck = setup(null).then(function (tab) {
    var sheet = tab.w.document.styleSheets[0], n = 0, sup = null;
    try { n = sheet.cssRules.length; [].forEach.call(sheet.cssRules, function (r) { if (r.conditionText && /apple-system-body/.test(r.conditionText)) sup = r; }); } catch (e) {}
    check('9 stylesheet parses (rules: ' + n + ')', n > 200, n);
    check('9 CSSOM sees the @supports rule' + (sup ? '' : ' (skipped: this jsdom has no CSSSupportsRule)'), sup ? sup.cssRules.length === 1 : true);
    done(tab);
  });
  return tabCheck;
});

// 10. Nearby: theme set before paint still applies alongside, and the list still renders names on a big-text iPhone.
tests.push(function () {
  var store = H.seedStore();
  store.setItem('lib-theme', JSON.stringify('dark'));
  store.setItem('lib-filter', JSON.stringify('playlists'));
  return setup({ sys: 23 }, store).then(function (tab) {
    check('10 forced dark theme still set with bigtype', root(tab).getAttribute('data-theme') === 'dark' && big(tab), root(tab).getAttribute('data-theme'));
    tab.t().setFilter('playlists'); tab.t().renderList();
    return H.wait(200).then(function () {
      var names = [].map.call(tab.w.document.querySelectorAll('ul.list .name'), function (n) { return n.textContent; });
      check('10 playlist rows render with names', names.some(function (s) { return /very long name/.test(s); }), names);
      var acts = tab.w.document.querySelectorAll('ul.list .act');
      check('10 row buttons keep their class (44px rule applies)', [].every.call(acts, function (b) { return b.classList.contains('act'); }));
      var search = tab.w.document.getElementById('search');
      check('10 search box keeps class search (16px minimum)', search && search.classList.contains('search'));
      done(tab);
    });
  });
});

// 11. Nearby: Diagnostics keeps its other lines next to the new one.
tests.push(function () {
  return setup({ sys: 19 }).then(function (tab) {
    var txt = diagText(tab);
    var lines = txt.split('\n');
    var ia = lines.findIndex(function (l) { return /^Appearance: /.test(l); }), it = lines.findIndex(function (l) { return /^Text size: /.test(l); });
    check('11 Text size line sits right after Appearance', ia >= 0 && it === ia + 1, lines.slice(0, 12));
    check('11 other lines still present', /Requests, this copy:/.test(txt) && /Wake mode:/.test(txt), txt.slice(0, 300));
    check('11 wrap note at one step up', /19px → page 17\.88px \(song names wrap\)/.test(txt), textLine(tab));
    done(tab);
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
