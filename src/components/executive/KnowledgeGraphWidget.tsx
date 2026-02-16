/**
 * KnowledgeGraphWidget – Executive Dashboard widget
 * Shows a compact overview of the AI Knowledge Graph stats.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function KnowledgeGraphWidget() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["knowledge-graph-widget-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("query-knowledge-graph", {
        body: { action: "stats" },
      });
      if (error) throw error;
      return data as { total_nodes: number; total_edges: number; distribution: Record<string, number> };
    },
    staleTime: 5 * 60 * 1000,
  });

  const topTypes = data?.distribution
    ? Object.entries(data.distribution)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
    : [];

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/admin/knowledge-explorer")}
    >
      <CardHeader className="pb-1 flex flex-row items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <CardTitle className="text-xs">Knowledge Graph</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-xl font-bold text-foreground">{data?.total_nodes ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Nodes</p>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{data?.total_edges ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Edges</p>
              </div>
            </div>
            {topTypes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {topTypes.map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-[9px]">
                    {type.replace(/_/g, " ")}: {count as number}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
