/**
 * ClientAskVivPanel
 *
 * Purpose-built Ask Viv panel for CLIENT TENANT users (Admin / User).
 * NOT a flag-toggled variant of AskVivPanel — see V4 restoration story
 * in handoffs/ask-viv-fix-procedure.md for why we keep these isolated.
 *
 * Hard rules (enforced here):
 *  - Calls compliance-assistant-client (NOT compliance-assistant).
 *  - Request body is exactly { question }. No tenant_id / client_id /
 *    package_id / phase_id — scope is resolved server-side by the gate.
 *  - No useAskViv() context (it only exists in DashboardLayout).
 *  - No localStorage / Zustand / context. Local useState only.
 *  - Only labels are rendered for records_accessed (no IDs, no tables).
 *  - Reuses AskVivFreshnessChip but no other ask-viv child components.
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Send,
  MessageSquare,
  Loader2,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Link as LinkIcon,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { AskVivFreshnessChip } from "./AskVivFreshnessChip";

// ============= Types =============

type Confidence = "high" | "medium" | "low";

interface FreshnessData {
  last_activity_at: string | null;
  days_since_activity: number | null;
  status: "fresh" | "aging" | "stale";
  derived_at: string;
}

export interface ClientAskVivResponse {
  answer_markdown: string;
  records_accessed: { label: string }[];
  confidence: Confidence;
  gaps: string[];
  freshness: FreshnessData | null;
  consultant_handoff_suggested: boolean;
}

interface AssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  records_accessed: { label: string }[];
  confidence: Confidence;
  gaps: string[];
  freshness: FreshnessData | null;
  consultant_handoff_suggested: boolean;
}

interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

type Message = AssistantMessage | UserMessage;

interface PanelError {
  kind: "rate_limit" | "forbidden" | "server" | "network";
  message: string;
}

interface ClientAskVivPanelProps {
  isOpen: boolean;
  onClose: () => void;
  previewTenantId?: number;
}

// ============= Component =============

export function ClientAskVivPanel({ isOpen, onClose, previewTenantId }: ClientAskVivPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) {
    return null;
  }

  const isRateLimited = error?.kind === "rate_limit";
  const isForbidden = error?.kind === "forbidden";
  const sendDisabled = isLoading || isRateLimited || isForbidden || !inputMessage.trim();

  const handleSend = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? inputMessage).trim();
    if (!question) return;

    setError(null);
    setLastQuestion(question);

    const userMsg: UserMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError({
          kind: "forbidden",
          message: "Please sign in again to use Ask Viv.",
        });
        return;
      }

      const baseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
      const url = `${baseUrl}/functions/v1/compliance-assistant-client`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          ...(previewTenantId != null ? { preview_tenant_id: previewTenantId } : {}),
        }),
      });

      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        const detail =
          (body?.detail as string | undefined) ??
          "You've reached your daily Ask Viv limit. Please try again tomorrow.";
        setError({ kind: "rate_limit", message: detail });
        return;
      }
      if (resp.status === 403) {
        setError({
          kind: "forbidden",
          message: "This feature isn't available on your account.",
        });
        return;
      }
      if (resp.status >= 500) {
        setError({
          kind: "server",
          message: "Something went wrong. Please try again.",
        });
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError({
          kind: "server",
          message:
            (body?.detail as string | undefined) ??
            "Something went wrong. Please try again.",
        });
        return;
      }

      const result = (await resp.json()) as ClientAskVivResponse;
      const assistantMsg: AssistantMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.answer_markdown ?? "",
        records_accessed: Array.isArray(result.records_accessed)
          ? result.records_accessed
          : [],
        confidence: result.confidence ?? "low",
        gaps: Array.isArray(result.gaps) ? result.gaps : [],
        freshness: result.freshness ?? null,
        consultant_handoff_suggested: !!result.consultant_handoff_suggested,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("ClientAskVivPanel: request failed", err);
      setError({
        kind: "network",
        message: "Couldn't reach Ask Viv. Check your connection and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (!lastQuestion) return;
    // Drop the trailing user message so handleSend can re-add it cleanly.
    setMessages((prev) => {
      const reverseIdx = [...prev].reverse().findIndex((m) => m.role === "user");
      if (reverseIdx === -1) return prev;
      const realIdx = prev.length - 1 - reverseIdx;
      return prev.slice(0, realIdx);
    });
    handleSend(lastQuestion);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendDisabled) handleSend();
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setError(null);
    setLastQuestion(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div
      className={cn(
        "fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col",
        "bottom-6 right-6 w-[420px] h-[600px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border rounded-t-2xl bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Ask Viv</h3>
            <p className="text-xs text-muted-foreground">Your account assistant</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label="Close Ask Viv"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <UserBubble key={message.id} content={message.content} />
              ) : (
                <AssistantBubble key={message.id} message={message} />
              ),
            )}
            {isLoading && <LoadingBubble />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="p-3 border-t border-border bg-muted/30 rounded-b-2xl">
        {error && (
          <ErrorNotice
            error={error}
            onRetry={
              error.kind === "server" || error.kind === "network"
                ? handleRetry
                : undefined
            }
          />
        )}

        {messages.length > 0 && !error && (
          <div className="flex justify-center mb-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={startNewChat}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              New conversation
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRateLimited
                ? "Daily limit reached"
                : isForbidden
                ? "Unavailable"
                : "Ask a question about your account..."
            }
            disabled={isLoading || isRateLimited || isForbidden}
            className="flex-1 bg-background border-border/50"
          />
          <Button
            onClick={() => handleSend()}
            disabled={sendDisabled}
            size="icon"
            className="bg-primary hover:bg-primary/90"
            aria-label="Send"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============= Subcomponents =============

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4 bg-gradient-to-br from-primary/20 to-primary/10">
        <MessageSquare className="h-8 w-8 text-primary" />
      </div>
      <h4 className="font-medium text-foreground mb-2">Ask about your account</h4>
      <p className="text-sm text-muted-foreground mb-4">
        Get answers about your packages, tasks, evidence, and progress.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Badge variant="outline" className="text-xs">Your data only</Badge>
        <Badge variant="outline" className="text-xs">Read-only</Badge>
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-2 items-start justify-end">
      <div className="max-w-[85%] flex flex-col items-end">
        <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary text-primary-foreground">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const showFreshness =
    message.freshness !== null &&
    (message.freshness.status === "aging" || message.freshness.status === "stale");

  return (
    <div className="flex gap-2 items-start">
      <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary to-primary/70">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="max-w-[85%] flex flex-col">
        {/* Handoff banner — sits ABOVE the message bubble */}
        {message.consultant_handoff_suggested && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              If this doesn&apos;t match what you expected, your Vivacity consultant
              can help — reach out via your usual channel.
            </span>
          </div>
        )}

        {/* Freshness chip — only when aging or stale */}
        {showFreshness && message.freshness && (
          <div className="mb-2">
            <AskVivFreshnessChip freshness={message.freshness} />
          </div>
        )}

        {/* Message bubble — same plain renderer used in AskVivPanel */}
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-muted text-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Metadata stack */}
        <div className="mt-2 space-y-1.5">
          {/* Confidence chip */}
          <ConfidenceChip confidence={message.confidence} />

          {/* Gaps — italic list */}
          {message.gaps.length > 0 && (
            <ul className="text-xs text-muted-foreground italic list-disc list-inside space-y-0.5">
              {message.gaps.map((gap, idx) => (
                <li key={idx}>{gap}</li>
              ))}
            </ul>
          )}

          {/* What we looked at — labels only */}
          {message.records_accessed.length > 0 && (
            <Collapsible className="mt-1.5">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <LinkIcon className="h-3 w-3" />
                What we looked at ({message.records_accessed.length})
                <ChevronRight className="h-3 w-3" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <div className="space-y-1">
                  {message.records_accessed.slice(0, 12).map((record, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-muted/50 rounded-lg p-2 text-foreground"
                    >
                      {record.label}
                    </div>
                  ))}
                  {message.records_accessed.length > 12 && (
                    <p className="text-xs text-muted-foreground">
                      + {message.records_accessed.length - 12} more
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  // Per spec: low → amber, medium → yellow, high → green.
  const meta = {
    high: {
      icon: <CheckCircle className="h-3 w-3" />,
      label: "High confidence",
      cls: "border-green-500/40 bg-green-50 text-green-700",
    },
    medium: {
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Medium confidence",
      cls: "border-yellow-500/40 bg-yellow-50 text-yellow-700",
    },
    low: {
      icon: <HelpCircle className="h-3 w-3" />,
      label: "Low confidence",
      cls: "border-amber-500/40 bg-amber-50 text-amber-700",
    },
  }[confidence];

  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 py-0.5", meta.cls)}>
      {meta.icon}
      <span>{meta.label}</span>
    </Badge>
  );
}

function LoadingBubble() {
  return (
    <div className="flex gap-2 items-start">
      <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary to-primary/70">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1">
          <span
            className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({
  error,
  onRetry,
}: {
  error: PanelError;
  onRetry?: () => void;
}) {
  const tone =
    error.kind === "rate_limit"
      ? "border-amber-500/40 bg-amber-50 text-amber-700"
      : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <div
      className={cn(
        "mb-2 flex items-start gap-2 text-xs rounded-lg border px-2.5 py-2",
        tone,
      )}
    >
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <span className="flex-1">{error.message}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
