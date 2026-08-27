"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
} from "@/components/ui/sheet";
import {
  Search, BookOpen, ChevronRight, FileText, X,
  ArrowUp, Hash, ExternalLink, Menu, List, Check, ListTree,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HeadingInfo { level: number; text: string; id: string }
interface DocFile { slug: string; title: string; content: string; headings: HeadingInfo[] }
interface SearchResult {
  type: "page" | "heading"; docSlug: string; docTitle: string;
  headingText?: string; headingId?: string; headingLevel?: number;
}

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Collapses blank lines between markdown table rows so remark-gfm doesn't break on tables pasted from Notion/Confluence.
function normalizeMarkdownTables(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (!isTableRow(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j < lines.length && isTableRow(lines[j])) {
      i = j - 1;
    }
  }
  return out.join("\n");
}

interface DocsViewProps {
  // Docs are read on the server and passed in, so the first paint already has content.
  docs: DocFile[];
  // Slug from the URL (e.g. /docs/<slug>). When null, renders the first doc.
  initialSlug?: string | null;
}

function resolveSlug(docs: DocFile[], initialSlug: string | null) {
  if (initialSlug && docs.some(doc => doc.slug === initialSlug)) return initialSlug;
  return docs[0]?.slug ?? "";
}

export default function DocsView({ docs, initialSlug = null }: DocsViewProps) {
  const router = useRouter();
  const [activeSlug, setActiveSlug] = useState(() => resolveSlug(docs, initialSlug));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep activeSlug synced with the URL (back/forward, prop changes).
  useEffect(() => {
    setActiveSlug(resolveSlug(docs, initialSlug));
  }, [initialSlug, docs]);

  // Migrate legacy /docs#<slug> deep links to /docs/<slug>.
  useEffect(() => {
    if (initialSlug) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && docs.some(doc => doc.slug === hash)) {
      setActiveSlug(hash);
      router.replace(`/docs/${hash}`);
    }
  }, [initialSlug, docs, router]);

  useEffect(() => {
    const fn = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const activeDoc = useMemo(() => docs.find(d => d.slug === activeSlug), [docs, activeSlug]);
  // Pre-normalise the markdown so edge cases (e.g. tables with blank lines between rows) render correctly without forcing every doc author to hand-format their source.
  const activeDocMarkdown = useMemo(
    () => (activeDoc ? normalizeMarkdownTables(activeDoc.content) : ""),
    [activeDoc],
  );

  // Scroll-spy: highlight the heading closest to the top of the viewport.
  useEffect(() => {
    if (!activeDoc) return;
    const ids = activeDoc.headings.filter(h => h.level >= 2 && h.level <= 3).map(h => h.id);
    if (!ids.length) { setActiveHeading(""); return; }

    const updateActive = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - 100 <= 0) current = id;
        else break;
      }
      setActiveHeading(current);
    };
    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => window.removeEventListener("scroll", updateActive);
  }, [activeDoc]);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];
    docs.forEach(doc => {
      if (doc.title.toLowerCase().includes(q) || doc.slug.includes(q))
        results.push({ type: "page", docSlug: doc.slug, docTitle: doc.title });
      doc.headings.forEach(h => {
        if (h.text.toLowerCase().includes(q))
          results.push({ type: "heading", docSlug: doc.slug, docTitle: doc.title, headingText: h.text, headingId: h.id, headingLevel: h.level });
      });
    });
    return results.slice(0, 20);
  }, [searchQuery, docs]);

  const scrollToHeading = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const navigate = useCallback((slug: string, headingId?: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    setMobileNavOpen(false);

    if (slug === activeSlug) {
      if (headingId) scrollToHeading(headingId);
      else window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveSlug(slug);
    router.push(`/docs/${slug}`);
    if (headingId) {
      setTimeout(() => scrollToHeading(headingId), 200);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeSlug, router, scrollToHeading]);

  const activeIndex = docs.findIndex(d => d.slug === activeSlug);
  const prevDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
  const nextDoc = activeIndex < docs.length - 1 ? docs[activeIndex + 1] : null;

  const tocHeadings = activeDoc?.headings.filter(h => h.level >= 2 && h.level <= 3) ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Search Overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh] sm:pt-[15vh]"
          onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
        >
          <div
            className="w-full max-w-[92vw] sm:max-w-lg bg-background border rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search documentation..."
                className="border-0 shadow-none focus-visible:ring-0 h-8 text-[15px] sm:text-[16px] px-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                aria-label="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {searchResults.length > 0 && (
              <ScrollArea className="max-h-[50vh] sm:max-h-[320px]">
                <div className="p-2">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(r.docSlug, r.headingId)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-muted/60 transition-colors"
                    >
                      {r.type === "page"
                        ? <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        : <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium truncate">
                          {r.type === "heading" ? r.headingText : r.docTitle}
                        </p>
                        {r.type === "heading" && (
                          <p className="text-[12px] text-muted-foreground truncate">
                            {r.docTitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
            {searchQuery && searchResults.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No results found
              </div>
            )}
            <div className="px-3 sm:px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] text-muted-foreground">
                {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground">
                ESC to close
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Left Sidebar — fixed header + scrollable doc list */}
        <aside className="hidden lg:flex flex-col w-[280px] shrink-0 border-r sticky top-0 h-screen overflow-hidden">
          {/* Fixed header: brand + search. Does NOT scroll with the doc list or the page. */}
          <div className="shrink-0 border-b bg-background z-10">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold tracking-tight leading-none">Documentation</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Everything you need</p>
                </div>
              </div>
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 100); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground flex-1 text-left">Search docs...</span>
                <kbd className="text-[10px] bg-background border rounded px-1.5 py-0.5 text-muted-foreground font-mono">⌘K</kbd>
              </button>
            </div>
          </div>
          {/* Scrollable doc list */}
          <ScrollArea className="flex-1">
            <nav className="px-3 py-4">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pages
              </p>
              {docs.map(doc => (
                <button
                  key={doc.slug}
                  onClick={() => navigate(doc.slug)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] text-left transition-colors mb-0.5",
                    activeSlug === doc.slug
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Mobile nav */}
          <div className="lg:hidden sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b">
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* Page picker trigger */}
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <button
                    className="flex-1 min-w-0 flex items-center gap-2.5 h-10 px-3 rounded-lg border bg-card/60 hover:bg-muted/60 active:bg-muted transition-colors"
                    aria-label="Open documentation navigation"
                  >
                    <span className="flex-shrink-0 h-6 w-6 rounded-md bg-primary/10 border border-primary/15 flex items-center justify-center">
                      <BookOpen className="h-3 w-3 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                        Documentation
                      </p>
                      <p className="text-[14px] font-medium truncate leading-tight">
                        {activeDoc?.title ?? "Browse docs"}
                      </p>
                    </div>
                    <Menu className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[88vw] sm:w-[360px] p-0 flex flex-col gap-0"
                >
                  <SheetHeader className="p-4 border-b space-y-3 text-left">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <SheetTitle className="text-[15px]">
                        Documentation
                      </SheetTitle>
                    </div>
                    <button
                      onClick={() => {
                        setMobileNavOpen(false);
                        setSearchOpen(true);
                        setTimeout(() => searchRef.current?.focus(), 100);
                      }}
                      className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[13px] text-muted-foreground flex-1 text-left">
                        Search docs...
                      </span>
                      <kbd className="text-[10px] bg-background border rounded px-1.5 py-0.5 text-muted-foreground">
                        ⌘K
                      </kbd>
                    </button>
                  </SheetHeader>

                  <ScrollArea className="flex-1">
                    <nav className="p-2">
                      <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Pages
                      </p>
                      {docs.map((doc) => {
                        const active = activeSlug === doc.slug;
                        return (
                          <button
                            key={doc.slug}
                            onClick={() => navigate(doc.slug)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-left transition-colors mb-0.5",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground/90 hover:bg-muted/60"
                            )}
                          >
                            <FileText
                              className={cn(
                                "h-4 w-4 flex-shrink-0",
                                active ? "text-primary" : "text-muted-foreground"
                              )}
                            />
                            <span className="flex-1 truncate">{doc.title}</span>
                            {active && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}

                      {/* On this page (TOC) — current doc */}
                      {tocHeadings.length > 0 && (
                        <div className="mt-4">
                          <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <List className="h-3 w-3" />
                            On this page
                          </p>
                          <div className="space-y-0.5">
                            {tocHeadings.map((h, i) => (
                              <button
                                key={i}
                                onClick={() => navigate(activeSlug, h.id)}
                                className={cn(
                                  "w-full flex items-center gap-2 py-1.5 rounded-md text-left text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors",
                                  h.level === 3 ? "pl-8 pr-3" : "pl-5 pr-3"
                                )}
                              >
                                <Hash className="h-3 w-3 flex-shrink-0 opacity-60" />
                                <span className="truncate">{h.text}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </nav>
                  </ScrollArea>
                </SheetContent>
              </Sheet>

              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 flex-shrink-0"
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchRef.current?.focus(), 100);
                }}
                aria-label="Search docs"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Three-column content: article + right TOC sidebar */}
          <div className="flex gap-8 xl:gap-12 px-6 py-10 lg:px-10 xl:px-16 max-w-[1400px] mx-auto">
            {/* Article */}
            <article ref={contentRef} className="flex-1 min-w-0 max-w-3xl">
              {activeDoc && (
                <div className="docs-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({children}) => <h1 id={slugify(String(children))} className="text-4xl font-bold tracking-tight mb-6 mt-2 scroll-mt-24">{children}</h1>,
                      h2: ({children}) => <h2 id={slugify(String(children))} className="text-2xl font-semibold tracking-tight mb-4 mt-12 pb-2 border-b scroll-mt-24">{children}</h2>,
                      h3: ({children}) => <h3 id={slugify(String(children))} className="text-xl font-semibold mb-3 mt-8 scroll-mt-24">{children}</h3>,
                      h4: ({children}) => <h4 id={slugify(String(children))} className="text-base font-semibold mb-2 mt-5 scroll-mt-24">{children}</h4>,
                      p: ({children}) => <p className="text-[16px] leading-[1.75] text-foreground/85 mb-4">{children}</p>,
                      ul: ({children}) => <ul className="text-[16px] leading-[1.75] list-disc pl-6 mb-4 space-y-1.5 text-foreground/85">{children}</ul>,
                      ol: ({children}) => <ol className="text-[16px] leading-[1.75] list-decimal pl-6 mb-4 space-y-1.5 text-foreground/85">{children}</ol>,
                      li: ({children}) => <li className="text-[16px] leading-[1.75]">{children}</li>,
                      a: ({href, children}) => {
                        const raw = href ?? "";
                        // In-page anchor (e.g. "#creating-a-page") — scroll inside the current doc.
                        if (raw.startsWith("#")) {
                          const id = raw.slice(1);
                          return (
                            <a
                              href={raw}
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                e.preventDefault();
                                scrollToHeading(id);
                              }}
                            >
                              {children}
                            </a>
                          );
                        }
                        // Cross-doc link — either another doc slug (e.g. "pages.md", "roles.md#section") or a docs-root link ("/docs/pages", "/docs#pages").
                        const crossDocMatch =
                          raw.match(/^\/docs(?:\/|#)?([a-z0-9-]+)?(?:#([a-z0-9-]+))?$/i) ||
                          raw.match(/^([a-z0-9-]+)\.md(?:#([a-z0-9-]+))?$/i);
                        if (crossDocMatch) {
                          const targetSlug = crossDocMatch[1];
                          const targetHeading = crossDocMatch[2];
                          if (targetSlug && docs.some((d) => d.slug === targetSlug)) {
                            return (
                              <a
                                href={`/docs/${targetSlug}${targetHeading ? `#${targetHeading}` : ""}`}
                                className="text-primary hover:underline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate(targetSlug, targetHeading);
                                }}
                              >
                                {children}
                              </a>
                            );
                          }
                        }
                        // External link — open in a new tab.
                        return (
                          <a
                            href={raw}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            {children}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        );
                      },
                      strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({children}) => <em className="italic">{children}</em>,
                      blockquote: ({children}) => <blockquote className="border-l-4 border-primary/30 pl-4 my-4 text-[15px] text-muted-foreground italic">{children}</blockquote>,
                      code: ({children, className}) => {
                        const isBlock = className?.includes("language-");
                        if (isBlock) return <pre className="bg-muted/60 border rounded-lg p-4 my-4 overflow-x-auto"><code className="text-[13.5px] font-mono leading-relaxed">{children}</code></pre>;
                        return <code className="bg-muted/60 text-[14px] font-mono px-1.5 py-0.5 rounded">{children}</code>;
                      },
                      table: ({children}) => <div className="my-5 overflow-x-auto border rounded-lg"><table className="w-full text-[14px]">{children}</table></div>,
                      thead: ({children}) => <thead className="bg-muted/40 border-b">{children}</thead>,
                      th: ({children}) => <th className="text-left px-3 py-2 font-semibold text-[12px] uppercase tracking-wider text-muted-foreground">{children}</th>,
                      td: ({children}) => <td className="px-3 py-2 border-t text-[14px]">{children}</td>,
                      hr: () => <hr className="my-8 border-border/60" />,
                      img: ({src, alt}) => <img src={src} alt={alt || ""} className="rounded-lg border my-5 max-w-full h-auto" />,
                    }}
                  >
                    {activeDocMarkdown}
                  </ReactMarkdown>

                  {/* Prev / Next navigation */}
                  <div className="flex items-center justify-between mt-16 pt-8 border-t gap-4">
                    {prevDoc ? (
                      <button
                        onClick={() => navigate(prevDoc.slug)}
                        className="group flex-1 flex flex-col items-start gap-1 text-left p-4 rounded-lg border hover:border-primary/50 hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">← Previous</span>
                        <span className="text-[15px] font-medium text-foreground group-hover:text-primary transition-colors">{prevDoc.title}</span>
                      </button>
                    ) : <div className="flex-1" />}
                    {nextDoc ? (
                      <button
                        onClick={() => navigate(nextDoc.slug)}
                        className="group flex-1 flex flex-col items-end gap-1 text-right p-4 rounded-lg border hover:border-primary/50 hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Next →</span>
                        <span className="text-[15px] font-medium text-foreground group-hover:text-primary transition-colors">{nextDoc.title}</span>
                      </button>
                    ) : <div className="flex-1" />}
                  </div>
                </div>
              )}
            </article>

            {/* Right Sidebar — On this page (desktop) */}
            <aside className="hidden xl:block w-[240px] shrink-0">
              <div className="sticky top-10">
                {tocHeadings.length > 0 ? (
                  <div className="border-l pl-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ListTree className="h-4 w-4 text-primary" />
                      <p className="text-[12px] font-semibold uppercase tracking-widest text-foreground">
                        On this page
                      </p>
                    </div>
                    <nav className="space-y-1">
                      {tocHeadings.map((h, i) => {
                        const isActive = activeHeading === h.id;
                        return (
                          <button
                            key={i}
                            onClick={() => scrollToHeading(h.id)}
                            className={cn(
                              "block w-full text-left text-[13px] leading-snug py-1.5 transition-colors truncate",
                              h.level === 3 ? "pl-4" : "",
                              isActive
                                ? "text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {h.text}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </main>
      </div>

      {/* Scroll to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
