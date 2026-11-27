// Harness for the find-in-list suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, openDetail: openDetail, renderDetail: renderDetail, goBack: goBack, closeDetail: closeDetail, foldText: foldText, findTokens: findTokens, findHit: findHit, findPlan: findPlan, searchAll: searchAll, playBody: playBody, coolGroup: coolGroup, coolLeft: coolLeft, catMemo: function () { return catMemo; }, findMemo: function () { return findMemo; }, FIND_SHOW: FIND_SHOW",
  "delays": true
});
