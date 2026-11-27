// Harness for the rate-limits-errors suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, api: api, addToQueue: addToQueue, noteRateLimit: noteRateLimit, isCool: isCool, coolUntil: coolUntil, coolLeft: coolLeft, coolBlocked: coolBlocked, coolText: coolText, coolToast: coolToast, coolErr: coolErr, paintCool: paintCool, afterCool: afterCool, readCool: readCool, meterCount: meterCount, meterNote: meterNote, meterShared: meterShared, meterTop: meterTop, httpError: httpError, errMsg: errMsg, onFail: onFail, logError: logError, errorLog: function () { return errorLog; }, openDiag: openDiag, runDiag: runDiag, copyDiag: copyDiag, closeDiag: closeDiag, NO_DEVICE: NO_DEVICE"
});
