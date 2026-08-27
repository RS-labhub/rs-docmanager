import "server-only";
import fs from "fs";
import path from "path";
import { cache } from "react";

export interface HeadingInfo {
  level: number;
  text: string;
  id: string;
}

export interface DocFile {
  slug: string;
  title: string;
  content: string;
  headings: HeadingInfo[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseHeadings(content: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (!match) continue;
    const text = match[2].trim();
    headings.push({ level: match[1].length, text, id: slugify(text) });
  }
  return headings;
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
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

// Reads every markdown file in /docs. Cached per request so the docs page and the API route never hit the filesystem twice for the same render.
export const getDocs = cache((): DocFile[] => {
  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) return [];

  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));
  const docs: DocFile[] = files.map((file) => {
    const raw = fs.readFileSync(path.join(docsDir, file), "utf-8");
    // Strip BOM and normalize CRLF so Windows and Unix files parse identically.
    const content = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    return {
      slug: file.replace(/\.md$/, ""),
      title: extractTitle(content),
      content,
      headings: parseHeadings(content),
    };
  });

  docs.sort((a, b) => {
    const aIdx = DOC_ORDER.indexOf(a.slug);
    const bIdx = DOC_ORDER.indexOf(b.slug);
    if (aIdx === -1 && bIdx === -1) return a.slug.localeCompare(b.slug);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return docs;
});
