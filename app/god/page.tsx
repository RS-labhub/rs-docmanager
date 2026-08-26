"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getRoleInfo } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/client"
import { createOrgAndSuperAdmin, deleteOrganization } from "@/app/actions/admin"
import type { Organization, Profile, UserRole } from "@/lib/supabase/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  Building2,
  Users,
  FileText,
  Shield,
  Search,
  Activity,
  TrendingUp,
  Download,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react"

interface OrgStats {
  org: Organization
  userCount: number
  docCount: number
}

interface AuditEntry {
  id: string
  action: string
  resource_type: string
  created_at: string
  user_id: string
  org_id: string | null
  details: Record<string, any>
}

export default function GodPanelPage() {
  const { user } = useAuth()
  const [orgStats, setOrgStats] = useState<OrgStats[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all")
  const [orgFilter, setOrgFilter] = useState<string>("all")

  // Create Org & Admin state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgDesc, setNewOrgDesc] = useState("")
  const [newOrgCode, setNewOrgCode] = useState("")
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [newAdminPassword, setNewAdminPassword] = useState("")

  // Delete Org state
  const [orgToDelete, setOrgToDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeletingOrg, setIsDeletingOrg] = useState(false)

  const handleDeleteOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || user.role !== "god" || !orgToDelete) return
    if (deleteConfirmText !== orgToDelete.name) {
      alert("Organization name does not match.")
      return
    }
    
    setIsDeletingOrg(true)
    try {
      const result = await deleteOrganization(orgToDelete.id)
      if (result.error) {
        alert(result.error)
      } else {
        alert("Organization deleted successfully.")
        setOrgToDelete(null)
        setDeleteConfirmText("")
        window.location.reload()
      }
    } catch (error) {
      console.error(error)
      alert("An unexpected error occurred.")
    } finally {
      setIsDeletingOrg(false)
    }
  }

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || user.role !== "god") return
    setIsCreatingOrg(true)
    try {
      const result = await createOrgAndSuperAdmin({
        orgName: newOrgName,
        description: newOrgDesc,
        orgCode: newOrgCode,
        adminEmail: newAdminEmail,
        adminPassword: newAdminPassword,
      })
      if (result.error) {
        alert(result.error)
      } else {
        alert("Organization and Super Admin created successfully!")
        setIsCreateOpen(false)
        setNewOrgName("")
        setNewOrgDesc("")
        setNewOrgCode("")
        setNewAdminPassword("")
        setNewAdminEmail("")
        // Refresh page
        window.location.reload()
      }
    } catch (error) {
      console.error(error)
      alert("An unexpected error occurred.")
    } finally {
      setIsCreatingOrg(false)
    }
  }

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  const exportData = (type: "users" | "orgs" | "logs", format: "csv" | "json") => {
    let data: any[] = []
    let filename = ""

    if (type === "users") {
      data = allUsers.map((u) => {
        const org = orgStats.find((s) => s.org.id === u.org_id)
        return { name: u.full_name, email: u.email, role: u.role, organization: org?.org.name || "", status: u.is_active ? "active" : "disabled", joined: new Date(u.created_at).toISOString() }
      })
      filename = `users-export-${Date.now()}`
    } else if (type === "orgs") {
      data = orgStats.map((s) => ({ name: s.org.name, slug: s.org.slug, description: s.org.description || "", users: s.userCount, documents: s.docCount, created: new Date(s.org.created_at).toISOString() }))
      filename = `orgs-export-${Date.now()}`
    } else {
      data = auditLogs.map((l) => ({ action: l.action, resource: l.resource_type, user_id: l.user_id, org_id: l.org_id || "", timestamp: new Date(l.created_at).toISOString(), details: JSON.stringify(l.details) }))
      filename = `audit-logs-export-${Date.now()}`
    }

    let content: string
    let mimeType: string
    if (format === "json") {
      content = JSON.stringify(data, null, 2)
      mimeType = "application/json"
      filename += ".json"
    } else {
      const headers = Object.keys(data[0] || {})
      const rows = data.map((row) => headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(","))
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

  useEffect(() => {
    if (!user || user.role !== "god") return

    const load = async () => {
      const supabase = createClient()

      const { data: orgs } = await supabase
        .from("organizations")
        .select("*")
        .order("name") as { data: Organization[] | null }

      const { data: users } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }) as { data: Profile[] | null }

      const { data: docs } = await supabase
        .from("documents")
        .select("id, org_id") as { data: { id: string; org_id: string }[] | null }

      const stats: OrgStats[] = (orgs || []).map((org) => ({
        org,
        userCount: (users || []).filter((u) => u.org_id === org.id).length,
        docCount: (docs || []).filter((d) => d.org_id === org.id).length,
      }))
      setOrgStats(stats)
      setAllUsers(users || [])

      const { data: logs } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50) as { data: AuditEntry[] | null }
      setAuditLogs(logs || [])

      setLoading(false)
    }
    load()
  }, [user])

  if (!user || user.role !== "god") {
    return (
      <div className="container mx-auto max-w-4xl py-20 text-center">
        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
          <Shield className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-1">
          God Panel is accessible only to God users.
        </p>
      </div>
    )
  }

  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === "all" || u.role === roleFilter
    const matchesOrg = orgFilter === "all" || u.org_id === orgFilter
    return matchesSearch && matchesRole && matchesOrg
  })

  const totalDocs = orgStats.reduce((sum, s) => sum + s.docCount, 0)

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Superuser</p>
        <h1 className="text-2xl font-semibold tracking-tight">God Panel</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cross-organization overview and system management
        </p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: "Organizations", value: orgStats.length, icon: Building2 },
          { title: "Total Users", value: allUsers.length, icon: Users },
          { title: "Total Documents", value: totalDocs, icon: FileText },
        ].map((card) => (
          <Card key={card.title}>
            <CardContent className="pt-5 pb-4 px-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                {loading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-3xl font-semibold mt-0.5 tracking-tight">{card.value}</p>
                )}
              </div>
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <card.icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orgs" className="animate-fade-in">
        <TabsList className="h-9 w-full sm:w-auto">
          <TabsTrigger value="orgs" className="text-xs gap-1 flex-1 sm:flex-none">
            <Building2 className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Organizations</span><span className="xs:hidden">Orgs</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs gap-1 flex-1 sm:flex-none">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs gap-1 flex-1 sm:flex-none">
            <Activity className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Audit</span> Logs
          </TabsTrigger>
        </TabsList>

        {/* Organizations Tab */}
        <TabsContent value="orgs" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Organizations Overview</h2>
            <div className="flex items-center gap-2">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Create Org & Admin</span>
                    <span className="sm:hidden">Create</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Organization & Super Admin</DialogTitle>
                    <DialogDescription>
                      This will instantly provision a new Organization and set up a Super Admin account.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateOrg} className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Organization Name *</Label>
                      <Input
                        id="orgName"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orgDesc">Description (Optional)</Label>
                      <Input
                        id="orgDesc"
                        value={newOrgDesc}
                        onChange={(e) => setNewOrgDesc(e.target.value)}
                        placeholder="e.g. Main corporate entity"
                      />
                    </div>
                      <div className="space-y-2">
                        <Label htmlFor="orgCode">Organization Code *</Label>
                        <Input
                          id="orgCode"
                          value={newOrgCode}
                          onChange={(e) => setNewOrgCode(e.target.value)}
                          placeholder="e.g. ACME2026"
                          required
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Users can join using this code.</p>
                      </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">Super Admin Email *</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="admin@acme.com"
                        required
                      />
                    <div className="space-y-2">
                      <Label htmlFor="adminPassword">Super Admin Password *</Label>
                      <Input
                        id="adminPassword"
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="Min 12 characters"
                        minLength={12}
                        required
                      />
                    </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsCreateOpen(false)}
                        disabled={isCreatingOrg}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isCreatingOrg}>
                        {isCreatingOrg ? "Creating..." : "Create Organization"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="flex gap-1.5 ml-2 border-l pl-2 border-border">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("orgs", "csv")}><Download className="h-3 w-3" /> CSV</Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("orgs", "json")}><Download className="h-3 w-3" /> JSON</Button>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {loading
              ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
              : orgStats.map((s) => {
                  const orgUsers = allUsers.filter((u) => u.org_id === s.org.id)
                  const isExpanded = expandedOrgs.has(s.org.id)
                  return (
                    <Card key={s.org.id} className="overflow-hidden">
                      <div onClick={() => toggleOrg(s.org.id)} className="w-full text-left cursor-pointer transition-colors hover:bg-muted/50">
                        <CardHeader className="pb-2">
                          <div className="flex items-start sm:items-center justify-between gap-2">
                            <CardTitle className="text-sm flex items-center gap-2 flex-wrap min-w-0">
                              <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <span className="truncate">{s.org.name}</span>
                              <Badge variant="secondary" className="text-[10px] font-mono hidden sm:inline-flex">Code: {s.org.org_code}</Badge>
                            </CardTitle>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOrgToDelete({ id: s.org.id, name: s.org.name })
                                }}
                                title="Delete Organization"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              <div className="flex gap-2 sm:gap-3">
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{s.userCount}</span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />{s.docCount}</span>
                              </div>
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </div>
                        </CardHeader>
                      </div>

                      {isExpanded && (
                        <CardContent className="pt-0">
                          {orgUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-3 pl-9">No users in this organization</p>
                          ) : (
                            <div className="border rounded-lg overflow-hidden sm:ml-9 overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px] font-medium text-muted-foreground">User</TableHead>
                                    <TableHead className="text-[10px] font-medium text-muted-foreground">Role</TableHead>
                                    <TableHead className="text-[10px] font-medium text-muted-foreground">Status</TableHead>
                                    <TableHead className="text-[10px] font-medium text-muted-foreground">Joined</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {orgUsers.map((u) => {
                                    const rInfo = getRoleInfo(u.role)
                                    return (
                                      <TableRow key={u.id}>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{u.full_name.charAt(0).toUpperCase()}</div>
                                            <div><p className="text-xs font-medium">{u.full_name}</p><p className="text-[10px] text-muted-foreground">{u.email}</p></div>
                                          </div>
                                        </TableCell>
                                        <TableCell><Badge className={`${rInfo.bgClass} text-[10px]`}>{rInfo.label}</Badge></TableCell>
                                        <TableCell>{u.is_active ? <span className="text-emerald-600 text-[10px]">Active</span> : <span className="text-red-600 text-[10px]">Disabled</span>}</TableCell>
                                        <TableCell className="text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )
                })}
          </div>
          {!loading && orgStats.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No organizations yet</p>
            </div>
          )}
        </TabsContent>

        {/* All Users Tab */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search all users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("users", "csv")}><Download className="h-3 w-3" /> CSV</Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("users", "json")}><Download className="h-3 w-3" /> JSON</Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole | "all")}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="god"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> God</span></SelectItem>
                <SelectItem value="super_admin"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Super Admin</span></SelectItem>
                <SelectItem value="admin"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Admin</span></SelectItem>
                <SelectItem value="user"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-stone-400" /> User</span></SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Filter by org" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {orgStats.map((s) => (
                  <SelectItem key={s.org.id} value={s.org.id}>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {s.org.name}
                      <Badge variant="outline" className="text-[9px] ml-1 px-1 py-0">{s.userCount}</Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(roleFilter !== "all" || orgFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={() => { setRoleFilter("all"); setOrgFilter("all") }}>
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground flex items-center ml-auto">
              {filteredUsers.length} of {allUsers.length} user{allUsers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium text-muted-foreground">User</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Role</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Organization</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => {
                      const rInfo = getRoleInfo(u.role)
                      const org = orgStats.find((s) => s.org.id === u.org_id)
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
                            <Badge className={`${rInfo.bgClass} text-xs`}>{rInfo.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {org ? org.org.name : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {u.is_active ? (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-xs">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600 border-red-200 text-xs">Disabled</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Logs Tab */}
        <TabsContent value="logs" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("logs", "csv")}><Download className="h-3 w-3" /> CSV</Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => exportData("logs", "json")}><Download className="h-3 w-3" /> JSON</Button>
            </div>
          </div>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                    <Activity className="h-5 w-5 opacity-30" />
                  </div>
                  <p className="text-sm font-medium">No audit logs yet</p>
                  <p className="text-xs mt-1">Activity will appear here as users interact with the system</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium text-muted-foreground">Action</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Resource</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
                              <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm font-medium capitalize">
                              {log.action.replace(/_/g, " ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {log.resource_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!orgToDelete} onOpenChange={(open) => {
        if (!open) {
          setOrgToDelete(null)
          setDeleteConfirmText("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Organization</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the organization <strong>{orgToDelete?.name}</strong>, all its users, documents, and associated data.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeleteOrg} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirmName">
                Please type <strong>{orgToDelete?.name}</strong> to confirm.
              </Label>
              <Input
                id="confirmName"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={orgToDelete?.name}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOrgToDelete(null)
                  setDeleteConfirmText("")
                }}
                disabled={isDeletingOrg}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isDeletingOrg || deleteConfirmText !== orgToDelete?.name}
              >
                {isDeletingOrg ? "Deleting..." : "Delete Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
