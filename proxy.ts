// Next.js proxy (replaces the deprecated `middleware`). Refreshes the auth
// session cookie, redirects based on auth state, and applies security headers.
// This is a first line of defense only — routes must still call requireUser()/requireRole().
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PAGES = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/pending-approval",
  "/docs",
]);

const AUTH_PAGES = new Set(["/login", "/register", "/forgot-password"]);

// API paths that are legitimately public (auth entrypoints, docs).
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/callback",
  "/api/docs",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (pathname.startsWith("/docs/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/public/")) return true;
  // Shared public-link page view + its JSON endpoint.
  if (pathname.startsWith("/p/")) return true;
  // /api/pages/<uuid>/public — anonymous read of a public-link page.
  if (/^\/api\/pages\/[^/]+\/public$/.test(pathname)) return true;
  for (const p of PUBLIC_API_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  // HSTS is only meaningful over HTTPS; browsers ignore it on HTTP.
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass-through response; Supabase rewrites cookies as the session refreshes.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail safe: don't guard routes if env is missing, but still apply headers.
    return applySecurityHeaders(response);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh the session cookie if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = isPublicPath(pathname);
  const isAuthPage = AUTH_PAGES.has(pathname);
  const isApi = pathname.startsWith("/api/");

  // 1. Unauthenticated user hitting a protected route
  if (!user && !isPublic) {
    if (isApi) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        )
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 2. Authenticated user on /login or /register → send to dashboard
  if (user && isAuthPage) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.url))
    );
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // All paths except static assets, favicon/robots/sitemap, and public images.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
