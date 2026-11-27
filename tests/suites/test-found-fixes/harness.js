// Harness for the test-found-fixes suite: the names below are exposed from index.html for testing.
// It loads the navigation patch first (as the sign-in suite does) so a navigation can never leave the page, and
// uses delays so a late page answer can be held back (Edit during Search all).
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, setPlayer: setPlayer, openAddPl: openAddPl, closePl: closePl, libraryPlaylist: libraryPlaylist, ' +
    'setPlCount: setPlCount, setFilter: setFilter, openDetail: openDetail, closeDetail: closeDetail, goBack: goBack, stopApp: stopApp, ' +
    'renderSignIn: renderSignIn, renderSetup: renderSetup, startApp: startApp, needFeature: needFeature, coolLeft: coolLeft, ' +
    'recentSearches: recentSearches, showPage: showPage, mapPlaylist: mapPlaylist, likedItem: likedItem, cardSub: cardSub'
});
