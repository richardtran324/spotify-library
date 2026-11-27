// Harness for the mark-played suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNotes: openNotes, closeNotes: closeNotes, notesEp: notesEp, itemRow: itemRow, latestItem: latestItem, histRow: histRow, continueItems: continueItems, firstUnplayed: firstUnplayed, markOf: markOf, withMark: withMark, writeMark: writeMark, toggleMark: toggleMark, markCount: markCount, openDetail: openDetail, epHistory: epHistory, renderList: renderList, setFilter: setFilter, mapEpisode: mapEpisode, openDiag: openDiag, MARKS_MAX: MARKS_MAX, MARKS_MS: MARKS_MS, stopApp: stopApp"
});
