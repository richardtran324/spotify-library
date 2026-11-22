# My Library — Spotify library page for iPhone

A one-file web page (`index.html`) that lists your Spotify playlists, saved albums, followed artists, saved podcasts, recently played songs and Liked Songs, with no Home feed and no banners. You can also like and save items, queue songs and episodes, open song and episode lists, control playback and choose the device.

- **Spotify already open on a device:** tapping an item starts it playing there, and you stay on the page.
- **Spotify not running:** the page remembers what you tapped. Press play in Control Center or on the lock screen and it starts as soon as Spotify wakes, without opening the app (see **When Spotify isn't running** below).

Nothing secret is stored in the file. Your sign-in stays in Safari on your phone. Spotify's Client ID identifies your app; it isn't a password.

## Setup (about 10 minutes, once)

### 1. Put the page on GitHub Pages (on your PC)

1. Sign in at github.com (create a free account if you don't have one).
2. Click **+** (top right) → **New repository**. Name it `spotify-library`, choose **Public**, click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in `index.html`, click **Commit changes**.
4. Go to **Settings** → **Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main` and `/ (root)`, then **Save**.
5. Wait a minute and refresh. GitHub shows your address, like `https://YOUR-USERNAME.github.io/spotify-library/`.

### 2. Register your app with Spotify

1. Go to developer.spotify.com/dashboard and sign in with your Spotify account. Accept the developer terms if asked.
2. Click **Create app**:
   - **App name:** My Library
   - **App description:** Personal library page
   - **Redirect URIs:** your GitHub Pages address from step 1.5, exactly, including the `https://` and the final `/`. Click **Add**.
   - **Which API/SDKs:** tick **Web API**.
   - Tick the terms box and click **Save**.
3. Open the app → **Settings**. You'll need the **Client ID** (32 letters and numbers) in the next step. Don't copy the Client secret; the page doesn't use it.

### 3. Sign in on your iPhone

1. Open your GitHub Pages address in **Safari** on the iPhone.
2. Check that the address shown on the setup screen matches the Redirect URI you entered.
3. Paste the Client ID and tap **Save and sign in with Spotify**. (To get the Client ID onto the phone, open the Spotify dashboard in Safari on the phone and copy it there.)
4. Approve access on Spotify's page. You return to your library.

Optional: Share → **Add to Home Screen**. A Home Screen icon keeps its own storage, so you'll sign in once more there. If taps from the Home Screen icon don't open Spotify, use the page in a Safari tab instead.

## Features

- **Filters:** Playlists (with Liked Songs), Albums, **Artists** (artists you follow; tap one to play it), **Podcasts** (see below), **Recent** (recently played songs, newest first, each song once; reloaded each time you pick it), All, and Search Spotify. The box above filters the current list by name.
- **Buttons on each row** (the row itself still plays the item, or opens it in Spotify):
  - **Heart:** like a song, or save an album or someone else's playlist. A filled heart means it's in your library. Removing something shows **Undo** for a few seconds. Your own playlists, artists and Liked Songs have no heart.
  - **+:** add a song to the queue. Spotify must be open on a device.
  - **›:** open the song list for an album, playlist or Liked Songs.
- **Song list:** shows the cover, **Play**, **Shuffle**, and the songs, 50 at a time (**Load more** for the rest). Tapping a song plays it in that album or playlist, so the following songs keep going. **Back** (or the phone's back swipe) returns to where you were in the list. Spotify only lets personal apps list the songs in playlists you own; for other playlists the page shows a note and you can still press Play.
- **Now Playing bar:** at the bottom while something plays: cover, song, artist, device, plus Shuffle, Previous, Play/Pause, Next and a heart for the current song. It checks every 10 seconds while the page is open on screen, and stops checking when you switch away.
  - **Tap the cover or song name** to open the **Now playing** panel. It lists what applies to what's playing:
    - **Open album · …** (songs): the album's song list.
    - **Open playlist · …** when you're playing from a playlist. Your own playlists open their song list. A playlist that isn't in your library is looked up by Spotify (one request, remembered until you reload); since Spotify only lets personal apps list songs in your own playlists, it opens with the usual note and a **Play** button.
    - **Open Liked Songs** when you're playing from Liked Songs.
    - **Open show · …** (episodes): the podcast's episode list.
    - **Open in Spotify:** the song or episode in the Spotify app.
    - **Close**, or tap outside the panel.
  - The first option is selected when the panel opens. **Back** from the song list returns to where you were, at the same scroll position. If you were already in a song list, the new one replaces it, so **Back** still returns to the list you started from.
- **Playing now:** in any song or episode list (albums, playlists, Liked Songs, Recent, search, podcasts), the song or episode that's playing shows its name in green with a small **Playing** label. It updates with the Now Playing check.
- **Choosing a device:** tap the device name in the status line ("Playing on iPhone · Change") to see your open Spotify devices. Picking one moves playback there and makes it the device taps play on from then on. **Refresh** in that panel looks again.

### Sorting

A row of **Sort** chips sits above most lists. The first chip is the order the page always used; the page remembers your choice separately for each list. The name filter works with any order.

- **Playlists:** Default (your library order), A–Z, Most songs. **Liked Songs** stays first.
- **Albums:** Recently saved, A–Z, Artist A–Z, Release date (newest first).
- **Artists:** Default, A–Z.
- **All:** Default (grouped by kind), A–Z (one list; **Liked Songs** and **Saved episodes** stay first).
- **Podcasts → Shows:** Recently updated, A–Z, Recently saved. **Saved episodes** stays first.
- **Podcasts → Latest:** Newest first, Oldest first, Show A–Z (each show's episodes newest first). The chips sit under **Play newest** / **Hide played**; **Play newest** always means the newest unplayed episode.
- **Song lists:** albums: Track order, A–Z, Artist A–Z. Playlists: Default, Title A–Z, Artist A–Z, Recently added. Liked Songs: Recently liked, Title A–Z, Artist A–Z. Podcasts: Newest, Oldest. Saved episodes: Recently saved, Newest, Oldest.
  - These sort only the songs loaded so far (50 per page). While more pages remain, a note says **Sorted within the songs loaded so far**; **Load more** adds the next page into the sorted list.
  - Tapping a song still plays it inside its album or playlist, so what plays next follows Spotify's order, not the sorted list.
- A–Z ignores a leading "The" and sorts numbers naturally (2 before 10). **Recent** and **Search Spotify** have no sort: they're a time log and a relevance order.

### Search Spotify

- Type at least 2 letters; the search runs half a second after you stop typing, or right away when you press **Search** on the keyboard.
- A row of small outlined chips under the main filters picks what to show: **All**, **Songs**, **Artists**, **Albums**, **Playlists**, **Podcasts**, **Episodes**. The page remembers your choice.
  - **All** shows each kind in its own group, the first 5 of each, with **See all songs** (or artists, albums, …) under each group to switch to that kind.
  - **One kind** shows a single list, 10 at a time (Spotify's limit). **Load more** adds the next 10, up to Spotify's limit of about 1,000 results; the button goes away when there are no more.
- Switching chips searches again for the same words, but results you've already seen this session come back without asking Spotify again. Reloading the page clears them.
- Rows work like everywhere else: tap to play, heart to save, **+** to queue, **›** to open the song list. Podcast rows open the episode list.

### Podcasts

- The **Podcasts** filter opens on a **Latest | Shows** switch. **Latest** (the default) is the newest episodes across all your saved podcasts; **Shows** is **Saved episodes** (the episodes you saved in Spotify) followed by the podcasts you follow, each with its episode count. **All** includes Saved episodes and your podcasts too.
- **Latest episodes:** the 50 newest episodes across your saved podcasts (the newest 5 from each), newest first. Each row shows the podcast, when it came out (**Today**, **Yesterday**, or the date) and the length, time left, or **Played**. A green dot marks an episode from the last 7 days that you haven't started.
  - **Play newest** starts the newest episode you haven't finished.
  - **Hide played** hides episodes you've finished; the page remembers the setting.
  - The list is saved on the phone and reloads from Spotify at most every 30 minutes, and only while the page is on screen. **Updated … ago** shows its age; **Refresh** next to it reloads now. Listening progress in this list updates on each reload. If some podcasts can't be loaded, the rest still show, with a note such as **Couldn't load 1 show**.
- **Tapping a podcast opens its episode list** (newest first, 50 at a time, **Load more** for the rest). Spotify doesn't let apps play a whole podcast, so the **Play** button at the top starts the newest episode you haven't finished. The heart removes the podcast from your library, with **Undo**.
- **Episode rows** show the podcast or release date and the length, or how much is left ("12 min left") or **Played**. Tapping an episode plays it and picks up where you left off. The heart saves it to Saved episodes; **+** adds it to the queue.
- **Search Spotify** also finds podcasts and episodes, shown under **Podcasts** and **Episodes**.
- If an episode won't play from the page, the message offers **Open in Spotify** for that episode.

### When Spotify isn't running

When the iPhone's Spotify app has been idle for a while, Spotify stops listing it as a device, so the page has nothing to play on. The page remembers what you tapped and plays it as soon as Spotify is back. Choose how in **Diagnostics → Settings → When Spotify isn't running**:

- **Wait for me to press play (no app)** (default): nothing opens. The line under the status says **Press play in Control Center or on the lock screen. "…" starts as soon as Spotify wakes.** Pressing play there starts Spotify in the background, the iPhone shows up as a device, and the page plays what you tapped. For a moment you may hear whatever Spotify last played before it switches; that's normal.
  - The page checks every second for up to a minute while it's on screen. If you leave the page, it pauses and starts a fresh minute when you come back.
  - **Open Spotify instead** on that line opens the item in the Spotify app (the next option) for this one tap. **Cancel** drops the tap.
  - If Spotify doesn't wake within the minute, the line says **Spotify didn't wake up yet** with **Try again** (one more minute) and **Open Spotify instead**. After a second miss the page drops the tap and asks you to start something in Spotify, then tap again. It never keeps retrying on its own.
  - Starting playback anywhere else also counts: if the Now Playing check sees Spotify playing while a tap is waiting, the page plays the tap.
- **Open the Spotify app:** the Spotify app opens on what you tapped. Switch back to Safari (swipe along the bottom edge or tap "◀ Safari" at the top left). A line under the status says **Starting "…"** while the page looks for your phone for up to 20 seconds, then plays what you tapped. If Spotify doesn't show up in time, you get **Spotify didn't show up yet** with a **Try again** button.
- **Run my Wake Spotify shortcut:** a tap runs your iPhone Shortcut named exactly **Wake Spotify**, which opens Spotify, waits, and comes back to the page at `https://richardtran324.github.io/spotify-library/?wake=1`; the page then plays the item without you switching back. The shortcut steps are in a separate guide. Safari may ask whether to open Shortcuts; tap **Open**.

A tap is remembered for 3 minutes; after that the page forgets it. With the two options that open the app, if the page hasn't checked for devices recently when you tap, it checks first and then shows a button to wake Spotify, because iPhone Safari may not open another app after the page has been waiting on Spotify. (Waiting needs no button: nothing opens.) If you had picked the app or shortcut option in an earlier version, that choice stays.

**Diagnostics** shows **Wake mode** (wait, link or shortcut), **Pending** (the remembered tap, its mode and how long ago, or none) and the **Latest episodes** cache.

## Notes

- Requires Spotify Premium (Spotify's rule for personal developer apps and for starting playback).
- Sign-in lasts about 6 months; then the page shows **Sign in** again.
- **Already using the page?** After you upload this version, a banner says **New features need one more sign-in**. Tap **Sign in again** once and approve on Spotify's page; it asks for the new permissions (saving to your library, followed artists, recently played). Everything else keeps working until you do.
- **Updating to v2.2 (podcasts):** the banner appears once more. Tap **Sign in again** and approve; it adds one permission, for your podcast listening progress (so episodes resume and show "min left" or **Played**). Until then the Podcasts list still loads, but Saved episodes and resume positions may be missing.
- **Search Spotify** searches the whole catalog (songs, artists, albums, playlists, podcasts, episodes). Spotify returns at most 10 of each kind per request; pick one kind with the chips to page through more (see **Search Spotify** above). Tap a result to play it the same way as library items.
- **v2.5** adds the **Now playing** panel and the search chips. It needs no new permissions, so no extra sign-in.
- **v2.8** adds the **Sort** chips (see **Sorting** above). No new permissions.
- If Spotify doesn't let the page check which items are already saved, hearts start outlined and a tap saves the item.
- **Refresh** reloads your library and checks for an open Spotify device. The page also checks each time you come back to it.
- To update the page later, upload the new `index.html` to the same repo (it replaces the old one).
