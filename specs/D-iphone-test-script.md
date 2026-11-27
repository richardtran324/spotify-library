# D: iPhone test script (about 10 minutes)

Steps 1 to 7 and 11 take about 10 minutes. Steps 8 to 10 are optional and add about 5 minutes. Quoted text is the page's own wording.

## Before you start

- Open the page in its Safari tab (not the Home Screen icon), close any other copies, and force-quit Spotify (swipe it up in the app switcher).
- Tap **Diagnostics** (header), set **When Spotify isn't running** to **Wait for me to press play (no app)**, tap **Close**, and don't open **Podcasts → Latest** during the test (it can use up to 12 catalog requests).

Opening Diagnostics sends 4 requests (account, devices, now playing, playlists). None are catalog requests, so it's fine to open it often. If a step fails, tap **Copy** in Diagnostics and paste the report into one Notes note, with the step number above it.

## Steps

1. **Baseline Diagnostics (1 min)**
   - Do: Tap **Diagnostics** and read the **Report** box.
   - Expect: `Page v2.16 (2026-11-25)`. `Wake mode: wait`. `Pending: none`. `Player:` says `idle (asleep)` or `nothing`. `Devices →` shows `0 devices` or a list without your iPhone. Under `Paused by Spotify (per group):` all four (`player`, `library`, `search`, `catalog`) say `working`. Note the catalog numbers in `Requests by group, this copy (10 min / 1 h)`.
   - If it fails: copy the `Page`, `Wake mode`, `Player`, `Devices`, `Paused by Spotify` and `Recent errors` lines (or the whole report).

2. **v2.16 Show songs on someone else's playlist (1.5 min)**
   - Do: Tap **Close**. On **Playlists**, open a playlist you follow but didn't make. Check the note, then tap **Show songs**. Scroll the list. Don't tap a song in it yet. Then tap one song inside it.
   - Expect: Before the tap you see "Spotify only lets personal apps list songs in your own playlists. Tap Play to hear this one." and a **Show songs** button, and nothing else loads. After the tap, Spotify's song list appears within about 2 seconds, fits the screen width with no sideways scrolling, and doesn't autoplay. In dark mode it uses Spotify's dark style. No "more like this" or suggested section appears. Tapping a song plays a 30-second preview inside the list, not on your phone. That's expected.
   - Then: reopen **Diagnostics**. The catalog numbers in `Requests by group` are not higher than in step 1 (opening this playlist and the list sends no requests).
   - If it fails: copy `Requests by group`, `Most asked (10 min)` and `Recent errors`. Take a screenshot if it doesn't fit or shows suggested content.

3. **Wait mode and Liked Songs as a context (2 min)**
   - Do: Tap **Close**, go to **Home**, tap the **Liked Songs** row, then tap **Play** at the top. Open Control Center and press play.
   - Expect: Right after **Play**, the line under the status says "Press play in Control Center or on the lock screen. "Liked Songs" starts as soon as Spotify wakes." with **Open Spotify instead** and **Cancel**. After you press play in Control Center, you may hear the last thing Spotify played for a moment, then Liked Songs plays. Back on the page, tap **Next** once: the next song comes from Liked Songs.
   - If it fails: if you see "Spotify didn't wake up yet", tap **Try again** once. If it still fails, copy `Wake mode`, `Pending`, `Device picked`, `Player`, `Devices` and `Recent errors`. Note whether Control Center showed Spotify at all.

4. **Now Playing: touch-drag the progress bar, then swipe down (1 min)**
   - Do: Tap the cover or song name on the bar to open **Now Playing**. Put a finger on the progress bar and slide it slowly left and right, then let go. Then tap once elsewhere on the bar. Then swipe down from the top of the screen.
   - Expect: **Open Liked Songs** is one of the buttons (this confirms the page sees the Liked Songs context). The time follows your finger while you drag, the screen doesn't close or scroll, and the song jumps to that spot when you let go. A single tap also jumps. The swipe down closes the screen. In Diagnostics, `Now Playing last closed: swipe down at <time>`.
   - If it fails: copy `Now Playing last closed`, `Player`, `Recent errors` and `Browser`. Say whether the drag moved the page or closed the screen.

5. **Episode from a saved position (1 min)**
   - Do: On **Home**, find **Continue listening** and note the "min left" on one episode. Tap it. Open **Now Playing**.
   - Expect: It plays right away from about where you left off (time left matches the row, within a minute). The screen shows the back 15 and forward 30 buttons (icons only; VoiceOver reads them as "Back 15 seconds" and "Forward 30 seconds") and **Open show · …**.
   - Then: pause it. You'll use this episode in step 6.
   - If it fails: copy `Player` (with `Last state`), `Podcast history`, `Now playing (/me/player)` and `Recent errors`. Copy any toast, such as "Couldn't play (…)".

6. **Link mode (1.5 min)**
   - Do: In **Diagnostics**, choose **Open the Spotify app**, then **Close**. Force-quit Spotify. Back in Safari, wait about 20 seconds until the bar says "Spotify is asleep. Press play to wake it." (tap anyway after 40 seconds). Tap the same episode in **Continue listening**. When Spotify opens, tap "◀ Safari" at the top left.
   - Expect: The toast "Taps will open the item in Spotify when Spotify isn't running" when you pick the mode. Spotify opens (it may show Home briefly on a cold start). Back in Safari the line says "Starting "<episode>"…" and the episode plays at its saved spot within 20 seconds. If a toast "Spotify isn't open on any device." appears with **Open in Spotify**, tap that button; that's expected when the page hadn't checked recently.
   - If it fails: if "Spotify didn't show up yet." appears, tap **Try again** once. Then open Diagnostics fast (a tap is kept 3 minutes) and copy `Wake mode`, `Pending` (it should end with `resume at m:ss`), `Device picked`, `Devices` and `Recent errors`.

7. **Shortcut mode and the "Wake Spotify" Shortcut end to end (1.5 min)**
   - Do: Check the Shortcuts app has a shortcut named exactly **Wake Spotify** (if not, make it from the separate setup guide first, and skip this step today). In **Diagnostics**, choose **Run my Wake Spotify shortcut**, then **Close**. Pause, force-quit Spotify, come back and wait about 20 seconds as in step 6. Open the playlist from step 2 and tap **Play** at the top. If Safari asks to open Shortcuts, tap **Open**.
   - Expect: The toast "Taps will run your Wake Spotify shortcut when Spotify isn't running" when you pick the mode. The shortcut opens Spotify, then comes back to the page by itself, and the playlist plays on your phone without you switching back. This also checks that header **Play** still plays someone else's playlist. If a toast "Spotify isn't open on any device." appears with **Wake Spotify**, tap that button.
   - Then: set **When Spotify isn't running** back to the mode you want to keep.
   - If it fails: say where it stopped (Safari prompt, Shortcuts, Spotify, or back on the page). Copy `Wake mode`, `Pending`, `Address`, `Device picked`, `Devices` and `Recent errors`.

8. **Optional: Spotify falls asleep after a pause (2 min)**
   - Do: With something playing, pause it on the page. Leave the page on screen and wait (seconds to a few minutes). Then tap **Play** on the bar and press play in Control Center.
   - Expect: The bar keeps the song, shown as paused, with "Spotify is asleep. Press play to wake it." Diagnostics shows `Player: idle (asleep)`. **Next** says "Press play first to wake Spotify." After **Play** (in wait mode) the line says "Press play in Control Center or on the lock screen. It picks up at m:ss." and it resumes at that spot.
   - If it fails: copy `Player`, `Pending`, `Devices` and `Recent errors`.

9. **Optional: v2.14 per-group pause during a real quota event (1 min, only if it happens)**
   - Do: Nothing to trigger. Don't open many albums or podcasts to cause one (the catalog part runs out at about 21 requests an hour). If you see a slim line under the header during any step, open **Diagnostics** and tap **Copy** right away. Then try play or pause, and run one search.
   - Expect: A quota event looks like "Spotify paused podcast and album details until 10:31 PM. Playback, your library and search still work." In Diagnostics, `Last 429:` shows `QUOTA_EXCEEDED` and `Retry-After not exposed`, `catalog: paused until … (quota)` with `quota strikes 1, next quota pause 20 min`, and the other three groups say `working`. Play, pause and search still work.
   - If it fails: if more than one group is paused, or the line says "Spotify asked this page to slow down.", send the whole report you copied.

10. **Optional: v2.15 "From search" album fallback (2 min, only while catalog is paused)**
    - Do: Only during the pause from step 9. Open two real albums you haven't opened in the page before (if one says **Saved on this phone**, pick another). Count the songs and compare with the album in the Spotify app. Tap one song.
    - Expect: The list says "From search (Spotify paused album details until …)". Songs show in disc and track order, only from that album. Some may be missing; **Load more** looks further. The tapped song plays inside the album, so the next song follows.
    - If it fails: note the album names, how many songs the page listed and how many the album has. Copy any "Search didn't find this album's songs. Try again after Spotify's pause." text, plus `Requests by group`, `Paused by Spotify` and `Recent errors`.

11. **Final report (0.5 min)**
    - Do: Open **Diagnostics**, tap **Copy** (it changes to "Copied"), and paste it into your Notes note.
    - Expect: `Recent errors: none`, or only errors you already noted in a step.
    - If it fails: if **Copy** says "Selected, tap Copy", use the iPhone's own Copy on the selected text.

## Send me

Paste these back in one message:

1. One line per step: the step number and "pass", "fail" or "skipped" (for steps 8 to 10, also "didn't happen").
2. For each failure: what you saw, the exact text of any toast or line, and the Diagnostics report or lines you copied in that step.
3. Step 2: whether the embed fit the screen, whether it loaded within about 2 seconds, and whether any suggested or "more like this" content appeared.
4. Step 7: where the Shortcut flow stopped, if it did.
5. Steps 9 and 10, if a quota pause happened: the report copied during the pause, and for each album its name, songs listed and songs on the album.
6. The final Diagnostics report from step 11, whole.
