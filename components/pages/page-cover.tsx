"use client"

// Cover image + emoji controls for a page. Thin controller — the editor page owns state + API calls.
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ImageIcon, Smile, Trash2, Upload, Link2 } from "lucide-react"

// Small curated emoji set. Not exhaustive — users can paste their own native emoji via the keyboard later if we ship a real picker.
const EMOJI_CHOICES = [
  "📄", "📝", "📚", "📘", "📙", "📗", "📕",
  "🗒️", "📋", "📊", "📈", "📉", "🗂️", "🗃️",
  "💡", "🧠", "🎯", "🚀", "⭐", "🔥", "✨",
  "🏷️", "🔖", "🧩", "🛠️", "⚙️", "🧪", "🔬",
  "🏢", "🏛️", "🏫", "👥", "🤝", "💼", "📣",
  "✅", "❗", "⚠️", "🔒", "🔐", "🌱", "🌍",
]

interface PageCoverProps {
  pageId: string
  coverUrl: string | null
  emoji: string | null
  canEdit: boolean
  // persisted = true when the server already saved the change (upload/delete
  // endpoints), so the parent only needs to update local state.
  onUpdate: (
    patch: { cover_url?: string | null; emoji?: string | null },
    persisted?: boolean
  ) => void
}

export function PageCover({
  pageId,
  coverUrl,
  emoji,
  canEdit,
  onUpdate,
}: PageCoverProps) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [urlValue, setUrlValue] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/pages/${pageId}/cover`, {
        method: "POST",
        credentials: "include",
        body: fd,
      })
      const json = await res.json()
      if (res.ok) {
        onUpdate({ cover_url: json.page.cover_url }, true)
      } else {
        alert(json.error ?? "Upload failed")
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveCover() {
    const res = await fetch(`/api/pages/${pageId}/cover`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) onUpdate({ cover_url: null }, true)
  }

  function handleExternalUrl() {
    const trimmed = urlValue.trim()
    if (!trimmed) return
    try {
      const u = new URL(trimmed)
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        alert("URL must use http or https")
        return
      }
    } catch {
      alert("Invalid URL")
      return
    }
    // External URL → update via PATCH on the page, not the cover endpoint.
    onUpdate({ cover_url: trimmed })
    setUrlDialogOpen(false)
    setUrlValue("")
  }

  return (
    <div className="group/cover relative">
      {/* Cover area — falls back to the default /cover-image.png when empty. */}
      <div className="relative h-28 sm:h-32 md:h-48 w-full bg-gradient-to-br from-muted to-muted/40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl || "/cover-image.png"}
          alt=""
          className="h-full w-full object-cover"
        />
        {canEdit && (
          // Always visible on touch screens (no hover). On pointer-capable devices we fade it in when the container is hovered/focused.
          <div className="absolute bottom-2 right-2 flex gap-1.5 md:opacity-0 md:group-hover/cover:opacity-100 md:focus-within:opacity-100 transition-opacity">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ""
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 text-xs">
                  <ImageIcon className="h-3 w-3 mr-1" />
                  {coverUrl ? "Change" : "Add cover"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading…" : "Upload image"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUrlDialogOpen(true)}>
                  <Link2 className="h-4 w-4 mr-2" />
                  External URL
                </DropdownMenuItem>
                {coverUrl && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleRemoveCover}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove cover
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Emoji floating on top of the cover */}
      <div className="container mx-auto max-w-4xl px-3 sm:px-4">
        <div className="relative -mt-7 sm:-mt-8 mb-2 flex items-end">
          <DropdownMenu open={emojiOpen} onOpenChange={setEmojiOpen}>
            <DropdownMenuTrigger asChild disabled={!canEdit}>
              <button
                type="button"
                className="text-4xl sm:text-5xl leading-none bg-background rounded-md px-2 py-1 shadow-sm border hover:bg-muted transition-colors disabled:cursor-default"
                aria-label="Change emoji"
              >
                {emoji || "📄"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="p-2 w-[calc(100vw-2rem)] max-w-[280px]"
            >
              <div className="grid grid-cols-7 gap-1">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onUpdate({ emoji: e })
                      setEmojiOpen(false)
                    }}
                    className="text-xl p-1.5 sm:p-1 rounded hover:bg-muted active:bg-muted transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
              {emoji && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onUpdate({ emoji: null })
                      setEmojiOpen(false)
                    }}
                    className="text-xs"
                  >
                    <Smile className="h-3.5 w-3.5 mr-2" />
                    Clear emoji
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* External URL dialog */}
      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[420px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>External cover URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://example.com/image.jpg"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUrlDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleExternalUrl}>
                Use this URL
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
