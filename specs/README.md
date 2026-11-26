# Specs batch 1 (no code changes)

Specs for every open Spotify Library item, written Nov 26, 2026 from the batch 1 brief. Nothing here is built. Pick what to build next.

Ranked by value to Richard. "Requests" means new Web API calls and their cool-off group (player, library, search, catalog).

| Rank | Item | Summary | Recommendation | Effort | Requests | New scope |
|---|---|---|---|---|---|---|
| 1 | [B. Pause while asleep](B-pause-while-asleep.md) | Pause no longer shows "Press play first to wake Spotify." when the iPhone has dropped off. | Build. On a 404, retry once without device_id, then show paused and asleep with no toast, freeze the position at the tap. Also fixes 3 small bugs on that path. | S | Player only, fewer than today (2 calls instead of 3) | No |
| 2 | [D. iPhone test script](D-iphone-test-script.md) | 11 steps, about 10 minutes (steps 8 to 10 optional, about 5 more). | Run it before building more, so later specs start from known results. | None | About 4 per Diagnostics open, no catalog bursts | No |
| 3 | [E1. Play buttons on Pinned cards](E-mini-specs.md#e1-play-buttons-on-homes-pinned-cards) | One-tap play on Home's pins. | Build. | S | 1 player call per tap | No |
| 4 | [E3. Playlists and Liked Songs in Jump back in](E-mini-specs.md#e3-playlists-and-liked-songs-in-jump-back-in) | Reuses the Recently played answer and the library cache. | Build. | S | None | No |
| 5 | [E2. Continue where I left off](E-mini-specs.md#e2-continue-where-i-left-off-in-an-album-or-playlist) | A "Continue · Song" button in an album or playlist header. | Build. | S | None to show, 1 player call per tap | No |
| 6 | [A. Other people's playlists](A-other-peoples-playlists.md) | Option #2: a "Make a copy" helper with steps and a local link between original and copy. Option #3 (queue view): don't build. | Build #2 (M), or only the steps (S). App steps are unverified until checked on the iPhone. | M (S cut) | None new; opening the copy uses the existing items call on tap (catalog) | No |
| 7 | [C. Start Spotify through Siri](C-siri-no-home-flash.md) | No source shows Siri or Shortcuts starting Spotify without its UI, and a web page can't call Siri. | Keep "Wait for me to press play". One text fix now; add a Siri hint only if iPhone check C1 passes. | S (text) | None | No |
| 8 | [E5. Remove an episode from Continue listening](E-mini-specs.md#e5-remove-an-episode-from-continue-listening) | Local hide with Undo. | Build if wanted. | S | None | No |
| 9 | [E4. Add the playing song to my playlist](E-mini-specs.md#e4-add-the-playing-song-to-one-of-my-playlists) | Now Playing option, POST /playlists/{id}/items. | Only after a real test: Dev Mode support is unverified. | M | 1 POST per add (library) | Yes, playlist-modify-private (one re-sign-in) |

## C research in one line

Apple's docs say an audio app answering a Siri play request can start in the background with no UI, but nothing from Spotify or users confirms Spotify does this today. Sources are listed in [the C spec](C-siri-no-home-flash.md#research-findings).

## How these were written

One subagent per item (A to E), run in parallel, each given only the parts of `index.html` it needed and the brief's rules. Merged and checked by hand. Every spec lists the checks only Richard can do on the iPhone.
