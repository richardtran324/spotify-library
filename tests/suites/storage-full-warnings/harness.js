// Harness for the storage-full-warnings suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, get: get, set: set, saveFailWhy: saveFailWhy, setPlayer: setPlayer, addBookmark: addBookmark, removeBookmark: removeBookmark, readBookmarks: readBookmarks, writeBookmarks: writeBookmarks, renderList: renderList, setFilter: setFilter, openDetail: openDetail, setIntro: setIntro, saveIntro: saveIntro, introSecs: introSecs, readIntro: readIntro"
});
