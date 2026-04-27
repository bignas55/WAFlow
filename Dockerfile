FROM node:20-alpine

# Install Chromium and dependencies for WhatsApp Web.js (WWJS)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    python3 \
    make \
    g++

# Set Chrome executable path for WWJS/Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (without --frozen-lockfile so pnpm detects Linux platform)
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY server ./server
COPY client ./client
COPY drizzle ./drizzle
COPY shared ./shared
COPY tsconfig.json tsconfig.json
COPY drizzle.config.ts drizzle.config.ts

# Copy entrypoint script
COPY docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy pre-built application (build locally, it works there)
COPY dist ./dist

# Verify files exist
RUN test -f /app/dist/server/index.js || { echo "ERROR: dist not built. Run 'pnpm build' locally first"; exit 1; }

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Start application with entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
