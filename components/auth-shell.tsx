"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"

// Shared chrome for the unauthenticated pages (login, register, forgot/reset password).
export function AuthShell({
  leftPanel,
  children,
}: {
  leftPanel: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative w-full overflow-x-hidden min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 dot-bg opacity-40" />
        <div className="absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="grid lg:grid-cols-2 lg:h-full">
        {/* Left: fixed brand panel, no scroll on lg+ */}
        <aside className="hidden lg:flex lg:h-full lg:overflow-hidden border-r bg-gradient-to-br from-muted/40 via-background to-background">
          <div className="flex flex-col w-full p-10 xl:p-14 min-h-0">
            <AuthBrandLink />
            <div className="flex-1 flex flex-col justify-center py-8 min-h-0 overflow-hidden">
              {leftPanel}
            </div>
          </div>
        </aside>

        {/* Right: only this column scrolls on lg+ */}
        <div className="flex flex-col min-h-[100dvh] lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {/* Mobile-only top bar with brand (shown when left pane is hidden). */}
          <header className="lg:hidden border-b bg-background/60 backdrop-blur-sm">
            <div className="px-4 sm:px-6 h-14 flex items-center">
              <AuthBrandLink compact />
            </div>
          </header>

          <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-[420px] animate-fade-in">
              {children}
            </div>
          </main>

          <footer className="border-t bg-background/60 backdrop-blur-sm">
            <div className="px-4 sm:px-6 py-4">
              <AuthFooterText />
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

/* Logo + app name, linked to `/`. */
export function AuthBrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
      aria-label="R's DocManager — home"
    >
      <Image
        src="/logo.png"
        alt=""
        width={180}
        height={40}
        priority
        // Fixed height; width follows the logo's intrinsic aspect ratio.
        style={{ height: compact ? 28 : 36, width: "auto" }}
        className="object-contain"
      />
      <span
        className={
          compact
            ? "text-[13px] font-semibold tracking-tight"
            : "text-[15px] font-semibold tracking-tight"
        }
      >
        R&apos;s DocManager
      </span>
    </Link>
  )
}

/* Footer line shared by all auth pages. */
export function AuthFooterText() {
  return (
    <p className="text-[11px] text-muted-foreground text-center lg:text-left leading-relaxed">
      &copy; R&apos;s DocManager {new Date().getFullYear()} &middot; Built by{" "}
      <a
        href="https://www.rohansrma.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground font-medium hover:underline"
      >
        Rohan Sharma
      </a>{" "}
      in hope of love
    </p>
  )
}
