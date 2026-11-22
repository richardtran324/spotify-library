# My Library — Spotify library page for iPhone

A one-file web page (`index.html`) that lists your Spotify playlists, saved albums, followed artists, recently played songs and Liked Songs, with no Home feed and no banners. You can also like and save items, queue songs, open song lists, control playback and choose the device.

- **Spotify already open on a device:** tapping an item starts it playing there, and you stay on the page.
- **Spotify not open:** tapping an item opens it in the Spotify app. On a fresh start the app may still show Home for a moment first.

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

- **Filters:** Playlists (with Liked Songs), Albums, **Artists** (artists you follow; tap one to play it), **Recent** (recently played songs, newest first, each song once; reloaded each time you pick it), All, and Search Spotify. The box above filters the current list by name.
- **Buttons on each row** (the row itself still plays the item, or opens it in Spotify):
  - **Heart:** like a song, or save an album or someone else's playlist. A filled heart means it's in your library. Removing something shows **Undo** for a few seconds. Your own playlists, artists and Liked Songs have no heart.
  - **+:** add a song to the queue. Spotify must be open on a device.
  - **›:** open the song list for an album, playlist or Liked Songs.
- **Song list:** shows the cover, **Play**, **Shuffle**, and the songs, 50 at a time (**Load more** for the rest). Tapping a song plays it in that album or playlist, so the following songs keep going. **Back** (or the phone's back swipe) returns to where you were in the list. Spotify only lets personal apps list the songs in playlists you own; for other playlists the page shows a note and you can still press Play.
- **Now Playing bar:** at the bottom while something plays: cover, song, artist, device, plus Shuffle, Previous, Play/Pause, Next and a heart for the current song. It checks every 10 seconds while the page is open on screen, and stops checking when you switch away.
- **Choosing a device:** tap the device name in the status line ("Playing on iPhone · Change") to see your open Spotify devices. Picking one moves playback there and makes it the device taps play on from then on. **Refresh** in that panel looks again.

## Notes

- Requires Spotify Premium (Spotify's rule for personal developer apps and for starting playback).
- Sign-in lasts about 6 months; then the page shows **Sign in** again.
- **Already using the page?** After you upload this version, a banner says **New features need one more sign-in**. Tap **Sign in again** once and approve on Spotify's page; it asks for the new permissions (saving to your library, followed artists, recently played). Everything else keeps working until you do.
- **Search Spotify** searches the whole catalog (songs, artists, albums, playlists; up to 10 of each, Spotify's limit for personal apps). Tap a result to play it the same way as library items.
- If Spotify doesn't let the page check which items are already saved, hearts start outlined and a tap saves the item.
- **Refresh** reloads your library and checks for an open Spotify device. The page also checks each time you come back to it.
- To update the page later, upload the new `index.html` to the same repo (it replaces the old one).
