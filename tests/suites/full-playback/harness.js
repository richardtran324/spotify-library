// Harness for the full-playback suite: the names below are exposed from index.html for testing.
'use strict';
module.exports = require('../../lib/harness')({
  "expose": "state: state, K: K, openDetail: openDetail, syncEmbedTheme: syncEmbedTheme, embedApi: embedApi, canList: canList, paintDetailFoot: paintDetailFoot, VERSION: VERSION"
});
