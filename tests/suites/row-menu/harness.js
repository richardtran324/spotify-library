// Harness for the row-menu suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, VERSION: VERSION, setPlayer: setPlayer, renderList: renderList, setFilter: setFilter, itemRow: itemRow, openDetail: openDetail, goBack: goBack, openRowMenu: openRowMenu, closeRowMenu: closeRowMenu, rowPlusShown: rowPlusShown, mapEpisode: mapEpisode, openDiag: openDiag, closeDiag: closeDiag, closePl: closePl, closeNotes: closeNotes, stopApp: stopApp, markOf: markOf, writeMark: writeMark, marksChanged: marksChanged, rmGuard: rmGuard, rmTooSoon: rmTooSoon",
  "toastLinks": false
});
