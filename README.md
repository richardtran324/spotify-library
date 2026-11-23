# My Library — Spotify library page for iPhone

A one-file web page (`index.html`) that lists your Spotify playlists, saved albums, followed artists, saved podcasts, recently played songs and Liked Songs, with no Home feed and no banners. You can also like and save items, queue songs and episodes, open song and episode lists, control playback and choose the device.

- **Tap an item:**
  - **Albums, playlists (yours and other people's), Liked Songs, Saved episodes and podcasts** open their song or episode list. **Play** (and **Shuffle** for song lists) sits at the top of that list, so playing is one more tap. Spotify doesn't let personal apps list the songs in other people's playlists; those open with a short note and **Play**.
  - **Artists** open the artist page (see **Artist page** below).
  - **Songs and episodes** play. Inside an album or playlist a song plays in that album or playlist, so the next songs keep going; an episode picks up where you left off.
  - This works the same on Home, in every list, in Search Spotify results and in Pinned.
- **Spotify already open on a device:** playing starts there, and you stay on the page.
- **Spotify not running:** the page remembers what you asked to play. Press play in Control Center or on the lock screen and it starts as soon as Spotify wakes, without opening the app (see **When Spotify isn't running** below).

Nothing secret is stored in the file. Your sign-in stays in Safari on your phone. Spotify's Client ID identifies your app; it isn't a password.

## Setup (about 10 minutes, once)

### 1. Put the page on GitHub Pages (on your PC)

1. Sign in at github.com (create a free account if you don't have one).
2. Click **+** (top right) → **New repository**. Name it `spotify-library`, choose **Public**, click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in `index.html` together with `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `manifest.webmanifest` (the Home Screen icon), click **Commit changes**.
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

Optional: Share → **Add to Home Screen**. The page brings its own icon (`apple-touch-icon.png`) and name. A Home Screen icon keeps its own storage, so you'll sign in once more there. If taps from the Home Screen icon don't open Spotify, use the page in a Safari tab instead.

## Features

- **Filters:** **Home** (the first chip and the starting view; see **Home** below), Playlists (with Liked Songs), Albums, **Artists** (artists you follow; tap one to open its artist page), **Podcasts** (see below), **Recent** (recently played songs, each song once, mixed with podcast episodes from the page's own history (see **Podcast listening history**), newest first; songs reload each time you pick it), All, and Search Spotify. The box above filters the current list by name. The page remembers the filter you picked last; if you never picked one, it opens on Home.
- **Buttons on each row** (the row itself opens or plays the item, as above):
  - **Heart:** like a song, or save an album or someone else's playlist. A filled heart means it's in your library. Removing something shows **Undo** for a few seconds. Your own playlists, artists and Liked Songs have no heart.
  - **+:** add a song to the queue. Spotify must be open on a device.
  - There's no **›** button any more (v2.12): the row itself opens albums, playlists, podcasts and artists.
- **Pin:** the pin button on playlist, album, artist and podcast rows (in your library and in search results) keeps that item in a **Pinned** section at the top of its own filter (Playlists, Albums, Artists, Podcasts → Shows) and of All, whatever the sort; the rest of the list sorts as before. Tap it again to unpin. Up to 30 pins. Pins are stored only on this phone (in this browser) and are never sent to Spotify.
- **Song list:** shows the cover, **Play**, **Shuffle**, and the songs, 50 at a time (**Load more** for the rest). Under the name, a line gives the total once everything is loaded, such as **12 songs · 48 min** or **1 hr 5 min**; while more pages remain it says **50 of 230 songs loaded** instead (no length, since it would cover only part of the list). Tapping a song plays it in that album or playlist, so the following songs keep going. **Back** (or the phone's back swipe) returns to where you were in the list. Spotify only lets personal apps list the songs in playlists you own; for other playlists the page shows a note and you can still press Play.
- **Artist page:** the artist's picture and name, a **Play** button (plays the artist in Spotify, as tapping an artist used to) with the pin button beside it, and the artist's releases in three groups, **Albums**, **Singles & EPs** and **Compilations**, each newest first. Releases load 10 at a time (Spotify's limit); **Load more** adds the next 10 and puts them in their groups. Under the name, a line says **10 of 37 releases loaded**, or **37 releases** once all are in. Tap a release to open its song list; **Back** returns to the artist page at the same spot, and **Back** again to where you started. There are no top songs or related artists: Spotify no longer gives personal apps top songs, and the page shows nothing Spotify suggests.
- **Now Playing bar:** at the bottom while something plays: cover, song, artist, device, an **Up next** button, a heart for the current song, and Shuffle, Previous, Play/Pause, Next and **Repeat**. It checks every 10 seconds while the page is open on screen, and stops checking when you switch away.
  - **Tap the cover or song name** to open the full **Now Playing** screen (see below).
  - When Spotify goes to sleep after you pause, the bar stays, shows the song as paused, and says **Spotify is asleep. Press play to wake it.** (see **When Spotify goes to sleep** below).
- **Now Playing screen:** slides up over the page. It shows a large cover, the title, the artist or podcast, and a heart.
  - **Progress bar** with time played and time left. It moves along on its own between checks. Drag it, or tap anywhere on it, to jump there; the page tells Spotify when you let go.
  - **Shuffle, Previous, Play/Pause, Next, Repeat.** Repeat cycles **off → all** (the album or playlist) **→ one** (this song) **→ off**; it's green while on and shows a small 1 for **one**.
  - **Episodes** also get **Back 15 s** and **Forward 30 s**.
  - **Volume** slider, only when the device lets apps change its volume (an iPhone usually doesn't; a computer or speaker usually does).
  - **Playing on … · Change** opens the device list.
  - Buttons for what applies to what's playing:
    - **Open album · …** (songs): the album's song list.
    - **Open playlist · …** when you're playing from a playlist. Your own playlists open their song list. A playlist that isn't in your library is looked up by Spotify (one request, remembered until you reload); since Spotify only lets personal apps list songs in your own playlists, it opens with the usual note and a **Play** button.
    - **Open Liked Songs** when you're playing from Liked Songs.
    - **Open show · …** (episodes): the podcast's episode list.
    - **Open in Spotify:** the song or episode in the Spotify app.
  - **Up next** (top right) opens the queue (see below).
  - Close with the down arrow at the top left, by swiping down from the top of the screen, or with Escape on a keyboard.
  - While this screen is open and on screen, the page checks what's playing every 5 seconds instead of 10. Nothing is checked while the page is in the background.
  - **Back** from a song list you opened here returns to where you were, at the same scroll position. If you were already in a song list, the new one replaces it, so **Back** still returns to the list you started from. From an artist page, the song list opens on top of it, so **Back** returns to the artist.
- **Up next:** opens from the Now Playing screen or the bar. It asks Spotify once for the queue each time it opens (**Refresh** asks again) and shows what's playing and what comes next. You can't reorder it or play from it here; Spotify doesn't let apps reorder the queue.
  - Spotify adds its own picks after your queue (autoplay) and doesn't say which songs are which. So the page remembers what you added with **+** on this page during the last 24 hours, and **Hide songs Spotify adds after my queue** (on by default, the switch at the top) shows only those, with the note **Spotify may add its own picks after these; they're hidden.** Turn it off to see everything; later songs may then be Spotify's picks.
  - Songs you added in the Spotify app itself, or more than 24 hours ago, are hidden while the switch is on.
- **Playing now:** in any song or episode list (albums, playlists, Liked Songs, Recent, search, podcasts), the song or episode that's playing shows its name in green with a small **Playing** label. It updates with the Now Playing check.
- **Choosing a device:** tap the device name in the status line ("Playing on iPhone · Change") to see your open Spotify devices. Picking one moves playback there and makes it the device taps play on from then on. **Refresh** in that panel looks again.

### Home

Home is a shortcuts page made only from your own things the page already loads. Nothing on it is suggested by Spotify. Besides recently played, its only extra requests are the episode progress checks described under **Podcasts → Fresh listening progress**. From the top:

- **Liked Songs** as a large row: tap it to open the song list (Play and Shuffle are at its top).
- **Pinned:** everything you pinned (playlists, albums, artists, podcasts), as a row of covers you swipe sideways, in the order you pinned them. A tap does the same as in its own tab: playlists, albums and podcasts open their list, artists open the artist page.
- **Continue listening:** the episodes you've started, the same row as on Podcasts. A tap picks the episode up where you left off.
- **Jump back in:** your last 8 albums from Recently played (one card per album) and podcasts you listened to (one card per podcast), newest first. Each card shows the album (with its artist) or the podcast (with the newest episode you heard).
  - **Tap the card** to open that album's song list or the podcast's episode list.
  - **The round play button** on the cover plays the song you last heard from that album, inside the album, playlist or Liked Songs you played it from, so the next songs keep going; on a podcast card it picks the episode up where you left off.
  - **See all** opens **Recent**. Home asks Spotify for recently played at most once every 10 minutes, and only while Home is on screen; podcasts come from the page's own history (see **Podcast listening history**).
- **Latest episodes:** the newest 5 from the Latest episodes list (Hide played applies). **See all** opens **Podcasts → Latest**.
- **Your playlists:** the first 6 in the order picked on the Playlists tab, leaving out pinned ones (they're already above). **See all** opens **Playlists**.

A section is hidden when it has nothing in it. Home has no Sort chips. The name box works on Home too: it filters every section, and while you type, **Jump back in**, **Latest episodes** and **Your playlists** look through all their items, not only the first few. For your whole library, use **All**.

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
- **Search Spotify, one kind picked:** Best match (Spotify's order), A–Z, plus **Newest** for albums and episodes and **Most songs** for playlists. Each kind remembers its own choice. While more results remain, a note says **Sorted within the results loaded so far**.
- **Pinned** items always stay in their own section at the top, in the order you pinned them.
- A–Z ignores a leading "The" and sorts numbers naturally (2 before 10). **Recent** and Search Spotify's **All** have no sort: they're a time log and a relevance order.

### Search Spotify

- Type at least 2 letters; the search runs half a second after you stop typing, or right away when you press **Search** on the keyboard.
- A row of small outlined chips under the main filters picks what to show: **All**, **Songs**, **Artists**, **Albums**, **Playlists**, **Podcasts**, **Episodes**. The page remembers your choice.
  - **All** shows each kind in its own group, the first 5 of each, with **See all songs** (or artists, albums, …) under each group to switch to that kind.
  - **One kind** shows a single list, 10 at a time (Spotify's limit). **Load more** adds the next 10, up to Spotify's limit of about 1,000 results; the button goes away when there are no more.
- **Recent searches:** while the box is empty, the last 8 searches you ran show as chips. Tap one to run it again with the chip that's picked; **×** removes one; **Clear** removes them all. A search is remembered once it actually runs (2 letters or more). Typing that keeps going within 30 seconds ("ta", then "taylor") keeps only the latest, and the same words in different capitals count once. They're stored only on this phone.
- **Show first in All:** **Diagnostics → Settings → Search Spotify: show first in All** picks which group comes first (Songs by default); the others keep their usual order.
- Switching chips searches again for the same words, but results you've already seen this session come back without asking Spotify again. Reloading the page clears them.
- Rows work like everywhere else: songs and episodes play; albums, playlists and podcasts open their list; artists open the artist page. Heart saves, **+** queues.

### Podcasts

- **Continue listening:** at the top of Podcasts (both Latest and Shows), a short row of up to 10 episodes you've started but not finished, with the time left. Tap one to pick up where you left off. It combines the page's podcast history, the Latest episodes list, and Saved episodes or a podcast's episode list once you've opened them this session; for each episode the most recent information wins. The episode you listened to most recently comes first; episodes the page never saw playing follow, newest release first. The row is hidden when there's nothing to resume.
- **Fresh listening progress:** when Home or Podcasts comes on screen (and on **Refresh**), the page asks Spotify for the current resume point of up to 8 episodes (the ones you listened to most recently, then those in Continue listening), 4 at a time, at most once every 2 minutes and never while the page is in the background. That updates **Continue listening**, the Latest list, **Recent** and **Jump back in** without waiting for the 30-minute Latest reload, including progress you made in the Spotify app.
- The **Podcasts** filter opens on a **Latest | Shows** switch. **Latest** (the default) is the newest episodes across all your saved podcasts; **Shows** is **Saved episodes** (the episodes you saved in Spotify) followed by the podcasts you follow, each with its episode count. **All** includes Saved episodes and your podcasts too.
- **Latest episodes:** the 50 newest episodes across your saved podcasts (the newest 5 from each), newest first. Each row shows the podcast, when it came out (**Today**, **Yesterday**, or the date) and the length, time left, or **Played**. A green dot marks an episode from the last 7 days that you haven't started.
  - **Play newest** starts the newest episode you haven't finished.
  - **Hide played** hides episodes you've finished; the page remembers the setting.
  - The list is saved on the phone and reloads from Spotify at most every 30 minutes, and only while the page is on screen. **Updated … ago** shows its age; **Refresh** next to it reloads now. Listening progress in this list updates on each reload, and in between from what the page sees playing and from the 2-minute progress check (see **Fresh listening progress**). If some podcasts can't be loaded, the rest still show, with a note such as **Couldn't load 1 show**.
- **Tapping a podcast opens its episode list** (newest first, 50 at a time, **Load more** for the rest). Spotify doesn't let apps play a whole podcast, so the **Play** button at the top starts the newest episode you haven't finished. The heart removes the podcast from your library, with **Undo**.
- **Episode rows** show the podcast or release date and the length, or how much is left ("12 min left") or **Played**. Tapping an episode plays it and picks up where you left off. The heart saves it to Saved episodes; **+** adds it to the queue.
- **Search Spotify** also finds podcasts and episodes, shown under **Podcasts** and **Episodes**.
- If an episode won't play from the page, the message offers **Open in Spotify** for that episode.

### Podcast listening history

Spotify's recently played list for apps leaves out podcast episodes (its reference says it "doesn't support podcast episodes"), so **Recent** and **Jump back in** used to show songs only. The page now keeps its own list of the episodes you listen to:

- Whenever the Now Playing check sees an episode (or you start one from the page), it's added to the top of the list with its podcast, length, where you are in it and when you last heard it. While it plays, the position updates with each check. One entry per episode, at most 60, and anything older than 60 days drops off. It's stored only on this phone (in this browser) and never sent to Spotify; signing out doesn't clear it.
- An episode counts as **Played** once you're within its last minute (or Spotify says it's finished).
- **Recent** lists these episodes among your songs by time: **Episode · podcast · 12 min ago · 34 min left** (or **Played**). Tap one to pick up where you left off.
- **It only covers listening the page saw.** The page checks what's playing only while it's open on screen. An episode you play entirely in the Spotify app while the page is closed won't appear in the history until the page sees it playing. Its progress still reaches **Continue listening** and the Latest list through Spotify's resume points (the 2-minute check above, or the 30-minute Latest reload), as long as it's one of those episodes.

**Diagnostics** shows **Podcast history** (how many episodes, the newest and when you heard it) and when **Resume points** were last refreshed.

### When Spotify goes to sleep

After you pause, the iPhone's Spotify app stops being listed as a device within seconds to minutes, and Spotify then reports nothing playing. The page no longer treats that as the end:

- The bar and the Now Playing screen keep the last song or episode, shown as **paused** where it stopped, with a small line: **Spotify is asleep. Press play to wake it.** The Now Playing screen stays open.
- **Play** (on the bar or the Now Playing screen) picks up at that spot. If Spotify is open on a device, it plays right away. If not, it follows your **When Spotify isn't running** setting; with the default, the line changes to **Press play in Control Center or on the lock screen. It picks up at 1:23.** and the page plays it once Spotify wakes, one time only. A song played from an album, playlist or Liked Songs continues inside it; a song from an artist and an episode play on their own, at the same spot.
- **Next, Previous, Shuffle and Repeat** do nothing while Spotify is asleep and say **Press play first to wake Spotify.** Dragging the progress bar only moves the spot that Play starts from.
- If Spotify answers that the device is gone while you use the controls, the page switches to this asleep view instead of showing an error.
- The last playback is kept on this phone for 6 hours, so it is still there after a reload. Signing out clears it. After 6 hours without playback, the bar goes away as before.

**Diagnostics** shows **Player** (playing, paused or idle (asleep)) and how old the last playback is.

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

**Diagnostics** shows **Wake mode** (wait, link or shortcut), **Pending** (the remembered tap, its mode and how long ago, or none), **Appearance**, how many pins, queued songs and recent searches the page is keeping, and the **Latest episodes** cache.

### Appearance

**Diagnostics → Settings → Appearance:** **Match phone** (default), **Light** or **Dark**. Light and Dark apply right away and override the phone's setting.

## Notes

- Requires Spotify Premium (Spotify's rule for personal developer apps and for starting playback).
- Sign-in lasts about 6 months; then the page shows **Sign in** again.
- **Already using the page?** After you upload this version, a banner says **New features need one more sign-in**. Tap **Sign in again** once and approve on Spotify's page; it asks for the new permissions (saving to your library, followed artists, recently played). Everything else keeps working until you do.
- **Updating to v2.2 (podcasts):** the banner appears once more. Tap **Sign in again** and approve; it adds one permission, for your podcast listening progress (so episodes resume and show "min left" or **Played**). Until then the Podcasts list still loads, but Saved episodes and resume positions may be missing.
- **Search Spotify** searches the whole catalog (songs, artists, albums, playlists, podcasts, episodes). Spotify returns at most 10 of each kind per request; pick one kind with the chips to page through more (see **Search Spotify** above). Tap a result the same way as library items: songs and episodes play, everything else opens.
- **v2.5** adds the **Now playing** panel and the search chips. It needs no new permissions, so no extra sign-in.
- **v2.8** adds the **Sort** chips (see **Sorting** above). No new permissions.
- **v2.9** adds the Now Playing screen, **Up next**, **Continue listening**, pins, recent searches, Appearance, and sorting in Search Spotify. **Up next** needs one more permission (Spotify requires "currently playing" access to read the queue), so the **New features need one more sign-in** banner appears once more. Tap **Sign in again** and approve. Until then everything else works; if Spotify refuses the queue, **Up next** shows a **Sign in again** button instead.
- **v2.10** adds **Home** and keeps the last song on screen when Spotify goes to sleep after a pause (see **When Spotify goes to sleep**). No new permissions.
- **v2.11** adds the podcast listening history (podcasts in **Recent** and **Jump back in**), fresher **Continue listening** progress, and orders **Continue listening** by when you last listened (see **Podcast listening history**). No new permissions.
- **v2.12** changes taps: albums, playlists, Liked Songs, Saved episodes and podcasts open their list instead of playing (Play is at the top), artists open the new artist page, and songs and episodes still play. The **›** button is gone. Jump back in cards open their album or podcast, with a play button on the cover. No new permissions.
- If Spotify doesn't let the page check which items are already saved, hearts start outlined and a tap saves the item.
- **Refresh** reloads your library and checks for an open Spotify device. The page also checks each time you come back to it.
- To update the page later, upload the new `index.html` to the same repo (it replaces the old one).
