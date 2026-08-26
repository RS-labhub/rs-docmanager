"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Github, Linkedin, Twitter, Instagram, Mail, Globe } from "lucide-react"
import Navbar from "@/components/navbar"

// Routes with their own chrome — skip the global navbar/footer here.
const BARE_CHROME_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]

// Ordered by developer preference.
const SOCIALS = [
  { label: "GitHub", href: "https://github.com/RS-labhub", icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/rohan-sharma-9386rs/", icon: Linkedin },
  { label: "X (Twitter)", href: "https://twitter.com/rrs00179", icon: Twitter },
  { label: "Instagram", href: "https://instagram.com/r_rohan__._/", icon: Instagram },
  { label: "Portfolio", href: "https://www.rohansrma.vercel.app", icon: Globe },
  { label: "Email", href: "mailto:rohansrma3@gmail.com", icon: Mail },
]

const PRODUCT_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Documents", href: "/dashboard/documents" },
  { label: "Pages", href: "/dashboard/pages" },
  { label: "Settings", href: "/dashboard/settings" },
]

const RESOURCE_LINKS = [
  { label: "Documentation", href: "/docs" },
  { label: "Getting started", href: "/docs/getting-started" },
  { label: "Security", href: "/docs/security" },
  { label: "Privacy", href: "/docs/privacy" },
  { label: "Terms", href: "/docs/terms" },
]

function isBareChrome(pathname: string | null) {
  if (!pathname) return false
  return BARE_CHROME_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

export function AppNavbar() {
  const pathname = usePathname()
  if (isBareChrome(pathname)) return null
  return <Navbar />
}

export function AppFooter() {
  const pathname = usePathname()
  // Full footer is home-page only.
  if (pathname !== "/") return null

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2" aria-label="R's DocManager — home">
              <Image
                src="/logo.png"
                alt=""
                width={120}
                height={28}
                style={{ height: 24, width: "auto" }}
                className="object-contain"
              />
              <span className="text-sm font-semibold tracking-tight">R&apos;s DocManager</span>
            </Link>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              AI document management with encrypted API keys, multi-organization support, and
              fine-grained access control.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target={s.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={s.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  aria-label={s.label}
                  title={s.label}
                  className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <s.icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Product">
            <h2 className="mb-3 text-xs font-semibold">Product</h2>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Resources">
            <h2 className="mb-3 text-xs font-semibold">Resources</h2>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} R&apos;s DocManager. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built by{" "}
            <a
              href="https://www.rohansrma.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
            >
              Rohan Sharma
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
