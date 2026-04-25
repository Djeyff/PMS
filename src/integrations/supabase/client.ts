import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://cbzhxbpccijwgazwpayi.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY for Supabase client.");
}

export const supabaseFunctionUrl = (name: string) =>
  `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Return a client that always sends the Authorization header (if provided)
export const getAuthedClient = (accessToken: string | null | undefined) => {
  if (!accessToken) return supabase;
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
};
