# WAFlow Docker Deployment — Complete Setup Guide

## What Was Fixed

### The Problem
When containers were deployed, the app containers kept restarting with exit code 1. This was because:
- **Database schema didn't exist** — The application expected the MySQL database to have all required tables (46 tables from Drizzle ORM schema)
- **Migrations weren't running** — No automatic process existed to create tables inside the Docker container
- **Admin user not seeded** — The default login credentials weren't being set up

### The Solution
Created a **Docker entrypoint script** that automatically:
1. Waits for MySQL to be ready (with 30-attempt retry logic)
2. Runs `pnpm drizzle:migrate` to create all database tables
3. Runs `pnpm db:seed` to create the admin user and default templates
4. Starts the Node.js application after initialization completes

### Files Created/Modified

| File | What It Does |
|------|-------------|
| `docker-entrypoint.sh` | **NEW** — Initialization script that runs migrations and seeds DB |
| `Dockerfile` | **UPDATED** — Added netcat, copies entrypoint script, uses ENTRYPOINT |
| `rebuild-and-start-fixed.sh` | **NEW** — Simplified rebuild script with better status reporting |
| `.dockerignore` | Existing — Keeps build context clean |
| `docker-compose.1k-users.yml` | Existing — Defines 7 services (MySQL, Redis, 3 apps, Nginx, load balancer) |

---

## How to Deploy

### One-Command Deployment

Run this in the `/Users/nathi/Documents/v2` directory:

```bash
chmod +x rebuild-and-start-fixed.sh && ./rebuild-and-start-fixed.sh
```

### What Happens (Step-by-Step)

```
0-10s   : Old containers stopped
10-30s  : Docker image built (Alpine + Node 20 + Chromium + dependencies)
30-60s  : All services started (MySQL, Redis, 3 app instances, Nginx)
60-90s  : Services health checks pass
90-120s : App containers initialize:
          ↳ Database migrations run
          ↳ Admin user is seeded
          ↳ Application starts
120-150s: API becomes available
150s+   : Ready for use (typically 2-3 minutes total)
```

---

## After Deployment Completes

### 1. Access the Admin Dashboard
Open your browser and go to:
```
http://localhost
```

### 2. Login
Use these default credentials (set by the seed script):
```
Email:    admin@waflow.com
Password: admin123
```

### 3. Setup WhatsApp
1. Go to **Settings → WhatsApp**
2. Click **"Start WhatsApp Session"**
3. A QR code will appear
4. Scan it with your phone's WhatsApp camera
5. Wait for the status to show "Connected"

---

## Architecture

The deployment runs **7 Docker containers**:

| Container | Image | Purpose |
|-----------|-------|---------|
| `waflow-mysql-1k` | `mysql:8.0.36` | Primary database (optimized for 1K users) |
| `waflow-redis-1k` | `redis:7.0-alpine` | Message queue & cache |
| `waflow-app-1` | Custom (node:20-alpine + Chromium) | App instance 1 (port 3000) |
| `waflow-app-2` | Custom (node:20-alpine + Chromium) | App instance 2 (port 3001) |
| `waflow-app-3` | Custom (node:20-alpine + Chromium) | App instance 3 (port 3002) |
| `waflow-lb-1k` | `nginx:1.25-alpine` | Load balancer (port 80/443) |

Each app instance:
- ✅ Has Chromium for WhatsApp Web.js (WWJS)
- ✅ Runs migrations on startup
- ✅ Uses the same MySQL database (multi-tenant aware)
- ✅ Connects to Redis for session/cache management
- ✅ Has health checks every 30 seconds

---

## Common Commands

### View Logs
```bash
# Real-time logs for app instance 1
docker-compose -f docker-compose.1k-users.yml logs -f waflow-app-1

# View all container logs
docker-compose -f docker-compose.1k-users.yml logs

# Show last 50 lines
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 --tail 50
```

### Check Container Status
```bash
docker-compose -f docker-compose.1k-users.yml ps
```

### Stop Everything
```bash
docker-compose -f docker-compose.1k-users.yml down
```

### Stop and Remove All Data (WARNING: Destructive)
```bash
docker-compose -f docker-compose.1k-users.yml down -v
```

### Restart a Single Container
```bash
docker-compose -f docker-compose.1k-users.yml restart waflow-app-1
```

### Run Shell in Container
```bash
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 sh
```

---

## Troubleshooting

### Containers Keep Restarting
1. Check logs for errors:
   ```bash
   docker-compose -f docker-compose.1k-users.yml logs waflow-app-1
   ```

2. Common causes:
   - **Database not ready**: MySQL health check failing (check MySQL logs)
   - **Migrations failing**: Check database connectivity and permissions
   - **Missing environment variables**: Check docker-compose.1k-users.yml

### API Not Responding
```bash
# Check if the health endpoint works
curl http://localhost:3000/health

# If it fails, wait 30 more seconds and try again
sleep 30 && curl http://localhost:3000/health
```

### Chromium Not Found
```bash
# Verify Chromium is installed in the container
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 chromium-browser --version

# Should output something like:
# Chromium 120.0.6099.129 ChromeDriver 120.0.6099.129
```

### MySQL Not Accepting Connections
```bash
# Check MySQL is running and healthy
docker-compose -f docker-compose.1k-users.yml exec mysql mysqladmin ping -h localhost

# Should return: mysqld is alive
```

### Need to Manually Run Migrations
If you need to run migrations after containers are up:
```bash
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 pnpm drizzle:migrate
```

---

## Database Schema

The system uses Drizzle ORM with a 46-table MySQL schema covering:
- **Users & Auth**: users, sessions, audit logs
- **WhatsApp**: configurations, connections, messages
- **CRM**: customers, contacts, interactions
- **AI**: bot configs, conversation history, knowledge base
- **Bookings**: appointments, services, staff, schedules
- **Broadcasting**: bulk messages, templates, automation
- **Analytics**: conversation metrics, performance data

All tables are automatically created on first startup via the entrypoint script.

---

## Environment Variables

Key variables used in production deployment (already configured in docker-compose):

```yaml
DATABASE_URL: mysql://waflow:waflowpassword@mysql:3306/waflow
REDIS_URL: redis://redis:6379
NODE_ENV: production
JWT_SECRET: (set via environment - never commit)
ENCRYPTION_KEY: (set via environment - never commit)
AI_API_URL: (configured for your AI service)
AI_API_KEY: (configured for your AI service)
PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium-browser
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true
```

---

## Next Steps

### 1. Deploy & Verify
```bash
chmod +x rebuild-and-start-fixed.sh && ./rebuild-and-start-fixed.sh
```

### 2. Test Admin Dashboard
- Go to http://localhost
- Login with admin@waflow.com / admin123

### 3. Configure WhatsApp
- Settings → WhatsApp
- Click "Start WhatsApp Session"
- Scan QR code

### 4. Test Messaging
- Send a WhatsApp message to your configured number
- Should arrive in the dashboard

### 5. (Optional) Configure AI Responses
- Settings → AI Configuration
- Set your AI service (OpenAI, Ollama, Groq, etc.)
- Configure system prompt

---

## Support

For issues or logs, run:
```bash
# Full diagnostic
docker-compose -f docker-compose.1k-users.yml ps
docker-compose -f docker-compose.1k-users.yml logs --tail 100
```

Check the application logs for detailed error messages.

---

**Ready to deploy? Run:**
```bash
chmod +x rebuild-and-start-fixed.sh && ./rebuild-and-start-fixed.sh
```
