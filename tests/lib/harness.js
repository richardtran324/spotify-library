// Shared test harness: loads index.html in jsdom with a mocked fetch and a shared localStorage.
// Test-only transforms (the page itself is not changed): internals are exposed on window.__t
// at the end of the page's main script, and toast() records each message in window.__toasts.
//
// Each suite makes its own harness:
//   module.exports = require('../../lib/harness')({ expose: 'state: state, K: K, openDetail: openDetail' });
// Options:
//   expose      fragment placed inside `window.__t = { ... }` (every name must exist in index.html)
//   delays      true: each mocked answer resolves on a timer (route may return { delay: ms }),
//               and tab.flight tracks requests in flight
//   toastLinks  true: a toast with a link is recorded as 'msg | href | text'
// Env: SRC = path of the index.html under test (default: the repo's own index.html).
//      EXPOSE = extra comma-separated names to expose.
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var DEFAULT_SRC = path.resolve(__dirname, '..', '..', 'index.html');
var SCOPE = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative playlist-modify-public user-library-read user-library-modify user-follow-read user-read-recently-played user-read-playback-position';

function buildHtml(opts) {
  var src = process.env.SRC || DEFAULT_SRC;
  var html = fs.readFileSync(src, 'utf8');
  var fragment = opts.expose || 'state: state, K: K';
  var extra = (process.env.EXPOSE || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (extra.length) fragment += extra.map(function (n) { return ', ' + n + ': ' + n; }).join('');
  var idx = html.lastIndexOf('})();');
  if (idx < 0) throw new Error('harness: could not find the end of the main script in ' + src);
  html = html.slice(0, idx) + 'window.__t = { ' + fragment + ' };\n})();' + html.slice(idx + 5);
  var hook = 'function toast(msg, link, action) {';
  if (html.indexOf(hook) < 0) throw new Error('harness: toast() signature changed in ' + src);
  html = html.replace(hook, hook + (opts.toastLinks
    ? " (window.__toasts = window.__toasts || []).push(msg + (link ? ' | ' + link.href + ' | ' + link.text : ''));"
    : ' (window.__toasts = window.__toasts || []).push(msg);'));
  return html;
}

function makeStore() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    clear: function () { m = {}; },
    key: function (i) { return Object.keys(m)[i] || null; },
    get length() { return Object.keys(m).length; },
    _m: function () { return m; }
  };
}

function seedStore() {
  var s = makeStore();
  s.setItem('lib-client-id', JSON.stringify('fakeclient'));
  s.setItem('lib-token', JSON.stringify({ access: 'fake', refresh: 'r', expires: Date.now() + 3600e3, scope: SCOPE }));
  return s;
}

function song(uri, opts) {
  opts = opts || {};
  return {
    item: { uri: uri || 'spotify:track:t1', id: 't1', name: 'Song One', type: opts.type || 'track', duration_ms: 240000,
      album: { id: 'a1', name: 'Album', images: [], uri: 'spotify:album:a1' }, artists: [{ name: 'Artist' }],
      show: opts.type === 'episode' ? { id: 's1', name: 'Show', images: [] } : undefined },
    context: { type: 'album', uri: 'spotify:album:a1' },
    is_playing: opts.playing !== false, progress_ms: opts.pos || 60000,
    device: { id: opts.dev || 'A', name: 'iPhone', type: 'Smartphone', is_active: true, volume_percent: 50 },
    shuffle_state: false, repeat_state: 'off', timestamp: Date.now()
  };
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

module.exports = function (opts) {
  opts = opts || {};
  var html = buildHtml(opts);

  // routes: function(method, path, query, body, call) -> {status, json, delay?} or undefined for the default answer
  function makeTab(store, routes, tabOpts) {
    tabOpts = tabOpts || {};
    var calls = [];
    var flight = { now: 0, max: 0, seq: 0 };
    var dom = new JSDOM(html, {
      url: tabOpts.url || 'https://richardtran324.github.io/spotify-library/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse: function (w) {
        Object.defineProperty(w, 'localStorage', { value: store, configurable: true });
        w.matchMedia = tabOpts.matchMedia || function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
        w.scrollTo = function () {};
        if (tabOpts.beforeParse) tabOpts.beforeParse(w);
        w.fetch = function (url, fopts) {
          fopts = fopts || {};
          var u = new w.URL(url);
          var method = fopts.method || 'GET';
          var p = u.pathname.replace('/v1', '');
          var call = { method: method, path: p, query: u.search, t: Date.now(), host: u.host, url: String(url) };
          calls.push(call);
          var r = routes(method, p, u.searchParams, fopts.body, call);
          if (!r) {
            if (p === '/me/player') r = { status: 204 };
            else if (p === '/me/player/devices') r = { status: 200, json: { devices: [] } };
            else if (method === 'GET') r = { status: 200, json: { items: [], next: null, total: 0, id: 'me1', display_name: 'R' } };
            else r = { status: 204 };
          }
          var status = r.status;
          var body = r.json === undefined ? '' : JSON.stringify(r.json);
          var res = {
            ok: status >= 200 && status < 300, status: status,
            headers: { get: function (h) { return r.headers && r.headers[String(h).toLowerCase()] || null; } },
            text: function () { return Promise.resolve(body); },
            json: function () { return Promise.resolve(r.json); }
          };
          if (!opts.delays) return Promise.resolve(res);
          flight.now++; flight.max = Math.max(flight.max, flight.now); call.s = ++flight.seq;
          return new Promise(function (resolve) { setTimeout(function () { flight.now--; call.e = ++flight.seq; resolve(res); }, r.delay || 0); });
        };
      }
    });
    return { dom: dom, w: dom.window, t: function () { return dom.window.__t; }, calls: calls, flight: flight,
      toasts: function () { return dom.window.__toasts || []; } };
  }

  return { makeTab: makeTab, seedStore: seedStore, makeStore: makeStore, song: song, wait: wait, SCOPE: SCOPE };
};
