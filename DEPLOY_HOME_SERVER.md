# WAFlow — Home Server Deployment Guide

Run WAFlow 24/7 on your Windows or Mac machine, accessible from anywhere in the world on your phone.

---

## What you need

| Tool | Purpose | Cost |
|---|---|---|
| [Docker Desktop](https://docker.com/products/docker-desktop) | Runs WAFlow and the database | Free |
| [Cloudflare Tunnel](https://one.cloudflare.com/) | Secure internet access, no port forwarding | Free |
| A domain name | e.g. `waflow.yourdomain.com` | ~R200/yr |

> **No domain?** Cloudflare gives you a free random subdomain like `waflow.abc123.cfargotunnel.com`. That works too.

---

## Step 1 — Install Docker Desktop

1. Go to [docker.com/products/docker-desktop](https://docker.com/products/docker-desktop)
2. Download for **Windows** or **Mac**
3. Install and open it — you should see the Docker whale icon in your taskbar/menu bar
4. In Settings → General, check **"Start Docker Desktop when you log in"**

---

## Step 2 — Set up WAFlow

Open **Terminal** (Mac) or **PowerShell** (Windows) and run:

```bash
# 1. Go to your WAFlow project folder
cd /path/to/waflow        # Mac/Linux
cd C:\Users\You\waflow    # Windows

# 2. Copy the example environment file
cp .env.example .env      # Mac/Linux
copy .env.example .env    # Windows

# 3. Edit .env with your settings (see Step 3 below)
```

---

## Step 3 — Configure your .env

Open `.env` in any text editor (Notepad, VS Code, etc.) and fill in:

```env
# Required — change these
JWT_SECRET=any-long-random-string-keep-it-secret

# AI provider (pick one)
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_your_groq_key_here      # Free at console.groq.com
AI_MODEL=llama3-8b-8192

# Email alerts (optional — use Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-gmail-app-password      # Settings → Security → App Passwords
ALERT_EMAIL=your@gmail.com

# Your public URL (fill in after Step 4)
APP_URL=https://waflow.yourdomain.com
VITE_API_URL=https://waflow.yourdomain.com
```

> **Gmail App Password:** You need 2FA enabled on your Google account, then go to
> [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and create one for "WAFlow".

---

## Step 4 — Start WAFlow

```bash
# Start everything (database + app) in the background
docker compose up -d

# Check it's running
docker compose ps

# View logs
docker compose logs -f app

# Stop it
docker compose down
```

WAFlow is now running at **http://localhost:3000** on your machine.

Log in with:
- Email: `admin@waflow.com`
- Password: `admin123`

> **Important:** Change your admin password immediately in Profile → Change Password.

---

## Step 5 — Access from anywhere (Cloudflare Tunnel)

Cloudflare Tunnel creates a secure HTTPS connection from the internet to your PC — no router configuration, no exposed home IP, completely free.

### 5a. Install cloudflared

**Mac:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

**Windows** — Download the installer from:
[github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)
→ Download `cloudflared-windows-amd64.msi`

### 5b. Log in to Cloudflare

```bash
cloudflared tunnel login
```
A browser window opens — log in to your Cloudflare account (free at cloudflare.com).

### 5c. Create the tunnel

```bash
# Create a named tunnel
cloudflared tunnel create waflow

# You'll see output like:
# Created tunnel waflow with id abc123-def456-...
# Save that tunnel ID — you'll need it below
```

### 5d. Configure the tunnel

Create a file called `cloudflare-tunnel.yml` in your WAFlow folder:

```yaml
tunnel: abc123-def456-...          # ← paste your tunnel ID here
credentials-file: /path/to/.cloudflared/abc123-def456-....json

ingress:
  - hostname: waflow.yourdomain.com  # ← your domain (or use the free cfargotunnel.com one)
    service: http://localhost:3000
  - service: http_status:404
```

### 5e. Add a DNS record

```bash
cloudflared tunnel route dns waflow waflow.yourdomain.com
```

### 5f. Start the tunnel

```bash
cloudflared tunnel --config cloudflare-tunnel.yml run waflow
```

WAFlow is now live at **https://waflow.yourdomain.com** from any device in the world!

---

## Step 6 — Auto-start on boot

You want WAFlow and the tunnel to start automatically when your PC turns on, without you doing anything.

### Windows — Auto-start Docker containers

Docker Desktop with `restart: unless-stopped` (already set in `docker-compose.yml`) will auto-restart your containers when Docker starts. Since Docker starts on login, containers restart automatically.

**Auto-start the Cloudflare tunnel on Windows:**

1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a file `waflow-tunnel.bat` in that folder with:

```bat
@echo off
cd /d C:\Users\YourName\waflow
cloudflared tunnel --config cloudflare-tunnel.yml run waflow
```

3. To run it hidden (no black window), create `waflow-tunnel.vbs` instead:

```vbs
Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c cd /d C:\Users\YourName\waflow && cloudflared tunnel --config cloudflare-tunnel.yml run waflow", 0, False
```

### Mac — Auto-start the Cloudflare tunnel

Create a Launch Agent that starts the tunnel on login:

```bash
# Create the plist file
mkdir -p ~/Library/LaunchAgents

cat > ~/Library/LaunchAgents/com.waflow.tunnel.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.waflow.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/cloudflared</string>
        <string>tunnel</string>
        <string>--config</string>
        <string>/Users/YOUR_USERNAME/waflow/cloudflare-tunnel.yml</string>
        <string>run</string>
        <string>waflow</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/waflow-tunnel.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/waflow-tunnel.log</string>
</dict>
</plist>
EOF

# Replace YOUR_USERNAME with your actual Mac username
# Load it now
launchctl load ~/Library/LaunchAgents/com.waflow.tunnel.plist
```

---

## Step 7 — Install WAFlow on your phone

Now that WAFlow is live at your domain, install it as an app:

### iPhone / iPad (Safari)
1. Open Safari and go to `https://waflow.yourdomain.com`
2. Tap the **Share** button (box with arrow at bottom of screen)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** — WAFlow now appears as an app on your home screen

### Android (Chrome)
1. Open Chrome and go to `https://waflow.yourdomain.com`
2. Tap the **three dots** menu in the top right
3. Tap **"Add to Home screen"** or **"Install app"**
4. Tap **"Add"**

The app opens full-screen, no browser chrome, just like a native app.

---

## Managing WAFlow

```bash
# Check status
docker compose ps

# View live logs
docker compose logs -f app

# Restart app only
docker compose restart app

# Pull latest updates (when available)
docker compose pull && docker compose up -d

# Backup your database
docker compose exec db mysqldump -u waflow -pwaflowpassword waflow > backup-$(date +%Y%m%d).sql
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Can't access from internet | Check Cloudflare tunnel is running: `cloudflared tunnel info waflow` |
| Database not starting | Check logs: `docker compose logs db` |
| WhatsApp QR not showing | Make sure Chromium installed in Docker image: `docker compose logs app \| grep chromium` |
| "Connection refused" on port 3000 | Run `docker compose up -d` first |
| App not updating after restart | Old service worker cached — open in browser, F12 → Application → Service Workers → Unregister |

---

## System Requirements

| | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB |
| Storage | 10 GB free | 20 GB free |
| CPU | Any modern dual-core | Quad-core+ |
| OS | Windows 10 / macOS 12+ | Windows 11 / macOS 14+ |
| Internet | 10 Mbps upload | 50 Mbps upload |

> Your PC needs to stay **on** (not sleeping) for WAFlow to be available 24/7.
> On Windows: Settings → Power → Sleep → **Never**.
> On Mac: System Settings → Battery → Prevent automatic sleeping → **Always**.
