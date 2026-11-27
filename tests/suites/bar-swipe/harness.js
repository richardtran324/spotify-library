// Harness for the bar-swipe suite (v2.57): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, paintPlayer: paintPlayer, openNp: openNp, closeNp: closeNp, goIdle: goIdle, command: command, coolLeft: coolLeft, barSwipeKind: barSwipeKind, barSwipe: barSwipe, slideCover: slideCover, BAR_SKIP_PX: BAR_SKIP_PX, BAR_DRIFT_PX: BAR_DRIFT_PX, BAR_UP_PX: BAR_UP_PX, BAR_EDGE_PX: BAR_EDGE_PX, BAR_MOVED_PX: BAR_MOVED_PX, VERSION: VERSION, WAKE_FIRST: WAKE_FIRST, stopApp: stopApp"
});
