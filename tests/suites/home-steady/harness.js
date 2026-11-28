// Harness for the home-steady suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, renderList: renderList, setFilter: setFilter, loadRecent: loadRecent, refresh: refresh, openDetail: openDetail, goBack: goBack, closeDetail: closeDetail, matchCopies: matchCopies, stopApp: stopApp'
});
