# Spotify Search App

## Environment Setup (.env)
1. Copy `.env.example` to `.env`.
2. Fill in the values:
   - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from your Spotify app.
   - `SPOTIFY_REDIRECT_URI` must match a redirect URI registered in your Spotify app.
     For local development, use `http://127.0.0.1:5173/callback`.
   - `PORT` is the server port (defaults to `5173`).

The server will refuse to start if required values are missing and will show
helpful instructions in the terminal.

## Getting Spotify Credentials (Client ID/Secret)
1. Create a Spotify developer account and open the Spotify Developer Dashboard.
2. Create a new app (name + description).
3. Open the app settings to view your **Client ID** and **Client Secret**.
4. Add your redirect URI to the app's **Redirect URIs** allowlist:
   - `http://127.0.0.1:5173/callback`

After saving the settings, use the Client ID and Client Secret in your `.env`.

## How Tokens Are Obtained (Authorization Code Flow)
This app uses Spotify's **Authorization Code** flow. The important steps are:
1. The server redirects the user to Spotify's `/authorize` endpoint with a
   `client_id`, `redirect_uri`, and a random `state` value.
2. After login/consent, Spotify redirects back to your `redirect_uri` with a
   short-lived `code`.
3. The server exchanges that code for tokens by calling Spotify's `/api/token`
   endpoint using your `client_id` and `client_secret`.
4. Spotify responds with an `access_token` (plus expiry info and a
   `refresh_token` for renewing later).
5. The server stores the access token in the session and uses it as a Bearer
   token when calling the Spotify Web API.

Note: This demo stores tokens in memory and does not refresh them yet.
