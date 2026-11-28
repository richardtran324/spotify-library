// Harness for the request-timeouts suite: the names below are exposed from index.html for testing.
// REQ_LIMIT_MS is guarded so the suite still runs (and fails its checks) against a page without it.
'use strict';
module.exports = require('../../lib/harness')({
  expose: 'state: state, K: K, api: api, pollPlayer: pollPlayer, checkDevice: checkDevice, onItemClick: onItemClick, accessToken: accessToken, inflight: inflight, devicesReq: function () { return devicesReq; }, REQ_LIMIT_MS: typeof REQ_LIMIT_MS !== "undefined" ? REQ_LIMIT_MS : null'
});
