// Harness for the play-shuffle suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, play: play, setPlayer: setPlayer, openDetail: openDetail, likedCtx: likedCtx"
});
