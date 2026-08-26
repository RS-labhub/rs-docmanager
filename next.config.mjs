/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. The proxy
// sets these per-request too, but keeping them here provides a
// fallback for routes that bypass the proxy (e.g. static assets).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // A permissive CSP — Next.js + inline styles + Tailwind require
  // 'unsafe-inline' and 'unsafe-eval' in dev. Tighten further in
  // production once you've inventoried every external resource.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.groq.com https://api.anthropic.com https://*.permit.io",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtu.be https://player.vimeo.com https://drive.google.com https://docs.google.com",
      "child-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com https://docs.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
