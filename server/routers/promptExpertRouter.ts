import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";
import { decrypt } from "../services/encryptionService.js";
import { getRelevantContext } from "../services/knowledgeRetrieval.js";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

// ─── File-based persistence helpers ──────────────────────────────────────────
const DATA_DIR = path.resolve("data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")); }
  catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function libraryFile(userId: number) { return `prompt_library_${userId}.json`; }
function historyFile(userId: number) { return `prompt_history_${userId}.json`; }

// ─── WAFlow — Prompt Engineering Expert System Prompt ─────────────────────
const PROMPT_EXPERT_SYSTEM = `You are WAFlow — a world-class Prompt Engineering Expert and AI Systems Architect with over 50 years of hands-on experience designing, optimizing, debugging, and deploying prompts across every major AI platform and model family in existence.

YOUR BACKGROUND & EXPERTISE:
• Pioneered prompting methodologies before the term "prompt engineering" existed — from early expert systems through GPT-1, GPT-4, Claude 1–3, Gemini, LLaMA, Mistral, Falcon, Phi, Qwen, DeepSeek, and every major model released
• Mastered ALL prompting techniques: Zero-shot, Few-shot, Chain-of-Thought (CoT), Tree of Thought (ToT), ReAct, Self-Consistency, Reflexion, Least-to-Most, Directional Stimulus, Generated Knowledge, Step-Back, Meta-Prompting, Role Prompting, Skeleton-of-Thought, Automatic Prompt Optimization, Constitutional AI alignment
• Deep expertise in: OpenAI (GPT-4o, o1, o3), Anthropic Claude (Haiku, Sonnet, Opus), Google Gemini (1.5 Pro, Ultra), Meta LLaMA (1, 2, 3, 3.1, 3.2, 3.3), Mistral (7B, 8x7B, Large), Cohere Command, Groq, Perplexity, Together AI, Replicate
• Image & multimodal AI: Midjourney (v1–v6), Stable Diffusion (1.5, SDXL, Flux, Pony), DALL-E 3, Firefly, Ideogram, Leonardo, Playground
• Automation & Enterprise: LangChain, LlamaIndex, AutoGPT, CrewAI, n8n, Zapier AI, Make.com AI, Microsoft Copilot Studio, custom RAG pipelines, fine-tuning workflows
• API & Developer tools: OpenAI API, Anthropic API, Hugging Face Inference API, Ollama, LM Studio, oobabooga, vLLM, llama.cpp
• Specialized domains: Customer service bots, coding assistants, data analysis, content generation, classification systems, summarization engines, multi-agent orchestration, RAG architecture

WHAT YOU DO FOR USERS:
1. WRITE PERFECT PROMPTS — From scratch or by rewriting weak prompts into high-performance ones
2. DIAGNOSE PROMPT FAILURES — Identify exactly why a prompt is failing and how to fix it
3. OPTIMIZE EXISTING PROMPTS — Improve clarity, output quality, consistency, and token efficiency
4. PLATFORM-SPECIFIC GUIDANCE — Tailor prompts to model quirks (Claude's XML tags, GPT's system/user separation, Gemini's multimodal context, Midjourney's weight syntax, SD's negative prompts)
5. TEACH TECHNIQUES — Explain any prompting methodology with concrete examples
6. BUILD PROMPT SYSTEMS — Design multi-step, chained, or agentic prompt architectures
7. TOKEN OPTIMIZATION — Reduce token usage without sacrificing output quality
8. SAFETY & GUARDRAILS — Build robust prompts that resist jailbreaks and stay on-task
9. EVALUATE PROMPTS — Score prompts on clarity, specificity, context, instruction quality, and expected output
10. CREATE PROMPT TEMPLATES — Reusable, parameterized prompt templates for business workflows

YOUR COMMUNICATION STYLE:
• Direct and expert — no fluff, no vague advice
• Always show the actual improved prompt, not just describe what to change
• Use structured formatting: clearly separate analysis, improved prompt, and explanation
• When writing prompts, always format them inside a code block for easy copying
• Give specific, actionable feedback — never generic advice like "be more specific"
• Rate prompts when asked and explain every score criterion
• Proactively spot issues the user hasn't noticed yet

IMPORTANT RULES:
• ALWAYS write out the full improved prompt in a code block — never just talk about what to change
• If analyzing a prompt, show: (1) What's wrong, (2) The improved version in a code block, (3) Why the changes work
• Adapt your depth to the user — simple explanations for beginners, deep technical detail for advanced users
• If the user doesn't specify a platform or model, ask one clarifying question before writing a specialized prompt
• Never refuse to help with prompt optimization — that is your entire purpose`;

// Keep last 20 turns for context window
const MAX_HISTORY = 20;

export const promptExpertRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            })
          )
          .max(MAX_HISTORY),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Load API credentials from the tenant's bot config (same source as messagePipeline)
      const [config] = await db
        .select({ aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel })
        .from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId))
        .orderBy(desc(botConfig.updatedAt))
        .limit(1);

      const apiUrl = config?.aiApiUrl || process.env.AI_API_URL || "https://api.groq.com/openai/v1";
      const apiKey = decrypt(config?.aiApiKey || "") || process.env.AI_API_KEY || "";
      const model  = config?.aiModel  || process.env.AI_MODEL  || "gemma4:latest";

      // Pull the most recent user message to use as the KB search query
      const lastUserMessage = [...input.messages].reverse().find(m => m.role === "user")?.content ?? "";

      // Retrieve relevant knowledge base articles trained under "Train AI"
      const kbContext = lastUserMessage
        ? await getRelevantContext(lastUserMessage, ctx.user.userId, 5, 1500)
        : "";

      // Append KB context to the system prompt when articles are found
      const systemPrompt = kbContext
        ? `${PROMPT_EXPERT_SYSTEM}\n\n${kbContext}`
        : PROMPT_EXPERT_SYSTEM;

      const openai = new OpenAI({ baseURL: apiUrl, apiKey, timeout: 60000 });

      const completionPromise = openai.chat.completions.create({
        model,
        max_tokens: 2048,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages,
        ],
      });

      // Add timeout to prevent hanging on slow API servers
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Chat completion API timeout (60s)")), 60000)
      );

      const completion = (await Promise.race([completionPromise, timeoutPromise])) as any;
      const reply = completion.choices[0]?.message?.content ?? "I'm sorry, I couldn't generate a response. Please try again.";
      return { reply };
    }),

  // ── Prompt Library ──────────────────────────────────────────────────────────
  getLibrary: protectedProcedure.query(({ ctx }) => {
    return readJson<{ id: string; title: string; content: string; tags: string[]; rating: number; createdAt: string }[]>(
      libraryFile(ctx.user.userId), []
    );
  }),

  saveToLibrary: protectedProcedure
    .input(z.object({ title: z.string().max(200), content: z.string().max(10000), tags: z.array(z.string()).default([]) }))
    .mutation(({ input, ctx }) => {
      const lib = readJson<any[]>(libraryFile(ctx.user.userId), []);
      const entry = { id: Date.now().toString(), ...input, rating: 0, createdAt: new Date().toISOString() };
      lib.unshift(entry);
      writeJson(libraryFile(ctx.user.userId), lib.slice(0, 200)); // cap at 200 saved prompts
      return entry;
    }),

  rateLibraryItem: protectedProcedure
    .input(z.object({ id: z.string(), rating: z.number().min(1).max(5) }))
    .mutation(({ input, ctx }) => {
      const lib = readJson<any[]>(libraryFile(ctx.user.userId), []);
      const idx = lib.findIndex(p => p.id === input.id);
      if (idx !== -1) { lib[idx].rating = input.rating; writeJson(libraryFile(ctx.user.userId), lib); }
      return { success: true };
    }),

  deleteFromLibrary: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input, ctx }) => {
      const lib = readJson<any[]>(libraryFile(ctx.user.userId), []);
      writeJson(libraryFile(ctx.user.userId), lib.filter(p => p.id !== input.id));
      return { success: true };
    }),

  // ── Chat History Persistence ────────────────────────────────────────────────
  getHistory: protectedProcedure.query(({ ctx }) => {
    return readJson<{ id: string; role: "user" | "assistant"; content: string; timestamp: string; rating?: number }[]>(
      historyFile(ctx.user.userId), []
    );
  }),

  saveHistory: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.string(),
        rating: z.number().optional(),
      }))
    }))
    .mutation(({ input, ctx }) => {
      writeJson(historyFile(ctx.user.userId), input.messages.slice(-100)); // keep last 100
      return { success: true };
    }),

  rateMessage: protectedProcedure
    .input(z.object({ id: z.string(), rating: z.number().min(-1).max(1) }))
    .mutation(({ input, ctx }) => {
      const hist = readJson<any[]>(historyFile(ctx.user.userId), []);
      const idx = hist.findIndex(m => m.id === input.id);
      if (idx !== -1) { hist[idx].rating = input.rating; writeJson(historyFile(ctx.user.userId), hist); }
      return { success: true };
    }),

  clearHistory: protectedProcedure.mutation(({ ctx }) => {
    writeJson(historyFile(ctx.user.userId), []);
    return { success: true };
  }),

  // ── File Parser — extract text from PDF, DOCX, and plain text ─────────────
  parseFile: protectedProcedure
    .input(z.object({
      filename: z.string(),
      mimeType: z.string(),
      base64: z.string().max(20_000_000), // ~15 MB encoded
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      let text = "";

      const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
      const isPdf  = input.mimeType === "application/pdf" || ext === "pdf";
      const isDocx = input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx";
      const isDoc  = input.mimeType === "application/msword" || ext === "doc";

      if (isPdf) {
        const parsed = await pdfParse(buffer);
        text = parsed.text;
      } else if (isDocx || isDoc) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        // Treat as plain text (txt, md, csv, json, html, xml, ts, py, etc.)
        text = buffer.toString("utf-8");
      }

      // Normalize whitespace and cap length
      text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
      return { text, filename: input.filename, chars: text.length };
    }),

  // ── URL Scraper — fetch & strip HTML for prompt generation ─────────────────
  fetchUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const res = await fetch(input.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WAFlow/1.0)" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to fetch URL: ${res.status} ${res.statusText}`,
        });
      }
      const html = await res.text();
      // Strip scripts, styles, then all tags
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 10000); // cap at 10k chars
      return { text, url: input.url };
    }),
});
