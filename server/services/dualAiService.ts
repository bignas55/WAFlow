import OpenAI from "openai";

/**
 * Dual AI Model Service
 * - Primary: Groq (fast cloud, 3-second timeout)
 * - Fallback: Ollama (local, 8-second timeout)
 */

interface AICallOptions {
  tenantId: number;
  primaryTimeout?: number;
  fallbackTimeout?: number;
  logFallback?: boolean;
  maxTokens?: number;
  temperature?: number;
  aiTemperature?: string;
}

interface AIResponse {
  success: boolean;
  response: string;
  model: "groq" | "ollama";
  responseTime: number;
  usedFallback: boolean;
}

/**
 * Call AI with automatic fallback from Groq to Ollama
 * Handles full conversation history with token budget management
 */
export async function callAiWithFallback(
  messages: OpenAI.ChatCompletionMessageParam[],
  primaryConfig: {
    model: string;
    apiUrl: string;
    apiKey: string;
  },
  fallbackConfig: {
    enabled: boolean;
    model: string;
    apiUrl: string;
    apiKey: string;
  },
  options: AICallOptions = {}
): Promise<AIResponse> {
  const startTime = Date.now();
  const primaryTimeout = options.primaryTimeout || 3000;
  const fallbackTimeout = options.fallbackTimeout || 8000;
  const temperature = parseFloat(options.aiTemperature?.toString() || "0.7");
  const maxTokens = options.maxTokens || 1024;

  // Detect if using Ollama (for context window management)
  const isPrimaryOllama = primaryConfig.apiUrl.includes("11434") || primaryConfig.apiUrl.toLowerCase().includes("ollama");
  const isFallbackOllama = fallbackConfig.apiUrl.includes("11434") || fallbackConfig.apiUrl.toLowerCase().includes("ollama");

  const primaryContextWindow = isPrimaryOllama ? 8192 : 32000;
  const fallbackContextWindow = isFallbackOllama ? 8192 : 32000;

  try {
    // Try primary model (Groq)
    const response = await callModelWithContextHandling(
      primaryConfig,
      messages,
      primaryTimeout,
      primaryContextWindow,
      temperature,
      maxTokens
    );

    const responseTime = Date.now() - startTime;
    console.log(`✅ Primary AI (Groq) responded in ${responseTime}ms`);

    return {
      success: true,
      response,
      model: "groq",
      responseTime,
      usedFallback: false,
    };
  } catch (primaryError: any) {
    const errorMsg: string = (primaryError.message ?? "").toLowerCase();
    const isContextErr =
      errorMsg.includes("context length") ||
      errorMsg.includes("context window") ||
      errorMsg.includes("too long") ||
      errorMsg.includes("token") ||
      errorMsg.includes("context_length_exceeded");

    console.warn(
      `⚠️ Primary AI failed (${primaryError.message}). ${isContextErr ? "Context exceeded. " : ""}Trying fallback...`
    );

    // If primary failed and fallback is enabled, try fallback
    if (!fallbackConfig.enabled) {
      throw primaryError;
    }

    try {
      // If context error on primary, trim messages to minimal history for fallback
      const fallbackMessages = isContextErr && messages.length > 5
        ? [messages[0], ...messages.slice(-4)] // system + last 2 exchanges + current user msg
        : messages;

      const response = await callModelWithContextHandling(
        fallbackConfig,
        fallbackMessages,
        fallbackTimeout,
        fallbackContextWindow,
        temperature,
        maxTokens
      );

      const responseTime = Date.now() - startTime;
      console.log(`✅ Fallback AI (Ollama) responded in ${responseTime}ms`);

      if (options.logFallback) {
        console.log(`📊 Fallback used for tenant ${options.tenantId}`);
      }

      return {
        success: true,
        response,
        model: "ollama",
        responseTime,
        usedFallback: true,
      };
    } catch (fallbackError: any) {
      console.error(
        `❌ Both primary and fallback AI failed:`,
        fallbackError.message
      );
      throw new Error(
        `AI service unavailable: Primary (${primaryError.message}), Fallback (${fallbackError.message})`
      );
    }
  }
}

/**
 * Call a single AI model with context window awareness
 */
async function callModelWithContextHandling(
  config: {
    model: string;
    apiUrl: string;
    apiKey: string;
  },
  messages: OpenAI.ChatCompletionMessageParam[],
  timeout: number,
  contextWindow: number,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiUrl,
      timeout,
    });

    // Estimate tokens
    let approxTokens = 0;
    for (const msg of messages) {
      approxTokens += Math.round((msg.content?.toString().length || 0) / 4);
    }

    // Clamp max_tokens to not exceed context window
    const safeMaxTokens = Math.min(
      maxTokens,
      Math.max(256, contextWindow - approxTokens - 50)
    );

    const createParams: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature,
      max_tokens: safeMaxTokens,
    };

    // Add Ollama-specific options if using Ollama
    const isOllama = config.apiUrl.includes("11434") || config.apiUrl.toLowerCase().includes("ollama");
    if (isOllama) {
      createParams.options = { num_ctx: contextWindow };
    }

    const response = await client.chat.completions.create(createParams as any);

    clearTimeout(timeoutHandle);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI model");
    }

    return content;
  } catch (error: any) {
    clearTimeout(timeoutHandle);

    if (error.name === "AbortError") {
      throw new Error(`Timeout (${timeout}ms)`);
    }

    throw error;
  }
}

/**
 * Test if Ollama is available
 */
export async function isOllamaAvailable(
  ollamaUrl: string,
  timeout: number = 2000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${ollamaUrl.replace("/v1", "")}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Test if Groq is available
 */
export async function isGroqAvailable(
  groqKey: string,
  timeout: number = 2000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get model info
 */
export function getModelInfo(model: string): {
  name: string;
  description: string;
  speedCategory: "very-fast" | "fast" | "medium" | "slow";
} {
  const models: Record<
    string,
    {
      name: string;
      description: string;
      speedCategory: "very-fast" | "fast" | "medium" | "slow";
    }
  > = {
    "llama-3.1-8b-instant": {
      name: "Llama 3.1 8B Instant",
      description: "Groq's fastest model - optimized for speed",
      speedCategory: "very-fast",
    },
    "mistral": {
      name: "Mistral 7B",
      description: "Local Ollama model - good speed/quality balance",
      speedCategory: "fast",
    },
    "llama2": {
      name: "Llama 2 7B",
      description: "Local Ollama model - stable and reliable",
      speedCategory: "medium",
    },
    "neural-chat": {
      name: "Neural Chat 7B",
      description: "Local Ollama model - optimized for conversations",
      speedCategory: "fast",
    },
  };

  return (
    models[model] || {
      name: model,
      description: "Unknown model",
      speedCategory: "medium",
    }
  );
}
