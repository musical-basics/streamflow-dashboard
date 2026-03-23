# StreamFlow Dashboard

A 24/7 live-streaming broadcast engine with a Next.js dashboard for managing playlists, uploads, and stream controls. Videos are normalized on upload and streamed via FFmpeg to YouTube/RTMP.

## Local Development

```bash
# Install dependencies
pnpm install

# Start the Next.js dashboard
pnpm dev
```

Dashboard runs at `http://localhost:3000`.

## Environment Variables

Create a `.env` file in `scripts/` (for the VPS server) with:

```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
PORT=3000
```

## VPS Deployment (Contabo)

### SSH Into the Server

```bash
ssh root@YOUR_VPS_IP
```

### Pull Latest Changes & Restart

```bash
cd /root/streamflow-dashboard
git pull
pm2 restart all
```

### Start the Server (First Time)

```bash
cd /root/streamflow-dashboard
pnpm install
node --env-file=.env scripts/server.js
```

Or with PM2 for persistence:

```bash
pm2 start "node --env-file=.env scripts/server.js" --name streamflow
pm2 save
```

### Monitor & Debug

```bash
# Check CPU/memory usage
htop

# View live server logs
pm2 logs streamflow

# Check stream status
pm2 status

# Restart if needed
pm2 restart streamflow
```

### Useful PM2 Commands

```bash
pm2 list              # List all processes
pm2 restart all       # Restart everything
pm2 stop streamflow   # Stop the server
pm2 delete streamflow # Remove from PM2
pm2 monit             # Real-time monitoring dashboard
```

## Architecture

- **Next.js Dashboard** — Frontend for managing videos, playlists, and stream controls
- **Express VPS Server** (`scripts/server.js`) — Handles uploads, video normalization, and the broadcast engine
- **Supabase** — Stores video metadata and stream configuration
- **FFmpeg** — Normalizes uploads (1080p, 30fps, H.264) and streams via RTMP
- **DJ Mode** — Playlist-based broadcasting with skip controls and smart restart
