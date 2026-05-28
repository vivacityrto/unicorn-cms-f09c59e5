import { useMemo, useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Search, ScrollText } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
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
import { useToast } from "@/hooks/use-toast";

const STORAGE_BUCKET = "document-files";

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
  const debouncedSearch = useDebounced(search, 250);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["client-governance-documents", activeTenantId],
    enabled: !!activeTenantId && canAccess,
    queryFn: async (): Promise<GovernanceDocRow[]> => {
      const [gdRes, catRes, fwRes] = await Promise.all([
        (supabase as any)
          .from("generated_documents")
          .select(
            `
            id,
            generated_at,
            file_path,
            file_name,
            source_document:documents!generated_documents_source_document_id_fkey (
              title,
              description,
              category,
              framework_type
            ),
            package:packages!generated_documents_package_id_fkey ( name )
          `
          )
          .eq("tenant_id", activeTenantId)
          .eq("status", "generated")
          .eq("is_client_visible", true),
        supabase.from("dd_document_categories").select("value, label, sort_order"),
        supabase.from("dd_governance_framework").select("value, label"),
      ]);

      if (gdRes.error) throw gdRes.error;

      const catMap = new Map<string, { label: string; sort_order: number | null }>();
      (catRes.data || []).forEach((c: any) =>
        catMap.set(c.value, { label: c.label, sort_order: c.sort_order ?? null })
      );
      const fwMap = new Map<string, string>();
      (fwRes.data || []).forEach((f: any) => fwMap.set(f.value, f.label));

      const mapped: GovernanceDocRow[] = (gdRes.data || []).map((r: any) => {
        const cat = r.source_document?.category
          ? catMap.get(r.source_document.category)
          : undefined;
        const fwLabel = r.source_document?.framework_type
          ? fwMap.get(r.source_document.framework_type) ?? r.source_document.framework_type
          : null;
        return {
          id: r.id,
          generated_at: r.generated_at,
          file_path: r.file_path,
          file_name: r.file_name,
          title: r.source_document?.title ?? null,
          description: r.source_document?.description ?? null,
          category: r.source_document?.category ?? null,
          framework_type: r.source_document?.framework_type ?? null,
          category_label: cat?.label ?? null,
          category_sort: cat?.sort_order ?? null,
          framework_label: fwLabel,
          package_name: r.package?.name ?? null,
        };
      });

      mapped.sort((a, b) => {
        const sa = a.category_sort ?? Number.MAX_SAFE_INTEGER;
        const sb = b.category_sort ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return (a.title ?? "").localeCompare(b.title ?? "");
      });

      return mapped;
    },
  });

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category_label && set.add(r.category_label));
    return Array.from(set).sort();
  }, [rows]);

  const frameworkOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.framework_label && set.add(r.framework_label));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category_label !== categoryFilter)
        return false;
      if (frameworkFilter !== "all" && r.framework_label !== frameworkFilter)
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

  const handleDownload = async (row: GovernanceDocRow) => {
    if (!row.file_path) return;
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(row.file_path, 60, {
        download: row.file_name ?? true,
      } as any);
    if (error || !data?.signedUrl) {
      toast({
        title: "Download failed",
        description: error?.message ?? "Could not create download link.",
        variant: "destructive",
      });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = row.file_name ?? "";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
                <SelectItem key={opt} value={opt}>
                  {opt}
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
                    <TableCell>{row.framework_label ?? "—"}</TableCell>
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
                      {row.file_path ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(row)}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>
                              <Button size="sm" variant="outline" disabled>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                Download
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>File not available</TooltipContent>
                        </Tooltip>
                      )}
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
