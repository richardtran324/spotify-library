'use strict';
// v2.47 (was v2.29) "Wake Spotify without its Home screen": the settings guide, the honest wake-option notes, the unchanged
// shortcut link (plain run-shortcut, no x-callback), the unchanged wait flow, and the ?wake=1 return in a new tab.
var fs = require('fs');
var path = require('path');
var H = require('./harness');
var results = [];
function check(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(info))); }

var DEV_A = { id: 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 };
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
function songItem() { return { kind: 'track', id: 't5', uri: 'spotify:track:t5', name: 'Five', url: 'https://open.spotify.com/track/t5', sub: 'Song' }; }
function setup(store, opts) {
  opts = opts || {};
  var env = { devices: opts.devices || [], player: null };
  var tab = H.makeTab(store, function (method, p, q, body, call) {
    call.body = body ? JSON.parse(body) : null;
    if (p === '/me/player' && method === 'GET') return env.player ? { status: 200, json: clone(env.player) } : { status: 204 };
    if (p === '/me/player/devices') return { status: 200, json: { devices: clone(env.devices) } };
    if ((method === 'PUT' || method === 'POST') && /^\/me\/player/.test(p)) return { status: 204 };
  }, {
    url: opts.url,
    beforeParse: function (w) { w.__nav = []; w.libNavigate = function (u) { w.__nav.push(u); }; }
  });
  tab.env = env;
  return H.wait(500).then(function () {
    if (!tab.t()) throw new Error('page did not start');
    tab.w.__toasts = [];
    return tab;
  });
}
function $(tab, id) { return tab.w.document.getElementById(id); }
function note(tab, v) { var r = tab.w.document.querySelector('input[name="wakeMode"][value="' + v + '"]'); return r && r.parentNode.querySelector('.setnote').textContent; }
function reqs(tab, m, p) { return tab.calls.filter(function (c) { return c.method === m && c.path === p; }); }
function done(tab) { try { tab.t().stopWake(); tab.w.close(); } catch (e) {} }

var tests = [];

// 1. The settings guide: present, closed by default, in the right place, with the return address filled in.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [DEV_A] }).then(function (tab) {
    var d = tab.w.document, t = tab.t();
    var box = $(tab, 'wakeHelp');
    check('1 guide exists as a closed details block', box && box.tagName === 'DETAILS' && !box.open, box && box.outerHTML.slice(0, 80));
    check('1 guide title', box && box.querySelector('summary').textContent === 'Wake Spotify without its Home screen', box && box.querySelector('summary').textContent);
    check('1 guide sits right after the wake options', box && box.previousElementSibling && box.previousElementSibling.id === 'wakeModes');
    check('1 guide is inside Diagnostics', box && box.closest('#diag') !== null);
    var txt = box ? box.textContent.replace(/\s+/g, ' ') : '';
    check('1 Back Tap steps', /Settings › Accessibility › Touch › Back Tap › Double Tap/.test(txt) && /Play\/Pause/.test(txt) && /choose Play,? and name the shortcut Play Spotify/.test(txt), txt);
    check('1 Action button step', /Settings › Action Button › Shortcut › Play Spotify/.test(txt), txt);
    check('1 Wake Spotify recipe uses Play/Pause, Wait, Open URLs, not Open App as a step', /Play\/Pause set to Play instead of Open App, then Wait 2 seconds, then Open URLs/.test(txt), txt);
    check('1 says it comes back in a new tab', /new Safari tab/.test(txt), txt);
    check('1 warns about the last app to play sound', /last app to play sound/.test(txt), txt);
    check('1 return address empty before Diagnostics opens', $(tab, 'wakeHelpUrl').textContent === '');
    $(tab, 'diagBtn').dispatchEvent(new tab.w.MouseEvent('click', { bubbles: true }));
    check('1 return address shown once Diagnostics opens', $(tab, 'wakeHelpUrl').textContent === 'https://richardtran324.github.io/spotify-library/?wake=1', $(tab, 'wakeHelpUrl').textContent);
    check('1 WAKE_RETURN_URL matches the README address', t.WAKE_RETURN_URL === 'https://richardtran324.github.io/spotify-library/?wake=1', t.WAKE_RETURN_URL);
    var sum = box.querySelector('summary');
    var css = Array.prototype.map.call(d.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    check('1 summary has a 44 px touch target rule', /\.wakehelp summary \{[^}]*min-height: 44px/.test(css) && !!sum);
    done(tab);
  });
});

// 2. The three wake-option notes.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [DEV_A] }).then(function (tab) {
    check('2 wait note', note(tab, 'wait') === 'Press play in Control Center, on the lock screen or on your headphones. Spotify starts in the background with no screen of its own, and the page plays what you tapped.', note(tab, 'wait'));
    check('2 link note says Home shows', note(tab, 'link') === 'A tap opens the item in Spotify; switch back and the page plays it. If Spotify wasn’t running, its Home screen shows first.', note(tab, 'link'));
    check('2 shortcut note', note(tab, 'shortcut') === 'A tap runs your “Wake Spotify” shortcut, which starts Spotify and comes back to the page. Built with Play/Pause (below), Spotify’s Home screen doesn’t show; the Shortcuts screen still shows for a moment.', note(tab, 'shortcut'));
    check('2 default mode is still wait', tab.t().wakeMode() === 'wait');
    done(tab);
  });
});

// 3. Shortcut mode still opens the plain shortcut link (no x-callback, which reports an error since iOS 26.5).
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t();
    check('3 shortcut link unchanged', t.SHORTCUT_URL === 'shortcuts://run-shortcut?name=Wake%20Spotify', t.SHORTCUT_URL);
    check('3 no x-callback link in the page', !/x-callback-url/.test(fs.readFileSync(process.env.SRC || path.resolve(__dirname, '../../../index.html'), 'utf8')));
    t.setWakeMode('shortcut');
    tab.calls.length = 0;
    t.wakeSpotify(songItem(), {});
    var pend = t.readPending();
    check('3 tap runs the shortcut and is remembered', tab.w.__nav.length === 1 && tab.w.__nav[0] === t.SHORTCUT_URL && pend && pend.mode === 'shortcut' && pend.item.uri === 'spotify:track:t5', { nav: tab.w.__nav, pend: pend });
    check('3 nothing sent to Spotify by the tap itself', tab.calls.length === 0, tab.calls);
    t.setWakeMode('link');
    t.wakeSpotify(songItem(), {});
    check('3 link mode still opens the item link', tab.w.__nav[1] === 'https://open.spotify.com/track/t5', tab.w.__nav);
    done(tab);
  });
});

// 4. The shortcut comes back in a NEW tab at ?wake=1: that tab reads the tap from shared storage and plays it once.
tests.push(function () {
  var store = H.seedStore();
  var first;
  return setup(store, { devices: [] }).then(function (tab) {
    first = tab;
    tab.t().setWakeMode('shortcut');
    tab.t().wakeSpotify(songItem(), {});
    check('4 tap stored before leaving for Shortcuts', !!store.getItem('lib-pending'));
    tab.w.close();
    return setup(store, { devices: [DEV_A], url: 'https://richardtran324.github.io/spotify-library/?wake=1' });
  }).then(function (tab2) {
    return H.wait(3500).then(function () {
      var pl = reqs(tab2, 'PUT', '/me/player/play');
      check('4 new tab plays the tap once on the iPhone', pl.length === 1 && /device_id=A/.test(pl[0].query) && pl[0].body && pl[0].body.uris && pl[0].body.uris[0] === 'spotify:track:t5', pl);
      check('4 tap cleared after playing', store.getItem('lib-pending') === null, store.getItem('lib-pending'));
      check('4 ?wake=1 removed from the address', !/wake=/.test(tab2.w.location.href), tab2.w.location.href);
      done(tab2);
    });
  });
});

// 5. Wait mode (what Back Tap, the Action button and headphones feed into) is unchanged: same line, plays once on wake.
tests.push(function () {
  var store = H.seedStore();
  return setup(store, { devices: [] }).then(function (tab) {
    var t = tab.t();
    t.state.device = null; t.state.active = null;
    tab.calls.length = 0;
    t.waitForPlay(songItem(), {});
    check('5 wait line text unchanged', $(tab, 'wakeText').textContent === 'Press play in Control Center or on the lock screen. “Five” starts as soon as Spotify wakes.', $(tab, 'wakeText').textContent);
    check('5 nothing opened', tab.w.__nav.length === 0, tab.w.__nav);
    return H.wait(300).then(function () {
      // A Back Tap play press wakes Spotify in the background: it now lists the iPhone and plays its last item.
      tab.env.devices = [DEV_A];
      tab.env.player = { item: { type: 'track', id: 'old', uri: 'spotify:track:old', name: 'Old', duration_ms: 1, album: { images: [] }, artists: [] }, is_playing: true, progress_ms: 0, device: clone(DEV_A), timestamp: Date.now() };
      return H.wait(6800);
    }).then(function () {
      var pl = reqs(tab, 'PUT', '/me/player/play');
      check('5 plays the tapped item once after the wake', pl.length === 1 && pl[0].body.uris[0] === 'spotify:track:t5', pl);
      var checks = tab.calls.filter(function (c) { return c.method === 'GET' && /^\/me\/player(\/devices)?$/.test(c.path); });
      check('5 at most 4 player checks in that time (one every 3 s)', checks.length <= 4, checks.length);
      check('5 line hidden after playing', $(tab, 'wake').hidden);
      done(tab);
    });
  });
});

// 6. Wording rules on the new text: no dashes, no banned words, curly apostrophes in the page text.
tests.push(function () {
  var html = fs.readFileSync(process.env.SRC || path.resolve(__dirname, '../../../index.html'), 'utf8');
  var start = html.indexOf('<details class="setgroup wakehelp"'), end = html.indexOf('</details>', start);
  var block = html.slice(start, end);
  var notes = html.match(/<label class="setrow"><input type="radio" name="wakeMode"[\s\S]*?<\/label>/g).join('\n');
  var all = block + notes;
  check('6 guide block found', start > 0 && end > start);
  check('6 no em or en dashes', !/[—–]/.test(all));
  check('6 no banned words', !/quirk|clobber|straggler/i.test(all));
  check('6 no straight apostrophes in page text', !/[a-z]'[a-z]/i.test(all.replace(/<[^>]*>/g, '')), all.match(/[a-z]'[a-z]/ig));
  check('6 version bumped (v2.47, or later once more PRs land)', /var VERSION = 'v2\.(4[7-9]|[5-9]\d) /.test(html));   // renumbered from v2.29 on merge
  return Promise.resolve();
});

(function run(i) {
  if (i >= tests.length) {
    results.forEach(function (r) { console.log(r); });
    var failed = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
  }
  Promise.resolve().then(tests[i]).catch(function (e) { results.push('ERROR test ' + (i + 1) + ': ' + (e && e.stack || e)); }).then(function () { run(i + 1); });
})(0);
