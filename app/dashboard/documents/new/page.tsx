"use client"

import React, { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isAtLeast } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/client"
import type { DocumentStatus, Organization, Profile, Document } from "@/lib/supabase/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import RichTextEditor from "@/components/rich-text-editor"
import {
  FileText, Upload, Loader2, X, ArrowLeft, Check, Tag,
  Lock, Eye, Shield, Info, PenLine, Globe, Crown, Building2,
  Users, Link2, Search, Plus,
} from "lucide-react"
import Link from "next/link"

type CreateMode = "upload" | "write"

const UPLOAD_EXT = ["pdf", "docx", "txt", "csv", "md", "html", "json", "xlsx", "pptx", "doc", "rtf", "odt"]
const RAG_PARSE_EXT = ["docx", "doc", "txt", "md", "html", "json", "rtf", "odt"]

const STATUS_OPTIONS: { value: DocumentStatus; label: string; color: string; desc: string }[] = [
  { value: "draft", label: "Draft", color: "text-stone-600", desc: "Only you can see this" },
  { value: "under_review", label: "Under Review", color: "text-amber-600", desc: "Select reviewers below" },
  { value: "published", label: "Published", color: "text-emerald-600", desc: "Visible to your org" },
  { value: "archived", label: "Archived", color: "text-muted-foreground", desc: "Hidden from listings" },
]

export default function NewDocumentPage() {
  const { user } = useAuth()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const ragFileRef = useRef<HTMLInputElement>(null)
  const isSubmittingRef = useRef(false)

  const [mode, setMode] = useState<CreateMode>("upload")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const [classification, setClassification] = useState<"general" | "confidential" | "internal" | "public" | "organization">("general")
  const [accessLevel, setAccessLevel] = useState<"view_only" | "comment" | "edit" | "full_access">("view_only")
  const [status, setStatus] = useState<DocumentStatus>("draft")
  const [enablePassword, setEnablePassword] = useState(false)
  const [passwordCode, setPasswordCode] = useState("")

  // Reviewers
  const [orgMembers, setOrgMembers] = useState<Profile[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<Set<string>>(new Set())
  const [reviewerSearch, setReviewerSearch] = useState("")
  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false)

  // Document references
  const [orgDocs, setOrgDocs] = useState<Document[]>([])
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set())
  const [refSearch, setRefSearch] = useState("")
  const [refDialogOpen, setRefDialogOpen] = useState(false)

  // RAG file parsing in write mode
  const [ragParsing, setRagParsing] = useState(false)
  const [ragResult, setRagResult] = useState<string | null>(null)

  const isGod = user?.role === "god"
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [orgMode, setOrgMode] = useState<"select" | "all">("all")
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set())

  // Set role-based defaults
  useEffect(() => {
    if (!user) return
    if (user.role === "god") {
      setClassification("public")
      setAccessLevel("comment")
    } else {
      // admin, super_admin, and user all default to organization
      setClassification("organization")
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const supabase = createClient()

    // Load org members for reviewer selection (only admins and super_admins)
    const loadMembers = async () => {
      if (user.org_id) {
        const { data } = await supabase.from("profiles").select("*").eq("org_id", user.org_id).eq("is_active", true).in("role", ["admin", "super_admin"]).order("full_name") as { data: Profile[] | null }
        setOrgMembers((data || []).filter((m) => m.id !== user.id))
      }
    }

    // Load org docs for referencing
    const loadDocs = async () => {
      let query = supabase.from("documents").select("id, title, ref_number, org_id, is_public, status").order("created_at", { ascending: false }).limit(100)
      if (isGod) {
        query = query.eq("is_public", true)
      } else if (user.org_id) {
        query = query.eq("org_id", user.org_id)
      }
      const { data } = await query as { data: Document[] | null }
      setOrgDocs(data || [])
    }

    // Load orgs for god
    const loadOrgs = async () => {
      if (!isGod) return
      const { data } = await supabase.from("organizations").select("*").order("name") as { data: Organization[] | null }
      setOrgs(data || [])
    }

    loadMembers()
    loadDocs()
    loadOrgs()
  }, [user, isGod])

  const toggleOrgSelection = (orgId: string) => {
    setSelectedOrgIds((prev) => { const next = new Set(prev); if (next.has(orgId)) next.delete(orgId); else next.add(orgId); return next })
  }
  const toggleReviewer = (userId: string) => {
    setSelectedReviewers((prev) => { const next = new Set(prev); if (next.has(userId)) next.delete(userId); else next.add(userId); return next })
  }
  const toggleRef = (docId: string) => {
    setSelectedRefs((prev) => { const next = new Set(prev); if (next.has(docId)) next.delete(docId); else next.add(docId); return next })
  }

  const handleFileDrop = (e: React.DragEvent) => { e.preventDefault(); setDragActive(false); const dropped = e.dataTransfer.files[0]; if (dropped) handleFileSelect(dropped) }
  const handleFileSelect = (f: File) => {
    setFile(f)
    if (!title) { const name = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "); setTitle(name.charAt(0).toUpperCase() + name.slice(1)) }
  }
  const addTag = () => { const tag = tagInput.trim().toLowerCase(); if (tag && !tags.includes(tag)) setTags([...tags, tag]); setTagInput("") }
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))
  const switchMode = (m: CreateMode) => { setMode(m); setFile(null); setContent(""); setRagResult(null) }

  // RAG file parsing for write mode
  const handleRagUpload = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || ""
    if (!RAG_PARSE_EXT.includes(ext)) {
      setRagResult("Unsupported file type. Allowed: " + RAG_PARSE_EXT.map((e) => e.toUpperCase()).join(", "))
      return
    }
    setRagParsing(true)
    setRagResult(null)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await fetch("/api/parse", { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        if (data.content) {
          setContent((prev) => prev ? prev + "\n\n---\n\n" + data.content : data.content)
          setRagResult("Parsed " + f.name + "  " + (data.metadata?.wordCount || 0) + " words extracted and appended to editor.")
        } else {
          setRagResult("File parsed but no text content found.")
        }
      } else {
        const err = await res.json()
        setRagResult("Parse error: " + (err.error || "Unknown error"))
      }
    } catch {
      setRagResult("Failed to connect to parse service.")
    }
    setRagParsing(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingRef.current || saving) return
    if (!user || !title.trim()) return
    if (mode === "upload" && !file) return
    if (mode === "write" && !content.trim()) return
    if (status === "under_review" && selectedReviewers.size === 0) return

    isSubmittingRef.current = true
    setSaving(true)
    const supabase = createClient()
    const ext = file?.name.split(".").pop()?.toLowerCase() || null

    let targetOrgIds: string[] = []
    if (isGod && orgMode === "all") { targetOrgIds = orgs.map((o) => o.id) }
    else if (isGod && orgMode === "select") { targetOrgIds = Array.from(selectedOrgIds) }
    else { targetOrgIds = [user.org_id || ""] }
    if (targetOrgIds.length === 0) { setSaving(false); isSubmittingRef.current = false; return }

    let lastDocId = ""
    let uploadedFileUrl: string | null = null

    for (const orgId of targetOrgIds) {
      const { data, error } = await supabase.from("documents").insert({
        title: title.trim(),
        content: mode === "write" ? content : "",
        description: description.trim() || null,
        file_type: ext || (mode === "write" ? "md" : null),
        file_size: file?.size || content.length || 0,
        owner_id: user.id,
        org_id: orgId,
        is_public: classification === "public",
        tags,
        classification,
        access_level: accessLevel,
        status,
        reviewers: status === "under_review" ? Array.from(selectedReviewers) : [],
        referenced_docs: Array.from(selectedRefs),
        is_password_protected: enablePassword && passwordCode.length === 9,
      } as any).select("id").single()

      if (data && !error) {
        const docId = (data as any).id
        lastDocId = docId
        if (mode === "upload" && file) {
          if (!uploadedFileUrl) {
            // Upload file only once (first org)
            setUploading(true)
            try {
              const fd = new FormData()
              fd.append("file", file)
              fd.append("userId", user.id)
              fd.append("documentId", docId)
              const uploadRes = await fetch("/api/upload-document", { method: "POST", body: fd })
              if (uploadRes.ok) {
                const uploadData = await uploadRes.json()
                uploadedFileUrl = uploadData.url || null
              }
            } catch {}
            setUploading(false)
          } else {
            // Reuse the same file URL for subsequent org copies
            await supabase.from("documents").update({
              file_url: uploadedFileUrl,
              file_size: file.size,
            }).eq("id", docId)
          }
        }
        if (enablePassword && passwordCode.length === 9) {
          try { await fetch("/api/document-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, password: passwordCode, userId: user.id }) }) } catch {}
        }
        await supabase.from("audit_logs").insert({ user_id: user.id, org_id: orgId, action: "create", resource_type: "document", resource_id: docId, details: { title: title.trim(), mode, status, reviewers: Array.from(selectedReviewers), refs: Array.from(selectedRefs) } })
      }
    }
    if (lastDocId) router.push("/dashboard/documents/" + lastDocId)
    setSaving(false)
    isSubmittingRef.current = false
  }

  if (!user) return null
  const canSubmit = title.trim() && (mode === "upload" ? !!file : content.trim().length > 0) && (status !== "under_review" || selectedReviewers.size > 0)
  const filteredMembers = orgMembers.filter((m) => m.full_name.toLowerCase().includes(reviewerSearch.toLowerCase()) || m.email.toLowerCase().includes(reviewerSearch.toLowerCase()))
  const filteredRefDocs = orgDocs.filter((d) => d.title.toLowerCase().includes(refSearch.toLowerCase()))

  return (
    <div className="container mx-auto max-w-6xl py-4 sm:py-8 px-4">
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8"><Link href="/dashboard/documents"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Create Document</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Upload a file or write new content</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8 max-w-md">
        <button type="button" onClick={() => switchMode("upload")} className={"flex items-center gap-2 sm:gap-3 rounded-xl border-2 p-3 sm:p-4 text-left transition-all " + (mode === "upload" ? "border-foreground bg-foreground/[0.03] shadow-sm" : "border-border hover:border-foreground/20 hover:bg-muted/30")}>
          <div className={"h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 " + (mode === "upload" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}><Upload className="h-4 w-4 sm:h-5 sm:w-5" /></div>
          <div className="min-w-0"><p className="text-xs sm:text-sm font-medium">Upload File</p><p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight hidden sm:block">Attach a file directly</p></div>
        </button>
        <button type="button" onClick={() => switchMode("write")} className={"flex items-center gap-2 sm:gap-3 rounded-xl border-2 p-3 sm:p-4 text-left transition-all " + (mode === "write" ? "border-foreground bg-foreground/[0.03] shadow-sm" : "border-border hover:border-foreground/20 hover:bg-muted/30")}>
          <div className={"h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 " + (mode === "write" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}><PenLine className="h-4 w-4 sm:h-5 sm:w-5" /></div>
          <div className="min-w-0"><p className="text-xs sm:text-sm font-medium">Write Content</p><p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight hidden sm:block">Rich editor with Markdown</p></div>
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            <Card><CardContent className="pt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Document title" className="h-11 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium flex items-center gap-1.5">Description <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">Optional</Badge></Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this document" rows={2} className="text-sm resize-none" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Tag className="h-3 w-3" /> Tags</Label>
                <div className="flex gap-2">
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder="Add a tag and press Enter" className="h-9" />
                  <Button type="button" variant="outline" onClick={addTag} size="sm" className="h-9 px-4 shrink-0">Add</Button>
                </div>
                {tags.length > 0 && (<div className="flex flex-wrap gap-1.5 pt-1">{tags.map((tag) => (<Badge key={tag} variant="secondary" className="gap-1 text-xs pl-2.5 pr-1.5">{tag}<button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="h-3 w-3" /></button></Badge>))}</div>)}
              </div>
            </CardContent></Card>

            {mode === "upload" && (
              <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload File</CardTitle><Badge variant="outline" className="text-[10px]">Secure storage</Badge></div></CardHeader>
                <CardContent>
                  <div onDragOver={(e) => { e.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={handleFileDrop} onClick={() => fileRef.current?.click()}
                    className={"relative border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all " + (dragActive ? "border-foreground/30 bg-muted/50" : file ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border hover:border-foreground/20 hover:bg-muted/30")}>
                    <input ref={fileRef} type="file" className="hidden" accept={UPLOAD_EXT.map((e) => "." + e).join(",")} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                    {file ? (
                      <div className="flex items-center justify-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"><FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /></div>
                        <div className="text-left"><p className="font-medium text-sm">{file.name}</p><p className="text-xs text-muted-foreground mt-0.5">{file.size < 1024 * 1024 ? (file.size / 1024).toFixed(1) + " KB" : (file.size / (1024 * 1024)).toFixed(2) + " MB"}<span className="ml-2 text-emerald-600">Ready to upload</span></p></div>
                        <Check className="h-5 w-5 text-emerald-500" />
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 absolute top-2 right-2" onClick={(e) => { e.stopPropagation(); setFile(null) }}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <><div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3"><Upload className="h-6 w-6 text-muted-foreground/50" /></div><p className="font-medium text-sm">Drop your file here or click to browse</p><p className="text-xs text-muted-foreground mt-2">{UPLOAD_EXT.map((e) => e.toUpperCase()).join(", ")}</p><p className="text-[10px] text-muted-foreground mt-1">Max 50MB</p></>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-muted/50 text-[10px] text-muted-foreground"><Info className="h-3 w-3 shrink-0" /><span>Files are uploaded as-is to secure storage. No parsing is performed.</span></div>
                </CardContent>
              </Card>
            )}

            {mode === "write" && (
              <Card className="overflow-hidden">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" /> Content Editor</CardTitle>
                    <div className="flex items-center gap-2">
                      <input ref={ragFileRef} type="file" className="hidden" accept={RAG_PARSE_EXT.map((e) => "." + e).join(",")} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRagUpload(f) }} />
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => ragFileRef.current?.click()} disabled={ragParsing}>
                        {ragParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span className="hidden sm:inline">Import File</span>
                        <span className="sm:hidden">Import</span>
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Import from: {RAG_PARSE_EXT.map((e) => e.toUpperCase()).join(", ")}  no PDFs, CSVs, or images</p>
                </CardHeader>
                <CardContent className="px-0 sm:px-6 pb-0 sm:pb-6">
                  <RichTextEditor value={content} onChange={setContent} placeholder="Start writing... Markdown is fully supported." minHeight="380px" />
                </CardContent>
                {ragResult && (
                  <div className="px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground border">
                      <Info className="h-3 w-3 shrink-0" /><span>{ragResult}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto shrink-0" onClick={() => setRagResult(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Document References */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Link2 className="h-3 w-3" /> Referenced Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <Dialog open={refDialogOpen} onOpenChange={setRefDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs w-full gap-1"><Link2 className="h-3 w-3" /> Link Documents ({selectedRefs.size})</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle className="text-sm">Reference Documents</DialogTitle></DialogHeader>
                    <div className="relative mb-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search documents..." value={refSearch} onChange={(e) => setRefSearch(e.target.value)} className="pl-9 h-8 text-xs" /></div>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-1">
                        {filteredRefDocs.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No documents found</p> : filteredRefDocs.map((d) => (
                          <label key={d.id} className={"flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors " + (selectedRefs.has(d.id) ? "bg-muted" : "hover:bg-muted/50")}>
                            <Checkbox checked={selectedRefs.has(d.id)} onCheckedChange={() => toggleRef(d.id)} className="h-3.5 w-3.5" />
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{d.title}</span>
                            {d.ref_number && <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono shrink-0">DOC-{String(d.ref_number).padStart(5, "0")}</Badge>}
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                {selectedRefs.size > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">{Array.from(selectedRefs).map((id) => { const d = orgDocs.find((doc) => doc.id === id); return d ? <Badge key={id} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1">{d.title.slice(0, 30)}{d.title.length > 30 ? "..." : ""}<button type="button" onClick={() => toggleRef(id)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button></Badge> : null })}</div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" disabled={saving || uploading || !canSubmit} className="h-10 gap-2 sm:flex-1">
                {saving || uploading ? (<><Loader2 className="h-4 w-4 animate-spin" /> {uploading ? "Uploading..." : "Creating..."}</>) : (<><FileText className="h-4 w-4" /> Create Document</>)}
              </Button>
              <Button type="button" variant="outline" asChild className="h-10 sm:flex-1"><Link href="/dashboard/documents">Cancel</Link></Button>
            </div>
            {!canSubmit && title.trim() && status === "under_review" && selectedReviewers.size === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 text-center">Select at least one reviewer.</p>}
            {!canSubmit && title.trim() && status !== "under_review" && <p className="text-xs text-amber-600 dark:text-amber-400 text-center">{mode === "upload" ? "Attach a file to create." : "Write some content to create."}</p>}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {isGod && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-amber-500" /> Target Organizations</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="space-y-1.5">
                    {([{ value: "select" as const, label: "Select Orgs", desc: "Choose specific", icon: Shield }, { value: "all" as const, label: "All Orgs", desc: "Post everywhere", icon: Globe }]).map((opt) => (
                      <button key={opt.value} type="button" onClick={() => { setOrgMode(opt.value); if (opt.value !== "select") setSelectedOrgIds(new Set()) }}
                        className={"w-full flex items-center gap-2 rounded-lg border p-2 text-left transition-all text-xs " + (orgMode === opt.value ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700" : "border-border hover:border-amber-200 dark:hover:border-amber-800")}>
                        <opt.icon className={"h-3 w-3 shrink-0 " + (orgMode === opt.value ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
                        <div><p className="font-medium">{opt.label}</p><p className="text-[10px] text-muted-foreground">{opt.desc}</p></div>
                      </button>
                    ))}
                  </div>
                  {orgMode === "select" && (
                    <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-1.5">
                      {orgs.length === 0 ? <p className="text-[10px] text-muted-foreground text-center py-2">No orgs found</p> : orgs.map((org) => (
                        <label key={org.id} className={"flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer transition-colors " + (selectedOrgIds.has(org.id) ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-muted/50")}>
                          <Checkbox checked={selectedOrgIds.has(org.id)} onCheckedChange={() => toggleOrgSelection(org.id)} className="h-3.5 w-3.5" /><span className="truncate">{org.name}</span>
                        </label>
                      ))}
                      {selectedOrgIds.size > 0 && <p className="text-[10px] text-amber-600 dark:text-amber-400 pt-1 border-t">{selectedOrgIds.size} selected</p>}
                    </div>
                  )}
                  {orgMode === "all" && <p className="text-[10px] text-amber-600 dark:text-amber-400 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">Will post to all {orgs.length} organizations</p>}
                </CardContent>
              </Card>
            )}

            {/* Status */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={status} onValueChange={(v) => { setStatus(v as DocumentStatus); if (v !== "under_review") setSelectedReviewers(new Set()) }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (<SelectItem key={s.value} value={s.value}><span className={s.color}>{s.label}</span></SelectItem>))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">{STATUS_OPTIONS.find((s) => s.value === status)?.desc}</p>
                {status === "under_review" && (
                  <div className="space-y-2 border rounded-lg p-2.5">
                    <p className="text-xs font-medium flex items-center gap-1"><Users className="h-3 w-3" /> Reviewers</p>
                    {selectedReviewers.size === 0 && <p className="text-[10px] text-muted-foreground">No reviewers selected. Add at least one.</p>}
                    <div className="flex flex-wrap gap-1">
                      {orgMembers.filter((m) => selectedReviewers.has(m.id)).map((m) => (
                        <Badge key={m.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                          {m.full_name || m.email}
                          <button type="button" onClick={() => { const s = new Set(selectedReviewers); s.delete(m.id); setSelectedReviewers(s) }} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      ))}
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="w-full h-7 text-[10px]"><Plus className="h-3 w-3 mr-1" /> Add Reviewers</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader><DialogTitle className="text-sm">Select Reviewers</DialogTitle><DialogDescription className="text-xs">Choose admins or super admins to review this document.</DialogDescription></DialogHeader>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {orgMembers.filter((m) => m.id !== user?.id).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No other members found</p> : orgMembers.filter((m) => m.id !== user?.id).map((m) => (
                            <label key={m.id} className={"flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors " + (selectedReviewers.has(m.id) ? "bg-primary/5" : "hover:bg-muted/50")}>
                              <Checkbox checked={selectedReviewers.has(m.id)} onCheckedChange={() => { const s = new Set(selectedReviewers); s.has(m.id) ? s.delete(m.id) : s.add(m.id); setSelectedReviewers(s) }} className="h-3.5 w-3.5" />
                              <div><p className="font-medium">{m.full_name || "Unnamed"}</p><p className="text-[10px] text-muted-foreground">{m.email} &middot; {m.role}</p></div>
                            </label>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Classification</Label>
                  <Select value={classification} onValueChange={(v) => setClassification(v as typeof classification)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organization">Organization</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="confidential">Confidential</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                  {classification === "organization" && <p className="text-[10px] text-muted-foreground">Only visible to organization members</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Access Level</Label>
                  <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as typeof accessLevel)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["view_only","comment","edit","full_access"] as const).map((a) => (<SelectItem key={a} value={a}>{a.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Password Lock</Label>
                  <Switch checked={enablePassword} onCheckedChange={setEnablePassword} />
                </div>
                {enablePassword && <Input type="password" value={passwordCode} onChange={(e) => setPasswordCode(e.target.value)} placeholder="Set password..." className="h-8 text-xs" />}
              </CardContent>
            </Card>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Summary</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <Row label="Mode" value={mode === "upload" ? "Upload" : "Write"} />
                <Row label="Status" value={STATUS_OPTIONS.find((s) => s.value === status)?.label || status} />
                {status === "under_review" && <Row label="Reviewers" value={String(selectedReviewers.size)} />}
                <Row label="Security" value={classification} />
                <Row label="Access" value={accessLevel.replace(/_/g, " ")} />
                {selectedRefs.size > 0 && <Row label="References" value={String(selectedRefs.size)} />}
                {tags.length > 0 && <Row label="Tags" value={String(tags.length)} />}
                {isGod && <Row label="Orgs" value={orgMode === "all" ? "All" : String(selectedOrgIds.size)} />}
                {enablePassword && <Row label="Password" value="Enabled" />}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  )
}
