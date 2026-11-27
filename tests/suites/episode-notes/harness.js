// Harness for the episode-notes suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNotes: openNotes, closeNotes: closeNotes, notesFor: notesFor, findStamps: findStamps, notesText: notesText, keepNotes: keepNotes, epNotes: epNotes, notesEp: notesEp, playBody: playBody, readNotes: readNotes, saveNotes: saveNotes, openDetail: openDetail, openNp: openNp, MY_ID: MY_ID, itemRow: itemRow, latestItem: latestItem, histRow: histRow, openDiag: openDiag, stopApp: stopApp, epNotesRaw: epNotesRaw"
});
