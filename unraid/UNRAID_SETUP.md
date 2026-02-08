# Unraid Docker Template Setup Guide

This guide shows how to install Open Playlist on Unraid using the Docker template.

## Quick Install (Community Applications)

### Option 1: Using Template URL (Easiest)

1. **Open Unraid Docker Tab**
   - Navigate to: **Docker** tab in Unraid WebUI

2. **Add Container**
   - Click **"Add Container"**
   - At the bottom, find **"Template repositories"**
   - Or click **"Template"** dropdown

3. **Load Template**
   - In the template field, paste:
     ```
     https://raw.githubusercontent.com/imperator6/open-playlist/main/unraid-template.xml
     ```
   - Click **"Add"**

4. **Configure Required Settings**
   - **Spotify Client ID**: Get from https://developer.spotify.com/dashboard
   - **Spotify Client Secret**: Get from Spotify Developer Dashboard
   - **Spotify Redirect URI**: `http://YOUR_UNRAID_IP:5173/callback`
   - **Host PIN**: Change from default `0000` for security

5. **Apply**
   - Click **"Apply"**
   - Container will download and start

### Option 2: Manual Template Installation

1. **Download Template**
   - Download [unraid-template.xml](unraid-template.xml)

2. **Copy to Unraid**
   - Copy to: `/boot/config/plugins/dockerMan/templates-user/`
   - Via network share: `\\UNRAID-SERVER\flash\config\plugins\dockerMan\templates-user\`

3. **Add Container**
   - Docker tab → **"Add Container"**
   - Select **"open-playlist"** from template dropdown

4. **Configure and Apply**

---

## Manual Setup (Without Template)

If you prefer manual configuration:

### Step 1: Get Spotify Credentials

1. **Go to Spotify Developer Dashboard**
   - Visit: https://developer.spotify.com/dashboard
   - Log in with your Spotify account

2. **Create New App**
   - Click **"Create app"**
   - Name: `Open Playlist` (or any name)
   - Description: `Waiting list playlist manager`
   - Redirect URI: `http://YOUR_UNRAID_IP:5173/callback`
   - Check: **Web API**
   - Agree to terms
   - Click **"Save"**

3. **Get Credentials**
   - Click **"Settings"**
   - Copy **Client ID**
   - Click **"View client secret"**
   - Copy **Client Secret**

### Step 2: Create Container in Unraid

1. **Open Docker Tab**
   - Navigate to **Docker** in Unraid WebUI

2. **Add Container**
   - Click **"Add Container"**

3. **Basic Settings**
   ```
   Name: open-playlist
   Repository: ghcr.io/imperator6/open-playlist:latest
   Network Type: Bridge
   Console shell command: sh
   ```

4. **Port Configuration**
   - Click **"Add another Path, Port, Variable, Label or Device"**
   - Select **"Port"**
   ```
   Name: WebUI
   Container Port: 5173
   Host Port: 5173
   Connection Type: TCP
   ```

5. **Volume Configuration**
   - Click **"Add another Path, Port, Variable, Label or Device"**
   - Select **"Path"**
   ```
   Name: Storage
   Container Path: /app/storage
   Host Path: /mnt/user/appdata/open-playlist/storage
   Access Mode: Read/Write
   ```

6. **Environment Variables**

   Click **"Add another Path, Port, Variable, Label or Device"** → **"Variable"** for each:

   **Required:**
   ```
   Key: SPOTIFY_CLIENT_ID
   Value: [Your Spotify Client ID]
   Display: Always
   ```

   ```
   Key: SPOTIFY_CLIENT_SECRET
   Value: [Your Spotify Client Secret]
   Display: Always
   Mask: Yes
   ```

   ```
   Key: SPOTIFY_REDIRECT_URI
   Value: http://YOUR_UNRAID_IP:5173/callback
   Display: Always
   ```

   **Optional:**
   ```
   Key: HOST_PIN
   Value: 0000
   Display: Always
   Mask: Yes
   ```

   ```
   Key: LOG_LEVEL
   Value: INFO
   Display: Advanced
   ```

   ```
   Key: AUTO_REFRESH
   Value: 1
   Display: Advanced
   ```

7. **Apply**
   - Click **"Apply"**
   - Wait for container to download and start

---

## Post-Installation

### Step 1: Verify Container is Running

1. **Check Docker Tab**
   - Container should show green "Started" status
   - Note the assigned IP and port

2. **View Logs**
   - Click container icon → **"Logs"**
   - Should see: `Server listening on port 5173`

### Step 2: Access Web Interface

1. **Open Browser**
   - Navigate to: `http://UNRAID-IP:5173`
   - You should see the Open Playlist interface

2. **Connect Spotify**
   - Go to **Session** tab
   - Enter your HOST_PIN (default: `0000`)
   - Click **"Connect to Spotify"**
   - Authorize the application
   - You'll be redirected back

### Step 3: Load Playlist

1. **Select Playlist**
   - Go to **Playlist** tab
   - Choose your waiting-list playlist
   - Click **"Load Playlist"**

2. **Start Playback**
   - Go to **Home** tab
   - Click **"Start playback"**
   - Music should start playing on your active Spotify device

---

## Configuration Options

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | ✅ Yes | - | Your Spotify app Client ID |
| `SPOTIFY_CLIENT_SECRET` | ✅ Yes | - | Your Spotify app Client Secret |
| `SPOTIFY_REDIRECT_URI` | ✅ Yes | - | Must match Spotify Developer Dashboard |
| `PORT` | No | `5173` | Internal port (match host port) |
| `HOST_PIN` | No | `0000` | PIN for host actions (change for security!) |
| `AUTO_REFRESH` | No | `1` | Auto token refresh (1=on, 0=off) |
| `LOG_LEVEL` | No | `INFO` | DEBUG, INFO, WARN, ERROR |
| `SESSION_STORE` | No | `/app/storage/session_store.json` | Session file path |
| `QUEUE_STORE` | No | `/app/storage/queue_store.json` | Queue file path |

### Port Configuration

**Default Port: 5173**

To use a different port:
1. Update **Host Port** in container settings
2. Update `SPOTIFY_REDIRECT_URI` to match new port
3. Update redirect URI in Spotify Developer Dashboard
4. Recreate container

### Storage Location

**Default:** `/mnt/user/appdata/open-playlist/storage`

This directory contains:
- `session_store.json` - OAuth tokens (keep secure!)
- `queue_store.json` - Playlist state and queue

**Backup these files** to preserve your session and queue state.

---

## Troubleshooting

### Container Won't Start

1. **Check Logs**
   - Docker tab → Container icon → Logs
   - Look for error messages

2. **Common Issues**
   - Missing `SPOTIFY_CLIENT_ID` or `SPOTIFY_CLIENT_SECRET`
   - Port 5173 already in use
   - Storage path permissions

3. **Fix Storage Permission Errors**
   
   **Error:** `EACCES: permission denied, open '/app/storage/queue_store.json'`
   
   This happens when the container can't write to the mounted storage directory.
   
   **Solutions:**
   
   **Option A: Run as root (easiest)**
   - Edit container settings
   - In "Extra Parameters" field add: `--user 0:0`
   - Apply and restart
   
   **Option B: Fix host permissions**
   ```bash
   # SSH to Unraid
   chown -R 1001:1001 /mnt/user/appdata/open-playlist/storage
   # Or make it world-writable:
   chmod -R 777 /mnt/user/appdata/open-playlist/storage
   ```

4. **Fix Port Conflicts**
   ```bash
   # Check what's using port 5173
   netstat -tulpn | grep 5173

   # Use different port in container settings
   ```

### Can't Connect to Spotify

1. **Verify Redirect URI**
   - Must match exactly in:
     - Spotify Developer Dashboard
     - `SPOTIFY_REDIRECT_URI` environment variable
   - Format: `http://UNRAID-IP:5173/callback`

2. **Check Credentials**
   - Client ID is correct (no spaces)
   - Client Secret is correct (no spaces)
   - Credentials from correct Spotify app

3. **View Container Logs**
   - Look for authentication errors
   - Check for network issues

### Web Interface Not Accessible

1. **Verify Container Running**
   - Docker tab shows "Started"
   - Green indicator

2. **Check Port Mapping**
   - Host port matches URL
   - No firewall blocking port

3. **Test Locally**
   ```bash
   # SSH to Unraid
   curl http://localhost:5173/status
   # Should return JSON with status
   ```

### Redirect URI Mismatch

**Error:** "INVALID_CLIENT: Invalid redirect URI"

**Fix:**
1. Check Spotify Developer Dashboard redirect URIs
2. Add: `http://YOUR_UNRAID_IP:5173/callback`
3. Must use exact IP or hostname you're accessing from
4. Save changes in Spotify Dashboard
5. Restart container

### Token Expired

**Error:** "Not connected" or "Token expired"

**Fix:**
1. Auto-refresh should handle this (if `AUTO_REFRESH=1`)
2. If not working, reconnect:
   - Session tab → Logout → Connect again

---

## Updating

### Update Container

1. **Docker Tab**
   - Find **open-playlist** container

2. **Force Update**
   - Click container icon
   - Select **"Force Update"**
   - Wait for download
   - Container restarts automatically

3. **Or Manual Update**
   ```bash
   docker pull ghcr.io/imperator6/open-playlist:latest
   docker stop open-playlist
   docker rm open-playlist
   # Recreate via Docker UI
   ```

### Preserve Data

Your data persists in `/mnt/user/appdata/open-playlist/storage/`:
- Session tokens (no need to reconnect)
- Queue state (playlist selection, current track)
- Device preferences

---

## Advanced Configuration

### Custom Icon

Edit template and change `Icon` URL to your own image:
```xml
<Icon>https://example.com/your-icon.png</Icon>
```

### Resource Limits

Add to template or container settings:
```
CPU: 0.5 cores
Memory: 256MB
```

### Network Mode

Default: **Bridge**

For host network mode (direct access):
1. Change Network Type to **Host**
2. Remove port mappings (uses host's port 5173 directly)

### Reverse Proxy

To use behind Nginx Proxy Manager or Swag:

1. **Create Proxy Host**
   - Domain: `playlist.yourdomain.com`
   - Forward to: `UNRAID-IP:5173`

2. **Update Redirect URI**
   - Spotify Dashboard: `https://playlist.yourdomain.com/callback`
   - Environment: `SPOTIFY_REDIRECT_URI=https://playlist.yourdomain.com/callback`

3. **Enable SSL**
   - Use Let's Encrypt in proxy manager

---

## Security Best Practices

1. **Change Default PIN**
   - Set `HOST_PIN` to something other than `0000`

2. **Secure Client Secret**
   - Never share your `SPOTIFY_CLIENT_SECRET`
   - Use Unraid's "Mask" option for this variable

3. **Use HTTPS**
   - Deploy behind reverse proxy with SSL
   - Update redirect URI to use HTTPS

4. **Backup Storage**
   - Regular backups of `/mnt/user/appdata/open-playlist/`
   - Contains OAuth tokens

5. **Network Access**
   - If accessible from internet, use VPN or authentication
   - Consider firewall rules

---

## Support

### Resources
- **GitHub Repository**: https://github.com/imperator6/open-playlist
- **Issues**: https://github.com/imperator6/open-playlist/issues
- **Documentation**: [README.md](README.md)
- **Spotify Developer**: https://developer.spotify.com

### Logs Location

View logs in Unraid:
- Docker tab → Container → Logs

Or via terminal:
```bash
docker logs open-playlist

# Follow logs live
docker logs -f open-playlist

# Last 50 lines
docker logs --tail 50 open-playlist
```

### Common Commands

```bash
# Restart container
docker restart open-playlist

# Stop container
docker stop open-playlist

# Start container
docker start open-playlist

# View container info
docker inspect open-playlist

# Access container shell
docker exec -it open-playlist sh
```

---

## Template Customization

The template file [unraid-template.xml](unraid-template.xml) can be customized:

1. **Edit Template**
   - Modify values, descriptions, defaults
   - Update icon URL
   - Add/remove environment variables

2. **Update Repository URL**
   - Change from GitHub Container Registry
   - Use Docker Hub or other registry

3. **Share Template**
   - Host on your GitHub repository
   - Submit to Community Applications

---

**Enjoy your Open Playlist Spotify manager!** 🎵
