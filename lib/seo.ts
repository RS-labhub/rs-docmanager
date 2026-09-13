// Central SEO constants shared by layout metadata, sitemap, robots, manifest, and structured data (JSON-LD) across the app.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://docmanager.rohansrma.me";

export const SITE_NAME = "R's DocManager";

export const SITE_TITLE = "R's DocManager – AI Document Management System & Notion Alternative";

export const SITE_DESCRIPTION =
  "R's DocManager is a secure, AI-powered document management system for teams — a modern alternative to Notion, Google Docs, and Confluence. Encrypted API keys, multi-organization support, 4-tier role-based access control (RBAC), and Notion-style pages, built by Rohan Sharma.";

export const SITE_KEYWORDS = [
  "document management system",
  "docmanager",
  "DocManager",
  "R's DocManager",
  "AI document management",
  "AI document management system",
  "notion alternative",
  "notion competitor",
  "alternative to notion",
  "google docs alternative",
  "confluence alternative",
  "team document management software",
  "secure document sharing platform",
  "role-based access control software",
  "RBAC document management",
  "enterprise document management system",
  "knowledge base software",
  "collaborative document editor",
  "Notion-style pages",
  "encrypted API keys",
  "AES-256-GCM encryption",
  "multi-organization SaaS",
  "AI document analysis",
  "Groq",
  "OpenAI",
  "Anthropic",
  "Next.js",
  "Supabase",
  "Rohan Sharma",
  "Rohan Sharma DocManager",
];

export const AUTHOR_NAME = "Rohan Sharma";
export const AUTHOR_URL = "https://www.rohansrma.vercel.app";
export const AUTHOR_EMAIL = "rs4101976@gmail.com";

export const SOCIAL_LINKS = [
  "https://github.com/RS-labhub",
  "https://www.linkedin.com/in/rohan-sharma-9386rs/",
  "https://twitter.com/rrs00179",
  "https://instagram.com/r_rohan__._/",
  "https://www.rohansrma.vercel.app",
];

/** Resolves a site-relative path to an absolute URL against the canonical domain. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** Organization schema — the entity behind the product. Reused for Organization + Article publisher references. */
export const ORGANIZATION_JSON_LD = {
  "@type": "Organization",
  name: AUTHOR_NAME,
  url: AUTHOR_URL,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl("/logo.png"),
  },
  sameAs: SOCIAL_LINKS,
};

/** WebSite schema for the whole property, rendered once in the root layout. */
export const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["DocManager", "AI DocManager", "rs-docmanager"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  publisher: ORGANIZATION_JSON_LD,
};
