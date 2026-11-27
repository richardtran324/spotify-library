// Harness for the player-unverified suite: the Now Playing bar painted from storage at start-up (no writes,
// unverified until the first player answer), the same flag after a long time away, and coming back from a
// feature sign-in (the list reopens; the page shows while the sign-in finishes when the old token still works).
// The navigation patch records the page's location.assign calls (Sign in to Spotify) instead of navigating.
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, MY_ID: MY_ID, setPlayer: setPlayer, curPos: curPos, togglePlay: togglePlay, ' +
    'openDetail: openDetail, openPerm: openPerm, api: api, readLastPlay: readLastPlay'
});
