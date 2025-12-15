import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { createAgency as createAgencyService } from "@/services/agencies";

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

  // Immediate role fallback for master email so UI doesn't bounce to Pending
  const role: Role | null = useMemo(() => {
    if (profile?.role) return profile.role;
    if ((user?.email?.toLowerCase() ?? "") === MASTER_ADMIN_EMAIL) return "agency_admin";
    return null;
  }, [profile?.role, user?.email]);

  const ensureMasterAdmin = async (u: User, current: Profile | null) => {
    const email = u.email?.toLowerCase() ?? "";
    if (email !== MASTER_ADMIN_EMAIL) return;

    // Upsert profile with admin role
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: u.id, role: "agency_admin" }, { onConflict: "id" });
    if (upsertErr) {
      console.warn("ensureMasterAdmin: upsert profile failed", upsertErr);
      return;
    }

    const latest = await fetchProfile(u.id).catch(() => null);
    if (!latest?.agency_id) {
      // Use service that tries edge function, then DB fallback
      try {
        await createAgencyService({ name: "Master Agency", default_currency: "USD" });
      } catch (e) {
        console.warn("ensureMasterAdmin: createAgency fallback path failed", e);
      }
    }

    const updated = await fetchProfile(u.id).catch(() => null);
    if (updated) setProfile(updated);
  };

  const ensureProfileRow = async (uid: string) => {
    // If the profile row doesn't exist, create a minimal one so RLS can work
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: uid }, { onConflict: "id" });
    if (error) {
      console.warn("ensureProfileRow: upsert failed", error);
      return false;
    }
    return true;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Fetch initial session immediately
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;

      if (!active) return;
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user?.id) {
        let p = await fetchProfile(sess.user.id).catch(() => null);
        if (!active) return;

        if (!p) {
          // Create missing profile and re-fetch
          await ensureProfileRow(sess.user.id);
          p = await fetchProfile(sess.user.id).catch(() => null);
        }

        setProfile(p);

        // Bootstrap admin in background and refresh profile once
        ensureMasterAdmin(sess.user, p ?? null).then(() => {
          if (active) refreshProfile().catch(() => {});
        });
      } else {
        setProfile(null);
      }

      // Initial session resolved → stop loading
      if (active) setLoading(false);
    })();

    // Subscribe to further auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (!active) return;

      setSession(sess ?? null);
      setUser(sess?.user ?? null);

      if (sess?.user?.id) {
        let p = await fetchProfile(sess.user.id).catch(() => null);
        if (!active) return;

        if (!p) {
          // Create missing profile and re-fetch
          await ensureProfileRow(sess.user.id);
          p = await fetchProfile(sess.user.id).catch(() => null);
        }

        setProfile(p);

        ensureMasterAdmin(sess.user, p ?? null).then(() => {
          if (active) refreshProfile().catch(() => {});
        });
      } else {
        setProfile(null);
      }

      // Any auth event should clear loading
      setLoading(false);
    });

    return () => {
      active = false;
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
    role,
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