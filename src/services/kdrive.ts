import { supabase } from "@/integrations/supabase/client";

const KDRIVE_UPLOAD_URL = "https://tsfswvmwkfairaoccfqa.supabase.co/functions/v1/kdrive-upload";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uploadLeaseContractToKDrive(params: {
  leaseId: string;
  file: File;
  targetFolder?: string | null;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const ab = await params.file.arrayBuffer();
  const base64 = toBase64(new Uint8Array(ab));

  const res = await fetch(KDRIVE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      leaseId: params.leaseId,
      fileName: params.file.name,
      mimeType: params.file.type || "application/octet-stream",
      fileBase64: base64,
      targetFolder: params.targetFolder ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `kDrive upload failed (${res.status})`);
  }
  return (await res.json()) as { ok: true; fileUrl: string; folderUrl?: string | null };
}