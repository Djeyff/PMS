import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

type Props = {
  bucket?: string;
  onUploadSuccess?: (path: string) => void;
  allowedMimeTypes?: string[];
  maxSizeMB?: number;
};

const DEFAULT_ALLOWED = ["image/png", "image/jpeg", "application/pdf"];
const MAX_MB_DEFAULT = 10;

const FileUploader: React.FC<Props> = ({
  bucket = "uploads",
  onUploadSuccess,
  allowedMimeTypes = DEFAULT_ALLOWED,
  maxSizeMB = MAX_MB_DEFAULT,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const validateFile = (f: File) => {
    if (!allowedMimeTypes.includes(f.type)) {
      toast({ title: "Invalid file type", description: `Allowed: ${allowedMimeTypes.join(", ")}`, variant: "destructive" });
      return false;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (f.size > maxBytes) {
      toast({ title: "File too large", description: `Max size is ${maxSizeMB}MB`, variant: "destructive" });
      return false;
    }
    return true;
  };

  const sanitizeName = (name: string) => name.replace(/[^\w.\-]+/g, "_");

  const handleUpload = async () => {
    if (!file) return;
    if (!validateFile(file)) return;

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) {
      toast({ title: "Not signed in", description: "Please log in to upload files.", variant: "destructive" });
      return;
    }

    setUploading(true);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const safeName = sanitizeName(file.name);
    const path = `${userId}/${year}/${month}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });

    setUploading(false);

    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Upload successful", description: `Saved to ${bucket}/${path}` });
    if (onUploadSuccess && data?.path) onUploadSuccess(data.path);
  };

  return (
    <div className="p-4 border rounded-md space-y-3">
      <div className="text-sm font-medium">Secure File Upload</div>
      <Input
        type="file"
        accept={allowedMimeTypes.join(",")}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="text-xs text-muted-foreground">
        Allowed types: {allowedMimeTypes.join(", ")} • Max size: {maxSizeMB}MB
      </div>
      <Button onClick={handleUpload} disabled={uploading || !file}>
        {uploading ? "Uploading..." : "Upload File"}
      </Button>
    </div>
  );
};

export default FileUploader;