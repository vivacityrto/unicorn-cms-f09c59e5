import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify caller is vivacity staff
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("is_vivacity_internal")
      .eq("user_uuid", user.id)
      .single();

    if (!userRow?.is_vivacity_internal) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, filters } = body;

    // ---- ACTION: query ----
    if (action === "query") {
      const { node_type, entity_id, relationship_type, max_depth = 2, limit = 100 } = filters || {};

      // Start from a specific node or filter by type
      let nodesQuery = supabase.from("knowledge_nodes").select("*");
      if (node_type) nodesQuery = nodesQuery.eq("node_type", node_type);
      if (entity_id) nodesQuery = nodesQuery.eq("entity_id", entity_id);
      nodesQuery = nodesQuery.limit(limit);
      const { data: nodes, error: nErr } = await nodesQuery;
      if (nErr) throw nErr;

      const nodeIds = (nodes || []).map((n: any) => n.id);
      if (nodeIds.length === 0) {
        return new Response(JSON.stringify({ nodes: [], edges: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch edges connected to these nodes (1 hop)
      let edgesQuery = supabase
        .from("knowledge_edges")
        .select("*")
        .or(`from_node_id.in.(${nodeIds.join(",")}),to_node_id.in.(${nodeIds.join(",")})`)
        .limit(500);
      if (relationship_type) edgesQuery = edgesQuery.eq("relationship_type", relationship_type);
      const { data: edges, error: eErr } = await edgesQuery;
      if (eErr) throw eErr;

      // Fetch connected nodes (2nd hop if needed)
      let allNodes = [...(nodes || [])];
      if (max_depth >= 2 && edges && edges.length > 0) {
        const connectedIds = new Set<string>();
        edges.forEach((e: any) => {
          if (!nodeIds.includes(e.from_node_id)) connectedIds.add(e.from_node_id);
          if (!nodeIds.includes(e.to_node_id)) connectedIds.add(e.to_node_id);
        });
        if (connectedIds.size > 0) {
          const { data: hop2Nodes } = await supabase
            .from("knowledge_nodes")
            .select("*")
            .in("id", Array.from(connectedIds))
            .limit(200);
          if (hop2Nodes) allNodes = [...allNodes, ...hop2Nodes];
        }
      }

      return new Response(JSON.stringify({ nodes: allNodes, edges: edges || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: ingest ----
    if (action === "ingest") {
      const { nodes: newNodes, edges: newEdges } = body;

      if (newNodes && newNodes.length > 0) {
        const { error: insertErr } = await supabase
          .from("knowledge_nodes")
          .upsert(newNodes, { onConflict: "id", ignoreDuplicates: true });
        if (insertErr) throw insertErr;
      }

      if (newEdges && newEdges.length > 0) {
        const { error: edgeErr } = await supabase
          .from("knowledge_edges")
          .insert(newEdges);
        if (edgeErr) throw edgeErr;
      }

      // Audit log
      await supabase.from("audit_events").insert({
        action: "knowledge_graph_ingestion",
        entity: "knowledge_nodes",
        entity_id: user.id,
        user_id: user.id,
        details: { nodes_count: newNodes?.length || 0, edges_count: newEdges?.length || 0 },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: stats ----
    if (action === "stats") {
      const { data: nodeStats } = await supabase.rpc("execute_sql", { sql: "" }).maybeSingle();
      // Use direct queries instead
      const { count: totalNodes } = await supabase
        .from("knowledge_nodes")
        .select("*", { count: "exact", head: true });
      const { count: totalEdges } = await supabase
        .from("knowledge_edges")
        .select("*", { count: "exact", head: true });

      // Node type distribution
      const { data: typeDist } = await supabase
        .from("knowledge_nodes")
        .select("node_type");

      const distribution: Record<string, number> = {};
      (typeDist || []).forEach((n: any) => {
        distribution[n.node_type] = (distribution[n.node_type] || 0) + 1;
      });

      return new Response(
        JSON.stringify({ total_nodes: totalNodes || 0, total_edges: totalEdges || 0, distribution }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("query-knowledge-graph error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
