// Harness for the az-strip suite (v2.60): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, renderList: renderList, setFilter: setFilter, openDetail: openDetail, closeDetail: closeDetail, likedItem: likedItem, azLetter: azLetter, azField: azField, azJump: azJump, azHide: azHide, az: az, AZ_MIN: AZ_MIN, sortList: sortList, stopApp: stopApp, paintCool: paintCool"
});
