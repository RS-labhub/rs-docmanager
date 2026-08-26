"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { isAtLeast, getRoleInfo } from "@/lib/permissions"
import { useToast } from "@/hooks/use-toast"
import {
  FileText,
  Users,
  Building2,
  Shield,
  Key,
  Activity,
  Plus,
  ArrowRight,
  Clock,
  Zap,
  TrendingUp,
  Copy
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface DashboardStats {
  totalDocuments: number
  totalUsers: number
  totalOrganizations: number
  totalAiKeys: number
  recentDocuments: Array<{
    id: string
    title: string
    created_at: string
    classification: string | null
  }>
  recentLogs: Array<{
    id: string
    action: string
    resource_type: string
    created_at: string
  }>
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [orgCode, setOrgCode] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const loadStats = async () => {
      const supabase = createClient()
      const isGodOrSuper = isAtLeast(user.role, "super_admin")
      const isAdminPlus = isAtLeast(user.role, "admin")
      const isGod = user.role === "god"

      if (user.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, org_code")
          .eq("id", user.org_id)
          .single() as { data: { name: string; org_code: string } | null }
        if (org) {
          setOrgName(org.name)
          setOrgCode(org.org_code)
        }
      }

      let docQuery = supabase.from("documents").select("id, title, created_at, classification", { count: "exact" })
      if (!isGod && user.org_id) {
        docQuery = docQuery.eq("org_id", user.org_id)
      }
      if (!isAdminPlus) {
        docQuery = docQuery.eq("owner_id", user.id)
      }
      const { count: docCount, data: recentDocs } = await docQuery
        .order("created_at", { ascending: false })
        .limit(5)

      let userCount = 0
      if (isAdminPlus) {
        let userQuery = supabase.from("profiles").select("id", { count: "exact" })
        if (!isGod && user.org_id) {
          userQuery = userQuery.eq("org_id", user.org_id)
        }
        const { count } = await userQuery
        userCount = count || 0
      }

      let orgCount = 0
      if (isGod) {
        const { count } = await supabase.from("organizations").select("id", { count: "exact" })
        orgCount = count || 0
      }

      const { count: keyCount } = await supabase
        .from("ai_api_keys")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("is_active", true)

      let logQuery = supabase.from("audit_logs").select("id, action, resource_type, created_at")
      if (!isGod && user.org_id) {
        logQuery = logQuery.eq("org_id", user.org_id)
      }
      if (!isAdminPlus) {
        logQuery = logQuery.eq("user_id", user.id)
      }
      const { data: recentLogs } = await logQuery
        .order("created_at", { ascending: false })
        .limit(5)

      setStats({
        totalDocuments: docCount || 0,
        totalUsers: userCount,
        totalOrganizations: orgCount,
        totalAiKeys: keyCount || 0,
        recentDocuments: recentDocs || [],
        recentLogs: recentLogs || [],
      })
      setLoading(false)
    }
    loadStats()
  }, [user])

  if (!user) return null

  const roleInfo = getRoleInfo(user.role)
  const isAdminPlus = isAtLeast(user.role, "admin")
  const isGod = user.role === "god"

  const statCards = [
    {
      id: "documents",
      title: "Documents",
      value: stats?.totalDocuments ?? 0,
      icon: FileText,
      href: "/dashboard/documents",
      show: true,
      onClick: undefined,
    },
    {
      id: "users",
      title: "Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      href: "/dashboard/users",
      show: isAdminPlus,
      onClick: undefined,
    },
    {
      id: "organizations",
      title: "Organizations",
      value: stats?.totalOrganizations ?? 0,
      icon: Building2,
      href: "/god",
      show: isGod, // Only God sees Org count
      onClick: undefined,
    },
    {
      id: "org-code",
      title: "Organization Code",
      value: orgCode || "None",
      icon: Copy,
      href: "#",
      show: isAdminPlus && !isGod && !!orgCode, // Admins/Super-admins see their Org Code
      onClick: (e: React.MouseEvent) => {
        e.preventDefault()
        if (orgCode) {
          navigator.clipboard.writeText(orgCode)
          toast({ title: "Copied!", description: "Organization code copied to clipboard (Users can join using this code)" })
        }
      }
    },
    {
      id: "ai-keys",
      title: "Active AI Keys",
      value: stats?.totalAiKeys ?? 0,
      icon: Key,
      href: "/dashboard/settings/ai-keys",
      show: true,
      onClick: undefined,
    },
  ].filter((c) => c.show)

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {user.full_name?.split(" ")[0] || "User"}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge className={`${roleInfo.bgClass} text-xs`}>{roleInfo.label}</Badge>
            {orgName && (
              <span className="text-sm text-muted-foreground flex items-center gap-1 ml-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                {orgName}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" className="h-9 gap-1.5">
            <Link href="/dashboard/documents/new">
              <Plus className="h-3.5 w-3.5" /> New Document
            </Link>
          </Button>
          {isAdminPlus && (
            <Button variant="outline" asChild size="sm" className="h-9 gap-1.5">
              <Link href="/dashboard/users">
                <Users className="h-3.5 w-3.5" /> Manage Users
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Join Organization Banner — only when user has no org and is not admin+ */}
      {!user.org_id && !isAdminPlus && (
        <Card className="border-dashed animate-fade-in-up">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">You&apos;re not part of an organization yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Join an organization with an org code to collaborate with your team.</p>
              </div>
            </div>
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs shrink-0">
              <Link href="/dashboard/settings">
                <Building2 className="h-3 w-3" /> Join Organization
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const CardContentInner = (
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{card.title}</p>
                    {loading ? (
                      <Skeleton className="h-8 w-12 mt-1 rounded" />
                    ) : card.id === 'org-code' ? (
                      <div className="mt-1 flex items-center">
                        <code className="text-xl font-mono font-semibold bg-muted px-2 py-0.5 rounded-md border border-border">
                          {card.value}
                        </code>
                      </div>
                    ) : (
                      <p className="text-3xl font-semibold mt-0.5 tracking-tight">
                        {card.value}
                      </p>
                    )}
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <card.icon className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )

          if (card.onClick) {
            return (
              <div key={card.id} onClick={card.onClick} role="button" tabIndex={0}>
                {CardContentInner}
              </div>
            )
          }

          return (
            <Link key={card.id} href={card.href}>
              {CardContentInner}
            </Link>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Documents */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">Recent Documents</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground h-8">
              <Link href="/dashboard/documents">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : stats?.recentDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No documents yet</p>
                <p className="text-xs mt-1">Create your first document to get started</p>
                <Button asChild size="sm" className="mt-4 h-8">
                  <Link href="/dashboard/documents/new">
                    <Plus className="mr-1 h-3 w-3" /> Create Document
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {stats?.recentDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/dashboard/documents/${doc.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.classification && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                          {doc.classification}
                        </Badge>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" /> Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Button variant="outline" className="w-full justify-start h-9 text-sm" asChild>
                <Link href="/dashboard/documents/new">
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Document
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 text-sm" asChild>
                <Link href="/dashboard/settings/ai-keys">
                  <Key className="mr-2 h-3.5 w-3.5" /> Manage AI Keys
                </Link>
              </Button>
              {isAdminPlus && (
                <Button variant="outline" className="w-full justify-start h-9 text-sm" asChild>
                  <Link href="/dashboard/users">
                    <Shield className="mr-2 h-3.5 w-3.5" /> User Management
                  </Link>
                </Button>
              )}
              {isGod && (
                <Button variant="outline" className="w-full justify-start h-9 text-sm" asChild>
                  <Link href="/god">
                    <Building2 className="mr-2 h-3.5 w-3.5" /> God Panel
                  </Link>
                </Button>
              )}
              {!user.org_id && !isAdminPlus && (
                <Button variant="outline" className="w-full justify-start h-9 text-sm" asChild>
                  <Link href="/dashboard/settings">
                    <Building2 className="mr-2 h-3.5 w-3.5" /> Join Organization
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : stats?.recentLogs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="h-6 w-6 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {stats?.recentLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs">
                          <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>{" "}
                          <span className="text-muted-foreground">{log.resource_type}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
