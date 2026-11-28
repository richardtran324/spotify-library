// Harness for the stay-signed-in suite (v2.65): Spotify's 6-month sign-in, the Renew now banner, keeping the last
// playback when Spotify ends the sign-in. Only names that exist before v2.65 are exposed, so the suite also loads
// (and fails its checks) on older copies of the page. Navigations are recorded as window.__nav (see sign-in).
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, SCOPE_LIST: SCOPE_LIST, runDiag: runDiag, stopApp: stopApp'
});
