import { useEffect, useState } from "react";
import { Loader2, Users, Building2, Send } from "lucide-react";
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalDescription,
  AppModalFooter,
  AppModalHeader,
  AppModalTitle,
} from "@/components/ui/modals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ReportingObligationRow } from "@/hooks/admin/use-reporting-obligations";
import {
  type PreviewResult,
  useBroadcastObligation,
  usePreviewObligation,
} from "@/hooks/admin/use-broadcast-obligation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obligation: ReportingObligationRow | null;
}

export function BroadcastPreviewDialog({ open, onOpenChange, obligation }: Props) {
  const preview = usePreviewObligation();
  const broadcast = useBroadcastObligation();
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !obligation) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }
    setPreviewData(null);
    setPreviewError(null);
    preview
      .mutateAsync(obligation.id)
      .then(setPreviewData)
      .catch((err: unknown) => setPreviewError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, obligation?.id]);

  const handleBroadcast = async () => {
    if (!obligation) return;
    try {
      const result = await broadcast.mutateAsync(obligation.id);
      toast({
        title: "Broadcast sent",
        description: `${result.inserted} notification${result.inserted === 1 ? "" : "s"} inserted.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Broadcast failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const isBlocking = preview.isPending || broadcast.isPending;

  return (
    <AppModal open={open} onOpenChange={onOpenChange} isBlocking={isBlocking}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>Broadcast reporting obligation</AppModalTitle>
          <AppModalDescription>
            {obligation?.title || "Obligation"} — review the recipient counts before sending.
          </AppModalDescription>
        </AppModalHeader>

        <AppModalBody className="space-y-4">
          {preview.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculating recipients…
            </div>
          )}

          {previewError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {previewError}
            </div>
          )}

          {previewData && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> Tenants
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{previewData.tenant_count}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Users
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{previewData.user_count}</div>
                </div>
              </div>

              {previewData.sample_tenants.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Sample tenants</div>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.sample_tenants.map((name) => (
                      <Badge key={name} variant="secondary">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {previewData.tenant_count === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active tenants match this obligation's audience right now. Broadcasting will insert zero notifications.
                </p>
              )}
            </>
          )}
        </AppModalBody>

        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBlocking}>
            Cancel
          </Button>
          <Button
            onClick={handleBroadcast}
            disabled={!previewData || broadcast.isPending}
            isLoading={broadcast.isPending}
          >
            <Send className="h-4 w-4" />
            Send broadcast
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
