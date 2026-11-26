# Build spec: Spotify Library page, "Show songs" for other people's playlists (v2.16)

(Copied verbatim from the Duet Bridge report "Build spec for Duet: Spotify Library "Show songs" embed (v2.16), use Duet credits", sent by Richard's Claude Code session on 2026-11-25. Richard confirmed option #1 in chat on 2026-11-24 11:15 PM PT.)

**For:** Claude Duet, to execute on its own cloud computer.
**Owner:** Richard. **Written:** 2026-11-24, from the Spotify library session's brief.
**Repo:** https://github.com/richardtran324/spotify-library (public). **Live site:** https://richardtran324.github.io/spotify-library/

## 0. Billing rules (read first)
This work should be paid for by Richard's weekly **Claude Duet credits** ($500 a week through Dec 31, 2026), not by his regular Claude plan usage. The credits cover Duet's own work, including coding. They do **not** cover the following, so don't use them:
- **No Claude Code sessions.** Do not call the Duet Bridge tools `start_session`, `send_message` or `send_job`. Claude Code sessions that Duet starts aren't covered by the credits. Do all the work yourself, on your own cloud computer and browser, using Richard's connectors.
- **No Cowork, fast mode or Claude Fable.**
- **Keep context small.** Don't use long context that needs usage credits. `index.html` is about 4,000 lines: search it for the parts you need instead of reading the whole file repeatedly.
- **If the credits run out mid-task,** stop and tell Richard, rather than continuing on his plan limits. He can check the balance at claude.ai > Settings > Usage.

## 1. Before you build
1. **Confirm the option with Richard.** The brief offered three options and he hasn't chosen one. This spec builds **option #1**. Ask him: "Build option #1, Show songs via Spotify's embed? (Alternatives: #2, duplicate the playlist in the Spotify app, which needs no build; #3, show the player queue, which is not recommended.)" Build only on a yes.
2. **Save this spec** where Richard and his Claude sessions can open it later (see section 7). Report where you put it.

## 2. Problem
The page runs in Spotify's Development Mode. In that mode the Web API only returns a playlist's songs (`GET /playlists/{id}/items`) for playlists Richard owns or collaborates on. For anyone else's playlist, the detail view shows this note: "Spotify only lets personal apps list songs in your own playlists. Tap play to hear this one." Richard wants to see the songs anyway.

## 3. What to build (option #1)
In the playlist detail view, **only for playlists Richard doesn't own or collaborate on:**
- Keep the existing note, and add a **"Show songs"** button under it.
- When tapped, load Spotify's official embed iframe under the header: `https://open.spotify.com/embed/playlist/<playlist id>`. Verify the URL format and parameters first (see section 5).
- **Load it lazily:** nothing loads until the button is tapped, and it never autoplays.
- Use the embed's **theme parameter** if Spotify offers one, so it matches the page's light or dark mode.
- **Size:** set the height so the list is usable at 375 px wide, with no sideways scrolling on the page.
- **Header buttons unchanged:** Play and Shuffle in the header keep using the Web API (`context_uri`) and play on Richard's phone.
- **Tell Richard about the preview limit:** tapping a song inside the embed plays a 30-second preview inside the embed, because he isn't signed in to Spotify in Safari. It doesn't play on his phone's Spotify app.
- **Own playlists are unchanged:** native list, sorting, tap-to-play.
- **Bump the version** to `VERSION = 'v2.16 (<date>)'`, and add a line to `README.md`.

## 4. Codebase facts
- **`index.html`** is a single-file app: plain ES5-style JavaScript in **two** `<script>` blocks (a small head script for the theme, plus the main IIFE). It uses no libraries and has light/dark CSS tokens. The folder also holds `README.md`, the icons and `manifest.webmanifest`.
- **Auth:** Authorization Code + PKCE, no client secret, tokens in localStorage. This feature needs **no new scope**. Adding a scope would force Richard to sign in again, so don't.
- **Rate-limit handling:** the page has per-group cool-off (player, library, search, catalog). Keep it exactly as it is.

## 5. Constraints and gotchas
- **Richard's rule:** no ads and no suggested or recommended content, only easy shortcuts. Never add Spotify browse, featured, related or top-tracks content. The embed shows only the playlist's own songs; make sure no "more like this" section appears. If it does, tell Richard rather than shipping it.
- **API quota is scarce:**
  - The catalog bucket hit QUOTA_EXCEEDED at about 21 requests an hour.
  - This feature must make **zero new Web API requests**: the embed is an iframe, not an API call.
  - Never fan out per-item calls.
  - The Retry-After header can't be read cross-origin.
- **Endpoints removed since Feb 2026:**
  - Search is capped at 10 results.
  - `/playlists/{id}/tracks` is gone; use `/items`, which works for own playlists only.
  - Batch GETs, browse/new-releases and artist top tracks are gone.
  - The popularity and followers fields are gone.
- **Verify before building:** check the embed URL format and parameters against Spotify's current embed documentation. Also check that the embed shows the full song list at phone width; use your browser at 375 px, since you can't test on his iPhone.

## 6. Test, then deliver
**Tests:**
1. Run `node --check` on each `<script>` block, extracted to its own file.
2. Serve the folder locally on your computer (for example `python -m http.server`) and use a temporary mock page. The mock should:
   - inject localStorage with client id `0123456789abcdef0123456789abcdef`, a fake token and the full scope list;
   - mock `window.fetch`, returning a playlist owned by someone else.

   Check that the button appears, that the embed loads only on tap, and that the mocked fetch sees **no new request** when the embed loads. Check light and dark mode, and 375 px width. Delete the mock page afterwards.

**Deliver as a pull request. Don't publish:**
- Commit to a new branch, `duet/show-songs-embed`, and open a **pull request** into `main`.
- **Don't merge, and don't push to `main`:** `main` is the live site, and Richard reviews and publishes it himself.
- If the GitHub connector can't push or open pull requests, save the changed `index.html` and `README.md` (and a diff) with the spec in section 7, and tell Richard.

**Acceptance criteria.** Richard checks these on his iPhone after publishing:
- Someone else's playlist shows the note plus a "Show songs" button. Tapping it shows the song list within about 2 seconds and fits 375 px.
- The Diagnostics request counter doesn't change.
- Header Play and Shuffle still play on his phone.
- Own playlists are unchanged.
- Nothing loads before the tap, and nothing autoplays.
- Works in light and dark mode.
- The Diagnostics report shows no new page errors.

## 7. Where to save things, and how to report back
- **The spec, first choice:** add this file as `specs/show-songs-embed.md` on the `duet/show-songs-embed` branch, so it travels with the pull request.
- **The spec, if GitHub writes aren't possible:** create a Gmail **draft** (don't send it) to Richard's own address, with the subject "[Duet spec] Spotify Show songs embed v2.16" and this spec in the body.
- **Report back:** use the Duet Bridge `post_report` tool (it's covered: it only writes to the mailbox and doesn't start Claude Code). Include:
  - where you saved the spec;
  - the pull request link, or where the changed files are;
  - what you tested and what you couldn't test;
  - anything Richard needs to decide.

## 8. Not in scope
- Publishing to the live site.
- Updating Richard's iPhone setup page, which is a Claude artifact. His local Claude session will do that after he approves the build.
- Options #2 and #3.
