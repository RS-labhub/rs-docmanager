"use client"

// Share dialog — manage visibility + explicit page_shares.
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Trash2, UserPlus, Lock, Globe, Users, Building2, Copy, Check } from "lucide-react"
import type {
  PagePermission,
  PageShare,
  PageVisibility,
  Profile,
  UserRole,
} from "@/lib/supabase/types"

interface ShareWithProfile extends PageShare {
  profile: Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "org_id"> | null
}

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  canManage: boolean
  initialVisibility: PageVisibility
  initialMinRole: UserRole | null
  onVisibilityChange: (next: {
    visibility: PageVisibility
    min_role: UserRole | null
  }) => void
}

const PERMISSION_LABELS: Record<PagePermission, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  full_access: "Full access",
}

const VISIBILITY_OPTIONS: {
  value: PageVisibility
  label: string
  description: string
  icon: any
}[] = [
  {
    value: "private",
    label: "Private",
    description: "Only you and people you invite can see it.",
    icon: Lock,
  },
  {
    value: "org",
    label: "Organization",
    description: "Everyone in your organization can view.",
    icon: Building2,
  },
  {
    value: "role",
    label: "Role",
    description: "Only a minimum role tier inside your org can view.",
    icon: Users,
  },
  {
    value: "restricted",
    label: "Restricted",
    description: "Only the people you invite below.",
    icon: Users,
  },
  {
    value: "public_link",
    label: "Public link",
    description: "Anyone with the link can view — no sign-in required.",
    icon: Globe,
  },
]

export function ShareDialog({
  open,
  onOpenChange,
  pageId,
  canManage,
  initialVisibility,
  initialMinRole,
  onVisibilityChange,
}: ShareDialogProps) {
  const { toast } = useToast()
  const [visibility, setVisibility] = useState<PageVisibility>(initialVisibility)
  const [minRole, setMinRole] = useState<UserRole | null>(initialMinRole)
  const [shares, setShares] = useState<ShareWithProfile[]>([])
  const [loadingShares, setLoadingShares] = useState(false)
  const [savingVis, setSavingVis] = useState(false)

  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePermission, setInvitePermission] = useState<PagePermission>("view")
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setVisibility(initialVisibility)
    setMinRole(initialMinRole)
  }, [initialVisibility, initialMinRole, open])

  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoadingShares(true)
      const res = await fetch(`/api/pages/${pageId}/shares`, {
        credentials: "include",
      })
      if (res.ok) {
        const json = await res.json()
        setShares((json.shares ?? []) as ShareWithProfile[])
      }
      setLoadingShares(false)
    }
    load()
  }, [open, pageId])

  async function saveVisibility() {
    setSavingVis(true)
    try {
      const payload: Record<string, unknown> = { visibility }
      if (visibility === "role") payload.min_role = minRole ?? "user"
      else payload.min_role = null

      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      onVisibilityChange({
        visibility: json.page.visibility,
        min_role: json.page.min_role,
      })
      toast({ title: "Visibility updated" })
    } catch (err: any) {
      toast({
        title: "Could not update visibility",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setSavingVis(false)
    }
  }

  async function addShare() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      // Resolve email to a user_id via the by-email lookup endpoint.
      const lookup = await fetch(
        `/api/users/by-email?email=${encodeURIComponent(inviteEmail.trim())}`,
        { credentials: "include" }
      )
      if (!lookup.ok) {
        const lj = await lookup.json().catch(() => ({}))
        if (lookup.status === 404) {
          throw new Error(
            "No active user with that email in your organization. They need to sign up and be approved first."
          )
        }
        if (lookup.status === 429) {
          throw new Error("Too many lookups. Please wait a moment and try again.")
        }
        throw new Error(lj.error ?? "Could not look up that email.")
      }
      const { user } = await lookup.json()

      const res = await fetch(`/api/pages/${pageId}/shares`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: user.id,
          permission: invitePermission,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to share")

      const refreshed = await fetch(`/api/pages/${pageId}/shares`, {
        credentials: "include",
      })
      if (refreshed.ok) {
        const rj = await refreshed.json()
        setShares(rj.shares ?? [])
      }
      setInviteEmail("")
      toast({ title: "Shared", description: `${user.email} now has access.` })
    } catch (err: any) {
      toast({
        title: "Could not share",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setInviting(false)
    }
  }

  async function removeShare(userId: string) {
    const res = await fetch(
      `/api/pages/${pageId}/shares?user_id=${userId}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    )
    if (res.ok) {
      setShares((s) => s.filter((x) => x.user_id !== userId))
    } else {
      const j = await res.json().catch(() => ({}))
      toast({
        title: "Remove failed",
        description: j.error ?? "Could not remove share",
        variant: "destructive",
      })
    }
  }

  const VisibilityIcon =
    VISIBILITY_OPTIONS.find((v) => v.value === visibility)?.icon ?? Lock

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VisibilityIcon className="h-4 w-4" />
            Share this page
          </DialogTitle>
          <DialogDescription>
            Control who can see and edit this page.
          </DialogDescription>
        </DialogHeader>

        {/* Visibility */}
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Who can access
          </Label>
          <div className="grid gap-2">
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const disabled = !canManage
              const active = visibility === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setVisibility(opt.value)}
                  className={`text-left border rounded-md px-3 py-2 transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                </button>
              )
            })}
          </div>

          {visibility === "role" && (
            <div className="space-y-1">
              <Label className="text-xs">Minimum role</Label>
              <Select
                value={minRole ?? "user"}
                onValueChange={(v) => setMinRole(v as UserRole)}
                disabled={!canManage}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={saveVisibility} disabled={savingVis}>
                {savingVis ? "Saving…" : "Save visibility"}
              </Button>
            </div>
          )}

          {/* Public link share box — only visible when the SAVED visibility
              is public_link. We gate on initialVisibility so the box shows
              the persisted state, not an unsaved draft. */}
          {initialVisibility === "public_link" && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Globe className="h-3.5 w-3.5" />
                Anyone with this link can view
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/p/${pageId}`
                      : `/p/${pageId}`
                  }
                  className="h-8 text-xs font-mono bg-background"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={async () => {
                    const link = `${window.location.origin}/p/${pageId}`
                    try {
                      await navigator.clipboard.writeText(link)
                      setCopied(true)
                      toast({ title: "Link copied" })
                      setTimeout(() => setCopied(false), 2000)
                    } catch {
                      toast({
                        title: "Could not copy",
                        description: "Select and copy manually.",
                        variant: "destructive",
                      })
                    }
                  }}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Explicit shares */}
        <div className="border-t pt-4 space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            People with access
          </Label>

          {canManage && (
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="h-9 w-full"
              />
              <div className="flex gap-2">
                <Select
                  value={invitePermission}
                  onValueChange={(v) => setInvitePermission(v as PagePermission)}
                >
                  <SelectTrigger className="h-9 flex-1 sm:w-[160px] sm:flex-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">Can view</SelectItem>
                    <SelectItem value="comment">Can comment</SelectItem>
                    <SelectItem value="edit">Can edit</SelectItem>
                    <SelectItem value="full_access">Full access</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={addShare}
                  disabled={inviting || !inviteEmail.trim()}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Invite
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {loadingShares ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No one has been invited individually yet. Invitees must already
                be members of your organization.
              </p>
            ) : (
              shares.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-sm border rounded-md px-2.5 sm:px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {s.profile?.full_name ?? "Unknown user"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.profile?.email ?? s.user_id}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] shrink-0 whitespace-nowrap"
                  >
                    {PERMISSION_LABELS[s.permission]}
                  </Badge>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeShare(s.user_id)}
                      aria-label="Remove share"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
