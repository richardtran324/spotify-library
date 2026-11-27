// Harness for the wake-no-home suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, SHORTCUT_URL: SHORTCUT_URL, WAKE_RETURN_URL: WAKE_RETURN_URL, VERSION: VERSION, ' +
    'wakeSpotify: wakeSpotify, setWakeMode: setWakeMode, wakeMode: wakeMode, waitForPlay: waitForPlay, readPending: readPending, ' +
    'resumePending: resumePending, stopWake: stopWake, paintWakeModes: paintWakeModes'
});
