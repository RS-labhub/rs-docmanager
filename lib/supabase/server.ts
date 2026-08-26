// User-scoped Supabase server client for Route Handlers, Server Actions,
// and Server Components. Binds to the cookie session; RLS is enforced.
// For admin/service-role ops use createAdminClient from "./admin" instead,
// after a requireRole() check.
import "server-only";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const cookieStore = await cookies();

  return createSsrServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — safe to ignore when
          // proxy.ts is refreshing sessions on every request.
        }
      },
    },
  });
}
