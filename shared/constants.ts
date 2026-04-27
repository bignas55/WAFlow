export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "af", name: "Afrikaans" },
  { code: "zu", name: "Zulu" },
  { code: "xh", name: "Xhosa" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
] as const;

export const OLLAMA_MODELS = [
  { id: "llama3.2", label: "Llama 3.2 (3B) — Recommended", size: "2GB" },
  { id: "llama3.2:1b", label: "Llama 3.2 (1B) — Very fast", size: "800MB" },
  { id: "llama3.1", label: "Llama 3.1 (8B) — High quality", size: "4.7GB" },
  { id: "mistral", label: "Mistral (7B) — Great instructions", size: "4.1GB" },
  { id: "phi3.5", label: "Phi-3.5 — Microsoft, compact", size: "2.2GB" },
  { id: "qwen2.5", label: "Qwen 2.5 (7B) — Multi-language", size: "4.4GB" },
  { id: "gemma2:2b", label: "Gemma 2 (2B) — Google, lightweight", size: "1.6GB" },
] as const;

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful WhatsApp receptionist for {businessName}.
You assist customers with inquiries, appointments, and general information.
Be friendly, professional, and concise in your responses (under 200 words).
If you cannot help, politely let the customer know and offer alternatives.
Always respond in the same language the customer is using.`;

export const DEFAULT_AFTER_HOURS_MESSAGE = `Thank you for contacting {businessName}!
Our business hours are Monday-Friday 9am-5pm.
We'll get back to you during business hours. For urgent matters, please call us.`;

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;
export const AGENT_STATUSES = ["available", "busy", "offline"] as const;
export const MESSAGE_SOURCES = ["template", "ai", "agent", "after_hours"] as const;
