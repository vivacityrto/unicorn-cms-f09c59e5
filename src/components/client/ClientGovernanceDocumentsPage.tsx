import { useMemo, useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, ExternalLink, Loader2, Search, ScrollText } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GovernanceDocRow {
  id: string;
  generated_at: string | null;
  file_path: string | null;
  file_name: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  framework_type: string | null;
  category_label: string | null;
  category_sort: number | null;
  framework_label: string | null;
  package_name: string | null;
}

interface FrameworkOption {
  value: string;
  label: string;
}

interface GovernanceQueryResult {
  rows: GovernanceDocRow[];
  frameworks: FrameworkOption[];
}


function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function extractFileName(url: string | null): string | null {
  if (!url) return null;
  try {
    const name = new URL(url).searchParams.get("file");
    return name ? name.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function ClientGovernanceDocumentsPage() {
  const { activeTenantId, canManagePortalUsers, isPreview } = useClientTenant();
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const canAccess = canManagePortalUsers || isPreview || isSuperAdmin();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [frameworkFilter, setFrameworkFilter] = useState<string>("all");
  const [openingSharePointId, setOpeningSharePointId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search, 250);

  const { data, isLoading } = useQuery({
    queryKey: ["client-governance-documents-v5", activeTenantId],
    enabled: !!activeTenantId && canAccess,
    queryFn: async (): Promise<GovernanceQueryResult> => {
      const [vRes, catRes, fwRes] = await Promise.all([
        (supabase as any)
          .from("v_client_governance_documents")
          .select(
            "id, document_id, generationdate, generated_file_url, document_title, doc_title, description, category, framework_type, active_package_names"
          )
          .eq("tenant_id", activeTenantId)
          .eq("status", "generated"),
        supabase.from("dd_document_categories").select("value, label, sort_order"),
        supabase.from("dd_governance_framework").select("value, label"),
      ]);

      if (vRes.error) throw vRes.error;

      const catMap = new Map<string, { label: string; sort_order: number | null }>();
      (catRes.data || []).forEach((c: any) =>
        catMap.set(c.value, { label: c.label, sort_order: c.sort_order ?? null })
      );
      const fwMap = new Map<string, string>();
      (fwRes.data || []).forEach((f: any) => fwMap.set(f.value, f.label));

      const frameworks: FrameworkOption[] = (fwRes.data || [])
        .map((f: any) => ({ value: f.value as string, label: f.label as string }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const rows: GovernanceDocRow[] = (vRes.data || []).map((r: any) => {
        const cat = r.category ? catMap.get(r.category) : undefined;
        const fwLabel = r.framework_type
          ? fwMap.get(r.framework_type) ?? r.framework_type
          : null;
        const title = r.document_title ?? r.doc_title ?? null;
        return {
          id: String(r.id),
          generated_at: r.generationdate,
          file_path: r.generated_file_url ?? null,
          file_name: title,
          title,
          description: r.description ?? null,
          category: r.category ?? null,
          framework_type: r.framework_type ?? null,
          category_label: cat?.label ?? null,
          category_sort: cat?.sort_order ?? null,
          framework_label: fwLabel,
          package_name: r.active_package_names ?? null,
        };
      });

      rows.sort((a, b) => {
        const sa = a.category_sort ?? Number.MAX_SAFE_INTEGER;
        const sb = b.category_sort ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return (a.title ?? "").localeCompare(b.title ?? "");
      });

      return { rows, frameworks };
    },
  });

  const rows = data?.rows ?? [];
  const frameworkOptions = data?.frameworks ?? [];

  // Build a lowercase {fileName: webUrl} map by browsing tenant SharePoint
  // -> shared folder -> "- Governance" subtree.
  const {
    data: sharePointMap,
    isLoading: sharePointLoading,
    isError: sharePointError,
  } = useQuery({
    queryKey: ["client-governance-sp-map", activeTenantId],
    enabled: !!activeTenantId && canAccess,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};

      const listChildren = async (folderId?: string) => {
        const { data, error } = await supabase.functions.invoke(
          "browse-sharepoint-folder",
          {
            body: {
              action: "list",
              tenant_id: activeTenantId,
              use_shared_folder: true,
              ...(folderId ? { folder_id: folderId } : {}),
            },
          }
        );
        if (error) throw error;
        return (data?.items ?? []) as Array<{
          id: string;
          name: string;
          is_folder: boolean;
          web_url: string;
        }>;
      };

      const topLevel = await listChildren();
      const governance = topLevel.find(
        (i) => i.is_folder && i.name.trim().toLowerCase() === "- governance"
      );
      if (!governance) return map;

      const walk = async (folderId: string, depth: number): Promise<void> => {
        if (depth > 5) return;
        const items = await listChildren(folderId);
        const folderTasks: Promise<void>[] = [];
        for (const item of items) {
          if (item.is_folder) {
            folderTasks.push(walk(item.id, depth + 1));
          } else if (item.web_url && item.name) {
            map[item.name.toLowerCase()] = item.web_url;
          }
        }
        await Promise.all(folderTasks);
      };

      await walk(governance.id, 0);
      return map;
    },
  });

  useEffect(() => {
    if (sharePointError) {
      toast({
        title: "Could not load SharePoint files",
        description: "Files may not yet be available.",
        variant: "destructive",
      });
    }
  }, [sharePointError, toast]);

  // Only show documents that actually have a matching file in SharePoint —
  // a generated-but-not-yet-synced record isn't useful to a client as a
  // disabled "View" button, so it shouldn't appear in the list at all.
  const availableRows = useMemo(() => {
    if (sharePointLoading) return [];
    return rows.filter((r) => {
      const fileName = extractFileName(r.file_path);
      return !!(fileName && sharePointMap && sharePointMap[fileName]);
    });
  }, [rows, sharePointMap, sharePointLoading]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    availableRows.forEach((r) => r.category_label && set.add(r.category_label));
    return Array.from(set).sort();
  }, [availableRows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return availableRows.filter((r) => {
      if (categoryFilter !== "all" && r.category_label !== categoryFilter)
        return false;
      if (frameworkFilter !== "all" && r.framework_type !== frameworkFilter)
        return false;
      if (!q) return true;
      const haystack = [
        r.title,
        r.description,
        r.category_label,
        r.framework_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [availableRows, debouncedSearch, categoryFilter, frameworkFilter]);

  const filtersActive =
    search !== "" || categoryFilter !== "all" || frameworkFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setFrameworkFilter("all");
  };

  const handleOpenSharePointFolder = async (rowId: string, spWebUrl: string) => {
    setOpeningSharePointId(rowId);
    try {
      const { data, error } = await supabase.functions.invoke("get-sharepoint-parent-folder", {
        body: { file_url: spWebUrl, tenant_id: activeTenantId },
      });
      if (error || !data?.folder_url) {
        throw new Error(error?.message ?? "No folder URL returned");
      }
      window.open(data.folder_url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Could not open SharePoint folder", variant: "destructive" });
    } finally {
      setOpeningSharePointId(null);
    }
  };

  if (!canAccess) {
    return <Navigate to="/client/home" replace />;
  }



  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Governance Documents
            </h1>
            <p className="text-sm text-muted-foreground">
              Documents generated for your organisation as part of your
              compliance package.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="All frameworks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All frameworks</SelectItem>
              {frameworkOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Framework</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || sharePointLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {rows.length === 0
                      ? "No governance documents have been generated for your organisation yet. These will appear here once your consultant has generated them as part of your package."
                      : availableRows.length === 0
                      ? "Your documents have been generated and are being synced — check back soon."
                      : "No governance documents found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.title ?? "—"}
                    </TableCell>
                    <TableCell>{row.category_label ?? "—"}</TableCell>
                    <TableCell>{row.framework_type ?? "—"}</TableCell>
                    <TableCell className="max-w-[280px]">
                      {row.description ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">
                              {row.description}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md whitespace-pre-wrap">
                            {row.description}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{row.package_name ?? "—"}</TableCell>
                    <TableCell>
                      {row.generated_at
                        ? format(new Date(row.generated_at), "dd MMMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        // Every row here already passed the availableRows filter above,
                        // so a match is expected — the null-check is just defensive.
                        const fileName = extractFileName(row.file_path);
                        const spWebUrl =
                          fileName && sharePointMap ? sharePointMap[fileName] ?? null : null;
                        if (!spWebUrl) return null;
                        return (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                window.open(spWebUrl, "_blank", "noopener,noreferrer")
                              }
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSharePointFolder(row.id, spWebUrl)}
                              disabled={openingSharePointId === row.id}
                            >
                              {openingSharePointId === row.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              SharePoint
                            </Button>
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
