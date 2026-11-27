// Harness for the recents-sort suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, renderList: renderList, setFilter: setFilter, readCtxLast: readCtxLast, noteCtxSong: noteCtxSong, recentTimes: recentTimes, byRecents: byRecents, sortList: sortList, sortMode: sortMode, byYouOn: byYouOn, epHistory: epHistory, noteEpisode: noteEpisode, epHistChanged: epHistChanged, stopApp: stopApp"
});
