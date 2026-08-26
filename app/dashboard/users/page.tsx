"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { isAtLeast, outranks, getRoleInfo } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/client"
import { approveUser, rejectUser, updateUserRole, toggleUserActive } from "@/app/actions/admin"
import type { Profile, UserRole } from "@/lib/supabase/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Users,
  Search,
  Shield,
  Ban,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  Download,
  Clock,
  UserCheck,
} from "lucide-react"

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !isAtLeast(user.role, "admin")) return
    const load = async () => {
      const supabase = createClient()
      let query = supabase.from("profiles").select("*")
      // Org scoping (god can see all, super_admin and below only their org)
      if (user.role !== "god" && user.org_id) {
        query = query.eq("org_id", user.org_id)
      }
      const { data } = await query.order("created_at", { ascending: false }) as { data: Profile[] | null }
      setUsers(data || [])
      setLoading(false)
    }
    load()
  }, [user])

  // All privileged writes go through server actions, which re-check
  // role/org authority server-side; the UI checks are only for UX.
  const handleApprove = async (targetUser: Profile) => {
    if (!user) return
    setActionLoading(targetUser.id)
    const result = await approveUser(targetUser.id)
    if (result.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, approval_status: "approved" as const } : u))
      )
    }
    setActionLoading(null)
  }

  const handleReject = async (targetUser: Profile) => {
    if (!user) return
    setActionLoading(targetUser.id)
    const result = await rejectUser(targetUser.id)
    if (result.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, approval_status: "rejected" as const } : u))
      )
    }
    setActionLoading(null)
  }

  const handleRoleChange = async (targetUser: Profile, newRole: UserRole) => {
    if (!user) return
    if (targetUser.id === user.id) return
    if (!outranks(user.role, targetUser.role)) return

    const result = await updateUserRole(targetUser.id, newRole)
    if (result.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      )
    }
  }

  const handleToggleActive = async (targetUser: Profile) => {
    if (!user || targetUser.id === user.id) return
    if (!outranks(user.role, targetUser.role)) return

    const newActive = !targetUser.is_active
    const result = await toggleUserActive(targetUser.id, newActive)
    if (result.success) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, is_active: newActive } : u
        )
      )
    }
  }

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const exportUsers = (format: "csv" | "json") => {
    const data = filtered.map((u) => ({
      name: u.full_name,
      email: u.email,
      role: u.role,
      status: u.is_active ? "active" : "disabled",
      joined: new Date(u.created_at).toISOString(),
    }))

    let content: string
    let mimeType: string
    let filename = `users-export-${Date.now()}`

    if (format === "json") {
      content = JSON.stringify(data, null, 2)
      mimeType = "application/json"
      filename += ".json"
    } else {
      const headers = Object.keys(data[0] || {})
      const rows = data.map((row) => headers.map((h) => `"${String((row as any)[h]).replace(/"/g, '""')}"`).join(","))
      content = [headers.join(","), ...rows].join("\n")
      mimeType = "text/csv"
      filename += ".csv"
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // Roles current user can assign
  // God: can assign any role (user, admin, super_admin, god)
  // Super Admin: can assign user, admin, super_admin (NOT god) within their org
  // Admin: cannot change roles at all
  const assignableRoles = (targetRole: UserRole): UserRole[] => {
    if (!user) return []
    if (user.role === "god") {
      const allRoles: UserRole[] = ["user", "admin", "super_admin", "god"]
      return allRoles.filter((r) => r !== targetRole)
    }
    if (user.role === "super_admin") {
      const allowed: UserRole[] = ["user", "admin", "super_admin"]
      return allowed.filter((r) => r !== targetRole)
    }
    // Admins and users cannot change roles
    return []
  }

  // Whether the current user can change roles of the target user
  const canChangeRole = (targetUser: Profile): boolean => {
    if (!user || targetUser.id === user.id) return false
    if (!outranks(user.role, targetUser.role)) return false
    // Only god and super_admin can change roles
    if (user.role === "god") return true
    if (user.role === "super_admin") return true
    return false
  }

  if (!user || !isAtLeast(user.role, "admin")) {
    return (
      <div className="container mx-auto max-w-4xl py-20 text-center">
        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
          <Shield className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You need admin privileges to manage users.
        </p>
      </div>
    )
  }

  const pendingUsers = users.filter((u) => u.approval_status === "pending")
  const approvedUsers = filtered.filter((u) => u.approval_status !== "pending")
  const canApproveUsers = user ? isAtLeast(user.role, "super_admin") : false

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Administration</p>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
            {pendingUsers.length > 0 && ` · ${pendingUsers.length} pending approval`}
          </p>
        </div>
      </div>

      {/* Pending Approval Section */}
      {canApproveUsers && pendingUsers.length > 0 && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-800 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Pending Approval ({pendingUsers.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These users signed up with your organization code and are waiting for approval.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-medium text-muted-foreground">User</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Requested</TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-medium text-amber-700 dark:text-amber-400">
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.full_name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => handleApprove(u)}
                            className="h-7 text-xs text-emerald-600 hover:bg-emerald-500/10"
                          >
                            <UserCheck className="mr-1 h-3 w-3" /> Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => handleReject(u)}
                            className="h-7 text-xs text-red-500 hover:bg-red-500/10"
                          >
                            <XCircle className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Export */}
      <div className="flex items-center justify-between gap-3 animate-fade-in">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => exportUsers("csv")}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => exportUsers("json")}>
            <Download className="h-3.5 w-3.5" /> JSON
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card className="animate-fade-in overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium text-muted-foreground">User</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Role</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Joined</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Users className="h-6 w-6 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No users found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  approvedUsers.map((u) => {
                    const roleInfo = getRoleInfo(u.role)
                    const canModify = u.id !== user.id && outranks(user.role, u.role)
                    const canRole = canChangeRole(u)
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {u.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.full_name}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canRole ? (
                            <Select
                              value={u.role}
                              onValueChange={(v) => handleRoleChange(u, v as UserRole)}
                            >
                              <SelectTrigger className="w-[130px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={u.role}>
                                  {roleInfo.label} (current)
                                </SelectItem>
                                {assignableRoles(u.role).map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {getRoleInfo(r).label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={`${roleInfo.bgClass} text-xs`}>
                              {roleInfo.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.approval_status === "rejected" ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 text-xs">
                              Rejected
                            </Badge>
                          ) : u.is_active ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-200 text-xs">
                              Disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {canModify && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(u)}
                              className={`h-7 text-xs ${u.is_active ? "text-red-500 hover:bg-red-500/10" : "text-emerald-500 hover:bg-emerald-500/10"}`}
                            >
                              {u.is_active ? (
                                <><Ban className="mr-1 h-3 w-3" /> Disable</>
                              ) : (
                                <><CheckCircle className="mr-1 h-3 w-3" /> Enable</>
                              )}
                            </Button>
                          )}
                          {u.id === user.id && (
                            <Badge variant="secondary" className="text-xs">You</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
