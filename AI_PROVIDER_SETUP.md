# AI Provider Selection — Setup Guide

You can now switch between **Ollama**, **Groq**, and **OpenAI** for your AI models.

---

## Backend API Endpoints

All endpoints are available at `/api/trpc/aiConfig.*`

### 1. Get Available Providers
```typescript
// GET /api/trpc/aiConfig.getProviders
const response = await trpcClient.aiConfig.getProviders.query();

// Returns:
{
  providers: [
    {
      id: "OLLAMA",
      name: "Ollama (Local)",
      requiresApiKey: false,
      models: [
        { id: "gemma4:latest", name: "Gemma 4 (Latest)" },
        { id: "llama2:latest", name: "Llama 2 (Latest)" },
        // ... more models
      ]
    },
    {
      id: "GROQ",
      name: "Groq (Cloud, Fast)",
      requiresApiKey: true,
      models: [
        { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Instant)" },
        // ... more models
      ]
    },
    {
      id: "OPENAI",
      name: "OpenAI (Reliable)",
      requiresApiKey: true,
      models: [
        { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast & Cheap)" },
        // ... more models
      ]
    }
  ]
}
```

### 2. Get Current Configuration
```typescript
// GET /api/trpc/aiConfig.getCurrentConfig
const config = await trpcClient.aiConfig.getCurrentConfig.query();

// Returns:
{
  provider: "OLLAMA",
  model: "gemma4:latest",
  apiUrl: "http://host.docker.internal:11434/v1",
  apiKey: ""
}
```

### 3. Update Provider & Model
```typescript
// PATCH /api/trpc/aiConfig.updateProvider
const result = await trpcClient.aiConfig.updateProvider.mutate({
  provider: "GROQ",
  model: "llama-3.1-8b-instant",
  apiKey: "your-groq-api-key" // Required for Groq/OpenAI
});

// Returns:
{
  success: true,
  provider: "GROQ",
  model: "llama-3.1-8b-instant"
}
```

### 4. Test Connection
```typescript
// POST /api/trpc/aiConfig.testConnection
const test = await trpcClient.aiConfig.testConnection.mutate({
  provider: "GROQ",
  apiKey: "your-groq-api-key" // Optional for testing
});

// Returns:
{
  success: true,
  message: "Groq connected. API key valid."
}
```

---

## Frontend Integration Example

```typescript
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export function AIConfigForm() {
  const [selectedProvider, setSelectedProvider] = useState("OLLAMA");
  const [selectedModel, setSelectedModel] = useState("gemma4:latest");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  // Load available providers
  const { data: providers } = trpc.aiConfig.getProviders.useQuery();

  // Load current config
  const { data: currentConfig } = trpc.aiConfig.getCurrentConfig.useQuery();

  // Update provider
  const updateMutation = trpc.aiConfig.updateProvider.useMutation({
    onSuccess: () => {
      alert("AI provider updated!");
    },
  });

  // Test connection
  const testMutation = trpc.aiConfig.testConnection.useMutation({
    onSuccess: (result) => {
      alert(result.message);
    },
  });

  const handleUpdateProvider = async () => {
    setLoading(true);
    try {
      await updateMutation.mutateAsync({
        provider: selectedProvider as "OLLAMA" | "GROQ" | "OPENAI",
        model: selectedModel,
        apiKey: selectedProvider !== "OLLAMA" ? apiKey : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      await testMutation.mutateAsync({
        provider: selectedProvider as "OLLAMA" | "GROQ" | "OPENAI",
        apiKey: selectedProvider !== "OLLAMA" ? apiKey : undefined,
      });
    } catch (err) {
      alert(`Connection failed: ${err}`);
    }
  };

  const currentProviderConfig = providers?.providers.find(
    (p) => p.id === selectedProvider
  );

  return (
    <div className="space-y-4 p-4 border rounded">
      <h2 className="text-xl font-bold">AI Configuration</h2>

      {/* Provider Selector */}
      <div>
        <label className="block text-sm font-medium mb-2">AI Provider</label>
        <select
          value={selectedProvider}
          onChange={(e) => {
            setSelectedProvider(e.target.value);
            // Reset to first available model for this provider
            if (currentProviderConfig?.models[0]) {
              setSelectedModel(currentProviderConfig.models[0].id);
            }
          }}
          className="w-full p-2 border rounded"
        >
          {providers?.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Model Selector */}
      <div>
        <label className="block text-sm font-medium mb-2">Model</label>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="w-full p-2 border rounded"
        >
          {currentProviderConfig?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* API Key Input (for Groq/OpenAI) */}
      {currentProviderConfig?.requiresApiKey && (
        <div>
          <label className="block text-sm font-medium mb-2">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${selectedProvider} API key`}
            className="w-full p-2 border rounded"
          />
          <p className="text-xs text-gray-600 mt-1">
            {selectedProvider === "GROQ" &&
              "Get free API key at https://console.groq.com/keys"}
            {selectedProvider === "OPENAI" &&
              "Get API key at https://platform.openai.com/api-keys"}
          </p>
        </div>
      )}

      {/* Test Connection Button */}
      <button
        onClick={handleTestConnection}
        disabled={
          loading || (currentProviderConfig?.requiresApiKey && !apiKey)
        }
        className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        Test Connection
      </button>

      {/* Update Button */}
      <button
        onClick={handleUpdateProvider}
        disabled={
          loading || (currentProviderConfig?.requiresApiKey && !apiKey)
        }
        className="w-full p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
      >
        {loading ? "Updating..." : "Update AI Provider"}
      </button>

      {/* Current Config */}
      {currentConfig && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
          <p className="font-semibold">Current Configuration:</p>
          <p>Provider: {currentConfig.provider}</p>
          <p>Model: {currentConfig.model}</p>
          <p>API URL: {currentConfig.apiUrl}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Where to Add This Component

Add this component to your **Bot Settings** page (usually in `client/src/pages/Settings.tsx` or similar):

```typescript
import { AIConfigForm } from "@/components/AIConfigForm";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1>Bot Settings</h1>
      
      {/* ... existing settings ... */}
      
      <AIConfigForm />
    </div>
  );
}
```

---

## Getting API Keys

### Groq (Free)
1. Go to https://console.groq.com/keys
2. Sign up (free)
3. Create API key
4. Copy to bot settings

### OpenAI (Paid)
1. Go to https://platform.openai.com/api-keys
2. Sign up
3. Add billing method
4. Create API key
5. Copy to bot settings

### Ollama (Free, Local)
1. Already running locally
2. No API key needed
3. Models available: `gemma4:latest`, `llama2`, `mistral`, etc.

---

## How It Works

### Message Pipeline (Already Updated)
When a user sends a message, the message pipeline (`messagePipeline.ts`):

1. Fetches the bot config for the tenant
2. Gets `aiApiUrl`, `aiApiKey`, and `aiModel` from the config
3. Uses these to call the AI provider

```typescript
const [config] = await db.select().from(botConfig)
  .where(eq(botConfig.tenantId, msg.tenantId))
  .limit(1);

const apiUrl = config.aiApiUrl;  // "https://api.groq.com/openai/v1" or "http://..."
const apiKey = decrypt(config.aiApiKey);
const aiModel = config.aiModel;  // "llama-3.1-8b-instant" or "gpt-4o-mini"
```

### Now Supported
✅ Ollama (local)  
✅ Groq (cloud, fast)  
✅ OpenAI (reliable)

---

## Testing

```bash
# 1. Start your server
pnpm dev

# 2. Test the API endpoint
curl http://localhost:3000/api/trpc/aiConfig.getProviders

# 3. In frontend, fetch and display providers
const providers = await trpcClient.aiConfig.getProviders.query();
console.log(providers);

# 4. Update provider
await trpcClient.aiConfig.updateProvider.mutate({
  provider: "GROQ",
  model: "llama-3.1-8b-instant",
  apiKey: "your-key"
});
```

---

## Troubleshooting

**"Connection failed: Cannot reach Ollama"**
- Make sure Ollama is running
- Verify: `curl http://localhost:11434/api/tags`
- Check `.env` has: `AI_API_URL=http://host.docker.internal:11434/v1`

**"Invalid API key for Groq"**
- Get key from https://console.groq.com/keys
- Make sure you have a free account

**"Models not loading for Groq/OpenAI"**
- API key might be incorrect
- Click "Test Connection" to verify

---

## Next Steps

1. Copy the React component code above
2. Add it to your bot settings page
3. Test switching between providers
4. Verify messages work with each provider

Enjoy! 🚀
