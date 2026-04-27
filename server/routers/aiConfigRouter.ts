/**
 * aiConfigRouter.ts — AI Provider and Model Selection
 *
 * Allows users to:
 * - Switch between AI providers (Ollama, Groq, OpenAI)
 * - Select different models
 * - Configure API keys
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { encryptIfNeeded, decrypt } from "../services/encryptionService.js";
import axios from "axios";

// Available AI providers
export const AI_PROVIDERS = {
  OLLAMA: {
    name: "Ollama (Local)",
    apiUrl: "http://host.docker.internal:11434/v1",
    requiresApiKey: false,
    defaultModel: "gemma4:latest",
    models: [
      // Google Gemma Series
      { id: "gemma4:latest", name: "Gemma 4 (Latest)" },
      { id: "gemma2:latest", name: "Gemma 2 (Latest)" },
      { id: "gemma:latest", name: "Gemma (Latest)" },
      // Meta Llama Series
      { id: "llama3.1:latest", name: "Llama 3.1 (Latest)" },
      { id: "llama3:latest", name: "Llama 3 (Latest)" },
      { id: "llama2:latest", name: "Llama 2 (Latest)" },
      { id: "llama2-uncensored:latest", name: "Llama 2 (Uncensored)" },
      // Mistral Series
      { id: "mistral:latest", name: "Mistral (Latest)" },
      { id: "mistral-openorca:latest", name: "Mistral OpenOrca" },
      { id: "mistral-nemo:latest", name: "Mistral Nemo" },
      // Microsoft Phi Series
      { id: "phi3.5:latest", name: "Phi 3.5 (Latest - Lightweight)" },
      { id: "phi3:latest", name: "Phi 3 (Latest)" },
      { id: "phi:latest", name: "Phi (Latest)" },
      // Neural & Chat Models
      { id: "neural-chat:latest", name: "Neural Chat (Latest)" },
      { id: "openchat:latest", name: "OpenChat (Latest)" },
      { id: "starling-lm:latest", name: "Starling LM" },
      // Specialized Models
      { id: "dolphin-mixtral:latest", name: "Dolphin Mixtral (Strong Reasoning)" },
      { id: "dolphin-phi:latest", name: "Dolphin Phi (Lightweight)" },
      { id: "orca-mini:latest", name: "Orca Mini" },
      { id: "zephyr:latest", name: "Zephyr (Conversation)" },
      { id: "tinyllama:latest", name: "TinyLlama (Very Fast)" },
      // Other Popular Models
      { id: "qwen:latest", name: "Qwen (Latest)" },
      { id: "solar:latest", name: "Solar (Latest)" },
      { id: "vicuna:latest", name: "Vicuna (Latest)" },
      { id: "nomic-embed-text:latest", name: "Nomic Embed Text (Embeddings)" },
      { id: "llava:latest", name: "LLaVA (Vision)" },
    ],
  },
  GROQ: {
    name: "Groq (Cloud, Fast)",
    apiUrl: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    defaultModel: "llama-3.1-8b-instant",
    models: [
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B (Instant)" },
      { id: "llama-3.1-70b-versatile", name: "Llama 3.1 70B (Versatile)" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
      { id: "gemma-7b-it", name: "Gemma 7B (Instruct)" },
    ],
  },
  OPENAI: {
    name: "OpenAI (Reliable)",
    apiUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast & Cheap)" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo (Smart)" },
      { id: "gpt-4", name: "GPT-4 (Most Capable)" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Budget)" },
    ],
  },
};

export type AIProvider = keyof typeof AI_PROVIDERS;

/**
 * Get available Ollama models by querying the local Ollama instance
 */
async function getOllamaModels(): Promise<{ id: string; name: string }[]> {
  try {
    const response = await axios.get("http://host.docker.internal:11434/api/tags", {
      timeout: 5000,
    });

    if (response.data?.models) {
      return response.data.models.map((m: any) => ({
        id: m.name,
        name: m.name.split(":")[0] + " " + (m.name.split(":")[1] || "latest"),
      }));
    }
  } catch (err) {
    console.warn("⚠️  Could not fetch Ollama models:", (err as any)?.message);
  }

  // Fallback to predefined models if Ollama is unreachable
  return AI_PROVIDERS.OLLAMA.models;
}

export const aiConfigRouter = router({
  /**
   * Get available AI providers and models
   */
  getProviders: protectedProcedure
    .query(async () => {
      const ollamaModels = await getOllamaModels();

      return {
        providers: Object.entries(AI_PROVIDERS).map(([key, config]) => ({
          id: key as AIProvider,
          name: config.name,
          requiresApiKey: config.requiresApiKey,
          defaultModel: config.defaultModel,
          // Return Ollama models if it's Ollama, otherwise use predefined
          models: key === "OLLAMA" ? ollamaModels : config.models,
        })),
      };
    }),

  /**
   * Get current bot's AI configuration
   */
  getCurrentConfig: protectedProcedure
    .query(async ({ ctx }) => {
      const [config] = await db
        .select()
        .from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId))
        .limit(1);

      if (!config) {
        return {
          provider: "OLLAMA" as AIProvider,
          model: "gemma4:latest",
          apiUrl: AI_PROVIDERS.OLLAMA.apiUrl,
          apiKey: "",
        };
      }

      // Determine which provider this config is using
      let provider: AIProvider = "OLLAMA";
      if (config.aiApiUrl?.includes("groq.com")) provider = "GROQ";
      else if (config.aiApiUrl?.includes("openai.com")) provider = "OPENAI";

      return {
        provider,
        model: config.aiModel || AI_PROVIDERS[provider].defaultModel,
        apiUrl: config.aiApiUrl || AI_PROVIDERS[provider].apiUrl,
        apiKey: config.aiApiKey ? decrypt(config.aiApiKey) : "",
      };
    }),

  /**
   * Update AI provider and model
   */
  updateProvider: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["OLLAMA", "GROQ", "OPENAI"]),
        model: z.string().min(1),
        apiKey: z.string().optional(), // Required for Groq/OpenAI
      })
    )
    .mutation(async ({ input, ctx }) => {
      const providerConfig = AI_PROVIDERS[input.provider];

      if (!providerConfig) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown provider: ${input.provider}`,
        });
      }

      // Validate API key if required
      if (providerConfig.requiresApiKey && !input.apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${providerConfig.name} requires an API key`,
        });
      }

      // Encrypt API key if provided
      const encryptedApiKey = input.apiKey
        ? encryptIfNeeded(input.apiKey)
        : input.provider === "OLLAMA"
          ? "ollama"
          : "";

      // Update or create bot config
      const [existing] = await db
        .select({ id: botConfig.id })
        .from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId))
        .limit(1);

      if (existing) {
        await db
          .update(botConfig)
          .set({
            aiApiUrl: providerConfig.apiUrl,
            aiApiKey: encryptedApiKey,
            aiModel: input.model,
            updatedAt: new Date(),
          })
          .where(eq(botConfig.tenantId, ctx.user.userId));
      } else {
        await db.insert(botConfig).values({
          tenantId: ctx.user.userId,
          aiApiUrl: providerConfig.apiUrl,
          aiApiKey: encryptedApiKey,
          aiModel: input.model,
          businessName: "My Business",
          systemPrompt: "You are a helpful AI assistant.",
          afterHoursMessage: "We'll get back to you soon!",
        });
      }

      return {
        success: true,
        provider: input.provider,
        model: input.model,
      };
    }),

  /**
   * Test AI provider connection
   */
  testConnection: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["OLLAMA", "GROQ", "OPENAI"]),
        apiKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const providerConfig = AI_PROVIDERS[input.provider];

      try {
        if (input.provider === "OLLAMA") {
          // Test Ollama connection
          const response = await axios.get(
            "http://host.docker.internal:11434/api/tags",
            { timeout: 5000 }
          );
          return {
            success: true,
            message: `Ollama connected. Found ${response.data?.models?.length || 0} models.`,
          };
        } else if (input.provider === "GROQ") {
          // Test Groq connection
          const response = await axios.get("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${input.apiKey}` },
            timeout: 5000,
          });
          return {
            success: true,
            message: `Groq connected. API key valid.`,
          };
        } else if (input.provider === "OPENAI") {
          // Test OpenAI connection
          const response = await axios.get("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${input.apiKey}` },
            timeout: 5000,
          });
          return {
            success: true,
            message: `OpenAI connected. API key valid.`,
          };
        }
      } catch (err: any) {
        console.error(`Connection test failed for ${input.provider}:`, err.message);
        return {
          success: false,
          message: `Connection failed: ${err.message || "Unknown error"}`,
        };
      }

      return { success: false, message: "Unknown provider" };
    }),
});
