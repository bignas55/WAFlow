/**
 * Voice Service
 * - transcribeAudio()  — converts audio buffer → text via Whisper API
 * - generateSpeech()   — converts text → audio buffer via OpenAI TTS
 * - downloadMetaAudio() — downloads voice message media from Meta CDN
 * - langName()          — ISO 639-1 code → full language name for prompts
 */

import OpenAI from "openai";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { decrypt } from "./encryptionService.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";

// ── Language name map ──────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  pt: "Portuguese", af: "Afrikaans", zu: "Zulu", xh: "Xhosa",
  ar: "Arabic", zh: "Chinese (Mandarin)", hi: "Hindi", it: "Italian",
  nl: "Dutch", ru: "Russian", ja: "Japanese", ko: "Korean",
  sw: "Swahili", yo: "Yoruba", ha: "Hausa", so: "Somali",
  tr: "Turkish", id: "Indonesian", pl: "Polish", uk: "Ukrainian",
};

export function langName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] || code.toUpperCase();
}

// ── Whisper transcription ──────────────────────────────────────────────────
/**
 * Transcribes an audio buffer to text.
 *
 * Priority for STT endpoint:
 *  1. WHISPER_API_URL env var  (e.g. http://localhost:8001/v1 for faster-whisper-server)
 *  2. botConfig.whisperApiUrl  (set in admin panel)
 *  3. botConfig.aiApiUrl       (Groq / OpenAI)
 *
 * If a dedicated WHISPER_API_URL is set the Ollama check is bypassed —
 * the local server handles transcription regardless of the main AI key.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg",
  hintLanguage?: string,
): Promise<string | null> {
  try {
    const [config] = await db.select({
      aiApiUrl: botConfig.aiApiUrl,
      aiApiKey: botConfig.aiApiKey,
      whisperApiUrl: botConfig.whisperApiUrl,
      enableVoiceTranscription: botConfig.enableVoiceTranscription,
    }).from(botConfig).limit(1);

    if (!config?.enableVoiceTranscription) return null;

    // A dedicated Whisper URL (env var or admin setting) lets us bypass the
    // Ollama restriction — the local server handles audio independently.
    const dedicatedWhisperUrl =
      process.env.WHISPER_API_URL?.trim() ||
      config.whisperApiUrl?.trim() ||
      "";

    const apiKey = decrypt(config.aiApiKey || "") || "";
    if (!dedicatedWhisperUrl && (!apiKey || apiKey === "ollama")) {
      // No dedicated STT endpoint and main API is Ollama — skip
      return null;
    }

    // Use dedicated whisper URL if available, otherwise fall back to AI API URL
    const whisperBase = dedicatedWhisperUrl || config.aiApiUrl || process.env.AI_API_URL || "https://api.openai.com/v1";
    // For local servers (faster-whisper-server, LocalAI) use "local" as the key if none is set
    const whisperKey = dedicatedWhisperUrl ? (process.env.WHISPER_API_KEY || "local") : apiKey;
    const openai = new OpenAI({ baseURL: whisperBase, apiKey: whisperKey });

    // Auto-detect model: Groq → whisper-large-v3, local/other → whisper-1
    const whisperModel = process.env.WHISPER_MODEL ||
      (whisperBase.includes("groq.com") ? "whisper-large-v3" : "whisper-1");

    // Write buffer to temp file — OpenAI SDK requires a readable stream
    const ext = mimeType.includes("ogg") ? ".ogg"
      : mimeType.includes("mp4") ? ".mp4"
      : mimeType.includes("mpeg") ? ".mp3"
      : mimeType.includes("webm") ? ".webm"
      : ".wav";

    const tmpFile = path.join(os.tmpdir(), `waflow_voice_${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, audioBuffer);

    try {
      // Add timeout using Promise.race to prevent hanging on slow/dead API servers
      const transcriptionPromise = openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile) as any,
        model: whisperModel,
        language: hintLanguage || undefined,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Transcription API timeout (60s)")), 60000)
      );

      const transcription = (await Promise.race([transcriptionPromise, timeoutPromise])) as any;
      return transcription.text?.trim() || null;
    } finally {
      fs.unlink(tmpFile, (err) => {
        if (err) {
          console.warn(`⚠️ Failed to delete temp voice file [${tmpFile}]:`, err.message);
        }
      });
    }
  } catch (err: any) {
    console.error("Voice transcription failed:", err?.message || err);
    return null;
  }
}

// ── Text-to-Speech ─────────────────────────────────────────────────────────
/**
 * Converts text to MP3 audio buffer.
 *
 * Priority for TTS endpoint:
 *  1. TTS_API_URL env var  (e.g. http://localhost:8000/v1 for openedai-speech / Kokoro)
 *  2. botConfig.aiApiUrl   (OpenAI / Groq — note: Groq has no TTS)
 *
 * If TTS_API_URL is set the Ollama restriction is bypassed — the local server
 * handles TTS regardless of the main AI key.
 *
 * Free self-hosted options (both expose OpenAI-compatible /v1/audio/speech):
 *  • openedai-speech  — docker run -p 8000:8000 ghcr.io/matatonic/openedai-speech
 *  • Kokoro-FastAPI   — docker run -p 8000:8880 ghcr.io/remsky/kokoro-fastapi-cpu
 */
export async function generateSpeech(text: string): Promise<Buffer | null> {
  try {
    const [config] = await db.select({
      aiApiUrl: botConfig.aiApiUrl,
      aiApiKey: botConfig.aiApiKey,
      enableVoiceResponse: botConfig.enableVoiceResponse,
      ttsVoice: botConfig.ttsVoice,
    }).from(botConfig).limit(1);

    if (!config?.enableVoiceResponse) return null;

    // A dedicated TTS URL lets us bypass the Ollama restriction
    const dedicatedTtsUrl = process.env.TTS_API_URL?.trim() || "";

    const apiKey = decrypt(config.aiApiKey || "") || "";
    if (!dedicatedTtsUrl && (!apiKey || apiKey === "ollama")) return null;

    const ttsBase = dedicatedTtsUrl || config.aiApiUrl || "https://api.openai.com/v1";
    const ttsKey  = dedicatedTtsUrl ? (process.env.TTS_API_KEY || "local") : apiKey;

    const openai = new OpenAI({ baseURL: ttsBase, apiKey: ttsKey });

    // Auto-detect model: openedai-speech & Kokoro both accept "tts-1";
    // override with TTS_MODEL env var if the server needs a different name
    const ttsModel = process.env.TTS_MODEL || "tts-1";

    const voice = (config.ttsVoice || "alloy") as
      "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

    // Add timeout using Promise.race to prevent hanging on slow/dead API servers
    const ttsPromise = openai.audio.speech.create({
      model: ttsModel,
      voice,
      input: text,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TTS API timeout (60s)")), 60000)
    );

    const mp3 = (await Promise.race([ttsPromise, timeoutPromise])) as any;
    return Buffer.from(await mp3.arrayBuffer());
  } catch (err: any) {
    console.error("TTS failed:", err?.message || err);
    return null;
  }
}

// ── Meta API media download ────────────────────────────────────────────────
export async function downloadMetaAudio(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    // Step 1: Resolve media URL
    const metaRes = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 },
    );
    const downloadUrl: string = metaRes.data?.url;
    const mimeType: string = metaRes.data?.mime_type || "audio/ogg";
    if (!downloadUrl) return null;

    // Step 2: Download audio bytes
    const audioRes = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
      timeout: 15000,
    });

    return { buffer: Buffer.from(audioRes.data), mimeType };
  } catch (err: any) {
    console.error("Meta audio download failed:", err?.message || err);
    return null;
  }
}
