import React, { useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchUsersForAdmin,
  setUserRoleServer,
  updateUserRoleAndAgency,
  type UserRow,
} from "@/services/users";
import { assignUserByEmail } from "@/services/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Role = "agency_admin" | "owner" | "tenant";

type PendingChange = {
  user: UserRow;
  nextRole: Role;
};

const Users = () => {
  const { role: myRole, profile } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const agencyId = profile?.agency_id ?? null;
  const isAdmin = myRole === "agency_admin";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [change, setChange] = useState<PendingChange | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const isAgencyAdminChange = !!change && (change.user.role === "agency_admin" || change.nextRole === "agency_admin");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsersForAdmin,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: async (input: { user: UserRow; role: Role }) => {
      if (!agencyId) throw new Error("Set up your agency in Settings first.");

      // Safety: prevent self-demotion from inside the app
      if (input.user.id === profile?.id && input.role !== "agency_admin") {
        throw new Error("You cannot remove your own Agency Admin role from the app.");
      }

      setPending(input.user.id);

      // Use the secure server workflow for any change involving agency_admin
      if (input.role === "agency_admin" || input.user.role === "agency_admin") {
        return setUserRoleServer({ userId: input.user.id, role: input.role });
      }

      // Default: owner/tenant assignment via client (RLS enforced)
      return updateUserRoleAndAgency({ userId: input.user.id, role: input.role, agencyId });
    },
    onSuccess: () => {
      toast.success("User role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Failed to update user");
    },
    onSettled: () => {
      setPending(null);
      setConfirmText("");
      setChange(null);
      setConfirmOpen(false);
    },
  });

  const rows = useMemo(() => (data ?? []) as UserRow[], [data]);
  const pendingRows = useMemo(() => rows.filter((u) => !u.role || !u.agency_id), [rows]);

  const openConfirm = (user: UserRow, nextRole: Role) => {
    setChange({ user, nextRole });
    setConfirmText("");
    setConfirmOpen(true);
  };

  const canProceed = !isAgencyAdminChange || confirmText.trim().toUpperCase() === "CONFIRM";

  const roleLabel = (r: string | null) => (r ? r.replace("_", " ") : "pending");

  const DisplayName = (u: UserRow) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "—";

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Users</h1>
          {!agencyId && <div className="text-sm text-muted-foreground">You must set up your agency in Settings first.</div>}
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm role change</AlertDialogTitle>
              <AlertDialogDescription>
                {change ? (
                  <div className="space-y-2">
                    <div>
                      You are about to change <span className="font-medium">{DisplayName(change.user)}</span> from{" "}
                      <span className="font-medium capitalize">{roleLabel(change.user.role)}</span> to{" "}
                      <span className="font-medium capitalize">{roleLabel(change.nextRole)}</span>.
                    </div>
                    {isAgencyAdminChange ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100">
                        <div className="font-medium">This affects Agency Admin access.</div>
                        <div className="text-sm opacity-90">
                          To avoid lockouts, type <span className="font-mono">CONFIRM</span> below.
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {isAgencyAdminChange ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Type CONFIRM to continue</div>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" />
              </div>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending === change?.user.id}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!change || pending === change?.user.id || !canProceed}
                onClick={() => {
                  if (!change) return;
                  mutation.mutate({ user: change.user, role: change.nextRole });
                }}
              >
                {pending === change?.user.id ? "Saving..." : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                    <TableHead>Name</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{DisplayName(u)}</TableCell>
                      <TableCell>{u.agency_id ? "Assigned" : "Unassigned"}</TableCell>
                      <TableCell className="capitalize">{u.role ?? "pending"}</TableCell>
                      <TableCell className="space-x-2">
                        <Select
                          value={(u.role ?? "pending") as any}
                          onValueChange={(v) => {
                            if (v === "pending") return;
                            openConfirm(u, v as Role);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Set role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="tenant">Tenant</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="agency_admin">Agency Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const nextRole: Role = (u.role === "owner" || u.role === "tenant" || u.role === "agency_admin")
                              ? (u.role as Role)
                              : "tenant";
                            openConfirm(u, nextRole);
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
                        <div className="font-medium">{DisplayName(u)}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{u.email ?? "—"}</TableCell>
                      <TableCell className="capitalize">{u.role ? u.role : "pending"}</TableCell>
                      <TableCell className="space-x-2">
                        <Select
                          value={(u.role ?? "pending") as any}
                          onValueChange={(v) => {
                            if (v === "pending") return;
                            openConfirm(u, v as Role);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Set role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="tenant">Tenant</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="agency_admin">Agency Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const nextRole: Role = (u.role === "owner" || u.role === "tenant" || u.role === "agency_admin")
                              ? (u.role as Role)
                              : "tenant";
                            openConfirm(u, nextRole);
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
            <AssignByEmail agencyReady={!!agencyId} onDone={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

function AssignByEmail({
  agencyReady,
  onDone,
}: {
  agencyReady: boolean;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tenant" | "owner">("tenant");
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[2fr,1fr,auto] items-end">
      <div>
        <div className="text-sm text-muted-foreground">User email</div>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Role</div>
        <Select value={role} onValueChange={(v) => setRole(v as any)}>
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
        disabled={!agencyReady || saving}
        onClick={async () => {
          const v = email.trim();
          if (!v) {
            toast.error("Please enter an email");
            return;
          }
          setSaving(true);
          try {
            await assignUserByEmail({ email: v, role });
            toast.success("User assigned to your agency");
            setEmail("");
            onDone();
          } catch (e: any) {
            toast.error(e?.message ?? "Failed to assign user");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Assigning..." : "Assign by email"}
      </Button>
    </div>
  );
}

export default Users;