// Harness for the player-catch-up suite: the names below are exposed from index.html for testing.
// delays: every mocked answer resolves on a timer (Spotify's answer time matters for these checks).
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, setPlayer: setPlayer, pollPlayer: pollPlayer, openNp: openNp, closeNp: closeNp, togglePlay: togglePlay, ' +
    'seekTo: seekTo, curPos: curPos, openSheet: openSheet, renderSheet: renderSheet, transferTo: transferTo, goIdle: goIdle'
});
