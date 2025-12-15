import { supabase } from "@/integrations/supabase/client";

const BUCKET = "branding";

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b: any) => b.name === BUCKET);
  if (!exists) {
    // Create as public bucket
    await supabase.storage.createBucket(BUCKET, { public: true });
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
  const { data } = supabase.storage.from(BUCKET).getPublicUrl("logo.png");
  return data.publicUrl;
}