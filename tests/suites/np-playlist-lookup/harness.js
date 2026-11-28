// Harness for the np-playlist-lookup suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNp: openNp, closeNp: closeNp, VERSION: VERSION"
});
