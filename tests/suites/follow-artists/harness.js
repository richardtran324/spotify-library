// Harness for the follow-artists suite: the names below are exposed from index.html for testing.
// Like the sign-in suite, it wraps jsdom's internal navigate() before jsdom loads (location.assign can't be
// stubbed): every navigation the page asks for is recorded as window.__nav = [{url, replace}] and
// cross-document ones go nowhere. jsdom has no crypto.subtle, so tests add a SHA-256 digest (see addSubtle).
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
var nodeCrypto = require('crypto');
var H = require('../../lib/harness')({
  delays: true,
  toastLinks: false,
  expose: 'state: state, K: K, SCOPE_LIST: SCOPE_LIST, FEATURE_SCOPES: FEATURE_SCOPES, PERM_ASK: PERM_ASK, REDIRECT: REDIRECT, ' +
    'hasFeature: hasFeature, loginScopes: loginScopes, login: login, needFeature: needFeature, openPerm: openPerm, closePerm: closePerm, ' +
    'featureDenied: featureDenied, toggleFollow: toggleFollow, isFollowed: isFollowed, followKnown: followKnown, ' +
    'openDetail: openDetail, openArtistPage: openArtistPage, artistItem: artistItem, closeDetail: closeDetail, goBack: goBack, ' +
    'setFilter: setFilter, runSearch: runSearch, renderList: renderList, refresh: refresh'
});
// Gives the window a crypto.subtle.digest('SHA-256', data) that answers with a page-realm ArrayBuffer.
H.addSubtle = function (w) {
  var subtle = {
    digest: function (alg, data) {
      var buf = nodeCrypto.createHash('sha256').update(Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data)).digest();
      var out = new w.Uint8Array(buf.length);
      for (var i = 0; i < buf.length; i++) out[i] = buf[i];
      return w.Promise.resolve(out.buffer);
    }
  };
  try { Object.defineProperty(w.crypto, 'subtle', { value: subtle, configurable: true }); }
  catch (e) { var c = w.crypto; Object.defineProperty(w, 'crypto', { value: { getRandomValues: c.getRandomValues.bind(c), subtle: subtle }, configurable: true }); }
};
module.exports = H;
