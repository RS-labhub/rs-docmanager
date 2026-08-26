"use client"

import React, { useState, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { getRoleInfo } from "@/lib/permissions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { Mail, Save, Loader2, Key, Check, LogOut, ArrowRight, Phone, Building2, FileText, User, Camera, Upload } from "lucide-react"
import Link from "next/link"
import { joinOrganization } from "@/app/actions/admin"

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const avatarRef = useRef<HTMLInputElement>(null)
  const [fullName, setFullName] = useState(user?.full_name || "")
  const [phone, setPhone] = useState("")
  const [department, setDepartment] = useState("")
  const [bio, setBio] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "")
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [orgCode, setOrgCode] = useState("")
  const [joiningOrg, setJoiningOrg] = useState(false)
  const [joinMessage, setJoinMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!user) return
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("userId", user.id)
      const res = await fetch("/api/avatar", { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        setAvatarUrl(data.url)
      }
    } catch { /* silent */ }
    setUploadingAvatar(false)
  }

  const handleJoinOrg = async () => {
    if (!user || !orgCode.trim()) return
    setJoiningOrg(true)
    setJoinMessage(null)
    const result = await joinOrganization(orgCode.trim())
    if (result.success) {
      setJoinMessage({ type: "success", text: `Request to join ${result.orgName} submitted! A Super Admin must approve your membership.` })
      setOrgCode("")
    } else {
      setJoinMessage({ type: "error", text: result.error || "Failed to join organization." })
    }
    setJoiningOrg(false)
  }

  if (!user) return null
  const roleInfo = getRoleInfo(user.role)

  return (
    <div className={`container mx-auto py-8 px-4 ${!user.org_id ? "max-w-5xl" : "max-w-3xl"}`}>
      <div className="mb-8">
        <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Account</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and preferences</p>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${!user.org_id ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {/* Left: Avatar & Identity */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              {/* Avatar */}
              <div className="relative group mb-4">
                <div className="h-24 w-24 rounded-full bg-foreground text-background flex items-center justify-center text-3xl font-semibold overflow-hidden ring-2 ring-border">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    user.full_name.charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
                <input ref={avatarRef} type="file" className="hidden" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }} />
              </div>
              <p className="font-semibold text-lg">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <Badge className={`${roleInfo.bgClass} text-xs mt-2`}>{roleInfo.label}</Badge>
              <p className="text-[10px] text-muted-foreground mt-2">Click avatar to change photo</p>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card className="group hover:border-foreground/20 transition-colors">
            <Link href="/dashboard/settings/ai-keys">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Key className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">AI API Keys</p>
                    <p className="text-[10px] text-muted-foreground">Manage encrypted keys</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </CardContent>
            </Link>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/20">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1"><LogOut className="h-3 w-3" /> Sign Out</p>
              <p className="text-[10px] text-muted-foreground mb-3">You can always sign back in.</p>
              <Button variant="destructive" onClick={logout} size="sm" className="h-8 w-full gap-1.5 text-xs">
                <LogOut className="h-3 w-3" /> Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm flex items-center gap-1.5"><User className="h-3 w-3" /> Full Name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm flex items-center gap-1.5"><Phone className="h-3 w-3" /> Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department" className="text-sm flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Department</Label>
                  <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5"><Mail className="h-3 w-3" /> Email</Label>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border bg-muted/20">
                    <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-sm flex items-center gap-1.5"><FileText className="h-3 w-3" /> Bio</Label>
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us a bit about yourself..." rows={3} className="resize-none text-sm" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Only name is saved to database currently</p>
                <Button onClick={handleSave} disabled={saving} size="sm" className="h-9 gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {saved ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Third Column: Join Organization — only shown when user has no org */}
        {!user.org_id && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Join Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter the alphanumeric code provided by your organization to request membership. A Super Admin must approve your request.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="orgCode" className="text-xs">Organization Code</Label>
                    <Input
                      id="orgCode"
                      value={orgCode}
                      onChange={(e) => setOrgCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      placeholder="e.g. ACME2026"
                      maxLength={16}
                      className="h-10 font-mono tracking-wider uppercase"
                    />
                  </div>
                  {joinMessage && (
                    <div className={`p-3 rounded-lg text-xs leading-relaxed ${
                      joinMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {joinMessage.text}
                    </div>
                  )}
                  <Button
                    onClick={handleJoinOrg}
                    disabled={joiningOrg || orgCode.trim().length < 4}
                    className="w-full h-10 gap-2"
                  >
                    {joiningOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {joiningOrg ? "Submitting..." : "Request to Join"}
                  </Button>
                </div>
                <Separator />
                <div className="text-[11px] text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground text-xs">How it works</p>
                  <p>1. Get the org code from your organization admin</p>
                  <p>2. Enter the code above and submit your request</p>
                  <p>3. A Super Admin will review and approve your membership</p>
                  <p>4. Once approved, you&apos;ll have access to all org resources</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
