import { MailQuestion } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isYesterday } from "date-fns";
import type { RefObject, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { topicToBadge } from "./topicBadge";
import { clientAvatarColor, clientInitials } from "@/lib/clientAvatarColor";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import type { MessageAttachmentRow } from "@/lib/messageAttachments";

interface ConversationLite {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  topic: string;
  subject: string | null;
}

interface MessageLite {
  id: string;
  sender_user_uuid: string;
  sender_type?: string | null;
  sender_name?: string;
  sender_avatar_url: string | null;
  body: string;
  created_at: string;
  attachments?: MessageAttachmentRow[];
}

interface Props {
  conversation: ConversationLite;
  messages: MessageLite[];
  messagesLoading: boolean;
  currentUserId?: string;
  messagesEndRef: RefObject<HTMLDivElement>;
  onMarkUnread: () => void;
  composer: ReactNode;
}

function daySeparatorLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM");
}

export function ConversationPanel({
  conversation,
  messages,
  messagesLoading,
  currentUserId,
  messagesEndRef,
  onMarkUnread,
  composer,
}: Props) {
  const badge = topicToBadge(conversation.topic);
  const color = clientAvatarColor(conversation.tenant_id);
  const initials = clientInitials(conversation.tenant_name);
  const subject = conversation.subject || badge.label;

  // Group messages by date-day
  const groups: { key: string; label: string; items: MessageLite[] }[] = [];
  for (const m of messages) {
    const key = format(new Date(m.created_at), "yyyy-MM-dd");
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: daySeparatorLabel(m.created_at), items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <>
      {/* Header */}
      <div className="min-w-0 px-4 py-3 border-b border-border flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 text-sm font-semibold",
            color.bg,
            color.text
          )}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{subject}</h2>
            <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
              {badge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {conversation.tenant_name}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onMarkUnread}
          aria-label="Mark as unread"
          title="Mark as unread"
          className="flex-shrink-0"
        >
          <MailQuestion className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea
        className="flex-1 min-h-0 w-full max-w-full overflow-hidden"
        viewportClassName="min-w-0 max-w-full overflow-x-hidden [&>div]:!block [&>div]:!min-w-0 [&>div]:!max-w-full"
      >
        <div className="min-w-0 w-full max-w-full p-4 space-y-4 overflow-x-hidden">
          {messagesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-3/4 rounded-lg" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          ) : (
            groups.map(group => (
              <div key={group.key} className="space-y-3">
                <div className="flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                {group.items.map(msg => {
                  const isStaff = msg.sender_type === "staff";
                  const isOwn = msg.sender_user_uuid === currentUserId;
                  const isOutgoing = isStaff || isOwn;
                  if (isOutgoing) {
                    return (
                      <div key={msg.id} className="flex w-full min-w-0 max-w-full flex-col items-end overflow-hidden">
                        <div className="box-border min-w-0 max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-primary-foreground sm:max-w-[75%]">
                          <p className="block min-w-0 max-w-full text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] [hyphens:auto]">{msg.body}</p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <MessageAttachments attachments={msg.attachments} />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 pr-1">
                          {format(new Date(msg.created_at), "HH:mm")}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className="flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden">
                      <Avatar className="h-7 w-7 flex-shrink-0 mt-4">
                        <AvatarImage src={msg.sender_avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {clientInitials(msg.sender_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 max-w-[calc(100%-2.25rem)] flex-1 overflow-hidden flex flex-col items-start">
                        <p className="max-w-full text-xs font-medium text-muted-foreground mb-0.5 ml-1 truncate">
                          {msg.sender_name}
                        </p>
                         <div className="box-border min-w-0 max-w-full overflow-hidden rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2 sm:max-w-[75%]">
                          <p className="block min-w-0 max-w-full text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] [hyphens:auto]">
                            {msg.body}
                          </p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <MessageAttachments attachments={msg.attachments} />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 ml-1">
                          {format(new Date(msg.created_at), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {composer}
    </>
  );
}
