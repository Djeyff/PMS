import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

type Props = {
  bucket?: string;
  onUploadSuccess?: (path: string) => void;
};

const FileUploader: React.FC<Props> = ({ bucket = "uploads", onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const path = `${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
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
      <div className="text-sm font-medium">Test File Upload</div>
      <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Button onClick={handleUpload} disabled={uploading || !file}>
        {uploading ? "Uploading..." : "Upload File"}
      </Button>
    </div>
  );
};

export default FileUploader;