# Spec A: Other people's playlists, a "Make a copy" helper (option #2) and no queue view (option #3)

- **Effort:** M (about 150 lines in `index.html`, plus a README line). A smaller S cut is described under Risks.
- **New scope needed:** No. No new sign-in.
- **Recommendation:** Build a small helper for #2 (copy steps, a local link between original and copy, a note when the original changes). Do not build #3.

## Problem

In Development Mode, `GET /playlists/{id}/items` only works for Richard's own or collaborative playlists. For anyone else's playlist, the detail view shows the note "Spotify only lets personal apps list songs in your own playlists. Tap Play to hear this one." v2.16 added **Show songs**, which loads Spotify's embed. The embed shows the songs, but a song tapped inside it plays a 30-second preview in Safari, not on the phone. It also has no sorting, no ＋ queue and no hearts.

Two other options were set aside for v2.16:

- **#2:** Richard copies the playlist in the Spotify app. The copy is his, so the page lists its songs natively.
- **#3:** show the next songs from `GET /me/player/queue` while the playlist plays.

This spec decides whether either one is worth building.

## Options considered

**#2a. Do nothing in the page.** Richard copies in the app and taps Refresh. The copy then appears as an own playlist with the full native list. This already works today with zero code. Its gaps: the steps are easy to forget, the original and the copy sit side by side with nothing tying them together, and the copy is a snapshot that never tells him when the owner changes the original.

**#2b. Steps only (S).** A **Make a copy** button in the restricted view that shows the steps and an **Open in Spotify** link. Small, but it only fixes the first gap.

**#2c. Steps plus a local link (M). Picked.** Same as #2b, plus:
- the page links the copy to the original on this phone, with no new requests;
- the original's view gets **Open your copy**, and the copy's view gets **Copy of "…" · Open original**;
- the copy's view says when the original has changed since he copied it, using fields that `/me/playlists` already returns.

Why: the copy is the only way to get the native list with tap-to-play on the phone. The link and the change note cost no requests, because they reuse the library load the page already makes. Everything stays inside Richard's own things, so it fits his rule (no suggested content).

**#3. Queue view. Not picked.** Ideas tried and why each fails:
- Show the queue inside the playlist's view while that playlist is the playing context. The queue answer does not mark where the playlist ends and Spotify's autoplay begins. Up next hides Spotify's own additions by default (`lib-queue-hide`), and this view would have to show them. That breaks the rule Up next already follows.
- Show only the first few queue items. Shuffle and his own ＋ songs change the order, so "first few" is not "the playlist's next songs".
- Cut the list when autoplay is off. The page can't read the autoplay setting through the Web API (unverified, but I found no endpoint for it in the page or the README).
- Each open would cost a `player` request, and the list only covers what plays next, never the whole playlist.

The embed (v2.16) and the copy (#2) both cover this need better. Drop #3.

## What to build

### 1. Storage keys (add to `K`, near line 619)

- `plCopies: 'lib-pl-copies'`: `{ <original id>: { copyId, name, ownerName, ownerId, uri, img, snap, count, at } }`. One copy per original; a newer link replaces the older one. Cap at 50 entries (drop the oldest `at`). Local only, like pins.
- `copyWatch: 'lib-copy-watch'`: `{ origId, name, at, known: [ids] | null }`. Written when Richard taps **Make a copy**. `known` holds the ids of his own playlists at that moment, or `null` if the library wasn't loaded yet. Ignored after 24 hours.

Wrap every read and write in the existing `get`/`set` helpers, so blocked storage only turns the feature off.

### 2. `mapPlaylist` (line 1229)

Add `snap: p.snapshot_id || ''`. The value is saved with `lib-cache` automatically. An older cache without `snap` means "unknown", which never shows a change note. **Verify first** that `/me/playlists` still returns `snapshot_id` in Development Mode after the Feb 2026 changes. If it doesn't, the change note falls back to the song count alone (see section 5).

### 3. The restricted view: a new `#dcopy` box

- In `renderDetail` (line 4035), add `<div class="dcopy" id="dcopy" hidden>` right after `#dfoot`.
- Add `paintDetailCopy()`. Call it from `paintDetailFoot` **before** the early return at line 4139, so opening the steps never redraws `#dfoot` and never reloads an open embed.
- It shows only when `d.restricted` and `d.item.kind === 'playlist'` and `d.item.id`.

**When no copy is linked:**
- A secondary button, **Make a copy**. Tapping it sets `d.copyHelp = true`, writes `lib-copy-watch` and repaints only `#dcopy`.
- With `d.copyHelp` set, the box shows:
  - "Copy it in the Spotify app, and the copy will list its songs here:"
  - An ordered list:
    1. "Tap Open in Spotify below."
    2. "Tap ⋯ under the playlist's name."
    3. "Tap Add to other playlist."
    4. "Tap New playlist at the top."
    5. "Come back here and tap Refresh."
  - A link button, **Open in Spotify**, with `href = d.item.url`. Same pattern as the existing Now playing link (line 3346).
  - A small note: "Your copy won't change when [owner] changes theirs. Keep this playlist in your library and the page will tell you when it changes. Tap its heart to remove it if you only want your copy." Use "the owner" when the name is unknown.
- **Unverified UI wording:** steps 2 to 4 come from one third-party guide (Android Authority, dated March 19, 2024), not from Spotify. I have not seen the current iPhone app. Richard checks them on the iPhone (see below) before the wording ships. If the app's menu differs, change the strings, not the logic.

**When a copy is linked** (and the copy id is in his current playlists):
- The `#dnote` line (via `paintDetailNote`, line 4555) shows: "You have a copy" · **Open your copy** (link button) · **Unlink** (link button).
- **Open your copy** calls `openDetail(copyItem)`, using `libraryPlaylist(copyId)`. That loads its song list the same way as any own playlist.
- The **Make a copy** button is replaced by nothing, so the view stays short.

### 4. Linking the copy

Add `matchCopies(data)`. Call it in `refresh()` (line 4798) right after `state.data = d`, before `renderList()`.

- **Prune:** drop any `lib-pl-copies` entry whose `copyId` is no longer one of his own playlists. `loadData` fails as a whole on errors, so a successful load is a full list and pruning is safe.
- **Update:** for each linked original that is still in his library, keep the stored `snap` and `count` as they were at link time. Don't overwrite them (they are the baseline for the change note).
- **Auto-link:** if `lib-copy-watch` exists, is under 24 hours old, and `known` is not `null`:
  - Take his own playlists whose id is not in `known` ("new since the tap").
  - Normalize names: lowercase, trim, collapse spaces.
  - If **exactly one** new playlist has the same normalized name as the original, link it. Store the original's `snap` and `count` from the watch time (copy them into the watch when it's written, from `d.item`). Clear the watch. Show a toast: "Linked your copy of “[name]”."
  - If none or more than one match, do nothing here. The manual prompt handles it.
- **Manual prompt:** in `paintDetailNote`, for an own playlist that is not linked, when a fresh watch exists and this playlist's id is not in `known` (or `known` is `null`), show: "Is this your copy of “[name]”?" · **Link it** · **No**.
  - **Link it** writes the link and clears the watch.
  - **No** adds this id to `known`, so the prompt doesn't come back for it.

The name the app gives a new copy is **unverified**. It may be the original's name, or something else. The manual prompt covers any name.

### 5. The copy's view

In `paintDetailNote`, for an own playlist that is a linked copy:
- "Copy of “[original name]” by [owner]" · **Open original** · **Unlink**.
- **Open original** calls `openDetail(rec)` with a playlist record built from the stored fields (`kind: 'playlist', id, name, uri, url, img, ownerId, sub`). The original is restricted, so `detailUrl` returns `null` and the view opens with **zero requests**. Prefer `libraryPlaylist(origId)` when it's still in the library.
- **Change note:** when the original is still in `state.data.playlists`, add "The original has changed since you copied it." if:
  - the stored `snap` and the current `snap` are both non-empty and differ, or
  - the stored `count` and the current `count` are both above 0 and differ.

  A changed snapshot can mean only the name or description changed, so the text says "changed", not "has new songs".
- When the original is no longer in his library, show no change note. The page doesn't spend a catalog request to check it.

### 6. Rows in lists

In `itemRow` (line 3593), for playlists only, add to the shown `sub` (and to `data-sub` for `paintRowLabel`):
- the original: " · You have a copy";
- the copy: " · Copy".

Use a helper `copySub(item)`. Don't change `mapPlaylist`'s `sub`, so pins and the cache keep their text. The page never hides either row. Richard removes the original with its heart if he wants only one.

### 7. Other areas

- `VERSION` (line 2571): `'v2.17 (<date>)'`.
- `README.md`: one line under the version history, and one sentence in the playlists section: "For a playlist you don't own, **Make a copy** shows how to copy it in the Spotify app; the page then lists your copy's songs, links it to the original on this phone, and says when the original has changed."
- Diagnostics: add one line with the count of linked copies (local only, no request).
- Collaborative playlists are listable today, so they never show **Make a copy**.

## Request cost

- **Make a copy, the steps, Open in Spotify, Link it, No, Unlink, Open original:** 0 requests.
- **Linking and the change note:** 0 new requests. They read the `/me/playlists` pages that `refresh()` already sends (group: **library**).
- **Open your copy:** the same `GET /playlists/{copy id}/items` any own playlist already sends. `coolGroup` puts a GET under `/playlists` in **catalog**, and `catMemo` keeps it for the visit. This is existing behavior, not new cost, but it does draw on the scarce catalog bucket (about 21 an hour). Only on tap, never in the background.
- **Player and search:** 0.
- No per-item fan-out. No background calls.

## Tests in a browser

Use the v2.16 method: extract both `<script>` blocks and run `node --check` on each. Serve the folder locally. Use a temporary mock page that injects localStorage (client id `0123456789abcdef0123456789abcdef`, a fake token, the full scope list) and mocks `window.fetch`. Count every fetch. Delete the mock page afterwards.

1. **Steps:** open a playlist owned by someone else. **Make a copy** shows under the note and **Show songs**. Tapping it shows the five steps, the note and **Open in Spotify** (href is the playlist's `open.spotify.com` URL). Fetch count unchanged.
2. **Embed stays open:** tap **Show songs**, then **Make a copy**. The same `iframe.sembed` element is still in the page, and its `src` didn't change.
3. **Watch:** after the tap, `lib-copy-watch` holds the original id, name, a time, and the ids of the own playlists in the mock library.
4. **Auto-link:** the next mocked `/me/playlists` adds one own playlist with the same name (different case and extra spaces). Tap Refresh. `lib-pl-copies` has the link, the watch is cleared, and the toast shows. Fetch count rises only by the usual library calls.
5. **Original's view:** shows "You have a copy" with **Open your copy**. Tapping it opens the copy and sends exactly one `/playlists/{copy id}/items` request.
6. **Copy's view:** shows "Copy of …" with **Open original**. Tapping it opens the restricted view with zero requests.
7. **No name match:** the new own playlist has another name. No auto-link. Its view shows "Is this your copy of …?". **Link it** links it. Repeat with **No**: the prompt doesn't come back.
8. **Two matches:** two new own playlists share the name. No auto-link. Each shows the prompt.
9. **Old watch:** set the watch's `at` to 25 hours ago. No auto-link and no prompt.
10. **`known` is null:** no auto-link, prompt still shows.
11. **Change note:** change the original's `snapshot_id` in the next `/me/playlists`. The copy's view shows the note. Repeat with the same snapshot and a different `items.total`. Repeat with `snapshot_id` missing and the same count: no note.
12. **Original removed:** drop the original from `/me/playlists`. The copy's view keeps "Copy of …" and **Open original**, with no change note and no extra request.
13. **Copy removed:** drop the copy from `/me/playlists`. The link is pruned, and the original's view shows **Make a copy** again.
14. **Rows:** the Playlists tab shows " · You have a copy" and " · Copy". Pins keep their stored text.
15. **Unlink:** from either view, the link is gone and both views go back to their normal state.
16. **Blocked storage:** make `localStorage` throw. The steps still show; nothing links; no page errors.
17. **Cool-off:** with `library` paused, Refresh sends nothing and no link is pruned.
18. **Widths and themes:** 375 px wide, light and dark. No sideways scroll.

## Checks only on the iPhone

Richard does these. I can't test his iPhone, his Spotify app or his account.

1. **The app steps (do this before the wording ships).** In the Spotify iPhone app, open someone else's playlist. Check that ⋯ under the title, then **Add to other playlist**, then **New playlist** makes a copy. Note the exact labels and the name the copy gets. If any label differs, tell me so the strings can change.
2. **Open in Spotify** opens the playlist in the app (after the usual brief Home screen on a cold start).
3. After copying and tapping **Refresh**, the copy appears and links (toast), or the prompt appears in the copy's view.
4. **Open your copy** lists the songs, and tapping one plays it on the phone.
5. The copy's cover and song count look right next to the original.
6. If a friend's playlist changes later, the copy's view shows the change note. (Only if he has such a playlist; otherwise skip.)
7. The Diagnostics request counter rises only by the usual library load after Refresh.
8. No new page errors in the Diagnostics report.

## Acceptance criteria

- Someone else's playlist shows **Make a copy**. Own and collaborative playlists don't.
- The steps open without any request, and without reloading an open embed.
- After Richard copies the playlist and taps Refresh, the copy is linked automatically when the name matches, or by one tap on **Link it** when it doesn't.
- The original's view offers **Open your copy**. The copy's view offers **Open original**, which sends no request.
- The copy's view says when the original has changed, using only data from the existing library load.
- Removing the copy in Spotify removes the link after the next Refresh.
- No new scope, no new sign-in, no background requests, no new catalog requests beyond opening a song list on tap.
- No suggested, related or browse content anywhere.
- Works at 375 px in light and dark mode.

## Risks and open questions

- **App wording is unverified.** The steps come from a 2024 third-party guide. The page's logic doesn't depend on them, only the text does. Richard's check 1 settles it.
- **The copy's name is unverified.** If the app gives copies a different name, auto-link never fires and Richard taps **Link it** once per copy. That is acceptable.
- **`snapshot_id` may be missing** from `/me/playlists` in Development Mode. Then the note relies on song count, which misses a same-size swap of songs.
- **The change note needs the original kept in his library.** The steps' note says this. Checking an unfollowed original would cost a catalog request, so the page doesn't.
- **The copy can't be synced.** The page can't read the original's songs, so it can't update the copy. Richard copies again if he wants the new songs; the new copy replaces the old link when he links it.
- **Links live on one phone.** Like pins, they don't follow him to another browser.
- **Value is modest.** Copying already works today with no code (#2a). If Richard wants less, ship the **S cut**: sections 3 (steps only, no link states), 7 and tests 1, 2, 16, 18. Skip sections 4 to 6 and `lib-pl-copies`.
- **Open question for Richard:** keep the original's row visible with " · You have a copy" (this spec), or hide the original from Home's "Your playlists" once a copy exists? This spec keeps it visible, because the original is where new songs from the owner show up first, and the row is cheap to ignore.

Source for the app steps: [Android Authority, "How to copy a playlist on Spotify" (March 19, 2024)](https://www.androidauthority.com/how-to-copy-playlist-spotify-3084058).
