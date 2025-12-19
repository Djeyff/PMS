import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLocationGroups, createLocationGroup, type LocationGroup } from "@/services/property-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Props = {
  agencyId: string;
  value: string;
  onChange: (next: string) => void;
  allowCreate?: boolean;
};

const GroupPicker: React.FC<Props> = ({ agencyId, value, onChange, allowCreate = true }) => {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["location-groups", agencyId],
    enabled: !!agencyId,
    queryFn: () => fetchLocationGroups(agencyId),
  });

  const groups = useMemo(() => (data ?? []) as LocationGroup[], [data]);

  const [newName, setNewName] = useState("");

  const createMut = useMutation({
    mutationFn: (name: string) => createLocationGroup({ agencyId, name }),
    onSuccess: (row) => {
      toast.success("Folder created");
      qc.invalidateQueries({ queryKey: ["location-groups", agencyId] });
      onChange(row.name);
      setNewName("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create folder"),
  });

  return (
    <div className="space-y-2">
      <Label>Folder / Location Group</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., Beachfront, Downtown, LT/Coson"
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">Choose</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuLabel>Folders</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {groups.length === 0 ? (
              <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
            ) : (
              groups.map((g) => (
                <DropdownMenuItem key={g.id} onClick={() => onChange(g.name)}>
                  {g.name}
                </DropdownMenuItem>
              ))
            )}
            {allowCreate && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-2 space-y-2">
                  <Label className="text-xs">Create new folder</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Folder name"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const name = newName.trim();
                      if (!name) {
                        toast.error("Enter a folder name");
                        return;
                      }
                      createMut.mutate(name);
                    }}
                  >
                    Create
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-xs text-muted-foreground">Type a new name or pick from created folders.</div>
    </div>
  );
};

export default GroupPicker;