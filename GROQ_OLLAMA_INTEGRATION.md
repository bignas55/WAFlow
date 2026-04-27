# Groq + Ollama Integration Guide

## Files Created

1. **`server/services/dualAiService.ts`** — Handles dual model logic
2. **`GROQ_OLLAMA_SETUP.md`** — Complete setup guide

## How to Use

### In Your Message Pipeline

Replace the old AI call with the new fallback-enabled call:

```typescript
import { callAiWithFallback } from "../services/dualAiService.js";

// In your message handler:
async function handleMessage(msg) {
  // ... existing code ...
  
  // OLD WAY (no fallback):
  // const response = await callModel(msg.text, systemPrompt);
  
  // NEW WAY (with fallback):
  const aiResult = await callAiWithFallback(
    msg.messageText,
    config.systemPrompt,
    {
      model: config.aiModel,                          // llama-3.1-8b-instant
      apiUrl: config.aiApiUrl,                        // groq url
      apiKey: decrypt(config.aiApiKey || ""),         // groq key
    },
    {
      enabled: config.fallbackAiEnabled,              // true
      model: config.fallbackAiModel,                  // mistral
      apiUrl: config.fallbackAiUrl,                   // localhost:11434
      apiKey: config.fallbackAiKey,                   // ollama
    },
    {
      tenantId: msg.tenantId,
      timeout: 3000,                                  // Groq timeout
      logFallback: true,                              // Log when using fallback
    }
  );

  // Check result
  if (!aiResult.success) {
    throw new Error("AI service unavailable");
  }

  console.log(`✅ Response from: ${aiResult.model}`);
  console.log(`⏱️  Time: ${aiResult.responseTime}ms`);
  console.log(`🔄 Used fallback: ${aiResult.usedFallback}`);

  // Save to database
  await saveConversation({
    ...msg,
    response: aiResult.response,
    source: "ai",
    modelUsed: aiResult.model,
    usedFallback: aiResult.usedFallback,
    responseTimeMs: aiResult.responseTime,
  });

  // Send message
  await sendMessage(msg.tenantId, msg.phoneNumber, aiResult.response);
}
```

### Database Schema Update

Add these fields to `botConfig` table:

```typescript
// In drizzle/schema.ts, add to botConfig:

// Fallback AI (Ollama)
fallbackAiEnabled: boolean("fallback_ai_enabled").default(true).notNull(),
fallbackAiModel: varchar("fallback_ai_model", { length: 100 }).default("mistral").notNull(),
fallbackAiUrl: varchar("fallback_ai_url", { length: 255 }).default("http://localhost:11434/v1").notNull(),
fallbackAiKey: text("fallback_ai_key").default("ollama").notNull(),

// Tracking
usedFallbackCount: int("used_fallback_count").default(0).notNull(),
```

Then run:
```bash
pnpm drizzle:generate
pnpm drizzle:migrate
```

### Environment Variables

Add to `.env`:

```env
# Primary AI - Groq
AI_API_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_your_key_here
AI_MODEL=llama-3.1-8b-instant

# Fallback AI - Ollama
FALLBACK_AI_ENABLED=true
FALLBACK_AI_URL=http://localhost:11434/v1
FALLBACK_AI_KEY=ollama
FALLBACK_AI_MODEL=mistral
```

### Admin Settings UI Update

Add to `AdminGlobalSettings.tsx`:

```tsx
// Add fallback model fields
const [formData, setFormData] = useState({
  // ... existing fields ...
  fallbackEnabled: true,
  fallbackModel: "mistral",
  fallbackUrl: "http://localhost:11434/v1",
  fallbackKey: "ollama",
});

// Add form inputs
<div className="mt-6 border-t pt-6">
  <h3 className="text-lg font-semibold mb-4">Fallback AI (Ollama)</h3>
  
  <label className="flex items-center gap-2 mb-4">
    <input 
      type="checkbox"
      checked={formData.fallbackEnabled}
      onChange={(e) => setFormData({
        ...formData,
        fallbackEnabled: e.target.checked
      })}
    />
    <span>Enable Ollama Fallback</span>
  </label>

  <input
    name="fallbackModel"
    placeholder="Model (e.g., mistral, llama2)"
    value={formData.fallbackModel}
    onChange={handleChange}
    className="w-full px-3 py-2 border rounded-md mb-4"
  />

  <input
    name="fallbackUrl"
    placeholder="URL (e.g., http://localhost:11434/v1)"
    value={formData.fallbackUrl}
    onChange={handleChange}
    className="w-full px-3 py-2 border rounded-md"
  />
</div>
```

## Health Check Utility

Monitor AI service health:

```typescript
import { isGroqAvailable, isOllamaAvailable } from "../services/dualAiService.js";

// Check health periodically
setInterval(async () => {
  const groqHealth = await isGroqAvailable(process.env.AI_API_KEY || "");
  const ollamaHealth = await isOllamaAvailable(
    process.env.FALLBACK_AI_URL || "http://localhost:11434/v1"
  );

  console.log(`📊 AI Health - Groq: ${groqHealth ? "✓" : "✗"}, Ollama: ${ollamaHealth ? "✓" : "✗"}`);

  if (!groqHealth && !ollamaHealth) {
    console.error("⚠️ WARNING: Both AI models are down!");
    // Send alert to admin
    io.to("dashboard").emit("alert:aiServiceDown");
  }
}, 60000); // Check every minute
```

## Testing

### Test Groq Only

```bash
# Send a message
# Should get response in ~200ms
# Check logs: "Primary AI (Groq) responded in XXXms"
```

### Test Fallback

```bash
# Stop Ollama
killall ollama

# Send a message
# Should use Groq (200ms)
# Logs: "Primary AI (Groq) responded..."

# Stop Groq by commenting out API key
# Send a message
# Logs: "⚠️ Primary AI failed..."
#       "❌ Both primary and fallback AI failed"

# Restart Ollama
ollama serve

# Send a message again
# Should fallback to Ollama
# Logs: "✅ Fallback AI (Ollama) responded in XXXms"
```

## Monitoring Dashboard Widget

Display in admin dashboard:

```typescript
// Fetch stats
const stats = await db.select({
  totalMessages: count(),
  groqMessages: count(where(eq(conversations.modelUsed, "groq"))),
  fallbackMessages: count(where(eq(conversations.modelUsed, "ollama"))),
  avgResponseTime: avg(conversations.responseTimeMs),
}).from(conversations)
  .where(gte(conversations.createdAt, oneHourAgo));

// Display
<div className="grid grid-cols-3 gap-4">
  <div>
    <p className="text-gray-600">Groq Messages</p>
    <p className="text-2xl font-bold">{stats.groqMessages}</p>
  </div>
  <div>
    <p className="text-gray-600">Fallback Messages</p>
    <p className="text-2xl font-bold text-orange-600">{stats.fallbackMessages}</p>
  </div>
  <div>
    <p className="text-gray-600">Avg Response</p>
    <p className="text-2xl font-bold">{stats.avgResponseTime}ms</p>
  </div>
</div>
```

## Cost Summary

- **Groq Free Tier:** 30 API calls/min → ~3000 messages/day → ~$0
- **Ollama Local:** Unlimited → ~$0
- **Combined:** $0/month (if within Groq free tier)

If you exceed Groq limits:
- Ollama automatically takes over
- No service interruption
- Slightly slower (500ms vs 200ms) but still acceptable

## Troubleshooting

### Ollama connection refused
```bash
# Make sure Ollama is running
ollama serve

# Check if listening
curl http://localhost:11434/api/tags
```

### Groq API key invalid
```bash
# Test your key
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer gsk_YOUR_KEY"
```

### Ollama too slow (needs GPU)
```bash
# Install CUDA drivers for your GPU
# Then restart Ollama

# Or use smaller model
ollama pull neural-chat
```

## Next Steps

1. ✅ Create `dualAiService.ts` (DONE)
2. Import in message pipeline
3. Update `botConfig` schema
4. Add `.env` variables
5. Update admin UI (optional)
6. Test with both models
7. Monitor fallback rate
8. Deploy!

---

**Your WAFlow now has bulletproof AI with zero downtime!** 🚀
