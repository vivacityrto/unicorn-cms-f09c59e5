import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Inbox, Loader2, Search, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useDocumentCategories } from "@/hooks/useDocumentCategories";

function cleanFileName(name: string | null, documentId: number): string {
  if (!name) return `Document #${documentId}`;
  return name.replace(/\.docx$/i, "");
}

function tailoringBadge(riskLevel: string | null) {
  if (!riskLevel) return <span className="text-xs text-muted-foreground">—</span>;
  switch (riskLevel) {
    case "complete":
      return <Badge className="bg-emerald-600 text-primary-foreground text-xs">Complete</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 text-primary-foreground text-xs">Partial</Badge>;
    case "incomplete":
      return <Badge variant="destructive" className="text-xs">Incomplete</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{riskLevel}</Badge>;
  }
}

export function ClientGovernanceRegister() {
  const { activeTenantId } = useClientTenant();
  const { valueLabelMap } = useDocumentCategories();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["client-governance-register", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governance_document_deliveries")
        .select("id, document_id, document_version_id, delivered_file_name, category_subfolder, delivered_at, tailoring_risk_level, sharepoint_web_url")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "success")
        .order("delivered_at", { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      // Enrich with version numbers
      const versionIds = [...new Set(data.map((d) => d.document_version_id))];
      const { data: versions } = await supabase
        .from("document_versions")
        .select("id, version_number")
        .in("id", versionIds);
      const versionMap = new Map(versions?.map((v) => [v.id, v.version_number]) || []);

      return data.map((d) => ({
        ...d,
        display_name: cleanFileName(d.delivered_file_name, d.document_id),
        category: d.category_subfolder || "Uncategorised",
        version_number: versionMap.get(d.document_version_id) ?? null,
      }));
    },
  });

  // Distinct categories for filter dropdown
  const categories = useMemo(() => {
    if (!deliveries?.length) return [];
    return [...new Set(deliveries.map((d) => d.category))].sort();
  }, [deliveries]);

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!deliveries) return [];
    return deliveries.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (search && !d.display_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [deliveries, search, categoryFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!deliveries?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="h-12 w-12 mb-3" style={{ color: "hsl(270 20% 88%)" }} />
        <p className="text-sm text-muted-foreground">
          No governance documents have been delivered yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "hsl(270 20% 88%)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="hidden sm:table-cell">Delivered</TableHead>
              <TableHead>Tailoring</TableHead>
              <TableHead className="text-right">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No documents match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(270 55% 41%)" }} />
                      <span className="truncate max-w-[250px]">{d.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                    {valueLabelMap.get(d.category) || d.category}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.version_number != null ? `v${d.version_number}` : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                    {format(new Date(d.delivered_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>{tailoringBadge(d.tailoring_risk_level)}</TableCell>
                  <TableCell className="text-right">
                    {d.sharepoint_web_url ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={d.sharepoint_web_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {deliveries.length} document{deliveries.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
