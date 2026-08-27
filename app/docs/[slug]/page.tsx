import { notFound } from "next/navigation";
import DocsView from "@/components/docs/docs-view";
import { getDocs } from "@/lib/docs/load";

export function generateStaticParams() {
  return getDocs().map((doc) => ({ slug: doc.slug }));
}

export default async function DocsSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const docs = getDocs();
  if (!docs.some((doc) => doc.slug === slug)) notFound();
  return <DocsView docs={docs} initialSlug={slug} />;
}
