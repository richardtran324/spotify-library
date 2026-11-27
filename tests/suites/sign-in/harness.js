// Harness for the sign-in suite: the names below are exposed from index.html for testing.
// jsdom has no way to stub location.assign (it is unforgeable) and does not implement cross-document
// navigation, so this suite wraps jsdom's internal navigate() before jsdom loads: every navigation the page
// asks for is recorded on the window as window.__nav = [{url, replace}] and cross-document ones go nowhere.
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, SCOPE_LIST: SCOPE_LIST, SCOPES: SCOPES, REDIRECT: REDIRECT, MY_ID: MY_ID, ' +
    'login: login, randomString: randomString, b64url: b64url, handleCallback: handleCallback, tokenRequest: tokenRequest, ' +
    'saveToken: saveToken, missingScopes: missingScopes, updateBanner: updateBanner, accessToken: accessToken, api: api, ' +
    'loadSavedSession: loadSavedSession, stopApp: stopApp, renderSetup: renderSetup, renderSignIn: renderSignIn, startApp: startApp'
});
