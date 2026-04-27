#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# waflow-check.sh
# Full project error scan + update recommendations using Ollama waflow-dev
#
# Usage:
#   ./scripts/waflow-check.sh             # Full check (errors + recommendations)
#   ./scripts/waflow-check.sh errors      # Only scan for bugs/errors
#   ./scripts/waflow-check.sh updates     # Only recommend improvements
#   ./scripts/waflow-check.sh file <path> # Check a single file
#   ./scripts/waflow-check.sh ts          # TypeScript errors only
# ─────────────────────────────────────────────────────────────────────────────

MODEL="waflow-dev"
MODE="${1:-full}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}WAFlow Project Scanner — Model: $MODEL${NC}"
echo "────────────────────────────────────────"

# ── Helper: run a prompt through Ollama ───────────────────────────────────────
ask_ollama() {
  local label="$1"
  local prompt="$2"
  echo -e "\n${BOLD}${GREEN}▶ $label${NC}"
  echo "────────────────────────────────────────"
  echo "$prompt" | ollama run "$MODEL"
  echo ""
}

# ── Collect TypeScript errors ─────────────────────────────────────────────────
get_ts_errors() {
  echo -e "${YELLOW}Running TypeScript check...${NC}"
  npx tsc --noEmit 2>&1 || true
}

# ── Read a batch of files with headers ────────────────────────────────────────
read_files() {
  for f in "$@"; do
    if [ -f "$f" ]; then
      echo "=== $f ==="
      cat "$f"
      echo ""
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# MODE: ts — TypeScript errors only
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "ts" ]; then
  TS_ERRORS=$(get_ts_errors)
  if [ -z "$TS_ERRORS" ]; then
    echo -e "${GREEN}✅ No TypeScript errors found.${NC}"
    exit 0
  fi
  ask_ollama "TypeScript Errors" "
These are the current TypeScript compiler errors for the WAFlow project:

$TS_ERRORS

For each error:
1. State the file and line
2. Explain the root cause in one sentence
3. Show the exact fix (before/after code)

Do not explain TypeScript theory — just fix each one."
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# MODE: file — Check a single file
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "file" ]; then
  TARGET="$2"
  if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
    echo -e "${RED}Usage: ./scripts/waflow-check.sh file <path>${NC}"
    exit 1
  fi
  ask_ollama "Checking $TARGET" "
Review this WAFlow file for ALL of the following:

BUGS:
- Missing encryptIfNeeded() when writing aiApiKey or aiFallbackApiKey to DB
- Missing decrypt() when reading aiApiKey back to frontend
- Using result.insertId directly instead of getInsertId(result)
- Dynamic import() of CJS modules (bcryptjs, etc.) — must be static import
- DB queries missing tenantId filter
- Null/undefined access that could crash at runtime (.split on null, etc.)

SECURITY:
- Any plain-text storage of sensitive fields
- Missing rate limiting on public endpoints
- Missing input validation

CODE QUALITY:
- Repeated code that should be extracted
- Missing error handling on DB queries
- Hardcoded values that should come from env or config

=== $TARGET ===
$(cat "$TARGET")

List every issue with file path + line number + fix. If nothing found, say so clearly."
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 1 — Auth + Security layer
# ─────────────────────────────────────────────────────────────────────────────
run_batch_1() {
  echo -e "${YELLOW}Scanning Batch 1: Auth + Security...${NC}"
  FILES=$(read_files \
    server/routers/authRouter.ts \
    server/trpc.ts \
    server/auth.ts \
    server/middleware/rateLimiter.ts \
    server/services/encryptionService.ts \
    server/services/totpService.ts)

  ask_ollama "Batch 1: Auth + Security" "
Scan these WAFlow auth/security files for bugs and issues:

$FILES

Check for:
- JWT passwordVersion validation gaps
- bcrypt dynamic import (must be static)
- Missing encryption on sensitive field writes
- Rate limiter not applied to correct tRPC paths (must use regex, not string)
- Any hardcoded secrets or weak defaults
- Missing input sanitization

List every issue: file, line, problem, fix."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 2 — Core routers
# ─────────────────────────────────────────────────────────────────────────────
run_batch_2() {
  echo -e "${YELLOW}Scanning Batch 2: Core Routers...${NC}"
  FILES=$(read_files \
    server/routers/botConfigRouter.ts \
    server/routers/usersRouter.ts \
    server/routers/conversationsRouter.ts \
    server/routers/templatesRouter.ts \
    server/routers/appointmentsRouter.ts)

  ask_ollama "Batch 2: Core Routers" "
Scan these WAFlow routers for bugs:

$FILES

Check every DB insert for: getInsertId() usage (not raw .insertId)
Check every bot_config write for: encryptIfNeeded() on aiApiKey
Check every bot_config read returned to frontend for: decrypt() on aiApiKey
Check every SELECT/UPDATE/DELETE for: tenantId filter present
Check for: null/undefined runtime crashes

List every issue: file, line, problem, fix."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 3 — Feature routers
# ─────────────────────────────────────────────────────────────────────────────
run_batch_3() {
  echo -e "${YELLOW}Scanning Batch 3: Feature Routers...${NC}"
  FILES=$(read_files \
    server/routers/knowledgeBaseRouter.ts \
    server/routers/staffRouter.ts \
    server/routers/crmRouter.ts \
    server/routers/broadcastRouter.ts \
    server/routers/analyticsRouter.ts \
    server/routers/menuOptionsRouter.ts)

  ask_ollama "Batch 3: Feature Routers" "
Scan these WAFlow feature routers for bugs:

$FILES

Check every DB insert for: getInsertId() usage
Check every SELECT/UPDATE/DELETE for: tenantId filter
Check for: missing input validation, null crashes, wrong return types

List every issue: file, line, problem, fix."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 4 — WhatsApp + Message Pipeline
# ─────────────────────────────────────────────────────────────────────────────
run_batch_4() {
  echo -e "${YELLOW}Scanning Batch 4: WhatsApp + Pipeline...${NC}"
  FILES=$(read_files \
    server/whatsapp/WhatsAppWebManager.ts \
    server/whatsapp/WhatsAppBusinessAPI.ts \
    server/whatsapp/messagePipeline.ts)

  ask_ollama "Batch 4: WhatsApp + Pipeline" "
Scan these WAFlow WhatsApp files for bugs:

$FILES

Check for:
- Multi-tenancy violations (queries not filtered by tenantId)
- decrypt() called on aiApiKey/aiFallbackApiKey before use
- getInsertId() used for any inserts
- Static import of CJS modules (no dynamic import)
- Race conditions in client initialization
- Missing error handling that could crash the server

List every issue: file, line, problem, fix."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 5 — Services + AutoMigrate
# ─────────────────────────────────────────────────────────────────────────────
run_batch_5() {
  echo -e "${YELLOW}Scanning Batch 5: Services + AutoMigrate...${NC}"
  FILES=$(read_files \
    server/services/autoMigrate.ts \
    server/services/bookingFlow.ts \
    server/utils.ts \
    server/db.ts \
    server/index.ts)

  ask_ollama "Batch 5: Services + Core" "
Scan these WAFlow service files for bugs and missing items:

$FILES

For autoMigrate.ts specifically:
- Are all bot_config columns from schema.ts covered?
- Are all users table columns covered?
- Is encryptIfNeeded() used when updating aiApiKey?

For bookingFlow.ts:
- Are all DB inserts using getInsertId()?
- Are all queries filtered by tenantId?

For index.ts:
- Are rate limiters using regex paths (not strings)?
- Is there proper error handling?

List every issue: file, line, problem, fix."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 6 — Schema completeness check
# ─────────────────────────────────────────────────────────────────────────────
run_batch_6() {
  echo -e "${YELLOW}Scanning Batch 6: Schema + AutoMigrate alignment...${NC}"
  FILES=$(read_files \
    drizzle/schema.ts \
    server/services/autoMigrate.ts)

  ask_ollama "Batch 6: Schema vs AutoMigrate" "
Compare these two files:

$FILES

Task: Find every column defined in drizzle/schema.ts for the bot_config and users tables that is NOT covered by a migration in autoMigrate.ts.

For each missing column, show what entry to add to autoMigrate.ts MIGRATIONS array.

This is critical — missing columns cause 'Unknown column' MySQL errors that crash the server."
}

# ─────────────────────────────────────────────────────────────────────────────
# BATCH 7 — Update recommendations
# ─────────────────────────────────────────────────────────────────────────────
run_batch_7() {
  echo -e "${YELLOW}Generating update recommendations...${NC}"
  FILES=$(read_files \
    server/index.ts \
    server/routers.ts \
    server/trpc.ts \
    drizzle/schema.ts)

  ask_ollama "Update Recommendations" "
Review these WAFlow core files:

$FILES

Based on the project context (multi-tenant WhatsApp SaaS), recommend:

1. SECURITY improvements — anything missing that should be added
2. PERFORMANCE improvements — queries, caching, connection pooling
3. RELIABILITY improvements — error handling, retries, logging
4. MISSING FEATURES that are commonly needed in SaaS platforms
5. SCHEMA improvements — indexes, missing columns, constraints

Be specific — name the file and what to add/change. Skip anything already in place."
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN — run based on mode
# ─────────────────────────────────────────────────────────────────────────────
case "$MODE" in
  errors)
    TS_ERRORS=$(get_ts_errors)
    [ -n "$TS_ERRORS" ] && ask_ollama "TypeScript Errors" "Fix these TS errors:
$TS_ERRORS"
    run_batch_1
    run_batch_2
    run_batch_3
    run_batch_4
    run_batch_5
    run_batch_6
    ;;
  updates)
    run_batch_7
    ;;
  full|*)
    TS_ERRORS=$(get_ts_errors)
    [ -n "$TS_ERRORS" ] && ask_ollama "TypeScript Errors" "Fix these TS errors:
$TS_ERRORS"
    run_batch_1
    run_batch_2
    run_batch_3
    run_batch_4
    run_batch_5
    run_batch_6
    run_batch_7
    ;;
esac

echo -e "\n${BOLD}${GREEN}✅ Scan complete.${NC}"
