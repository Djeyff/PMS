import { supabase } from "@/integrations/supabase/client";

// Helper: file to base64 (no data URL prefix)
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  // btoa is available in browsers
  return btoa(binary)
}

export async function uploadLogo(file: File) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) throw new Error("Not authenticated")

  const base64 = await fileToBase64(file)
  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/branding-upload"
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "logo", contentType: file.type || "image/png", content: base64 })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Upload failed (${res.status})`)
  }
  return true
}

export async function getLogoPublicUrl() {
  // Return public URL (bucket is set to public by the edge function)
  const { data } = supabase.storage.from("branding").getPublicUrl("logo.png")
  return data.publicUrl
}

export async function uploadFavicon(file: File) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) throw new Error("Not authenticated")

  const base64 = await fileToBase64(file)
  const url = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/branding-upload"
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "favicon", contentType: file.type || "image/png", content: base64 })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Upload failed (${res.status})`)
  }
  return true
}

export async function getFaviconPublicUrl() {
  const { data } = supabase.storage.from("branding").getPublicUrl("favicon.png")
  return data.publicUrl
}

export function applyFavicon(url: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = url.endsWith(".ico") ? "image/x-icon" : "image/png";
  link.href = url;
}