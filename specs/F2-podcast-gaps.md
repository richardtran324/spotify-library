# F2: Podcast feature gaps (Spotify Library page vs. the Spotify iOS app)

Date: 2026-11-26. Scope: podcasts only. No code changes were made.

## Summary

- The page already covers the core of podcast listening: Latest episodes, Continue listening, resume where you left off, played status, Saved episodes, follow and unfollow, newest/oldest sort, Back 15 s and Forward 30 s, and its own listening history.
- The biggest gap is **episode notes**. The page never shows an episode's description. The data is already in two responses the page fetches today (the Now Playing check and a podcast's episode list), so notes cost **zero extra requests** in most cases.
- Notes unlock a second gap for free: **tappable timestamps and chapters**. Spotify's own creator rules make chapters plain "(00:00) Title" lines in the description. The Web API has no chapters field for podcast episodes, so parsing the description is the only route.
- Playback speed, sleep timer, downloads, comments, polls, Q&A, and notifications are **not possible** from a web page through the Web API. Spotify's "In this episode" suggestions and topic links are **not allowed** under Richard's rule.
- None of the top 5 picks needs a new scope, so none forces a new sign-in.

## 1. What the page has today

Sources: README.md sections "Podcasts", "Podcast listening history", "Saved album and podcast lists", "Spotify's request limit", and greps of index.html.

| Feature | Where | Notes |
|---|---|---|
| Podcasts filter with **Latest / Shows** switch | README "Podcasts" | Latest = newest 5 per show, 50 total, cached 12 h, reloads 12 shows per refresh, 2 at a time (index.html `LATEST_*` constants, lines 700 to 704). |
| **Continue listening** row | README "Podcasts" | Up to 10 started episodes, merged from page history, Latest, Saved episodes and opened show lists. |
| Resume where you left off | `resumeOf()` line 1403, play body `position_ms` line 2284 | Uses `resume_point.resume_position_ms` and `fully_played`. |
| **Played**, "12 min left", length on rows | `epWhen()` line 1408 | Played = within last minute, or Spotify says fully played. |
| Green "new" dot | README "Latest episodes" | Episodes from the last 7 days not started. |
| **Play newest** and **Hide played** | Latest header, lines 2156 to 2196 | Hide played works on Latest and Home only (`hidePlayed()` used at 2156 and 3906). |
| Show episode list | `showPage()` line 4300 | Newest first, 50 at a time, saved on the phone (60 shows), refresh after 12 h or on **Check for new episodes**. |
| Sort show episodes | `SORTS['d-show']` line 1290 | Newest / Oldest, but only across episodes already loaded. |
| **Saved episodes** (Spotify's "Your Episodes") | `/me/episodes`, sort `d-episodes` | Recently saved / Newest / Oldest. |
| Follow / unfollow, save episode, queue episode | Heart and **+** buttons, `PUT/DELETE /me/library` line 1555 | |
| Now Playing for episodes | lines 4974 to 4975 | Seek bar, **Back 15 s**, **Forward 30 s**, **Open show**, **Open in Spotify**. |
| Podcast listening history | `epHistory` key line 640 | 60 episodes, 60 days, on this phone only. Shown in **Recent** and Jump back in. |
| Search shows and episodes | README "Search Spotify" | 10 results per type. |
| Offline fallback while catalog is paused | README "Saved album and podcast lists" | Saved and played episodes of a show. |

Scopes already granted (index.html lines 603 to 615) include `user-read-playback-position`, `user-library-read`, `user-library-modify`, `user-read-playback-state`, `user-modify-playback-state` and `user-read-currently-playing`.

What the page does **not** have (grep for `description`, `chapter`, `share`, `speed`, `sleep` finds nothing podcast related): episode notes, chapters, timestamp links, share, mark played/unplayed, an unplayed filter on a show's list, true oldest-first, video labels, sleep timer.

## 2. Spotify iOS app podcast features (2024 to 2026)

| App feature | Evidence | On the page? |
|---|---|---|
| Follow / unfollow a show | Spotify support "Podcasts and shows" [S1] | Yes |
| Your Episodes (save an episode) | [S1] | Yes (Saved episodes) |
| Playback speed control | [S1] ("Tap ... to control the play speed") | No |
| Skip back / forward (15 s) | [S1] | Yes (15 s back, 30 s forward) |
| Downloads, auto-download | [S1] | No |
| Video podcasts | [S1] | No (audio plays; no video label) |
| Share an episode | [S1] | No (only Open in Spotify) |
| Share at a timestamp | Spotify newsroom, May 2021 [S2]; Engadget [S3] | No |
| Mark as played / unplayed | Spotify Community "Implemented Ideas: Mark podcasts as played" [S4] | No |
| New episode notifications | Spotify Community "Implemented Ideas: Push notification for new episodes" [S5] | No |
| Comments on episodes | Spotify newsroom, July 2024, auto-publish Oct 2024, more languages Apr 2025 [S6] | No |
| Polls and Q&A | [S6] (introduced 2021, 9M listeners used them in 2024) | No |
| Chapters (automatic and from description timestamps) | Spotify for Creators "Episode chapters" [S7]; Feature Focus June 2025 [S8] | No |
| Episode description / show notes | Episode object `description`, `html_description` [W1] | No |
| Transcripts | [S8] | No |
| "In this episode" recommendations, topics and guests links | [S8] | No (and not allowed) |
| Sleep timer, including "end of episode" | Spotify newsroom sleep timer post [S9]; community threads on podcast sleep timer [S10] | No |
| Sort show episodes, unplayed filter | Community idea "Consistent podcast sort options plus oldest first" [S11] | Partly (sort on loaded items; no unplayed filter on a show) |
| Continue listening / New episodes feed | [S1] (Home > Podcasts > Following) | Yes (Continue listening, Latest) |

Unverified: the exact speed range in the iOS app and the exact sleep timer options. I could not find a Spotify support page that lists them. Neither matters, because neither can be built.

## 3. Each gap: allowed and feasible?

Rule check uses `ex/rules.md`: no ads, no suggested content; the catalog bucket runs out at about 21 requests an hour, so nothing may fan out per episode.

API facts used below (all from the Spotify Web API reference):

- `GET /shows/{id}/episodes` returns `description`, `html_description` and `resume_point` for each episode. Max `limit` 50. No sort parameter. [W2]
- `GET /me/player?additional_types=episode` returns the full episode, with `description`, `html_description` and `resume_point`. [W3] The page calls this every 20 s already (index.html line 2745).
- `GET /episodes/{id}` still exists; `GET /episodes` (batch) was removed Feb 2026. [W4]
- Chapters endpoints (`/chapters/{id}`, `/audiobooks/{id}/chapters`) are for **audiobook** chapters only, and only in six markets. The episode object has **no chapters field**. [W1][W5]
- Player endpoints are play, pause, next, previous, seek, repeat, volume, shuffle, transfer, devices, recently played, queue. There is **no playback speed** endpoint or field. [W3]
- There is **no endpoint** to mark an episode played or unplayed, to read or post comments, polls or Q&A, or to download. (Checked against the Web API reference sidebar and the Feb 2026 changelog [W4]; absence is my reading of the reference, not a Spotify statement.)
- `resume_point` needs `user-read-playback-position` (already granted). A 2024 bug made `fully_played` differ between show episodes and single episode calls; it was later fixed. [C1]

| Gap | Allowed? | Feasible? | Why |
|---|---|---|---|
| Episode notes (description) | Yes, with a note on sponsor text | **Yes** | Already in player and show-list responses. |
| Chapters / tappable timestamps | Yes | **Yes** | Parse "(MM:SS) Title" lines from `description` [S7]; seek with the player API. Automatic transcript chapters are not exposed. |
| Unplayed filter on a show's list and Saved episodes | Yes | **Yes** | Uses data already loaded. |
| Mark as played / unplayed | Yes | **Partly** | No API. A mark on this phone only is possible; Spotify and the iOS app won't see it. |
| Share at a timestamp | Yes | **Yes, link format unverified** | `navigator.share` works in iOS Safari [M1]. Podnews reports a `t=` seconds parameter [P1]; Spotify doesn't document it. |
| True oldest-first ("start from episode 1") | Yes | **Yes** | `total_episodes` is in the saved shows list already; one call with `offset = total - 50`. Order of the API list is newest first by observation, not documented [W2]. |
| Play next episode in order | Yes | **Yes, with limits** | One `POST /me/player/queue`. Spotify may add its own autoplay picks after it. |
| "New since last visit" count | Yes | **Yes** | Compares Latest cache to a stored timestamp. A stand-in for notifications. |
| Video podcast label | Yes | **Yes, low value** | `media_type` on the show object [W1]. The page can't show video; Spotify plays it on the device. |
| Custom skip lengths | Yes | **Yes, low value** | Seek is a player call; the app itself uses 15 s [S1]. |
| Playback speed | Yes | **No** | No API [W3]. |
| Sleep timer, "end of episode" | Yes | **No** | iOS stops page JavaScript in the background, by Apple's design [A1]. A timer in the page would not fire with the screen locked. |
| Downloads, auto-download | Yes | **No** | No API; a web page can't store audio for the Spotify app. |
| Notifications for new episodes | Yes | **No** | iOS web push needs a Home Screen web app [A2] plus a server; Richard uses a Safari tab. Also would need background catalog polling. |
| Comments, polls, Q&A | Yes | **No** | No API. |
| Transcripts | Yes | **No** | No API field. |
| "In this episode" suggestions, topic and guest links | **No** | n/a | Spotify-suggested content [S8]. |
| Notes that carry sponsor reads | Grey area | n/a | Creator text, not Spotify ads. The page can't filter it reliably. See spec 1. |

## 4. Ranked feasible gaps

Request groups: player, library, search, catalog (as in the page).

| Rank | Gap | Effort | Requests | Scope |
|---|---|---|---|---|
| 1 | Episode notes on Now Playing and show list | S/M | 0 normally; 1 catalog on tap only when notes aren't in memory | none new |
| 2 | Chapters and tappable timestamps | M | 1 player call per tap (seek, or play with `position_ms`) | none new |
| 3 | Unplayed filter on show lists and Saved episodes | S | 0 | none |
| 4 | Mark played / unplayed on this phone (and remove from Continue listening) | S/M | 0 | none |
| 5 | Start from the oldest episode | M | 1 catalog per tap, then 1 per **Load more** | none |
| 6 | Share at current time | S | 0 | none |
| 7 | "N new since you last looked" on Podcasts | S | 0 | none |
| 8 | Play the next episode in order (queue it) | M | 1 player call | none |
| 9 | Video label on shows | S | 0 | none |
| 10 | Custom skip lengths | S | 0 extra (seek already used) | none |

### Spec 1: Episode notes

Add a **Notes** button on the Now Playing screen for episodes and an **i** button on each episode row in a show's list. Notes open in a sheet with the episode name, date, length, and the plain `description` text (never `html_description`, so no HTML is injected). Sources, in order: the current player answer (already stored by `storePlayerCache`), the show list response kept in memory for this visit, then a small notes cache in localStorage (last 40 episodes, each cut to 4,000 characters, about 160 KB). Do not add descriptions to the saved show copies; 60 shows by 50 episodes would push localStorage toward its limit. If no notes are in hand (for example a row from Latest or history), the sheet shows **Load notes**, which sends one `GET /episodes/{id}` on that tap only and respects the catalog cool-off. URLs in the text stay plain text, not links, so nothing in notes opens on a stray tap. Sponsor reads in notes are the creator's text; the sheet shows them as written and the README should say so. Richard-only checks: that the Now Playing answer on his account really carries `description` for episodes (Diagnostics can show its length), and that the sheet scrolls well in Safari.

### Spec 2: Chapters and tappable timestamps

When notes are shown, scan each line for a timestamp at the start in the forms Spotify documents, `(00:00) Title`, `00:00 Title`, `1:02:03 Title` [S7], and also timestamps inside a line. Each one becomes a button. Tapping it, when this episode is playing, sends `PUT /me/player/seek?position_ms=` (the page's existing `seekTo`). When another item is playing, it plays this episode with `position_ms` through the existing tap path, so wake mode still applies. If the list meets Spotify's chapter rules (first at 00:00, at least 3, in order), the Now Playing screen also shows the **current chapter** title under the progress bar and **Previous chapter / Next chapter** buttons; this costs nothing extra because the current position is already known from the 20 s check. Spotify's automatic, transcript-made chapters are not in the API, so episodes without timestamps in their notes get no chapters, and the README must say so. Richard-only checks: seek accuracy on his iPhone, and a show he knows uses chapters.

### Spec 3: Unplayed filter on show lists and Saved episodes

Reuse the existing **Hide played** chip and setting (`lib-hide-played`) in a podcast's episode list and in Saved episodes, so one switch works everywhere. Played comes from the same merged status the rows already show (Spotify `resume_point`, the page's history, and the local mark from spec 4). When everything loaded is played, say "Everything loaded here is played" and keep **Load more** visible, because older pages may hold unplayed episodes. Zero requests. Richard-only check: that the setting feels right being shared across lists; if not, split it per list.

### Spec 4: Mark played or unplayed on this phone

Add **Mark played** / **Mark unplayed** to the notes sheet and a swipe or long-press menu if the page has one, else the sheet only. The mark is stored on the phone (a `lib-ep-marks` map: uri to {played, at}, capped at 500, 180 days). It wins over Spotify's `resume_point` until Spotify reports a newer, different state, judged by the page seeing the episode play after the mark's time. **Mark played** also removes the episode from **Continue listening**. Make the limit plain in the UI: "Marked on this phone. The Spotify app won't see it." Spotify has no Web API call to set played status, so there is no sync. Zero requests. Richard-only check: whether a local-only mark is useful enough, given the iOS app keeps its own state.

### Spec 5: Start from the oldest episode

On a show's list, the **Oldest** sort today only reorders the episodes already loaded. Add **Start from the first episode**: one call to `/shows/{id}/episodes?limit=50&offset=max(0, total_episodes - 50)`, using `total_episodes` from the saved shows list (index.html line 1253), so no extra call is needed to learn the total. Show those episodes oldest first; **Load more** walks toward newer ones with the offset going down by 50. Keep this oldest-end page in memory for the visit and do not merge it into the saved newest-50 copy. Pair it with the **Play** button: in oldest mode, **Play** starts the oldest unplayed episode instead of the newest. Cost: 1 catalog call on tap, 1 per **Load more**, never in the background, blocked while catalog is paused. Caveat: the API list is newest first by observation; Spotify's reference gives no sort order [W2], so check the first and last dates on the returned page and flip if needed. Richard-only check: a long serial show.

### Next ones, briefly

- **Share at current time (S, 0 requests):** a **Share** button on Now Playing calls `navigator.share` with `https://open.spotify.com/episode/{id}` plus `?t=<seconds>` when "Share at current time" is on. Podnews documents the `t` seconds parameter [P1]; a forum thread disagrees on the format [F1]. Mark it unverified until Richard tests the link opening at the right time in the iOS app.
- **New since last visit (S, 0):** store when Richard last opened Podcasts; show "3 new" on the Podcasts chip from the Latest cache only. No background fetch.
- **Play next in order (M, 1 player call):** after starting an episode from a show list, offer **Queue next episode** (the next one by release date in the current sort). Spotify may still add autoplay picks after it; the page's existing "Hide songs Spotify adds after my queue" covers the display.
- **Video label (S, 0):** show "Video" on shows whose `media_type` says so. The exact values of `media_type` are not listed in the reference I read, so this is unverified.
- **Custom skip lengths (S, 0):** let Richard pick 10/15/30 s for back and forward.

## 5. Not possible or not allowed

| Feature | Status | Reason |
|---|---|---|
| Playback speed | Not possible | No Web API endpoint or field [W3]. Speed must be set in the Spotify app. |
| Sleep timer (minutes or end of episode) | Not possible | iOS stops page JavaScript in the background [A1]; a page timer would not run with the screen locked. Tip for the README: the iPhone Clock app timer has a "Stop Playing" option when the timer ends [A3], or use the Spotify app's own sleep timer. |
| Downloads and auto-download | Not possible | No API; the page doesn't hold audio. |
| New episode notifications | Not possible | iOS web push needs a Home Screen web app [A2] and a server; Richard uses a Safari tab; it would also need background catalog calls. |
| Comments, polls, Q&A | Not possible | No Web API endpoints. |
| Transcripts and automatic chapters | Not possible | Not in the episode object [W1]; chapters endpoints are audiobooks only [W5]. |
| Marking played in Spotify itself | Not possible | No endpoint. Spec 4 is the local substitute. |
| Per-episode resume point checks in the background | Not allowed by quota | One catalog call per episode fans out; the page dropped this in v2.14 for that reason. |
| "In this episode" suggestions, topic and guest links | Not allowed | Spotify-suggested content [S8]. |
| Recommended or featured podcasts | Not allowed | Suggested content [S1]. |

## 6. Flags

- **No new scopes** in any item above.
- **Unverified:** the `t=` share parameter; `media_type` values; that the show episodes list is always newest first; that the Now Playing answer carries `description` on Richard's Development Mode app (the reference says it does [W3]).
- **Storage:** don't add descriptions to the 60 saved show copies; use a small separate notes cache.
- **Ads:** episode notes often include sponsor reads written by the creator. They are not Spotify ads, but Richard should decide whether that is acceptable before spec 1 ships.

## Sources

- [S1] Spotify Support, "Podcasts and shows": https://support.spotify.com/us/article/podcasts-and-shows/
- [S2] Spotify Newsroom, "3 new ways to share the music and podcasts you love on social" (May 2021): https://newsroom.spotify.com/2021-05-10/3-new-ways-to-share-the-music-and-podcasts-you-love-on-social/
- [S3] Engadget, "Spotify lets you share a specific timestamp from a podcast": https://www.engadget.com/spotify-podcasts-timestamp-sharing-142008057.html
- [S4] Spotify Community, "Podcast (Mobile): Mark podcasts as played" (Implemented Ideas): https://community.spotify.com:443/t5/Implemented-Ideas/Podcast-Mobile-Mark-Podcasts-as-Played/idi-p/1757080
- [S5] Spotify Community, "Podcasts: Push notification for new episodes" (Implemented Ideas): https://community.spotify.com/t5/Implemented-Ideas/Podcasts-Push-Notification-for-new-Episodes/idc-p/5205163/highlight/true
- [S6] Spotify Newsroom, "Comments on Podcasts Gives Creators and Listeners More Ways To Engage": https://newsroom.spotify.com/?p=29987
- [S7] Spotify for Creators, "Episode chapters": https://support.spotify.com/md-en/creators/article/episode-chapters/
- [S8] Spotify for Creators, "Feature Focus June 2025": https://creators.spotify.com/resources/grow/feature-focus-june-2025
- [S9] Spotify Newsroom, sleep timer post: https://newsroom.spotify.com/?p=17856
- [S10] Spotify Community, "Sleep timer not working with podcasts": https://community.spotify.com/t5/Android/Sleep-timer-not-working-with-podcasts/td-p/5082525
- [S11] Spotify Community, "Consistent podcast sort options plus oldest first": https://community.spotify.com/t5/Live-Ideas/Consistent-podcast-sort-options-plus-quot-oldest-first-quot/idi-p/5646518
- [W1] Spotify Web API, "Get Episode": https://developer.spotify.com/documentation/web-api/reference/get-an-episode
- [W2] Spotify Web API, "Get Show Episodes": https://developer.spotify.com/console/get-show-episodes
- [W3] Spotify Web API, "Get Playback State": https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback
- [W4] Spotify Web API Changelog, February 2026: https://developer.spotify.com/documentation/web-api/references/changes/february-2026
- [W5] Spotify Web API, "Get a Chapter": https://developer.spotify.com/documentation/web-api/reference/get-a-chapter
- [C1] Spotify Community, "Different resume_point values from GetShowEpisodes and GetEpisode": https://community.spotify.com/t5/Spotify-for-Developers/Different-resume-point-values-from-GetShowEpisodes-and/m-p/6328279
- [M1] Can I use, "Navigator API: share": https://caniuse.com/mdn-api_navigator_share
- [P1] Podnews, "Spotify's new social-sharing features": https://podnews.net/update/spotify-social-sharing
- [F1] Latenode Community, "How to link to exact podcast moments in Spotify": https://community.latenode.com/t/how-to-link-to-exact-podcast-moments-in-spotify-from-another-app/19373
- [A1] Apple Developer Forums, "Preventing JavaScript from Stopping in Safari When It Goes into the Background": https://developer.apple.com/forums/thread/777860
- [A2] WebKit, "Web Push for Web Apps on iOS and iPadOS": https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- [A3] Apple, iPhone User Guide, Clock timer: https://support.apple.com/guide/iphone/iph96b1e460/15.0/ios/15.0
- Local: /home/claude/spotify-library/README.md and /home/claude/spotify-library/index.html (line numbers as of 2026-11-26).
