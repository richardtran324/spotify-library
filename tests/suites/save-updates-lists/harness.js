// Harness for the save-updates-lists suite (v2.63): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, renderList: renderList, setFilter: setFilter, openDetail: openDetail, closeDetail: closeDetail, toggleSave: toggleSave, runSearch: runSearch'
});
