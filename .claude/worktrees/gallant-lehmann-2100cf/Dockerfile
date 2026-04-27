# ══════════════════════════════════════════════════════════════════════════════
#  WAFlow — Production Dockerfile
#  Multi-stage build:
#    Stage 1 (deps)    — install ALL dependencies (including dev) for building
#    Stage 2 (builder) — compile the React frontend with Vite
#    Stage 3 (runner)  — lean production image with Chromium for WWJS + tsx
#
#  Build:  docker build -t waflow .
#  Run:    docker compose up -d
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Install all dependencies ────────────────────────────────────────
FROM node:20-slim AS deps

RUN npm install -g pnpm@9

WORKDIR /app

# Copy manifests first so Docker can cache the install layer
COPY package.json pnpm-lock.yaml* ./

# Install ALL deps (dev too — Vite is needed in the build stage).
# Not using --frozen-lockfile so builds don't break when package.json
# is updated and the lockfile hasn't been committed yet.
RUN pnpm install --no-frozen-lockfile


# ── Stage 2: Build the React frontend ────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile the React SPA → dist/client
RUN pnpm run build:client


# ── Stage 3: Lean production runner ──────────────────────────────────────────
FROM node:20-slim AS runner

# ── Chromium + system libs required by whatsapp-web.js / Puppeteer ───────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer where Chromium lives and skip its own download
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# Install pnpm + tsx globally.
# tsx is the TypeScript runtime — it runs server/index.ts directly in production
# (same as PM2 does via --import tsx/esm). No separate tsc compile step needed.
RUN npm install -g pnpm@9 tsx

WORKDIR /app

# ── Production-only dependencies ─────────────────────────────────────────────
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile --prod

# ── Application source ────────────────────────────────────────────────────────
# TypeScript source — executed at runtime by tsx
COPY --from=builder /app/server          ./server
COPY --from=builder /app/shared          ./shared
COPY --from=builder /app/drizzle         ./drizzle
COPY --from=builder /app/tsconfig.json   ./tsconfig.json
COPY --from=builder /app/run-migrations.cjs ./run-migrations.cjs

# Compiled React frontend — served as static files by Express
COPY --from=builder /app/dist/client ./dist/client

# ── Persistent data directories ───────────────────────────────────────────────
RUN mkdir -p .wwebjs_auth uploads

# ── Startup script ────────────────────────────────────────────────────────────
# 1. Run Drizzle migrations (idempotent — safe on every restart)
# 2. Seed initial admin user only if the users table is empty (first boot)
# 3. Start the server
COPY --from=builder /app/drizzle/seed.ts ./drizzle/seed.ts
RUN printf '#!/bin/sh\n\
set -e\n\
echo "▶ Running DB migrations..."\n\
node run-migrations.cjs\n\
echo "▶ Seeding initial data (skipped if already exists)..."\n\
tsx drizzle/seed.ts || echo "⚠️  Seed skipped or already applied"\n\
echo "▶ Starting WAFlow..."\n\
exec tsx server/index.ts\n' \
    > /app/start.sh && chmod +x /app/start.sh

# ── Expose & health ───────────────────────────────────────────────────────────
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["/bin/sh", "/app/start.sh"]
