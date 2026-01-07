import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Download, Check, Clock, ExternalLink, Loader2 } from "lucide-react";
import { useTenantPacks } from "@/hooks/useTenantPacks";
import { format } from "date-fns";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TenantPacksListProps {
  tenantId: number;
  showAcknowledge?: boolean;
}

export function TenantPacksList({ tenantId, showAcknowledge = false }: TenantPacksListProps) {
  const { packs, loading, acknowledgePack, trackDownload, refetch } = useTenantPacks(tenantId);
  const [downloadingPack, setDownloadingPack] = useState<string | null>(null);

  const handleDownload = async (packId: string) => {
    setDownloadingPack(packId);
    try {
      const pack = packs.find(p => p.id === packId);
      if (!pack) return;

      // Get signed URLs for the documents
      const { data: documents } = await supabase
        .from("documents")
        .select("id, title, uploaded_files")
        .in("id", pack.document_ids);

      if (!documents || documents.length === 0) {
        toast.error("No documents found in pack");
        return;
      }

      // Generate signed URLs from uploaded_files array
      for (const doc of documents) {
        const files = (doc.uploaded_files as string[]) || [];
        if (files.length > 0) {
          const { data: signedData } = await supabase.storage
            .from("document-files")
            .createSignedUrl(files[0], 3600); // 1 hour expiry

          if (signedData?.signedUrl) {
            window.open(signedData.signedUrl, "_blank");
          }
        }
      }

      await trackDownload(packId);
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download pack");
    } finally {
      setDownloadingPack(null);
    }
  };

  const handleAcknowledge = async (packId: string) => {
    await acknowledgePack(packId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No document packs available yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {packs.map(pack => {
        const isExpired = pack.expires_at && new Date(pack.expires_at) < new Date();
        const isDownloaded = !!pack.downloaded_at;
        const isAcknowledged = !!pack.acknowledged_at;

        return (
          <Card key={pack.id} className={isExpired ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {pack.name}
                  </CardTitle>
                  <CardDescription>
                    Created {format(new Date(pack.created_at), "MMM d, yyyy")}
                    {pack.document_ids.length > 0 && ` • ${pack.document_ids.length} documents`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {isExpired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : pack.expires_at ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Expires {format(new Date(pack.expires_at), "MMM d")}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(pack.expires_at), "MMMM d, yyyy 'at' h:mm a")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                  {isDownloaded && (
                    <Badge variant="secondary" className="gap-1">
                      <Download className="h-3 w-3" />
                      Downloaded
                    </Badge>
                  )}
                  {isAcknowledged && (
                    <Badge className="gap-1 bg-green-100 text-green-800">
                      <Check className="h-3 w-3" />
                      Acknowledged
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {isDownloaded && pack.downloaded_at && (
                    <span>Last downloaded: {format(new Date(pack.downloaded_at), "MMM d, yyyy 'at' h:mm a")}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showAcknowledge && !isAcknowledged && !isExpired && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={isAcknowledged}
                        onCheckedChange={() => handleAcknowledge(pack.id)}
                      />
                      Acknowledge receipt
                    </label>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(pack.id)}
                    disabled={isExpired || downloadingPack === pack.id}
                  >
                    {downloadingPack === pack.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
