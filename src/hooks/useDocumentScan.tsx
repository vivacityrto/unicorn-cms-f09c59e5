import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScanResult {
  success: boolean;
  document_id: number;
  merge_fields: string[];
  named_ranges: string[];
  scan_method: string;
}

export function useDocumentScan() {
  const [scanning, setScanning] = useState(false);

  const scanDocument = async (documentId: number): Promise<ScanResult | null> => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-document", {
        body: { document_id: documentId }
      });

      if (error) {
        console.error("Scan error:", error);
        toast.error("Failed to scan document");
        return null;
      }

      if (data.error) {
        toast.error(data.error);
        return null;
      }

      toast.success(`Found ${data.merge_fields?.length || 0} merge fields, ${data.named_ranges?.length || 0} named ranges`);
      return data as ScanResult;
    } catch (err) {
      console.error("Scan error:", err);
      toast.error("Failed to scan document");
      return null;
    } finally {
      setScanning(false);
    }
  };

  return { scanDocument, scanning };
}
