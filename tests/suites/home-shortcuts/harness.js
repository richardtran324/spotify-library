// Harness for the home-shortcuts suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, playBody: playBody, openDetail: openDetail, renderList: renderList, setFilter: setFilter, loadRecent: loadRecent, readCtxLast: readCtxLast, noteCtxSong: noteCtxSong, ctxFromRecent: ctxFromRecent, continueEntry: continueEntry, heldShowEpisode: heldShowEpisode, ctxKey: ctxKey, stopApp: stopApp, goIdle: goIdle, epHistory: epHistory, closeDetail: closeDetail"
});
