import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pending Approval",
  description: "Your R's DocManager account is awaiting admin approval.",
  robots: { index: false, follow: false },
};

export default function PendingApprovalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
