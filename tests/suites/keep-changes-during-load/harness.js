// Harness for the keep-changes-during-load suite: the names below are exposed from index.html for testing.
// libPending reads how many library changes are waiting for a load in flight (v2.64).
'use strict';
module.exports = require('../../lib/harness')({
  delays: true,
  expose: 'state: state, K: K, refresh: refresh, toggleFollow: toggleFollow, isFollowed: isFollowed, ' +
    'setPlCount: setPlCount, sendAdd: sendAdd, libraryPlaylist: libraryPlaylist, renderList: renderList, ' +
    'libPending: function () { return typeof libChanges === "undefined" ? -1 : libChanges.length; }'
});
