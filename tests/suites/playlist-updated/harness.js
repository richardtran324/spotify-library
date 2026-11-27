// Harness for the playlist-updated suite (v2.46): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, refresh: refresh, renderList: renderList, setFilter: setFilter, openDetail: openDetail, ' +
    'closeDetail: closeDetail, goBack: goBack, openDiag: openDiag, libraryPlaylist: libraryPlaylist, afterAdd: afterAdd, ' +
    'plUpdated: plUpdated, readPlSeen: readPlSeen, markPlOpened: markPlOpened, plEdited: plEdited, plSeenDiag: plSeenDiag, ' +
    'PLSEEN_MAX: PLSEEN_MAX, coolLeft: coolLeft, stopApp: stopApp'
});
