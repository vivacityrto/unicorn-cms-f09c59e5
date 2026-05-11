import { useState } from "react";
import { format } from "date-fns";
import { Download, FileText, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  cycleId: number;
}

export function AuditExportCard({ cycleId }: Props) {
  const [loading, setLoading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const onExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pdp-export", {
        body: { cycle_id: cycleId },
      });
      if (error) throw error;
      const url = (data as { signed_url?: string })?.signed_url;
      if (!url) throw new Error("No signed URL returned");
      setSignedUrl(url);
      setGeneratedAt(new Date());
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Export ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export not available yet";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = async () => {
    if (!signedUrl) return;
    await navigator.clipboard.writeText(signedUrl);
    toast.success("Link copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--viv-purple)]" />
          Audit-ready export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Download a complete DOCX of this cycle including goals, evidence, reflections, and reviews.
        </p>
        <Button
          onClick={onExport}
          disabled={loading}
          className="w-full text-white"
          style={{ backgroundColor: "#23C0DD" }}
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? "Generating…" : "Generate export"}
        </Button>
        {signedUrl && generatedAt && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Generated {format(generatedAt, "dd/MM/yyyy HH:mm")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" asChild>
                <a href={signedUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-3 w-3" />
                  Open
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={copyUrl}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
