# C2: Skipping Spotify's Home flash, wider research

Research date: 2026-11-26. Builds on `C-siri-no-home-flash.md` (first pass). I only list sources I opened and read. "Undated" means the page showed no date for the post.

## Verdict

No path a Safari page can start will begin playback on the iPhone without Spotify's own UI. Spotify still ships no Shortcuts or App Intents play actions (users were still asking in September 2025, and the idea is still open). The Web API can't wake a sleeping iPhone, and Spotify's widgets and links open the app in the foreground. The only path with good evidence of no Spotify UI is still pressing play in Control Center or on the lock screen. It is not documented by Apple or Spotify, but it matches Richard's own tests and older forum reports. Siri may also start Spotify in the background (Apple's design for audio apps), but no source confirms what Spotify does, and a page can't call Siri. One new low-cost idea is worth an iPhone test: put the Shortcuts "Play/Pause" media action in the "Wake Spotify" shortcut instead of "Open App". If it wakes Spotify like Control Center does, the shortcut mode would skip Spotify's Home. The Shortcuts screen would still flash. This is unverified.

## Table

| Path | Verdict | Does it avoid Home flash? | Can the page trigger it? | Sources |
|---|---|---|---|---|
| 1. Spotify Shortcuts / App Intents actions | Doesn't work: no native play actions exist (consistent reports to 2025-09, idea still open) | n/a | Only through a Shortcut (Shortcuts app shows) | S1, S2, S3 |
| 1b. Donated "Play Spotify Music" Siri suggestion in Shortcuts | Unverified | Unknown | Only through a Shortcut | First pass (Chrunos 2024) |
| 2. Siri "play X on Spotify" / "resume Spotify" | Works for play requests; UI behavior Unverified | Unknown (Apple's design says background) | No | S4, S5, S6, first pass |
| 3. Universal links / spotify: URIs / `?play=true` | Doesn't avoid flash: opens Spotify in the foreground by design. Autoplay only for single tracks (staff answer); `?play=true` Unverified | No | Yes (that is the current "open app" mode) | S7, S8, S9 |
| 4. Control Center / lock screen play | Likely (Richard's tests plus older anecdotes; no official doc) | Yes | No (user action) | S10, first pass |
| 5. Web API transfer / play to a sleeping iPhone | Doesn't work (Spotify docs silent; many consistent developer reports; no wake endpoint) | n/a | n/a | S11, S12, S13, S14, S15 |
| 6. Apple Watch as remote | Unverified for a cold phone app | Unknown | No | S16, S17 |
| 6b. AirPlay / CarPlay / another Spotify device as remote | Unverified (no source found); another device can't see a sleeping iPhone | Unknown | No | S13, S15 |
| 7a. Shortcuts "Play/Pause" media action in "Wake Spotify" | Unverified (new idea, needs an iPhone test) | Maybe for Spotify; Shortcuts screen still shows | Yes (existing shortcut mode) | S18, first pass |
| 7b. Shortcuts personal automations (Safari opens, NFC) | Unverified; the only Spotify action is "Open App" | No (Open App is foreground) | Not directly | S1, S19 |
| 7c. Spotify widgets (home screen, lock screen) | Doesn't avoid flash: Spotify says the lock screen widget launches the app; no interactive play widget | No | No | S20, S21, S22, S23, S24 |
| 8. Third-party "SpotiActions" app | Unverified (mechanism not stated) | Unknown | Only through a Shortcut | S25 |

## Notes per path

### 1. Spotify Shortcuts and App Intents actions

- The Spotify Community idea "iOS Siri Shortcuts Support" now shows "Live Idea" on its new forum page (S2). The older page showed "Not Right Now" with 3,349 likes (S1). The only staff update I saw is from 2018-12-06 ("no further information to share").
- Users posted through 2025 that support still doesn't exist: 2024-11-22 (asking for play playlist, DJ, Smart Shuffle actions), 2025-09-25 ("still no Spotify Shortcuts support") (S1).
- The newer idea "Add iOS automations in Shortcuts app" (undated) says a shortcut "can open a playlist URL" but the music doesn't start, and a comment says it "cannot reliably start playback". Requested action names (Play Playlist, Play URI, Pause/Resume, Set Shuffle) are requests, not existing actions (S3).
- I found no Spotify newsroom, MacStories, 9to5Mac or MacRumors item announcing Spotify App Intents. 9to5Mac's iOS 26 Shortcuts roundup (2025-12-09) doesn't mention Spotify (S19).
- Apple's general mechanism exists: `AudioPlaybackIntent` (iOS 17+) marks an intent that plays audio (S26). A developer reports an App Intent that plays audio "without bringing the app to the foreground" when `openAppWhenRun` is not set (Apple forums, 2023-07) (S27). Spotify doesn't ship one, so this doesn't help today.
- Reddit: search with a reddit.com filter was refused by the search proxy. Results only pointed to Reddit mirrors, which I did not use.

### 2. Siri

- Siri play requests for Spotify work in 2025, including with "on Spotify" as a workaround when they failed on iOS 18.6 (S4, posts 2025-08-12 to 2025-08-18; moderator 2026-01-27 says "on Spotify" is no longer required).
- Liked Songs: a 2019 guide says a Siri phrase "Starts playing songs from your "Liked Songs" playlist ... with shuffle turned on" (S5). That means Siri would shuffle, not play in order. Old source.
- "Continue/Play on Spotify" resumes the last Spotify item if Spotify played last (iOS 13 era post, undated) (S6).
- No source I read says whether Spotify's screen appears. Apple's design for audio apps is a background launch (first pass). Still Unverified for Spotify. Not page-triggerable.

### 3. Links and URIs

- Spotify's iOS content linking doc: opening content "brings Spotify to the foreground with the selected content". It recommends a web link over `spotify:` because a deeplink "will trigger an iOS confirmation prompt before switching to Spotify". No play parameter is documented (S7).
- Staff answer (undated, accepted): only single tracks autoplay when opened from a link, and only if nothing else is playing. Playlists don't autoplay (S8).
- `?play=true`: one commenter claims it starts playback, platform not stated. Idea status pages conflict ("Live Idea" vs "Closed - Not Enough Votes"). Unverified (S9).
- Whether Home flashes before the item on a cold start: no source. Richard's own phone shows it. Foreground launch is by design, so this path can't avoid Spotify's UI.

### 4. Control Center and lock screen

- No Apple or Spotify document describes it (first pass). A forum post (iOS 15, undated) describes Spotify starting in the background when the app wasn't running; staff said the Connect feature "cannot be completely deactivated" (S10). It fits Richard's tested default. Likely.

### 5. Web API

- Transfer Playback doc: lists only 204, 401, 403, 429; nothing about inactive or missing devices (S11).
- Get Available Devices doc: "Some device models are not supported and will not be listed" (S12). Nothing about waking.
- Developer forum, many users: phones and tablets aren't listed while the app isn't running; one iPhone user says the list clears "after some hours" and only reopening the app brings it back; requests for a wake endpoint get no answer; no staff reply (S13). Other threads: transfer only works after starting playback manually (S14); "No active device found" with an empty list and no answer (S15).
- Verdict: the page can't wake the phone through the API. This matches the page's current design.

### 6. Apple Watch, AirPlay, CarPlay, other devices

- Spotify: you can "Control your phone's Spotify app from your Watch". It doesn't say whether the phone app must be running (S16).
- A 2025-12 Ongoing Issues thread shows the watch switching playback back to the nearby iPhone, so the watch can start iPhone playback in some state. It doesn't say if the phone app was cold or whether its UI appears (S17).
- AirPlay, CarPlay: no source found. A second Spotify device (Mac) can't target a sleeping iPhone (S13). None of these can be started by the page.

### 7. Shortcuts automations, widgets, Live Activities

- Shortcuts media "Play/Pause" action: Cassinelli's action index lists "Play/Pause Music" with "[Play|Pause/Play/Pause] on [Device]" (S18). The page doesn't say whether it controls any Now Playing app or only Music. Untested idea: if it sends "play" to the last Now Playing app like Control Center, it could wake Spotify with no Spotify screen. Needs check C6 below.
- Running a shortcut from Safari still brings the Shortcuts app forward (first pass, 2018 sources). I found no 2024 to 2026 source that says this changed.
- Personal automations (Safari opens, NFC): the only Spotify step available is "Open App" (S1, S3), so they can't avoid the flash. An NFC tag with a Spotify link only shows a prompt and doesn't start playback (S28, undated).
- Widgets: Spotify support says the lock screen widget lets you "Launch Spotify from your iPhone lock screen" (S20). Spotify's blog: "tapping on it will quickly open the Spotify app" (S21). The interactive playback widget idea is "Live Idea", moved to "Good Suggestion" by staff on 2023-09-19, and users still ask for play/pause (S22). Users on iOS 18 to iOS 26 beta (2025) say the new widget shows a single play button or starts a recent playlist (S23, S24); staff said the widget autoplay "is not expected" (S24). Either way it opens the app or plays Spotify's choice, and the page can't press it.
- Live Activities: no source found that Spotify ships one.

### 8. Other

- SpotiActions (third-party, first version 2025-08-25) says it fires playlists from Shortcuts automations and needs "Spotify installed on the same iPhone". Each playlist "has to be installed and played once" first. It doesn't say how it starts playback or whether Spotify's screen appears. It only covers its own fixed playlists, not Richard's library (S25). Not useful here.

## What this changes for the page

- **Keep "Wait for me to press play" as the default.** Nothing found beats it for no Spotify UI.
- **Don't add a new wake mode.** No path is both page-triggerable and free of a screen change.
- **Optional text fix for the "open the Spotify app" mode** (sets the expectation honestly):
  - `Opens Spotify. If it wasn't running, its Home screen shows for a moment.`
- **If the open-app mode uses a `spotify:` link**, consider an `https://open.spotify.com/...` link instead. Spotify's doc says the `spotify:` form shows an iOS confirmation prompt. It still opens Spotify in front. (Whether open.spotify.com has a page for Liked Songs is unverified; keep the current link for Liked Songs.)
- **New iPhone check C6 (gates a text change only):** duplicate "Wake Spotify", replace "Open App" with the "Play/Pause" media action set to Play on iPhone, keep the step that returns to the page. Run it from the page with Spotify swiped away but last to play. Note: did Spotify's screen appear? Did the tapped item play?
  - If it passes, change the shortcut setnote to: `A tap runs your “Wake Spotify” shortcut. The Shortcuts screen shows briefly, then the page plays what you tapped.`
  - And the README shortcut bullet: `Tip: use the Play/Pause action set to Play, not Open App, so Spotify starts without its Home screen.`
- **Siri line stays gated on check C1** from the first pass. If C1 passes, note that a Siri request for Liked Songs may shuffle (2019 guide), so tell Richard to say "resume Spotify", not "play my Liked Songs".

## Sources (all read 2026-11-26)

- S1. https://community.spotify.com/t5/Live-Ideas/iOS-Siri-Shortcuts-Support/idi-p/4569462/page/17 : idea page, posts 2024-07-30 to 2025-09-25, staff 2018-12-06.
- S2. https://community.spotify.com/forum/en/discussion/4569462 : same idea on the new forum, "Live Idea", "simply Open App".
- S3. https://community.spotify.com/t5/Live-Ideas/Add-iOS-automations-in-Shortcuts-app/idi-p/7289169 : undated; shortcut opens URL but playback doesn't start.
- S4. https://community.spotify.com/t5/iOS-iPhone-iPad/Siri-play-requests-not-working-with-Spotify/td-p/7086943/highlight/true/page/2 : 2025-08 to 2026-01-27.
- S5. https://ios.gadgethacks.com/how-to/use-siri-play-spotify-music-all-commands-you-need-know-0208428/ : 2019-10-07; Liked Songs shuffled.
- S6. https://community.spotify.com/t5/iOS-iPhone-iPad/iOS-Continue-or-play-on-Spotify-Siri-integration-bug/td-p/4846368 : undated, iOS 13.1.2.
- S7. https://developer.spotify.com/documentation/ios/tutorials/content-linking : undated official doc.
- S8. https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Links-don-t-automatically-start-playing-the-song/m-p/5395149 : undated staff answer.
- S9. https://community.spotify.com/t5/Live-Ideas/All-Platforms-Autoplay-Parameter-for-Spotify-URIs/idc-p/1323237 : 2015 to 2021 status posts.
- S10. https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-randomly-starts-in-background-when-the-app-is-closed/td-p/5302206 : undated, iOS 15.
- S11. https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback : official.
- S12. https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices : official.
- S13. https://community.spotify.com/t5/Spotify-for-Developers/v1-me-player-devices-returns-empty-array/m-p/6949615/highlight/true : mostly undated, no staff.
- S14. https://community.spotify.com/t5/Spotify-for-Developers/active-a-playback-device-with-API/m-p/5159515/highlight/true : undated, no staff.
- S15. https://community.spotify.com/t5/Spotify-for-Developers/Playback-tracks-without-active-devices/td-p/5630276 : undated, no answers.
- S16. https://support.spotify.com/us/article/apple-watch : official.
- S17. https://community.spotify.com/t5/Ongoing-Issues/Apple-Watch-redirects-to-iPhone-when-selected-as-playback-device/idi-p/7277879/redirect_from_archived_page/true : about 2025-12.
- S18. https://matthewcassinelli.com/?p=4818 : action index, modified 2023-09-18.
- S19. https://9to5mac.com/2025/12/09/ios-26s-shortcuts-app-adds-25-new-actions-heres-everything-new/ : 2025-12-09; no Spotify mention.
- S20. https://support.spotify.com/article/spotify-iphone-widget/ : official, undated.
- S21. https://community.spotify.com/t5/Community-Blog/iPhone-Lock-Screen-Widget-Open-Spotify-Faster/bc-p/5539159/highlight/true : Spotify blog, undated (widget launched 2023-04-13 per 9to5Mac).
- S22. https://community.spotify.com/forum/en/discussion/5634490 : interactive widget idea; staff 2023-09-13 and 2023-09-19.
- S23. https://community.spotify.com/t5/iOS-iPhone-iPad/iOS-app-widget-lost-functionality/td-p/7049066/highlight/true/page/2 : iOS 18.6 and iOS 26 beta 1, Spotify 9.0.58.
- S24. https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Autoplaying-When-Opened-Changing-Playlists/m-p/6851463/highlight/true : iOS 18.1 to 18.3.2, update 2025-01-19.
- S25. https://apps.apple.com/app/id6748419049 : SpotiActions listing, v1.02 2025-08-25.
- S26. https://developer.apple.com/documentation/appintents/audioplaybackintent.md : official, iOS 17+.
- S27. https://developer.apple.com/forums/thread/732904?page=1 : 2023-06-29 to 2023-07; developer reply, not Apple.
- S28. https://community.spotify.com/t5/iOS-iPhone-iPad/How-to-program-a-NFC-for-true-one-touch-playing-a-song-on/td-p/5623005 : undated, no replies.

Also read, used only for context: https://developer.apple.com/forums/thread/761677 (cold-launch delay for AudioPlaybackIntent, undated, Apple DTS replies), https://developer.apple.com/forums/thread/793047 (2025-07-14, intent with `openAppWhenRun` asks for unlock when locked), https://9to5mac.com/2023/04/13/spotify-iphone-lock-screen-widget-new/ (2023-04-13).

Not reachable or not used: https://discussions.apple.com/thread/255842862 redirected to the Apple Support home page. Reddit search with a site filter was refused by the search proxy; Reddit mirror links were skipped. No caches, archives or mirrors used.
