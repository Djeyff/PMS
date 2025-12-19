import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadLeaseContractToKDrive } from "@/services/kdrive";
import { toast } from "sonner";

type Props = {
  leaseId: string;
  targetFolderUrl?: string | null;
  onUploaded: (fileUrl: string, folderUrl?: string | null) => void;
};

const KDriveUploader: React.FC<Props> = ({ leaseId, targetFolderUrl, onUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const onUpload = async () => {
    if (!file) {
      toast.error("Select a file");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadLeaseContractToKDrive({
        leaseId,
        file,
        targetFolder: targetFolderUrl ?? null,
      });
      toast.success("Uploaded to kDrive");
      onUploaded(res.fileUrl, res.folderUrl ?? undefined);
      setFile(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 border rounded-md p-3">
      <Label>Upload contract to kDrive</Label>
      <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="text-xs text-muted-foreground">PDF recommended. Small files upload faster.</div>
      <Button onClick={onUpload} disabled={uploading || !file}>
        {uploading ? "Uploading..." : "Upload to kDrive"}
      </Button>
    </div>
  );
};

export default KDriveUploader;