// Harness for the storage-guard suite: the names below are exposed from index.html for testing.
// Like the sign-in suite, navigations are recorded on window.__nav (see lib/navigation-patch).
'use strict';
require('../../lib/navigation-patch'); // must come before the shared harness loads jsdom
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, get: get, set: set, del: del, store: store, makeRoom: makeRoom, ROOM_STEPS: ROOM_STEPS, ' +
    'login: login, handleCallback: handleCallback, saveToken: saveToken, accessToken: accessToken, ' +
    'addBookmark: addBookmark, readBookmarks: readBookmarks, toggleMark: toggleMark, markOf: markOf, togglePin: togglePin, readPins: readPins, ' +
    'waitForPlay: waitForPlay, readPending: readPending, setPlayer: setPlayer, setWakeMode: setWakeMode, stopWake: stopWake, logSave: logSave'
});
