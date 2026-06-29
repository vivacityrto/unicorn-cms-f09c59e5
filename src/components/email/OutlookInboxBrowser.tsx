import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Paperclip,
  Search,
  RefreshCw,
  Link as LinkIcon,
  ExternalLink,
  Calendar,
  User,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { useOutlookInbox } from "@/hooks/useOutlookInbox";
import { LinkEmailModal } from "./LinkEmailModal";
import { useOutlookConnectionStatus } from "@/hooks/useOutlookConnectionStatus";

interface OutlookInboxBrowserProps {
  tenantId?: string;
  defaultClientId?: number;
  onEmailLinked?: () => void;
  filterEmail?: string;
  folder?: "inbox" | "sent";
  onSelectEmail?: (email: OutlookEmail) => void;
  /**
   * Optional client-side filter: only show emails whose toRecipients
   * contain this address. Used by the KPI sent-items step to surface
   * likely replies. Existing Linked Emails callers pass nothing.
   */
  recipientFilter?: string;
  /**
   * Optional description shown under the card title. Existing callers
   * pass nothing and keep the default Linked Emails wording.
   */
  description?: string;
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
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime: string;
  sentDateTime?: string;
  hasAttachments: boolean;
  bodyPreview: string;
  isRead: boolean;
  conversationId?: string;
}

export function OutlookInboxBrowser({
  tenantId,
  defaultClientId,
  onEmailLinked,
  filterEmail,
  folder = "inbox",
  onSelectEmail,
  recipientFilter,
  description,
}: OutlookInboxBrowserProps) {
  const { connect, isConnecting } = useOutlookConnectionStatus();
  const { emails, isLoading, error, hasConnection, fetchEmails } = useOutlookInbox({
    filterEmail,
    folder,
  });
  const folderLabel = folder === "sent" ? "Sent Items" : "Inbox";
  const defaultDescription = "Select an email to link it to a client, package, or task";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<OutlookEmail | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  // Auto-fetch when connection becomes available (and on filter/folder changes)
  useEffect(() => {
    if (hasConnection) {
      fetchEmails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasConnection, folder, filterEmail]);

  // Apply optional client-side recipient filter
  const recipientFiltered = useMemo(() => {
    if (!recipientFilter) return emails;
    const needle = recipientFilter.trim().toLowerCase();
    if (!needle) return emails;
    return emails.filter((email) =>
      (email.toRecipients || []).some(
        (r) => r.emailAddress?.address?.toLowerCase() === needle
      )
    );
  }, [emails, recipientFilter]);

  // Apply search filter
  const filteredEmails = useMemo(() => {
    if (!searchQuery) return recipientFiltered;
    const query = searchQuery.toLowerCase();
    return recipientFiltered.filter(
      (email) =>
        email.subject?.toLowerCase().includes(query) ||
        email.from?.emailAddress?.name?.toLowerCase().includes(query) ||
        email.from?.emailAddress?.address?.toLowerCase().includes(query) ||
        email.bodyPreview?.toLowerCase().includes(query)
    );
  }, [recipientFiltered, searchQuery]);

  // Group by conversationId; show most recent first, expand in chronological order
  const threads = useMemo(() => {
    const groups = new Map<string, OutlookEmail[]>();
    for (const e of filteredEmails) {
      const key = e.conversationId || e.id;
      const list = groups.get(key) || [];
      list.push(e);
      groups.set(key, list);
    }
    const result = Array.from(groups.entries()).map(([key, msgs]) => {
      const tsOf = (m: OutlookEmail) =>
        new Date(m.sentDateTime || m.receivedDateTime).getTime();
      const sorted = [...msgs].sort((a, b) => tsOf(a) - tsOf(b)); // oldest -> newest
      const latest = sorted[sorted.length - 1];
      return { key, latest, messages: sorted };
    });
    // Sort threads by latest message desc
    result.sort(
      (a, b) =>
        new Date(b.latest.sentDateTime || b.latest.receivedDateTime).getTime() -
        new Date(a.latest.sentDateTime || a.latest.receivedDateTime).getTime()
    );
    return result;
  }, [filteredEmails]);

  const handleLinkEmail = (email: OutlookEmail) => {
    if (onSelectEmail) {
      onSelectEmail(email);
      return;
    }
    setSelectedEmail(email);
    setLinkModalOpen(true);
  };

  const handleConnectOutlook = async () => {
    localStorage.setItem(
      'outlook_oauth_return_to',
      window.location.pathname + window.location.search
    );
    try {
      await connect();
    } catch {
      // error toast is already handled inside the hook
    }
  };

  if (!hasConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Outlook {folderLabel}
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
            <Button onClick={handleConnectOutlook} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Outlook
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderEmailRow = (email: OutlookEmail, opts?: { indent?: boolean }) => {
    const ts = email.sentDateTime || email.receivedDateTime;
    return (
      <div
        key={email.id}
        className={`p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer ${
          !email.isRead ? "bg-primary/5 border-primary/20" : ""
        } ${opts?.indent ? "ml-6" : ""}`}
        onClick={() => handleLinkEmail(email)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium line-clamp-1 ${!email.isRead ? "font-semibold" : ""}`}>
                {email.subject || "(No subject)"}
              </span>
              {!email.isRead && (
                <Badge variant="secondary" className="text-xs">
                  New
                </Badge>
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
                <span>{format(new Date(ts), "MMM d, h:mm a")}</span>
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
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Outlook {folderLabel}
              </CardTitle>
              <CardDescription>{description || defaultDescription}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchEmails} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && emails.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && emails.length === 0 && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No emails found</p>
            </div>
          )}

          {threads.length > 0 && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {threads.map((thread) => {
                const count = thread.messages.length;
                const isExpanded = !!expandedThreads[thread.key];
                return (
                  <div key={thread.key} className="space-y-2">
                    <div className="relative">
                      {renderEmailRow(thread.latest)}
                      {count > 1 && (
                        <button
                          type="button"
                          className="absolute bottom-2 right-12 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedThreads((prev) => ({
                              ...prev,
                              [thread.key]: !prev[thread.key],
                            }));
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {count} messages
                        </button>
                      )}
                    </div>
                    {isExpanded && count > 1 && (
                      <div className="space-y-2">
                        {thread.messages
                          .filter((m) => m.id !== thread.latest.id)
                          .map((m) => renderEmailRow(m, { indent: true }))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
        tenantId={tenantId ?? ""}
        onSuccess={onEmailLinked}
      />
    </>
  );
}
