// Harness for the make-a-copy suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, refresh: refresh, openDetail: openDetail, closeDetail: closeDetail, setFilter: setFilter, openDiag: openDiag, readCopies: readCopies, readCopyWatch: readCopyWatch'
});
