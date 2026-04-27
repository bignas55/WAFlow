/**
 * documentParser.ts
 * Extracts plain text from uploaded documents:
 *   - PDF  → pdf-parse
 *   - DOCX → mammoth
 *   - TXT  → raw file read
 *   - CSV/XLSX → basic row extraction
 */
import fs from "fs";
import path from "path";

export interface ParseResult {
  title: string;
  content: string;
  wordCount: number;
  mimeType: string;
}

/**
 * Parse an uploaded file and return clean text.
 * @param filePath  Absolute path to the temp file on disk
 * @param fileName  Original filename (used to detect type)
 */
export async function parseDocument(filePath: string, fileName: string): Promise<ParseResult> {
  const ext = path.extname(fileName).toLowerCase();
  const title = path.basename(fileName, ext).replace(/[_-]+/g, " ").trim();

  let content = "";
  let mimeType = "text/plain";

  if (ext === ".pdf") {
    mimeType = "application/pdf";
    content = await parsePdf(filePath);
  } else if (ext === ".docx") {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    content = await parseDocx(filePath);
  } else if (ext === ".txt" || ext === ".md") {
    mimeType = "text/plain";
    content = fs.readFileSync(filePath, "utf-8");
  } else if (ext === ".csv") {
    mimeType = "text/csv";
    content = parseCsv(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt, .md, .csv`);
  }

  // Clean up
  content = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, 100_000); // 100k char limit per document

  if (content.length < 10) {
    throw new Error("Document appears to be empty or unreadable.");
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return { title: title.slice(0, 490), content, wordCount, mimeType };
}

async function parsePdf(filePath: string): Promise<string> {
  // Dynamic import to avoid issues if pdf-parse not installed
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  return result.text || "";
}

async function parseDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

function parseCsv(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return "";

  // Use first line as headers
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return headers.map((h, i) => `${h}: ${values[i] || ""}`).join(" | ");
  });

  return `${headers.join(" | ")}\n${"─".repeat(60)}\n${rows.join("\n")}`;
}
