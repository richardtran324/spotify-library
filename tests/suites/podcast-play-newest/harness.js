// Harness for the podcast-play-newest suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, openDetail: openDetail, goBack: goBack, setFilter: setFilter, remapDetail: remapDetail, slPut: slPut, SL_SHOW: SL_SHOW, slEpisode: slEpisode, HOLD_NEW_MS: HOLD_NEW_MS, SHIFT_GUARD_MS: SHIFT_GUARD_MS'
});
