import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, User, Calendar, Paperclip, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";

interface EmailViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For linked emails (stored in DB), pass the external_message_id */
  externalMessageId?: string | null;
  /** For Outlook inbox emails, pass the Graph API message id directly */
  outlookMessageId?: string;
  /** Fallback display data */
  subject?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  receivedAt?: string | null;
  bodyPreview?: string | null;
  hasAttachments?: boolean;
}

export function EmailViewDialog({
  open,
  onOpenChange,
  externalMessageId,
  outlookMessageId,
  subject,
  senderName,
  senderEmail,
  receivedAt,
  bodyPreview,
  hasAttachments,
}: EmailViewDialogProps) {
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const messageId = outlookMessageId || externalMessageId;

  const fetchBody = async () => {
    if (!messageId || fetched) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sync-outlook-calendar", {
        body: { action: "get-email-body", filterEmail: messageId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (data?.body?.content) {
        setBodyHtml(data.body.content);
      } else {
        setBodyHtml(null);
      }
      setFetched(true);
    } catch (err) {
      console.error("Failed to fetch email body:", err);
      setError(err instanceof Error ? err.message : "Failed to load email");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && !fetched) {
      fetchBody();
    }
    if (!isOpen) {
      // Reset for next open
      setBodyHtml(null);
      setFetched(false);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" />
            <span className="line-clamp-1">{subject || "(No subject)"}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Email metadata */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-b pb-3">
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            <span className="font-medium text-foreground">{senderName || senderEmail || "Unknown"}</span>
            {senderEmail && senderName && (
              <span className="text-xs">({senderEmail})</span>
            )}
          </div>
          {receivedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(receivedAt), "MMM d, yyyy h:mm a")}</span>
            </div>
          )}
          {hasAttachments && (
            <Badge variant="outline" className="text-xs">
              <Paperclip className="h-3 w-3 mr-1" />
              Attachments
            </Badge>
          )}
        </div>

        {/* Email body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading email...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive mb-2">{error}</p>
              <p className="text-xs text-muted-foreground mb-4">
                The full email body could not be loaded from Outlook.
              </p>
              {bodyPreview && (
                <div className="text-left bg-muted/50 rounded-lg p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
                  <p className="text-sm">{bodyPreview}</p>
                </div>
              )}
            </div>
          )}

          {!loading && !error && bodyHtml && (
            <div
              className="prose prose-sm max-w-none dark:prose-invert py-2"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
            />
          )}

          {!loading && !error && fetched && !bodyHtml && bodyPreview && (
            <div className="py-4">
              <p className="text-sm">{bodyPreview}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
