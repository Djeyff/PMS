import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsersForAdmin, updateUserRoleAndAgency, type UserRow } from "@/services/users";
import { assignUserByEmail } from "@/services/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Users = () => {
  const { role: myRole, profile } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const agencyId = profile?.agency_id ?? null;
  const isAdmin = myRole === "agency_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsersForAdmin,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: (input: { userId: string; role: "agency_admin" | "owner" | "tenant" }) => {
      if (!agencyId) throw new Error("Set up your agency in Settings first.");
      setPending(input.userId);
      return updateUserRoleAndAgency({ userId: input.userId, role: input.role, agencyId });
    },
    onSuccess: () => {
      toast.success("User role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Failed to update user");
    },
    onSettled: () => setPending(null),
  });

  const rows = useMemo(() => (data ?? []) as UserRow[], [data]);
  const pendingRows = useMemo(
    () => rows.filter((u) => !u.role || !u.agency_id),
    [rows]
  );

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Users</h1>
          {!agencyId && (
            <div className="text-sm text-muted-foreground">You must set up your agency in Settings first.</div>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No users found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.id}</TableCell>
                      <TableCell>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>{u.agency_id ? "Assigned" : "Unassigned"}</TableCell>
                      <TableCell className="capitalize">{u.role ?? "pending"}</TableCell>
                      <TableCell className="space-x-2">
                        <Select
                          value={u.role ?? "pending"}
                          onValueChange={(v) => {
                            if (v === "pending") return;
                            // Only allow 'owner' or 'tenant' from client-side
                            if (v === "agency_admin") {
                              toast.error("Assigning Agency Admin must be done through a secure server workflow.");
                              return;
                            }
                            mutation.mutate({ userId: u.id, role: v as "owner" | "tenant" });
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Set role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="tenant">Tenant</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const nextRole = u.role === "owner" || u.role === "tenant" ? u.role : "tenant";
                            mutation.mutate({ userId: u.id, role: nextRole });
                          }}
                          disabled={!agencyId || pending === u.id}
                        >
                          {pending === u.id ? "Saving..." : "Assign to my agency"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {/* Pending Approval subsection */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : pendingRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pending users.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assign</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRows.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{u.id}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {u.email ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize">{u.role ? u.role : "pending"}</TableCell>
                      <TableCell className="space-x-2">
                        <Select
                          value={u.role ?? "pending"}
                          onValueChange={(v) => {
                            if (v === "pending") return;
                            if (v === "agency_admin") {
                              toast.error("Assigning Agency Admin must be done through a secure server workflow.");
                              return;
                            }
                            mutation.mutate({ userId: u.id, role: v as "owner" | "tenant" });
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Set role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="tenant">Tenant</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const nextRole = u.role === "owner" || u.role === "tenant" ? u.role : "tenant";
                            mutation.mutate({ userId: u.id, role: nextRole });
                          }}
                          disabled={!agencyId || pending === u.id}
                        >
                          {pending === u.id ? "Saving..." : "Assign to my agency"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {/* Assign user by email (for users not visible due to security) */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[2fr,1fr,auto] items-end">
              <div>
                <div className="text-sm text-muted-foreground">User email</div>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="user@example.com"
                  id="assign-email"
                />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Role</div>
                <Select defaultValue="tenant">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  const emailInput = document.getElementById("assign-email") as HTMLInputElement | null;
                  const roleTrigger = document.querySelector("[aria-expanded]") as HTMLElement | null;
                  const email = (emailInput?.value || "").trim();
                  // Fallback: read role value from the Select by inspecting the trigger text
                  const roleText = roleTrigger?.querySelector("[data-placeholder]")?.textContent || "Tenant";
                  const role = roleText.toLowerCase() === "owner" ? "owner" : "tenant";
                  if (!email) {
                    toast.error("Please enter an email");
                    return;
                  }
                  try {
                    await assignUserByEmail({ email, role: role as "owner" | "tenant" });
                    toast.success("User assigned to your agency");
                    qc.invalidateQueries({ queryKey: ["admin-users"] });
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed to assign user");
                  }
                }}
                disabled={!agencyId}
              >
                Assign by email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Users;