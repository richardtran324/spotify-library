# C2b: Siri and system media controls, without the Home flash

Research date: 2026-11-26. Builds on C-siri-no-home-flash.md and does not repeat its sources except where needed.

## Verdict

No source I could read says that a Siri request makes Spotify show its UI, and no source says it plainly stays hidden either. Apple's design, an Apple engineer's forum answer, and a 2026 Spotify Community thread all point the same way: Siri play requests and system play buttons (Control Center, Lock Screen, headphones) wake an audio app in the background, with no Home screen. So Siri is **Likely** to avoid the Home flash, and the system play buttons are **Likely** in general and **Confirmed** only by Richard's own tested wait mode. None of these paths can be started by a Safari page. The page can only tell Richard what to press or say. The one new risk found: if the page itself ever plays audio, Safari can become the Now Playing app, and the Control Center play button would then control Safari, not Spotify.

## Table

| Path | Verdict | Avoids Home flash? | Can a Safari page trigger it? | Key sources |
|---|---|---|---|---|
| "Hey Siri, play <playlist> on Spotify" (phone unlocked) | Likely plays in background | Likely yes | No | Apple handleInApp doc and WWDC19 (in first pass); Spotify Community "continue in Spotify" thread (2026); Apple DTS forum answer |
| "Hey Siri, resume Spotify" / "play Spotify" | Unverified | Unverified | No | Older reports only (iOS 14 era); no 2023+ report found |
| iOS music app preference (iOS 14.5+), "Default Music App" (per Spotify staff, 2025), iOS 27 App Selection | Unverified that it changes launch style | No effect found either way | No | MacRumors 2021; Spotify Community 2025; RouteNote 2026 (first pass) |
| Type to Siri (double-tap bottom edge) | Confirmed it exists; Likely same handling as voice | Likely yes | No | MacRumors 2024-12-23; Apple Support 105020 (2026-11-12) |
| Siri on Apple Watch | Doesn't work reliably (2023 to 2024 reports) | n/a on iPhone | No | Spotify Community "Siri on AppleWatch does not work" |
| Siri on AirPods | Unverified (likely same as iPhone Siri) | Unverified | No | No source found |
| Control Center / Lock Screen play after Spotify was swiped away | Likely in general; Confirmed on Richard's phone (README) | Yes on Richard's phone | No | Apple DTS forum answer; Spotify Community anecdotes; page README |
| Headphone / AirPods / Bluetooth play button | Likely (same process as Control Center per Apple DTS) | Likely yes | No | Apple DTS forum answer; Spotify Community anecdotes |
| CarPlay | Unverified; not relevant to a phone in hand | n/a | No | No source found |

## Notes

### Siri play requests

- **Apple design (docs, first pass).** For audio, Apple tells media apps to answer `handleInApp`, which "tells the system to launch the main app in the background". `continueInApp` launches it in the foreground.
- **Spotify Community, 2026 (anecdote, but recent).** Users on iOS 26.6 and 26.6.1 report that "Play liked songs" stopped working. Siri said "Sorry, you'll need to continue in Spotify" and then "does nothing". The poster says it "used to play them". Spotify staff reproduced it and later posted that you "should now be able to ask Siri to play your Liked Songs on Spotify without an error message." Users treated the hand-off message as a bug. That suggests the normal path plays without sending you into the app. This is my inference, not something any post states.
- **Also from that thread.** One user saw an "Apple Music splash screen briefly" before the error, and still after the fix. So Siri may flash a system screen even when Spotify stays hidden. Only one user reported it, and another user saw no splash.
- **Spotify Community, 2025 (iOS 18.6).** Many Siri play requests failed with an error; staff could not reproduce. Nobody in pages 2 and 5 says whether the app UI opened.
- **Older press (2019, CNBC, 9to5Mac).** Silent on whether the app opens.
- **No 2023+ review or post I found** says "Siri opened Spotify's Home" or "Siri played without opening Spotify". Reddit could not be searched with my tools.

### Which app Siri picks

- **MacRumors, 2021-03-04.** iOS 14.5 has no true default. Siri asks "Which app would you like to use?" and learns. "This is not a default setting."
- **Spotify staff, 2025.** Asked a user to check "Settings - Search & Siri - Ask Siri - Default Music App". That is staff wording; I did not verify it on an Apple page.
- **No source** says the chosen app changes whether it opens in the foreground. By Apple's design, that depends on the app's intent answer, not on the selection. Naming "on Spotify" in the phrase avoids the choice entirely.

### Type to Siri

- **MacRumors, 2024-12-23.** With Apple Intelligence on iOS 18.1, turn on Type to Siri, then "a quick double-tap at the bottom edge" opens it.
- **Apple Support 105020 (published 2026-11-12).** "turn on Type to Siri, then double-tap the bottom of the screen and type your request."
- It goes through the same Siri request, so it should behave like voice. No source tests it with Spotify. It is a quiet option when Richard can't speak.
- I found no way for a web page to open it.

### Apple Watch and AirPods

- **Spotify Community, iOS 17.1 to 17.3 and watchOS 10.1 to 10.3 (late 2023 to early 2024).** Siri on the watch opens the Spotify watch app, which "opens the Spotify app... and then does nothing" or asks for a Bluetooth device. Users say the same commands work on the iPhone. So the watch is not a reliable way to wake iPhone Spotify.
- **AirPods Siri.** No source found. It should be iPhone Siri with a different microphone, but that is unverified.

### Control Center and Lock Screen play

- **Apple DTS engineer (Kevin Elliott), Apple Developer Forums thread 765674 (no date shown).** "Now playing apps can also be launched into the background." On his own test: "Hitting play from control center or from and external command source (like headphones) trigger exactly the same process." He hedges: he is "only involved with audio in a relatively indirect way" and is "not exactly sure" how Now Playing apps "restore" themselves or whether it is documented.
- **Apple docs.** `MPRemoteCommand` says the system notifies the command center "When an accessory or iOS user interface generates a remote control event". It does not say what happens if the app is not running. WWDC22 session 110338 also does not cover relaunch.
- **Spotify Community anecdotes (iOS 15 to 17, undated).** Spotify shows in Control Center and the Lock Screen after being closed. One user: "Spotify just opened itself on my phone (in the background)". No one reports the UI popping up.
- **Failure modes found.**
  - Lock Screen controls can vanish when Spotify is paused. A Spotify thread says "Spotify won't stay on the lock screen when music is paused", and a user on iOS 17.0.3 has the same problem. Staff say swiping into Control Center should bring it back. No time limit is given.
  - Control Center's player belongs to whichever app played last (2019 thread, first pass). If another app played since, the button wakes that app instead.
  - An Apple developer (2021, no replies) saw an audio app killed after pausing in Control Center and relaunched minutes later. Not Spotify.
  - I found no report of the play button failing after a long idle on iOS 17 to 26. Not found is not proof.
- **Safari can take over Now Playing (Likely).** Safari supports the Media Session API (dbushell.com, 2023 to 2024, Safari 16.4 and 17). A page that plays audio shows its own Lock Screen controls. If the page ever plays a sound, Control Center may then point at Safari, not Spotify. The page should not play audio while it waits.

### Headphone, AirPods and Bluetooth buttons

- Apple DTS says headphone commands trigger the same relaunch as Control Center (above).
- Anecdotes: an AirPods tap starts Spotify "even when its closed" (undated). Car Bluetooth starts Spotify on connect, which Spotify staff call "an OS thing". No post says the UI opened.
- Apple's AirPods guide says pressing the stem again resumes playback, but does not say which app or what happens if it isn't running.

### Does iOS ever bring Spotify's UI forward for these?

- **Siri: possibly, when the app answers `continueInApp` or fails.** The 2026 "continue in Spotify" bug shows Siri can hand off to the app. In that case users said nothing played.
- **Not signed in, first launch, locked phone.** No 2023+ source found. A 2019 post (first pass) says Siri asked to unlock before playing Spotify.
- **Control Center / headphones.** No report found of the UI coming forward.

## Sources

Apple and Spotify docs, and Apple or Spotify staff:

1. https://developer.apple.com/forums/thread/765674 - Apple Developer Forums, "In what circumstances will the application be launched in the background?" Apple DTS engineer answers. No date shown on the page. Read 2026-11-26.
2. https://developer.apple.com/documentation/mediaplayer/mpremotecommand.md - Apple doc, MPRemoteCommand. Silent on app not running. Read 2026-11-26.
3. https://developer.apple.com/videos/play/wwdc2022-110338 - WWDC22 "Explore media metadata publishing and playback interactions" (2022). Silent on relaunch. Read 2026-11-26.
4. https://support.apple.com/105020 - Apple Support "Use Siri on all your Apple devices", published 2026-11-12. Type to Siri steps. Read 2026-11-26.
5. https://support.apple.com/guide/airpods/dev216d7c746/26/web (en-gb) - Apple AirPods guide, play and resume. Silent on app not running. Read 2026-11-26.
6. https://community.spotify.com/t5/iOS-iPhone-iPad/Please-continue-on-Spotify-error-message/td-p/7538168 - Spotify Community, iOS 26.6 and 26.6.1. Posts shown as 5 hours to 19 days old when read on 2026-11-26 (relative times only). Staff reproduced and fixed the "continue in Spotify" error.
7. https://community.spotify.com/t5/iOS-iPhone-iPad/Siri-play-requests-not-working-with-Spotify/td-p/7086943/page/2 and /page/5 - Spotify Community, iOS 18.6 and 18.6.1 (2025). Staff "Default Music App" wording. Silent on UI. Read 2026-11-26.

Tech press:

8. https://www.macrumors.com/how-to/set-preferred-music-streaming-service-siri/ - MacRumors, 2021-04-26. No true default; Siri learns.
9. https://www.macrumors.com/how-to/change-default-music-app-ios - MacRumors, 2021-03-04. "This is not a default setting."
10. https://www.macrumors.com/how-to/ios-type-to-siri/ - MacRumors, 2024-12-23. Type to Siri, double-tap bottom edge.
11. https://www.cnbc.com/2019/10/07/how-to-play-spotify-with-siri-on-your-iphone.html - CNBC, 2019-10-07 (date from URL). Silent on UI.
12. https://9to5mac.com/2019/10/07/you-can-now-ask-siri-to-play-spotify-music-on-ios-13-spotify-debuts-apple-tv-app/ - 9to5Mac, 2019-10-07. Silent on UI.
13. https://dbushell.com/2023/03/20/ios-pwa-media-session-api/ - Developer blog, 2023 with updates to 2024-04-02. Safari Media Session and Lock Screen controls.

Anecdotes (forums):

14. https://community.spotify.com/t5/iOS-iPhone-iPad/Siri-on-AppleWatch-does-not-work/m-p/5956052/highlight/true - iOS 17.1 to 17.3, watchOS 10 (about late 2023 to early 2024). Watch Siri opens the watch app and does nothing.
15. https://community.spotify.com/t5/iOS-iPhone-iPad/iPhone-showing-music-playback-when-Spotify-app-is-closed-casting/td-p/5277137 - iOS 15 to 17, undated. Spotify in Control Center after close; "opened itself ... (in the background)".
16. https://community.spotify.com/t5/iOS-iPhone-iPad/Spoitfy-disappears-from-lock-screen-when-paused/td-p/5291287 - undated; one user on iOS 17.0.3. Lock Screen controls vanish when paused.
17. https://community.spotify.com/t5/iOS-iPhone-iPad/spotify-plays-songs-even-when-its-closed/m-p/5399666 - undated. AirPods tap starts Spotify when closed; community reply calls it an iOS feature.
18. https://community.spotify.com/t5/iOS-iPhone-iPad/Disable-autoplay-when-connected-to-Bluetooth/m-p/5661407/highlight/true - 2018 to 2024 posts. Staff: Bluetooth autoplay is "an OS thing".
19. https://community.spotify.com/t5/iOS-iPhone-iPad/Siri-doesn-t-work-out-when-asking-quot-Play-quot/m-p/5092951/highlight/true - iOS 14.2, undated. "Play Spotify" errors; staff advise ending with "on Spotify".
20. https://developer.apple.com/forums/thread/679904 - 2021-05-12, no replies. An audio app killed after pause in Control Center and relaunched minutes later. Not Spotify.

Not reachable or not used: discussions.apple.com threads 256034943 and 254677459 redirected to the Apple Support home page, so I did not use them. Reddit searches were refused by the search tool. I used no caches, archives or mirrors.
