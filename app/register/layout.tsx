import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Create Your Account",
  description:
    "Create a free account on R's DocManager — an AI-powered document management system and Notion alternative. Join or create an organization and start managing documents with AI.",
  alternates: { canonical: absoluteUrl("/register") },
  robots: { index: true, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
