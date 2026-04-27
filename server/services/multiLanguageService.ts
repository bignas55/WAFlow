import OpenAI from "openai";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { decrypt } from "./encryptionService.js";

const PATTERNS: Record<string, RegExp> = {
  af: /\b(hoe|gaan|jy|dit|die|van|het|vir|met)\b/i,
  zu: /\b(sawubona|ngiyabonga|unjani|kulungile|yebo)\b/i,
  xh: /\b(molo|enkosi|unjani|ewe|hayi)\b/i,
  es: /\b(hola|gracias|como|esta|bien|por|que|los|las|una)\b/i,
  fr: /\b(bonjour|merci|comment|allez|vous|bien|oui|non|je|le)\b/i,
  de: /\b(hallo|danke|wie|geht|es|gut|ja|nein|bitte|ich)\b/i,
  pt: /\b(olá|obrigado|como|está|bem|sim|não|por|favor)\b/i,
  ar: /[\u0600-\u06FF]/,
  zh: /[\u4E00-\u9FFF]/,
};

export async function detectLanguage(text: string): Promise<string> {
  for (const [lang, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(text)) return lang;
  }

  try {
    const [config] = await db.select({ aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel }).from(botConfig).limit(1);
    if (!config?.aiApiKey) return "en";

    const openai = new OpenAI({ baseURL: config.aiApiUrl || "http://localhost:11434/v1", apiKey: decrypt(config.aiApiKey || "") || "ollama" });
    const res = await openai.chat.completions.create({
      model: config.aiModel || process.env.AI_MODEL || "gemma4:latest",
      messages: [
        { role: "system", content: "Detect the language of the following text. Reply ONLY with the 2-letter ISO 639-1 language code (e.g., en, es, fr, de, pt, af, zu, ar, zh). Nothing else." },
        { role: "user", content: text.slice(0, 100) },
      ],
      max_tokens: 5,
      temperature: 0,
    });
    return (res.choices[0]?.message?.content?.trim().toLowerCase() || "en").slice(0, 5);
  } catch {
    return "en";
  }
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (targetLang === "en") return text;
  try {
    const [config] = await db.select({ aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel }).from(botConfig).limit(1);
    if (!config?.aiApiKey) return text;
    const openai = new OpenAI({ baseURL: config.aiApiUrl, apiKey: decrypt(config.aiApiKey || "") || "ollama" });
    const res = await openai.chat.completions.create({
      model: config.aiModel,
      messages: [
        { role: "system", content: `Translate to ${targetLang}. Return only the translation, nothing else.` },
        { role: "user", content: text },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content || text;
  } catch { return text; }
}
