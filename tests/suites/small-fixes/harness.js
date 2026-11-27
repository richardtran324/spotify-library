// Harness for the small-fixes suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, libraryPlaylist: libraryPlaylist, openDetail: openDetail, mapTrack: mapTrack, ' +
    'plPack: plPack, plUnpack: plUnpack, notesText: notesText'
});
