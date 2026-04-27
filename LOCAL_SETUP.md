# WAFlow Local Development Server Setup

Run WAFlow on your Mac for testing and development.

## Prerequisites

### 1. Docker Desktop for Mac
- Download: https://www.docker.com/products/docker-desktop
- Install and launch from Applications folder
- Verify: `docker --version`

### 2. Ports Available
Make sure these ports are free:
- **3000** - WAFlow API
- **3306** - MySQL
- **6379** - Redis
- **5173** - Frontend (Vite dev server)

If ports are in use:
```bash
# Find what's using a port
lsof -i :3000
lsof -i :3306

# Kill if necessary
kill -9 <PID>
```

---

## Quick Start (2 minutes)

```bash
# 1. Make scripts executable
chmod +x start-local.sh stop-local.sh

# 2. Start everything
./start-local.sh

# 3. Open browser
# Frontend: http://localhost:5173
# API: http://localhost:3000

# 4. Login
# Email: admin@waflow.com
# Password: admin123
```

That's it! Everything is containerized and managed.

---

## How It Works

### Architecture
```
┌─────────────────────────────────────────────────┐
│ Your Mac                                         │
├──────────────┬──────────────┬──────────────┐────┤
│ Terminal     │ Docker       │ Browser      │Vite│
│              │ Containers   │              │Dev │
└──────────────┴──────────────┴──────────────┴────┘
       │              │               │
       └──────────────┼───────────────┘
                      │
                  Docker Network
                      │
         ┌────────────┼────────────┐
         │            │            │
      MySQL       Redis       WAFlow App
     :3306        :6379        :3000
```

### Services Running

| Service | Port | Purpose |
|---------|------|---------|
| MySQL | 3306 | Database |
| Redis | 6379 | Message queue |
| WAFlow API | 3000 | Backend |
| Vite Dev | 5173 | Frontend (not auto-running) |

---

## Common Commands

### Start server
```bash
./start-local.sh
```

### Stop server
```bash
./stop-local.sh
```

### View logs
```bash
# All services
docker compose -f docker-compose.local.yml logs -f

# Specific service
docker compose -f docker-compose.local.yml logs -f waflow
```

### Access MySQL
```bash
docker compose -f docker-compose.local.yml exec mysql \
  mysql -uwaflow -pwaflowpassword waflow

# Or use a GUI tool:
# Host: 127.0.0.1:3306
# User: waflow
# Password: waflowpassword
# Database: waflow
```

### Access Redis
```bash
docker compose -f docker-compose.local.yml exec redis redis-cli

# Commands in redis-cli:
PING              # Test connection
INFO              # Server info
KEYS *            # List all keys
FLUSHALL          # Clear all data (dev only!)
```

### Check service status
```bash
docker compose -f docker-compose.local.yml ps
```

### Restart specific service
```bash
docker compose -f docker-compose.local.yml restart waflow
```

### Full reset (delete all data)
```bash
# Stop services
./stop-local.sh

# Delete volumes
docker volume rm waflow-mysql-local waflow-redis-local

# Start fresh
./start-local.sh
```

---

## Development Workflow

### 1. Make backend changes
Edit files in `server/` directory.

Restart the app:
```bash
docker compose -f docker-compose.local.yml restart waflow
```

### 2. Make frontend changes (if developing frontend)
Frontend runs via Vite dev server on port 5173:
```bash
# In a separate terminal
pnpm dev
```

Access at: `http://localhost:5173`

API automatically proxies to `http://localhost:3000`

### 3. Make database changes
Edit `drizzle/schema.ts`, then:
```bash
# Generate migration
pnpm drizzle:generate

# Apply migration
docker compose -f docker-compose.local.yml exec -T waflow \
  npx drizzle-kit migrate:mysql
```

### 4. Test WhatsApp integration
Scan QR code in Settings → WhatsApp for testing.

For Meta Cloud API testing, update `.env` with your credentials.

---

## Configuration

### Change AI Provider

Edit `.env`:

**Option 1: Ollama (Local, Recommended)**
```bash
# Install Ollama on Mac first:
# brew install ollama
# Then run: ollama serve

AI_API_URL=http://host.docker.internal:11434/v1
AI_API_KEY=ollama
AI_MODEL=mistral:latest
```

**Option 2: Groq (Cloud, Free)**
```bash
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_your_key_here
AI_MODEL=llama-3.1-8b-instant
```

**Option 3: OpenAI (Paid)**
```bash
AI_API_URL=https://api.openai.com/v1
AI_API_KEY=sk-your_key_here
AI_MODEL=gpt-4o-mini
```

After changing, restart:
```bash
docker compose -f docker-compose.local.yml restart waflow
```

### Enable Email (Optional)
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL=your-email@gmail.com
ALERTS_ENABLED=true
```

Then restart:
```bash
docker compose -f docker-compose.local.yml restart waflow
```

---

## Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker ps

# Check logs
docker compose -f docker-compose.local.yml logs

# Try rebuilding
docker compose -f docker-compose.local.yml build --no-cache
```

### Port already in use
```bash
# Find what's using the port
lsof -i :3000

# Kill it
kill -9 <PID>

# Or restart your services:
./stop-local.sh && ./start-local.sh
```

### Can't connect to database
```bash
# Check MySQL is running
docker compose -f docker-compose.local.yml exec mysql mysqladmin ping

# Check connection string in .env
cat .env | grep DATABASE_URL

# Try connecting manually
docker compose -f docker-compose.local.yml exec mysql \
  mysql -uwaflow -pwaflowpassword -e "SELECT 1"
```

### App won't start
```bash
# Check logs
docker compose -f docker-compose.local.yml logs waflow --tail=50

# Common issues:
# 1. Database not initialized
# 2. Port 3000 already in use
# 3. Wrong environment variables

# Try fresh rebuild:
./stop-local.sh
docker compose -f docker-compose.local.yml build --no-cache
./start-local.sh
```

### High disk space usage
```bash
# Docker can use a lot of space
# Clean up unused images:
docker image prune -a

# Clean up volumes:
docker volume prune

# Check space used:
docker system df
```

---

## Development Tips

### Hot reload code changes
Place this in a new terminal:
```bash
# Watch for changes and rebuild
docker compose -f docker-compose.local.yml exec waflow npm run dev
```

### Debug with logs
```bash
# Follow logs with timestamps
docker compose -f docker-compose.local.yml logs -f --timestamps waflow

# Search for errors
docker compose -f docker-compose.local.yml logs waflow | grep -i error
```

### Test API endpoints
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test login endpoint
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@waflow.com","password":"admin123"}'
```

### Database queries
```bash
docker compose -f docker-compose.local.yml exec mysql \
  mysql -uwaflow -pwaflowpassword waflow << EOF
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as conversation_count FROM conversations;
SELECT COUNT(*) as customer_count FROM customers;
EOF
```

---

## Running Both Local and Staging

If you want to run both local and staging:

```bash
# Local uses different ports:
# - MySQL: 3306
# - Redis: 6379
# - App: 3000

# Staging uses different compose file:
# - Use: docker-compose.staging.yml
# - MySQL: 3307 (different!)
# - Redis: 6380 (different!)
# - App: 3001 (optional, use Nginx)

# They won't conflict!
```

---

## Performance Tuning

For local development, these are already optimized:
- `WORKER_CONCURRENCY=50` (instead of 200 for staging)
- `DB_CONNECTION_LIMIT=100` (instead of 300 for staging)
- `innodb-buffer-pool-size=1G` (instead of 2G for staging)

If you experience slowness:
```bash
# Check Docker resource allocation
docker stats

# Increase Docker memory limit in Docker Desktop:
# Preferences → Resources → Memory: 8GB+
```

---

## Next Steps

### After local testing passes:
1. Deploy to staging server
2. Run load tests
3. Deploy to production

---

## Useful Links

- Docker Desktop: https://www.docker.com/products/docker-desktop
- Docker Compose Docs: https://docs.docker.com/compose/
- WAFlow GitHub: (your repo URL)
- WAFlow Architecture: See `CLAUDE.md`

---

**Status:** Ready for local development
**Created:** April 24, 2026
