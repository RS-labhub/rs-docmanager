"use client"

// BlockNote rich editor wrapper (Mantine theme). Debounces changes,
// emits a markdown cache alongside JSON, and honours readOnly.
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core"
import "@blocknote/mantine/style.css"
import { useTheme } from "next-themes"
import {
  convertEmbedBlocks,
  enhanceCodeBlocks,
  enhanceFileBlocks,
  enhanceLinks,
} from "./page-editor-enhancers"

// toggleListItem has a regression that can lock up the tab; stripped until fixed.
const { toggleListItem: _removedToggleListItem, ...safeBlockSpecs } =
  defaultBlockSpecs
void _removedToggleListItem

const editorSchema = BlockNoteSchema.create({
  blockSpecs: safeBlockSpecs,
})

export type BlockTree = unknown[]

interface PageEditorProps {
  initialContent: BlockTree | null | undefined
  readOnly?: boolean
  onChange?: (payload: { content: BlockTree; markdown: string }) => void
  debounceMs?: number
}

export function PageEditor({
  initialContent,
  readOnly = false,
  onChange,
  debounceMs = 800,
}: PageEditorProps) {
  const { resolvedTheme } = useTheme()

  // BlockNote requires a non-empty array or undefined; empty arrays crash it.
  const initial = useMemo(() => {
    if (Array.isArray(initialContent) && initialContent.length > 0) {
      return initialContent as any
    }
    return undefined
  }, [initialContent])

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: initial,
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const emit = useCallback(async () => {
    try {
      const content = editor.document as BlockTree
      const markdown = await editor.blocksToMarkdownLossy(editor.document)
      onChangeRef.current?.({ content, markdown })
    } catch (err) {
      console.error("[PageEditor] serialize failed", err)
    }
  }, [editor])

  const handleChange = useCallback(() => {
    if (!onChangeRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void emit()
    }, debounceMs)
  }, [emit, debounceMs])

  // Flush the pending debounce so edits aren't lost on unmount or tab hide.
  const flush = useCallback(() => {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
    void emit()
  }, [emit])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("beforeunload", flush)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("beforeunload", flush)
      flush()
    }
  }, [flush])

  // Post-render DOM enhancers: run after BlockNote paints, via MutationObserver.
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Cached link-hover overlay, repositioned on mouseenter of any anchor.
  const getOverlay = useCallback(() => {
    if (overlayRef.current) return overlayRef.current
    const el = document.createElement("div")
    el.className = "bn-link-overlay"
    el.style.display = "none"
    el.innerHTML = `
      <a class="bn-link-overlay__url" target="_blank" rel="noopener noreferrer"></a>
      <button type="button" class="bn-link-overlay__btn" data-action="copy" title="Copy link">Copy</button>
      <button type="button" class="bn-link-overlay__btn bn-link-overlay__unlink" data-action="unlink" title="Remove link">Unlink</button>
    `
    const urlEl = el.querySelector<HTMLAnchorElement>(".bn-link-overlay__url")!
    const copyBtn = el.querySelector<HTMLButtonElement>('[data-action="copy"]')!
    const unlinkBtn = el.querySelector<HTMLButtonElement>(
      '[data-action="unlink"]'
    )!
    el.addEventListener("mouseleave", () => {
      el.style.display = "none"
    })
    copyBtn.addEventListener("click", async () => {
      const href = el.dataset.href ?? ""
      try {
        await navigator.clipboard.writeText(href)
        copyBtn.textContent = "Copied"
        window.setTimeout(() => (copyBtn.textContent = "Copy"), 900)
      } catch {
        /* clipboard blocked — fall through */
      }
    })
    unlinkBtn.addEventListener("click", () => {
      const target = (el as any)._target as HTMLAnchorElement | undefined
      const fn = (el as any)._onUnlink as
        | ((a: HTMLAnchorElement) => void)
        | undefined
      if (target && fn) fn(target)
      el.style.display = "none"
    })
    // Open-in-new-tab text is just the URL; we keep it as a link so ctrl-click / middle-click work naturally.
    urlEl.addEventListener("mouseenter", () => {
      urlEl.textContent = el.dataset.href ?? ""
      urlEl.href = el.dataset.href ?? "#"
    })
    document.body.appendChild(el)
    overlayRef.current = el
    return el
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const getFileUrl = (blockId: string): string | undefined => {
      try {
        const block = editor.getBlock(blockId)
        if (!block) return undefined
        const url = (block.props as { url?: string } | undefined)?.url
        return typeof url === "string" && url ? url : undefined
      } catch {
        return undefined
      }
    }

    const unlinkAnchor = (a: HTMLAnchorElement) => {
      // Replace the anchor with its own text content; BlockNote will pick this up on the next document read.
      const text = document.createTextNode(a.textContent ?? "")
      a.replaceWith(text)
    }

    const run = () => {
      convertEmbedBlocks(surface)
      enhanceLinks(surface, {
        editable: !readOnly,
        getOverlay,
        onUnlink: unlinkAnchor,
      })
      enhanceCodeBlocks(surface)
      enhanceFileBlocks(surface, { getFileUrl })
    }

    // Initial pass once BlockNote has mounted its DOM.
    const initial = window.setTimeout(run, 0)

    // Debounced observer so batched edits don't re-enhance on every keystroke.
    let mTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (mTimer) clearTimeout(mTimer)
      mTimer = setTimeout(run, 150)
    })
    observer.observe(surface, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-content-type", "src", "href"],
    })

    return () => {
      window.clearTimeout(initial)
      if (mTimer) clearTimeout(mTimer)
      observer.disconnect()
    }
  }, [editor, readOnly, getOverlay])

  // Tear down the shared link overlay on unmount.
  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
    }
  }, [])

  return (
    <div className="blocknote-surface" ref={surfaceRef}>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </div>
  )
}
