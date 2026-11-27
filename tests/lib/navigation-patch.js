// Records page navigations for suites that need them (sign-in, follow-artists, edit-playlists).
// jsdom can't stub location.assign and doesn't do cross-document navigation, so this wraps jsdom's internal
// navigate(): every navigation is recorded as window.__nav = [{url, replace}] and cross-document ones go nowhere.
// jsdom copies navigate() when Location-impl.js first loads, so this file must be required before jsdom.
// It refuses to run if jsdom is already loaded, so the patch can't silently stop working. Re-check it when
// upgrading jsdom (pinned in package.json).
'use strict';
var path = require('path');
var navPath = require.resolve('jsdom/lib/jsdom/living/window/navigation.js');
var locPath = path.join(path.dirname(navPath), 'Location-impl.js');
if (require.cache[locPath]) throw new Error('navigation-patch must be required before jsdom is loaded');
var navMod = require(navPath);
if (typeof navMod.navigate !== 'function') throw new Error('navigation-patch: jsdom navigate() not found (jsdom changed?)');
var whatwgURL = require('whatwg-url');
var origNavigate = navMod.navigate;
navMod.navigate = function (window, newURL, flags) {
  var url = whatwgURL.serializeURL(newURL);
  try { (window.__nav = window.__nav || []).push({ url: url, replace: !!(flags && flags.replacement) }); } catch (e) {}
  var cur = window._document && window._document._URL;
  if (cur && whatwgURL.serializeURL(cur, true) === whatwgURL.serializeURL(newURL, true)) return origNavigate.apply(this, arguments);
};
