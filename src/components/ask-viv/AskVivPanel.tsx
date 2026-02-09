import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { useAskViv } from "@/hooks/useAskViv";
import { useAskVivFeatureFlags } from "@/hooks/useAskVivFeatureFlags";
import { useAskVivSessionScope, getEffectiveScope } from "@/hooks/useAskVivSessionScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AskVivModeSelector } from "./AskVivModeSelector";
import { AskVivCapabilitiesBanner } from "./AskVivCapabilitiesBanner";
import { AskVivContextChips, AskVivContext } from "./AskVivContextChips";
import { AskVivExplainSourcesToggle } from "./AskVivExplainSourcesToggle";
import { AskVivExplainPanel, type ExplainPayload } from "./AskVivExplainPanel";
import { AskVivScopeBanner, type ScopeLock } from "./AskVivScopeBanner";
import { AskVivScopeSelectorModal, type SelectedScope } from "./AskVivScopeSelectorModal";
import {
  X,
  Send,
  MessageSquare,
  Loader2,
  FileText,
  ChevronRight,
  Minimize2,
  Maximize2,
  Sparkles,
  Shield,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

// Local storage key for explain sources toggle
const EXPLAIN_SOURCES_STORAGE_KEY = "ask_viv_explain_sources_enabled";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources_used?: any[];
  records_accessed?: any[];
  confidence?: "high" | "medium" | "low";
  gaps?: string[];
  explain?: ExplainPayload;
  scope_lock?: ScopeLock;
  created_at: string;
}

interface Thread {
  id: string;
  title: string;
}

/**
 * AskVivPanel - Main chatbot panel wrapper with mode selector
 * Supports both Knowledge and Compliance Assistant modes
 */
export function AskVivPanel() {
  const { user, profile, loading } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { isOpen, closePanel, selectedMode } = useAskViv();
  const { flags } = useAskVivFeatureFlags();

  const [isExpanded, setIsExpanded] = useState(false);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<AskVivContext>({ tenant_id: null });
  const [scopeSelectorOpen, setScopeSelectorOpen] = useState(false);
  
  // Session scope management
  const { 
    sessionScope, 
    scopeConfirmed, 
    confirmScope, 
    setSessionScope,
    clearSessionScope,
    logScopeConfirmation 
  } = useAskVivSessionScope();
  
  // Explain sources toggle - persisted in localStorage
  const [explainSourcesEnabled, setExplainSourcesEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(EXPLAIN_SOURCES_STORAGE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  const handleExplainSourcesToggle = (enabled: boolean) => {
    setExplainSourcesEnabled(enabled);
    try {
      localStorage.setItem(EXPLAIN_SOURCES_STORAGE_KEY, String(enabled));
    } catch (e) {
      console.error("Failed to persist explain sources setting:", e);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closePanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePanel]);

  // Load user's primary tenant context for compliance mode
  useEffect(() => {
    async function loadTenantContext() {
      if (!user?.id || selectedMode !== "compliance") return;

      try {
        const { data: tenantMember } = await supabase
          .from("tenant_members")
          .select("tenant_id, tenants(id, name)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .single();

        if (tenantMember?.tenant_id) {
          const tenantData = tenantMember.tenants as any;
          setContext({
            tenant_id: tenantMember.tenant_id,
            tenant_name: tenantData?.name || `Tenant ${tenantMember.tenant_id}`,
          });
        }
      } catch (err) {
        console.debug("No tenant context available:", err);
      }
    }

    loadTenantContext();
  }, [user?.id, selectedMode]);

  // Wait for auth to load before checking access
  if (loading || !profile) {
    return null;
  }

  // Only render for SuperAdmins or Vivacity Team
  if (!isSuperAdmin && !isVivacityTeam) {
    return null;
  }

  async function createNewThread() {
    const { data, error } = await supabase
      .from("assistant_threads")
      .insert({ viewer_user_id: user?.id, title: "New chat" })
      .select()
      .single();

    if (error) {
      console.error("Error creating thread:", error);
      return null;
    }

    setCurrentThread(data);
    setMessages([]);
    return data;
  }

  async function logKnowledgeInteraction(promptText: string, responseText: string) {
    try {
      await supabase.from("ai_interaction_logs").insert({
        user_id: user?.id,
        tenant_id: context.tenant_id,
        mode: "knowledge",
        prompt_text: promptText,
        response_text: responseText,
        records_accessed: [],
        request_context: {},
      });
    } catch (error) {
      console.error("Failed to log AI interaction:", error);
    }
  }

  async function sendKnowledgeMessage(userMessage: string, thread: Thread) {
    // Save user message
    await supabase.from("assistant_messages").insert({
      thread_id: thread.id,
      role: "user",
      content: userMessage,
    });

    // Call assistant API
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch(
      `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/assistant-answer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify({
          type: "chat",
          query: userMessage,
          threadId: thread.id,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get response");
    }

    const result = await response.json();

    // Log the interaction
    await logKnowledgeInteraction(userMessage, result.answer);

    // Save assistant message
    const { data: savedAssistantMsg } = await supabase
      .from("assistant_messages")
      .insert({
        thread_id: thread.id,
        role: "assistant",
        content: result.answer,
        sources_used: result.sources,
      })
      .select()
      .single();

    return {
      content: result.answer,
      sources_used: result.sources,
      savedId: savedAssistantMsg?.id,
      created_at: savedAssistantMsg?.created_at,
    };
  }

  async function sendComplianceMessage(userMessage: string) {
    if (!context.tenant_id) {
      throw new Error("No tenant context available. Please select a tenant first.");
    }

    // Use session scope if confirmed, otherwise use context
    const effectiveScope = getEffectiveScope(
      sessionScope,
      scopeConfirmed,
      {
        client_id: context.client_id,
        package_id: context.package_id,
        phase_id: context.phase_id,
      }
    );

    const response = await supabase.functions.invoke("compliance-assistant", {
      body: {
        question: userMessage,
        context: {
          tenant_id: context.tenant_id,
          client_id: effectiveScope.client_id ? parseInt(effectiveScope.client_id, 10) : null,
          package_id: effectiveScope.package_id ? parseInt(effectiveScope.package_id, 10) : null,
          phase_id: effectiveScope.phase_id ? parseInt(effectiveScope.phase_id, 10) : null,
        },
      },
    });

    if (response.error) {
      throw new Error(response.error.message || "Failed to get compliance response");
    }

    const result = response.data;
    
    return {
      content: result.answer_markdown,
      records_accessed: result.records_accessed,
      confidence: result.confidence,
      gaps: result.gaps,
      explain: result.explain,
      scope_lock: result.scope_lock,
    };
  }

  async function sendMessage() {
    if (!inputMessage.trim()) return;

    // Check context for compliance mode
    if (selectedMode === "compliance" && !context.tenant_id) {
      toast({
        title: "Tenant Required",
        description: "Please ensure you have access to a tenant to use Compliance Assistant.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const userMessage = inputMessage;
    setInputMessage("");

    // For knowledge mode, ensure thread exists
    let thread = currentThread;
    if (selectedMode === "knowledge" && !thread) {
      thread = await createNewThread();
      if (!thread) {
        setIsLoading(false);
        toast({ title: "Error creating chat", variant: "destructive" });
        return;
      }
    }

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: "temp-user-" + Date.now(),
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      let assistantResponse: Message;

      if (selectedMode === "knowledge" && thread) {
        const result = await sendKnowledgeMessage(userMessage, thread);
        assistantResponse = {
          id: result.savedId || "assistant-" + Date.now(),
          role: "assistant",
          content: result.content,
          sources_used: result.sources_used,
          created_at: result.created_at || new Date().toISOString(),
        };

        // Update thread title if first message
        if (messages.length === 0) {
          const newTitle = userMessage.substring(0, 50) + (userMessage.length > 50 ? "..." : "");
          await supabase
            .from("assistant_threads")
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq("id", thread.id);
          setCurrentThread((prev) => prev ? { ...prev, title: newTitle } : null);
        }
      } else {
        const result = await sendComplianceMessage(userMessage);
        assistantResponse = {
          id: "compliance-" + Date.now(),
          role: "assistant",
          content: result.content,
          records_accessed: result.records_accessed,
          confidence: result.confidence,
          gaps: result.gaps,
          explain: result.explain,
          scope_lock: result.scope_lock,
          created_at: new Date().toISOString(),
        };
      }

      // Update messages
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("temp-")),
        { ...tempUserMessage, id: "user-" + Date.now() },
        assistantResponse,
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function startNewChat() {
    setCurrentThread(null);
    setMessages([]);
    clearSessionScope();
  }

  function clearContext() {
    setContext({ tenant_id: null });
    clearSessionScope();
  }

  function handleConfirmScope(scopeLock: ScopeLock) {
    confirmScope(scopeLock);
    if (user?.id) {
      logScopeConfirmation(user.id, scopeLock);
    }
  }

  function handleScopeChange(newScope: SelectedScope) {
    setSessionScope(newScope);
    // Update context to reflect new scope for UI display
    setContext((prev) => ({
      ...prev,
      client_id: newScope.client_id ? parseInt(newScope.client_id, 10) : undefined,
      client_name: newScope.client_name ?? undefined,
      package_id: newScope.package_id ? parseInt(newScope.package_id, 10) : undefined,
      package_name: newScope.package_name ?? undefined,
      phase_id: newScope.phase_id ? parseInt(newScope.phase_id, 10) : undefined,
      phase_name: newScope.phase_name ?? undefined,
    }));
  }

  const getConfidenceIcon = (confidence?: string) => {
    switch (confidence) {
      case "high":
        return <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--success,142_76%_36%))]" />;
      case "medium":
        return <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--warning,38_92%_50%))]" />;
      case "low":
        return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  // Render nothing if closed
  if (!isOpen) {
    return null;
  }

  const isComplianceMode = selectedMode === "compliance";
  const headerSubtitle = isComplianceMode
    ? "Compliance Assistant • Read-only"
    : "Knowledge Assistant • Internal only";

  return (
    <div
      className={cn(
        "fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-300",
        isExpanded
          ? "bottom-4 right-4 left-4 top-4 md:left-auto md:top-4 md:w-[500px] md:h-[calc(100vh-2rem)]"
          : "bottom-6 right-6 w-[420px] h-[600px]"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-border rounded-t-2xl",
        isComplianceMode 
          ? "bg-gradient-to-r from-blue-500/10 to-blue-600/10"
          : "bg-gradient-to-r from-primary/10 to-purple-500/10"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            isComplianceMode
              ? "bg-gradient-to-br from-blue-500 to-blue-600"
              : "bg-gradient-to-br from-primary to-purple-600"
          )}>
            {isComplianceMode ? (
              <Shield className="h-5 w-5 text-primary-foreground" />
            ) : (
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Ask Viv</h3>
            <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={closePanel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mode Selector + Explain Toggle */}
      <div className="px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <AskVivModeSelector />
          {/* Explain sources toggle - only for compliance mode and Vivacity internal */}
          {isComplianceMode && flags.explainSourcesEnabled && (
            <AskVivExplainSourcesToggle
              enabled={explainSourcesEnabled}
              onToggle={handleExplainSourcesToggle}
            />
          )}
        </div>
      </div>

      {/* Capabilities Banner & Context */}
      <div className="px-4 py-2 space-y-2 border-b border-border bg-muted/10">
        <AskVivCapabilitiesBanner mode={selectedMode} />
        {isComplianceMode && (
          <AskVivContextChips
            context={context}
            onClearContext={context.tenant_id ? clearContext : undefined}
          />
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center mb-4",
              isComplianceMode
                ? "bg-gradient-to-br from-blue-500/20 to-blue-600/20"
                : "bg-gradient-to-br from-primary/20 to-purple-500/20"
            )}>
              <MessageSquare className={cn(
                "h-8 w-8",
                isComplianceMode ? "text-blue-500" : "text-primary"
              )} />
            </div>
            <h4 className="font-medium text-foreground mb-2">
              {isComplianceMode ? "Ask about your tenant data" : "How can I help you?"}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              {isComplianceMode
                ? "Query clients, phases, tasks, documents, and time entries."
                : "Ask about Unicorn procedures, EOS processes, or internal policies."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {isComplianceMode ? (
                <>
                  <Badge variant="outline" className="text-xs">Tenant-scoped</Badge>
                  <Badge variant="outline" className="text-xs">Read-only</Badge>
                  <Badge variant="outline" className="text-xs">Audit logged</Badge>
                </>
              ) : (
                <>
                  <Badge variant="outline" className="text-xs">Internal knowledge only</Badge>
                  <Badge variant="outline" className="text-xs">No client data</Badge>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role !== "user" && (
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                    isComplianceMode
                      ? "bg-gradient-to-br from-blue-500 to-blue-600"
                      : "bg-gradient-to-br from-primary to-purple-600"
                  )}>
                    {isComplianceMode ? (
                      <Shield className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary-foreground" />
                    )}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%]",
                    message.role === "user" && "order-first"
                  )}
                >
                  {/* Scope Lock Banner - shows before response for compliance mode */}
                  {message.role === "assistant" && isComplianceMode && message.scope_lock && (
                    <AskVivScopeBanner
                      scopeLock={message.scope_lock}
                      onConfirmScope={() => handleConfirmScope(message.scope_lock!)}
                      onChangeScope={() => setScopeSelectorOpen(true)}
                      isConfirmed={scopeConfirmed}
                      className="mb-2"
                    />
                  )}

                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Compliance response metadata */}
                  {message.role === "assistant" && isComplianceMode && (
                    <div className="mt-2 space-y-1.5">
                      {/* Confidence indicator */}
                      {message.confidence && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {getConfidenceIcon(message.confidence)}
                          <span>Confidence: {message.confidence}</span>
                        </div>
                      )}

                      {/* Gaps */}
                      {message.gaps && message.gaps.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Gaps:</span>
                          <ul className="list-disc list-inside mt-0.5">
                            {message.gaps.map((gap, idx) => (
                              <li key={idx}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Records accessed */}
                      {message.records_accessed && message.records_accessed.length > 0 && (
                        <Collapsible className="mt-1.5">
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <LinkIcon className="h-3 w-3" />
                            {message.records_accessed.length} record{message.records_accessed.length > 1 ? "s" : ""} accessed
                            <ChevronRight className="h-3 w-3" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1">
                            <div className="space-y-1">
                              {message.records_accessed.slice(0, 10).map((record: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="text-xs bg-muted/50 rounded-lg p-2 flex items-center gap-2"
                                >
                                  <Badge variant="outline" className="text-[10px]">
                                    {record.table}
                                  </Badge>
                                  <span className="text-foreground truncate">{record.label}</span>
                                </div>
                              ))}
                              {message.records_accessed.length > 10 && (
                                <p className="text-xs text-muted-foreground">
                                  + {message.records_accessed.length - 10} more
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Explain sources panel */}
                      {explainSourcesEnabled && message.explain && (
                        <AskVivExplainPanel explain={message.explain} />
                      )}
                    </div>
                  )}

                  {/* Knowledge sources */}
                  {message.role === "assistant" && !isComplianceMode && message.sources_used && message.sources_used.length > 0 && (
                    <Collapsible className="mt-1.5">
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <FileText className="h-3 w-3" />
                        {message.sources_used.length} source{message.sources_used.length > 1 ? "s" : ""}
                        <ChevronRight className="h-3 w-3" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-1">
                        <div className="space-y-1">
                          {message.sources_used.map((source: any, idx: number) => (
                            <div key={idx} className="text-xs bg-muted/50 rounded-lg p-2">
                              <Badge variant="outline" className="text-[10px] mb-1">
                                {source.type}
                              </Badge>
                              <p className="font-medium text-foreground">{source.title}</p>
                              <p className="text-muted-foreground">v{source.version}</p>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 items-start">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                  isComplianceMode
                    ? "bg-gradient-to-br from-blue-500 to-blue-600"
                    : "bg-gradient-to-br from-primary to-purple-600"
                )}>
                  {isComplianceMode ? (
                    <Shield className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-muted/30 rounded-b-2xl">
        {messages.length > 0 && (
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
            placeholder={isComplianceMode ? "Ask about tenant data..." : "Ask about procedures..."}
            disabled={isLoading}
            className="flex-1 bg-background border-border/50"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !inputMessage.trim()}
            size="icon"
            className={cn(
              isComplianceMode
                ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-500/90 hover:to-blue-600/90"
                : "bg-gradient-to-br from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Scope Selector Modal */}
      <AskVivScopeSelectorModal
        open={scopeSelectorOpen}
        onOpenChange={setScopeSelectorOpen}
        tenantId={context.tenant_id}
        currentScope={{
          client_id: sessionScope.client_id,
          client_name: sessionScope.client_name,
          package_id: sessionScope.package_id,
          package_name: sessionScope.package_name,
          phase_id: sessionScope.phase_id,
          phase_name: sessionScope.phase_name,
        }}
        onScopeChange={handleScopeChange}
      />
    </div>
  );
}
