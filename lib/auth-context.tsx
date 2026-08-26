"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/supabase/types";

interface AuthContextType {
  user: Profile | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; pending?: boolean }>;
  register: (
    data: RegisterData
  ) => Promise<{ success: boolean; error?: string; pending?: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  org_code?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Public routes for client-side UX; the server enforces access via proxy.ts.
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/pending-approval",
  "/docs",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith("/docs/")) return true;
  // Public shared page links — anonymous visitors are allowed here.
  if (pathname.startsWith("/p/")) return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  // Loads the profile for the current session.
  const loadProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error || !data) return null;
      return data as Profile;
    },
    [supabase]
  );

  // Returns Profile, null (signed out/disabled), or undefined (transient error, keep state).
  const fetchCurrentProfile = useCallback(async (): Promise<
    Profile | null | undefined
  > => {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) return undefined;
      if (!authUser) return null;

      const profile = await loadProfile(authUser.id);
      if (!profile) return undefined;

      if (!profile.is_active || profile.approval_status === "rejected") {
        await supabase.auth.signOut();
        return null;
      }
      return profile;
    } catch {
      return undefined;
    }
  }, [supabase, loadProfile]);

  const refresh = useCallback(async () => {
    const result = await fetchCurrentProfile();
    if (result === undefined) return;
    setUser(result);
  }, [fetchCurrentProfile]);

  // Initial load + subscribe to auth state changes.
  useEffect(() => {
    let mounted = true;
    // Hard ceiling so the UI never deadlocks on a hung Supabase call.
    const loadingFloor = setTimeout(() => { if (mounted) setIsLoading(false); }, 4000);

    (async () => {
      // Fast path: read session from localStorage instead of a round-trip to Supabase Auth.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
          clearTimeout(loadingFloor);
        }
        return;
      }

      const profile = await loadProfile(session.user.id);
      if (!mounted) return;

      if (profile && profile.is_active && profile.approval_status !== "rejected") {
        setUser(profile);
      } else if (profile && (!profile.is_active || profile.approval_status === "rejected")) {
        await supabase.auth.signOut();
        setUser(null);
      }
      // Transient profile fetch failure → leave user as-is, just stop loading.
      setIsLoading(false);
      clearTimeout(loadingFloor);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION — those re-fetches
      // race with the initial load and briefly null out the user (stale-session bug).
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        return;
      }
      if (event === "SIGNED_IN") {
        loadProfile(session.user.id).then((profile) => {
          if (!mounted) return;
          if (profile && profile.is_active && profile.approval_status !== "rejected") {
            setUser(profile);
          }
        });
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingFloor);
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  // Client-side route guidance; the server still enforces via proxy.ts.
  useEffect(() => {
    if (isLoading) return;
    if (
      user &&
      (pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password")
    ) {
      router.push("/dashboard");
    }
    if (!user && !isPublicRoute(pathname)) {
      router.push("/login");
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string; pending?: boolean }> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password,
        });
        if (error || !data.user) {
          setIsLoading(false);
          return { success: false, error: "Invalid email or password" };
        }

        const profile = await loadProfile(data.user.id);
        if (!profile || !profile.is_active) {
          await supabase.auth.signOut();
          setIsLoading(false);
          return { success: false, error: "Account disabled" };
        }
        if (profile.approval_status === "rejected") {
          await supabase.auth.signOut();
          setIsLoading(false);
          return { success: false, error: "Your membership request was rejected." };
        }
        if (profile.approval_status === "pending") {
          // Keep them signed in (Supabase session exists) but route
          // to the pending-approval page. The proxy + requireUser
          // will still block their access to protected APIs.
          setUser(profile);
          setIsLoading(false);
          router.push("/pending-approval");
          return { success: false, pending: true };
        }

        setUser(profile);
        setIsLoading(false);
        router.push("/dashboard");
        return { success: true };
      } catch {
        setIsLoading(false);
        return { success: false, error: "Network error" };
      }
    },
    [supabase, loadProfile, router]
  );

  const register = useCallback(
    async (
      regData: RegisterData
    ): Promise<{ success: boolean; error?: string; pending?: boolean }> => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regData),
        });
        const result = await res.json();
        if (!res.ok) {
          return { success: false, error: result.error || "Registration failed" };
        }

        // After server-side signup + profile creation, sign the user in
        // client-side so the cookie session is set.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: regData.email.toLowerCase().trim(),
          password: regData.password,
        });
        if (signInErr) {
          return { success: false, error: "Account created but login failed. Try logging in." };
        }

        if (result.pending) {
          await refresh();
          router.push("/pending-approval");
          return { success: false, pending: true, error: result.message };
        }

        await refresh();
        router.push("/dashboard");
        return { success: true };
      } catch {
        return { success: false, error: "Network error" };
      }
    },
    [supabase, refresh, router]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  }, [supabase, router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export type { Profile, UserRole };
