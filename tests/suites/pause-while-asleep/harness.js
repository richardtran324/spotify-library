// Harness for the pause-while-asleep suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, goIdle: goIdle, setPlayer: setPlayer, readLastPlay: readLastPlay, togglePlay: togglePlay, seekTo: seekTo, toggleShuffle: toggleShuffle, cycleRepeat: cycleRepeat, epHistory: epHistory, MY_ID: MY_ID, curPos: curPos, readPending: readPending, saveLastPlay: saveLastPlay"
});
