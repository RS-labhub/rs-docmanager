// Document parsers — no API keys required. Supports PDF, DOCX, TXT, CSV, Markdown, HTML.
import mammoth from "mammoth";

export type SupportedFileType =
  | "pdf"
  | "docx"
  | "txt"
  | "csv"
  | "md"
  | "html"
  | "json";

export interface ParseResult {
  content: string;
  metadata: {
    fileType: SupportedFileType;
    fileName: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
    charCount: number;
    parseTime: number; // ms
  };
}

// Detect file type from extension.
export function detectFileType(filename: string): SupportedFileType | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, SupportedFileType> = {
    pdf: "pdf",
    docx: "docx",
    doc: "docx",
    txt: "txt",
    csv: "csv",
    md: "md",
    markdown: "md",
    html: "html",
    htm: "html",
    json: "json",
  };
  return map[ext || ""] || null;
}

// Parse a file buffer into text content.
export async function parseDocument(
  buffer: Buffer,
  filename: string
): Promise<ParseResult> {
  const start = Date.now();
  const fileType = detectFileType(filename);

  if (!fileType) {
    throw new Error(
      `Unsupported file type: ${filename}. Supported: pdf, docx, txt, csv, md, html, json`
    );
  }

  let content: string;
  let pageCount: number | undefined;

  switch (fileType) {
    case "pdf":
      ({ content, pageCount } = await parsePdf(buffer));
      break;
    case "docx":
      content = await parseDocx(buffer);
      break;
    case "txt":
    case "md":
    case "csv":
    case "html":
    case "json":
      content = parseText(buffer);
      break;
    default:
      throw new Error(`Parser not implemented for: ${fileType}`);
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    content,
    metadata: {
      fileType,
      fileName: filename,
      fileSize: buffer.length,
      pageCount,
      wordCount,
      charCount: content.length,
      parseTime: Date.now() - start,
    },
  };
}

// Parse PDF using pdf-parse library.
async function parsePdf(
  buffer: Buffer
): Promise<{ content: string; pageCount: number }> {
  try {
    // Dynamic import of pdf-parse
    const mod = await import("pdf-parse");
    const pdfParse = (mod as any).default || mod;
    const data = await pdfParse(buffer);
    const text = (data.text || "").trim();
    if (text.length > 0) {
      return {
        content: text,
        pageCount: data.numpages || 1,
      };
    }
    // If pdf-parse returned empty, try fallback
    return { content: extractTextFromPdfBuffer(buffer), pageCount: data.numpages || 1 };
  } catch (err) {
    console.error("pdf-parse failed, using fallback:", err);
    // Fallback: basic text extraction from PDF buffer
    const text = extractTextFromPdfBuffer(buffer);
    return { content: text, pageCount: 1 };
  }
}

// Fallback PDF text extractor — scans buffer for text streams.
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const str = buffer.toString("latin1");
  const texts: string[] = [];

  // Extract text between BT and ET operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
    // Extract parenthesized strings (Tj/TJ operators)
    const tjRegex = /\(([^)]*)\)/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      texts.push(tjMatch[1]);
    }
  }

  if (texts.length === 0) {
    // Try extracting any readable ASCII segments
    const readable = str.replace(/[^\x20-\x7E\n\r\t]/g, " ");
    const cleaned = readable.replace(/\s{3,}/g, "\n").trim();
    return cleaned.slice(0, 5000) || "Could not extract text from this PDF. Try a text-based PDF.";
  }

  return texts.join(" ").replace(/\\n/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
}

// Parse DOCX using mammoth.
async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Parse plain text files (txt, md, csv, html, json).
function parseText(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

// Get human-readable supported formats.
export function getSupportedFormats(): string[] {
  return [
    "PDF (.pdf)",
    "Word (.docx)",
    "Text (.txt)",
    "CSV (.csv)",
    "Markdown (.md)",
    "HTML (.html)",
    "JSON (.json)",
  ];
}
