"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth-shell"
import {
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
} from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [tokenError, setTokenError] = useState("")

  const strength = useMemo(() => computeStrength(password), [password])

  // In-memory Supabase client scoped to this page's recovery session.
  const supabaseRef = useRef<SupabaseClient | null>(null)
  if (supabaseRef.current === null && typeof window !== "undefined") {
    supabaseRef.current = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    )
  }

  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return
    let cancelled = false

    async function init() {
      if (typeof window === "undefined" || !supabase) return

      // Recovery tokens arrive in the URL hash fragment.
      const hash = window.location.hash.replace(/^#/, "")
      if (hash) {
        const params = new URLSearchParams(hash)
        const errDesc =
          params.get("error_description") || params.get("error")
        const accessToken = params.get("access_token")
        const refreshToken = params.get("refresh_token")
        const type = params.get("type")

        if (errDesc) {
          if (!cancelled) {
            setTokenError(
              decodeURIComponent(errDesc) ||
                "This reset link is invalid or has expired. Request a new one from the forgot-password page."
            )
          }
          return
        }

        if (accessToken && refreshToken && type === "recovery") {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          // Strip tokens from the address bar.
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + window.location.search
          )
          if (cancelled) return
          if (setErr) {
            setTokenError(
              "This reset link is invalid or has expired. Request a new one from the forgot-password page."
            )
          } else {
            setRecoveryReady(true)
          }
          return
        }
      }

      if (!cancelled) {
        setTokenError(
          "This reset link is invalid or has expired. Request a new one from the forgot-password page."
        )
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const supabase = supabaseRef.current
    if (!supabase) return

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) throw updateError
      await supabase.auth.signOut().catch(() => undefined)
      setSuccess(true)
      setTimeout(() => router.push("/login"), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell leftPanel={<ResetLeftPanel />}>
        <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Password updated
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Taking you back to sign in…
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell leftPanel={<ResetLeftPanel />}>
      <div className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Choose a strong password you haven’t used here before.
        </p>
      </div>

      <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {tokenError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{tokenError}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              New password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
                className="h-11 pr-10"
                disabled={!recoveryReady}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {password.length > 0 && <StrengthMeter strength={strength} />}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm font-medium">
              Confirm new password
            </Label>
            <Input
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="Re-enter your password"
              className="h-11"
              disabled={!recoveryReady}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 gap-2 shadow-sm"
            disabled={loading || !recoveryReady}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : !recoveryReady && !tokenError ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying link...
              </>
            ) : (
              <>
                Update password
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="px-6 pb-6">
          <Button asChild variant="ghost" className="w-full h-11">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}

function ResetLeftPanel() {
  return (
    <div className="space-y-8 max-w-md">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-background/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
        <KeyRound className="h-3 w-3 text-primary" />
        New password
      </div>
      <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
        Set a new password.{" "}
        <span className="text-muted-foreground">
          Keep your account secure.
        </span>
      </h2>
      <p className="text-[15px] text-muted-foreground leading-relaxed">
        Pick something you haven’t used on this site before. A passphrase with
        symbols is usually best.
      </p>

      <div className="grid grid-cols-1 gap-3 pt-2">
        <FeatureRow
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Signed out everywhere"
          text="For your safety, we’ll end existing sessions after the change."
        />
        <FeatureRow
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Instant access"
          text="Sign back in right away with your new password."
        />
      </div>
    </div>
  )
}

function FeatureRow({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border bg-background/50 backdrop-blur-sm">
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 text-primary border border-primary/15 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {text}
        </p>
      </div>
    </div>
  )
}

function computeStrength(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 5)
}

function StrengthMeter({ strength }: { strength: number }) {
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"]
  const colors = [
    "bg-destructive",
    "bg-destructive/80",
    "bg-warning",
    "bg-warning/80",
    "bg-success",
    "bg-success",
  ]
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-colors ${
              i < strength ? colors[strength] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {labels[strength]} · use 12+ chars with numbers and symbols
      </p>
    </div>
  )
}
