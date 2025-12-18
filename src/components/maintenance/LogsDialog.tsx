import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { fetchMaintenanceLogs, addMaintenanceLog, MaintenanceRow } from "@/services/maintenance";
import { toast } from "sonner";
import { formatDateTimeInTZ } from "@/utils/datetime";
import DeleteMaintenanceLogDialog from "./DeleteMaintenanceLogDialog";

const LogsDialog = ({ request, tz, onUpdated }: { request: MaintenanceRow; tz?: string; onUpdated?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["maint-logs", request.id],
    enabled: open,
    queryFn: () => fetchMaintenanceLogs(request.id),
  });

  const onAdd = async () => {
    if (!note.trim()) {
      toast.error("Please write a note");
      return;
    }
    setSaving(true);
    try {
      await addMaintenanceLog(request.id, note.trim());
      setNote("");
      await refetch();
      toast.success("Note added");
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNote(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Log</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maintenance Log</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-64 overflow-y-auto border rounded">
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">Loading...</div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No notes yet.</div>
            ) : (
              <ul className="divide-y">
                {(data ?? []).map((l) => {
                  const author = [l.user?.first_name ?? "", l.user?.last_name ?? ""].filter(Boolean).join(" ") || "—";
                  const when = tz ? formatDateTimeInTZ(l.created_at, tz) : new Date(l.created_at).toISOString().slice(0, 16).replace("T", " ");
                  return (
                    <li key={l.id} className="p-3 text-sm">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{author}</span>
                        <span>{when}</span>
                      </div>
                      <div className="mt-1">{l.note}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a progress note..." />
            <div className="flex justify-end">
              <Button size="sm" onClick={onAdd} disabled={saving}>{saving ? "Saving..." : "Add note"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogsDialog;