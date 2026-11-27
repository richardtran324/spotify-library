# C2a: Shortcuts, App Intents and widgets as a no-Home-flash wake

Research date: 2026-11-26. Builds on C-siri-no-home-flash.md and does not repeat it. "Read" means I opened the page myself. Forum posts are anecdotes. Reddit could not be searched (the search tool refused reddit.com), so no Reddit sources are used.

## Verdict

No source from 2023 to 2026 shows that Spotify's iOS app offers its own Shortcuts or App Intents actions. Spotify's own Community idea for Shortcuts support is still marked "Not Right Now", and users there still say in September 2025 that there is "zero implementation". The only Spotify actions in Shortcuts are the ones iOS suggests after you use Siri with Spotify (a "Play Spotify Music" style action, per a 2024 guide). A 2019 forum post says such an action, with "Show When Run" off, played without opening the Spotify app. Nothing newer confirms that. Spotify's widgets don't help: the Lock Screen widget opens the app (Spotify and MacRumors, 2023), and a Spotify Community helper says the Home Screen widget can't control playback. I found no Spotify Control Center control. Apple's generic "Play/Pause" action is described as acting on "the currently playing media", but no source says whether it wakes Spotify in the background. The big blocker is the page side: every 2023 source still says a `shortcuts://` link opens the Shortcuts app. So any page-triggered Shortcut shows the Shortcuts screen. At best a Shortcut can remove Spotify's Home flash, not every screen change. The best thing to test is replacing "Open App" in the existing "Wake Spotify" shortcut with "Play/Pause" (or a Siri-suggested Spotify play action) and seeing whether Spotify's screen still appears.

## Table

| Path | Verdict | Avoids Spotify Home flash? | Can the page trigger it? | Key sources |
|---|---|---|---|---|
| Spotify's own App Intents / Shortcuts actions (play playlist, Liked Songs, resume) | Doesn't work: none exist per all sources found | n/a | n/a | Spotify idea page 17 (comments 2024-07-30 to 2025-09-25); "Add iOS automations" idea |
| Siri-suggested Spotify action in Shortcuts (appears after Siri use; Chrunos names it "Play Spotify Music") | Unverified for iOS 17 to 27. Existed in 2019 and 2024 guides | Maybe. A 2019 user says with "Show When Run" off it played without opening Spotify. Same user says it sometimes played the wrong thing | Only through `shortcuts://`, so the Shortcuts screen shows | Spotify Community "Spotify doesnt show up in ios Shortcuts" (2019-12-19); Chrunos 2024-05-06 |
| Apple "Play/Pause" action (Mode: Play) | Unverified for Spotify. Described as acting on "the currently playing media" | Unknown. If it routes like the Control Center play button, Spotify would start in the background and resume its last item | Only through `shortcuts://`, so the Shortcuts screen shows | shortcutactions.com (undated); Cassinelli action pages |
| Apple "Play Music" action | Doesn't work for Spotify. Apple Music items only (input is iTunes media) | n/a | n/a | Cassinelli "Play Music" (page edited 2023-09-18); Hicks 2021 (uses "Open URLs" for Spotify, "Play Music" for Apple Music) |
| Shortcut "Open URLs" with a Spotify link | Doesn't help. Opens Spotify, often without starting playback | No. Spotify comes forward | Yes, but the page can open the link directly anyway | MashTips 2021/2022; Spotify Community 2021-01-12; "Add iOS automations" idea |
| Spotify Lock Screen widget | Confirmed: it opens the app | No | No | Spotify support page; MacRumors 2023-04-13; Spotify Community post |
| Spotify Home Screen widget (iOS 17 interactive widgets era) | Confirmed no playback buttons, per a Spotify Community helper (undated, thread mentions iOS 17 to 18) | No | No | Spotify Community "Widget is absolutely worthless" thread; "iOS app widget lost functionality" (Jul to Sep 2025) |
| Spotify iOS 18 Control Center control | Unverified. No source shows one. TechCrunch's list of 18 apps (2024-09-30) does not include Spotify. Absence is not proof | n/a | No | TechCrunch 2024-09-30 |
| System Now Playing play button (Control Center / Lock Screen) | Already the page's working default (from C-siri) | Yes, per Richard's own testing | No | C-siri-no-home-flash.md |
| Apple Music "Ambient Music" controls (iOS 18.4) | Doesn't apply. Apple Music only | n/a | No | Gotechtor 2025-04-01 |
| Personal automations (NFC, time, app opened) | Unverified for Spotify background playback. Spotify still needs "Open URLs", which brings it forward | No, with "Open URLs" | No | Hicks 2021; Spotify Community autoplay thread (undated) |
| Action button / Home Screen shortcut icon | Likely runs a shortcut without opening the Shortcuts app (Home Screen icon: iDownloadBlog, updated 2024-11-19). Action button not checked | Only if the shortcut's Spotify step does | No. Richard presses it, not the page | iDownloadBlog 2022-02-03, updated 2024-11-19 |
| Safari opening `shortcuts://run-shortcut` (with or without x-callback) | Confirmed for iOS 17 era: the Shortcuts app opens | No by itself. Adds a Shortcuts screen | Yes | Apple dev forum thread 732934 (Jun to Oct 2023); Apple URL-scheme page (iOS 27 guide, silent on this) |
| Current "Wake Spotify" round trip (Safari, Shortcuts, Open App, back to page) | Likely shows both screens: Shortcuts opens (above), and "Open App" brings Spotify forward, so a cold start shows Home | No | Yes (existing mode) | Same as above plus C-siri item 4 |

## Notes

1. **Spotify Shortcuts support is still missing.** Spotify's Community idea "iOS Siri Shortcuts Support" shows status "Not Right Now". The last staff update shown is 2018-12-06. Comments from 2024-07-30 through 2025-09-25 still ask for it. One says "zero implementation of Spotify usability via Shortcuts yet" (2025-09-25). A separate Live Idea asks for "Play Playlist, Play URI, Pause/Resume" actions and says "a Shortcut can open a playlist URL, but it cannot reliably start playback". I found no Spotify newsroom, MacStories, 9to5Mac or MacRumors article from 2023 to 2026 announcing Spotify Shortcuts actions. Not found is not proof.
2. **Siri-suggested actions are the only Spotify actions.** A 2024 guide says a "Play Spotify Music" action shows up after you ask Siri to play Spotify a few times, or after turning on "Learn from this app" under Settings > Siri & Search > Spotify. A 2019 Spotify Community post (MattSuda, 2019-12-19) says these actions only appear after Siri use, sometimes play "the wrong thing", and that with "Show When Run" off the action "doesn't even need to open up a prompt that it started playing or open the Spotify app". That is the only source I found that says a Spotify play action ran without Spotify's screen. It is old and pre-dates iOS 17. Each suggested action is tied to one item, so it can't be the page's generic "play what I tapped" step. It could still work as a wake step if it starts Spotify in the background.
3. **Apple's "Play/Pause" action.** A Shortcuts reference site describes it as "Plays or pauses the currently playing media." That matches the Control Center play button. No source I read says what it does when Spotify is not running, or whether it reaches Spotify at all. If it works like Control Center, it would resume Spotify's last item in the background. The page would then switch to the tapped item, the same as the wait mode.
4. **App Intents can play audio without the app.** Apple's `AudioPlaybackIntent` (iOS 17+) is "An App Intent that plays, pauses, or otherwise modifies audio playback state". A 2023 developer thread says it is how a third-party widget starts audio. So the platform allows it. Spotify just hasn't shipped such intents, per notes 1 and 6.
5. **Widgets.** Spotify's support page says the Lock Screen widget lets you "Launch Spotify from your iPhone lock screen". MacRumors (2023-04-13) says it gives access "with a single tap" to the app. One commenter on the Spotify Community post says tapping it started a random song. That is a single report, and a random song breaks Richard's rule anyway. On the Home Screen widget, a Spotify Community helper wrote "Unfortunately, it's not possible to control music playback through the widgets currently." In 2025 the widget changed from top albums to showing the current or recent song (Jul to Sep 2025 thread). Neither thread mentions a play button.
6. **Control Center.** iOS 18 lets apps add their own Control Center controls. I found no source that Spotify ships one. The system Now Playing tile is not a Spotify control. It is the path the page already uses.
7. **Safari to Shortcuts still shows the Shortcuts app.** A June 2023 Apple developer forum post says the deep link URL "opens the shortcut app to run the shortcu[t]". An October 2023 reply says the same "after the release of iOS 17". No Apple engineer replied. Apple's current URL-scheme page (iOS 27 guide) gives the format but says nothing about whether the app opens. I found nothing from iOS 18, 26 or 27 that says this changed. So the 2018 finding still stands for iOS 17. It is unverified for later versions.
8. **The round trip.** "Wake Spotify" today runs as Safari, then Shortcuts (foreground, note 7), then "Open App" Spotify (foreground, cold start shows Home), then back to the page. So it likely shows both the Shortcuts and Spotify screens. Swapping "Open App" for a step that starts Spotify in the background (Play/Pause, or a Siri-suggested Spotify action) could remove the Spotify screen. The Shortcuts screen would stay.
9. **Home Screen icon and Action button.** iDownloadBlog says "Tapping the Home Screen icon will run your shortcut instantly without opening the Shortcuts app." That is a user-started path, not a page path.

## Suggested iPhone tests (for Richard)

- **T1:** Duplicate "Wake Spotify". Replace "Open App" with "Play/Pause" set to Play. Swipe Spotify away. Run it from the page. Note: did Spotify's screen appear? Did the Shortcuts screen appear? Did Spotify start, and with what?
- **T2:** Same, but with a Siri-suggested Spotify action (search "Spotify" in the action list and write down the exact names). Try with "Show When Run" off.
- **T3:** Run T1's shortcut from a Home Screen icon instead of the page, to see whether Spotify starts without any screen. If yes, the only flash left in the page path is the Shortcuts app.

## Sources

All read on 2026-11-26. No caches, archives or mirrors.

1. https://community.spotify.com/t5/Live-Ideas/iOS-Siri-Shortcuts-Support/idi-p/4569462/page/17 - Status "Not Right Now", staff update 2018-12-06, comments 2024-07-30 to 2025-09-25 saying no support. Anecdote and status page.
2. https://community.spotify.com/t5/Live-Ideas/Add-iOS-automations-in-Shortcuts-app/idi-p/7289169 - Live Idea, undated. Shortcut "cannot reliably start playback". Anecdote.
3. https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-doesnt-show-up-in-ios-Shortcuts/td-p/4853687 - 2019-11-09 to 2021-01-12. Siri-suggested actions; "Show When Run" off played without opening Spotify (2019-12-19). Anecdote, old.
4. https://chrunos.com/ask-siri-to-play-spotify-music/ - 2024-05-06. "Play Spotify Music" action appears after Siri use. Silent on the app opening.
5. https://chrunos.com/spotify-shortcuts-ios/ - 2025-02-19. Names no Spotify-provided actions.
6. https://www.shortcutactions.com/actions/playpause - Undated. "Plays or pauses the currently playing media." Silent on third-party apps.
7. https://matthewcassinelli.com/actions/play-music/ - Action added 2015, page edited 2023-09-18. "Plays the currently playing item"; input is iTunes media.
8. https://hicks.design/journal/moo-card-player - 2021-09-27. NFC automation: "Open URLs" for Spotify, "Play Music" for Apple Music.
9. https://mashtips.com/automatically-play-spotify-playlist-while-driving/ - 2021-12-22, updated 2022-03-27. "Spotify, however, does not have any in-app actions added to the Siri Shortcuts." Open URL needs a tap on Play.
10. https://community.spotify.com/t5/iOS-iPhone-iPad/iOS-Autoplay-a-Spotify-song-using-a-Shortcut-automation-and-an/m-p/5964616/highlight/true - Undated. Workaround; "the song won't play automatically" most of the time. Anecdote.
11. https://support.spotify.com/article/spotify-iphone-widget/ - Spotify support. Lock Screen widget: "Launch Spotify from your iPhone lock screen." iOS 16+, app 8.8.26+.
12. https://www.macrumors.com/2023/04/13/spotify-lock-screen-widget - 2023-04-13. Widget opens the app "with a single tap".
13. https://community.spotify.com/t5/Community-Blog/iPhone-Lock-Screen-Widget-Open-Spotify-Faster/ba-p/5537401 - Undated Community post. "tapping on it will quickly open the Spotify app". One commenter says it started a random song.
14. https://community.spotify.com/t5/iOS-iPhone-iPad/iPadOs-iOS-Spotify-Widget-is-absolutely-worthless-No-Play-Pause/td-p/6147800 - Undated, mentions iOS 17 to 18. Helper: "it's not possible to control music playback through the widgets currently."
15. https://community.spotify.com/t5/iOS-iPhone-iPad/iOS-app-widget-lost-functionality/td-p/7049066 - 2025-07-12 to 2025-09-01. Widget now shows the current or recent song. No play button mentioned.
16. https://techcrunch.com/2024/09/30/18-apps-that-add-useful-actions-to-the-ios-18-control-center - 2024-09-30. List of 18 apps with Control Center controls. Spotify not in it.
17. https://www.gotechtor.com/ios-18-4-new-music-feature/ - 2025-04-01. Ambient Music controls, Apple Music only.
18. https://developer.apple.com/documentation/appintents/audioplaybackintent.md - Apple doc, iOS 17+. "An App Intent that plays, pauses, or otherwise modifies audio playback state".
19. https://developer.apple.com/forums/thread/736445 - 2023-08-28 to 2023-10-24. Widget audio playback works through AudioPlaybackIntent. No Apple engineer reply.
20. https://developer.apple.com/forums/thread/732934 - Jun to Oct 2023. Deep link URL "opens the shortcut app"; same "after the release of iOS 17". No Apple reply.
21. https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios - Apple, iOS 27 guide. URL format only, silent on whether Shortcuts opens.
22. https://www.idownloadblog.com/2022/02/03/how-to-run-a-shortcut-quickly-iphone-ipad-mac/ - 2022-02-03, updated 2024-11-19. Home Screen icon runs a shortcut "without opening the Shortcuts app".
23. https://talk.automators.fm/t/shortcuts-url-scheme/1940 - 2018-09. URL scheme exists. Silent on whether the app opens. Old.

Not used: https://discussions.apple.com/thread/255842862 redirected to the Apple Support home page. Several Spotify Community idea pages (idi-p/5634490 and its comment links) returned only page metadata, so I could not read their status or comments. Medium (mokhox) failed to load.
