import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BUCKET = "internal-onboarding";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function useWorkbookSignedUrl(filePath: string | null) {
  return useQuery({
    queryKey: ["workbook-signed-url", filePath],
    enabled: !!filePath,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (!filePath) return null;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useWorkbookUpload(runId: number | null) {
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: async ({
      file,
      previousPath,
    }: {
      file: File;
      previousPath: string | null;
    }) => {
      if (!runId) throw new Error("Missing run id");
      if (file.type !== "application/pdf") {
        throw new Error("Workbook must be a PDF file");
      }
      if (file.size > MAX_BYTES) {
        throw new Error("Workbook PDF must be 25 MB or smaller");
      }
      const path = `workbooks/run-${runId}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("staff_provisioning_runs")
        .update({ workbook_file_path: path } as any)
        .eq("id", runId);
      if (updErr) throw updErr;

      if (previousPath && previousPath !== path) {
        await supabase.storage.from(BUCKET).remove([previousPath]);
      }
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-hub", "run", runId] });
      qc.invalidateQueries({ queryKey: ["workbook-signed-url"] });
      toast({ title: "Workbook uploaded" });
    },
    onError: (e: Error) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (path: string) => {
      if (!runId) throw new Error("Missing run id");
      await supabase.storage.from(BUCKET).remove([path]);
      const { error } = await supabase
        .from("staff_provisioning_runs")
        .update({ workbook_file_path: null } as any)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-hub", "run", runId] });
      qc.invalidateQueries({ queryKey: ["workbook-signed-url"] });
      toast({ title: "Workbook removed" });
    },
    onError: (e: Error) => {
      toast({ title: "Remove failed", description: e.message, variant: "destructive" });
    },
  });

  return { upload, remove, MAX_BYTES };
}
