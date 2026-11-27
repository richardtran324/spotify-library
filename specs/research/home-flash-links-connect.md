# C2c: Links, URIs and Spotify Connect, looking for a way past the Home flash

Research date: 2026-11-26. "Read" means I opened the page myself. Many Spotify Community pages show no post dates when fetched. Where I give a date range, I say what it is based on (a staff post date, or the iOS, macOS or app version named in the post).

## Verdict

No link, URI or Connect path I could find starts a cold Spotify on the iPhone without its UI. Spotify's own docs say a link "brings Spotify to the foreground with the selected content". They also say the native App Remote SDK "must perform an app switch" to wake Spotify. A Spotify moderator says a fully closed app "will not show up" in Connect, and Web API users report no call that wakes such a device. Autoplay suffixes (`?go=1`, `?play=1`, `:play`) exist only as forum anecdotes, mostly for the desktop app. Even if one works, the app still comes to the front, so it can only make link mode faster, not remove the Home flash. No source says whether a cold-start link shows Home before the item. The README and the task brief say it does on Richard's phone. The one path that avoids the Spotify app entirely is the Web Playback SDK, which makes the page itself a Connect device. Spotify lists iOS Safari as supported but with limits, and forum reports show Safari autoplay problems. It needs the `streaming` scope and plays audio in Safari, not in the Spotify app. The default "Wait for me to press play" mode is still the only known no-flash way to wake the Spotify app.

## Table

| # | Path | Verdict | Avoids Home flash? | Page can trigger it? | Key sources |
|---|------|---------|--------------------|----------------------|-------------|
| 1 | `open.spotify.com/<kind>/<id>` universal link (what link mode opens today) | Confirmed it opens the app in front | No. Foreground by design. Whether Home shows before the item on a cold start is not in any source; Richard sees it | Yes (today's link mode) | S1, S9 |
| 2 | `spotify:` URI scheme | Confirmed it opens the app in front, plus an iOS prompt first | No. Adds a confirmation prompt too | Yes, but worse than #1 | S1 |
| 3 | Autoplay suffixes on links (`?go=1`, `?play=1`, `:play`, `/play`, `?play=True`) | Unverified. Forum anecdotes only, mostly macOS desktop app; one 2020 report says `?play=True` did not work. A user answer says only tracks autoplay from a link, and only if nothing else is playing | No. App still comes to the front | Yes | S5, S6, S7, S8 |
| 4 | `?context=spotify:playlist:<id>` on a track link | Unverified for iOS. A third-party guide says the track opens inside the playlist; silent on autoplay and iOS | No | Yes | S10 |
| 5 | Shared link landing on Home instead of the item | Confirmed as a reported failure (iOS 17.0.x, Spotify 8.8.75/76, autumn 2023). Staff pointed at ad blockers blocking `api2.branch.io` | Makes it worse | n/a (warning) | S9 |
| 6 | iOS App Remote SDK `authorizeAndPlayURI` | Confirmed it opens Spotify ("Open Spotify app ... and start playback"). Docs say waking Spotify "must perform an app switch" and Spotify then switches back via the redirect URI | No. Spotify comes to the front, then returns | No. Native iOS SDK only; no web version | S2, S3, S4, S11 |
| 7 | Undocumented `spotify-action://` auth URL from a web page | Unverified. No source found that documents it | No (it would still be the app switch in #6) | Unknown; not recommended | none |
| 8 | Web API `PUT /me/player` or `PUT /me/player/play` with an old iPhone `device_id` | Doesn't work (reported). Docs say nothing about unlisted devices. Users report 404 "Not found" or 500, and a device must be "manually made active" first | n/a | Yes, but it fails | S12, S13, S14, S15, S16, S17 |
| 9 | Connect from desktop app or web player waking the closed iPhone app | Doesn't work as a reliable path. Moderator (2022-04-01): a fully closed app "will not show up" in Connect. Some users report the iPhone app relaunching itself in the background while a Mac plays, but as an unwanted bug, not a control | Would, if it happened, but no one can trigger it | No | S18, S19, S20, S21 |
| 10 | AirPlay to the iPhone | Doesn't apply. Apple documents Macs (Monterey+) as receivers and iPhone only as a sender. AirPlay would not start the Spotify app anyway | n/a | No | S22 |
| 11 | Web Playback SDK in the page (the page becomes the device) | Likely possible, fragile. Spotify lists iOS Safari as supported with a limit: playback "does not start automatically after transfering playback". Forum reports (iOS 15, iOS 16.4.1) show silent playback until the player is built inside a tap handler. Background and lock screen behavior unverified | Yes. The Spotify app never opens | Yes, with new `streaming` scope and Premium | S23, S24, S25, S26, S27 |
| 12 | Spotify web player (open.spotify.com) in another Safari tab as the device | Unverified. Spotify lists Safari 15+ on iOS as a supported web player browser. Tapping an open.spotify.com link from the page opens the app instead (universal link), and switching tabs is still a screen change | Avoids the Spotify app, not a screen change | Not cleanly | S28, S1 |

## Notes

### What the page does today
`wakeSpotify(item, opts, 'link')` calls `navigate(item.url)`. `item.url` is a plain `https://open.spotify.com/<playlist|album|track|episode|artist|show>/<id>` or `/collection/tracks` link with no query string (index.html around lines 1213 to 1255 and 2401 to 2410). So link mode is path #1.

### Links (#1 to #5)
- Spotify's iOS Content Linking page (S1) prefers web links over `spotify:` deeplinks, because "a deeplink will trigger an iOS confirmation prompt before switching to Spotify". Opening content "brings Spotify to the foreground with the selected content". It lists no autoplay parameter. Its only parameters are attribution ones (`~campaign`, `~$canonical_url`, `utm_campaign`).
- No Spotify doc or forum post I read says whether a cold-start link draws Home before it moves to the item. The 2023 "Shared links doesn't work" thread (S9) shows the app can stop at Home ("the app opens to the Home Screen and that's it") when link resolution fails, and staff tied it to `api2.branch.io` being blocked. That suggests the app resolves the link after launch, which fits a Home flash on cold start. This is my inference, not a source.
- Autoplay suffixes: in the "Autoplay when clicking on a shared link" thread (S6, macOS 14, so 2023 or later), one user says "It's ?go=1", then "?play=1 would normally also work", and that it "will only work when a link opens a Spotify app directly". Another says "It's ":play" or "/play"". The asker reports none worked for them. None mention iOS. An accepted user answer in S5 says "Currently, only tracks have the ability to autoplay when the URL is opened in the app" and only "if nothing else is playing". The poster in S8 (iOS, undated) says a track URI "always autoplays". These conflict, and none is from Spotify staff.
- Even a working autoplay suffix would not help the goal. The page plays the item through the Web API once the device appears, and the app still comes to the front. An autoplay suffix could also start a track before the page's own play call, which could double up or play the wrong context. Only worth an iPhone test if link mode needs to be faster.

### App Remote SDK (#6, #7)
- SDK reference (S2): every `authorizeAndPlayURI` variant says "Open Spotify app to obtain access token and start playback." `connect` says "If the Spotify app is not running you will need to use authorizeAndPlayURI: to wake it up".
- Application Lifecycle guide (S3): "When the App Remote SDK wants to wake up the Spotify client it must perform an app switch to do so." Spotify switches back via the registered redirect URI. It recommends a button labeled "Resume Playback" or "Open Spotify" so "it's clear to the user an app switch will occur."
- README (S4): "Music must be playing when you connect with SPTAppRemote to ensure the Spotify app is not suspended in the background."
- A Spotify Star (not staff) wrote on 2024-10-17 that the SDK "can't start playback when the app is in the background or when the device is locked" (S11).
- So even native apps get a visible switch to Spotify. No source says whether that switch shows Home on a cold start. It is native-only either way. The SDK still works in 2026 (a 2026-06-24 post uses SDK 5.0.1 on iOS 26.4.2, S29, about an auth error).

### Web API and Connect (#8, #9)
- Spotify's reference pages for transfer (S12), start playback (S13) and devices (S14) say nothing about inactive or unlisted devices. The devices page only says "Some device models are not supported and will not be listed".
- Forum reports: a device "has to be manually made active" before transfer (S15, user answer); `PUT /me/player` to an unlisted ID returns 404 "Not found" (S15); a 2024-12-19 bug post got a 500 and the device then vanished from the list until the app restarted (S16); users ask for a "wake up" endpoint and get no answer (S15, S17).
- Spotify moderator Yordan, 2022-04-01: "If the app is fully closed (and isn't running in the background) on a device, that device will not show up in the list of available devices in Connect." (S18)
- Spotify's Connect support page (S20) says logged-in devices may show "even if it isn't on the same WiFi", and that after a pause of more than 10 minutes "you might need to reconnect". It says nothing about closed phone apps.
- Reports of the iPhone app relaunching by itself while a Mac plays (S19, iOS 15; S21, undated) are complaints. Staff offered reinstall steps and Offline Mode, not a way to trigger it.

### Web Playback SDK (#11)
- This is a different design: the page plays audio itself instead of waking the Spotify app. It would remove the Home flash and also the trip to Control Center.
- Costs: new `streaming` scope (S26), so Richard must sign in again; Premium needed (S23). The player must be created or activated inside a tap (S24, S25). Audio plays in Safari, so it likely stops or pauses when Safari is closed or the tab is swapped away. That is unverified. It would also show as a separate device in Spotify.
- Worth a separate spec and an iPhone test if Richard wants it. Not a fix for the app's Home flash.

### Other tricks
- I found no other credible current trick for starting the iPhone Spotify app in the background from a web page. Siri, lock screen and Shortcuts are covered by the other passes.

## iPhone checks (if wanted)
- L1: Swipe Spotify away. In link mode, tap an item. Note: does Home show before the item page, and for how long?
- L2: Same, but with `?go=1` and then `:play` added to a track link (one test link, not shipped). Note whether it autoplays and whether Home still shows.
- L3 (only if #11 is explored): a test page with the Web Playback SDK built in a tap handler. Note whether it plays on iOS 26/27 Safari, and whether audio keeps going after locking the phone.

## Sources (all read 2026-11-26)

- S1. Spotify for Developers, iOS Content Linking: https://developer.spotify.com/documentation/ios/tutorials/content-linking (undated, footer 2026)
- S2. Spotify iOS SDK, SPTAppRemote Class Reference: https://spotify.github.io/ios-sdk/html/Classes/SPTAppRemote.html (undated)
- S3. Spotify for Developers, iOS Application Lifecycle: https://developer.spotify.com/documentation/ios/guides/application-lifecycle/ (undated)
- S4. spotify/ios-sdk README: https://github.com/spotify/ios-sdk (undated)
- S5. Community, "Spotify Links don't automatically start playing the song" (accepted user answer): https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Links-don-t-automatically-start-playing-the-song/m-p/5395149 (undated on page)
- S6. Community, "Autoplay when clicking on a shared link": https://community.spotify.com/t5/Spotify-for-Developers/Autoplay-when-clicking-on-a-shared-link/m-p/5648300/highlight/true and https://community.spotify.com/forum/en/discussion/5648300 (asker on macOS 14, so 2023 or later)
- S7. Community, "API URI Play=True on Custom Playlists' Individual Tracks": https://community.spotify.com/t5/Spotify-for-Developers/API-URI-Play-True-on-Custom-Playlists-Individual-Tracks/td-p/5025364 (2020-08-28; old)
- S8. Community, "Open Spotify URI on iOS app without autoplaying": https://community.spotify.com/t5/iOS-iPhone-iPad/Open-Spotify-URI-on-iOS-app-without-autoplaying-or-affecting/td-p/4712065 (undated; old message id)
- S9. Community, "Shared links doesn't work": https://community.spotify.com/t5/Android/Shared-links-doesn-t-work/m-p/5645069 (iOS 17.0.x, Spotify 8.8.75/76, autumn 2023)
- S10. Feature.fm help, "Deep Linking a Track within a Playlist": https://help.feature.fm/articles/10998664715405-Deep-Linking-a-Track-within-a-Playlist-using-Feature-fm-Smart-Links-to-Increase-Spotify-Streams (undated, third party)
- S11. Community, "Best user flow design for an alarm app (iOS)": https://community.spotify.com/t5/Spotify-for-Developers/Best-user-flow-design-for-an-alarm-app-iOS/td-p/6441443 (2024-10-16 and 2024-10-17)
- S12. Web API reference, Transfer Playback: https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback
- S13. Web API reference, Start/Resume Playback: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- S14. Web API reference, Get Available Devices: https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices
- S15. Community, "active a playback device with API": https://community.spotify.com/t5/Spotify-for-Developers/active-a-playback-device-with-API/m-p/5159515/highlight/true (undated, many years of replies)
- S16. Community, "Endpoint Transfer Playback returns 500 error when all devices inactive": https://community.spotify.com/t5/Spotify-for-Developers/Endpoint-quot-Transfer-Playback-quot-returns-500-error-when-all/td-p/6594944 (2024-12-19)
- S17. Community, "v1/me/player/devices returns empty array": https://community.spotify.com/t5/Spotify-for-Developers/v1-me-player-devices-returns-empty-array/m-p/6949615/highlight/true (undated; replies span about 4 years)
- S18. Community, "Spotify Connect only sees devices that have the app open": https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-Connect-only-sees-devices-that-have-the-app-open/td-p/5360650 (2022-03-31 to 2022-04-02)
- S19. Community, "Spotify randomly starts in background when the app is closed": https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-randomly-starts-in-background-when-the-app-is-closed/td-p/5302206 (iOS 15, so 2021 or later)
- S20. Spotify Support, Spotify Connect: https://support.spotify.com/ph-en/article/spotify-connect/ (undated, footer 2026)
- S21. Community, "Spotify automatically opening iPhone app when playing from...": https://community.spotify.com/t5/iOS-iPhone-iPad/Spotify-automatically-opening-iPhone-app-when-playing-from/td-p/4747232 (undated; old message id)
- S22. Apple, Mac User Guide, set up your Mac to be an AirPlay receiver: https://support.apple.com/guide/mac-help/mchleee00ec8/12.0/mac
- S23. Spotify for Developers, Web Playback SDK: https://developer.spotify.com/documentation/web-playback-sdk
- S24. Spotify for Developers, Web Playback SDK reference (`activateElement`): https://developer.spotify.com/documentation/web-playback-sdk/reference
- S25. Community, "Web Playback SDK Playing song directly in browser issues IOS": https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Playing-song-directly-in-browser-issues-IOS/td-p/5538195 (iOS 16.4.1, so 2023)
- S26. Spotify for Developers, Scopes (`streaming`): https://developer.spotify.com/documentation/web-api/concepts/scopes
- S27. Community, "Web Playback SDK not playing on iOS 15": https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-playing-on-iOS-15/m-p/5427466 (iOS 15, so 2021 to 2022)
- S28. Spotify Support, Web Player help (supported browsers, iOS Safari 15+): https://support.spotify.com/us/article/webplayer/
- S29. Community, "Spotify iOS SDK 5.0.1 App Remote Authentication Returns error": https://community.spotify.com/t5/Spotify-for-Developers/Spotify-iOS-SDK-5-0-1-App-Remote-Authentication-Returns-error/td-p/7482096 (2026-06-24)

Not reachable or not used: discussions.apple.com threads redirected to the Apple Support home page. The thread "Help Needed: Spotify Device Not Available When App or Tab Is Closed" (https://community.spotify.com/forum/en/discussion/7003539) loaded but had no answer on waking devices. Direct downloads of community pages were blocked by the network proxy. I used no caches, archives or mirrors. Reddit and Stack Overflow were not read.
