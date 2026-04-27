/**
 * knowledgeRetrieval.ts
 * Retrieves the most relevant knowledge base articles for a customer message.
 * Uses keyword/token overlap scoring — no vector DB required.
 * Returns both the formatted context string AND a confidence level so the
 * AI pipeline can tell the AI honestly when it's operating without KB backing.
 */
import { db } from "../db.js";
import { knowledgeBase } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";

interface KBArticle {
  id: number;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
}

export type KBConfidence = "high" | "low" | "none";

export interface KBResult {
  context: string;       // formatted string to inject into prompt
  confidence: KBConfidence;
  matchCount: number;    // how many articles matched
  hasKB: boolean;        // true if KB has any articles at all
}

/**
 * Score an article against a query using token overlap.
 */
function scoreArticle(article: KBArticle, queryTokens: Set<string>): number {
  const titleTokens   = tokenize(article.title);
  const contentTokens = tokenize(article.content.slice(0, 2000));
  const tagTokenSet   = new Set((article.tags ?? []).flatMap(tag => [...tokenize(tag)]));

  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token))   score += 4;   // title match = high weight
    if (tagTokenSet.has(token))   score += 3;    // tag match = medium weight
    if (contentTokens.has(token)) score += 1;    // body match = base weight
  }
  return score;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can",
  "has", "her", "was", "one", "our", "out", "had", "him", "his",
  "how", "its", "may", "now", "own", "see", "two", "use", "way",
  "who", "did", "get", "got", "let", "put", "set", "try",
]);

/** Minimum score for a "high confidence" match */
const HIGH_CONFIDENCE_THRESHOLD = 4;

/**
 * Get the top N most relevant KB articles for a customer message.
 * Returns a KBResult with confidence signal so the AI knows when it's guessing.
 *
 * Fallback behaviour:
 *   - Strong match  (score ≥ 4) → "high" confidence, inject matched articles
 *   - Weak match    (score 1-3) → "low" confidence, inject matched articles with a caveat
 *   - No match      (score 0)   → "none" confidence, inject top-2 general articles as a
 *                                  fallback so the AI at least has basic business info
 */
export async function getRelevantContext(
  customerMessage: string,
  tenantId: number,
  limit?: number,
  maxCharsPerArticle?: number
): Promise<string>;  // overload 1 — legacy callers get a plain string back

export async function getRelevantContext(
  customerMessage: string,
  tenantId: number,
  limit: number,
  maxCharsPerArticle: number,
  returnFull: true
): Promise<KBResult>;  // overload 2 — pipeline callers get full result

export async function getRelevantContext(
  customerMessage: string,
  tenantId: number,
  limit = 5,
  maxCharsPerArticle = 1500,
  returnFull = false
): Promise<string | KBResult> {
  const allArticles = await db
    .select({
      id:       knowledgeBase.id,
      title:    knowledgeBase.title,
      content:  knowledgeBase.content,
      category: knowledgeBase.category,
      tags:     knowledgeBase.tags,
    })
    .from(knowledgeBase)
    .where(and(
      eq(knowledgeBase.tenantId, tenantId),
      eq(knowledgeBase.isActive, true),
      eq(knowledgeBase.status, "ready")
    ));

  const hasKB = allArticles.length > 0;
  if (!hasKB) {
    const empty: KBResult = { context: "", confidence: "none", matchCount: 0, hasKB: false };
    return returnFull ? empty : "";
  }

  const queryTokens = tokenize(customerMessage);

  // Score every article
  const scored = allArticles
    .map((a) => ({ ...a, score: scoreArticle(a as KBArticle, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  const matched = scored.filter((a) => a.score > 0).slice(0, limit);
  const topScore = matched[0]?.score ?? 0;

  let confidence: KBConfidence;
  let articles: typeof matched;

  if (matched.length === 0) {
    // No keyword match — fall back to the 2 highest-content general articles
    confidence = "none";
    articles = scored.slice(0, 2);
  } else if (topScore >= HIGH_CONFIDENCE_THRESHOLD) {
    confidence = "high";
    articles = matched;
  } else {
    confidence = "low";
    articles = matched;
  }

  const sections = articles.map((a) => {
    const snippet   = a.content.slice(0, maxCharsPerArticle);
    const truncated = a.content.length > maxCharsPerArticle ? "..." : "";
    return `### ${a.title}\n${snippet}${truncated}`;
  });

  const header = confidence === "none"
    ? "\n\n---\nKNOWLEDGE BASE (no direct match — general business info below for context):\n"
    : "\n\n---\nKNOWLEDGE BASE (use this to answer accurately):\n";

  const context = header + sections.join("\n\n") + "\n---";

  if (returnFull) {
    return { context, confidence, matchCount: matched.length, hasKB };
  }
  return context;
}
