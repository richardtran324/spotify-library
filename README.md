# My Library — Spotify library page for iPhone

A one-file web page (`index.html`) that lists your Spotify playlists, saved albums, followed artists, saved podcasts, recently played songs and Liked Songs, with no Home feed and no banners. You can also like and save items, queue songs and episodes, open song and episode lists, control playback and choose the device.

- **Spotify already open on a device:** tapping an item starts it playing there, and you stay on the page.
- **Spotify not open:** the page wakes Spotify for you, then plays what you tapped when you come back (see **Starting Spotify from the page** below).

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
- **Choosing a device:** tap the device name in the status line ("Playing on iPhone · Change") to see your open Spotify devices. Picking one moves playback there and makes it the device taps play on from then on. **Refresh** in that panel looks again.

### Podcasts

- The **Podcasts** filter shows **Saved episodes** first (the episodes you saved in Spotify), then the podcasts you follow, each with its episode count. **All** includes them too.
- **Tapping a podcast opens its episode list** (newest first, 50 at a time, **Load more** for the rest). Spotify doesn't let apps play a whole podcast, so the **Play** button at the top starts the newest episode you haven't finished. The heart removes the podcast from your library, with **Undo**.
- **Episode rows** show the podcast or release date and the length, or how much is left ("12 min left") or **Played**. Tapping an episode plays it and picks up where you left off. The heart saves it to Saved episodes; **+** adds it to the queue.
- **Search Spotify** also finds podcasts and episodes, shown under **Podcasts** and **Episodes**.
- If an episode won't play from the page, the message offers **Open in Spotify** for that episode.

### Starting Spotify from the page

When the iPhone's Spotify app has been idle for a while, Spotify stops listing it as a device, so the page has nothing to play on. Instead of only showing a message, the page now remembers what you tapped and wakes Spotify:

1. You tap a song, episode, album, playlist, artist or Liked Songs while no device is open.
2. The page opens Spotify (one of two ways, below).
3. When you're back on the page, a line under the status says **Starting "…"** while it looks for your phone for up to 15 seconds. As soon as Spotify shows up, it plays what you tapped and says **Playing …**.
4. If Spotify doesn't show up in time, you get **Spotify didn't show up yet** with a **Try again** button. The page never keeps retrying on its own. **Cancel** on the status line drops the tap.

A tap is remembered for 3 minutes; after that the page forgets it. If the page hasn't checked for devices recently when you tap, it checks first and then shows a button to wake Spotify, because iPhone Safari may not open another app after the page has been waiting on Spotify.

**Two ways to wake Spotify** (choose in **Diagnostics → Settings**):

- **Open the item in Spotify** (default): the Spotify app opens on what you tapped. Switch back to Safari (swipe along the bottom edge or tap "◀ Safari" at the top left) and the page plays it.
- **Use my Wake Spotify shortcut:** turn on **Use my Wake Spotify shortcut**. A tap then runs your iPhone Shortcut named exactly **Wake Spotify**, which opens Spotify, waits, and comes back to the page at `https://richardtran324.github.io/spotify-library/?wake=1`; the page then plays the item without you switching back. The shortcut steps are in a separate guide. The page only uses the shortcut when this setting is on. Safari may ask whether to open Shortcuts; tap **Open**.

**Diagnostics** shows **Wake mode** (link or shortcut) and **Pending** (the remembered tap and how long ago, or none).

## Notes

- Requires Spotify Premium (Spotify's rule for personal developer apps and for starting playback).
- Sign-in lasts about 6 months; then the page shows **Sign in** again.
- **Already using the page?** After you upload this version, a banner says **New features need one more sign-in**. Tap **Sign in again** once and approve on Spotify's page; it asks for the new permissions (saving to your library, followed artists, recently played). Everything else keeps working until you do.
- **Updating to v2.2 (podcasts):** the banner appears once more. Tap **Sign in again** and approve; it adds one permission, for your podcast listening progress (so episodes resume and show "min left" or **Played**). Until then the Podcasts list still loads, but Saved episodes and resume positions may be missing.
- **Search Spotify** searches the whole catalog (songs, artists, albums, playlists, podcasts, episodes; up to 10 of each, Spotify's limit for personal apps). Tap a result to play it the same way as library items.
- If Spotify doesn't let the page check which items are already saved, hearts start outlined and a tap saves the item.
- **Refresh** reloads your library and checks for an open Spotify device. The page also checks each time you come back to it.
- To update the page later, upload the new `index.html` to the same repo (it replaces the old one).
