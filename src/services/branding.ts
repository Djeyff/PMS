import { supabase } from "@/integrations/supabase/client";

const BUCKET = "branding";

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b: any) => b.name === BUCKET);
  if (!exists) {
    // Create as PRIVATE bucket instead of public
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

export async function uploadLogo(file: File) {
  await ensureBucket();
  const path = "logo.png";
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw error;
  return true;
}

export async function getLogoPublicUrl() {
  await ensureBucket();
  // If the bucket is private, this returns a non-accessible URL; callers should switch to signed URLs if needed.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("logo.png");
  return data.publicUrl;
}

export async function uploadFavicon(file: File) {
  await ensureBucket();
  const path = "favicon.png";
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw error;
  return true;
}

export async function getFaviconPublicUrl() {
  await ensureBucket();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("favicon.png");
  return data.publicUrl;
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