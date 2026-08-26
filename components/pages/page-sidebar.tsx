"use client"

// Notion-style sidebar for /dashboard/pages/** — list, search, create, archive, delete.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import {
  Plus,
  Search,
  StickyNote,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  FileText,
  Loader2,
  Upload,
  Inbox,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarPage {
  id: string
  title: string
  emoji: string | null
  visibility: string
  is_archived: boolean
  updated_at: string
}

interface SidebarContextValue {
  pages: SidebarPage[]
  loading: boolean
  refresh: () => Promise<void>
  patchLocal: (id: string, patch: Partial<SidebarPage>) => void
  removeLocal: (id: string) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function usePageSidebar() {
  return useContext(SidebarContext)
}

export function PageSidebarProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<SidebarPage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pages?archived=true", {
        credentials: "include",
      })
      if (!res.ok) {
        setPages([])
        return
      }
      const json = await res.json()
      setPages((json.pages ?? []) as SidebarPage[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const patchLocal = useCallback(
    (id: string, patch: Partial<SidebarPage>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      )
    },
    []
  )
  const removeLocal = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const value = useMemo<SidebarContextValue>(
    () => ({ pages, loading, refresh, patchLocal, removeLocal }),
    [pages, loading, refresh, patchLocal, removeLocal]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

interface PageSidebarProps {
  onNavigate?: () => void
  className?: string
}

export function PageSidebar({ onNavigate, className }: PageSidebarProps) {
  const ctx = useContext(SidebarContext)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)

  if (!ctx) {
    throw new Error("PageSidebar must be rendered inside PageSidebarProvider")
  }

  const { pages, loading, refresh, removeLocal, patchLocal } = ctx

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = pages
    if (!showArchived) list = list.filter((p) => !p.is_archived)
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q))
    // Re-sort locally — patchLocal updates updated_at without refetching.
    return [...list].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [pages, search, showArchived])

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
      await refresh()
      router.push(`/dashboard/pages/${json.page.id}`)
      onNavigate?.()
    } catch (err: any) {
      toast({
        title: "Could not create page",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleImport(file: File) {
    if (!file.name.toLowerCase().endsWith(".md")) {
      toast({
        title: "Unsupported file",
        description: "Only Markdown (.md) files can be imported right now.",
        variant: "destructive",
      })
      return
    }
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/pages/import", {
        method: "POST",
        credentials: "include",
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import failed")
      await refresh()
      router.push(`/dashboard/pages/${json.page.id}`)
      onNavigate?.()
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setImporting(false)
    }
  }

  async function handleArchiveToggle(page: SidebarPage) {
    const next = !page.is_archived
    // Optimistic
    patchLocal(page.id, { is_archived: next })
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_archived: next }),
    })
    if (!res.ok) {
      // revert
      patchLocal(page.id, { is_archived: !next })
      const j = await res.json().catch(() => ({}))
      toast({
        title: next ? "Archive failed" : "Restore failed",
        description: j.error,
        variant: "destructive",
      })
    } else {
      toast({ title: next ? "Page archived" : "Page restored" })
    }
  }

  async function handleDelete(page: SidebarPage) {
    if (
      !confirm(
        `Delete "${page.title || "Untitled"}"? This cannot be undone.`
      )
    ) {
      return
    }
    removeLocal(page.id)
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!res.ok) {
      await refresh() // resync
      const j = await res.json().catch(() => ({}))
      toast({
        title: "Delete failed",
        description: j.error,
        variant: "destructive",
      })
      return
    }
    toast({ title: "Page deleted" })
    // If we were viewing the deleted page, bounce to the list.
    if (pathname?.startsWith(`/dashboard/pages/${page.id}`)) {
      router.push("/dashboard/pages")
    }
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-full w-full bg-muted/30 border-r",
        className
      )}
    >
      {/* Header */}
      <div className="px-3 py-3 border-b bg-background/60">
        <div className="flex items-center gap-2 mb-2.5">
          <StickyNote className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold tracking-tight flex-1">Pages</h2>
          <label className="relative" title="Import markdown">
            <input
              type="file"
              accept=".md,text/markdown"
              className="sr-only"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImport(f)
                e.target.value = ""
              }}
            />
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
              aria-label="Import markdown"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
            </span>
          </label>
          <Button
            size="icon"
            variant="default"
            className="h-7 w-7"
            onClick={handleCreate}
            disabled={creating}
            aria-label="New page"
            title="New page"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 py-2">
        {loading ? (
          <div className="space-y-1 px-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Inbox className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-medium mb-1">
              {search ? "No matches" : "No pages yet"}
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              {search
                ? "Try a different search."
                : "Create your first page to start."}
            </p>
            {!search && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleCreate}
                disabled={creating}
              >
                <Plus className="h-3 w-3 mr-1" />
                New page
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((p) => {
              const active = pathname === `/dashboard/pages/${p.id}`
              return (
                <li key={p.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md transition-colors",
                      active ? "bg-accent" : "hover:bg-muted"
                    )}
                  >
                    <Link
                      href={`/dashboard/pages/${p.id}`}
                      onClick={onNavigate}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-[13px]"
                    >
                      <span className="text-base leading-none shrink-0">
                        {p.emoji || (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground inline-block" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "truncate flex-1",
                          active
                            ? "font-medium text-foreground"
                            : "text-foreground/80",
                          p.is_archived && "text-muted-foreground line-through"
                        )}
                      >
                        {p.title || "Untitled"}
                      </span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "h-6 w-6 mr-1 rounded flex items-center justify-center text-muted-foreground transition-opacity",
                            "opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100",
                            // Always visible on touch (no hover).
                            "md:opacity-0 opacity-60 hover:bg-background"
                          )}
                          aria-label="Page actions"
                          onClick={(e) => e.preventDefault()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => handleArchiveToggle(p)}
                        >
                          {p.is_archived ? (
                            <>
                              <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive className="h-3.5 w-3.5 mr-2" />
                              Archive
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer: archived toggle */}
      <div className="border-t px-2 py-2 bg-background/60">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
          // Suppress benign fdprocessedid mismatch from browser autofill extensions.
          suppressHydrationWarning
        >
          <Archive className="h-3 w-3" />
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
    </aside>
  )
}
