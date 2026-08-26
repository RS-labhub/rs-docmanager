"use client"

import React, { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { isAtLeast } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/client"
import { getDocument } from "@/app/actions/documents"
import type { Document, DocumentComment } from "@/lib/supabase/types"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  FileText,
  Clock,
  Save,
  Loader2,
  Trash2,
  Wand2,
  Pencil,
  X,
  MessageSquare,
  Lock,
  Unlock,
  Shield,
  Send,
  Search,
  BookOpen,
  Lightbulb,
  Languages,
  Key,
  HelpCircle,
  Tag,
  Eye,
  User,
  Download,
  GitBranch,
  Info,
} from "lucide-react"

type AiActionType =
  | "summarize"
  | "analyze"
  | "improve"
  | "generate"
  | "extract_keywords"
  | "translate"
  | "qa"

interface CommentWithUser extends DocumentComment {
  user_name?: string
  user_avatar?: string
}

const AI_ACTIONS: {
  value: AiActionType
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  { value: "summarize", label: "Summarize", icon: <BookOpen className="h-4 w-4" />, description: "Generate a concise summary" },
  { value: "analyze", label: "Analyze", icon: <Search className="h-4 w-4" />, description: "Deep analysis of content" },
  { value: "improve", label: "Improve Writing", icon: <Pencil className="h-4 w-4" />, description: "Enhance clarity and style" },
  { value: "generate", label: "Generate Insights", icon: <Lightbulb className="h-4 w-4" />, description: "Extract key insights" },
  { value: "extract_keywords", label: "Extract Keywords", icon: <Tag className="h-4 w-4" />, description: "Identify important terms" },
  { value: "translate", label: "Translate", icon: <Languages className="h-4 w-4" />, description: "Translate to another language" },
  { value: "qa", label: "Q&A", icon: <HelpCircle className="h-4 w-4" />, description: "Ask questions about content" },
]

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()

  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [editing, setEditing] = useState(false)

  const [aiAction, setAiAction] = useState<AiActionType>("summarize")
  const [aiResult, setAiResult] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [qaQuestion, setQaQuestion] = useState("")

  const [comments, setComments] = useState<CommentWithUser[]>([])
  const [newComment, setNewComment] = useState("")
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [postingComment, setPostingComment] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordCode, setPasswordCode] = useState("")
  const [passwordAction, setPasswordAction] = useState<"set" | "verify" | "remove">("set")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [reParsing, setReParsing] = useState(false)

  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      // Server action so password-protected content is redacted until unlocked.
      const data = await getDocument(id)
      if (data) {
        setDoc(data)
        setEditedContent(data.content)
        if (data.owner_id === user?.id) setIsUnlocked(true)
      }
      setLoading(false)
    }
    load()
  }, [id, user?.id])

  useEffect(() => {
    if (!commentsOpen || !id) return
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsOpen, id])

  const loadComments = async () => {
    setCommentsLoading(true)
    try {
      const res = await fetch(`/api/document-comments?documentId=${id}`)
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
      }
    } catch { /* silent */ }
    setCommentsLoading(false)
  }

  const postComment = async () => {
    if (!newComment.trim() || !user || !id) return
    setPostingComment(true)
    try {
      const res = await fetch("/api/document-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id, content: newComment.trim() }),
      })
      if (res.ok) {
        setNewComment("")
        await loadComments()
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
      }
    } catch { /* silent */ }
    setPostingComment(false)
  }

  const deleteComment = async (commentId: string) => {
    if (!user) return
    try {
      await fetch(`/api/document-comments?commentId=${commentId}`, { method: "DELETE" })
      await loadComments()
    } catch { /* silent */ }
  }

  const handleSave = async () => {
    if (!doc) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from("documents").update({ content: editedContent }).eq("id", doc.id)
    setDoc({ ...doc, content: editedContent })
    setEditing(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!doc || !user || !confirm("Are you sure you want to delete this document?")) return
    try {
      const res = await fetch("/api/delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Failed to delete document")
        return
      }
      router.push("/dashboard/documents")
    } catch {
      alert("Failed to delete document. Please try again.")
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!doc || !user) return
    const supabase = createClient()
    const status = newStatus as Document["status"]
    await supabase.from("documents").update({ status }).eq("id", doc.id)
    // God propagates status to distributed copies: same title, owner, and content.
    if (user.role === "god") {
      await supabase
        .from("documents")
        .update({ status })
        .eq("title", doc.title)
        .eq("owner_id", doc.owner_id)
        .eq("content", doc.content)
    }
    setDoc({ ...doc, status })
  }

  const handleAiAction = async () => {
    if (!doc || !user) return
    setAiLoading(true)
    setAiResult("")
    try {
      const body: Record<string, string> = {
        action: aiAction, content: doc.content, title: doc.title,
      }
      if (aiAction === "qa" && qaQuestion.trim()) body.question = qaQuestion.trim()
      const res = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult(data.result || data.error || "No result")
      } else {
        const err = await res.json()
        setAiResult(`Error: ${err.error || "AI action failed"}`)
      }
    } catch {
      setAiResult("Error: Failed to connect to AI service")
    }
    setAiLoading(false)
  }

  const handlePasswordAction = async () => {
    if (passwordCode.length !== 9 || !/^\d{9}$/.test(passwordCode)) {
      setPasswordError("Password must be exactly 9 digits")
      return
    }
    setPasswordLoading(true)
    setPasswordError("")
    try {
      if (passwordAction === "set") {
        const res = await fetch("/api/document-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc!.id, password: passwordCode }),
        })
        if (res.ok) {
          setDoc({ ...doc!, is_password_protected: true })
          setPasswordDialogOpen(false)
          setPasswordCode("")
        } else {
          const err = await res.json()
          setPasswordError(err.error || "Failed to set password")
        }
      } else if (passwordAction === "verify") {
        const res = await fetch("/api/document-password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc!.id, password: passwordCode }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.valid) {
            // The unlock cookie is now set; re-fetch to get unredacted content.
            const fresh = await getDocument(doc!.id)
            if (fresh) {
              setDoc(fresh)
              setEditedContent(fresh.content)
            }
            setIsUnlocked(true)
            setPasswordDialogOpen(false)
            setPasswordCode("")
          } else { setPasswordError("Incorrect password") }
        }
      } else if (passwordAction === "remove") {
        const res = await fetch(`/api/document-password?documentId=${doc!.id}`, {
          method: "DELETE",
        })
        if (res.ok) {
          setDoc({ ...doc!, is_password_protected: false })
          setPasswordDialogOpen(false)
          setPasswordCode("")
        } else {
          const err = await res.json()
          setPasswordError(err.error || "Failed to remove password")
        }
      }
    } catch { setPasswordError("Network error") }
    setPasswordLoading(false)
  }

  if (!user) return null

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-10 px-4 space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="container mx-auto max-w-3xl py-16 px-4 text-center">
        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
          <FileText className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <h2 className="text-lg font-semibold">Document not found</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          This document may have been deleted or you don&apos;t have access.
        </p>
        <Button variant="outline" asChild size="sm" className="h-9">
          <Link href="/dashboard/documents">Back to Documents</Link>
        </Button>
      </div>
    )
  }

  const isOwner = doc.owner_id === user.id
  const isGodUser = user.role === "god"
  const canEdit = isOwner || isGodUser || (isAtLeast(user.role, "admin") && !["view_only", "comment"].includes(doc.access_level))
  const isLocked = doc.is_password_protected && !isUnlocked && !isOwner && !isGodUser
  const canComment = (doc.access_level || "view_only") !== "view_only" || isOwner || isGodUser

  if (isLocked) {
    return (
      <div className="container mx-auto max-w-md py-20 px-4">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Lock className="h-9 w-9 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">This document is password protected. Enter the 9-digit code to view.</p>
          </div>
          <Card className="text-left">
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Access Code</label>
                <Input type="password" placeholder="Enter 9-digit code" maxLength={9} value={passwordCode}
                  onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 9); setPasswordCode(val); setPasswordError("") }}
                  className="text-center tracking-[0.5em] font-mono text-lg h-12" />
                <p className="text-xs text-muted-foreground mt-1.5">{passwordCode.length}/9 digits</p>
                {passwordError && <p className="text-xs text-destructive mt-1">{passwordError}</p>}
              </div>
              <Button className="w-full h-10" disabled={passwordCode.length !== 9 || passwordLoading}
                onClick={async () => {
                  setPasswordLoading(true); setPasswordError("")
                  try {
                    const res = await fetch("/api/document-password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: doc.id, password: passwordCode }) })
                    if (res.ok) { const data = await res.json(); if (data.valid) { setIsUnlocked(true); setPasswordCode("") } else { setPasswordError("Incorrect code. Try again.") } }
                  } catch { setPasswordError("Network error") }
                  setPasswordLoading(false)
                }}>
                {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                Unlock Document
              </Button>
            </CardContent>
          </Card>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/documents"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to Documents</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 mt-0.5 flex-shrink-0">
            <Link href="/dashboard/documents"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight truncate">{doc.title}</h1>
              {doc.ref_number && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 flex-shrink-0">
                  DOC-{String(doc.ref_number).padStart(5, "0")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(doc.created_at).toLocaleDateString()}</span>
              {doc.file_type && <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">{doc.file_type.toUpperCase()}</Badge>}
              {doc.is_password_protected && <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5"><Lock className="h-2.5 w-2.5" /> Protected</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canComment && (
          <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Comments</span>
                {comments.length > 0 && <span className="bg-foreground text-background rounded-full text-[10px] h-4 min-w-[16px] flex items-center justify-center px-1">{comments.length}</span>}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md flex flex-col">
              <SheetHeader><SheetTitle className="text-base">Comments</SheetTitle></SheetHeader>
              <Separator className="my-3" />
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                {commentsLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-12 w-full" /></div>))}</div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Be the first to comment</p>
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="group rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center"><User className="h-3 w-3 text-muted-foreground" /></div>
                          <span className="text-xs font-medium">{comment.user_name || "User"}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                        </div>
                        {(comment.user_id === user.id || isAtLeast(user.role, "admin")) && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteComment(comment.id)}>
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed">{comment.content}</p>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>
              <div className="border-t pt-3 mt-auto">
                <div className="flex gap-2">
                  <Textarea placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} className="resize-none text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment() }} />
                  <Button size="icon" className="h-auto self-end" disabled={!newComment.trim() || postingComment} onClick={postComment}>
                    {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Press Ctrl+Enter to send</p>
              </div>
            </SheetContent>
          </Sheet>
          )}

          {canEdit && !doc.file_url && (
            <>
              {editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setEditing(false); setEditedContent(doc.content) }} className="h-8 gap-1 text-xs">
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 gap-1 text-xs">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-8 gap-1 text-xs">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleDelete} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </>
          )}
          
          {/* Delete button for uploaded documents (no edit) */}
          {canEdit && doc.file_url && (
            <Button variant="ghost" size="icon" onClick={handleDelete} className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Content</CardTitle>
                <div className="flex items-center gap-2">
                  {doc.file_type && <Badge variant="outline" className="text-[10px]">{doc.file_type.toUpperCase()} Document</Badge>}
                  {doc.file_url && (
                    <Button variant="outline" size="sm" asChild className="h-6 gap-1 text-[10px] px-2">
                      <a href={`/api/document-file?documentId=${doc.id}`} target="_blank" rel="noopener noreferrer" download>
                        <Download className="h-3 w-3" /> Download
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} rows={20} className="font-mono text-sm resize-none" />
              ) : doc.file_type === "pdf" && doc.file_url ? (
                <div className="space-y-3">
                  <div className="w-full h-[70vh] border border-border rounded-lg overflow-hidden bg-muted/20">
                    <iframe
                      src={`/api/document-file?documentId=${doc.id}`}
                      className="w-full h-full"
                      title="PDF Preview"
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground border border-border">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>Viewing PDF document. If it doesn&apos;t load, use the Download button above.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {(doc.file_type === "docx" || doc.file_type === "doc") && doc.file_url && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                      <Info className="h-4 w-4 shrink-0" />
                      <span>Word document — showing extracted text content. Download the original for full formatting.</span>
                    </div>
                  )}
                  {doc.file_type === "md" && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 text-[11px] text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>Markdown document — rendered preview below</span>
                    </div>
                  )}
                  {doc.file_type === "txt" && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 text-[11px] text-muted-foreground border border-border">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>Plain text document</span>
                    </div>
                  )}
                  {doc.content ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none max-h-[60vh] overflow-auto rounded-lg p-4 bg-muted/30 border border-border leading-relaxed prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-sm prose-p:leading-relaxed prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-a:text-primary prose-a:underline prose-img:rounded-lg prose-table:border prose-th:border prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:px-3 prose-td:py-1.5">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{
                          code({ node, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "")
                            const isInline = !match && !className
                            if (isInline) {
                              return <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                            }
                            return (
                              <pre className="bg-muted/50 border rounded-lg p-4 overflow-x-auto">
                                <code className={`text-xs font-mono ${className || ""}`} {...props}>{children}</code>
                              </pre>
                            )
                          },
                          table({ children }: any) {
                            return <div className="overflow-x-auto my-4 border rounded-lg"><table className="w-full text-sm border-collapse">{children}</table></div>
                          },
                          th({ children, ...props }: any) {
                            return <th className="border-b bg-muted/50 px-4 py-2 text-left font-medium" {...props}>{children}</th>
                          },
                          td({ children, ...props }: any) {
                            return <td className="border-b px-4 py-2" {...props}>{children}</td>
                          },
                          p({ children, ...props }: any) {
                            return <p className="whitespace-pre-wrap !mt-1 !mb-4 !leading-normal" {...props}>{children}</p>
                          },
                          blockquote({ children, ...props }: any) {
                            return <blockquote className="border-l-4 border-primary pl-4 italic my-4 bg-muted/30 py-1 pr-2" {...props}>{children}</blockquote>
                          },
                          h1({ children, ...props }: any) {
                            return <h1 className="!text-3xl !font-bold !mt-6 !mb-3 !pb-0 !leading-tight" {...props}>{children}</h1>
                          },
                          h2({ children, ...props }: any) {
                            return <h2 className="!text-2xl !font-bold !mt-5 !mb-3 !pb-0 !leading-tight" {...props}>{children}</h2>
                          },
                          h3({ children, ...props }: any) {
                            return <h3 className="!text-xl !font-semibold !mt-4 !mb-2 !pb-0 !leading-tight" {...props}>{children}</h3>
                          },
                          h4({ children, ...props }: any) {
                            return <h4 className="!text-lg !font-semibold !mt-3 !mb-2 !pb-0 !leading-tight" {...props}>{children}</h4>
                          },
                          ul({ children, ...props }: any) {
                            return <ul className="list-disc pl-6 !my-2 space-y-1" {...props}>{children}</ul>
                          },
                          ol({ children, ...props }: any) {
                            return <ol className="list-decimal pl-6 !my-2 space-y-1" {...props}>{children}</ol>
                          },
                          li({ children, ...props }: any) {
                            return <li className="!my-1" {...props}>{children}</li>
                          },
                          a({ children, href, ...props }: any) {
                            if (href) {
                              const isYoutube = href.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)
                              const isLoom = href.match(/loom\.com\/share\/([a-f0-9]+)/)

                              const displayText = Array.isArray(children) ? children[0] : children
                              const isIntentionalEmbed = displayText === "embed" || displayText === href || href.startsWith(String(displayText))

                              if (isIntentionalEmbed && isYoutube) {
                                return (
                                  <span className="block my-4 overflow-hidden rounded-xl border border-border aspect-video w-full max-w-3xl shadow-sm bg-muted/30">
                                    <iframe className="w-full h-full block" src={`https://www.youtube.com/embed/${isYoutube[1]}`} allowFullScreen frameBorder="0"></iframe>
                                  </span>
                                )
                              }
                              if (isIntentionalEmbed && isLoom) {
                                return (
                                  <span className="block my-4 overflow-hidden rounded-xl border border-border aspect-video w-full max-w-3xl shadow-sm bg-muted/30">
                                    <iframe className="w-full h-full block" src={`https://www.loom.com/embed/${isLoom[1]}`} allowFullScreen frameBorder="0"></iframe>
                                  </span>
                                )
                              }
                            }
                            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline hover:text-blue-800" {...props}>{children === "embed" ? href : children}</a>
                          },
                        }}
                      >
                        {doc.content}
                      </ReactMarkdown>
                    </div>
                  ) : doc.file_url ? (
                    <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-dashed border-border bg-muted/20">
                      <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No text content extracted yet</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm text-center">
                        This file was uploaded before content extraction was enabled. Click below to extract text content, or download the original file.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={reParsing}
                          onClick={async () => {
                            setReParsing(true)
                            try {
                              const res = await fetch("/api/reparse-document", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ documentId: doc.id }),
                              })
                              if (res.ok) {
                                const data = await res.json()
                                if (data.content) {
                                  setDoc({ ...doc, content: data.content })
                                  setEditedContent(data.content)
                                }
                              } else {
                                const err = await res.json()
                                alert(err.error || "Failed to extract content")
                              }
                            } catch {
                              alert("Failed to extract content. Please try again.")
                            }
                            setReParsing(false)
                          }}
                        >
                          {reParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          {reParsing ? "Extracting..." : "Extract Content"}
                        </Button>
                        <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
                          <a href={`/api/document-file?documentId=${doc.id}`} target="_blank" rel="noopener noreferrer" download>
                            <Download className="h-3.5 w-3.5" /> Download Original
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg p-4 bg-muted/30 border border-border">
                      <span className="text-muted-foreground italic not-prose">No content</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!(doc.file_type === "pdf" && doc.file_url) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Document Tools</CardTitle>
                  <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400">Free &mdash; No API Key</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">These tools run locally and don&apos;t require any API key configuration.</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { if (doc.content) { const words = doc.content.trim().split(/\s+/).length; const chars = doc.content.length; const sentences = doc.content.split(/[.!?]+/).filter(Boolean).length; setAiResult(`📊 Document Statistics\n\nWords: ${words.toLocaleString()}\nCharacters: ${chars.toLocaleString()}\nSentences: ${sentences.toLocaleString()}\nParagraphs: ${doc.content.split(/\n\n+/).filter(Boolean).length}\nAvg words/sentence: ${(words / Math.max(sentences, 1)).toFixed(1)}`) } }}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-all hover:bg-muted/50 hover:border-foreground/20">
                    <div className="rounded-md p-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"><Search className="h-4 w-4" /></div>
                    <span className="text-[11px] font-medium">Word Count</span>
                  </button>
                  <button onClick={() => { if (doc.content) { const lines = doc.content.split('\n'); const headings = lines.filter(l => l.startsWith('#') || l.match(/^[A-Z][A-Z\s]{2,}$/)); const keyPhrases = doc.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || []; setAiResult(`🔍 Content Analysis (Local)\n\nHeadings found: ${headings.length}\n${headings.slice(0, 10).map(h => `  • ${h.replace(/^#+\s*/, '')}`).join('\n')}\n\nKey phrases detected: ${keyPhrases.length}\n${[...new Set(keyPhrases)].slice(0, 15).map(p => `  • ${p}`).join('\n')}`) } }}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-all hover:bg-muted/50 hover:border-foreground/20">
                    <div className="rounded-md p-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"><BookOpen className="h-4 w-4" /></div>
                    <span className="text-[11px] font-medium">Structure</span>
                  </button>
                  <button onClick={() => { if (doc.content) { const preview = doc.content.slice(0, 500); const ext = doc.file_type || 'txt'; setAiResult(`📄 Extracted Text Preview (${ext.toUpperCase()})\n\n${preview}${doc.content.length > 500 ? `\n\n... (${(doc.content.length - 500).toLocaleString()} more characters)` : ''}`) } }}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-all hover:bg-muted/50 hover:border-foreground/20">
                    <div className="rounded-md p-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"><Eye className="h-4 w-4" /></div>
                    <span className="text-[11px] font-medium">Preview</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5" /> AI Actions</CardTitle>
                <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400">Requires API Key</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AI_ACTIONS.map((action) => (
                  <button key={action.value} onClick={() => setAiAction(action.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:bg-muted/50 ${aiAction === action.value ? "border-foreground bg-muted/50 shadow-sm" : "border-border"}`}>
                    <div className={`rounded-md p-1.5 ${aiAction === action.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{action.icon}</div>
                    <span className="text-[11px] font-medium leading-tight">{action.label}</span>
                  </button>
                ))}
              </div>
              {aiAction === "qa" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Your Question</label>
                  <Input placeholder="Ask something about this document..." value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} className="h-9" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button onClick={handleAiAction} disabled={aiLoading || !doc.content || (aiAction === "qa" && !qaQuestion.trim())} size="sm" className="h-9 gap-1.5">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Run {AI_ACTIONS.find((a) => a.value === aiAction)?.label}
                </Button>
                {!doc.content && <p className="text-xs text-muted-foreground">Add content to use AI actions.</p>}
              </div>
              {aiResult && <div className="bg-muted/30 rounded-lg p-4 whitespace-pre-wrap text-sm border border-border leading-relaxed">{aiResult}</div>}
              <p className="text-xs text-muted-foreground">AI actions use your personal API keys. Configure them in{" "}<Link href="/dashboard/settings/ai-keys" className="text-foreground hover:underline">Settings  AI Keys</Link>.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2.5 text-sm">
                {doc.description && (
                  <>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Description</span>
                      <p className="text-sm leading-relaxed">{doc.description}</p>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  {canEdit ? (
                    <Select value={doc.status || "draft"} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-7 w-[130px] text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft"><span className="text-stone-600">Draft</span></SelectItem>
                        <SelectItem value="under_review"><span className="text-amber-600">Under Review</span></SelectItem>
                        <SelectItem value="published"><span className="text-emerald-600">Published</span></SelectItem>
                        <SelectItem value="archived"><span className="text-muted-foreground">Archived</span></SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] capitalize ${
                      doc.status === "published" ? "text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400"
                        : doc.status === "under_review" ? "text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400"
                        : doc.status === "archived" ? "text-muted-foreground" : ""
                    }`}>{(doc.status || "draft").replace("_", " ")}</Badge>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Version</span>
                  <Badge variant="outline" className="text-[10px] gap-0.5"><GitBranch className="h-2.5 w-2.5" /> v{doc.version || 1}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Classification</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{doc.classification || "general"}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Access</span>
                  <Badge variant="outline" className="text-[10px] capitalize"><Eye className="h-2.5 w-2.5 mr-0.5" />{(doc.access_level || "view_only").replace(/_/g, " ")}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Protection</span>
                  {doc.is_password_protected
                    ? <Badge className="text-[10px] gap-0.5 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"><Lock className="h-2.5 w-2.5" /> Locked</Badge>
                    : <Badge variant="outline" className="text-[10px] gap-0.5"><Unlock className="h-2.5 w-2.5" /> Open</Badge>}
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="text-xs">{new Date(doc.updated_at).toLocaleDateString()}</span>
                </div>
                {doc.file_size > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">File Size</span>
                      <span className="text-xs">{doc.file_size < 1024 * 1024 ? `${(doc.file_size / 1024).toFixed(1)} KB` : `${(doc.file_size / (1024 * 1024)).toFixed(2)} MB`}</span>
                    </div>
                  </>
                )}
              </div>

              {doc.file_url && (
                <>
                  <Separator />
                  <a href={`/api/document-file?documentId=${doc.id}`} target="_blank" rel="noopener noreferrer" download
                    className="flex items-center gap-2 text-xs text-foreground hover:underline py-1">
                    <Download className="h-3.5 w-3.5" /> Download Original File
                  </a>
                </>
              )}
              {doc.tags && doc.tags.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1.5">Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>)}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {isOwner && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Password Protection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {doc.is_password_protected ? "This document requires a 9-digit code to access." : "Protect this document with a 9-digit code. Even admins and superadmins won't be able to read it without the code."}
                </p>
                <Dialog open={passwordDialogOpen} onOpenChange={(open) => { setPasswordDialogOpen(open); if (!open) { setPasswordCode(""); setPasswordError("") } }}>
                  {doc.is_password_protected ? (
                    <div className="flex gap-2">
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs flex-1 gap-1" onClick={() => setPasswordAction("set")}><Key className="h-3 w-3" /> Change Code</Button>
                      </DialogTrigger>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setPasswordAction("remove")}><Unlock className="h-3 w-3" /> Remove</Button>
                      </DialogTrigger>
                    </div>
                  ) : (
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs w-full gap-1" onClick={() => setPasswordAction("set")}><Lock className="h-3 w-3" /> Set Password</Button>
                    </DialogTrigger>
                  )}
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>{passwordAction === "set" ? "Set Access Code" : passwordAction === "remove" ? "Remove Protection" : "Verify Code"}</DialogTitle>
                      <DialogDescription>{passwordAction === "set" ? "Enter a 9-digit numeric code to protect this document." : passwordAction === "remove" ? "Enter the current code to remove protection." : "Enter the 9-digit code to unlock."}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <Input type="password" placeholder="000000000" maxLength={9} value={passwordCode}
                        onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 9); setPasswordCode(val); setPasswordError("") }}
                        className="text-center tracking-[0.4em] font-mono text-lg h-12" />
                      <p className="text-xs text-muted-foreground text-center">{passwordCode.length}/9 digits</p>
                      {passwordError && <p className="text-xs text-destructive text-center">{passwordError}</p>}
                    </div>
                    <DialogFooter>
                      <Button onClick={handlePasswordAction} disabled={passwordCode.length !== 9 || passwordLoading} className="w-full h-10"
                        variant={passwordAction === "remove" ? "destructive" : "default"}>
                        {passwordLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {passwordAction === "set" ? "Set Code" : passwordAction === "remove" ? "Remove Protection" : "Verify"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}

          {/* Referenced Documents */}
          {doc.referenced_docs && doc.referenced_docs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Referenced Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {doc.referenced_docs.map((refId) => (
                  <Link key={refId} href={`/dashboard/documents/${refId}`} className="flex items-center gap-2 text-xs rounded-lg border p-2 hover:bg-muted/50 transition-colors">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground">Document</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono shrink-0 ml-auto">{refId.slice(0, 8)}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Reviewers */}
          {doc.status === "under_review" && doc.reviewers && doc.reviewers.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><Eye className="h-3.5 w-3.5" /> Reviewers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {doc.reviewers.map((reviewerId) => (
                  <div key={reviewerId} className="flex items-center gap-2 text-xs rounded-lg border p-2 bg-amber-50/50 dark:bg-amber-950/20">
                    <div className="h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                      <User className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="truncate">Reviewer</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto shrink-0 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800">Pending</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Need help? Visit{" "}<Link href="/dashboard/settings/ai-keys" className="text-foreground hover:underline">AI Keys Settings</Link> to configure your AI providers.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
