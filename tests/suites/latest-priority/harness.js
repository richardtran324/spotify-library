// Harness for the latest-priority suite (v2.44 In Latest: Priority · Normal · Hidden): the names below are exposed
// from index.html for testing. delays: every mocked answer resolves on a timer, so requests in flight can be counted.
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, setFilter: setFilter, renderList: renderList, openDetail: openDetail, closeDetail: closeDetail, ' +
    'latestShows: latestShows, latestItem: latestItem, readLatestPri: readLatestPri, latestPriOf: latestPriOf, setLatestPri: setLatestPri, ' +
    'latestOrder: latestOrder, latestPriCounts: latestPriCounts, openDiag: openDiag, writeMark: writeMark, heldShowEpisode: heldShowEpisode, ' +
    'refreshLatest: refreshLatest, LATEST_PRI_MAX: LATEST_PRI_MAX, LATEST_SHOWS: LATEST_SHOWS'
});
