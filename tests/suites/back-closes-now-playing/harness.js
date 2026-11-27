// Harness for the back-closes-now-playing suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNp: openNp, closeNp: closeNp, npOptions: npOptions, openDetail: openDetail, goBack: goBack, closeDetail: closeDetail, artistItem: artistItem, stopApp: stopApp, kpSave: kpSave, openSheet: openSheet, paintPlayer: paintPlayer"
});
