"use client"

// Pages overview — grid of recently updated pages + "New page" CTA.
import { useMemo, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { usePageSidebar } from "@/components/pages/page-sidebar"
import {
  StickyNote,
  Plus,
  Lock,
  Globe,
  Building2,
  Users,
  ArrowRight,
  Loader2,
} from "lucide-react"

const VIS_META: Record<
  string,
  { label: string; icon: any; tone: string }
> = {
  private: {
    label: "Private",
    icon: Lock,
    tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  org: {
    label: "Organization",
    icon: Building2,
    tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  role: {
    label: "Role",
    icon: Users,
    tone: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  },
  restricted: {
    label: "Restricted",
    icon: Users,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  public_link: {
    label: "Public link",
    icon: Globe,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function PagesOverviewPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const sidebar = usePageSidebar()
  const [creating, setCreating] = useState(false)

  const recent = useMemo(() => {
    if (!sidebar) return []
    return sidebar.pages
      .filter((p) => !p.is_archived)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .slice(0, 12)
  }, [sidebar])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Untitled" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create page")
      await sidebar?.refresh()
      router.push(`/dashboard/pages/${json.page.id}`)
    } catch (err: any) {
      toast({
        title: "Could not create page",
        description: err.message,
        variant: "destructive",
      })
      setCreating(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
      {/* Hero */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <StickyNote className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            Pages
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {user.org_id
              ? "Collaborative, Notion-style pages scoped to your organization."
              : "Private, Notion-style pages just for you. Join an organization to share."}
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={creating}
          size="sm"
          className="h-9 w-full sm:w-auto"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1" />
          )}
          {creating ? "Creating…" : "New Page"}
        </Button>
      </div>

      {/* Recents */}
      {sidebar?.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <StickyNote className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">No pages yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first page to start writing.
            </p>
            <Button onClick={handleCreate} size="sm" disabled={creating}>
              <Plus className="h-4 w-4 mr-1" />
              New Page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2 px-1">
            Recently updated
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => {
              const vis = VIS_META[p.visibility] ?? VIS_META.org
              const VisIcon = vis.icon
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/pages/${p.id}`}
                  className="group"
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-xl leading-none mt-0.5">
                          {p.emoji || "📄"}
                        </span>
                        <h3 className="text-sm font-medium leading-snug line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                          {p.title || "Untitled"}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                        <Badge
                          variant="secondary"
                          className={`${vis.tone} gap-1 font-normal`}
                        >
                          <VisIcon className="h-3 w-3" />
                          {vis.label}
                        </Badge>
                        <span className="flex items-center gap-1">
                          {formatDate(p.updated_at)}
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
