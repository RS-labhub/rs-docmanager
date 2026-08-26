// Editor DOM enhancers that run after BlockNote renders, since forking its ProseMirror schema is unstable (see the toggleListItem regression):
//   - convertEmbedBlocks: swaps unplayable <video src> for an <iframe> embed
//   - enhanceLinks: adds a hover overlay with copy/unlink buttons
//   - enhanceCodeBlocks: adds a "Copy" button to code blocks
//   - enhanceFileBlocks: adds an "Open" link to generic file attachments
// All are idempotent via data-* flags, so re-running via MutationObserver is safe.

// Extracts a YouTube video id from various URL forms.
function youtubeId(url: string): string | null {
  // youtu.be/<id>
  const short = url.match(/youtu\.be\/([\w-]{6,})/i)
  if (short) return short[1]
  // youtube.com/watch?v=<id>
  const watch = url.match(/[?&]v=([\w-]{6,})/i)
  if (watch) return watch[1]
  // youtube.com/embed/<id>
  const emb = url.match(/youtube\.com\/embed\/([\w-]{6,})/i)
  if (emb) return emb[1]
  // youtube.com/shorts/<id>
  const sh = url.match(/youtube\.com\/shorts\/([\w-]{6,})/i)
  if (sh) return sh[1]
  return null
}

function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/i)
  return m ? m[1] : null
}

function driveEmbedUrl(url: string): string | null {
  // https://drive.google.com/file/d/<id>/view?...
  const m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i)
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`
  return null
}

function iframeEmbedFor(url: string): string | null {
  const yt = youtubeId(url)
  if (yt) return `https://www.youtube.com/embed/${yt}`
  const vi = vimeoId(url)
  if (vi) return `https://player.vimeo.com/video/${vi}`
  const gd = driveEmbedUrl(url)
  if (gd) return gd
  return null
}

// Swap <video>/<audio> tags for an <iframe> when the URL is a YouTube/Vimeo/Drive embed.
export function convertEmbedBlocks(root: HTMLElement) {
  const media = root.querySelectorAll<HTMLVideoElement | HTMLAudioElement>(
    'video[src]:not([data-embed-swapped]), audio[src]:not([data-embed-swapped])'
  )
  media.forEach((v) => {
    const src = v.getAttribute("src") ?? ""
    const embed = iframeEmbedFor(src)
    if (!embed) return

    const iframe = document.createElement("iframe")
    iframe.src = embed
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    iframe.allowFullscreen = true
    iframe.loading = "lazy"
    iframe.setAttribute("frameborder", "0")
    iframe.setAttribute("data-embed-swapped", "true")
    iframe.className = v.className

    v.setAttribute("data-embed-swapped", "true")
    v.replaceWith(iframe)
  })
}

// Attach the shared hover overlay to editor links (view URL, copy, unlink).
export function enhanceLinks(
  root: HTMLElement,
  options: {
    editable: boolean
    getOverlay: () => HTMLElement
    onUnlink: (anchor: HTMLAnchorElement) => void
  }
) {
  const links = root.querySelectorAll<HTMLAnchorElement>(
    "a[href]:not([data-link-enhanced])"
  )
  links.forEach((a) => {
    a.setAttribute("data-link-enhanced", "true")
    a.setAttribute("target", a.getAttribute("target") ?? "_blank")
    a.setAttribute("rel", "noopener noreferrer")
    a.addEventListener("mouseenter", () => {
      const overlay = options.getOverlay()
      const rect = a.getBoundingClientRect()
      overlay.dataset.href = a.href
      overlay.dataset.editable = options.editable ? "1" : "0"
      overlay.style.top = `${rect.bottom + window.scrollY + 6}px`
      overlay.style.left = `${Math.max(8, rect.left + window.scrollX)}px`
      overlay.style.display = "flex"
      ;(overlay as any)._target = a
      ;(overlay as any)._onUnlink = options.onUnlink
    })
    a.addEventListener("mouseleave", (ev) => {
      const overlay = options.getOverlay()
      const next = ev.relatedTarget as Node | null
      if (next && overlay.contains(next)) return
      window.setTimeout(() => {
        if (!overlay.matches(":hover") && !a.matches(":hover")) {
          overlay.style.display = "none"
        }
      }, 120)
    })
  })
}


export function enhanceCodeBlocks(root: HTMLElement) {
  const outers = root.querySelectorAll<HTMLElement>(
    ".bn-block-outer:not([data-copy-btn])"
  )
  outers.forEach((outer) => {
    const content = outer.querySelector<HTMLElement>(
      '.bn-block-content[data-content-type="codeBlock"]'
    )
    if (!content) return

    outer.setAttribute("data-copy-btn", "true")
    outer.classList.add("bn-has-copy-btn")

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "bn-code-copy"
    btn.setAttribute("contenteditable", "false")
    btn.setAttribute("aria-label", "Copy code to clipboard")
    btn.title = "Copy code"
    btn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>'

    btn.addEventListener("mousedown", (ev) => ev.stopPropagation())
    btn.addEventListener("pointerdown", (ev) => ev.stopPropagation())
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation()
      ev.preventDefault()
      const code = content.querySelector<HTMLElement>("code")
      const text = code?.innerText ?? content.innerText ?? ""
      try {
        await navigator.clipboard.writeText(text)
        const label = btn.querySelector("span")
        if (label) {
          const prev = label.textContent
          label.textContent = "Copied"
          window.setTimeout(() => {
            label.textContent = prev ?? "Copy"
          }, 1000)
        }
      } catch {
        /* clipboard API blocked — fail silently */
      }
    })

    outer.appendChild(btn)
  })
}

// Add an "Open" link to generic file blocks (media blocks already expose one natively).
export function enhanceFileBlocks(
  root: HTMLElement,
  options: {
    getFileUrl: (blockId: string) => string | undefined
  }
) {
  const blocks = root.querySelectorAll<HTMLElement>(
    '[data-file-block][data-content-type="file"]:not([data-open-link])'
  )
  blocks.forEach((block) => {
    const outer = block.closest<HTMLElement>(".bn-block-outer")
    const blockId = outer?.getAttribute("data-id") ?? ""
    const url = options.getFileUrl(blockId)
    if (!url) return

    const wrapper = block.querySelector<HTMLElement>(
      ".bn-file-block-content-wrapper"
    )
    if (!wrapper) return

    block.setAttribute("data-open-link", "true")

    const link = document.createElement("a")
    link.href = url
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.className = "bn-file-open-link"
    link.setAttribute("contenteditable", "false")
    link.title = "Open file in new tab"
    link.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg><span>Open</span>'
    link.addEventListener("mousedown", (ev) => ev.stopPropagation())
    link.addEventListener("click", (ev) => ev.stopPropagation())

    const row = wrapper.querySelector<HTMLElement>(".bn-file-name-with-icon")
    if (row) {
      row.appendChild(link)
    } else {
      wrapper.appendChild(link)
    }
  })
}
