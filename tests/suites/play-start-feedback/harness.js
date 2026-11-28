// Harness for the play-start-feedback suite (FLOWS-1): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, onItemClick: onItemClick, NOEV: NOEV, showStatus: showStatus, setFilter: setFilter, setPlayer: setPlayer",
  "delays": true,
  "toastLinks": true
});
