import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadGenericToKDrive } from "@/services/kdrive";
import { toast } from "sonner";

const KDriveFolderUploader = ({ currentPath, onUploaded }: { currentPath: string; onUploaded?: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const onUpload = async () => {
    if (!file) {
      toast.error("Select a file");
      return;
    }
    setUploading(true);
    try {
      await uploadGenericToKDrive(file, currentPath);
      toast.success("Uploaded to kDrive");
      setFile(null);
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 border rounded-md p-3">
      <Label>Upload to current folder</Label>
      <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="text-xs text-muted-foreground">PDF recommended. Small files upload faster.</div>
      <Button onClick={onUpload} disabled={uploading || !file}>
        {uploading ? "Uploading..." : "Upload"}
      </Button>
    </div>
  );
};

export default KDriveFolderUploader;