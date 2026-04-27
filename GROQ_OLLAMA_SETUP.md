# Groq + Ollama Dual Model Setup

## Overview

Use **Groq** (fast cloud) as primary AI and **Ollama** (local free) as fallback.

- **Groq:** 100-200ms response, free tier, cloud-based
- **Ollama:** 300-800ms response, 100% free, local/private

### Best Strategy: Fallback

```
User message
    ↓
Try Groq (200ms)
    ↓
✓ Success → Send response (DONE)
✗ Timeout → Try Ollama (500ms)
    ↓
Always have answer ✓
```

---

## Quick Setup

### 1. Get Groq API Key (2 minutes)

- Go to **groq.com**
- Sign up (free)
- Create API key
- Copy: `gsk_...`

### 2. Install Ollama (5 minutes)

**Mac/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Or:** Visit [ollama.ai](https://ollama.ai)

### 3. Download Ollama Model (First time, ~5 min)

```bash
ollama pull mistral
# or
ollama pull llama2
# or
ollama pull neural-chat  (smaller, faster)
```

### 4. Start Ollama Server

```bash
ollama serve
# Runs on http://localhost:11434
```

Keep this running in background (can use `nohup` or systemd)

### 5. Update .env File

```env
# Primary - Groq (Fast Cloud)
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_your_groq_key_here
AI_MODEL=llama-3.1-8b-instant

# Fallback - Ollama (Local)
FALLBACK_AI_ENABLED=true
FALLBACK_AI_URL=http://localhost:11434/v1
FALLBACK_AI_KEY=ollama
FALLBACK_AI_MODEL=mistral
FALLBACK_AI_TIMEOUT=5000  # ms
```

---

## Implementation

### Database Schema Update

Add to `botConfig` table in `drizzle/schema.ts`:

```typescript
// Fallback AI Configuration
fallbackAiEnabled: boolean(true).default(true),
fallbackAiModel: varchar("fallback_ai_model", { length: 100 }).default("mistral"),
fallbackAiUrl: varchar("fallback_ai_url", { length: 255 }).default("http://localhost:11434/v1"),
fallbackAiKey: text("fallback_ai_key").default("ollama"),
fallbackAiTimeout: int("fallback_ai_timeout").default(5000),
usedFallbackCount: int("used_fallback_count").default(0), // tracking
```

### Message Pipeline Implementation

Update `server/whatsapp/messagePipeline.ts`:

```typescript
async function handleMessage(msg) {
  let response;
  let usedFallback = false;

  try {
    // Try Groq first (fast)
    response = await callModel(
      msg,
      config.aiModel,
      config.aiApiUrl,
      config.aiApiKey,
      { timeout: 3000 }  // 3 second timeout
    );
    
    console.log(`✅ Groq responded in time`);

  } catch (groqError) {
    // Groq failed/timeout → fallback to Ollama
    console.warn(`⚠️ Groq failed: ${groqError.message}. Trying Ollama...`);
    usedFallback = true;

    try {
      response = await callModel(
        msg,
        config.fallbackAiModel,
        config.fallbackAiUrl,
        config.fallbackAiKey,
        { timeout: config.fallbackAiTimeout || 5000 }
      );

      console.log(`✅ Ollama fallback succeeded`);

    } catch (ollErr) {
      console.error(`❌ Both Groq and Ollama failed:`, ollErr);
      response = "Sorry, I'm having trouble. Please try again.";
    }
  }

  // Save conversation
  await saveConversation({
    ...msg,
    response,
    source: usedFallback ? "ai-fallback" : "ai",
    usedFallback,
    modelUsed: usedFallback ? "ollama" : "groq"
  });

  // Send response
  await sendMessage(msg.tenantId, msg.phoneNumber, response, false, msg.chatId);

  // Log fallback usage (for monitoring)
  if (usedFallback) {
    console.log(`📊 Fallback used - Groq down for tenant ${msg.tenantId}`);
    io.to("dashboard").emit("alert:fallbackUsed", {
      tenantId: msg.tenantId,
      timestamp: new Date()
    });
  }
}
```

---

## Performance Expectations

| Scenario | Response Time | Quality | Cost |
|----------|---------------|---------|------|
| **Groq works (99% of time)** | 200ms ⚡ | Good | Free |
| **Groq timeout → Ollama** | 3500ms | Good | Free |
| **Both fail** | Error | N/A | $0 |

**Reality:** 99% of messages handled by Groq in 200ms. Groq fallback only happens when:
- Groq API is down
- Rate limit hit (30 calls/min on free tier)
- Network issue
- Very rare!

---

## Admin UI Configuration

Add to `AdminGlobalSettings.tsx`:

```tsx
// Add fallback model fields to form
<section className="mt-6 border-t pt-6">
  <h3>Fallback AI (Ollama)</h3>
  
  <label className="flex items-center gap-2 mb-4">
    <input 
      type="checkbox"
      checked={formData.fallbackEnabled}
      onChange={(e) => setFormData({
        ...formData,
        fallbackEnabled: e.target.checked
      })}
    />
    Enable Ollama Fallback
  </label>

  <input
    type="text"
    placeholder="Model (e.g., mistral)"
    value={formData.fallbackModel}
    onChange={(e) => setFormData({
      ...formData,
      fallbackModel: e.target.value
    })}
    className="input mb-4"
  />

  <input
    type="text"
    placeholder="URL (e.g., http://localhost:11434/v1)"
    value={formData.fallbackUrl}
    onChange={(e) => setFormData({
      ...formData,
      fallbackUrl: e.target.value
    })}
    className="input mb-4"
  />

  <input
    type="number"
    placeholder="Timeout (ms)"
    value={formData.fallbackTimeout}
    onChange={(e) => setFormData({
      ...formData,
      fallbackTimeout: parseInt(e.target.value)
    })}
    className="input"
  />
</section>
```

---

## Monitoring & Alerts

Track fallback usage:

```typescript
// In admin dashboard
const fallbackStats = await db.select({
  tenantId: conversations.tenantId,
  fallbackCount: sql<number>`COUNT(CASE WHEN used_fallback = true THEN 1 END)`,
  totalMessages: sql<number>`COUNT(*)`,
  fallbackRate: sql<number>`COUNT(CASE WHEN used_fallback = true THEN 1 END) / COUNT(*)`
}).from(conversations)
  .groupBy(conversations.tenantId);

// Alert if fallback rate > 5%
fallbackStats.forEach(stat => {
  if (stat.fallbackRate > 0.05) {
    console.warn(`⚠️ Tenant ${stat.tenantId}: ${(stat.fallbackRate*100).toFixed(1)}% fallback rate`);
  }
});
```

---

## Troubleshooting

### Ollama won't start

```bash
# Check if port 11434 is free
lsof -i :11434

# Try different port
ollama serve --port 11435

# Update .env
FALLBACK_AI_URL=http://localhost:11435/v1
```

### Groq rate limit (30 calls/min)

Your free tier has a limit. If hit:
1. Ollama fallback takes over ✓
2. Upgrade Groq to higher tier
3. Or use Ollama for all requests

### Ollama too slow

```bash
# Check if GPU is being used
ollama list

# If not using GPU:
# Install CUDA drivers for your GPU
# Then restart Ollama

# Or use smaller model
ollama pull neural-chat  # Smaller than mistral
```

### Groq API key invalid

```bash
# Test your key
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer gsk_YOUR_KEY"

# Should return list of models
```

---

## Best Practices

1. **Set Groq timeout to 3 seconds**
   - Fail fast → fallback quickly

2. **Keep Ollama running 24/7**
   - Use `nohup ollama serve &` or systemd service

3. **Monitor fallback rate**
   - Track when Ollama is being used

4. **Test fallback monthly**
   - Intentionally kill Groq to verify Ollama works

5. **Use different models if needed**
   - Groq: Quick responses (8B models are optimal)
   - Ollama: Complex reasoning (can use larger models locally)

---

## Cost Analysis

### Groq Free Tier
- 30 API calls/min
- Unlimited messages/month
- ~3000 messages/day possible
- Perfect for most use cases

### Ollama
- 100% FREE
- No API calls
- Runs locally
- Unlimited usage

### Combined (Groq + Ollama)
- **Total monthly cost: $0** (if within Groq free tier)
- If you exceed Groq limits, upgrade plan ($5-50/month)
- Ollama always free as fallback

---

## Example Flow Logs

```
User sends message at 12:00:00
├─ Groq API call starts
├─ Response received in 180ms ✓
├─ Message sent to user
├─ Saved: source=ai, modelUsed=groq
└─ Done

User sends message at 12:00:05
├─ Groq API call starts
├─ Timeout after 3000ms ✗
├─ Fallback to Ollama starts
├─ Ollama response in 450ms ✓
├─ Message sent to user
├─ Saved: source=ai-fallback, modelUsed=ollama
├─ Alert sent to dashboard: "Fallback used"
└─ Done
```

---

## Files to Modify

1. `drizzle/schema.ts` — Add fallback fields
2. `server/whatsapp/messagePipeline.ts` — Add fallback logic
3. `.env` — Add Groq + Ollama configs
4. `client/src/pages/AdminGlobalSettings.tsx` — UI for settings (optional)

---

## Summary

✅ **Fast:** Groq responds in 200ms  
✅ **Reliable:** Ollama fallback always available  
✅ **Free:** $0 cost (within free tiers)  
✅ **Private:** Ollama runs locally  
✅ **Simple:** Just add error handling + fallback  

Perfect combination for production WhatsApp chatbots! 🚀
