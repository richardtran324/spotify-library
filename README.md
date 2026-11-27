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
- **Song list:** shows the cover, **Play**, **Shuffle**, and the songs, 50 at a time (**Load more** for the rest). Under the name, a line gives the total once everything is loaded, such as **12 songs · 48 min** or **1 hr 5 min**; while more pages remain it says **50 of 230 songs loaded** instead (no length, since it would cover only part of the list). Tapping a song plays it in that album or playlist, so the following songs keep going. **Continue · song name (v2.23)** under Play and Shuffle starts the last song you heard in that album, playlist or Liked Songs, at the spot you left it, inside the list, so the next songs keep going. The page remembers it from what the Now Playing check saw (and from Recently played), for up to 40 lists and 30 days, only on this phone. The button is hidden while that song is playing, and when you were in its last 30 seconds. **Back** (or the phone's back swipe) returns to where you were in the list. Spotify only lets personal apps list the songs in playlists you own; for other playlists the page shows a note and you can still press Play. For a playlist you don't own, **Make a copy** shows how to copy it in the Spotify app; the page then lists your copy's songs, links it to the original on this phone, and says when the original has changed.
- **Editing your playlists (v2.26):** in a playlist you own or collaborate on, **Edit** above the songs shows them in playlist order with **−** (remove, after a confirm; if a song is in the playlist more than once, Spotify removes every copy) and up and down arrows (move one place). Songs move only among those loaded so far; **Load more** brings in the rest. On the Now Playing screen, **Add to playlist** puts the playing song or episode at the end of one of your own or collaborative playlists (pinned ones first, with a name filter); it asks first only if that playlist's songs were already loaded this visit and include it. There's no Undo. The first time you edit, the page asks for one more Spotify permission (**Manage your private playlists**) and Spotify asks you to sign in again; if you cancel there, nothing changes. Each change is one request.
- **Find in list (v2.22):** a **Find in songs** box under the header of Liked Songs, your own playlists, albums and Saved episodes. It matches the song title, artist and album (an episode's show), ignoring capitals and accents ("beyonce" finds Beyoncé), and looks through the songs loaded so far; typing sends nothing to Spotify. Tapping a match plays it inside the list, as usual. While more pages remain, **Search all 1,240 songs** loads the rest: for Liked Songs and Saved episodes that's one request per 50 songs, two at a time, up to 1,000 songs per tap (the button then says **Search 1,000 more**; tap again for the rest), kept until you reload the page; for your own playlists and long albums the button says how many requests it needs, and it's off above 4 (200 more songs) or while Spotify has paused album details, since those requests are limited to about 20 an hour. Any Spotify pause, **Stop**, or leaving the list stops it and keeps what arrived. Clear the box to get the full list and **Load more** back.
- **Artist page:** the artist's picture and name, a **Play** button (plays the artist in Spotify, as tapping an artist used to), a **Follow** button and the pin button beside it, and the artist's releases in three groups, **Albums**, **Singles & EPs** and **Compilations**, each newest first. Releases load 10 at a time (Spotify's limit); **Load more** adds the next 10 and puts them in their groups. Under the name, a line says **10 of 37 releases loaded**, or **37 releases** once all are in. Tap a release to open its song list; **Back** returns to the artist page at the same spot, and **Back** again to where you started. There are no top songs or related artists: Spotify no longer gives personal apps top songs, and the page shows nothing Spotify suggests. **Follow** (v2.25) follows the artist on Spotify and reads **Following** once you do; tap **Following** to unfollow. Search Spotify shows a heart on artist rows that does the same. Each tap shows **Undo** for a few seconds, and the **Artists** filter changes at once. The first time, Follow asks for one more Spotify permission (**Manage who you are following**): a sheet explains it, **Sign in to Spotify** asks Spotify, and you come back to the page; if you cancel there, nothing changes. The button is hidden while your followed artists haven't loaded.
  - **Go to artist (v2.19):** in an album's song list, the artist names under the title are buttons that open the artist page; **Back** returns to the album. The Now Playing screen has **Open artist · …** too (see below). An artist you follow costs one request (its releases), since its picture is already known; any other artist costs two (picture and releases). Opening the same artist again this visit sends nothing.
- **Now Playing bar:** at the bottom while something plays: cover, song, artist, device, an **Up next** button, a heart for the current song, and Shuffle, Previous, Play/Pause, Next and **Repeat**. It checks every 20 seconds while the page is open on screen (every 60 seconds once nothing has played for 10 minutes), and stops checking when you switch away.
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
    - **Open artist · …** (songs, v2.19): the artist page, one button per artist, up to 3, so featured artists get one too.
    - **Open playlist · …** when you're playing from a playlist. Your own playlists open their song list. A playlist that isn't in your library is looked up by Spotify (one request, remembered until you reload); since Spotify only lets personal apps list songs in your own playlists, it opens with the usual note and a **Play** button.
    - **Open Liked Songs** when you're playing from Liked Songs.
    - **Open show · …** (episodes): the podcast's episode list.
    - **Share** (v2.20): opens the iPhone share sheet with the song's or episode's Spotify link, so you can send it in Messages or anywhere else.
    - **Open in Spotify:** the song or episode in the Spotify app.
  - **Up next** (top right) opens the queue (see below).
  - Close with the down arrow at the top left, by swiping down from the top of the screen, or with Escape on a keyboard.
  - While this screen is open and on screen, the page checks what's playing every 10 seconds instead of 20 (every 60 seconds once nothing has played for 10 minutes). Nothing is checked while the page is in the background.
  - **Back** from a song list you opened here returns to where you were, at the same scroll position. If you were already in a song list, the new one replaces it, so **Back** still returns to the list you started from. From an artist page, the song list opens on top of it, so **Back** returns to the artist.
- **Up next:** opens from the Now Playing screen or the bar. It asks Spotify once for the queue each time it opens (**Refresh** asks again) and shows what's playing and what comes next. You can't reorder it or play from it here; Spotify doesn't let apps reorder the queue.
  - Spotify adds its own picks after your queue (autoplay) and doesn't say which songs are which. So the page remembers what you added with **+** on this page during the last 24 hours, and **Hide songs Spotify adds after my queue** (on by default, the switch at the top) shows only those, with the note **Spotify may add its own picks after these; they're hidden.** Turn it off to see everything; later songs may then be Spotify's picks.
  - Songs you added in the Spotify app itself, or more than 24 hours ago, are hidden while the switch is on.
- **Playing now:** in any song or episode list (albums, playlists, Liked Songs, Recent, search, podcasts), the song or episode that's playing shows its name in green with a small **Playing** label. It updates with the Now Playing check.
- **Share (v2.20):** albums, playlists, podcasts and artist pages have a share button at the top, next to the heart or pin. It opens the iPhone share sheet with the Spotify link. If the share sheet isn't available, the link is copied instead (**Link copied**); if copying doesn't work either, the message shows the link as text (tap it to select it, then copy) and stays up for 15 seconds or until you tap **Close**. Closing the share sheet does nothing. Liked Songs and Saved episodes have no share button, since they have no public link. Sharing sends no requests to Spotify.
- **Choosing a device:** tap the device name in the status line ("Playing on iPhone · Change") to see your open Spotify devices. Picking one moves playback there and makes it the device taps play on from then on. **Refresh** in that panel looks again.

### Home

Home is a shortcuts page made only from your own things the page already loads. Nothing on it is suggested by Spotify. Besides recently played, its only extra requests are the episode progress checks described under **Podcasts → Fresh listening progress**. From the top:

- **Liked Songs** as a large row: tap it to open the song list (Play and Shuffle are at its top).
- **Pinned:** everything you pinned (playlists, albums, artists, podcasts), as a row of covers you swipe sideways, in the order you pinned them. A tap does the same as in its own tab: playlists, albums and podcasts open their list, artists open the artist page.
  - **The round play button (v2.23)** on a playlist, album or artist plays it straight away (an album from its first song). On a podcast it picks up the newest episode you haven't finished, from what the page already knows (Latest episodes, the podcast's saved list and your listening history); a podcast the page knows no episodes of yet has no button. Showing the buttons asks Spotify nothing; a tap sends one play request.
- **Continue listening:** the episodes you've started, the same row as on Podcasts. A tap picks the episode up where you left off.
- **Jump back in:** your last 8 albums from Recently played (one card per album) and podcasts you listened to (one card per podcast), newest first. Each card shows the album (with its artist) or the podcast (with the newest episode you heard). Since v2.23, songs you played from one of your own library playlists or from Liked Songs show as that playlist or Liked Songs (one card each, with the song you last heard), not as their albums. A playlist that isn't in your library still shows as the album, and nothing is looked up for it.
  - **Tap the card** to open that album's song list or the podcast's episode list.
  - **The round play button** on the cover plays the song you last heard from that album, inside the album, playlist or Liked Songs you played it from, so the next songs keep going; on a podcast card it picks the episode up where you left off.
  - **See all** opens **Recent**. Home asks Spotify for recently played at most once every 15 minutes, and only while Home is on screen; podcasts come from the page's own history (see **Podcast listening history**).
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
- **Listening progress (v2.14):** the page no longer asks Spotify for single episodes' resume points on its own (that used up Spotify's quota; see **Spotify's request limit**). Progress comes from what the page saw playing, the Latest list and the episode lists you open.
- The **Podcasts** filter opens on a **Latest | Shows** switch. **Latest** (the default) is the newest episodes across all your saved podcasts; **Shows** is **Saved episodes** (the episodes you saved in Spotify) followed by the podcasts you follow, each with its episode count. **All** includes Saved episodes and your podcasts too.
- **Latest episodes:** the 50 newest episodes across your saved podcasts (the newest 5 from each), newest first. Since v2.14 it reloads only when you open it and the list is over 12 hours old, or when you tap **Refresh**, and each reload covers the 12 podcasts that published most recently. Each row shows the podcast, when it came out (**Today**, **Yesterday**, or the date) and the length, time left, or **Played**. A green dot marks an episode from the last 7 days that you haven't started.
  - **Play newest** starts the newest episode you haven't finished.
  - **Hide played** hides episodes you've finished; the page remembers the setting.
- **In Latest: Priority · Normal · Hidden (v2.44):** a switch in each podcast's page header (under **Play**) sets how that podcast shows in **Latest**. **Normal** (the default) is as before. **Priority** puts the podcast's unplayed episodes at the top of **Podcasts → Latest** and Home's **Latest episodes**, and **Play newest** picks them first; played ones keep their place by date. **Hidden** leaves the podcast out of Latest, Home's Latest episodes and Play newest, and Latest's reload stops asking Spotify for it, so its slot goes to another podcast (fewer requests if fewer than 12 are left). Priority podcasts are asked first in each reload, but take at most 8 of the 12 places while you have 4 or more Normal podcasts, so Normal ones are still asked. A reload keeps the 50 newest episodes of podcasts that aren't Hidden; a Hidden podcast keeps only its newest one (its page and pin use it).
  - Its own page, the **Shows** list, the pin's play button and **Search Spotify** are unaffected; you stay subscribed in Spotify.
  - Priority and Hidden apply at once to what Latest already has. If a Priority podcast's newest episodes aren't in Latest yet, they arrive at the next update (tap **Refresh** in Latest).
  - With **Oldest first**, Priority episodes are on top too; **Show A–Z** keeps its A–Z order (Hidden is left out of all three).
  - Stored only on this phone (up to 100 podcasts set to Priority or Hidden, under 3 KB). When that's full, settings of podcasts you no longer follow make room once this visit's library has loaded; before that, the setting made longest ago is cleared (the message says so). Changing it asks Spotify nothing. **Diagnostics** shows how many podcasts are set to each.
  - The list is saved on the phone. Since v2.14 it reloads only when you open **Podcasts → Latest** and the list is over 12 hours old, or when you tap **Refresh** (at most once every 5 minutes); never in the background. Each reload asks for the 12 podcasts that published most recently (one request per podcast, 2 at a time). **Updated … ago** shows its age, and **Paused by Spotify until …** appears while Spotify has paused podcast and album details. Listening progress in this list updates on each reload, and in between from what the page sees playing. If some podcasts can't be loaded, the rest still show, with a note such as **Couldn't load 1 show**.
- **Tapping a podcast opens its episode list** (newest first, 50 at a time, **Load more** for the rest). Spotify doesn't let apps play a whole podcast, so the **Play** button at the top starts the newest episode you haven't finished. The heart removes the podcast from your library, with **Undo**.
- **Episode rows** show the podcast or release date and the length, or how much is left ("12 min left") or **Played**. Tapping an episode plays it and picks up where you left off. The heart saves it to Saved episodes; **+** adds it to the queue; the page icon opens its notes.
- **Episode notes (v2.18):** the page icon on an episode row, or **Episode notes** on the Now Playing screen, opens the episode's description. Times the podcaster wrote, such as **(12:34)**, **00:00 Intro** or **1:02:03**, are buttons: tap one to jump there if that episode is playing, or to play the episode from that spot (the usual tap, so **When Spotify isn't running** still applies). This gives you chapters for shows that write them; Spotify's automatic chapters aren't available to apps, so episodes without times in their notes have none. A one-digit time inside a sentence (like "John 3:16") and clock times ("10:30 am") stay text.
  - The notes are the podcaster's own text, shown as written, so they can include the podcaster's sponsor reads. Links in them are plain text and don't open.
  - They usually cost nothing: Spotify already includes them in the Now Playing check, a podcast's episode list, Saved episodes, Latest and search. When the page doesn't have them (for example a Latest or Recent row after a reload), the sheet offers **Load notes**, which asks Spotify once (podcast and album details, so not while those are paused).
  - The notes of episodes you open or play are kept on this phone (the last 40, up to 4,000 characters each; longer ones offer **Load full notes**). Saved podcast lists don't keep notes.
- **Mark as played or unplayed (v2.21):** the Episode notes sheet has **Mark as played** (or **Mark as unplayed** for an episode shown as played), and each **Continue listening** card has a small check button that marks it played, so a show you gave up on leaves the row. A toast offers **Undo**. The mark counts everywhere the page shows played state: **Continue listening**, **Hide played**, **Play newest**, a podcast's **Play**, the green dot and the **Played** label. **Mark as unplayed** brings an episode back.
  - Only on this phone. Spotify has no way for apps to set played state, so the Spotify app won't see it, and other browsers won't either. Nothing is sent to Spotify.
  - Playing the episode again clears the mark: a tap on this page, or the page seeing it play (more than 30 seconds away from where it was when you marked it). Marks are kept for 180 days, the newest 400.
- **Search Spotify** also finds podcasts and episodes, shown under **Podcasts** and **Episodes**.
- If an episode won't play from the page, the message offers **Open in Spotify** for that episode.

### Podcast listening history

Spotify's recently played list for apps leaves out podcast episodes (its reference says it "doesn't support podcast episodes"), so **Recent** and **Jump back in** used to show songs only. The page now keeps its own list of the episodes you listen to:

- Whenever the Now Playing check sees an episode (or you start one from the page), it's added to the top of the list with its podcast, length, where you are in it and when you last heard it. While it plays, the position updates with each check. One entry per episode, at most 60, and anything older than 60 days drops off. It's stored only on this phone (in this browser) and never sent to Spotify; signing out doesn't clear it.
- An episode counts as **Played** once you're within its last minute (or Spotify says it's finished).
- **Recent** lists these episodes among your songs by time: **Episode · podcast · 12 min ago · 34 min left** (or **Played**). Tap one to pick up where you left off.
- **It only covers listening the page saw.** The page checks what's playing only while it's open on screen. An episode you play entirely in the Spotify app while the page is closed won't appear in the history until the page sees it playing. Its progress still reaches **Continue listening** and the Latest list through Spotify's resume points when Latest reloads or you open that podcast, as long as it's one of those episodes.

**Diagnostics** shows **Podcast history** (how many episodes, the newest and when you heard it) and, since v2.18, **Episode notes** (how many are kept, and whether Spotify's Now Playing answer included the playing episode's notes), and since v2.21 how many episodes are marked played or unplayed on this phone.

### When Spotify goes to sleep

After you pause, the iPhone's Spotify app stops being listed as a device within seconds to minutes, and Spotify then reports nothing playing. The page no longer treats that as the end:

- The bar and the Now Playing screen keep the last song or episode, shown as **paused** where it stopped, with a small line: **Spotify is asleep. Press play to wake it.** The Now Playing screen stays open.
- **Play** (on the bar or the Now Playing screen) picks up at that spot. If Spotify is open on a device, it plays right away. If not, it follows your **When Spotify isn't running** setting; with the default, the line changes to **Press play in Control Center or on the lock screen. It picks up at 1:23.** and the page plays it once Spotify wakes, one time only. A song played from an album, playlist or Liked Songs continues inside it; a song from an artist and an episode play on their own, at the same spot.
- **Pause** while Spotify is falling asleep just shows the song as paused at that spot, with no message. Play picks up there. If the phone came back under a new device id, Pause still stops it.
- **Next, Previous, Shuffle and Repeat** do nothing while Spotify is asleep and say **Press play first to wake Spotify.** Dragging the progress bar only moves the spot that Play starts from.
- If Spotify answers that the device is gone while you use the controls, the page switches to this asleep view instead of showing an error.
- The last playback is kept on this phone for 6 hours, so it is still there after a reload. Signing out clears it. After 6 hours without playback, the bar goes away as before.

**Diagnostics** shows **Player** (playing, paused or idle (asleep)) and how old the last playback is.

### When Spotify isn't running

When the iPhone's Spotify app has been idle for a while, Spotify stops listing it as a device, so the page has nothing to play on. The page remembers what you tapped and plays it as soon as Spotify is back. Choose how in **Diagnostics → Settings → When Spotify isn't running**:

- **Wait for me to press play (no app)** (default): nothing opens. The line under the status says **Press play in Control Center or on the lock screen. "…" starts as soon as Spotify wakes.** Pressing play there starts Spotify in the background, the iPhone shows up as a device, and the page plays what you tapped. For a moment you may hear whatever Spotify last played before it switches; that's normal.
  - The page checks every 3 seconds for up to a minute while it's on screen (at most 20 checks), and stops as soon as it sees Spotify. If you leave the page, it pauses and starts a fresh minute when you come back.
  - **Open Spotify instead** on that line opens the item in the Spotify app (the next option) for this one tap. **Cancel** drops the tap.
  - If Spotify doesn't wake within the minute, the line says **Spotify didn't wake up yet** with **Try again** (one more minute) and **Open Spotify instead**. After a second miss the page drops the tap and asks you to start something in Spotify, then tap again. It never keeps retrying on its own.
  - Starting playback anywhere else also counts: if the Now Playing check sees Spotify playing while a tap is waiting, the page plays the tap.
- **Open the Spotify app:** the Spotify app opens on what you tapped. Switch back to Safari (swipe along the bottom edge or tap "◀ Safari" at the top left). A line under the status says **Starting "…"** while the page looks for your phone for up to 20 seconds, then plays what you tapped. If Spotify doesn't show up in time, you get **Spotify didn't show up yet** with a **Try again** button.
- **Run my Wake Spotify shortcut:** a tap runs your iPhone Shortcut named exactly **Wake Spotify**, which opens Spotify, waits, and comes back to the page at `https://richardtran324.github.io/spotify-library/?wake=1`; the page then plays the item without you switching back. The shortcut steps are in a separate guide. Safari may ask whether to open Shortcuts; tap **Open**.

A tap is remembered for 3 minutes; after that the page forgets it. With the two options that open the app, if the page hasn't checked for devices recently when you tap, it checks first and then shows a button to wake Spotify, because iPhone Safari may not open another app after the page has been waiting on Spotify. (Waiting needs no button: nothing opens.) If you had picked the app or shortcut option in an earlier version, that choice stays.

**Diagnostics** shows **Wake mode** (wait, link or shortcut), **Pending** (the remembered tap, its mode and how long ago, or none), **Appearance**, how many pins, queued songs and recent searches the page is keeping, and the **Latest episodes** cache.

### Appearance

**Diagnostics → Settings → Appearance:** **Match phone** (default), **Light** or **Dark**. Light and Dark apply right away and override the phone's setting.

### Spotify's request limit (v2.13, per part since v2.14)

Spotify limits how many requests an app makes. Its documentation says the limit is counted over a rolling 30-second window, and apps in Development Mode (a personal app like this one) also have a separate quota whose numbers Spotify doesn't publish. Going over either one makes Spotify answer **API rate limit exceeded** (HTTP 429) for a while.

**Why v2.14 changed it:** a real Diagnostics report showed only 21 requests in an hour, yet Spotify answered **QUOTA_EXCEEDED**, and every refused request was a catalog lookup (a podcast's episodes, an album's songs, an episode's details). Playback and library requests weren't refused. So the quota appears to be counted per kind of request, and the catalog part ran out first: each Latest episodes reload asked once per saved podcast (about 50 lookups), and the resume-point check asked for single episodes every 10 minutes. v2.13 then paused everything for 20 minutes or more, which made the page unusable. This is the page's reading of one report, not something Spotify documents.

- **Only the part Spotify refused is paused.** Requests are in four groups: **playback** (what's playing, devices, play, pause, queue), **your library** (playlists, saved albums, followed artists, Liked Songs, saved podcasts and episodes, recently played, hearts), **search**, and **podcast and album details** (a podcast's episodes, an album's songs, an artist's releases, a playlist's songs). A 429 pauses only its group. A slim line under the header names it, with a countdown: **Spotify paused podcast and album details until 10:31 PM. Playback, your library and search still work.** Everything else keeps working normally. A tap that needs the paused part sends nothing and shows that message once. The Now Playing screen shows the line only when playback itself is paused. When the countdown ends, playback and library checks start again a few seconds apart; details and search wait for your next tap.
- **How long:** as long as Spotify asks (its Retry-After value). If the page can't read that value, 30 seconds. If Spotify says the quota is used up, at least 10 minutes, then 20, 40, 80 minutes and at most 2 hours if it happens again in the same group. After 2 hours with no quota answer in that group, it starts over at 10 minutes. Spotify doesn't say how long a quota block lasts.
- **A refused request is never sent again on its own,** and identical requests made at the same moment share one answer (opening the same album twice quickly sends one request).
- **Latest episodes refresh only when you open them:** opening **Podcasts → Latest** reloads it only when the saved list is more than 12 hours old, and **Refresh** reloads it at most once per 5 minutes. Each reload asks for the 12 podcasts that published most recently (going by the last reload; in saved order the first time), 2 at a time, and keeps the other podcasts' episodes as they were. Nothing reloads in the background. Home's **Latest episodes** and the Shows order use the saved list only. Next to **Refresh** it says **Updated 3 h ago**, plus **Paused by Spotify until 10:31 PM** while details are paused.
- **No automatic resume-point checks.** **Continue listening** uses the page's own podcast history (what it saw playing) plus the Latest list and any Saved episodes or podcast list you open. Progress you made only in the Spotify app shows up once the page sees that episode playing, or after a Latest reload or opening the podcast.
- **Album, podcast, artist and playlist pages are kept for this visit:** opening the same one again sends nothing. **Refresh** (top right) forgets them, so the next open asks again. (Album and podcast lists are also saved on the phone since v2.15; see **Saved album and podcast lists** below.)
- **Fewer requests to start with:** the Now Playing check runs every 20 seconds (10 with the Now Playing screen open, 60 once nothing has played for 10 minutes, none in the background); waiting for Spotify to wake checks every 3 seconds (Control Center) or 1.5 seconds (Open the Spotify app / shortcut); recently played every 15 minutes; hearts are checked once per item per browser session.
- **Several Safari tabs** share one Now Playing check: only the tab on screen asks Spotify, and the others show its answer. They also share the pause line.
- **Tip: don't run the Safari tab and the Home Screen icon at the same time.** On iPhone the Home Screen icon keeps its own storage, so the two can't share the check or the pause line, and both ask Spotify on their own. Both count against the same app limit. Use one or the other, or close the one you're not using (swipe it away in the app switcher).

### Saved album and podcast lists (v2.15)

Album and podcast details are the part of Spotify's quota that runs out first, so the page saves those lists on the phone and asks Spotify for them as rarely as it can. Nothing is fetched in the background.

- **Albums:** the songs you load in an album are saved (up to 150 albums; the oldest saved goes first). Albums don't change, so opening a saved album sends nothing; it says **Saved on this phone**. If only part of a long album was loaded, **Load more** asks Spotify for the next page and adds it to the saved copy. **Reload from Spotify** (next to **Saved on this phone**) loads it again from the start, unless album details are paused.
- **Podcasts:** the newest 50 episodes of each podcast you open are saved (up to 60 podcasts). Opening a saved podcast shows it right away and asks Spotify for the newest page only when the copy is more than 12 hours old, or when you tap **Check for new episodes**; new episodes go on top. Listening progress the page saw since then is shown over the saved copy. **Load more** asks for older episodes.
- **From Latest episodes:** a podcast you haven't opened yet, but that has episodes in **Latest**, opens with those episodes right away (**Newest episodes from Latest**) without asking Spotify; **Load more** then asks for its full first page. When **Latest** reloads, a saved podcast copy also gets the new episodes it found.
- **Refresh** (top right) doesn't remove the saved lists. **Diagnostics → Settings** shows **Saved lists: N albums, M shows (≈ K KB)** and has **Clear saved lists**. If the phone's storage is full, the page drops the oldest saved lists to make room, or doesn't save.

**While Spotify has paused album and podcast details** (or refuses the request as it's sent):

- **A saved album or podcast** opens as usual. A podcast says **Saved Nov 22 · Spotify paused updates until 10:31 PM**.
- **An album that isn't saved** is found through search instead (search has its own quota): **From search (Spotify paused album details until 10:31 PM)**. The page searches for songs on that album by its first artist, keeps only the songs from this exact album, and lists them in disc and track order. Search can miss songs, so the list may be incomplete; **Load more** looks at the next 10 results, up to 50. Taps play inside the album as usual. If search finds every song, the album is saved like one loaded from Spotify.
- **A podcast that isn't saved** shows **Your saved and played episodes from this show (Spotify paused the full list until 10:31 PM)**: your saved episodes of it (from the newest 50 you saved) plus the episodes the page saw you play, newest first. The page's history has no release date, so a played episode is placed by when you listened. This list isn't saved.

**Diagnostics** shows the request meter: requests from this copy of the page in the last 30 seconds, 10 minutes and hour, requests from all copies in this browser in the last 10 minutes and hour, requests per group (10 minutes / 1 hour), which requests were most frequent, the **Last 429** (time, Spotify's reason, the Retry-After value or **not exposed** when the browser can't read it, and the request), **Paused by Spotify** for each group (working, or paused until when, plus the next quota pause length), a note that Latest refreshes only when you open it, and which copy is running the **Player check**.

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
- **v2.13** handles Spotify's request limit (see **Spotify's request limit**): a slow-down line with a countdown, fewer requests, one Now Playing check across Safari tabs, and a request meter in Diagnostics. No new permissions.
- **v2.15** saves album and podcast lists on the phone, and finds album songs through search (or shows your saved and played episodes of a podcast) while Spotify has paused album and podcast details (see **Saved album and podcast lists**). No new permissions.
- **v2.16** adds a **Show songs** button to playlists you don't own or collaborate on (Spotify won't let the page list their songs). Tapping it shows Spotify's own player with the song list, dark in dark mode; nothing loads before the tap and nothing autoplays. Songs tapped inside it play there as 30-second previews unless Safari is signed in to Spotify; **Play** and **Shuffle** at the top still play on your phone. It sends no Web API requests. No new permissions.
- **v2.17** makes **Pause** quiet when Spotify has fallen asleep: the song shows as paused where you tapped, with no **Press play first** message (see **When Spotify goes to sleep**). Podcast history records that spot right away, and other Safari tabs keep the same spot. No new permissions.
- **v2.14** pauses only the part of the page Spotify refused (playback, library, search, or podcast and album details), never re-sends a refused request, makes Latest episodes reload only when you open it (12 podcasts at a time), drops the automatic resume-point checks, and keeps album and podcast pages for the visit. No new permissions.
- **v2.18** adds **Episode notes** with tappable times (see **Podcasts**). No new permissions.
- **v2.19** adds **Go to artist**: **Open artist · …** on the Now Playing screen for songs, and tappable artist names in album headers (see **Artist page**). No new permissions.
- **v2.20** adds **Share** on the Now Playing screen and at the top of album, playlist, podcast and artist pages (iPhone share sheet, or copy the link). No requests and no new permissions.
- **v2.21** adds **Mark as played** and **Mark as unplayed** for episodes, kept on this phone only (see **Podcasts**). No new permissions.
- **v2.22** adds **Find in list** inside Liked Songs, your own playlists, albums and Saved episodes, with **Search all** (see **Features**). No new permissions.
- **v2.23** adds play buttons on Home's **Pinned** cards, your playlists and Liked Songs in **Jump back in**, and **Continue · song name** in song lists. No new requests to show them. No new permissions.
- **v2.24** adds **Make a copy** to playlists you don't own or collaborate on: it shows the steps to copy the playlist in the Spotify app (**Open in Spotify**). After you tap **Refresh**, the page links the copy to the original on this phone (automatically when the names match, or with **Link it**). The original's page then offers **Open your copy**, the copy's page offers **Open original** and says when the original has changed (only while the original is still in your library), and rows show **· You have a copy** and **· Copy**. Links are stored only on this phone. **Unlink** removes one; deleting the copy in Spotify removes it at the next Refresh. No new requests and no new permissions. The Spotify app's menu names in the steps are not yet checked on the iPhone.
- **v2.25** adds **Follow / Following** on the artist page and a follow heart on artist rows in Search Spotify (see **Artist page**). It needs one more permission, **Manage who you are following**, which the page asks for only the first time you tap Follow (no banner). Following uses Spotify's library endpoint (`PUT /me/library`), which Spotify's reference doesn't list for artists; if Spotify refuses, a message says so and nothing changes.
- **v2.26** adds editing your own and collaborative playlists: **Add to playlist** on the Now Playing screen, and **Edit** on a song list to remove or move songs (see **Features**). Editing asks for one more Spotify permission (**Manage your private playlists**) the first time you use it, so Spotify asks you to sign in once more then; like Follow, it asks only once.
- **v2.27** makes **Show songs** play full songs. Spotify's embedded player can't see your Spotify login on iPhone (Safari blocks its sign-in inside another site's page, and the home-screen app keeps its own storage), so on its own it only plays 30-second previews. Now, when you start a song in that list (or press its own play button), the page stops the preview and plays the song in full on your Spotify app, inside the playlist so the rest follows, using the same request as tapping a song in your own playlist. If Spotify's player add-on can't load, the list stays as before with a note that it only plays previews. Also, a playlist opened before your account details have loaded is no longer treated as someone else's (that showed your own playlist as a preview-only list). No new permissions.
- **v2.28** fixes four small things found after merging v2.19 to v2.27: Search all no longer adds plain rows to an open Edit list; a pinned podcast's play button skips episodes you marked played on this phone; Add to playlist and Edit only offer playlists known to be yours or collaborative; and the Add to playlist and permission sheets close when you're signed out. No new permissions.
- **v2.44** adds **In Latest: Priority · Normal · Hidden** on each podcast's page (see **Podcasts**). Stored on this phone only. No new requests (fewer when a podcast is Hidden) and no new permissions.
- If Spotify doesn't let the page check which items are already saved, hearts start outlined and a tap saves the item.
- **Refresh** reloads your library and checks for an open Spotify device (whichever isn't paused by Spotify), and forgets the album and podcast pages kept for this visit (the lists saved on the phone stay). The page also checks each time you come back to it (devices at most once every 15 seconds).
- To update the page later, upload the new `index.html` to the same repo (it replaces the old one).
