# Spec C: No Home flash, start Spotify through Siri

- **Effort:** S (text changes only, one of them gated on an iPhone test)
- **New scope needed:** no
- **Recommendation:** Keep "Wait for me to press play" as the default. No source shows that a Siri or Shortcuts path skips Spotify's UI, and the page can't call Siri anyway. Make one neutral text fix now, and add a Siri line only if Richard's iPhone test shows Spotify stays in the background.

## Research findings

Research date: 2026-11-26. "Verified" means I read it on the source page. "Unverified" means no source I could reach confirms it.

### 1. Does Spotify handle "Hey Siri, play X on Spotify" in the background, without its UI?

- **Apple's rule (verified, Apple docs):** For audio, a media app's intent handler should answer `handleInApp`. Apple says this "tells the system to launch the main app in the background". `continueInApp` launches the app in the foreground and is meant for video. The WWDC19 session says the same and adds that during background playback "there's not going to be any UI on screen".
- **Spotify's own docs (verified, but silent on this point):** Spotify's "Siri and Spotify" support page lists requirements and phrases ("Hey, Siri, play my Discover Weekly playlist on Spotify"; with Apple Intelligence on iOS 27 and iPhone 15 Pro or later, "on Spotify" can be dropped). It does not say whether the app opens, whether it must be running, or what happens on the lock screen.
- **Press (verified that the articles say it, unverified as fact):** Spotify added Siri support in October 2019 (Macworld, 2019-10-07). None of the 2019 articles say whether the UI opens. RouteNote (2026-10-14) says asking Siri for Discover Weekly should "have Spotify open automatically". That is a secondary source and "open" may only mean "start playing". BusinessToday (2026-10-15) and iphone-ticker.de (2026-10-14) cover the iOS 27 change and say nothing about the UI.
- **Forums (anecdotes):** The Spotify Community thread "Siri play requests not working with Spotify" (iOS 18.6, 2025) is about requests failing, not about the UI. One user there says "Siri will open the Spotify app no problem" for an "open Spotify" request, which tells us nothing about play requests. A 2019 post says Siri asked for the phone to be unlocked before playing Spotify.
- **Verdict: unverified.** Apple's guidance points to a background launch for audio apps. No source I could reach says what Spotify actually does today: background launch, foreground launch, or Home flash. Only an iPhone test can settle it.

### 2. Does Shortcuts have a Spotify "Play" action, and does it open Spotify's UI?

- **Apple docs (verified):** A media app can donate `INPlayMediaIntent` interactions to "Improve App Selection, Shortcuts, and Shortcut Suggestions". Donations can also feed "personalized audio suggestions on Lock Screen, in Control Center". Apple's docs don't list Spotify's actions.
- **Third-party guide (verified that it says it):** Chrunos (2024-05-06) says a "Play Spotify Music" action appears in Shortcuts after you have asked Siri to play Spotify a few times. That fits a donated action, not a built-in App Intent. It does not say whether the app opens.
- **Spotify Community (verified that it says it):** The idea "iOS Siri Shortcuts Support" is still "Live Idea" (marked new 2018-09-19; no later status change on the page). Its summary says Shortcuts can only "Open App". A newer idea, "Add iOS automations in Shortcuts app" (Live Idea, undated), says a Shortcut "can open a playlist URL, but it cannot reliably start playback". A user on iOS 26.4 calls it "super frustrating" that a shortcut can't play a given podcast or song.
- **Verdict: partly verified.** Spotify has no full App Intents set. A donated "Play Spotify Music" action may appear. Whether it runs without the Spotify UI is unverified.

### 3. Can a Safari page run a Shortcut, and does it bounce through the Shortcuts app?

- **Apple docs (verified):** The format is `shortcuts://run-shortcut?name=[name]&input=[input]&text=[text]`, and an x-callback form with `x-success`, `x-cancel` and `x-error`. Each callback is "A URL that opens when" the run ends. Apple's page doesn't say whether the Shortcuts app comes to the front.
- **Developers (verified that they say it, dated 2018):** SwiftRocks (2018-10-18): "the deep link has to open the Shortcuts app in order to work"; Shortcuts then opens the `x-success` URL. Automators forum (2018-11-12): running it this way "opens the Shortcuts app and leaves Safari".
- **The page's own README** already says Safari may ask whether to open Shortcuts, and the shortcut mode comes back to `?wake=1`.
- **Verdict: verified for 2018, unverified for iOS 26/27.** The page can run a Shortcut, but the Shortcuts app shows up. That screen change is what we want to avoid, so this path can't give "no flash" on its own.

### 4. Shortcuts "Open App" vs a Spotify play action

- "Open App" brings Spotify to the front by design, so a cold start shows Home (the rules file confirms this on Richard's phone).
- A donated Spotify play action would go through `INPlayMediaIntent`. If Spotify answers `handleInApp`, Apple says the app starts in the background. Whether Spotify does that is the same open question as item 1.
- **Verdict: unverified.** Either way the run starts from the Shortcuts app, so the Shortcuts screen still shows (item 3).

### 5. Does lock screen or Control Center play start Spotify in the background?

- **No Apple or Spotify document I could reach describes this.** The Apple docs only say donated play intents can feed suggestions "on Lock Screen, in Control Center".
- **Forums (anecdotes):** Spotify Community users (iOS 15 to iOS 17, undated posts) report Spotify showing as playing in Control Center and on the lock screen after a force quit, and one says "Spotify just opened itself on my phone (in the background)". A 2019 thread notes Control Center's play square belongs to whichever app played last.
- **The page's README and the rules file** say the default wait mode works this way on Richard's iPhone. That is Richard's own tested behavior, not a public source.
- **Verdict: no public source, but it is the existing, working default.**

### Can a web page call Siri at all?

- I found no web API in Apple's docs that lets a Safari page start a Siri request. The page can only tell Richard what to say. (Not found is not proof; treat as unverified.)

### Sources

1. https://developer.apple.com/documentation/intents/inplaymediaintenthandling/handle(intent:completion:).md - Apple doc: `handleInApp` launches the app in the background for audio; `continueInApp` launches it in the foreground. Read 2026-11-26. **Verified.**
2. https://developer.apple.com/videos/play/wwdc2019/207/ - WWDC19 "Introducing SiriKit Media Intents" (June 2019): background app launch, "not going to be any UI on screen". **Verified.**
3. https://developer.apple.com/documentation/sirikit/improving-siri-media-interactions-and-app-selection.md - Apple doc: donated `INPlayMediaIntent` feeds Shortcuts, Shortcut Suggestions, lock screen and Control Center suggestions. Undated, read 2026-11-26. **Verified.**
4. https://support.spotify.com/us/article/siri/ - Spotify support "Siri and Spotify": phrases and requirements (iOS 27 + Apple Intelligence drops "on Spotify"). Silent on the app opening. Read 2026-11-26. **Verified (silent on the key point).**
5. https://support.apple.com/guide/shortcuts/apd624386f42/ios - Apple: `shortcuts://run-shortcut` URL format. Doesn't say if Shortcuts opens. **Verified.**
6. https://support.apple.com/guide/shortcuts/apdcd7f20a6f/ - Apple: x-callback-url with `x-success`, `x-cancel`, `x-error`. **Verified.**
7. https://swiftrocks.com/running-other-apps-siri-shortcuts-through-deep-links-in-swift - 2018-10-18: the deep link "has to open the Shortcuts app". **Verified that it says so; old.**
8. https://talk.automators.fm/t/tip-using-safari-as-a-shortcuts-launcher/3109 - 2018-11-12: running from Safari "opens the Shortcuts app and leaves Safari". **Verified that it says so; old.**
9. https://www.macworld.com/article/3444500/spotify-now-supports-siri-on-iphone-ipad-and-carplay.html - 2019-10-07: Spotify gains Siri support. Silent on UI. **Verified.**
10. https://routenote.com/blog/spotify-siri-ios-27-automatically-play-music/ - 2026-10-14: iOS 27 App Selection for Spotify; says Spotify should "open automatically". Secondary. **Unverified as fact.**
11. https://www.businesstoday.in/technology/news/story/ios-27-changes-how-iphone-users-play-spotify-music-with-siri-no-need-to-name-the-app-561623-2026-10-15 - 2026-10-15: same news, no primary source named, silent on UI. **Secondary.**
12. https://www.iphone-ticker.de/spotify-siri-merkt-sich-den-musikdienst-mit-einschraenkungen-288147/ - 2026-10-14: limits (iPhone 15 Pro, iOS 27, English, not in EU). Silent on UI. **Secondary.**
13. https://chrunos.com/ask-siri-to-play-spotify-music/ - 2024-05-06: a "Play Spotify Music" action appears in Shortcuts after a few Siri requests. Silent on UI. **Unverified (third-party guide).**
14. https://community.spotify.com/t5/Live-Ideas/iOS-Siri-Shortcuts-Support/idi-p/4569462 - Spotify idea, still "Live Idea" since 2018-09-19; Shortcuts limited to "Open App". **Anecdote / status page.**
15. https://community.spotify.com/t5/Live-Ideas/Add-iOS-automations-in-Shortcuts-app/idi-p/7289169 - Live Idea, undated: a Shortcut "cannot reliably start playback". **Anecdote.**
16. https://community.spotify.com/t5/iOS-iPhone-iPad/Shortcuts-on-iOS-14/m-p/7377234/highlight/true - undated posts; iOS 26.4 user can't make a shortcut play a podcast or song. **Anecdote.**
17. https://community.spotify.com/t5/iOS-iPhone-iPad/Siri-play-requests-not-working-with-Spotify/td-p/7086943/highlight/true - iOS 18.6 (2025): Siri play requests failing; staff could not reproduce. Silent on UI. **Anecdote.**
18. https://community.spotify.com/t5/iOS-iPhone-iPad/I-can-use-Siri-to-play-Songs-from-Spotify-while-to-phone-is/m-p/4877639/highlight/true - 2019-12-28: Siri asked to unlock before playing Spotify. **Anecdote, old.**
19. https://community.spotify.com/t5/iOS-iPhone-iPad/iPhone-showing-music-playback-when-Spotify-app-is-closed-casting/m-p/5280611/highlight/true - iOS 15 to 17, undated: Spotify shows in Control Center after force quit and "opened itself ... (in the background)". **Anecdote.**
20. https://developer.apple.com/forums/thread/108065 - undated: a developer's `handleInApp` app did start in the background once the right delegate method was used. Not about Spotify. **Anecdote.**

Not reachable: https://discussions.apple.com/thread/253172521 ("Spotify auto-start in the background, iOS 15") redirected to the Apple Support home page, so I did not use it. Reddit was not tried. I used no caches or mirrors.

## Problem

When Spotify isn't running on the iPhone, the page has no device to play on. Two of the three wake modes ("Open the Spotify app" and "Run my Wake Spotify shortcut") bring Spotify to the front, and a cold start always shows Spotify's Home first. Home is suggested content, which Richard doesn't want to see. The default wait mode avoids Spotify's UI, but needs a trip to Control Center or the lock screen. The idea was to use Siri, which by Apple's design can start an audio app in the background, as a second no-UI way to wake Spotify.

## Options considered

1. **Keep the wait mode as is (no change).** Works today on Richard's phone. No Home flash. Costs a swipe to Control Center.
2. **Add Siri as a second way to wake Spotify in wait mode (text only).** Richard says "Hey Siri, resume Spotify" while the page waits. If Spotify starts in the background, the wait loop sees the device and plays the tap, same as Control Center. No code path changes. Unverified whether Spotify's UI shows. A plain "play Spotify" request may also start Spotify-chosen content for a moment, which goes against Richard's rule, so the phrase should ask to resume.
3. **New "Siri" wake mode that triggers Siri from the tap.** Not possible: no web API to start Siri (item "Can a web page call Siri at all?").
4. **New shortcut mode using a Spotify play action plus `x-success` back to the page.** The Shortcuts app still comes to the front (item 3), so there is still a screen change. The Spotify play action may not exist on his phone and may still open Spotify (items 2 and 4). It also adds a second shortcut to maintain. The existing shortcut mode already runs whatever "Wake Spotify" contains, so Richard can try a play action inside it with no code change.
5. **Tell Richard to say the full request ("Hey Siri, play [item] on Spotify") instead of tapping.** Skips the page, so the page's shortcuts lose their point. Siri may pick the wrong item.

**Pick: 1 plus a gated 2, plus one neutral text fix for 4.**
- Keep the wait mode as the default. It is the only path known to work without Spotify's UI.
- Add a Siri line to the wait-mode note and README only if iPhone check C1 passes. Until then, don't promise it.
- Change the shortcut mode's note so it doesn't say the shortcut "opens Spotify". That lets Richard put a Spotify play action in his shortcut if one turns out to work, without the page text being wrong.

## What to build

### Step 1 (now): shortcut note text

In the settings sheet (`#wakeModes`, the `value="shortcut"` row), change the setnote:

- Old: `A tap runs your “Wake Spotify” shortcut, which opens Spotify and comes back to the page.`
- New: `A tap runs your “Wake Spotify” shortcut, which starts Spotify and comes back to the page.`

In README.md, "When Spotify isn't running", shortcut bullet:

- Old: `which opens Spotify, waits, and comes back to the page at`
- New: `which starts Spotify, waits, and comes back to the page at`

No logic change. `SHORTCUT_URL` stays `shortcuts://run-shortcut?name=Wake%20Spotify`.

### Step 2 (only if iPhone check C1 passes): Siri line in wait mode

In the settings sheet, `value="wait"` row, change the setnote:

- Old: `Press play in Control Center or on the lock screen. Spotify starts in the background and the page plays what you tapped.`
- New: `Press play in Control Center or on the lock screen, or say “Hey Siri, resume Spotify”. Spotify starts in the background and the page plays what you tapped.`

In README.md, wait-mode bullet, after the sentence that ends `starts as soon as Spotify wakes.**`, add:

- `You can also say **“Hey Siri, resume Spotify”** while the page is on screen; Spotify starts in the background the same way.`

Do **not** change the status line text in `waitLoop` (`showWake('Press play in Control Center or on the lock screen. …')`) or `idleText()`. Those lines are already long on an iPhone screen. If C1 shows a different phrase works better (for example "play Spotify"), use that phrase in both places instead, unless C2 shows it starts content Spotify picks.

### Step 3: bump the version

Bump `VERSION` (for example to the next minor) and add a one-line README changelog entry if the README keeps one.

### Not built

- No new wake mode, no new storage key, no new timers, no `x-callback-url`.
- No change to `onItemClick`, `wakeSpotify`, `waitForPlay`, `waitLoop` or `resumePending`.

## Request cost

- **New calls: none.** Steps 1 to 3 are text only.
- A Siri wake (if it works) uses the existing wait loop: one request every 3 s for up to 60 s while the page is on screen, at most 20 per window, alternating `GET /me/player/devices` and `GET /me/player`. Both are in the **player** group. The loop stops at the first hit, so a fast Siri wake usually costs 1 to 3 calls.
- No **library**, **search** or **catalog** calls. The per-group cool-off is unchanged.

## Tests in a browser

Use the existing fetch-mock harness (and `window.libNavigate` to catch navigation).

1. Open Diagnostics. The shortcut row note reads exactly the Step 1 text.
2. If Step 2 ships: the wait row note reads exactly the Step 2 text, with curly quotes.
3. Wait mode, mock `/me/player/devices` to return 0 devices, tap an item. The status line text is unchanged: `Press play in Control Center or on the lock screen. “<name>” starts as soon as Spotify wakes.`
4. Same setup, then switch the mock to return a device on the 2nd check. The page plays the tapped item once. Count calls: exactly 2 player-group calls before the play `PUT`.
5. Shortcut mode, tap with no device. `libNavigate` receives `shortcuts://run-shortcut?name=Wake%20Spotify` (unchanged).
6. Search the file for the old strings. `which opens Spotify and comes back` no longer appears in index.html or README.md.
7. Check the new text against the word list in the rules file and for em-dashes.

## Checks only on the iPhone

Richard does these. Write down the iOS version and Spotify version for each.

- **C1 (decides Step 2): Siri resume while the page waits.**
  1. Swipe Spotify away in the app switcher. Wait until the page shows Spotify as asleep (or the device list is empty).
  2. In Safari, with wait mode on, tap a playlist or episode. The line says to press play.
  3. Say "Hey Siri, resume Spotify" (the phone is unlocked, Safari in front).
  4. Note: did Spotify's screen (Home or anything) appear? Did Safari stay in front? Did the page play the tapped item, and how fast?
  - Pass: no Spotify screen at all, Safari stays in front, the tapped item plays within the minute. Try it 3 times on different days, since a cold start can differ from a warm one.
- **C2: what Siri starts.** During C1, listen to the first second. Was it the last thing played, or something Spotify picked (a mix, DJ)? If Spotify picks content, do not ship Step 2 with that phrase.
- **C3: the page while Siri is up.** In Diagnostics, check that Pending still shows the tap after Siri closes. If the Siri overlay makes the page count as hidden, the wait loop pauses and restarts on return; note whether the item still played.
- **C4: Spotify action in Shortcuts.** Open Shortcuts, add action, search "Spotify". Write down every action name shown. If a play action exists (for example "Play Spotify Music"), duplicate "Wake Spotify", replace "Open App" with it, keep the step that opens the page URL, and run it from the page. Note whether the Spotify screen appears and whether the Shortcuts screen appears.
- **C5: baseline.** Confirm the existing Control Center and lock screen play still wakes Spotify without its screen on the current iOS.

## Acceptance criteria

- The shortcut setnote and README use "starts Spotify", not "opens Spotify".
- If C1 passed: the wait setnote and README name "Hey Siri, resume Spotify" (or the phrase C1 proved). If C1 failed or was not run: no Siri text anywhere in the page.
- The wait status line and the idle line are byte-for-byte unchanged.
- No new requests, storage keys, scopes or wake modes. The wait loop still makes at most 20 player-group calls per minute window.
- Default wake mode is still "wait".
- All browser tests above pass.

## Risks and open questions

- **Spotify's UI on a Siri request is unverified.** Apple's docs say audio apps should launch in the background, but no Spotify source confirms it. That is why Step 2 waits for C1.
- **Siri may start content Spotify chooses** for a moment before the page switches to the tapped item. That conflicts with Richard's rule if it is a recommendation. "Resume" should play the last item, but that is unverified (C2).
- **Siri may refuse while locked** (a 2019 report). Not a problem here, since the page must be on screen and the phone unlocked.
- **The Siri overlay may hide the page**, pausing the wait loop until Siri closes. It should then start a fresh minute, so the tap is still played (C3).
- **iOS 27 App Selection** (US, iPhone 15 Pro or later, English) may make "resume" pick Spotify without naming it, but behavior differs by phone and region. Naming Spotify in the phrase avoids that.
- **Shortcuts always shows its own screen** when run from Safari (2018 sources; not rechecked for iOS 26/27). A Spotify play action inside "Wake Spotify" can at best remove Spotify's Home flash, not the Shortcuts screen.
- **Open question:** does Spotify's donated "Play Spotify Music" action still exist in iOS 26/27 Shortcuts? Only C4 can tell.

## Second pass: wider Home flash research (Nov 26)

Four more researchers looked beyond Siri: Shortcuts and widgets, Siri and system play buttons, links and Spotify Connect, and one broad sweep. Full write-ups with dated sources are in `specs/research/` (home-flash-*.md). The recommendation does not change: keep "Wait for me to press play" as the default. Three small additions follow.

| Path | Verdict | Skips Home? | Page can start it? |
|---|---|---|---|
| Control Center or Lock Screen play | Likely (Apple engineer says Now Playing apps relaunch in the background; Richard's own wait mode works) | Yes | No, he presses it |
| Siri "play X on Spotify" | Likely in background (Apple design, Apple engineer, a Spotify Community thread on iOS 26.6 where "continue in Spotify" was treated as a bug and fixed); no source says outright | Likely | No |
| Type to Siri (iOS 18.1+ with Apple Intelligence) | Unverified with Spotify | Unknown | No |
| Spotify Shortcuts or App Intents play actions | Do not exist (Community idea still open, posts through Sept 2025) | n/a | n/a |
| Siri-suggested "Play Spotify Music" Shortcut action | Unverified (one 2019 post says it ran without opening Spotify) | Maybe | Only via Shortcuts, which shows its own screen |
| Shortcuts "Play/Pause" set to Play | Unverified with a cold Spotify | Maybe | Only via Shortcuts |
| Spotify widgets (Home, Lock Screen) | Open the app; no play control | No | No |
| `open.spotify.com` link or `spotify:` URI | Brings Spotify to the front (Spotify docs); `spotify:` adds an iOS prompt; only single tracks autoplay | No | Yes (today's link mode) |
| Web API transfer or play to an unlisted iPhone | Doesn't work (404 or 500; a closed app isn't in Connect) | n/a | n/a |
| AirPlay to the iPhone | Doesn't apply (iPhone is a sender only) | n/a | n/a |
| Web Playback SDK (the page becomes the player) | Supported on iOS Safari per Spotify, but needs a tap to start, the `streaming` scope (new sign-in) and Premium; background and lock-screen playback unverified | Skips the Spotify app entirely | Yes |

### Addition 1: iPhone check C6, a shortcut that plays instead of opening

In a copy of "Wake Spotify", replace "Open App" with the Shortcuts "Play/Pause" action set to Play (or a Siri-suggested Spotify play action with "Show When Run" off). Run it from the page. Pass: Spotify starts playing and its screen never appears (the Shortcuts screen still shows briefly). Also run it once from a Home Screen icon, which per iDownloadBlog (updated 2024-11-19) runs without opening Shortcuts, to see whether Spotify can start with no screen at all.

If C6 passes, change the shortcut mode note to: "A tap runs your “Wake Spotify” shortcut. The Shortcuts screen shows briefly, then the page plays what you tapped." This replaces Step 1's "starts Spotify" wording.

### Addition 2: honest note for the open-app mode (optional)

Change the link mode note to: "Opens Spotify. If it wasn't running, its Home screen shows for a moment." Today's link is already a plain `https://open.spotify.com/<kind>/<id>` link, which avoids the iOS prompt a `spotify:` URI shows. No autoplay suffix is worth adding: the ones in forum posts conflict, and Spotify still comes to the front.

### Addition 3: a risk to keep the wait mode working (inferred, needs a check)

Control Center's play button belongs to whichever app played audio last. Safari can become that app through the Media Session API (dbushell.com, 2023). The page itself plays no audio today (no `mediaSession` or `<audio>` in index.html). But a song tapped inside the v2.16 Show songs embed plays a preview in Safari. That may make Safari the Now Playing app, so the next Control Center play would wake Safari instead of Spotify. This link is my inference, not a tested fact. Check C7: tap a preview in Show songs, let Spotify fall asleep, then press play in Control Center. If it plays the preview instead of waking Spotify, add a line under the Show songs button: "Previews play in Safari. To wake Spotify afterwards, open it once."

### Not recommended now: Web Playback SDK

It is the only design that avoids the Spotify app entirely, but it moves playback into Safari, needs a new scope and Premium, and may stop when Safari is in the background. Worth its own spec only if C6 and Siri both fail and the Home flash still bothers Richard.

### Key sources for the second pass (all read 2026-11-26)

- https://developer.apple.com/forums/thread/765674 (Apple DTS: Now Playing apps relaunch in the background from Control Center or headphones; undated)
- https://community.spotify.com/t5/iOS-iPhone-iPad/Please-continue-on-Spotify-error-message/td-p/7538168 (iOS 26.6, Siri "continue in Spotify" treated as a bug and fixed)
- https://community.spotify.com/t5/Live-Ideas/iOS-Siri-Shortcuts-Support/idi-p/4569462/page/17 (Shortcuts support still missing; posts through 2025-09-25)
- https://developer.spotify.com/documentation/ios/tutorials/content-linking (links bring Spotify to the foreground)
- https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Links-don-t-automatically-start-playing-the-song/m-p/5395149 (staff: only tracks autoplay from a link)
- https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Connect-only-sees-devices-that-have-the-app-open/td-p/5360650 (moderator, 2022-04-01: closed app not in Connect)
- https://community.spotify.com/t5/Spotify-for-Developers/Endpoint-quot-Transfer-Playback-quot-returns-500-error-when-all/td-p/6594944 (2024-12-19)
- https://developer.apple.com/forums/thread/732934 (2023: a shortcuts:// link opens the Shortcuts app, also on iOS 17)
- https://www.idownloadblog.com/2022/02/03/how-to-run-a-shortcut-quickly-iphone-ipad-mac/ (updated 2024-11-19: Home Screen icon runs a shortcut without opening Shortcuts)
- https://support.spotify.com/article/spotify-iphone-widget/ (Lock Screen widget opens the app)
- https://dbushell.com/2023/03/20/ios-pwa-media-session-api/ (Safari Media Session and Lock Screen controls)
- https://developer.spotify.com/documentation/web-playback-sdk (Web Playback SDK, iOS Safari support and limits)

## Third pass: ways around it (Nov 27)

See `research/home-flash-pass3.md`. Verdict unchanged: no page-started path skips Spotify's Home on a cold start, and nothing Spotify shipped through November 2026 changes that. New: a Back Tap or Action button shortcut with one Play/Pause action is the cheapest way to make the play press that wakes Spotify in the background (iPhone check H1). v2.29 adds a Diagnostics guide for it, rewrites the Wake Spotify shortcut recipe around Play/Pause (check H4, replacing C6), and says plainly which wake options show Home. Since iOS 26.5 an x-callback shortcut link reports an error instead of success, so the page keeps the plain `run-shortcut` link.
