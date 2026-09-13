import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DocsView from "@/components/docs/docs-view";
import { getDocs } from "@/lib/docs/load";
import { absoluteUrl } from "@/lib/seo";

export function generateStaticParams() {
  return getDocs().map((doc) => ({ slug: doc.slug }));
}

function excerptFromMarkdown(markdown: string, max = 155): string {
  const plain = markdown
    .replace(/^#.+$/m, "") // drop the H1 title line
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocs().find((d) => d.slug === slug);
  if (!doc) return {};

  const description = excerptFromMarkdown(doc.content);
  const url = absoluteUrl(`/docs/${slug}`);

  return {
    title: doc.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${doc.title} | R's DocManager Documentation`,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | R's DocManager Documentation`,
      description,
    },
  };
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
