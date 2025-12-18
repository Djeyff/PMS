import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMaintenanceLogs } from "@/services/maintenance";

const fmt = (d: string) => new Date(d).toISOString().slice(0, 19).replace("T", " ");

const MaintenanceHistoryInline = ({ requestId }: { requestId: string }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity-maint-logs", requestId],
    queryFn: () => fetchMaintenanceLogs(requestId),
  });

  if (error) {
    return <div className="text-sm text-red-600 mt-2">Failed to load maintenance history.</div>;
  }
  if (isLoading) {
    return <div className="text-sm text-muted-foreground mt-2">Loading maintenance history...</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted-foreground mt-2">No maintenance log entries.</div>;
  }

  return (
    <div className="mt-2 border rounded p-2 bg-muted/30">
      <div className="text-sm font-medium mb-2">Maintenance Log History</div>
      <ul className="space-y-2">
        {data.map((l: any) => {
          const user = [l.user?.first_name ?? "", l.user?.last_name ?? ""].filter(Boolean).join(" ") || "—";
          return (
            <li key={l.id} className="text-sm">
              <div className="text-xs text-muted-foreground mb-1">
                {fmt(l.created_at)} — {user}
              </div>
              <div>{l.note}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default MaintenanceHistoryInline;