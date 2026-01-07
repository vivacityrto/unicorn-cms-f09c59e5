import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TenantPack {
  id: string;
  tenant_id: number;
  stage_id: number | null;
  package_stage_id: string | null;
  name: string;
  document_ids: number[];
  document_version_ids: string[];
  storage_path: string | null;
  created_at: string;
  created_by: string | null;
  expires_at: string | null;
  downloaded_at: string | null;
  downloaded_by: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface PackFile {
  name: string;
  url: string;
}

interface GeneratePackResult {
  success: boolean;
  pack_id: string;
  pack_name: string;
  expires_at: string;
  files: PackFile[];
  document_count: number;
}

export function useTenantPacks(tenantId?: number) {
  const [packs, setPacks] = useState<TenantPack[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPacks = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      // Use raw query since types may not be updated yet
      const { data, error } = await supabase
        .from("tenant_packs" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Type assertion for the response
      const typedPacks = ((data as any[]) || []).map(pack => ({
        ...pack,
        document_ids: (pack.document_ids as number[]) || [],
        document_version_ids: (pack.document_version_ids as string[]) || []
      })) as TenantPack[];
      
      setPacks(typedPacks);
    } catch (err) {
      console.error("Error fetching packs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPacks();
  }, [tenantId]);

  const generatePack = async (
    tenantId: number,
    stageId: number,
    documentIds: number[],
    name?: string
  ): Promise<GeneratePackResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-pack", {
        body: { tenant_id: tenantId, stage_id: stageId, document_ids: documentIds, name }
      });

      if (error) {
        console.error("Pack generation error:", error);
        toast.error("Failed to generate pack");
        return null;
      }

      if (data.error) {
        toast.error(data.error);
        return null;
      }

      toast.success(`Pack created with ${data.document_count} documents`);
      await fetchPacks();
      return data as GeneratePackResult;
    } catch (err) {
      console.error("Pack generation error:", err);
      toast.error("Failed to generate pack");
      return null;
    }
  };

  const trackDownload = async (packId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update pack record
      await supabase
        .from("tenant_packs" as any)
        .update({
          downloaded_at: new Date().toISOString(),
          downloaded_by: user?.id
        })
        .eq("id", packId);

      // Log event
      const pack = packs.find(p => p.id === packId);
      if (pack) {
        await supabase
          .from("pack_events" as any)
          .insert({
            pack_id: packId,
            event_type: "pack_downloaded",
            tenant_id: pack.tenant_id,
            stage_id: pack.stage_id,
            user_id: user?.id
          });
      }

      await fetchPacks();
    } catch (err) {
      console.error("Error tracking download:", err);
    }
  };

  const acknowledgePack = async (packId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update pack record
      await supabase
        .from("tenant_packs" as any)
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user?.id
        })
        .eq("id", packId);

      // Log event
      const pack = packs.find(p => p.id === packId);
      if (pack) {
        await supabase
          .from("pack_events" as any)
          .insert({
            pack_id: packId,
            event_type: "pack_acknowledged",
            tenant_id: pack.tenant_id,
            stage_id: pack.stage_id,
            user_id: user?.id
          });
      }

      toast.success("Pack acknowledged");
      await fetchPacks();
    } catch (err) {
      console.error("Error acknowledging pack:", err);
      toast.error("Failed to acknowledge pack");
    }
  };

  return {
    packs,
    loading,
    generatePack,
    trackDownload,
    acknowledgePack,
    refetch: fetchPacks
  };
}
