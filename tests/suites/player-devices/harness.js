// Harness for the player-devices suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  toastLinks: true,
  expose: 'state: state, K: K, MY_ID: MY_ID, setPlayer: setPlayer, paintPlayer: paintPlayer, paintNp: paintNp, paintProgress: paintProgress, ' +
    'openNp: openNp, closeNp: closeNp, seekTo: seekTo, seekBy: seekBy, setVolume: setVolume, toggleShuffle: toggleShuffle, cycleRepeat: cycleRepeat, ' +
    'makeSlider: makeSlider, seekSlider: function () { return seekSlider; }, volSlider: function () { return volSlider; }, curPos: curPos, ' +
    'openSheet: openSheet, closeSheet: closeSheet, loadSheetDevices: loadSheetDevices, fetchDevices: fetchDevices, renderSheet: renderSheet, transferTo: transferTo, ' +
    'checkDevice: checkDevice, recomputeDevice: recomputeDevice, deviceFresh: deviceFresh, noDeviceKnown: noDeviceKnown, controlDevice: controlDevice, ' +
    'openQueue: openQueue, closeQueue: closeQueue, loadQueue: loadQueue, renderQueue: renderQueue, addToQueue: addToQueue, queueHide: queueHide, readQueued: readQueued, ' +
    'onItemClick: onItemClick, playNow: playNow, playBody: playBody, itemRow: itemRow, ' +
    'wakeSpotify: wakeSpotify, setWakeMode: setWakeMode, wakeMode: wakeMode, waitForPlay: waitForPlay, waitLoop: waitLoop, showWaitTimeout: showWaitTimeout, ' +
    'readPending: readPending, resumePending: resumePending, stopWake: stopWake, ' +
    'pollPlayer: pollPlayer, schedulePoll: schedulePoll, pollEvery: pollEvery, storePlayerCache: storePlayerCache, applyPlayerCache: applyPlayerCache'
});
