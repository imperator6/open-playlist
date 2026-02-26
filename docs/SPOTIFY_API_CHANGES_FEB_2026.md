# Spotify Web API Changes - February 2026 Impact Review

Source:
- https://developer.spotify.com/documentation/web-api/references/changes/february-2026

## Findings (ordered by severity)

### High
- Playlist track endpoints removed: the server uses /playlists/{id}/tracks in multiple routes. These will fail and must move to /playlists/{id}/items.
  - server/server.js L2284, L2865, L2874, L2922, L2971

- Follow playlist endpoint removed: the server proxy uses PUT /playlists/{id}/followers and the UI calls it. This will fail and must be replaced with /me/library workflow.
  - server/server.js L1655
  - public/js/playlist.js L130

### Medium
- Search limit maximum reduced to 10. The server uses limit=12 and allows up to 50 for playlist search. These will now error and should be clamped to 10.
  - server/server.js L33, L1445, L1694

- Playlist fields renamed: tracks -> items. The app reads tracks.total and requests tracks(total) in playlist metadata, which will be missing after the change.
  - server/server.js L2310, L2338
  - public/js/playlist.js L161, L200

### Low
- Playlist items only returned for the user's playlists. Public playlists will not include items, so track count and related UI may be missing even after renaming to items.

## Not impacted
- Removed catalog endpoints such as /artists/{id}/top-tracks, /browse/*, /albums, /tracks bulk lookups are not used.
- Removed fields like popularity, available_markets, external_ids, followers, and user profile fields are not referenced by the server or UI.

## Suggested follow-up work
- Switch playlist operations to /playlists/{id}/items and update payload parsing.
- Clamp search limits to 10 and adjust UI pagination sizes.
- Replace playlist follow/unfollow with /me/library and update UI labels from "Save to my playlists" to a library concept.
