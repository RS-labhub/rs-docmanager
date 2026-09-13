import type { Metadata } from "next";
import DocsView from "@/components/docs/docs-view";
import { getDocs } from "@/lib/docs/load";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Learn how to use R's DocManager — the AI-powered document management system and Notion alternative. Guides for getting started, documents, pages, roles, organizations, AI features, and security.",
  alternates: { canonical: absoluteUrl("/docs") },
  openGraph: {
    title: "R's DocManager Documentation",
    description:
      "Guides for getting started, documents, pages, roles, organizations, AI features, and security in R's DocManager.",
    url: absoluteUrl("/docs"),
    type: "website",
  },
};

export default function DocsPage() {
  return <DocsView docs={getDocs()} initialSlug={null} />;
}