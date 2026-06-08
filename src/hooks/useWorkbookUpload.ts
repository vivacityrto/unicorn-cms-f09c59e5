import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function useWorkbookSignedUrl(filePath: string | null) {
  return useQuery({
    queryKey: ["workbook-signed-url", filePath],
    enabled: !!filePath,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (!filePath) return null;
      const runId = filePath.match(/^workbooks\/run-(\d+)-/)?.[1];
      if (!runId) throw new Error("Invalid workbook path");
      const { data, error } = await supabase.functions.invoke("staff-onboarding-workbook", {
        body: { action: "signed-url", runId: Number(runId), path: filePath },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail ?? "Could not prepare workbook link");
      return data.signedUrl as string;
    },
  });
}

export function useWorkbookUpload(runId: number | null) {
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: async ({
      file,
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
      const form = new FormData();
      form.append("action", "upload");
      form.append("runId", String(runId));
      form.append("file", file);

      const { data, error } = await supabase.functions.invoke("staff-onboarding-workbook", {
        body: form,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail ?? "Workbook upload failed");
      return data.path as string;
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
      const { data, error } = await supabase.functions.invoke("staff-onboarding-workbook", {
        body: { action: "remove", runId, path },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail ?? "Workbook remove failed");
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
