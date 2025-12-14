import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "agency_admin" | "owner" | "tenant";
export type Profile = {
  id: string;
  role: Role | null;
  agency_id: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();
  if (error) {
    if ((error as any).code === "PGRST116") return null;
    throw error;
  }
  return data as Profile;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

  // Compute role with a client-side fallback for the master email
  const computedRole: Role | null = useMemo(() => {
    if (profile?.role) return profile.role;
    if ((user?.email?.toLowerCase() ?? "") === MASTER_ADMIN_EMAIL) return "agency_admin";
    return null;
  }, [profile?.role, user?.email]);

  const ensureMasterAdmin = async (u: User, current: Profile | null) => {
    const email = u.email?.toLowerCase() ?? "";
    if (email !== MASTER_ADMIN_EMAIL) return;

    // Ensure profile exists with admin role
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: u.id, role: "agency_admin" }, { onConflict: "id" });
    if (upsertErr) {
      console.warn("ensureMasterAdmin: upsert profile failed", upsertErr);
      return;
    }

    const latest = await fetchProfile(u.id).catch(() => null);
    let agencyId = latest?.agency_id ?? null;

    if (!agencyId) {
      // Use edge function (direct fetch) to avoid RLS issues
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        const res = await fetch("https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/create-agency", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Master Agency", default_currency: "USD" }),
        }).catch((e) => {
          console.warn("ensureMasterAdmin: edge fetch failed", e);
          return null;
        });
        if (res && !res.ok) {
          const err = await res.json().catch(() => ({} as any));
          console.warn("ensureMasterAdmin: create-agency response error", err);
        }
      }
    }

    const updated = await fetchProfile(u.id).catch(() => null);
    if (updated) setProfile(updated);
  };

  const loadSessionAndProfile = async () => {
    const { data } = await supabase.auth.getSession();
    const sess = data.session ?? null;
    setSession(sess);
    setUser(sess?.user ?? null);
    if (sess?.user?.id) {
      const p = await fetchProfile(sess.user.id).catch(() => null);
      setProfile(p);
      await ensureMasterAdmin(sess.user, p ?? null);
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await loadSessionAndProfile();
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess ?? null);
      setUser(sess?.user ?? null);
      if (sess?.user?.id) {
        const p = await fetchProfile(sess.user.id).catch(() => null);
        setProfile(p);
        await ensureMasterAdmin(sess.user, p ?? null);
      } else {
        setProfile(null);
      }
    });

    // Fallback: ensure loading doesn't remain true due to unexpected delays
    const loadingFallback = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(loadingFallback);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    const p = await fetchProfile(user.id).catch(() => null);
    setProfile(p);
  };

  const value: AuthContextValue = {
    session,
    user,
    profile,
    role: computedRole,
    loading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};