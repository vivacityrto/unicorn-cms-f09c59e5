import { useState } from "react";
import { format } from "date-fns";
import { Mail, User, Calendar, Eye, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkedEmails, LinkedEmail, EmailAttachment } from "@/hooks/useLinkedEmails";
import { EmailViewDialog } from "./EmailViewDialog";

interface LinkedEmailsListProps {
  clientId?: number;
  packageId?: number;
  taskId?: string;
  title?: string;
  emptyMessage?: string;
}

export function LinkedEmailsList({
  clientId,
  packageId,
  taskId,
  title = "Linked Emails",
  emptyMessage = "No emails linked yet",
}: LinkedEmailsListProps) {
  const { emails, isLoading, fetchAttachments, getAttachmentUrl } = useLinkedEmails({
    clientId,
    packageId,
    taskId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {title}
          {emails.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {emails.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {emails.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Mail className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                fetchAttachments={fetchAttachments}
                getAttachmentUrl={getAttachmentUrl}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface EmailCardProps {
  email: LinkedEmail;
  fetchAttachments: (emailId: string) => Promise<EmailAttachment[]>;
  getAttachmentUrl: (storagePath: string) => Promise<string | null>;
}

function normalizeEmailText(text?: string | null) {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

function EmailCard({ email }: EmailCardProps) {
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const summaryText = normalizeEmailText(email.ai_summary);
  const previewText = normalizeEmailText(email.body_preview);

  return (
    <>
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="whitespace-normal break-words font-medium">
              {email.subject || "(No subject)"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[200px]" title={email.sender_name || email.sender_email || undefined}>
                  {email.sender_name || email.sender_email}
                </span>
              </div>
              {email.received_at && (
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{format(new Date(email.received_at), "MMM d, yyyy")}</span>
                </div>
              )}
              {email.has_attachments && <Badge variant="outline">Attachments</Badge>}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewDialogOpen(true)}
            title="View full email"
            className="shrink-0 self-start"
          >
            <Eye className="h-4 w-4" />
          </Button>

          <div className="col-span-2 flex w-full min-w-0 flex-col gap-2 pt-1">
            {summaryText && (
              <div className="flex w-full items-start gap-1.5 rounded-md bg-primary/5 px-2.5 py-1.5 text-sm text-primary/80">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-normal break-words leading-6">{summaryText}</span>
              </div>
            )}

            {previewText && (
              <p className="w-full whitespace-normal break-words text-sm leading-6 text-muted-foreground line-clamp-3">
                {previewText}
              </p>
            )}
          </div>
        </div>
      </div>

      <EmailViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        externalMessageId={email.external_message_id}
        subject={email.subject}
        senderName={email.sender_name}
        senderEmail={email.sender_email}
        receivedAt={email.received_at}
        bodyPreview={email.body_preview}
        hasAttachments={email.has_attachments}
      />
    </>
  );
}
