// Supabase service-role client — bypasses RLS. Import only from code that
// has already authorized the caller via requireRole(), or from maintenance scripts.
import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let _cached: SupabaseClient<Database> | null = null;

// Returns a Supabase client authenticated with the service-role key. Use sparingly.
export function createAdminClient(): SupabaseClient<Database> {
  if (_cached) return _cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  _cached = createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _cached;
}
