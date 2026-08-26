"use client"

// Public, anonymous read-only page view served from /p/<id>.
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Globe, ArrowLeft } from "lucide-react"

const PageEditor = dynamic(
  () => import("@/components/pages/page-editor").then((m) => m.PageEditor),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-6 space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    ),
  }
)

interface PublicPage {
  id: string
  title: string
  emoji: string | null
  cover_url: string | null
  content: unknown[]
  markdown_cache: string
  updated_at: string
}

export default function PublicPageView() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : ""
  const [page, setPage] = useState<PublicPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      try {
        // No credentials — this endpoint is public.
        const res = await fetch(`/api/pages/${id}/public`, {
          credentials: "omit",
        })
        if (!res.ok) {
          setNotFound(true)
          return
        }
        const json = await res.json()
        setPage(json.page as PublicPage)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-28 sm:h-32 md:h-48 bg-muted/40 animate-pulse" />
        <div className="container mx-auto max-w-4xl px-3 sm:px-4 py-6 space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    )
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 text-center">
        <Globe className="h-10 w-10 text-muted-foreground mb-3" />
        <h1 className="text-xl font-semibold mb-1">Page not available</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          This page may have been removed, archived, or is no longer shared
          publicly.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Go home
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-20">
      {/* Cover */}
      <div className="relative h-32 sm:h-40 md:h-52 w-full bg-gradient-to-br from-muted to-muted/40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.cover_url || "/cover-image.png"}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      {/* Emoji + title */}
      <div className="container mx-auto max-w-4xl px-4 sm:px-6">
        <div className="relative -mt-8 sm:-mt-10 mb-3 flex items-start justify-between gap-3">
          <span className="inline-flex items-center justify-center text-4xl sm:text-5xl leading-none bg-background rounded-lg px-2.5 py-1.5 shadow-sm border shrink-0">
            {page.emoji || "📄"}
          </span>
          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 sm:px-2.5 py-1 mt-2 shrink-0 whitespace-nowrap">
            <Globe className="h-3 w-3" />
            <span>Public Page</span>
          </span>
        </div>
        <h1 className="text-[22px] leading-tight sm:text-3xl md:text-4xl font-bold tracking-tight mb-2 break-words">
          {page.title || "Untitled"}
        </h1>
        <p className="text-[11px] sm:text-xs text-muted-foreground mb-5 sm:mb-6">
          Shared on{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-foreground">
            R&apos;s DocManager
          </Link>
        </p>

        <div className="overflow-x-hidden">
          <PageEditor
            initialContent={page.content as unknown[]}
            readOnly
          />
        </div>
      </div>
    </div>
  )
}
