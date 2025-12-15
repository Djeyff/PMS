import { supabase } from "@/integrations/supabase/client";

const BUCKET = "branding";

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b: any) => b.name === BUCKET);
  if (!exists) {
    // Create as private bucket
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

// For private buckets, callers should request a signed URL from a secure context.
// This helper returns a short-lived signed URL for authenticated users.
export async function getLogoSignedUrl() {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl("logo.png", 60 * 15);
  if (error) throw error;
  return data.signedUrl;
}