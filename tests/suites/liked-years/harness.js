// Harness for the liked-years suite (v2.48): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, openDetail: openDetail, renderDetail: renderDetail, goBack: goBack, closeDetail: closeDetail, findPlan: findPlan, searchAll: searchAll, coolGroup: coolGroup, coolLeft: coolLeft, likedYM: likedYM, likedSub: likedSub, likedYearsOn: likedYearsOn, loadedYears: loadedYears, jumpYear: jumpYear, paintYears: paintYears, findMemo: function () { return findMemo; }, LY_MIN: LY_MIN",
  "delays": true
});
