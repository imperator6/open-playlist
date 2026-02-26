# App Summary

## Purpose
A lightweight Spotify host app that connects to Spotify, manages a waiting-list playlist, and provides search, queue control, and recently played views.

## Project Structure
```
open-playlist/
├── server/
│   └── server.js           # Node.js server entry point
├── public/                  # Static files served to clients
│   ├── *.html              # HTML pages (index, playlist, session, recently)
│   ├── js/                 # Client-side JavaScript
│   │   ├── app.js
│   │   ├── playlist.js
│   │   ├── queue.js
│   │   ├── recently.js
│   │   └── session.js
│   └── css/
│       └── styles.css      # Application styles
│   └── images/
│       └── share-card.png  # Social share preview image
├── storage/                 # Data persistence (gitignored)
│   ├── session_store.json  # OAuth tokens
│   └── queue_store.json    # Playlist state
├── docs/                    # Documentation
│   ├── APP_SUMMARY.md
│   ├── DOCKER.md
│   └── project_instructions.md
├── .env                     # Environment configuration
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## Pages
- `index.html`: Home + full playback controls (play/pause, progress, remaining, autoplay, device) plus the waiting list queue section appended at the end of the page.
- Home displays queue count pulled from the playback stream, shows a red "Load Songs from a Playlist" button when empty, and offers a clear-queue action when populated.
- Home includes a manual device refresh button that forces a Spotify device refresh and broadcasts updates to all clients.
- The waiting list section on Home lets users reorder, add/remove tracks, place search results, and control playback per item. Tracks can only be added after a configurable minimum position (default: 5); both client UI and server enforce this. Admins can change the value via the Admin Settings page (`/admin`).
- When no playback is active, Home shows a "Start playback" button that enables autoplay (disabled if the queue is empty).
- Queue tracks include a `source` field: `playlist` when loaded from the waiting-list playlist and `user` when added by users (search or recently played). User-sourced tracks are visually highlighted in the queue list.
- User-sourced queue items render an extra row with a user icon, the name "Tino", and a placeholder time string for future updates.
- Each queue item displays thumbs-up/thumbs-down vote badges with counts. Guests get one vote per song (toggleable); admins have unlimited votes. Votes store `{ sessionId, name }` per voter, with names updated retroactively when a guest sets their name via `/api/auth/guest/name`. Vote names are enriched from active sessions at serve time for freshness.
- Vote Sort: An admin-only toggle ("Vote sort") in the nav bar enables automatic queue re-sorting after each vote. Songs with at least one vote (like or dislike) are sorted by net votes (upvotes minus downvotes) and placed at the top of the queue (after position 0). Songs with zero votes keep their relative order and follow after the voted group. The currently-playing track (position 0) never moves. The UI uses FLIP animations so cards smoothly slide to their new positions.
- `playlist.html`: Choose the waiting-list playlist, start playback, and search public playlists.
- On `playlist.html`, changing the dropdown only updates local selection; `activePlaylist*` in `queue_store.json` is updated only when `Load playlist` is confirmed.
- When loading a new playlist, the currently playing track from the old queue is preserved at position 0 (duplicates removed from the new list). This ensures uninterrupted playback during playlist switches.
- `recently.html`: View recently played tracks and add one as next in the queue.
- `session.html`: Connect/disconnect Spotify and view session details.
- `admin.html`: Admin-only settings page. Currently exposes `minAddPosition` (minimum queue slot users can insert into).

## Key Client Flows
- Clients only call local server endpoints (`/api/...`). No direct Spotify Web API calls.
- Home and queue pages poll `/api/queue` for cached playback/queue data; queue also polls `/api/queue/playlist` for the server-managed waiting list.
- Recently played page calls `/api/recently-played` and can add a track via `/api/queue/playlist/add`.
- Navigation is a fixed bottom iOS-style tab bar with icons (home uses home, playlist uses import, queue uses play); labels are provided via tooltips and screen-reader text.

## Server Responsibilities
- OAuth flow + token refresh; tokens stored in `session_store.json`.
- Waiting-list playlist state stored in `queue_store.json` and updated server-side.
- User add/like/dislike actions append JSONL audit records for playlist-building later.
- Spotify Web API calls are server-only.
- Playback/queue data is cached server-side on an interval to reduce rate-limit risk.

## Core Endpoints (Selection)
- Auth/session: `/status`, `/api/host/connect`, `/api/host/logout`, `/callback`
- Spotify data (server-side): `/api/playlists`, `/api/playlists/search`, `/api/recently-played`, `/api/track-search`
- Playback control: `/api/playlists/:id/play`, `/api/track-play`, `/api/player/pause`, `/api/player/resume`, `/api/player/devices`, `/api/player/devices/refresh`, `/api/player/transfer`
- Waiting list queue: `/api/queue`, `/api/queue/playlist`, `/api/queue/playlist/load`, `/api/queue/playlist/select`, `/api/queue/playlist/add`, `/api/queue/playlist/remove`, `/api/queue/playlist/reorder`, `/api/queue/vote`, `/api/queue/votesort`
- Admin settings (admin-only): `/api/admin/settings` (GET/POST) — currently manages `minAddPosition`
- Unified long-poll stream: `/api/stream/all` (playback, devices, playlist, and active-sessions payloads)
- Session activity: `/api/session/ping` (POST) — clients call this every 2 minutes to mark themselves active; server tracks recency per session

## Caching & Polling
- Server polls Spotify for playback/queue on a fixed interval and stores results in memory cache.
- Clients poll the server for cached data where needed; they do not poll Spotify directly.
- Server updates playback cache immediately on play/pause actions so status propagates to all clients on their next poll.
- Home play/pause button updates optimistically before the next poll, then syncs with the server result.
- Playback, device, and queue updates are delivered via a single long-polling endpoint (`/api/stream/all`).
- A leader-tab strategy (BroadcastChannel + shared lease) ensures only one browser tab keeps the long poll open; other tabs receive updates via cross-tab messaging.
- Autoplay state changes are broadcast in the unified stream so all clients stay in sync.
- Clients rely on the unified stream for the initial playback/device state instead of separate one-time fetches, including autoplay on home.
- Queue and Home no longer use separate playback/device/playlist streams; the unified stream is the only long-poll source for those updates.
- The `activeSessions` field is included in every unified stream payload. It lists sessions active within the last 15 minutes (sorted by most-recent activity), exposing `name`, `role`, and `lastActivityAt` (no session IDs). The Home page renders this as a people-icon counter in the nav bar; clicking it opens an inline popup showing each user's name, role badge, and relative last-activity time.

## Storage
- `storage/session_store.json`: OAuth tokens + expiry.
- `storage/queue_store.json`: active playlist id/name, track list (including per-track votes), current index, autoplay state, vote-sort state, last error, and device info. Autoplay and vote-sort states are restored from this file on server start; both default to off if the file is empty or missing.
- `storage/user_adds.jsonl`: JSONL log of user-added tracks.
- `storage/user_likes.jsonl`: JSONL log of user likes.
- `storage/user_dislikes.jsonl`: JSONL log of user dislikes.
- Storage paths can be overridden via `SESSION_STORE` and `QUEUE_STORE` environment variables.

## Configuration
- `.env` supports `LOG_LEVEL` (`DEBUG`, `INFO`, `WARN`, `ERROR`) to control server log verbosity; invalid or missing values default to `INFO`.
- Optional `ACTION_LOG_DIR`, `ADD_LOG_FILE`, `LIKE_LOG_FILE`, and `DISLIKE_LOG_FILE` override where action JSONL logs are written.
- There is no env-based default playlist; active waiting-list playlist selection is managed via queue endpoints and stored in `queue_store.json`.
- When a user switches device in the UI, the server stores `activeDeviceId` and `activeDeviceName` in `queue_store.json` and broadcasts the selected device via the devices stream.

## Security Notes
- Spotify access tokens, refresh tokens, and client secrets are never sent to the browser.
- All Spotify API traffic stays on the server.

## PWA Support
- The app now includes a Web App Manifest at `/manifest.webmanifest` with `display: "fullscreen"` for installable fullscreen launch behavior.
- All HTML pages include PWA metadata (`manifest`, `theme-color`, Apple standalone tags, and apple-touch icon).
- A shared client script (`/js/pwa.js`) registers a service worker.
- A service worker (`/sw.js`) caches core app shell assets and keeps `/api/*` requests network-only.
- PWA icons are served from `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/apple-touch-icon.png`.
 - Social share images are served from `/images/share-card.png`.
