# F: Feature gaps vs the Spotify app

Written 2026-11-26. Research only, no code changes. Inventory from `README.md` and greps of `index.html` (never read whole). Checked against the batch specs (A, B, C, D, E1 to E5) so nothing here repeats them. Podcast gaps are covered in more depth by the sibling doc `F2-podcast-gaps.md`; where an item overlaps, this doc says so.

Bracketed numbers like [3] point to the Sources list at the end. "Unverified" means no source I could read confirms it.

## Summary

Top 5 picks:

1. **Find in list:** a search box inside Liked Songs and your own playlists, like the app's pull-down filter. M, no new scope.
2. **Go to artist:** from the Now Playing screen and from any song, open the artist page. S, 2 catalog calls per new artist, no new scope.
3. **Episode notes with tappable timestamps:** read an episode's description and jump to chapters the show wrote. S to M, usually 0 requests, no new scope.
4. **Share and Copy link:** send the song, album, playlist or episode link with the iPhone share sheet. S, 0 requests, no new scope.
5. **Mark as played or unplayed (on this phone):** fix an episode's played state for Hide played, Play newest and Continue listening. S, 0 requests, no new scope.

Nothing in the top 6 needs a new scope. Follow artist (rank 7) and the playlist editing items (ranks 9 and 11) each need one, and they should share a single re-sign-in with E4 if built.

## What the page already has

From `README.md`, confirmed by grep in `index.html`:

- Library lists: Home (shortcuts only), Playlists with Liked Songs, Albums, followed Artists, Podcasts (Latest and Shows), Recent, All, Search Spotify (10 per page).
- Filter by name on library lists (not inside a song list: `header.top.detail .search { display: none; }`, line 90).
- Sort chips per list (Default, A to Z, Most songs, Recently saved, Artist, Release date, Recently added for playlists, and more).
- Pins (up to 30, local), recent searches, Appearance setting.
- Hearts: like songs, save albums, other people's playlists, episodes, shows (`PUT/DELETE /me/library`). Own playlists and artists have no heart.
- **+** adds one song or episode to the queue (`POST /me/player/queue`).
- Song lists with Play and Shuffle, 50 at a time, total length, saved album and podcast lists on the phone.
- Artist page: picture, Play, pin, releases grouped by type. No follow button (`user-follow-modify` is not in `SCOPE_LIST`, lines 603 to 615).
- Now Playing bar and screen: seek, Shuffle, Previous, Play/Pause, Next, Repeat (off, all, one), Back 15 s and Forward 30 s for episodes, volume where the device allows, device picker (Spotify Connect transfer), Open album, Open playlist, Open Liked Songs, Open show, Open in Spotify. No "Open artist" (`npOptions`, line 3065).
- Up next (read only) with Spotify's autoplay picks hidden by default.
- Podcasts: Latest episodes, Continue listening, resume points, Played labels, Hide played, Play newest, local listening history.
- Asleep handling and three wake modes; per-group request cool-off.
- Not present (grep finds nothing): share sheet (`navigator.share`), episode descriptions (`description` only appears as `error_description`), chapters, sleep timer, playback speed, lyrics, audiobooks UI, playlist create or edit, follow artist, grid view.

App features checked: playback controls, queue, shuffle, Smart Shuffle, repeat, sleep timer [5][6], podcast speed, mark as played, Your Episodes, downloads [6], lyrics [7], crossfade, gapless and Automix [8], Connect device picker, library filters, sort, pins, list and grid view [9], folders [10], Smart Filters [5][11], playlist Add, Edit and Sort buttons, Hide, Snooze [4][5], Liked Songs genre filter [4], Jam [13], Messages and listening stats [3], chapters [14].

## Ranked gaps

Requests are new Web API calls, with the page's cool-off group (player, library, search, catalog). Remember the catalog bucket ran out at about 21 requests an hour.

| Rank | Feature | What it does on the page | Effort | Requests | New scope | Notes |
|---|---|---|---|---|---|---|
| 1 | Find in list | A filter box at the top of any song list. Liked Songs gets **Search all N songs**, which loads the rest once per visit. | M | Liked Songs: 1 library call per 50 more songs, once per visit (about 20 for 1,000 songs). Own playlists: 1 catalog call per 50 more songs, so capped and asked first. Albums: usually 0 (saved). | No | App: pull down in a playlist for a search bar [9]. Biggest daily time saver for a large Liked Songs. |
| 2 | Go to artist | **Open artist · Name** in Now Playing options, a tappable artist name in album headers, and in a song's menu. Opens the existing artist page. | S | 2 catalog calls per artist (picture and first 10 releases), 0 if opened this visit. Picture call can be skipped for 1. | No | The app's Now Playing and song menus have Go to artist (not separately sourced; standard menu item). |
| 3 | Episode notes with tappable timestamps | **Notes** on an episode row and on the Now Playing screen for episodes. "(12:34) Title" lines become buttons that seek (if playing) or start the episode there. | S to M | 0 when the episode came from a fresh show list, Saved episodes or the Now Playing check. 1 catalog `GET /episodes/{id}` for cached or history copies, kept for the visit. 1 player call per timestamp tap. | No | Descriptions are in the show-episodes and saved-episodes responses [17][18]. Manual chapters are description timestamps [14]. Detailed in F2. |
| 4 | Share and Copy link | **Share** in Now Playing, in song list headers, and in a row menu. Opens the iPhone share sheet with the `open.spotify.com` link; **Copy link** as fallback. | S | 0 | No | Safari iOS supports `navigator.share` since 12.2 [19]. App has share on every item. |
| 5 | Mark as played or unplayed (local) | A menu item on episode rows: **Mark as played** or **Mark as unplayed**. Feeds Hide played, Play newest, the green dot and Continue listening. | S | 0 | No | No Web API endpoint exists for this [16]. App has it [6]. Can absorb E5 (hiding from Continue listening becomes "Mark as played"). Spotify's own state does not change. |
| 6 | Queue an album or playlist | **Add to queue** in a song list header queues the loaded songs in order, up to 30, one request at a time. | M | 1 player POST per song (for example 12 for an album). 0 catalog if the list is loaded. | No | The API queues one URI per call [20], so a whole list means many calls. Keep the cap and spacing for the 30-second window. |
| 7 | Follow or unfollow an artist | A **Follow / Following** button on the artist page and a heart on artist search results. | S | 1 library call per tap. State comes from the followed list the page already loads (0). | Yes: `user-follow-modify` (one re-sign-in) | Use `PUT/DELETE /me/library?uris=spotify:artist:...` [1][2]. Unverified in docs: the reference page lists user and playlist URIs but not artist [21]; a community thread reports artist URIs work [22]. Test first. |
| 8 | Recents and Creator sorts, plus a "Mine" chip | **Recents** sort on Playlists and Albums (last played first), **Creator** sort on Playlists, and a chip for playlists you own. | S | 0 | No | App sorts: Recents, Recently added, Alphabetical, Creator [9]. Recents reuses E2's last-played record and Recently played contexts. "By you" as an app filter name is unverified. |
| 9 | Remove a song from my playlist | A row menu item **Remove from this playlist** in your own playlists, with a confirm. | M | 1 library call (`DELETE /playlists/{id}/items`, non-GET goes to library in `coolGroup`) | Yes: `playlist-modify-private` (shared with E4) | Reference requires both modify scopes [23]. Dev Mode write access for playlists is unverified [24]. Build only with E4, after one real test. |
| 10 | Grid view | A list or grid toggle for Playlists, Albums, Artists and Shows, remembered per list. | S | 0 | No | App has list and grid views [9]. |
| 11 | Create, rename or describe a playlist | **New playlist** on Playlists; **Edit details** (name, description) on your own playlists. | M | 1 library call each (`POST /me/playlists`, `PUT /playlists/{id}`) | Yes: `playlist-modify-private` (shared with E4) | Endpoints exist [1]. One report of 403 on create in Dev Mode, unresolved [24]. Unverified. |
| 12 | Sleep timer (honest version) | A **Sleep timer** button that explains the two working options: the Spotify app's own timer, or the iPhone Clock timer set to **Stop Playing**. Optional page timer only while the page stays on screen. | S | 0 (1 player pause if the page timer fires) | No | Safari stops a page's JavaScript in the background on iOS [25], so a page timer can't pause Spotify with the screen off. Clock "Stop Playing" steps [26]; works with Spotify is unverified. |
| 13 | Local playlist folders | Group playlists into folders stored on this phone, like pins. | M | 0 | No | Real folders are not in the Web API [27]. These won't match the app's folders [10]. |
| 14 | Audiobooks | An Audiobooks section from your saved audiobooks with chapter lists. | M to L | 1 library call to list; chapter lists are catalog calls | No (`user-library-read` exists) | `GET /me/audiobooks` still exists [1]. Playback of audiobooks through the Web API is unverified. Only worth it if Richard listens to audiobooks. |
| 15 | Reorder songs in my playlist | Move a song up or down in your own playlist. | L | 1 library call per move (`PUT /playlists/{id}/items`) | Yes: `playlist-modify-private` | Endpoint exists [1]; Dev Mode write access unverified. Low value on a phone. |

Already specced elsewhere, so not ranked here: Play buttons on Pinned (E1), Continue where I left off (E2), playlists in Jump back in (E3), Add to playlist (E4), hide from Continue listening (E5), copying other people's playlists (A), pause while asleep (B), Siri start (C).

### Mini-specs for the top 8

**1. Find in list.** Today the name box hides in a song list, so finding one song in Liked Songs means scrolling and tapping Load more. Show a small filter box under the song list header (`renderDetail`) that matches title, artist and album, case and accent blind, over the songs loaded so far. When more pages remain, show **Search all 1,240 songs** under the results. For Liked Songs that button loads the remaining `/me/tracks` pages (library group, 50 per call, 2 at a time, stopping on any 429), keeps them for the visit, and could also save them on the phone like album lists. For your own playlists the remaining pages are `GET /playlists/{id}/items`, which `coolGroup` puts in the catalog group, so the button says how many requests it needs and is disabled above 4 (200 more songs) or while catalog is paused. Albums are usually already complete. Taps still play inside the list. iPhone checks: typing speed with a long Liked Songs, that Search all finishes and stays under the cool-off, and that tapping a match plays the right song in context.

**2. Go to artist.** The Now Playing screen can open the album but not the artist. Add **Open artist · Name** to `npOptions` for songs (one button per artist, up to 3), make the artist line in an album header tappable, and add **Go to artist** to a new row menu (the same menu that holds Share in item 4). Each opens the existing artist page through `openDetail`. If the artist is in the followed list, use its cached picture and skip the `GET /artists/{id}` call, so a followed artist costs 1 catalog call (releases) and a new one costs 2. Both are already kept for the visit by `apiCached`. If catalog is paused, show the usual pause message. iPhone checks: the button appears for songs only, Back returns to Now Playing, and a featured artist opens the right page.

**3. Episode notes with tappable timestamps.** The page never shows what an episode is about. `mapEpisode` should keep a trimmed plain description (say the first 3,000 characters of `description`) from show-episode lists, Saved episodes and the Now Playing item, all of which include it [17][18]. Show a **Notes** link on episode rows and on the Now Playing screen; it opens a sheet with the text. Lines matching "(mm:ss)" or "(h:mm:ss)" become buttons: if that episode is playing, tap seeks there (1 player call); if not, it plays the episode at that spot through the usual `play` path with `position_ms`. Spotify's creator rules make manual chapters exactly these lines [14], so this gives chapters for shows that write them. Cached copies made before this change have no description; the sheet then offers **Load notes** (1 catalog call, kept for the visit). Store descriptions only in memory or trim hard in saved lists to protect phone storage. F2 has the full podcast version. iPhone checks: long notes scroll, a timestamp lands on the right second, and the asleep path still works.

**4. Share and Copy link.** The app shares everything; the page shares nothing. Add **Share** to the Now Playing screen, to song list headers (album, playlist, show, artist) and to the row menu. It calls `navigator.share({ title, url })` with the item's `open.spotify.com` link, which the page already builds in each mapper (`url`). If `navigator.share` is missing or rejected, fall back to **Copy link** with `navigator.clipboard.writeText`, which Diagnostics already uses (line 2683), and a toast. No requests and no scope. iPhone checks: the share sheet opens from a tap, Messages shows a Spotify preview, and cancelling the sheet shows no error.

**5. Mark as played or unplayed (local).** Spotify gives apps no way to set an episode's played state [16], so a show you finished elsewhere, or never want, stays "unplayed" here. Add a row menu item on episodes: **Mark as played** or **Mark as unplayed**. Store `{uri: played true or false, at}` in a new localStorage key (for example `lib-ep-mark`, up to 300 entries, 120 days). `mapEpisode` applies the mark over Spotify's `resume_point`, so Hide played, Play newest, the green dot, Continue listening and the Played label all follow it. A later play the page sees clears the mark. This can replace E5's ×, or sit beside it. Spotify's own app is not changed, and the doc says so in the README. iPhone checks: Hide played hides a marked episode at once, Play newest skips it, and Mark as unplayed brings it back.

**6. Queue an album or playlist.** The app can add a whole album or playlist to the queue; the page queues one song at a time. Add **Add to queue** beside Play and Shuffle in song list headers. It takes the loaded songs in list order (not the sorted view), up to 30, and sends `POST /me/player/queue?uri=` one at a time, waiting for each answer, because Spotify takes one URI per call and doesn't guarantee order across player calls [20]. A progress toast says **Queued 7 of 12**, with **Stop**. On a 429 or 404 it stops and reports how many went in. Each added song is recorded in the page's "added with +" list, so Up next keeps showing them. Spotify must be open on a device, as for **+**. iPhone checks: order in the app's queue matches, the burst doesn't trip the player cool-off, and Up next lists them.

**7. Follow or unfollow an artist.** You can open an artist but not follow one. Add a **Follow / Following** button on the artist page next to Play and the pin, and a heart on artist rows in search. It sends `PUT /me/library?uris=spotify:artist:{id}` or `DELETE` (library group, 1 call), with Undo like other hearts, and updates the cached followed list so the Artists filter changes at once. State comes from that list, so no contains check is needed. This needs `user-follow-modify`; adding it to `SCOPE_LIST` shows the **New features need one more sign-in** banner once. Unverified: Spotify's reference for this endpoint does not list artist URIs [21], though a community thread reports they work [22]. Ship only after a real test. iPhone checks: the re-sign-in works, the artist appears in the app's library, and Undo removes it.

**8. Recents and Creator sorts, plus a Mine chip.** The app's default library order is Recents [9]; the page has no "last played" order. Add a **Recents** sort chip to Playlists and Albums that orders by last play time from E2's per-context record (`lib-ctx-last`) and the contexts in Recently played, with never-played items after, in the default order. Add **Creator** to Playlists (owner name, then title), and a **Mine** chip that shows only playlists you own or collaborate on, using `ownerId` and `collaborative` already in each row. No requests. Recents depends on E2's record, so build E2 first. iPhone checks: a playlist played in the Spotify app moves up once the page sees it, and Mine hides followed playlists.

## Not possible or not allowed

| App feature | Status | Reason |
|---|---|---|
| Lyrics | Not possible | No lyrics endpoint in the Web API; the app shows lyrics only in its own player [7]. |
| Podcast playback speed | Not possible | No speed endpoint in the Player API list [15]. |
| Crossfade, gapless, Automix, mix transitions | Not possible | App settings only, and Spotify says they can't change during Connect [8]; no endpoint [15]. |
| Audio quality, Lossless, equalizer, normalization | Not possible | App settings only; no endpoint [15]. |
| Remove, reorder or clear the queue, Play next, play from queue | Not possible | The API can only read the queue and add one item [15][20]. |
| Downloads and offline mode | Not possible | A web page can't download Spotify audio; no endpoint. |
| Real playlist folders | Not possible | Folders are not exposed in the Web API [27]. Local folders are rank 13. |
| Liked Songs genre or mood filter, Smart Filters, playlist from filtered Liked Songs | Not possible | Songs carry no genre. It would need one artist lookup per artist in the catalog bucket (about 21 an hour), and batch artist GETs are gone [1]. Mood and activity tags are not in the API. |
| Hide song in a playlist | Not possible | No endpoint (not in the playlist or player references) [1][15]. |
| Mark as played in Spotify itself | Not possible | No endpoint [16]. Local version is rank 5. |
| Auto-generated chapters | Not possible | Generated inside Spotify [14]; the episode object has no chapters field [16]. Manual timestamps are rank 3. |
| Sleep timer that works with the screen off | Not possible | iOS stops a Safari page's JavaScript in the background [25]. Rank 12 points to the app's and the Clock's timers. |
| New-episode notifications | Not possible | The page has no server, and iOS web push needs a Home Screen web app; Richard uses a Safari tab. Unverified here (not re-checked). |
| Private session | Not possible | Visible in playback state only as a device flag; no endpoint to turn it on [15]. |
| Song credits | Not possible | No credits endpoint found. Unverified. |
| Jam, Blend, collaborator invites, Messages | Not possible | Social features with no Web API endpoint [3][13]. |
| Music videos, Canvas, video podcasts | Not possible | The page controls the Spotify app and can't play video. |
| Smart Shuffle | Not allowed | Adds Spotify's recommendations [4][5], and there is no endpoint [15]. |
| Autoplay recommendations after the queue | Not allowed | Spotify's picks; the page already hides them in Up next. No endpoint to turn autoplay off [15]. |
| Snooze, Exclude from taste profile | Not allowed | Only change recommendations [3][5]; no endpoint. |
| DJ, AI Playlist, Discover Weekly, Release Radar, daylist, radio, Upcoming Releases, following feed, concerts and venues | Not allowed | Suggested content. Richard's rule. |
| Artist top songs, related artists, popularity, follower counts | Not allowed and removed | Rule, and removed from the API in February 2026 [1]. |
| Weekly listening stats (your top songs and artists) | Not allowed (ask) | `GET /me/top/{type}` still exists [1], but it is Spotify's ranking and the rule names top tracks. Revisit only if Richard wants his own stats. |
| Home feed, browse, new releases, categories | Not allowed and removed | Rule, and the browse endpoints are gone [1]. |
| Audiobook recaps | Not possible | No endpoint. |

## Sources

1. [Web API Changelog, February 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026) (removed, replaced and still-available endpoints).
2. [February 2026 Web API Dev Mode Changes, Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
3. [Spotify Newsroom: 25 Ways Spotify Leveled Up Your Listening in 2025](https://newsroom.spotify.com/2025-12-29/year-in-features) (Dec 29, 2025).
4. [TechCrunch: Spotify's latest update gives users more control](https://techcrunch.com/2025/05/07/spotifys-latest-update-gives-users-more-control-over-their-listening-experience) (May 7, 2025: queue with Sleep Timer and Smart Shuffle, Hide, Snooze, playlist Add, Edit and Sort, Liked Songs genre filter, Jam).
5. [Spotify Newsroom: Listen your way, new user controls](https://newsroom.spotify.com/2025-09-05/new-user-controls-personalize-listening/) (Sep 5, 2025: Smart Filters, Hide, Snooze, redesigned queue, playlist customization).
6. [Gizmodo: How to listen to and manage podcasts on Spotify](https://gizmodo.com/spotify-how-to-listen-to-manage-podcasts-new-episodes-1848744764) (Apr 7, 2022: speed, sleep timer, mark as played, Your Episodes, downloads).
7. [Spotify Support: View lyrics](https://support.spotify.com/article/lyrics).
8. [Spotify Support: Transitions between tracks](https://support.spotify.com/us/article/tracks-transitions/).
9. [Spotify Support: Sort and filter](https://support.spotify.com/mx-en/article/sort-and-filter/).
10. [Android Authority: Spotify playlist folders roll out on mobile](https://www.androidauthority.com/spotify-playlist-folders-mobile-rollout-3660742/) (Apr 24, 2026).
11. [TechRadar: Spotify's new Smart Filters](https://www.techradar.com/audio/spotify/spotifys-new-smart-filters-are-the-decluttering-tools-ive-longed-for-but-theyre-missing-one-key-element-i-cant-get-past) (Sep 2025).
12. (Merged into [5].)
13. [Spotify Support: Start or join a Jam](https://support.spotify.com/us/article/jam/) (title only, not read).
14. [Spotify for Creators: Episode chapters](https://support.spotify.com/us/creators/article/episode-chapters/).
15. [Web API reference: Get Playback State](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback) (response fields and the full Player endpoint list).
16. [Web API reference: Get Episode](https://developer.spotify.com/documentation/web-api/reference/get-an-episode) (description, resume_point; no mark-as-played endpoint).
17. [Web API reference: Get Show Episodes](https://developer.spotify.com/documentation/web-api/reference/get-a-shows-episodes).
18. [Web API reference: Get User's Saved Episodes](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-episodes).
19. [Can I use: navigator.share](https://caniuse.com/mdn-api_navigator_share).
20. [Web API reference: Add Item to Playback Queue](https://developer.spotify.com/documentation/web-api/reference/add-to-queue).
21. [Web API reference: Save Items to Library](https://developer.spotify.com/documentation/web-api/reference/save-library-items).
22. [Spotify Community: Restore Web API write access for individual developers](https://community.spotify.com/t5/Spotify-for-Developers/Restore-Web-API-write-access-for-individual-developers/m-p/7474377) (artist follow via `/me/library` works).
23. [Web API reference: Remove Playlist Items](https://developer.spotify.com/documentation/web-api/reference/remove-items-playlist).
24. [Spotify Community: Web API playlist creation returns 403 in Development Mode](https://community.spotify.com/t5/Spotify-for-Developers/Web-API-playlist-creation-returns-403-in-Development-Mode-no/td-p/7482480) (unresolved).
25. [Apple Developer Forums: Preventing JavaScript from stopping in Safari in the background](https://developer.apple.com/forums/thread/777860) (Apple staff, Mar 2025).
26. [iMore: How to set a timer to stop playing music on iPhone](https://www.imore.com/how-set-timer-stop-playing-music-and-movies-your-iphone-and-ipad) (updated Aug 1, 2024; Spotify not named).
27. [Spotify Community: Feature Proposal, expose folders in the API](https://community.spotify.com/t5/Spotify-for-Developers/Feature-Proposal-Expose-folders-in-the-api/td-p/5523025) (open request, no endpoint).
