// Harness for the compact-view suite (v2.43): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, VERSION: VERSION, setFilter: setFilter, renderList: renderList, chipIntoView: chipIntoView, setSlim: setSlim, onSlimScroll: onSlimScroll, slimFrozen: slimFrozen, slimHeight: slimHeight, SLIM_MIN_Y: SLIM_MIN_Y, SLIM_STEP: SLIM_STEP, compactPlayer: compactPlayer, setCompact: setCompact, applyCompact: applyCompact, openDiag: openDiag, closeDiag: closeDiag, showWake: showWake, stopWake: stopWake, setPlayer: setPlayer, openNp: openNp, closeNp: closeNp, openDetail: openDetail, stopApp: stopApp"
});
