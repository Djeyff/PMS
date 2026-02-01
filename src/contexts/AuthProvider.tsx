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
  providerToken: string | null; // NEW: Google provider token from OAuth
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

const normalizeEmail = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

const fetchProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, agency_id, first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();

  if (error) {
    // "No rows" from PostgREST
    if ((error as any).code === "PGRST116") return null;
    throw error;
  }

  return data as Profile;
};

const applyMasterAdminFallback = (params: {
  user: User | null;
  profile: Profile | null;
}): Profile | null => {
  const email = normalizeEmail(params.user?.email);
  if (email !== MASTER_ADMIN_EMAIL) return params.profile;

  // Ensure master admin never ends up in the "pending" role-less state due to
  // transient profile fetch issues.
  if (!params.profile) {
    return {
      id: params.user?.id ?? "master-admin",
      role: "agency_admin",
      agency_id: null,
      first_name: null,
      last_name: null,
      avatar_url: null,
    };
  }

  if (!params.profile.role) {
    return { ...params.profile, role: "agency_admin" };
  }

  return params.profile;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerToken, setProviderToken] = useState<string | null>(null);

  const role: Role | null = useMemo(() => {
    return profile?.role ?? null;
  }, [profile?.role]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;
      const nextUser = sess?.user ?? null;

      if (!mounted) return;

      setSession(sess);
      setUser(nextUser);
      setProviderToken((sess as any)?.provider_token ?? null);

      if (!nextUser?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const p = await fetchProfile(nextUser.id).catch(() => null);
      if (!mounted) return;
      setProfile(applyMasterAdminFallback({ user: nextUser, profile: p }));
      setLoading(false);
    };

    load().catch(() => {
      if (!mounted) return;
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (!mounted) return;

      setLoading(true);

      const nextSession = sess ?? null;
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      setProviderToken((nextSession as any)?.provider_token ?? null);

      if (!nextUser?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const p = await fetchProfile(nextUser.id).catch(() => null);
      if (!mounted) return;
      setProfile(applyMasterAdminFallback({ user: nextUser, profile: p }));
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProviderToken(null);
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    const p = await fetchProfile(user.id).catch(() => null);
    setProfile(applyMasterAdminFallback({ user, profile: p }));
  };

  const value: AuthContextValue = {
    session,
    user,
    profile,
    role,
    loading,
    signOut,
    refreshProfile,
    providerToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};