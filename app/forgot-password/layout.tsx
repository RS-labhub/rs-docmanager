import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your R's DocManager account password.",
  alternates: { canonical: absoluteUrl("/forgot-password") },
  robots: { index: false, follow: true },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
