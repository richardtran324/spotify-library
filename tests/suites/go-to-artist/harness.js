// Harness for the go-to-artist suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, setPlayer: setPlayer, openNp: openNp, closeNp: closeNp, npOptions: npOptions, openDetail: openDetail, goBack: goBack, closeDetail: closeDetail, artistItem: artistItem, openArtistPage: openArtistPage, artistRefs: artistRefs, mapAlbum: mapAlbum, mapRelease: mapRelease, pinRecord: pinRecord, refresh: refresh"
});
