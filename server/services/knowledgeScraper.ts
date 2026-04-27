/**
 * knowledgeScraper.ts
 * Fetches a URL and extracts clean readable text for the knowledge base.
 * Uses axios + cheerio (dynamic import so server starts even before pnpm install).
 */
import axios from "axios";

export interface ScrapeResult {
  title: string;
  content: string;
  wordCount: number;
  error?: string;
}

// Tags whose inner content we always skip
const SKIP_TAGS = [
  "script", "style", "noscript", "iframe", "nav", "footer",
  "header", "aside", "advertisement", "figure", "form",
];

/**
 * Scrape a URL and return clean text content.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  // Normalise URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const response = await axios.get(url, {
    timeout: 15_000,
    maxContentLength: 5 * 1024 * 1024, // 5 MB
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WAFlow-KB/1.0; +https://waflow.ai)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    responseType: "text",
  });

  const contentType: string = response.headers["content-type"] || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported content type: ${contentType}. Only HTML pages are supported.`);
  }

  // Dynamic import so server doesn't crash if cheerio not yet installed
  const cheerio = await import("cheerio");
  const $ = cheerio.load(response.data as string);

  // Extract page title
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    new URL(url).hostname;

  // Remove unwanted elements
  $(SKIP_TAGS.join(",")).remove();
  $("[aria-hidden='true']").remove();
  $(".cookie-banner, .popup, .modal, .ad, .advertisement, .banner").remove();

  // Try to find the main content block first
  const contentSelectors = [
    "article", "main", "[role='main']", ".content", ".post-content",
    ".entry-content", ".article-body", "#content", "#main",
  ];

  let contentEl = $("body");
  for (const sel of contentSelectors) {
    if ($(sel).length > 0) {
      contentEl = $(sel).first();
      break;
    }
  }

  // Extract and clean text
  const rawText = contentEl
    .find("p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, dt, dd")
    .map((_: number, el: any) => {
      const text = $(el).text().trim();
      const tag = (el as any).tagName?.toLowerCase() ?? "";
      if (tag.match(/^h[1-6]$/)) return `\n## ${text}`;
      if (tag === "li") return `• ${text}`;
      return text;
    })
    .get()
    .filter((t: string) => t.length > 20)
    .join("\n");

  // Collapse multiple blank lines
  const content = rawText
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50_000);

  if (content.length < 50) {
    throw new Error("Page returned too little readable content. Try a different URL.");
  }

  const wordCount = content.split(/\s+/).length;
  return { title: title.slice(0, 490), content, wordCount };
}

export async function rescrapeUrl(url: string): Promise<ScrapeResult> {
  return scrapeUrl(url);
}
