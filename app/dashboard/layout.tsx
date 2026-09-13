import type { Metadata } from "next";

// The dashboard is authenticated-only; robots.ts also disallows /dashboard,
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
