import axios from "axios";

/**
 * Fetch and extract text content from URLs
 * Supports websites, social media, PDFs, and plain text
 */
export const urlFetcher = {
  /**
   * Extract text content from a URL
   */
  async extractContent(url: string): Promise<{
    success: boolean;
    content?: string;
    title?: string;
    error?: string;
  }> {
    try {
      // Validate URL
      const urlObj = new URL(url);

      // Timeout after 10 seconds
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        maxRedirects: 3,
      });

      const contentType = response.headers["content-type"] || "";

      // Handle different content types
      if (contentType.includes("application/pdf")) {
        return {
          success: true,
          content: "[PDF content - manual extraction needed]",
          title: "PDF Document",
        };
      }

      if (contentType.includes("text/html")) {
        return extractHtmlContent(response.data);
      }

      if (contentType.includes("text/plain")) {
        return {
          success: true,
          content: response.data.substring(0, 5000),
          title: urlObj.hostname,
        };
      }

      if (contentType.includes("application/json")) {
        const json = response.data;
        return {
          success: true,
          content: JSON.stringify(json, null, 2).substring(0, 5000),
          title: "API Response",
        };
      }

      return {
        success: false,
        error: `Unsupported content type: ${contentType}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch URL",
      };
    }
  },
};

function extractHtmlContent(html: string): {
  success: boolean;
  content?: string;
  title?: string;
} {
  try {
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Web Page";

    text = text.replace(/<[^>]+>/g, " ");
    text = decodeHtmlEntities(text);
    text = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");

    const content = text.substring(0, 5000);

    if (!content.trim()) {
      return {
        success: false,
        error: "No text content found on page",
      };
    }

    return {
      success: true,
      content,
      title,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to extract HTML content",
    };
  }
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };

  return text.replace(/&[#\w]+;/g, (match) => entities[match] || match);
}
