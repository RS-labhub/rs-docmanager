import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Compass,
  FileQuestion,
  Home,
  LayoutDashboard,
  Search,
} from "lucide-react"

// Global 404 page for any unmatched route.
export default function NotFound() {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] flex items-center justify-center overflow-hidden px-4 py-16">
      {/* Soft background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
        <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20" />
      </div>

      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-xl text-center">
        {/* Glyph */}
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl border bg-card shadow-sm mb-6">
          <FileQuestion className="h-9 w-9 text-muted-foreground" />
        </div>

        {/* Huge but not obnoxious 404 */}
        <div className="relative">
          <h1 className="text-[96px] sm:text-[120px] leading-none font-bold tracking-tighter bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground/60 bg-clip-text text-transparent select-none">
            404
          </h1>
        </div>

        <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
          This page wandered off
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
          The page you were looking for either moved, was never here, or
          you don&apos;t have permission to see it. Let&apos;s get you back on
          track.
        </p>

        {/* Actions */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Button asChild size="sm" className="h-9">
            <Link href="/">
              <Home className="h-4 w-4 mr-1.5" />
              Home
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              Dashboard
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-9">
            <Link href="/dashboard/pages">
              <Compass className="h-4 w-4 mr-1.5" />
              Browse pages
            </Link>
          </Button>
        </div>

        {/* Tertiary links */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Read the docs
          </Link>
          <span aria-hidden className="opacity-40">
            •
          </span>
          <Link
            href="/dashboard/documents"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to documents
          </Link>
        </div>
      </div>
    </div>
  )
}
