# API Key Fallback System — Configuration Guide

## Overview

WAFlow now supports a **smart fallback system** for API keys:

1. **Check tenant-specific API key** (if configured in Settings)
2. **Fall back to `.env` default** (if tenant hasn't configured one)
3. **Error only if BOTH are missing**

This means:
- ✅ **Admin** sets `GROQ_API_KEY`, `CLAUDE_API_KEY` in `.env` once
- ✅ **Individual tenants** can leave Configuration blank and use the defaults
- ✅ **Individual tenants** can override with their own keys if they want

## How It Works

### For Regular Message Processing

When a message arrives, the system uses this priority:

```
Groq/OpenAI/Ollama:
1. Use form.aiApiKey if configured
2. Fall back to process.env.AI_API_KEY from .env
3. Default: "ollama" (for local Ollama)

Claude:
1. Use form.claudeApiKey if configured
2. Fall back to process.env.CLAUDE_API_KEY from .env
```

**Code references:**
- `messagePipeline.ts` line 1771-1772: `const apiKey = decrypt(config.aiApiKey || "") || process.env.AI_API_KEY || "ollama";`
- `messagePipeline.ts` line 2024: `const claudeApiKey = decrypt(config.claudeApiKey || "") || process.env.CLAUDE_API_KEY || "";`

### For Configuration Validation

The `checkAI` endpoint (used to validate settings) now:
1. Checks if tenant has custom key
2. Falls back to `.env` key
3. Returns which source is being used (`tenant` or `env`)

**Code reference:** `botConfigRouter.ts` lines 344-365

## Setup Instructions

### Option 1: Use `.env` Defaults (Recommended for Admin)

**What to do:**
1. Set API keys in `.env` file:
   ```bash
   GROQ_API_KEY=gsk_yourgroqkey...
   CLAUDE_API_KEY=sk-ant_yourclaudekey...
   AI_API_URL=https://api.groq.com/openai/v1
   AI_API_KEY=gsk_yourgroqkey...
   ```

2. In Configuration page:
   - Leave API key fields **blank** (or don't fill them in)
   - Labels show: "**optional — leave blank to use .env default**"
   - System automatically uses `.env` keys

3. No need to configure anything per tenant!

### Option 2: Tenant Override (For Multi-API Setup)

If a **single tenant** wants to use their own API key:

1. In Configuration page:
   - Enter their custom API key
   - System uses **their key** instead of `.env` default

2. Other tenants without custom keys still use `.env` defaults

### Option 3: Per-Tenant Keys (Full Multi-Tenant)

If you want **each tenant** to bring their own keys:

1. Leave `.env` empty (or with dummy values)
2. Each tenant fills in their API keys in Configuration
3. System uses tenant-specific keys exclusively

## Configuration Page Updates

The Configuration UI now clearly indicates:

```
Groq API Key
(optional — leave blank to use .env default)
```

This tells users they don't need to fill it in if they're using the `.env` default.

## Example `.env` File

```bash
# AI Configuration — used as default for all tenants
GROQ_API_KEY=gsk_...yourkey...
CLAUDE_API_KEY=sk-ant_...yourkey...

# Groq endpoint
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...yourkey...

# Or for Ollama
# AI_API_URL=http://localhost:11434/v1
# AI_API_KEY=ollama
```

## Priority Matrix

| Scenario | Tenant Key Set? | `.env` Key? | Result |
|----------|---|---|---|
| Admin setup, all tenants | No | Yes | ✅ Use `.env` |
| Tenant overrides | Yes | Yes | ✅ Use tenant key |
| Missing config | No | No | ❌ Error message |
| Tenant removes override | Empty string | Yes | ✅ Use `.env` |

## What Was Changed

### Backend (`botConfigRouter.ts`)
- Updated `checkAI` procedure to fall back to `.env` keys
- Returns `source: 'tenant' | 'env'` to indicate which key is active

### Frontend (`Configuration.tsx`)
- API key input labels now show: `(optional — leave blank to use .env default)`
- Placeholders suggest: `(or leave empty)`
- All three providers (Groq, Claude, OpenAI) support fallback

### Message Pipeline (`messagePipeline.ts`)
- Already had fallback logic implemented
- No changes needed — continues to work as before

## Testing

To verify the fallback system is working:

1. **Set `.env` keys:**
   ```bash
   GROQ_API_KEY=gsk_...
   CLAUDE_API_KEY=sk-ant_...
   ```

2. **In Configuration page:**
   - Leave API key fields blank
   - Select Groq or Claude provider
   - Click "Test AI Configuration" (checkAI)
   - Should show ✅ **Connected**

3. **Send a message:**
   - Should work immediately using `.env` keys
   - No tenant configuration needed

4. **Override with tenant key (optional):**
   - Fill in a different API key
   - Should use the tenant key instead
   - checkAI should show source as `tenant`

## Troubleshooting

### "No AI API key configured" error
- Check that `CLAUDE_API_KEY` is set in `.env`
- OR fill in the Claude API key in Configuration

### "AI endpoint returned 401"
- API key is invalid or expired
- Check `GROQ_API_KEY` or `AI_API_KEY` in `.env`
- Or fill in the correct key in Configuration

### "Connection failed"
- For Groq: Check `AI_API_URL` is `https://api.groq.com/openai/v1`
- For Ollama: Check local Ollama is running at `http://localhost:11434`
- Override in Configuration if using different endpoint

## Security Notes

- ✅ `.env` keys are never exposed to frontend
- ✅ Tenant-specific keys are encrypted in database
- ✅ Encryption is handled by `encryptIfNeeded()` before DB storage
- ✅ Decryption only happens on backend when making API calls
