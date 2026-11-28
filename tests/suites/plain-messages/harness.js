// Harness for the plain-messages suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, plainErr: plainErr, failText: failText, setFilter: setFilter, editRefused: editRefused, toggleFollow: toggleFollow, openNp: openNp, renderSignIn: renderSignIn, renderSetup: renderSetup",
  "delays": true
});
