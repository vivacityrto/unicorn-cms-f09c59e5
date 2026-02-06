import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Mail, Paperclip, Search, RefreshCw, Link as LinkIcon, ExternalLink, Calendar, User, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useOutlookInbox } from "@/hooks/useOutlookInbox";
import { LinkEmailModal } from "./LinkEmailModal";
import { useNavigate } from "react-router-dom";

interface OutlookInboxBrowserProps {
  tenantId: string;
  defaultClientId?: number;
  onEmailLinked?: () => void;
}

interface OutlookEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  hasAttachments: boolean;
  bodyPreview: string;
  isRead: boolean;
}

export function OutlookInboxBrowser({
  tenantId,
  defaultClientId,
  onEmailLinked,
}: OutlookInboxBrowserProps) {
  const navigate = useNavigate();
  const { emails, isLoading, error, hasConnection, fetchEmails, checkConnection } = useOutlookInbox();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<OutlookEmail | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // Filter emails by search query
  const filteredEmails = emails.filter((email) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(query) ||
      email.from?.emailAddress?.name?.toLowerCase().includes(query) ||
      email.from?.emailAddress?.address?.toLowerCase().includes(query) ||
      email.bodyPreview?.toLowerCase().includes(query)
    );
  });

  const handleLinkEmail = (email: OutlookEmail) => {
    setSelectedEmail(email);
    setLinkModalOpen(true);
  };

  const handleConnectOutlook = () => {
    navigate("/settings?tab=calendar");
  };

  if (!hasConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Outlook Inbox
          </CardTitle>
          <CardDescription>
            Connect your Outlook account to link emails to Unicorn records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              Your Outlook account is not connected or the session has expired.
            </p>
            <Button onClick={handleConnectOutlook}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Outlook
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Outlook Inbox
              </CardTitle>
              <CardDescription>
                Select an email to link it to a client, package, or task
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchEmails} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading state */}
          {isLoading && emails.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && emails.length === 0 && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No emails found</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchEmails}>
                Load Emails
              </Button>
            </div>
          )}

          {/* Email list */}
          {filteredEmails.length > 0 && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  className={`p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer ${
                    !email.isRead ? "bg-primary/5 border-primary/20" : ""
                  }`}
                  onClick={() => handleLinkEmail(email)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium line-clamp-1 ${!email.isRead ? "font-semibold" : ""}`}>
                          {email.subject || "(No subject)"}
                        </span>
                        {!email.isRead && (
                          <Badge variant="secondary" className="text-xs">New</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[180px]">
                            {email.from?.emailAddress?.name || email.from?.emailAddress?.address}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{format(new Date(email.receivedDateTime), "MMM d, h:mm a")}</span>
                        </div>
                        {email.hasAttachments && (
                          <div className="flex items-center gap-1">
                            <Paperclip className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {email.bodyPreview}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLinkEmail(email);
                      }}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results from search */}
          {!isLoading && emails.length > 0 && filteredEmails.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No emails match your search</p>
            </div>
          )}
        </CardContent>
      </Card>

      <LinkEmailModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        email={selectedEmail}
        defaultClientId={defaultClientId}
        tenantId={tenantId}
        onSuccess={onEmailLinked}
      />
    </>
  );
}
