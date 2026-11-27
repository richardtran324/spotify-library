// Harness for the dynamic-type suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, VERSION: VERSION, openDiag: openDiag, closeDiag: closeDiag, renderList: renderList, setFilter: setFilter, stopApp: stopApp"
});
