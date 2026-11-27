# Home flash, third pass: ways around it (Nov 27)

Research date: 2026-11-27. Five researchers (system gestures, keeping the iPhone listed in Spotify Connect, links and Spotify's 2025–2026 changes, page-run Shortcuts on iOS 26, and a verifier). Builds on `../C-siri-no-home-flash.md` and the four `home-flash-*.md` files from Nov 26. "Verified" means read on the source page; "Anecdote" is a forum post; "Inferred" is our reasoning with no source.

## Verdict

Nothing a web page can start removes Spotify's Home screen on a cold start. Spotify draws Home whenever its app is opened while it isn't running, and no link, setting or Spotify feature as of November 2026 changes that. The only way to start Spotify with no Spotify screen is a **play press** (Control Center, the lock screen, headphones), which iOS sends to the last Now Playing app and which relaunches it in the background (Apple DTS). The new, cheaper way to make that press is a **Back Tap or Action button shortcut with one Play/Pause action**. It likely shows no screen at all, but no source confirms that Play/Pause wakes a Spotify that isn't running, so it needs iPhone check H1.

## Ranked: how fully each avoids the flash, and setup

| # | Way | Spotify screen? | Other screen? | Setup | Evidence | Page can start it? |
|---|---|---|---|---|---|---|
| 1 | Control Center / lock screen play (today's wait mode) | No | Control Center or lock screen | None | DTS: Now Playing apps relaunch in the background (S1); Richard's own use | No |
| 2 | Headphones / AirPods play | No | No | None | DTS: same process as Control Center (S1); anecdotes (S10) | No |
| 3 | Back Tap → shortcut with only Play/Pause (Play) | Likely no | Likely a banner only | 2 min once | Apple: Back Tap runs a shortcut (S2); Play/Pause acts on the last app that played (S8, S9); cold Spotify unverified | No |
| 4 | Action button → same shortcut (iPhone 15 Pro+) | Likely no | Dynamic Island only (S7, anecdote) | 1 min once | As 3 | No |
| 5 | Wake Spotify shortcut with Play/Pause instead of Open App (shortcut mode) | Likely no | Shortcuts screen; comes back in a new Safari tab (S11) | 3 min once | Every source still says `shortcuts://` opens Shortcuts (S12) | Yes |
| 6 | Siri "resume Spotify" / iOS 27 Siri without "on Spotify" | Unverified | Siri overlay | None | Apple design says background (Nov 26 pass); one report says resume restarts the track (S13) | No |
| 7 | iOS 27 "notification received" automation (Pushcut webhook → notification → Play/Pause) | Likely no | Notification | High: third-party app, page change | Trigger exists (S5, S6); whole chain unverified | Yes, in theory |
| 8 | Silent-track keep-alive (never really pause) | No (after the first wake) | No | Page change | Inferred only; a paused iPhone drops out of Connect in seconds to a minute (S14, S15); costs battery and shows in history | Yes |
| 9 | Open the Spotify app / any link (link mode) | **Yes, Home first** | Spotify | None | No `https://` link opens Now Playing (Spotify's link file, S3); a closed app is handed the link at launch (S4) | Yes |

What we built (v2.29): the guide for 3, 4 and 5 in Diagnostics → Settings, honest notes on each wake option, and README steps. 6, 7 and 8 are not built: 6 is unverified and the page can't call Siri; 7 needs a third-party app and a webhook; 8 plays a track Richard didn't pick, uses battery and data, and a Spotify helper warns that "force activity" tricks may break the platform rules.

## Notes

- **Why links can't fix it.** Spotify's apple-app-site-association file has no now-playing, queue or play path (S3). `/collection`, `/recents` and `/home` paths open the app, but a cold launch still starts at Spotify's own first screen (inferred from S4: the link is delivered after launch). A third-party list gives `spotify:now-playing` (unverified, and `spotify:` links show an "Open in Spotify?" prompt).
- **Play/Pause hits the last app that played sound.** A 2020 Automators user: the system toggle "only works if I was listening to Overcast last" (S9). So a Show songs preview or a video in Safari can take the press. The v2.27 page already drops the embed player when you leave the list; a preview that already played may still hold Control Center (inferred).
- **iOS 26.5 changed x-callback.** Since iOS 26.5 / 18.7.9 (May 2026), a shortcut started with an x-callback link that asks for a result calls `x-error` with `errorCode=4` instead of `x-success` (Drafts forum, S16). The page uses the plain `run-shortcut` link, and the recipe ends with **Open URLs**, so this doesn't affect it.
- **Open URLs opens a new Safari tab** (S11, anecdote). The tap waits in storage, which every Safari tab of the page shares, so the new tab plays it. From the Home Screen icon the return lands in Safari, whose storage is separate (PR #21 handles that by acting as wait mode there).
- **Keeping the iPhone listed.** A paused iPhone dropped out of `/me/player/devices` about a minute after switching apps in a dated 2024 log (S14); other reports say 5 to 30 seconds. Apple: background audio keeps an app awake only while its audio session is active (S15). No iOS Spotify setting keeps it listed; "Spotify Connect in background" appears only for Android in 2024–2026 posts.
- **Nothing new from Spotify.** No Shortcuts or App Intents actions, no Control Center control, no play button in the widget, no start-screen setting (ideas still open). The Feb, Mar, May and Jul 2026 Web API changelogs have no player or wake changes (S17).

## iPhone checks (Richard)

Write down the iOS and Spotify versions. Before each, swipe Spotify away and wait until the page says Spotify is asleep.

- **H1 Back Tap (decides whether the guide's Back Tap step is the best route).** Make **Play Spotify** (one Play/Pause action set to Play), set it under Back Tap → Double Tap. In Safari tap a playlist; the wake line shows. Double-tap the back of the phone. Pass: no Spotify screen and no Shortcuts screen, the tapped playlist plays within a few seconds. Note anything that flashed (banner, Dynamic Island).
- **H2 Back Tap when Spotify wasn't last.** Play a video in Safari (or a Show songs preview) for a few seconds, swipe Spotify away, then repeat H1. Expected: the press resumes the video, not Spotify. If so, the guide's warning is right.
- **H3 Action button** (only if the phone has one): same as H1 with Settings → Action Button → Shortcut → Play Spotify.
- **H4 Wake Spotify shortcut with Play/Pause.** Rebuild Wake Spotify as Play/Pause (Play) → Wait 2 s → Open URLs `https://richardtran324.github.io/spotify-library/?wake=1`. In a Safari tab choose Run my Wake Spotify shortcut, tap a playlist. Pass: Spotify's Home never shows; the Shortcuts screen shows briefly; a new tab opens and plays the tap. Note whether Safari asked to open Shortcuts.
- **H5 Headphones.** With AirPods in, repeat H1 but press play on the AirPods. Pass: no screen, the tap plays.
- **H6 Keep-alive window (information only).** Play something from the page, pause, switch to another app, then come back after 30 s, 2 min and 10 min and tap a song. Note when the page starts asking you to press play. This tells us whether a keep-alive is worth a spec.

## Sources (read 2026-11-27)

- S1. https://developer.apple.com/forums/thread/765674 (undated; Apple DTS: Control Center and headphone play trigger the same background relaunch of the Now Playing app). Verified.
- S2. https://support.apple.com/en-au/guide/shortcuts/run-shortcuts-tapping-iphone-apd897693606/9.0/ios/26 (Apple, iOS 26: Back Tap runs a shortcut; silent on the screen). Verified.
- S3. https://open.spotify.com/.well-known/apple-app-site-association (live file; no now-playing, queue or play path). Verified.
- S4. https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app (undated, ©2026). Verified.
- S5. https://www.macrumors.com/guide/ios-27-shortcuts/ (2026-06-26: "When a notification is received" trigger). Verified.
- S6. https://developer.apple.com/videos/play/wwdc2026/310/ (WWDC26 "What's new in Shortcuts"). Verified.
- S7. https://discussions-jp-prz.apple.com/thread/255239905 (2023-10 to 2024-03, iOS 17: Action button shortcut runs in the Dynamic Island). Anecdote.
- S8. https://www.idownloadblog.com/?p=894541 (updated 2026-04-07: Play/Pause set to Pause pauses "whatever is playing in any app"). Guide.
- S9. https://talk.automators.fm/t/how-to-create-a-single-shortcut-to-toggle-playback-pause-of-overcast/8818 (2020-10-02). Anecdote.
- S10. https://community.spotify.com/t5/iOS-iPhone-iPad/spotify-plays-songs-even-when-its-closed/m-p/5411849/highlight/true (undated: AirPods start a closed Spotify). Anecdote.
- S11. https://developer.squareup.com/forums/t/how-do-i-prevent-the-callback-url-in-ios-from-opening-in-a-new-tab/5700 (2022-04: return URL opens a new tab). Anecdote.
- S12. https://developer.apple.com/forums/thread/732934 (2023, iOS 17: a shortcuts:// link opens the Shortcuts app). Anecdote.
- S13. https://discussions-cn-prz.apple.com/thread/255909430 (iOS 18.1.1, Dec 2024: Siri "resume" restarts the Spotify track). Anecdote.
- S14. https://community.spotify.com/t5/Spotify-for-Developers/is-active-false-and-error-404-not-found/td-p/6007762 (2024-04-15: iPhone gone from devices about a minute after switching apps). Anecdote.
- S15. https://developer.apple.com/forums/thread/764096 (Apple DTS, Sep 2024: background audio keeps the app awake only while the audio session is active). Verified.
- S16. https://forums.getdrafts.com/t/problems-running-shortcuts-on-latest-os-26-5-and-other-updates/16754 (2026-05-15 to 05-29: x-error errorCode=4 after iOS 26.5). Anecdote (app developer).
- S17. https://developer.spotify.com/documentation/web-api/references/changes/july-2026 (and the February, March and May 2026 changelogs). Verified.

Not used: Reddit and any copy of it (blocked for this browser); x.com and one GitHub repo refused automated reads and were not reached another way.
