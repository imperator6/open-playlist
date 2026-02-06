# Unraid Quick Reference Card

## Installation

### Method 1: Template URL (Fastest)
```
1. Docker tab → Add Container
2. Template URL: https://raw.githubusercontent.com/YOUR_USERNAME/open-playlist/main/unraid-template.xml
3. Fill in Spotify credentials
4. Apply
```

### Method 2: Manual
See [UNRAID_SETUP.md](UNRAID_SETUP.md) for detailed instructions.

## Required Information

Before installing, get these from Spotify Developer Dashboard:

| Item | Where to Get | Example |
|------|-------------|---------|
| **Client ID** | https://developer.spotify.com/dashboard | `abc123...` |
| **Client Secret** | Developer Dashboard → Settings → Show | `def456...` |
| **Redirect URI** | Set in Dashboard | `http://192.168.1.100:5173/callback` |

## Template Configuration

### Required Settings
```
Repository: ghcr.io/YOUR_USERNAME/open-playlist:latest
Port: 5173 (both host and container)
Storage: /mnt/user/appdata/open-playlist/storage

Environment Variables:
├─ SPOTIFY_CLIENT_ID: [your-client-id]
├─ SPOTIFY_CLIENT_SECRET: [your-secret] (masked)
├─ SPOTIFY_REDIRECT_URI: http://YOUR_IP:5173/callback
└─ HOST_PIN: 0000 (change this!)
```

### Optional Settings
```
LOG_LEVEL: INFO (or DEBUG, WARN, ERROR)
AUTO_REFRESH: 1 (1=enabled, 0=disabled)
PORT: 5173
```

## First Time Setup

1. **Start Container**
   - Apply settings in Unraid
   - Wait for "Started" status

2. **Access WebUI**
   - Open: `http://UNRAID-IP:5173`

3. **Connect Spotify**
   - Session tab → Enter PIN → Connect
   - Authorize when redirected to Spotify

4. **Load Playlist**
   - Playlist tab → Select playlist → Load

5. **Start Playing**
   - Home tab → Start playback

## Common Tasks

### View Logs
```
Docker tab → open-playlist icon → Logs
```

### Update Container
```
Docker tab → open-playlist icon → Force Update
```

### Restart Container
```
Docker tab → open-playlist icon → Restart
```

### Change Port
```
1. Edit container
2. Change Host Port (e.g., 8080)
3. Update SPOTIFY_REDIRECT_URI to match
4. Update Spotify Developer Dashboard
5. Apply changes
```

## Troubleshooting

### Issue: Container won't start
**Solution:**
```bash
# Check logs
docker logs open-playlist

# Common causes:
- Missing SPOTIFY_CLIENT_ID or SECRET
- Port 5173 already in use
- Invalid credentials
```

### Issue: "Invalid redirect URI"
**Solution:**
```
1. Spotify Dashboard → Edit App → Redirect URIs
2. Add: http://YOUR_ACTUAL_IP:5173/callback
3. Must match exactly (http vs https, IP vs hostname)
4. Save in Spotify
5. Restart container
```

### Issue: Can't access WebUI
**Solution:**
```bash
# Test connection
curl http://localhost:5173/status

# If works locally but not remotely:
- Check firewall settings
- Verify Network Type is Bridge
- Try http://UNRAID-IP:5173 instead of hostname
```

### Issue: "Not connected" error
**Solution:**
```
1. Session tab → Logout
2. Connect again with PIN
3. Reauthorize with Spotify

Or:
- Check AUTO_REFRESH=1 is set
- Verify token hasn't been revoked in Spotify Dashboard
```

## File Locations

### Persistent Data
```
/mnt/user/appdata/open-playlist/storage/
├── session_store.json (OAuth tokens - backup this!)
└── queue_store.json (Queue state - backup this!)
```

### Logs
```
# View via Docker UI or:
docker logs open-playlist
docker logs -f open-playlist  # follow
docker logs --tail 50 open-playlist  # last 50 lines
```

## Port Reference

| Port | Protocol | Purpose |
|------|----------|---------|
| 5173 | TCP | Web interface & API |

## Environment Variables Quick Ref

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | ✅ | - | From Spotify Dashboard |
| `SPOTIFY_CLIENT_SECRET` | ✅ | - | From Spotify Dashboard (keep secret!) |
| `SPOTIFY_REDIRECT_URI` | ✅ | - | http://IP:5173/callback |
| `HOST_PIN` | ❌ | `0000` | Security PIN (change it!) |
| `LOG_LEVEL` | ❌ | `INFO` | DEBUG/INFO/WARN/ERROR |
| `AUTO_REFRESH` | ❌ | `1` | Auto-refresh tokens |
| `PORT` | ❌ | `5173` | Internal port |

## URLs

### Access Points
```
WebUI: http://UNRAID-IP:5173
Status: http://UNRAID-IP:5173/status
```

### Spotify Developer
```
Dashboard: https://developer.spotify.com/dashboard
API Docs: https://developer.spotify.com/documentation/web-api
```

### Project
```
Repository: https://github.com/YOUR_USERNAME/open-playlist
Template: https://raw.githubusercontent.com/YOUR_USERNAME/open-playlist/main/unraid-template.xml
Issues: https://github.com/YOUR_USERNAME/open-playlist/issues
```

## Backup & Restore

### Backup
```bash
# Backup storage directory
tar -czf open-playlist-backup-$(date +%Y%m%d).tar.gz \
  -C /mnt/user/appdata/open-playlist/ storage/

# Backup to USB or network share
cp open-playlist-backup-*.tar.gz /mnt/disk1/backups/
```

### Restore
```bash
# Stop container first
docker stop open-playlist

# Restore files
tar -xzf open-playlist-backup-YYYYMMDD.tar.gz \
  -C /mnt/user/appdata/open-playlist/

# Start container
docker start open-playlist
```

## Resource Usage

**Typical:**
- CPU: 0.1-0.5% (idle)
- RAM: 50-100 MB
- Disk: ~200 MB (image) + minimal storage

**During Use:**
- CPU: 1-3%
- RAM: 100-150 MB

## Security Tips

✅ **DO:**
- Change default HOST_PIN from `0000`
- Keep SPOTIFY_CLIENT_SECRET masked
- Use HTTPS with reverse proxy
- Backup storage directory regularly
- Use strong PIN codes

❌ **DON'T:**
- Share your CLIENT_SECRET
- Expose port 5173 to internet without auth
- Use default PIN in production
- Store credentials in plain text elsewhere

## Network Configuration

### Bridge Mode (Default)
```
Network Type: Bridge
Accessible via: http://UNRAID-IP:5173
```

### Host Mode (Advanced)
```
Network Type: Host
Uses: Host's network directly
Port: 5173 (can't be remapped)
```

### Custom Network
```
Create custom Docker network
Join container to network
Access via container name
```

## Integration with Other Services

### Nginx Proxy Manager
```
Proxy Host:
Domain: playlist.yourdomain.com
Forward: UNRAID-IP:5173
SSL: Let's Encrypt
```

### Organizr/Heimdall
```
Add tile:
Name: Open Playlist
URL: http://UNRAID-IP:5173
Icon: [custom icon URL]
```

## Command Line Quick Reference

```bash
# Container management
docker start open-playlist
docker stop open-playlist
docker restart open-playlist
docker rm open-playlist

# Logs
docker logs open-playlist
docker logs -f open-playlist
docker logs --tail 100 open-playlist

# Shell access
docker exec -it open-playlist sh

# Status
docker ps | grep open-playlist
docker inspect open-playlist

# Image management
docker pull ghcr.io/YOUR_USERNAME/open-playlist:latest
docker images | grep open-playlist
docker rmi ghcr.io/YOUR_USERNAME/open-playlist:latest
```

## Getting Help

1. **Check logs first:** `docker logs open-playlist`
2. **Read full guide:** [UNRAID_SETUP.md](UNRAID_SETUP.md)
3. **Search issues:** GitHub repository issues page
4. **Create issue:** Include logs and configuration

---

**Save this for quick reference!** 📋
