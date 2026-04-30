import { router, protectedProcedure } from "../trpc.js";
import { z } from "zod";
import { urlFetcher } from "../services/urlFetcher.js";
import {
  generateSystemPrompt,
  estimateTokens,
  PromptGeneratorInput,
} from "../services/promptBuilder.js";
import { db } from "../db.js";
import { knowledgeBase, botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

export const systemPromptRouter = router({
  /**
   * List all KB articles for the tenant (for selection in UI)
   */
  listKbArticles: protectedProcedure.query(async ({ ctx }) => {
    const articles = await db
      .select({
        id: knowledgeBase.id,
        title: knowledgeBase.title,
        category: knowledgeBase.category,
      })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.tenantId, ctx.user.userId));

    return articles;
  }),

  /**
   * Fetch and extract content from a URL
   */
  fetchUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const result = await urlFetcher.extractContent(input.url);
      return result;
    }),

  /**
   * Generate system prompt from context
   */
  generatePrompt: protectedProcedure
    .input(
      z.object({
        businessName: z.string().optional(),
        businessDescription: z.string().optional(),
        kbArticleIds: z.array(z.number()).optional(),
        extractedContent: z.string().optional(),
        userInstructions: z.string().optional(),
        tone: z
          .enum(["professional", "friendly", "casual", "formal"])
          .optional()
          .default("professional"),
        language: z.string().optional().default("en"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const promptInput: PromptGeneratorInput = {
          tenantId: ctx.user.userId,
          ...input,
        };

        const generatedPrompt = await generateSystemPrompt(promptInput);
        const tokenCount = estimateTokens(generatedPrompt);

        return {
          success: true,
          prompt: generatedPrompt,
          tokenCount,
          charCount: generatedPrompt.length,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to generate prompt",
        };
      }
    }),

  /**
   * Save generated prompt to bot config
   */
  savePrompt: protectedProcedure
    .input(
      z.object({
        prompt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await db
          .update(botConfig)
          .set({
            systemPrompt: input.prompt,
            updatedAt: new Date(),
          })
          .where(eq(botConfig.tenantId, ctx.user.userId));

        return {
          success: true,
          message: "System prompt saved successfully",
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to save prompt",
        };
      }
    }),
});
