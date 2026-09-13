import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/docs", "/docs/*", "/login", "/register"],
        disallow: [
          "/dashboard",
          "/dashboard/*",
          "/god",
          "/god/*",
          "/api/",
          "/p/",
          "/p/*",
          "/pending-approval",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
