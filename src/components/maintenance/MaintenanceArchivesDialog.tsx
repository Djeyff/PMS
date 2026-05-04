import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, Folder, Images, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MaintenanceRow } from "@/services/maintenance";
import { downloadKDriveFile, listKDriveFolder } from "@/services/kdrive";
import { toast } from "sonner";

type KDriveItem = {
  name: string;
  href: string;
  type: "file" | "folder";
  size: number | null;
  modified: string | null;
  contentType: string | null;
};

type Props = {
  request: MaintenanceRow;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  compact?: boolean;
};

function cleanSegment(value: string) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function maintenanceDate(request: MaintenanceRow) {
  if (request.due_date) return request.due_date;
  const titleDate = request.title.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (titleDate) return titleDate;
  return request.created_at.slice(0, 10);
}

function titleWithoutDate(title: string) {
  return cleanSegment(
    title
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
      .replace(/[—–-]\s*$/g, "")
  );
}

function archivePathCandidates(request: MaintenanceRow) {
  const date = maintenanceDate(request);
  const propertyName = cleanSegment(request.property?.name ?? "");
  const shortTitle = titleWithoutDate(request.title);
  const haystack = normalize(`${request.title} ${propertyName}`);

  let clients = propertyName ? [propertyName] : [];
  let equipment = unique([shortTitle, propertyName].filter(Boolean));

  if (haystack.includes("sporting")) {
    clients = ["SportingClub LT", "SportingClub", ...clients];
    equipment = ["Generac SportingClub", "Generac Sporting Club", "SportingClub", "Planta SportingClub LT", ...equipment];
  } else if (haystack.includes("simone")) {
    clients = ["CaseDamare", ...clients];
    equipment = ["Generac Casa de Simone", "Casa de Simone", "Planta Casa de Simone", ...equipment];
  }

  const roots = ["Proyectos", "KaanAssist/Proyectos", ""];
  const paths: string[] = [];
  for (const root of roots) {
    for (const client of unique(clients.map(cleanSegment))) {
      for (const item of unique(equipment.map(cleanSegment))) {
        paths.push([root, client, "Mantenimiento", item, date].filter(Boolean).join("/"));
        paths.push([root, client, "Mantenimiento", item, "Fotos", date].filter(Boolean).join("/"));
        paths.push([root, client, item, "Mantenimiento", date].filter(Boolean).join("/"));
        paths.push([root, client, item, "Mantenimiento", "Fotos", date].filter(Boolean).join("/"));
      }
    }
  }
  return unique(paths);
}

function isImage(item: KDriveItem) {
  if (item.contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(item.name);
}

function formatBytes(size: number | null) {
  if (typeof size !== "number") return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const MaintenanceArchivesDialog = ({ request, size = "sm", variant = "outline", compact = false }: Props) => {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [items, setItems] = useState<KDriveItem[]>([]);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; image: boolean } | null>(null);

  const date = maintenanceDate(request);
  const candidates = useMemo(() => archivePathCandidates(request), [request]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      let firstEmpty: { path: string; items: KDriveItem[]; folderUrl: string | null } | null = null;
      let lastError: unknown = null;

      for (const candidate of candidates) {
        try {
          const res = await listKDriveFolder(candidate);
          const nextItems = (res.itemsFiltered ?? res.items ?? []) as KDriveItem[];
          const result = { path: candidate, items: nextItems, folderUrl: res.folderUrl ?? null };
          if (nextItems.length > 0) {
            if (!cancelled) {
              setPath(result.path);
              setItems(result.items);
              setFolderUrl(result.folderUrl);
            }
            return;
          }
          firstEmpty ??= result;
        } catch (err) {
          lastError = err;
        }
      }

      if (!cancelled) {
        if (firstEmpty) {
          setPath(firstEmpty.path);
          setItems([]);
          setFolderUrl(firstEmpty.folderUrl);
        } else {
          setPath(candidates[0] ?? "");
          setItems([]);
          setFolderUrl(null);
          setError(lastError instanceof Error ? lastError.message : "Archive folder not found.");
        }
      }
    };

    load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [candidates, open]);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  const loadPath = async (nextPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listKDriveFolder(nextPath);
      setPath(nextPath);
      setItems((res.itemsFiltered ?? res.items ?? []) as KDriveItem[]);
      setFolderUrl(res.folderUrl ?? null);
    } catch (err) {
      setError(errorMessage(err, "Folder not found."));
    } finally {
      setLoading(false);
    }
  };

  const goUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    if (parts.length) loadPath(parts.join("/"));
  };

  const openFile = async (item: KDriveItem) => {
    const rel = path ? `${path}/${item.name}` : item.name;
    setOpeningFile(item.name);
    try {
      const blob = await downloadKDriveFile(rel);
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: item.name, image: isImage(item) });
    } catch (err) {
      toast.error(errorMessage(err, "Failed to open archive"));
    } finally {
      setOpeningFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} title={`Archives ${date}`} aria-label={`Open archives for ${date}`}>
          <Images className={compact ? "h-4 w-4" : "mr-1 h-4 w-4"} />
          {compact ? null : "Archives"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
            Archives
            <Badge variant="secondary">{date}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{request.property?.name ?? request.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={goUp} disabled={loading || !path.includes("/")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Up
            </Button>
            <Button size="sm" variant="outline" onClick={() => loadPath(path || candidates[0] || "")} disabled={loading || (!path && !candidates.length)}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            {folderUrl ? (
              <Button size="sm" variant="outline" onClick={() => window.open(folderUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-1 h-4 w-4" />
                Folder
              </Button>
            ) : null}
            <div className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs text-muted-foreground">
              {path || "—"}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <ScrollArea className="h-[430px] rounded-md border">
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
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">No archives for this date.</TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => {
                      const folder = item.type === "folder";
                      return (
                        <TableRow key={item.href} className="cursor-pointer" onClick={() => (folder ? loadPath(`${path}/${item.name}`) : openFile(item))}>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              {folder ? <Folder className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                              <span className="truncate">{item.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{folder ? "Folder" : item.contentType ?? "File"}</TableCell>
                          <TableCell>{folder ? "—" : formatBytes(item.size)}</TableCell>
                          <TableCell>{item.modified ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex h-[430px] items-center justify-center rounded-md border bg-muted/20 p-2">
              {openingFile ? (
                <div className="text-sm text-muted-foreground">Opening {openingFile}...</div>
              ) : preview ? (
                preview.image ? (
                  <img src={preview.url} alt={preview.name} className="max-h-full max-w-full rounded object-contain" />
                ) : (
                  <iframe src={preview.url} title={preview.name} className="h-full w-full rounded border bg-background" />
                )
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <Images className="mx-auto mb-2 h-8 w-8" />
                  Select a photo or file
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MaintenanceArchivesDialog;
