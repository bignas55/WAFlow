# WAFlow Quick Start Guide

## Prerequisites

- **Node.js 18+** — `node -v`
- **pnpm 8+** — `npm install -g pnpm@8`
- **MySQL 8/9** — `brew install mysql && brew services start mysql`
- **Ollama** — `brew install ollama && ollama serve`

---

## First-Time Setup

### 1. Create the database

```bash
# MySQL 9 with no root password (default after brew install):
mysql -u root -e "CREATE DATABASE IF NOT EXISTS waflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# MySQL with a root password:
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS waflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2. Configure environment

The `.env` file is included with sensible defaults. If MySQL has a password:
```bash
# Edit DATABASE_URL in .env:
DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/waflow
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run migrations + seed

```bash
pnpm drizzle:migrate   # creates all tables
pnpm db:seed           # adds admin user + demo data
```

### 5. Pull the AI model (Ollama)

```bash
ollama pull llama3.2   # ~2GB download, run once
```

### 6. Start the dev server

```bash
pnpm dev
```

Open **http://localhost:5173** — Login: `admin@waflow.com` / `admin123`

---

## Daily Use

```bash
ollama serve &           # start Ollama AI
brew services start mysql  # start MySQL
pnpm dev                 # start WAFlow
```

---

## Connect WhatsApp (Optional)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create an app → Add WhatsApp product
3. From **WhatsApp > API Setup**, copy Phone Number ID + Access Token
4. In WAFlow: **Configuration → WhatsApp** → paste your credentials
5. Webhook URL: `https://yourdomain.com/api/webhooks/whatsapp`
6. For local dev use ngrok: `ngrok http 3000`

---

## AI Model Options

| Model | Size | Best For |
|---|---|---|
| `llama3.2` | 2.0GB | General purpose (default) |
| `llama3.2:1b` | 1.3GB | Low-resource / fast |
| `mistral` | 4.1GB | High quality |
| `qwen2.5:3b` | 1.9GB | Multilingual |
| `gemma2:2b` | 1.6GB | Ultra-lightweight |

Switch models in **Configuration → AI & Model**.

---

## Troubleshooting

**Cannot GET / (blank page or 404):**
- Open http://localhost:**5173** (frontend), NOT port 3000 (API only)
- Run `pnpm dev` from the project root

**MySQL access denied:**
```bash
brew services list | grep mysql    # check MySQL is running
mysql -u root -e "SHOW DATABASES;" # verify connection
# Then check DATABASE_URL in .env
```

**"Unknown column" migration error:**
```bash
# Drop and recreate the database, then re-run:
mysql -u root -e "DROP DATABASE waflow; CREATE DATABASE waflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
pnpm drizzle:migrate
pnpm db:seed
```

**Port already in use:**
```bash
kill -9 $(lsof -ti:3000)   # kill API server
kill -9 $(lsof -ti:5173)   # kill frontend
pnpm dev
```

**Ollama not responding:**
```bash
ollama serve &
curl http://localhost:11434/api/tags   # should list models
```

**Tailwind styles missing:**
- Hard refresh: Cmd+Shift+R
- Restart dev server: Ctrl+C then pnpm dev
