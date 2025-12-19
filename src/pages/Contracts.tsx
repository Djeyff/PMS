import React, { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { listKDriveFolder, downloadKDriveFile } from "@/services/kdrive";
import { toast } from "sonner";
import { Folder, FileText, ArrowLeft } from "lucide-react";
import KDriveFolderUploader from "@/components/kdrive/KDriveFolderUploader.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Contracts = () => {
  const { role } = useAuth();
  const isAdmin = role === "agency_admin";

  const [path, setPath] = useState<string>("");
  const [pendingPath, setPendingPath] = useState<string>("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["kdrive-list", path],
    queryFn: () => listKDriveFolder(path),
    enabled: isAdmin,
  });

  useEffect(() => {
    setPendingPath(path);
  }, [path]);

  const items = useMemo(() => (data?.itemsFiltered ?? data?.items ?? []) as Array<any>, [data]);
  const crumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const acc: Array<{ label: string; to: string }> = [];
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      acc.push({ label: p, to: cur });
    }
    return acc;
  }, [path]);

  const openFile = async (name: string) => {
    try {
      const rel = path ? `${path}/${name}` : name;
      const blob = await downloadKDriveFile(rel);
      const url = URL.createObjectURL(blob);
      setViewerUrl(url);
      setViewerOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open file");
    }
  };

  const navigateTo = (sub: string) => {
    const next = path ? `${path}/${sub}` : sub;
    setPath(next);
  };

  const goUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.join("/"));
  };

  if (!isAdmin) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Only agency admins can access contracts.</CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Contracts</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>{isLoading ? "Refreshing..." : "Refresh"}</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Folder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); setPath(""); }}>Root</BreadcrumbLink>
                </BreadcrumbItem>
                {crumbs.map((c, idx) => (
                  <React.Fragment key={c.to}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {idx === crumbs.length - 1 ? (
                        <BreadcrumbPage>{c.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); setPath(c.to); }}>{c.label}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goUp} disabled={!path}><ArrowLeft className="h-4 w-4 mr-1" />Up</Button>
              <Input
                value={pendingPath}
                onChange={(e) => setPendingPath(e.target.value)}
                placeholder="sub/folder"
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={() => setPath(pendingPath.trim())}
              >
                Go
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ScrollArea className="h-[360px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Modified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Empty folder.</TableCell></TableRow>
                    ) : (
                      items.map((it) => {
                        const isFolder = it.type === "folder";
                        return (
                          <TableRow key={it.href} className="cursor-pointer" onClick={() => (isFolder ? navigateTo(it.name) : openFile(it.name))}>
                            <TableCell className="flex items-center gap-2">
                              {isFolder ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              <span className="truncate">{it.name}</span>
                            </TableCell>
                            <TableCell>{isFolder ? "Folder" : (it.contentType || "File")}</TableCell>
                            <TableCell>{isFolder ? "—" : (typeof it.size === "number" ? `${it.size} B` : "—")}</TableCell>
                            <TableCell>{it.modified ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="space-y-3">
                <KDriveFolderUploader currentPath={path} onUploaded={() => refetch()} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Preview</DialogTitle>
            </DialogHeader>
            <div className="h-[70vh]">
              {viewerUrl ? (
                <iframe src={viewerUrl} className="w-full h-full rounded border" title="Preview" />
              ) : (
                <div className="text-sm text-muted-foreground">No preview available.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
};

export default Contracts;