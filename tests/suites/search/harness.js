// Harness for the search suite: the names below are exposed from index.html for testing.
// `delayed` is a second harness whose mocked answers resolve on timers (for the stale-answer checks).
'use strict';
var EXPOSE = 'state: state, K: K, setFilter: setFilter, scheduleSearch: scheduleSearch, runSearch: runSearch, setSearchType: setSearchType, ' +
  'renderList: renderList, searchMore: searchMore, recentSearches: recentSearches, addRecentSearch: addRecentSearch, removeRecentSearch: removeRecentSearch, ' +
  'searchFirst: searchFirst, albumQuery: albumQuery, startAlbumSearch: startAlbumSearch, loadAlbumSearch: loadAlbumSearch, openDetail: openDetail, ' +
  'closeDetail: closeDetail, currentSearch: currentSearch, searchCache: searchCache';
module.exports = require('../../lib/harness')({ expose: EXPOSE });
module.exports.delayed = require('../../lib/harness')({ expose: EXPOSE, delays: true });
