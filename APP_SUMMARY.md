# App Summary

## Purpose
A lightweight Spotify host app that connects to Spotify, manages a waiting-list playlist, and provides search, queue control, and recently played views.

## Pages
- `index.html`: Home + full playback controls (play/pause, progress, remaining, autoplay, device).
- Home displays queue count pulled from the playback stream, shows a red "Load Songs from a Playlist" button when empty, and offers a clear-queue action when populated.
- When no playback is active, Home shows a "Start playback" button that enables autoplay (disabled if the queue is empty).
- `playlist.html`: Choose the waiting-list playlist, start playback, and search public playlists.
- `queue.html`: Reorder the waiting list, add/remove tracks, and control queue placement.
- `recently.html`: View recently played tracks and add one as next in the queue.
- `session.html`: Connect/disconnect Spotify and view session details.

## Key Client Flows
- Clients only call local server endpoints (`/api/...`). No direct Spotify Web API calls.
- Home and queue pages poll `/api/queue` for cached playback/queue data; queue also polls `/api/queue/playlist` for the server-managed waiting list.
- Recently played page calls `/api/recently-played` and can add a track via `/api/queue/playlist/add`.
- Navigation is a fixed bottom iOS-style tab bar with icons (home uses home, playlist uses import, queue uses play); labels are provided via tooltips and screen-reader text.

## Server Responsibilities
- OAuth flow + token refresh; tokens stored in `session_store.json`.
- Waiting-list playlist state stored in `queue_store.json` and updated server-side.
- Spotify Web API calls are server-only.
- Playback/queue data is cached server-side on an interval to reduce rate-limit risk.

## Core Endpoints (Selection)
- Auth/session: `/status`, `/api/host/connect`, `/api/host/logout`, `/callback`
- Spotify data (server-side): `/api/playlists`, `/api/playlists/search`, `/api/recently-played`, `/api/track-search`
- Playback control: `/api/playlists/:id/play`, `/api/track-play`, `/api/player/pause`, `/api/player/resume`, `/api/player/devices`, `/api/player/transfer`
- Waiting list queue: `/api/queue`, `/api/queue/playlist`, `/api/queue/playlist/load`, `/api/queue/playlist/select`, `/api/queue/playlist/add`, `/api/queue/playlist/remove`, `/api/queue/playlist/reorder`

## Caching & Polling
- Server polls Spotify for playback/queue on a fixed interval and stores results in memory cache.
- Clients poll the server for cached data where needed; they do not poll Spotify directly.
- Server updates playback cache immediately on play/pause actions so status propagates to all clients on their next poll.
- Home play/pause button updates optimistically before the next poll, then syncs with the server result.
- Playback updates are delivered via long-polling (`/api/queue/stream`) so clients receive server-side changes without fixed-interval polling for playback.
- Autoplay state changes are broadcast in the playback stream so all clients stay in sync.
- Device updates are delivered via long-polling (`/api/player/devices/stream`) so clients receive device changes without fixed-interval polling.
- Clients rely on the device and playback streams for the initial state instead of separate one-time fetches, including autoplay on home.
- Queue no longer has fallback playback/device fetch helpers; streams are the only source for those updates.
- Home no longer has fallback playback/device fetch helpers; streams are the only source for those updates.

## Storage
- `session_store.json`: OAuth tokens + expiry.
- `queue_store.json`: active playlist id/name, track list, current index, autoplay state, last error, and device info.

## Configuration
- `.env` supports `DEFAULT_DEVICE_NAME` to preselect a device by name (case-insensitive) on startup.
- When a user switches device in the UI, the server stores that device name as the new default and broadcasts it via the devices stream.

## Security Notes
- Spotify access tokens, refresh tokens, and client secrets are never sent to the browser.
- All Spotify API traffic stays on the server.
