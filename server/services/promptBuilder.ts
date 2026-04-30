import { db } from "../db.js";
import { knowledgeBase } from "../../drizzle/schema.js";
import { eq, inArray } from "drizzle-orm";

export interface PromptGeneratorInput {
  tenantId: number;
  businessName?: string;
  businessDescription?: string;
  kbArticleIds?: number[];
  extractedContent?: string;
  userInstructions?: string;
  tone?: "professional" | "friendly" | "casual" | "formal";
  language?: string;
}

export async function buildKbContext(
  tenantId: number,
  kbArticleIds: number[]
): Promise<string> {
  if (!kbArticleIds.length) return "";

  try {
    const articles = await db
      .select()
      .from(knowledgeBase)
      .where(
        inArray(knowledgeBase.id, kbArticleIds).and(
          eq(knowledgeBase.tenantId, tenantId)
        )
      );

    if (!articles.length) return "";

    const context = articles
      .map(
        (article) => `
**${article.title}**
Category: ${article.category}
${article.content}
---
`
      )
      .join("\n");

    return context;
  } catch (error) {
    console.error("Error building KB context:", error);
    return "";
  }
}

export async function generateSystemPrompt(
  input: PromptGeneratorInput
): Promise<string> {
  const {
    businessName = "My Business",
    businessDescription = "",
    kbArticleIds = [],
    extractedContent = "",
    userInstructions = "",
    tone = "professional",
    language = "en",
  } = input;

  const kbContext = await buildKbContext(input.tenantId, kbArticleIds);

  const promptParts: string[] = [];

  promptParts.push(
    `You are an AI assistant for ${businessName}, a customer service representative.`
  );

  if (businessDescription) {
    promptParts.push(`\nBusiness Description:\n${businessDescription}`);
  }

  if (kbContext) {
    promptParts.push(
      `\nYou have access to the following information about our business:\n${kbContext}`
    );
  }

  if (extractedContent) {
    promptParts.push(
      `\nAdditional context from our website and social media:\n${extractedContent}`
    );
  }

  const toneInstructions: Record<string, string> = {
    professional:
      "Be professional, courteous, and informative. Use proper grammar.",
    friendly:
      "Be warm, approachable, and friendly. Use conversational language.",
    casual: "Be casual and relaxed. Use everyday language.",
    formal: "Be formal and precise. Use business terminology.",
  };

  promptParts.push(`\nTone: ${toneInstructions[tone]}`);

  if (userInstructions) {
    promptParts.push(`\nAdditional Instructions:\n${userInstructions}`);
  }

  promptParts.push(`
General Guidelines:
- Be helpful and answer questions based on the provided information
- If you don't know something, be honest and offer to connect with a human agent
- Keep responses concise and relevant
- Ask clarifying questions when needed
- Handle customer concerns with empathy
${language !== "en" ? `- Respond in ${language}` : ""}
  `);

  return promptParts.join("\n").trim();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
