// Harness for the keep-unplayable-marks suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, openDetail: openDetail, closeDetail: closeDetail, setFilter: setFilter, mapTrack: mapTrack, mapDetail: mapDetail, plPack: plPack, plUnpack: plUnpack, logMerge: logMerge, logRows: logRows, nopeMark: nopeMark, nopeMarkOnto: nopeMarkOnto, unplayableWhy: unplayableWhy"
});
