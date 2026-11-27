// Harness for the share-link suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openDetail: openDetail, openNp: openNp, closeNp: closeNp, shareUrl: shareUrl, shareLink: shareLink, copyLink: copyLink, VERSION: VERSION",
  "toastLinks": true
});
