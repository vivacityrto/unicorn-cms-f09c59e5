import { useMemo, useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, ExternalLink, Loader2, Search, ScrollText, ChevronUp } from "lucide-react";

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
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category_label && set.add(r.category_label));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, debouncedSearch, categoryFilter, frameworkFilter]);

  const filtersActive =
    search !== "" || categoryFilter !== "all" || frameworkFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setFrameworkFilter("all");
  };

  const handleView = (row: GovernanceDocRow) => {
    if (!row.file_path) return;
    const viewUrl = row.file_path.replace("action=default", "action=view");
    window.open(viewUrl, "_blank", "noopener,noreferrer");
  };

  const handleOpenSharePointFolder = async (row: GovernanceDocRow) => {
    if (!row.file_path) return;
    setOpeningSharePointId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-sharepoint-parent-folder", {
        body: { file_url: row.file_path, tenant_id: activeTenantId },
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
              {isLoading ? (
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
                      <div className="flex justify-end gap-2">
                        {row.file_path ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleView(row)}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="sm" variant="outline" disabled>
                                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                                  View
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>File not available</TooltipContent>
                          </Tooltip>
                        )}
                        {row.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenSharePointFolder(row)}
                            disabled={openingSharePointId === row.id}
                          >
                            {openingSharePointId === row.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            SharePoint
                          </Button>
                        )}

                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
        className={`fixed bottom-6 right-6 z-50 rounded-full shadow-md transition-opacity duration-300 ${
          showScrollTop ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
    </TooltipProvider>
  );
}
