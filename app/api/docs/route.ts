import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface HeadingInfo {
  level: number;
  text: string;
  id: string;
}

interface DocFile {
  slug: string;
  title: string;
  content: string;
  headings: HeadingInfo[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseHeadings(content: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  // Normalize line endings so CRLF files (Windows) parse the same as LF files.
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ level, text, id: slugify(text) });
    }
  }
  return headings;
}

function extractTitle(content: string): string {
  // Strip BOM if present
  const clean = content.replace(/^\uFEFF/, "");
  const match = clean.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

const DOC_ORDER = [
  "overview",
  "getting-started",
  "documents",
  "pages",
  "roles",
  "organizations",
  "ai-features",
  "security",
  "terms",
  "privacy",
  "faq",
  "troubleshooting",
  "about-creator",
];

export async function GET(request: NextRequest) {
  try {
    const docsDir = path.join(process.cwd(), "docs");

    if (!fs.existsSync(docsDir)) {
      return NextResponse.json({ docs: [] });
    }

    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));
    const docs: DocFile[] = [];

    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      // Strip BOM and normalize line endings so Windows (CRLF) and Unix (LF) files are treated identically by downstream parsers.
      const content = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
      const slug = file.replace(".md", "");
      const title = extractTitle(content);
      const headings = parseHeadings(content);
      docs.push({ slug, title, content, headings });
    }

    // Sort by defined order
    docs.sort((a, b) => {
      const aIdx = DOC_ORDER.indexOf(a.slug);
      const bIdx = DOC_ORDER.indexOf(b.slug);
      if (aIdx === -1 && bIdx === -1) return a.slug.localeCompare(b.slug);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return NextResponse.json({ docs });
  } catch (error) {
    console.error("Error reading docs:", error);
    return NextResponse.json({ docs: [], error: "Failed to load docs" }, { status: 500 });
  }
}
