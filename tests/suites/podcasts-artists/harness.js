// Harness for the podcasts-artists suite: the names below are exposed from index.html for testing.
// delays: every mocked answer resolves on a timer, so requests in flight can be counted.
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, setPlayer: setPlayer, setFilter: setFilter, renderList: renderList, openDetail: openDetail, ' +
    'closeDetail: closeDetail, goBack: goBack, epHistory: epHistory, epPlayed: epPlayed, resumeOf: resumeOf, resumeItem: resumeItem, ' +
    'mapArtist: mapArtist, releaseGroup: releaseGroup, jumpEpisodes: jumpEpisodes, latestShows: latestShows, latestFresh: latestFresh, ' +
    'showFresh: showFresh, savedEpisodesItem: savedEpisodesItem, albumPage: albumPage, showPage: showPage'
});
