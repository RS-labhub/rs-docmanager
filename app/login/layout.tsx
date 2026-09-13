import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to R's DocManager — the AI-powered document management system and Notion alternative with encrypted API keys and role-based access control.",
  alternates: { canonical: absoluteUrl("/login") },
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
