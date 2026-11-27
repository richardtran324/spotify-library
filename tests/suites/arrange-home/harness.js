// Harness for the arrange-home suite (Edit Home, v2.59): the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, renderList: renderList, setFilter: setFilter, openDetail: openDetail, closeDetail: closeDetail, readHomeLayout: readHomeLayout, writeHomeLayout: writeHomeLayout, openHomeSheet: openHomeSheet, closeHomeSheet: closeHomeSheet, likedRecentItems: likedRecentItems, HOME_SECTIONS: HOME_SECTIONS, HOME_RECENT_N: HOME_RECENT_N, stopApp: stopApp, onHome: onHome, coolLeft: coolLeft, readCtxLast: readCtxLast"
});
