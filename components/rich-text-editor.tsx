"use client"

import React, { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Link2, Image, Quote, Heading1, Heading2, Heading3,
  Eye, PenLine, Minus, Table, CheckSquare, Undo, Redo,
  Maximize2, Minimize2, Video
} from "lucide-react"

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

type EditorMode = "write" | "preview" | "split"

interface ToolbarAction {
  icon: React.ReactNode
  label: string
  action: (text: string, start: number, end: number) => { text: string; cursor: number }
  separator?: boolean
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = "350px" }: RichTextEditorProps) {
  const [mode, setMode] = useState<EditorMode>("write")
  const [isEnlarged, setIsEnlarged] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // History state for Undo/Redo
  const [history, setHistory] = useState<string[]>([value || ""])
  const [historyIndex, setHistoryIndex] = useState(0)
  
  const manualHeightRef = useRef<string>("")

  // Auto-resize textarea when enlarged
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    if (isEnlarged) {
      ta.style.height = "auto"
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [value, isEnlarged, mode])

  // Reset height only when leaving enlarged mode
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    if (!isEnlarged) {
      ta.style.height = ""
    }
  }, [isEnlarged, mode])

  React.useEffect(() => {
    const val = value || ""
    // Skip if value already matches current history entry (e.g. undo/redo)
    if (val === history[historyIndex]) return

    const timer = setTimeout(() => {
      setHistory(prev => {
        const sliced = prev.slice(0, historyIndex + 1)
        if (sliced[sliced.length - 1] === val) return prev
        const next = [...sliced, val]
        return next.length > 50 ? next.slice(next.length - 50) : next
      })
      setHistoryIndex(prev => {
        return prev < 49 ? prev + 1 : 49
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [value, history, historyIndex])

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      onChange(history[newIndex])
    }
  }, [historyIndex, history, onChange])

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      onChange(history[newIndex])
    }
  }, [historyIndex, history, onChange])

  const insertFormatting = useCallback(
    (action: ToolbarAction["action"]) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const result = action(value || "", start, end)
      onChange(result.text)
      // Restore cursor
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(result.cursor, result.cursor)
      })
    },
    [value, onChange]
  )

  const wrapSelection = (prefix: string, suffix: string) => (text: string, start: number, end: number) => {
    const selected = text.slice(start, end)
    const before = text.slice(0, start)
    const after = text.slice(end)
    const newText = `${before}${prefix}${selected || "text"}${suffix}${after}`
    return { text: newText, cursor: start + prefix.length + (selected ? selected.length : 4) + suffix.length }
  }

  const insertAtLine = (prefix: string) => (text: string, start: number, end: number) => {
    const before = text.slice(0, start)
    const after = text.slice(start)
    const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
    const newText = `${before}${needsNewline}${prefix}`
    return { text: newText + after, cursor: newText.length }
  }

  const formatList = (prefixFn: (index: number) => string) => (text: string, start: number, end: number) => {
    const selected = text.slice(start, end)
    const before = text.slice(0, start)
    const after = text.slice(end)

    if (selected) {
      const lines = selected.split('\n')
      const formattedLines = lines.map((line, i) => `${prefixFn(i)}${line}`)
      const newSelected = formattedLines.join('\n')
      const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
      const newText = `${before}${needsNewline}${newSelected}`
      return { text: newText + after, cursor: before.length + needsNewline.length + newSelected.length }
    } else {
      const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
      const newText = `${before}${needsNewline}${prefixFn(0)}`
      return { text: newText + after, cursor: newText.length }
    }
  }

  const toolbarActions: ToolbarAction[] = [
    { icon: <Heading1 className="h-3.5 w-3.5" />, label: "Heading 1", action: insertAtLine("# ") },
    { icon: <Heading2 className="h-3.5 w-3.5" />, label: "Heading 2", action: insertAtLine("## ") },
    { icon: <Heading3 className="h-3.5 w-3.5" />, label: "Heading 3", action: insertAtLine("### ") },
    { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", action: wrapSelection("**", "**"), separator: true },
    { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", action: wrapSelection("_", "_") },
    { icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strikethrough", action: wrapSelection("~~", "~~") },
    { icon: <Code className="h-3.5 w-3.5" />, label: "Inline Code", action: wrapSelection("`", "`"), separator: true },
    { icon: <Quote className="h-3.5 w-3.5" />, label: "Blockquote", action: formatList(() => "> ") },
    { icon: <List className="h-3.5 w-3.5" />, label: "Bullet List", action: formatList(() => "- ") },
    { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered List", action: formatList((i) => `${i + 1}. `), separator: true },
    { icon: <CheckSquare className="h-3.5 w-3.5" />, label: "Task List", action: formatList(() => "- [ ] ") },
    { icon: <Minus className="h-3.5 w-3.5" />, label: "Divider", action: insertAtLine("\n---\n"), separator: true },
    {
      icon: <Link2 className="h-3.5 w-3.5" />,
      label: "Link",
      action: (text, start, end) => {
        const selected = text.slice(start, end)
        const before = text.slice(0, start)
        const after = text.slice(end)
        const link = `[${selected || "link text"}](url)`
        return { text: `${before}${link}${after}`, cursor: before.length + link.length }
      },
    },
    {
      icon: <Image className="h-3.5 w-3.5" />,
      label: "Image",
      action: (text, start) => {
        const before = text.slice(0, start)
        const after = text.slice(start)
        const img = "![alt text](image-url)"
        return { text: `${before}${img}${after}`, cursor: before.length + img.length }
      },
    },
    {
      icon: <Video className="h-3.5 w-3.5" />,
      label: "Embed Video (YouTube/Loom)",
      action: (text, start) => {
        const before = text.slice(0, start)
        const after = text.slice(start)
        const nl = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
        const embed = `${nl}[embed](https://youtube.com/watch?v=...)\n`
        return { text: `${before}${embed}${after}`, cursor: before.length + embed.length - 1 }
      },
    },
    {
      icon: <Table className="h-3.5 w-3.5" />,
      label: "Table",
      action: (text, start) => {
        const before = text.slice(0, start)
        const after = text.slice(start)
        const nl = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
        const table = `${nl}| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n`
        return { text: `${before}${table}${after}`, cursor: before.length + table.length }
      },
      separator: true,
    },
    {
      icon: <Code className="h-3.5 w-3.5" />,
      label: "Code Block",
      action: (text, start, end) => {
        const selected = text.slice(start, end)
        const before = text.slice(0, start)
        const after = text.slice(end)
        const nl = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
        const block = `${nl}\`\`\`javascript\n${selected || "// your code here"}\n\`\`\`\n`
        return { text: `${before}${block}${after}`, cursor: before.length + block.length }
      },
    },
  ]

  const safeValue = value || ""
  const wordCount = safeValue.split(/\s+/).filter(Boolean).length
  const lineCount = safeValue.split("\n").length

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const ta = e.currentTarget
      const cursor = ta.selectionStart
      const text = ta.value
      
      const beforeCursor = text.slice(0, cursor)
      const afterCursor = text.slice(cursor)
      
      const lastNewlineIndex = beforeCursor.lastIndexOf("\n")
      const currentLine = lastNewlineIndex === -1 ? beforeCursor : beforeCursor.slice(lastNewlineIndex + 1)
      
      const isListItem = /^(\s*)([-*+]|\d+\.|>)\s+(.*)$/.exec(currentLine)
      
      if (isListItem) {
        e.preventDefault()
        const [_, indent, bullet, content] = isListItem
        
        if (!content.trim()) {
          // Empty item, time to remove the bullet (double enter to exit)
          const newBefore = lastNewlineIndex === -1 ? "" : beforeCursor.slice(0, lastNewlineIndex)
          const newText = newBefore + "\n\n" + afterCursor
          onChange(newText)
          requestAnimationFrame(() => {
            ta.focus()
            ta.setSelectionRange(newBefore.length + 2, newBefore.length + 2)
          })
          return
        }
        
        // Time to continue the list
        let nextBullet = bullet
        if (/^\d+\.$/.test(bullet)) {
          const num = parseInt(bullet, 10)
          nextBullet = `${num + 1}.`
        }
        
        const prefix = `\n${indent}${nextBullet} `
        const newText = beforeCursor + prefix + afterCursor
        onChange(newText)
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(cursor + prefix.length, cursor + prefix.length)
        })
      }
    }
  }

  return (
    <div className="border-0 sm:border rounded-none sm:rounded-lg overflow-hidden bg-background">
      {/* Mode switcher + Toolbar */}
      <div className="border-b bg-muted/30 flex flex-col">
        {/* Mode switcher row */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
          <div className="flex items-center gap-1">
            <Button type="button" variant={mode === "write" ? "secondary" : "ghost"} size="sm"
              className="h-7 text-[11px] gap-1 px-2.5" onClick={() => setMode("write")}>
              <PenLine className="h-3 w-3" /> Write
            </Button>
            <Button type="button" variant={mode === "preview" ? "secondary" : "ghost"} size="sm"
              className="h-7 text-[11px] gap-1 px-2.5" onClick={() => setMode("preview")}>
              <Eye className="h-3 w-3" /> Preview
            </Button>
            <Button type="button" variant={mode === "split" ? "secondary" : "ghost"} size="sm"
              className="h-7 text-[11px] gap-1 px-2.5 hidden sm:inline-flex" onClick={() => setMode("split")}>
              Split
            </Button>
          </div>
          <div className="flex items-center gap-2">
            
            <Badge variant="outline" className="text-[9px] font-normal hidden sm:inline-flex">Markdown</Badge>
          </div>
        </div>
        {/* Formatting toolbar — only shown in write/split modes */}
        {(mode === "write" || mode === "split") && (
          <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-thin">
            {toolbarActions.map((action, i) => (
              <React.Fragment key={i}>
                {action.separator && i > 0 && <Separator orientation="vertical" className="h-5 mx-0.5 shrink-0" />}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title={action.label}
                  onClick={() => insertFormatting(action.action)}
                >
                  {action.icon}
                </Button>
              </React.Fragment>
            ))}
            
            <Separator orientation="vertical" className="h-5 mx-0.5 shrink-0" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Undo"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
            >
              <Undo className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Redo"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
            >
              <Redo className="h-3.5 w-3.5" />
            </Button>
            <Separator orientation="vertical" className="h-5 mx-0.5 shrink-0 ml-auto" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 ml-auto"
              title={isEnlarged ? "Minimize View" : "Enlarge View"}
              onClick={() => setIsEnlarged(!isEnlarged)}
            >
              {isEnlarged ? <Minimize2 className="h-3.5 w-3.5 text-primary" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div 
        className={mode === "split" ? "flex flex-col sm:flex-row sm:divide-x divide-y sm:divide-y-0 items-stretch" : "relative"}
      >
        {(mode === "write" || mode === "split") && (
          <div 
            className={`${mode === "split" ? "w-full sm:w-1/2" : "w-full"} relative bg-background border-0`}
            style={isEnlarged ? {} : { resize: "vertical", overflow: "hidden", minHeight: "350px", display: "flex", flexDirection: "column" }}
          >
            <Textarea
              ref={textareaRef}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || "Write your content using Markdown..."}
              className={`w-full border-0 rounded-none focus-visible:ring-0 font-mono text-sm p-4 !block flex-1 ${
                isEnlarged ? "resize-none overflow-hidden" : "resize-none overflow-y-auto"
              }`}
              style={isEnlarged ? { minHeight: "350px" } : { height: "100%", width: "100%", minHeight: "350px", margin: 0 }}
            />
          </div>
        )}
        {(mode === "preview" || mode === "split") && (
          <div className={mode === "split" ? "w-full sm:w-1/2 relative min-h-0 bg-background" : "w-full relative min-h-[350px] bg-background"}>
            <div
              className={`w-full prose prose-sm dark:prose-invert max-w-none p-4 ${
                isEnlarged || mode === "preview"
                  ? "relative h-auto overflow-visible"
                  : "absolute inset-0 overflow-y-auto"
              }`}
            >
              {value ? (
                <MarkdownPreview content={value} />
              ) : (
                <p className="text-muted-foreground italic">Nothing to preview yet...</p>
              )}
            </div>
            {/* Provide an empty spacer so it doesn't collapse to 0 if we aren't absolute, but absolute inset-0 covers it anyway */}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
        <span className="hidden sm:inline">Markdown &bull; Use toolbar or type formatting directly</span>
        <span className="sm:hidden">Markdown</span>
        <div className="flex items-center gap-2 sm:gap-3 tabular-nums">
          <span>{safeValue.length.toLocaleString()} <span className="hidden sm:inline">chars</span><span className="sm:hidden">c</span></span>
          <span>{wordCount} <span className="hidden sm:inline">words</span><span className="sm:hidden">w</span></span>
          <span>{lineCount} <span className="hidden sm:inline">lines</span><span className="sm:hidden">l</span></span>
        </div>
      </div>
    </div>
  )
}

// Lazy-loaded markdown preview to avoid SSR issues
function MarkdownPreview({ content }: { content: string }) {
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null)
  const [remarkGfm, setRemarkGfm] = useState<any>(null)
  const [remarkBreaks, setRemarkBreaks] = useState<any>(null)

  React.useEffect(() => {
    Promise.all([
      import("react-markdown"),
      import("remark-gfm"),
      import("remark-breaks"),
    ]).then(([md, gfm, breaks]) => {
      setReactMarkdown(() => md.default)
      setRemarkGfm(() => gfm.default)
      setRemarkBreaks(() => breaks.default)
    })
  }, [])

  if (!ReactMarkdown) {
    return <p className="text-muted-foreground italic">Loading preview...</p>
  }

  return (
    <ReactMarkdown
      remarkPlugins={[
        ...(remarkGfm ? [remarkGfm] : []),
        ...(remarkBreaks ? [remarkBreaks] : []),
      ]}
      components={{
        code({ node, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || "")
          const isInline = !match && !className
          if (isInline) {
            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            )
          }
          return (
            <pre className="bg-muted/50 border rounded-lg p-4 overflow-x-auto">
              <code className={`text-xs font-mono ${className || ""}`} {...props}>
                {children}
              </code>
            </pre>
          )
        },
        table({ children }: any) {
          return (
            <div className="overflow-x-auto my-4 border rounded-lg">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          )
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
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4" {...props}>
              {children === "embed" ? href : children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
