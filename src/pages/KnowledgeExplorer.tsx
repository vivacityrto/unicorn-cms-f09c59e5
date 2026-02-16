/**
 * Knowledge Explorer – Phase 11
 * SuperAdmin-only page for exploring the AI Knowledge Graph.
 * Provides Clause, Tenant, and Template intelligence views.
 */

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Network, FileText, Building2, ShieldAlert, Sparkles, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const NODE_TYPES = [
  "tenant", "stage", "standard_clause", "template", "template_version",
  "risk_event", "regulator_update", "audit_pack", "evidence_gap", "task", "consultant",
] as const;

const RELATIONSHIP_TYPES = [
  "relates_to_clause", "generated_from", "impacts", "assigned_to",
  "derived_from", "flagged_by", "influenced_by", "associated_with",
] as const;

type KnowledgeNode = {
  id: string;
  node_type: string;
  entity_id: string;
  label: string;
  metadata_json: Record<string, any>;
  tenant_id: number | null;
  created_at: string;
};

type KnowledgeEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship_type: string;
  weight: number;
  created_at: string;
};

function useGraphQuery(filters: Record<string, any>, enabled: boolean) {
  return useQuery({
    queryKey: ["knowledge-graph", filters],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("query-knowledge-graph", {
        body: { action: "query", filters },
      });
      if (error) throw error;
      return data as { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] };
    },
    enabled,
  });
}

function useGraphStats() {
  return useQuery({
    queryKey: ["knowledge-graph-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("query-knowledge-graph", {
        body: { action: "stats" },
      });
      if (error) throw error;
      return data as { total_nodes: number; total_edges: number; distribution: Record<string, number> };
    },
  });
}

// ─── Clause Intelligence View ────────────────────────────────────────
function ClauseIntelligenceView() {
  const [searchClause, setSearchClause] = useState("");
  const [selectedClause, setSelectedClause] = useState<string | null>(null);

  // Fetch all clause nodes
  const { data: clauseData, isLoading: clauseLoading } = useGraphQuery(
    { node_type: "standard_clause", limit: 500 },
    true
  );

  // Fetch selected clause's connections
  const { data: connections, isLoading: connLoading } = useGraphQuery(
    { entity_id: selectedClause, node_type: "standard_clause", max_depth: 2 },
    !!selectedClause
  );

  const filteredClauses = useMemo(() => {
    if (!clauseData?.nodes) return [];
    if (!searchClause) return clauseData.nodes;
    const q = searchClause.toLowerCase();
    return clauseData.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.metadata_json?.clause_number?.toLowerCase().includes(q)
    );
  }, [clauseData, searchClause]);

  const connectedByType = useMemo(() => {
    if (!connections) return {};
    const grouped: Record<string, KnowledgeNode[]> = {};
    connections.nodes.forEach((n) => {
      if (n.node_type === "standard_clause") return;
      if (!grouped[n.node_type]) grouped[n.node_type] = [];
      grouped[n.node_type].push(n);
    });
    return grouped;
  }, [connections]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Clause list */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Standards Clauses</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clause..."
              value={searchClause}
              onChange={(e) => setSearchClause(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {clauseLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filteredClauses.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No clause nodes found. Pre-seed clauses via the ingestion API.</p>
            ) : (
              <div className="divide-y divide-border">
                {filteredClauses.map((clause) => (
                  <button
                    key={clause.id}
                    onClick={() => setSelectedClause(clause.entity_id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-accent/50 transition-colors ${
                      selectedClause === clause.entity_id ? "bg-accent" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">{clause.metadata_json?.clause_number || "—"}</span>
                    <span className="ml-2 text-muted-foreground">{clause.label}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Clause detail */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {selectedClause ? "Connected Entities" : "Select a Clause"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedClause ? (
            <p className="text-xs text-muted-foreground text-center py-12">
              Select a clause from the left to see linked risks, tenants, templates, and regulator updates.
            </p>
          ) : connLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {Object.keys(connectedByType).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No connections found for this clause.</p>
              ) : (
                Object.entries(connectedByType).map(([type, nodes]) => (
                  <div key={type}>
                    <h4 className="text-xs font-semibold text-foreground mb-1 capitalize">{type.replace(/_/g, " ")}s ({nodes.length})</h4>
                    <div className="space-y-1">
                      {nodes.slice(0, 10).map((n) => (
                        <div key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                          <Badge variant="outline" className="text-[10px]">{n.node_type}</Badge>
                          <span className="text-foreground truncate">{n.label}</span>
                          {n.tenant_id && <span className="text-muted-foreground ml-auto">T-{n.tenant_id}</span>}
                        </div>
                      ))}
                      {nodes.length > 10 && (
                        <p className="text-[10px] text-muted-foreground pl-2">+ {nodes.length - 10} more</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <p className="text-[10px] text-muted-foreground">
                Edges: {connections?.edges?.length || 0} connections
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tenant Intelligence View ────────────────────────────────────────
function TenantIntelligenceView() {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  const { data: tenantNodes, isLoading } = useGraphQuery({ node_type: "tenant", limit: 200 }, true);
  const { data: tenantGraph, isLoading: graphLoading } = useGraphQuery(
    { entity_id: selectedTenant, node_type: "tenant", max_depth: 2 },
    !!selectedTenant
  );

  const connectedByType = useMemo(() => {
    if (!tenantGraph) return {};
    const grouped: Record<string, KnowledgeNode[]> = {};
    tenantGraph.nodes.forEach((n) => {
      if (n.node_type === "tenant") return;
      if (!grouped[n.node_type]) grouped[n.node_type] = [];
      grouped[n.node_type].push(n);
    });
    return grouped;
  }, [tenantGraph]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !tenantNodes?.nodes?.length ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No tenant nodes in graph.</p>
            ) : (
              <div className="divide-y divide-border">
                {tenantNodes.nodes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTenant(t.entity_id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-accent/50 ${
                      selectedTenant === t.entity_id ? "bg-accent" : ""
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedTenant ? "Tenant Intelligence" : "Select a Tenant"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedTenant ? (
            <p className="text-xs text-muted-foreground text-center py-12">Select a tenant to explore its risk clusters, flagged clauses, and templates.</p>
          ) : graphLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {Object.keys(connectedByType).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No connections found.</p>
              ) : (
                Object.entries(connectedByType).map(([type, nodes]) => (
                  <div key={type}>
                    <h4 className="text-xs font-semibold capitalize mb-1">{type.replace(/_/g, " ")}s ({nodes.length})</h4>
                    <div className="space-y-1">
                      {nodes.slice(0, 8).map((n) => (
                        <div key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                          <Badge variant="outline" className="text-[10px]">{n.node_type}</Badge>
                          <span className="truncate">{n.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Template Impact View ────────────────────────────────────────────
function TemplateImpactView() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { data: templateNodes, isLoading } = useGraphQuery({ node_type: "template", limit: 200 }, true);
  const { data: templateGraph, isLoading: graphLoading } = useGraphQuery(
    { entity_id: selectedTemplate, node_type: "template", max_depth: 2 },
    !!selectedTemplate
  );

  const connectedByType = useMemo(() => {
    if (!templateGraph) return {};
    const grouped: Record<string, KnowledgeNode[]> = {};
    templateGraph.nodes.forEach((n) => {
      if (n.node_type === "template") return;
      if (!grouped[n.node_type]) grouped[n.node_type] = [];
      grouped[n.node_type].push(n);
    });
    return grouped;
  }, [templateGraph]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Templates</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !templateNodes?.nodes?.length ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No template nodes in graph.</p>
            ) : (
              <div className="divide-y divide-border">
                {templateNodes.nodes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.entity_id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-accent/50 ${
                      selectedTemplate === t.entity_id ? "bg-accent" : ""
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedTemplate ? "Template Impact" : "Select a Template"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedTemplate ? (
            <p className="text-xs text-muted-foreground text-center py-12">Select a template to explore clause coverage, linked risks, and regulator updates.</p>
          ) : graphLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {Object.keys(connectedByType).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No connections found.</p>
              ) : (
                Object.entries(connectedByType).map(([type, nodes]) => (
                  <div key={type}>
                    <h4 className="text-xs font-semibold capitalize mb-1">{type.replace(/_/g, " ")}s ({nodes.length})</h4>
                    <div className="space-y-1">
                      {nodes.slice(0, 8).map((n) => (
                        <div key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                          <Badge variant="outline" className="text-[10px]">{n.node_type}</Badge>
                          <span className="truncate">{n.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Graph Stats Overview ────────────────────────────────────────────
function GraphStatsOverview() {
  const { data: stats, isLoading } = useGraphStats();

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats?.total_nodes ?? 0}</p>
          <p className="text-xs text-muted-foreground">Total Nodes</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats?.total_edges ?? 0}</p>
          <p className="text-xs text-muted-foreground">Total Edges</p>
        </CardContent>
      </Card>
      {stats?.distribution &&
        Object.entries(stats.distribution)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 6)
          .map(([type, count]) => (
            <Card key={type}>
              <CardContent className="p-4 text-center">
                <p className="text-lg font-semibold text-foreground">{count as number}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{type.replace(/_/g, " ")}</p>
              </CardContent>
            </Card>
          ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function KnowledgeExplorer() {
  const { isSuperAdmin } = useRBAC();

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Knowledge Explorer is available to Super Admins only.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-3 md:p-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Knowledge Explorer</h1>
            <p className="text-xs text-muted-foreground">
              AI Knowledge Graph – Explore clause, tenant, and template intelligence
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <GraphStatsOverview />

        {/* Tabbed Views */}
        <Tabs defaultValue="clause" className="space-y-3">
          <TabsList>
            <TabsTrigger value="clause" className="text-xs gap-1">
              <FileText className="h-3.5 w-3.5" /> Clause Intelligence
            </TabsTrigger>
            <TabsTrigger value="tenant" className="text-xs gap-1">
              <Building2 className="h-3.5 w-3.5" /> Tenant Intelligence
            </TabsTrigger>
            <TabsTrigger value="template" className="text-xs gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> Template Impact
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clause"><ClauseIntelligenceView /></TabsContent>
          <TabsContent value="tenant"><TenantIntelligenceView /></TabsContent>
          <TabsContent value="template"><TemplateImpactView /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
