// Harness for the search-smooth suite: the names below are exposed from index.html for testing.
// `delayed` is a second harness whose mocked answers resolve on timers (for the "while it loads" checks).
'use strict';
var EXPOSE = 'state: state, K: K, setFilter: setFilter, setSearchType: setSearchType, currentSearch: currentSearch, searchCache: searchCache, ' +
  'openDetail: openDetail, closeDetail: closeDetail';
module.exports = require('../../lib/harness')({ expose: EXPOSE });
module.exports.delayed = require('../../lib/harness')({ expose: EXPOSE, delays: true });
