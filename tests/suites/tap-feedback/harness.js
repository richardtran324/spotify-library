// Harness for the tap-feedback suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNp: openNp, closeNp: closeNp, npShown: npShown, openSheet: openSheet, closeSheet: closeSheet, openDiag: openDiag, applyTheme: applyTheme"
});
