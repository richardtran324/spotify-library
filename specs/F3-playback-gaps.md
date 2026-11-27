# F3: Playback, Now Playing, queue and devices: gap review

Scope: playback controls, the Now Playing bar and screen, Up next (queue) and the device picker in `/home/claude/spotify-library/index.html`. Podcast-only and library-browsing features are out of scope. No code was changed.

Method: grepped `index.html` and `README.md` (never read whole), then checked each Spotify app feature against the Web API reference and the February 2026 changelog. Sources are listed at the end, numbered [1] to [30].

## 1. What the page already has

| Feature | Status | Where (README line / index.html line) |
|---|---|---|
| Now Playing bar (cover, song, artist, device, heart, Shuffle, Prev, Play/Pause, Next, Repeat, Up next) | Done | README 55; buttons wired at index 4955-4969 |
| Full Now Playing screen | Done | README 58-72 |
| Seek (drag or tap progress bar) | Done | `PUT /me/player/seek` at index 3196 |
| Back 15 s / Forward 30 s (episodes only) | Done | index 518-519, 3198, 4974 |
| Shuffle on/off | Done | `PUT /me/player/shuffle` at index 3228 |
| Repeat off, all, one (cycles) | Done | `PUT /me/player/repeat` at index 3205-3209 |
| Volume slider, shown only when `device.supports_volume` is true | Done | index 3199-3201, 3319-3321 |
| Device list and transfer (`PUT /me/player` with `device_ids`, `play` kept as it was) | Done | index 3014-3018; README 78 |
| Heart (save) for the current song or episode | Done | index 4965-4968; `toggleSave` at 1547 |
| Add a song or episode to the queue (+ in lists) | Done | `POST /me/player/queue` at index 2695 |
| Up next, read only, with a switch that hides Spotify's autoplay picks | Done | `GET /me/player/queue` at index 3398; README 74-76 |
| Open album, playlist, Liked Songs or show from Now Playing | Done | `npOptions` at index 3065-3084 |
| Open in Spotify link | Done | index 3346 |
| "Playing" label on the current row in lists | Done | README 77 |
| Asleep state and wake modes for an idle iPhone | Done | README 149-175 |
| Per-group cool-off (player, library, search, catalog) | Done | README 187 |
| Open artist from Now Playing | **Missing** | `npOptions` has album, playlist, Liked Songs and show only |
| Share | **Missing** | no `navigator.share` in index.html |
| Add current song to a playlist | **Missing** | no `POST /playlists/{id}/items` in index.html |
| Add a whole album or playlist to the queue | **Missing** | queue add is one song at a time |
| Sleep timer | **Missing** | no timer code |
| Play from a queue row, reorder, remove, clear | **Missing** | README 74 says the page can't reorder or play from the queue |
| Media Session (lock screen controls) | Not used | no `mediaSession` in index.html; not needed, see section 4 |

Current scopes (index 602-615): `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `user-library-read`, `user-library-modify`, `user-follow-read`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-recently-played`, `user-read-playback-position`, `user-read-currently-playing`. Note: `playlist-modify-private` is **not** in the list.

## 2. Spotify iOS app playback features (2024-2026) and how each maps

| Spotify app feature | Page today | Allowed by Richard's rule? | Possible with the Web API? |
|---|---|---|---|
| Shuffle, repeat all, repeat one | Done | Yes | Yes [5] |
| Seek, skip, previous | Done | Yes | Yes [5] |
| Volume | Done (only when `supports_volume`) | Yes | Yes, but the device must allow it [6][7] |
| Connect device picker and transfer | Done | Yes | Yes [8][9] |
| Add to queue (one song) | Done | Yes | Yes, one track or episode URI per call [3] |
| Add album or playlist to queue | Missing | Yes | Yes, as one call per song [3] |
| Queue reorder, remove, clear (the app does all three [30]) | Missing | Yes | **No.** The Player section has only Get queue and Add to queue [4] |
| Tap a queue row to play it | Missing | Yes | Only by calling Next N times (no direct endpoint) [4] |
| Sleep timer (minutes or end of track) | Missing | Yes | No API timer. The page can send Pause itself, with limits [12][19][20] |
| Go to album / playlist from Now Playing | Done | Yes | Yes |
| Go to artist from Now Playing | Missing | Yes (opens his own artist page, which lists releases) | Yes, the track object has `artists[]` |
| Add to playlist | Missing | Yes | Yes, `POST /playlists/{id}/items` (renamed in Feb 2026) [10][11] |
| Share | Missing | Yes | Not an API feature. iOS Safari Web Share works [21] |
| Lyrics (now under the cover in the app) | Missing | Yes | **No** public lyrics endpoint [4][17][18] |
| Canvas (looping video) | Missing | Yes | **No** public Canvas endpoint [22] |
| Song credits, SongDNA, About the song | Missing | Credits yes; SongDNA and About the song lean toward suggested content | **No** credits endpoint in the reference [4][16] |
| Hide song (in playlists by others) | Missing | Yes | **No** endpoint [23] |
| Snooze a track for 30 days | Missing | About recommendations | No endpoint [13][23] |
| Crossfade, gapless, Automix, normalize | Missing | Yes | **No.** App settings only; can't change them during Connect [14] |
| Autoplay (similar songs after the queue) | Page hides these picks | **Not allowed** (recommended content) | No endpoint. Richard can turn it off in the app [15] |
| Smart Shuffle | Not offered | **Not allowed** (mixes in recommendations) [24] | No documented endpoint |
| DJ | Not offered | **Not allowed** (recommended) | No endpoint |
| Jam (shared queue) | Not offered | Not allowed: it surfaces Spotify recommendations [25]. Also social, not single-user | No endpoint in the Player list [4] |
| Lock screen / Control Center controls | Provided by the Spotify app | Yes | The page doesn't play audio, so Media Session has nothing to control |

Notes on the table:

- The Player section of the reference lists 15 endpoints: playback state, transfer, devices, currently playing, play, pause, next, previous, seek, repeat, volume, shuffle, recently played, get queue, add to queue [4]. There is no queue remove, reorder or clear.
- The February 2026 changelog lists all Player endpoints as "still available" [2]. It renamed playlist item endpoints from `/tracks` to `/items` and removed `/tracks` [1][2].
- `POST /me/player/queue` takes one `uri` that "Must be a track or an episode uri" and needs Premium and `user-modify-playback-state` [3].
- The 2025 Spotify app update moved Shuffle, Repeat and Sleep Timer into a revamped Queue view (Premium), added a preview of what Spotify will play after the queue, and added an off switch for Smart Shuffle and Autoplay [13].

## 3. iPhone and device limits that shape every spec

- **Idle iPhone drops off the device list.** The page's asleep state handles this (README 149-175). Any feature that sends a Player command must go through the existing `command()` path, which already turns a "device gone" answer into the asleep view.
- **Volume on the iPhone.** The device object has `supports_volume`: "If this device can be used to set the volume" [7]. README 62 says an iPhone usually reports false. A developer forum post reports a 403 when setting volume on an iPhone [6]. Since September 2024 the iPhone's own volume buttons no longer drive Connect speakers; Spotify points users to an in-app slider instead [26]. The page's slider for speakers and computers is the useful part. No change needed.
- **Some devices are never listed.** "Some device models are not supported and will not be listed" [7]. AirPlay and Bluetooth outputs belong to the phone, not to Spotify Connect.
- **`is_restricted` devices** accept no Web API commands [7]. The device picker could gray these out (small item, see section 5).
- **Transfer takes one device only.** More than one ID returns 400. `play: false` keeps the current state [8].
- **Order of Player calls is not guaranteed** when mixed with other Player endpoints [6][8]. Multi-call features must send calls one at a time and wait for each answer.
- **Safari timers stop in the background.** An Apple engineer says iOS suspends page script in the background on purpose [19]. Screen Wake Lock (iOS Safari 16.4 and later) can keep the screen on while the page is visible [20]. This matters for any sleep timer.

## 4. Gaps that are not possible or not allowed

| Gap | Why not |
|---|---|
| Queue reorder, remove, clear | No endpoint. Only Get queue and Add to queue exist [4]. |
| "Play next" (insert at the front of the queue) | Add to queue appends; it has no position parameter [3]. |
| Lyrics | No public lyrics endpoint. Lyrics are a Spotify app feature [17][18]. |
| Canvas | No public endpoint; developers have asked without an answer [22]. |
| Song credits, SongDNA, About the song | Not in the Web API reference [4][16]. SongDNA and About the song also lean toward suggested content. Album `label` was removed in Feb 2026 [1], so even label credits are gone. |
| Hide song, Snooze | No endpoint [23]. Snooze is about recommendations anyway. |
| Crossfade, gapless, Automix, normalize, audio quality | App settings only, and not changeable during Connect [14]. |
| Podcast and music playback speed | No speed parameter in the Player endpoints [4]. |
| Autoplay, Smart Shuffle, DJ, Jam | Recommended content, against Richard's rule [15][24][25]. None has an endpoint. |
| Lock screen controls via Media Session | The page plays no audio, so there is nothing for Media Session to attach to. The Spotify app already owns the lock screen controls. |
| In-page audio with the Web Playback SDK | Spotify says the SDK works on iOS with a tap to start [27]. It would play in Safari, not in the Spotify app, and needs the `streaming` scope. That is a different product, not a gap fix. Unverified on iPhone Safari in the background; not recommended. |

**Zero-code advice for Richard (no page change):**

- Turn off **Autoplay** in the Spotify app: profile picture, Settings, Playback, Autoplay off [15]. Then nothing Spotify-picked follows his queue, and the page's "Hide songs Spotify adds after my queue" switch matters less. The page cannot change this setting.
- Turn off **Smart Shuffle** in play modes: profile, Settings and privacy, Playback [24]. Smart Shuffle adds recommendations [24].
- For a sleep timer with the phone locked, the iPhone Clock app has Timer, When Timer Ends, **Stop Playing** [28]. The source tested video apps; it does not name Spotify. **Unverified with Spotify.** Spotify's own Sleep Timer also works but lives in the Spotify app [12][13].

## 5. Feasible gaps, ranked

Request groups follow the page's own cool-off groups (player, library, search, catalog). "On tap" means nothing is sent until Richard taps.

| Rank | Gap | Effort | Requests | Group | New scope? |
|---|---|---|---|---|---|
| 1 | Open artist from Now Playing | S | 0 to show. On tap, whatever the artist page already sends | catalog (on tap) | No |
| 2 | Share the current song or episode | S | 0 | none | No |
| 3 | Add the current song to one of his playlists | M | 1 per add | library (likely; unverified) | Yes, `playlist-modify-private` for private playlists |
| 4 | Sleep timer (minutes, or end of song), page side | M | 1 at the end (Pause), plus at most 1 status check | player | No |
| 5 | Add a whole album or playlist to the queue | M | 1 per song, one at a time, capped | player | No |
| 6 | Tap a queue row to skip to it | M | N calls to Next (N = position), capped | player | No |
| 7 | Device picker polish: gray out `is_restricted`, show device type, show private session | S | 0 (fields already in the devices answer) | none | No |
| 8 | "Next:" line on the Now Playing screen from the last Up next answer | S | 0 if it reuses the last queue answer | none | No |

### Mini-specs for the top 5

**1. Open artist from Now Playing (S, 0 requests to show, no new scope).**
Add one button per artist to `npOptions` (index 3065), after "Open album", for songs only, up to 3 artists from `p.item.artists`. Label: **Open artist · Name**. Build the item the way the library code does (`kind: 'artist'`, as at index 1244) and open it with the existing `npOpenDetail` path, so Back returns to the Now Playing screen like the album button does (README 72). Showing the button sends nothing. Tapping opens the existing artist page, which already asks for the artist's releases on its own; those calls hit the catalog bucket (about 21 an hour per rules.md), so there must be no prefetch. If catalog is cooling off, the artist page's existing message shows. It lists only the artist's own releases, so it stays within Richard's rule. Checks only Richard can do: that the artist page opens over the Now Playing screen and Back returns to it on the iPhone.

**2. Share (S, 0 requests, no new scope).**
Add a **Share** button to the Now Playing screen next to **Open in Spotify**. On tap, call `navigator.share({ title: name + ' · ' + artist, url: spotifyUrl(item) })` (the page already builds the `open.spotify.com` link, index 3085-3088). Web Share is in iOS Safari since 12.2 [21]. It must run inside the tap handler. If `navigator.share` is missing, copy the link with `navigator.clipboard.writeText` and show **Link copied** (the page already uses the clipboard in Diagnostics, index 2683). Ignore the AbortError when he closes the share sheet. No Web API call. Checks only Richard can do: the iOS share sheet opens and Messages shows the link preview.

**3. Add the current song to a playlist (M, 1 request per add, new scope).**
Add an **Add to playlist** button on the Now Playing screen (songs only, and later on song rows). It opens a sheet listing playlists from the already loaded library list (no new GET), filtered to ones he owns or collaborates on. Tapping one sends `POST /playlists/{id}/items` with body `{ "uris": [uri] }` [10][11]; the old `/tracks` path is gone [1][2]. Toast: **Added to "Name"**. The page can't cheaply check for duplicates (reading a playlist's items is a catalog-bucket call), so warn only when a cached copy of that playlist already shows the song. Skip Undo in v1, because removing by URI would also remove an earlier copy. **Scope:** `playlist-modify-public` is already granted; Spotify's playlist guide ties public playlists to `playlist-modify-public` and private ones to `playlist-modify-private` [11]. Adding `playlist-modify-private` forces Richard to sign in again; the existing banner (index 853-857) handles that. Without it, only public playlists should be listed. **Unverified:** that Development Mode allows this write for his own playlists. One forum user saw 403s on playlist writes after February 2026, but did not say which endpoint, and their follow problem turned out to be an old endpoint [29]. Test with a fetch mock here; only Richard can confirm the real write and the new sign-in.

**4. Sleep timer (M, 1 player request at the end, no new scope).**
A moon button on the Now Playing screen opens choices: 15, 30, 45, 60 min, **End of song**, **Off**. Store the deadline (a clock time, not a countdown) in localStorage, and check it on each progress tick (index 3239) and on `visibilitychange`. When the deadline passes, send `PUT /me/player/pause` through `command()`. For **End of song**, the deadline is `duration_ms - progress_ms` from the latest answer, minus about 1 second, and it moves if he seeks or skips. The hard limit: iOS suspends page script in the background or with the screen locked [19]. So a timer only fires while Safari is on screen. Offer **Keep screen on until the timer ends** using Screen Wake Lock (iOS Safari 16.4 and later) [20]; the lock is dropped when the tab is hidden, so re-request it on `visibilitychange`. If the deadline has passed by the time the page wakes, pause at once and say **Sleep timer ended at 11:42 PM**. The sheet should say plainly: "Keep this page open on screen. For a locked phone, use the Clock app's Stop Playing or Spotify's own timer." Checks only Richard can do: screen stays on with the wake lock, pause reaches the iPhone at the right time, battery cost overnight.

**5. Add a whole album or playlist to the queue (M, 1 request per song, no new scope).**
Add **Add to queue** next to **Play** and **Shuffle** at the top of a song list. It queues the songs the page has already loaded for that list (no catalog call), in order, starting with the song after the one playing if that list is playing. Send `POST /me/player/queue?uri=…&device_id=…` one at a time, waiting for each answer, about 300 ms apart, because the endpoint takes one URI per call [3] and Player call order isn't guaranteed when calls overlap [6]. Cap at 25 songs per tap ("Queued 25 of 40. Tap again for more"). Stop at the first non-204 answer; a 429 pauses only the player group, and the toast says how many went in. Record each URI with `rememberQueued` (index 3365) so Up next shows them with the hide switch on. Show progress ("Adding 7 of 25…") and a **Stop** link. Not available while Spotify is asleep, like Next. Risk: a large batch can trigger the player cool-off and freeze controls for a while, which is why the cap is low. Checks only Richard can do: songs appear in the Spotify app's queue in the right order, and no cool-off at 25.

### Notes on ranks 6 to 8

- **Tap a queue row to skip to it (rank 6):** The only way is N calls to `POST /me/player/next` [4]. Up next may include autoplay picks between his songs, so position N is fragile. Cap at 5 skips and refresh the queue first. Effort M, low value.
- **Device picker polish (rank 7):** The devices answer already has `type`, `is_restricted` and `is_private_session` [7]. Gray out restricted devices with "Can't be controlled from here". Show a small "Private session" note on the Now Playing screen when true. No new requests.
- **"Next:" line (rank 8):** Show the next song from the last Up next answer only. Do not add a queue call to the Now Playing poll; that would double player-group traffic.

## 6. Flags

- **New scope:** only spec 3 (`playlist-modify-private`), and only if private playlists should be listed. It forces a sign-in.
- **Unverified:** playlist writes in Development Mode (spec 3) [29]; Clock app "Stop Playing" with Spotify [28]; which hidden quota bucket counts playlist writes and queue adds; whether a 25-song queue batch stays under the player limit; Web Playback SDK behavior on iPhone Safari [27].
- **Verified:** no queue remove, reorder or clear endpoint [4]; Add to queue takes one track or episode URI [3]; Player endpoints unchanged in Feb 2026 [2]; `/playlists/{id}/items` replaces `/tracks` [1][2]; `supports_volume` and `is_restricted` fields [7]; transfer takes one device and `play` is optional [8].
- **Testing:** everything above can be checked in a browser with a fetch mock. The real device behavior (asleep iPhone, share sheet, wake lock, queue order in the Spotify app, sign-in for a new scope) can only be checked by Richard on his iPhone.

## Sources

1. Spotify, February 2026 Web API Dev Mode Changes, Migration Guide. https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
2. Spotify, Web API Changelog, February 2026. https://developer.spotify.com/documentation/web-api/references/changes/february-2026
3. Spotify, Web API reference, Add Item to Playback Queue. https://developer.spotify.com/documentation/web-api/reference/add-to-queue
4. Spotify, Web API reference, Get the User's Queue (and Player sidebar). https://developer.spotify.com/documentation/web-api/reference/get-queue
5. Spotify, Web API reference, Player endpoints (repeat, shuffle, seek), listed in [4].
6. Spotify, Web API reference, Set Playback Volume. https://developer.spotify.com/documentation/web-api/reference/set-volume-for-users-playback ; and community post, 403 VOLUME_CONTROL_DISALLOW. https://community.spotify.com/t5/Spotify-for-Developers/403-VOLUME-CONTROL-DISALLOW-on-Volume-Change-for-Set-Playback/td-p/7142685
7. Spotify, Web API reference, Get Available Devices. https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices
8. Spotify, Web API reference, Transfer Playback. https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback
9. README.md of the page, "Choosing a device" (line 78).
10. Spotify, Web API reference, Add Items to Playlist. https://developer.spotify.com/documentation/web-api/reference/add-tracks-to-playlist
11. Spotify, Web API concepts, Playlists. https://developer.spotify.com/documentation/web-api/concepts/playlists
12. MacRumors, How to use Spotify's Sleep Timer on iPhone and iPad (2019). https://www.macrumors.com/how-to/spotify-sleep-timer-feature-iphone-ipad/
13. TechCrunch, Spotify's latest update gives users more control (May 7, 2025). https://techcrunch.com/2025/05/07/spotifys-latest-update-gives-users-more-control-over-their-listening-experience
14. Spotify Support, Track transitions. https://support.spotify.com/us/article/tracks-transitions/
15. Spotify Support, Autoplay. https://support.spotify.com/ba/article/autoplay/
16. Music Business Worldwide, expanded song credits, SongDNA and About the song (Nov 19, 2025). https://www.musicbusinessworldwide.com/spotify-rolls-out-expanded-song-credits-previews-new-songdna-and-about-the-song-features-for-premium-users
17. TechCrunch, Spotify upgrades its lyrics feature (Feb 4, 2026). https://techcrunch.com/2026/02/04/spotify-upgrades-its-lyrics-feature-with-offline-access-more-translations
18. Spotify Community, Update endpoint for lyrics (developer request). https://community.spotify.com/t5/Spotify-for-Developers/Update-endpoint-for-lyrics/m-p/5355493
19. Apple Developer Forums, Preventing JavaScript from stopping in Safari in the background. https://developer.apple.com/forums/thread/777860
20. Can I use, Screen Wake Lock API. https://caniuse.com/wake-lock ; web.dev, Screen Wake Lock supported in all browsers. https://web.dev/blog/screen-wake-lock-supported-in-all-browsers
21. Can I use, Web Share API. https://caniuse.com/web-share
22. Spotify Community, Canvas API (developer request, no answer). https://community.spotify.com/t5/Spotify-for-Developers/Canvas-API/m-p/5492242/highlight/true
23. Spotify Support, How to hide and unhide songs. https://support.spotify.com/article/hide-unhide-songs/
24. Spotify Support, Shuffle play (Smart Shuffle). https://support.spotify.com/us/using_spotify/the_basics/shuffle/
25. Spotify Support, Start or join a Jam. https://support.spotify.com/us/article/jam/
26. MacRumors, Spotify loses iPhone volume button control of Connect devices (Aug 30, 2024). https://www.macrumors.com/2024/08/30/spotify-loses-iphone-volume-buttons-control/
27. Spotify, Web Playback SDK. https://developer.spotify.com/documentation/web-playback-sdk
28. iMore, How to set a timer to stop playing music and movies on iPhone. https://www.imore.com/how-set-timer-stop-playing-music-and-movies-your-iphone-and-ipad
29. Spotify Community, Restore Web API write access for individual developers. https://community.spotify.com/t5/Spotify-for-Developers/Restore-Web-API-write-access-for-individual-developers/m-p/7474377/highlight/true
30. Spotify Support, Play Queue. https://support.spotify.com/us/using_spotify/features/play-queue/
