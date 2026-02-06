import { useState } from "react";
import { format } from "date-fns";
import { Mail, Paperclip, ExternalLink, User, Calendar, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLinkedEmails, LinkedEmail, EmailAttachment } from "@/hooks/useLinkedEmails";

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
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
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

function EmailCard({ email, fetchAttachments, getAttachmentUrl }: EmailCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const handleToggle = async () => {
    if (!isOpen && email.has_attachments && attachments.length === 0) {
      setLoadingAttachments(true);
      try {
        const data = await fetchAttachments(email.id);
        setAttachments(data);
      } finally {
        setLoadingAttachments(false);
      }
    }
    setIsOpen(!isOpen);
  };

  const handleDownload = async (attachment: EmailAttachment) => {
    const url = await getAttachmentUrl(attachment.storage_path);
    if (url) {
      window.open(url, "_blank");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <div className="rounded-lg border bg-card hover:bg-muted/50 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium line-clamp-1">{email.subject || "(No subject)"}</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[200px]">
                      {email.sender_name || email.sender_email}
                    </span>
                  </div>
                  {email.received_at && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{format(new Date(email.received_at), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  {email.has_attachments && (
                    <div className="flex items-center gap-1">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>Attachments</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t">
            {/* Body preview */}
            {email.body_preview && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground line-clamp-3">{email.body_preview}</p>
              </div>
            )}

            {/* Attachments */}
            {email.has_attachments && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Paperclip className="h-4 w-4" />
                  Attachments
                </div>
                {loadingAttachments ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : attachments.length > 0 ? (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{attachment.file_name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatFileSize(attachment.file_size)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(attachment)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No attachments found</p>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
