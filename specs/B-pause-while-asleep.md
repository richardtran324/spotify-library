# Spec B: Pause while asleep counts as paused

- **Effort:** S (one function rewritten, two small guards, one README line).
- **New scope needed:** no. Pause already uses `user-modify-playback-state`.
- **Recommendation:** when Pause gets a 404, try once more without `device_id`, then show the song as paused and asleep with no toast, keep the position frozen at the tap, and stop other tabs from moving it.

## Problem

Richard taps Pause on the bar or the Now Playing screen. Sometimes the iPhone has already dropped off Spotify's device list. The page then shows "Press play first to wake Spotify." That reads as an error, and it tells him to press play when he wanted silence. Silence is what he already has.

What happens today, traced in `index.html`:

**Case 1: Pause tapped when `state.playerIdle` is already true.**
- `idleFrom()` builds the asleep player with `is_playing: false`.
- So `paintPlayer()` and `paintNp()` show the Play icon (label "Play"), not Pause.
- A tap runs `togglePlay()`, which sees `state.playerIdle` and calls `resumeFromIdle()`. That is Play, through the wake mode.
- So no Pause tap can reach `command()` while the page already knows Spotify is asleep. No toast comes from this case.
- The toast in case 1 only comes from Next, Previous, Shuffle, Repeat and Volume (the guard at the top of `command()`). Those stay as they are.

**Case 2: the page still thinks it is playing, and `PUT /me/player/pause` answers 404.**
1. `togglePlay()` calls `command('PUT', '/me/player/pause', optimistic)`.
2. The optimistic step sets `progress_ms = curPos()`, `playerAt = now`, `is_playing = false`, and repaints. The button already shows Play.
3. The request goes out with `?device_id=` of the last device seen (`state.player.device.id`).
4. Spotify answers 404 (no such device, or no active device).
5. `goIdle()` runs. It clears the device state, freezes the position with `setLastPos(curPos())` (or `saveLastPlay` if nothing is saved), sets `state.player = idleFrom(...)` and `state.playerIdle = true`, and repaints. The muted line says "Spotify is asleep. Press play to wake it."
6. `command()` then shows the toast "Press play first to wake Spotify."
7. The final `.then` calls `schedulePoll(500, true)`. A forced `GET /me/player` goes out 0.5 s later and answers 204.
8. `setPlayer(null)` keeps the asleep view. Because `goIdle()` set `state.devicesAt = 0`, it also calls `checkDevice()`, which sends `GET /me/player/devices`.

So today the end state is already right (paused, asleep, position frozen). Only the toast is wrong. It costs 3 player calls.

Three smaller problems sit on the same path:
- **A stale device id can leave music playing.** If the iPhone Spotify app came back with a new device id, the 404 is about the old id. The phone may still be playing, but the page shows it as paused and asleep until the next check (10 to 60 s).
- **Podcast history misses the paused spot.** `goIdle()` does not call `noteEpisode()`. The forced check then finds `playerIdle` already true and skips it too. So "Continue listening" can be up to 15 s behind (the history write interval).
- **Another tab can move the frozen spot.** Tabs share `lib-lastplay`. Suppose tab B was hidden while it still showed the song playing. When B comes back, its check gets 204, and `setPlayer(null)` runs `setLastPos(curPos())` with B's own estimate. B thinks the song kept playing, so the spot jumps ahead, often to the end of the song. The next Play then starts at the wrong place. This happens today after any pause, not only this one.

## Options considered

**A. Change the toast text only.** For example "Paused. Spotify went to sleep." Cheap. It still pops a message for a normal action and keeps all three side problems. Not picked.

**B. No toast. Treat the 404 as "already paused."** Keep the optimistic paused UI, go asleep silently, and skip the forced check that follows. 1 call. Fixes the toast and saves calls. But a stale device id can still leave music playing. Close, but not enough.

**C. Option B plus one retry without `device_id`.** On a 404, send `PUT /me/player/pause` once more with no `device_id`. Spotify then targets the user's active device, whatever its id is ([spotifyr docs mirroring the Spotify reference](https://search.r-project.org/CRAN/refmans/spotifyr/html/pause_my_playback.html); [Spotify console page](https://developer.spotify.com/console/put-pause)). If that works, the phone really was playing and is now paused. If it also gets a 404, go asleep silently. Up to 2 calls, only on the rare 404. Also fixes podcast history and stops other tabs from moving the frozen spot. **Picked.**

**D. Don't send Pause when the page guesses Spotify is asleep.** For example, when the last check is old or nothing has played for 10 minutes. 0 calls. But if the guess is wrong, the music keeps playing while the page shows paused. That is the worst outcome for a Pause button. Not picked.

**Why C:** Pause has one job: make the music stop. C is the only option that makes sure of that when the device id has changed, and it stays silent when there was nothing to stop. The retry costs at most one extra call, and only on a 404. It also drops the forced check that runs today, so a 404 never costs more than it does now.

## What to build

All changes are in `index.html`, plus one README line. No new constants are needed besides the one below.

### 1. New function `pauseNow()` (near `togglePlay()`)

`togglePlay()` calls `pauseNow()` instead of `command('PUT', '/me/player/pause', ...)` when `p.is_playing`. The Play branch is unchanged.

`pauseNow()` works like `command()` with these differences:
- Same opening guards: `state.playerIdle` (cannot happen here, see case 1, but keep it as a silent `return`), then `coolBlocked('player')`.
- Same optimistic step: `x.progress_ms = curPos(); state.playerAt = Date.now(); x.is_playing = false;`, then `paintPlayer()` and `showStatus()`. Keep `pos` from this step in a local variable. Bump `state.pollSeq` and set `state.lastActiveAt` as `command()` does.
- Send `PUT /me/player/pause?device_id=<last device>`, or with no query if there is no device id.
- **2xx:** as today. `schedulePoll(500, true)`.
- **404, first try had a `device_id`:** send `PUT /me/player/pause` with no `device_id`.
  - 2xx: the phone was playing under a new id. `schedulePoll(500, true)` so the page learns the new device. No toast.
  - 404: go to "asleep" below.
  - Any other answer: as today, `onFail('Couldn’t control playback')`.
- **404 with no `device_id` (first try or retry): asleep.**
  - Call `goIdle(pos)` (see 2). No toast.
  - Call `storePlayerCache(null)`. This tells other copies of the page, the same way a 204 check would. It sends nothing.
  - Do **not** call `schedulePoll(500, true)`. Call `schedulePoll(pollEvery())` so the normal check cadence goes on.
- **429 / cool-off / sign-out / network:** unchanged, through `onFail`.
- **403 with "Restriction violated" in the message:** treat it as paused. Keep the optimistic UI, show no toast, and `schedulePoll(500, true)`. This is the answer Spotify is reported to give when the player is already paused. *Unverified:* forum threads report it ([Spotify community: "Player command failed: Restriction violated"](https://community.spotify.com/t5/Spotify-for-Developers/Player-command-failed-Restriction-violated/td-p/5987728)), but I have not confirmed it for pause. Keep the match narrow: method PUT, path `/me/player/pause`, status 403, message contains "Restriction".

`command()` keeps its 404 branch for every other path (Next, Previous, Shuffle, Repeat, Volume, Seek, Play). Those still show "Press play first to wake Spotify." That is still right for them, because they can't do anything while asleep.

### 2. `goIdle(pos)` takes an optional frozen position

- If `pos` is given, use it instead of `curPos()`. Otherwise keep today's logic.
- Freeze through the new `freezeLastPos(pos)` (see 3).
- Call `noteEpisode(p.item, pos, false)` before switching to the asleep player, as `setPlayer(null)` does. That puts the paused spot in podcast history.

### 3. Frozen spot shared across tabs: `freezeLastPos(ms)` and a `frozenAt` field

- Add a field to the `lib-lastplay` record: `frozenAt` (ms time). It is the moment a copy of the page froze the position because playback stopped.
- `freezeLastPos(ms)`: like `setLastPos(ms)`, and also sets `o.frozenAt = Date.now()`. If no record exists, the caller uses `saveLastPlay(p, ms)` and then sets `frozenAt` the same way.
- `goIdle()` and the freeze branch of `setPlayer(null)` both use this guard:
  - Read `o = readLastPlay()`.
  - If `o.frozenAt` is later than `state.playerAt` and `o.item.uri` matches this copy's `state.player.item.uri`, another copy (or this one) has already frozen the spot after the answer this copy counts from. Use `o.positionMs` as the position. Do not overwrite it. Also pass that position to `noteEpisode()`.
  - Otherwise freeze with `curPos()` (or the given `pos`) as today.
- `seekTo()` while asleep keeps calling `setLastPos()` (no `frozenAt` change). A seek is a deliberate move and must still win.
- `saveLastPlay()` from a fresh playing answer writes a new record without `frozenAt`. A real answer from Spotify always wins.

### 4. UI text

- No toast on Pause in any of the cases above.
- The muted line stays `IDLE_TEXT`: "Spotify is asleep. Press play to wake it." It already says what Play will do. No new string.
- The button shows Play (it already does after the optimistic step). Its aria-label is "Play".
- `WAKE_FIRST` stays for Next, Previous, Shuffle, Repeat and Volume.

### 5. What the next Play does (unchanged code, now with the right spot)

- `togglePlay()` sees `playerIdle` and calls `resumeFromIdle()`.
- `resumeItem()` takes `positionMs` from `idleFrom(readLastPlay())`, which is the frozen spot.
- With the default wake mode the line reads "Press play in Control Center or on the lock screen. It picks up at 1:23." The other two wake modes work as today.

### 6. README

Under "When Spotify goes to sleep", add one bullet: **Pause** while Spotify is falling asleep just shows the song as paused at that spot, with no message. Play picks up there.

## Request cost

All calls are in the **player** group (cool-off group `player`). None are library, search or catalog. No catalog calls at all.

| Situation | Today | After |
|---|---|---|
| Pause, device answers 2xx | 1 PUT + forced GET `/me/player` | same (2) |
| Pause, 404, phone asleep | PUT (404) + forced GET `/me/player` + GET `/me/player/devices` = 3 | PUT (404) + PUT retry (404) = 2. The next regular check (10 to 60 s later) does GET `/me/player` and, as today, GET `/me/player/devices` |
| Pause, 404, new device id, still playing | 3, and the music keeps playing | PUT (404) + PUT retry (2xx) + forced GET `/me/player` = 3, and the music stops |
| Pause, 403 "Restriction violated" | 1 PUT + forced GET + error toast | same 2, no toast |
| Pause tapped while already asleep | cannot happen (button is Play) | same |

Net: the asleep case goes from 3 calls in the first second to 2. Other tabs get the asleep answer through `lib-player-cache` and send nothing for it. The retry happens only after a 404 and never repeats.

## Tests in a browser

Load `index.html` in a desktop browser with a signed-in token in localStorage and `window.fetch` replaced by a mock. The mock answers by method and path from a script and records every call. Start each test from a playing answer: `GET /me/player` returns a song with `is_playing: true`, `progress_ms: 60000`, `device.id: 'A'`. Let 5 s pass on a fake clock, or set `state.playerAt` back 5 s.

1. **Asleep, no toast.** PUT pause with `device_id=A` returns 404. The retry with no `device_id` returns 404.
   - Exactly 2 PUT calls, the second with no `device_id`. No GET in the next 2 s.
   - No toast element appears. `state.playerIdle === true`. The button aria-label is "Play".
   - `#pSub` and `#npIdle` read "Spotify is asleep. Press play to wake it."
   - `lib-lastplay.positionMs` is about 65000 (±600) and has `frozenAt`.
   - `lib-player-cache.json === null`, with `by` equal to this copy's id.
2. **New device id.** First PUT 404, retry 204, then `GET /me/player` returns the song paused on device `B`.
   - The page shows paused on `B`, not asleep. No toast. Exactly 2 PUT calls and 1 forced GET.
3. **Normal pause.** PUT returns 204. 1 PUT, 1 forced GET after 500 ms. Same as today.
4. **403 Restriction violated.** PUT returns 403 with `{"error":{"status":403,"message":"Player command failed: Restriction violated"}}`. No toast. Paused UI stays. 1 forced GET.
5. **Other 403 or 500.** The toast "Couldn’t control playback (...)" appears as today.
6. **Cool-off.** Set a player cool-off in `lib-cool`. Tap Pause. No fetch call. The cool-off toast shows as today.
7. **Next Play resumes at the frozen spot.** After test 1, wake mode "wait": tap Play. `lib-pending.item.kind === 'resume'` and `positionMs` is about 65000. The muted line says "It picks up at 1:05." Then let the mock return device A in `GET /me/player/devices`. The `PUT /me/player/play` body has `position_ms` about 65000.
8. **Episode history.** Repeat test 1 with an episode. The podcast history entry for that URI has `positionMs` about 65000 right after the 404 (no 15 s wait).
9. **Other tab cannot move the spot.** Open two copies (two tabs, same origin). In tab B, load the playing answer, then hide tab B. In tab A, run test 1. Wait 30 s. Show tab B. Its own check gets 204.
   - `lib-lastplay.positionMs` is still about 65000, not about 95000.
   - Tab B shows the song asleep at 1:05.
10. **A seek still wins.** After test 1, drag the progress bar to 2:00 while asleep. `positionMs` is 120000. A later 204 check in another tab keeps 120000.
11. **A real answer still wins.** After test 1, `GET /me/player` returns the song playing at 10000. `lib-lastplay` is replaced, with no `frozenAt`. The page shows playing.
12. **Other controls unchanged.** While asleep, tap Next, Shuffle, Repeat. Each shows "Press play first to wake Spotify." and sends nothing.

## Checks only on the iPhone

Only Richard can do these, on his iPhone and his Spotify account:

1. Play a song from the page. Lock the phone and pause from the lock screen. Wait until Diagnostics shows Player "idle (asleep)" in another tab, or about 5 minutes. Come back to a tab that still shows Pause, and tap it. Expect: no message, the song shows paused, and the asleep line shows.
2. Then tap Play with the default wake mode. Press play in Control Center. Expect: the song starts at the spot shown, not later.
3. Play a podcast episode and repeat check 1. Expect: "Continue listening" on Home shows the paused spot.
4. Force-quit the Spotify app while it plays from another device or Control Center, start it again, play something, and then tap Pause on a page tab that still shows the old state. Expect: the music actually stops. This checks the retry. It may be hard to set up. It only matters if the iPhone's device id changes, and I don't know how often it does.
5. Two Safari tabs: pause in one, switch to the other after a minute. Expect: the same paused spot in both.
6. Normal pause and play while Spotify is awake still work with one tap and no delay.

## Acceptance criteria

- Pause never shows "Press play first to wake Spotify."
- After Pause on a phone that is asleep, the page shows the song paused at the tap position, with the asleep line, within one paint.
- Pause sends at most 2 requests before the next regular check, and never more than one retry.
- If Spotify accepts the retry, the music stops and the page shows the active device.
- The next Play resumes within about 1 s of the spot shown.
- Another tab of the page never moves the frozen spot except by a seek or a real playing answer.
- Episode history records the paused spot at the moment of the pause.
- Next, Previous, Shuffle, Repeat, Volume and Seek behave as today.
- No new scope, no new storage key (one new field in `lib-lastplay`), no catalog calls.

## Risks and open questions

- **The frozen spot is an estimate.** It assumes the song kept playing until the tap. If Richard paused on the lock screen 3 minutes earlier and the page has not checked since, the spot is too late, up to the end of the song. This is true today too. A fix would need a check before pausing, which costs a call on every pause. I don't recommend it. Open question: should Play from an asleep song at its very end start from 0 instead?
- **403 "Restriction violated" is unverified for pause.** If Spotify sends a different code or message when the player is already paused, that branch just never runs and the toast shows as today. Low risk.
- **A 404 while the phone is truly playing, even without `device_id`.** Then the page shows asleep while music plays, until the next check (10 to 60 s) shows it playing again. Same as today, minus the toast.
- **Old records.** `lib-lastplay` records from before this change have no `frozenAt`. The guard treats them as "not frozen", which is today's behavior.
- **Clock skew between tabs.** Both tabs run on the same phone clock, so `frozenAt` compared with `state.playerAt` is safe. `readLastPlay()` already drops records with times in the future.
- **Home Screen web app.** It keeps its own storage, so the cross-tab guard does not reach it. Richard uses a Safari tab, so this is fine.
- **Open question:** while a "wait" resume tap is pending, the button still shows Play. Should a tap there act as Pause and cancel the pending tap, the same as the Cancel link? That is out of scope here. It could be a small follow-up.
