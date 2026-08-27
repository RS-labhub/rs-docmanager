import DocsView from "@/components/docs/docs-view";
import { getDocs } from "@/lib/docs/load";

export default function DocsPage() {
  return <DocsView docs={getDocs()} initialSlug={null} />;
}