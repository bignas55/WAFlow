import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export async function callClaudeAPI(options: {
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  try {
    const client = new Anthropic({
      apiKey: options.apiKey,
    });

    const response = await client.messages.create({
      model: options.model || "claude-3-5-sonnet-20241022",
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
      system: options.systemPrompt,
      messages: [
        {
          role: "user",
          content: options.userMessage,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === "text");
    if (textContent && textContent.type === "text") {
      return textContent.text;
    }

    logger.warn("CLAUDE_API", "No text content in Claude response", response);
    return "I apologize, but I couldn't generate a proper response. Please try again.";
  } catch (error) {
    logger.error("CLAUDE_API", "Claude API call failed", error as Error);
    throw error;
  }
}
