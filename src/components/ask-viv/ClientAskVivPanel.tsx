/**
 * ClientAskVivPanel
 *
 * Purpose-built Ask Viv panel for CLIENT TENANT users (Admin / User).
 * NOT a flag-toggled variant of AskVivPanel — see V4 restoration story
 * in handoffs/ask-viv-fix-procedure.md for why we keep these isolated.
 *
 * Calls the new agentic ask-viv-assistant-client edge function (replacing
 * compliance-assistant-client — see
 * docs/audit-log/entries/2026-08-06-ask-viv-client-assistant.md). The
 * response is genuinely conversational free text, not the old fixed
 * Answer/Confidence/Gaps/Freshness template, so this panel is simpler than
 * its predecessor: no confidence chip, no freshness chip, no handoff
 * banner — the assistant's own words carry that now.
 *
 * Hard rules (enforced here):
 *  - Calls ask-viv-assistant-client (NOT compliance-assistant-client).
 *  - Request body is exactly { message, conversation_id, preview_tenant_id? }.
 *    No tenant_id / client_id / package_id / phase_id — scope is resolved
 *    server-side by the gate.
 *  - No useAskViv() context (it only exists in DashboardLayout).
 *  - No localStorage / Zustand — conversation continuity across a page
 *    reload comes from resuming the most recent conversation out of
 *    ask_viv_client_conversations/ask_viv_client_turns on mount (both
 *    already RLS-scoped to the caller's own rows), not client-side storage.
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { X, Send, MessageSquare, Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ============= Types =============

interface AssistantSourceUsed {
  tool: string;
  summary: string;
}

interface AssistantMessage {
  id: string;
  role: "assistant";
  content: string;
  sources_used: AssistantSourceUsed[];
}

interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

type Message = AssistantMessage | UserMessage;

interface ClientAskVivResponse {
  content: string;
  conversation_id: string;
  sources_used: AssistantSourceUsed[];
}

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Resume the most recent conversation on load, so a page reload (or a
  // fresh tab) doesn't lose history that's already sitting in
  // ask_viv_client_conversations/ask_viv_client_turns — both RLS-scoped to
  // the caller's own rows, so no new endpoint is needed to read them back.
  // Scoped to previewTenantId when a staff member is previewing a specific
  // tenant, so switching preview tenants doesn't resume an unrelated one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("ask_viv_client_conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (previewTenantId != null) {
        query = query.eq("tenant_id", previewTenantId);
      }
      const { data: convo } = await query.maybeSingle();
      if (!convo || cancelled) return;

      const { data: turns } = await supabase
        .from("ask_viv_client_turns")
        .select("id, role, content, tool_calls_summary, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true });
      if (cancelled || !turns || turns.length === 0) return;

      const hydrated: Message[] = turns.map((t) => {
        if (t.role === "user") {
          return { id: t.id, role: "user", content: t.content } as UserMessage;
        }
        const toolCalls = Array.isArray(t.tool_calls_summary) ? t.tool_calls_summary : [];
        return {
          id: t.id,
          role: "assistant",
          content: t.content,
          sources_used: toolCalls.map((tc: { name?: string; summary?: string }) => ({
            tool: tc.name ?? "unknown",
            summary: tc.summary ?? "",
          })),
        } as AssistantMessage;
      });

      setConversationId(convo.id);
      // Guard against clobbering anything the user already sent while this
      // fetch was in flight.
      setMessages((prev) => (prev.length > 0 ? prev : hydrated));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const userMsg: UserMessage = { id: `u-${Date.now()}`, role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError({ kind: "forbidden", message: "Please sign in again to use Ask Viv." });
        return;
      }

      const baseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
      const url = `${baseUrl}/functions/v1/ask-viv-assistant-client`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: question,
          conversation_id: conversationId,
          ...(previewTenantId != null ? { preview_tenant_id: previewTenantId } : {}),
        }),
      });

      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        const detail =
          (body?.detail as string | undefined) ?? "You've reached your daily Ask Viv limit. Please try again tomorrow.";
        setError({ kind: "rate_limit", message: detail });
        return;
      }
      if (resp.status === 403) {
        setError({ kind: "forbidden", message: "This feature isn't available on your account." });
        return;
      }
      if (resp.status >= 500) {
        setError({ kind: "server", message: "Something went wrong. Please try again." });
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError({ kind: "server", message: (body?.detail as string | undefined) ?? "Something went wrong. Please try again." });
        return;
      }

      const result = (await resp.json()) as ClientAskVivResponse;
      if (result.conversation_id) setConversationId(result.conversation_id);

      const assistantMsg: AssistantMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.content ?? "",
        sources_used: Array.isArray(result.sources_used) ? result.sources_used : [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("ClientAskVivPanel: request failed", err);
      setError({ kind: "network", message: "Couldn't reach Ask Viv. Check your connection and try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (!lastQuestion) return;
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
    setConversationId(null);
    setError(null);
    setLastQuestion(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className={cn("fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col", "bottom-6 right-6 w-[420px] h-[600px]")}>
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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close Ask Viv">
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
                <AssistantBubble key={message.id} message={message} navigate={navigate} />
              )
            )}
            {isLoading && <LoadingBubble />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="p-3 border-t border-border bg-muted/30 rounded-b-2xl">
        {error && <ErrorNotice error={error} onRetry={error.kind === "server" || error.kind === "network" ? handleRetry : undefined} />}

        {messages.length > 0 && !error && (
          <div className="flex justify-center mb-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={startNewChat}>
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
            placeholder={isRateLimited ? "Daily limit reached" : isForbidden ? "Unavailable" : "Ask a question or find a page..."}
            disabled={isLoading || isRateLimited || isForbidden}
            className="flex-1 bg-background border-border/50"
          />
          <Button onClick={() => handleSend()} disabled={sendDisabled} size="icon" className="bg-primary hover:bg-primary/90" aria-label="Send">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
      <h4 className="font-medium text-foreground mb-2">Ask about your account, or find your way around</h4>
      <p className="text-sm text-muted-foreground mb-4">
        Get answers about your packages, tasks, evidence, and Academy progress — or ask where to find something in the portal.
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

function AssistantBubble({ message, navigate }: { message: AssistantMessage; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary to-primary/70">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="max-w-[85%] flex flex-col">
        <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ node, ...props }) => <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1 first:mt-0" {...props} />,
              ul: ({ node, ...props }) => <ul className="space-y-1 pl-4" {...props} />,
              ol: ({ node, ...props }) => <ol className="space-y-1 pl-4" {...props} />,
              li: ({ node, ...props }) => <li className="text-sm list-disc" {...props} />,
              p: ({ node, ...props }) => <p className="text-sm" {...props} />,
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-2 rounded-md border border-border/50">
                  <table className="w-full text-xs" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => <thead className="bg-background/60" {...props} />,
              tr: ({ node, ...props }) => <tr className="border-b border-border/50 last:border-0" {...props} />,
              th: ({ node, ...props }) => <th className="px-2 py-1.5 text-left font-semibold" {...props} />,
              td: ({ node, ...props }) => <td className="px-2 py-1.5 align-top" {...props} />,
              // Internal portal/Academy links (e.g. from find_portal_page results)
              // navigate in-app instead of a full page reload.
              a: ({ node, href, ...props }) => {
                if (href && href.startsWith("/")) {
                  return (
                    <a
                      href={href}
                      className="text-primary underline underline-offset-2"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(href);
                      }}
                      {...props}
                    />
                  );
                }
                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2" {...props} />;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
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
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({ error, onRetry }: { error: PanelError; onRetry?: () => void }) {
  const tone = error.kind === "rate_limit" ? "border-amber-500/40 bg-amber-50 text-amber-700" : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <div className={cn("mb-2 flex items-start gap-2 text-xs rounded-lg border px-2.5 py-2", tone)}>
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <span className="flex-1">{error.message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
