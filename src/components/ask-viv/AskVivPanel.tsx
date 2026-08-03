import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
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
import { AskVivFreshnessChip } from "./AskVivFreshnessChip";
import { AskVivMicroExplain, type MicroExplainPayload } from "./AskVivMicroExplain";
import { AskVivFlagButton } from "./AskVivFlagButton";
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
  Globe,
  History,
  Trash2,
  FilePlus2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import vivIcon from "@/assets/viv-icon.png";

// Local storage key for explain sources toggle
const EXPLAIN_SOURCES_STORAGE_KEY = "ask_viv_explain_sources_enabled";
// Last tenant a staff member viewed via a route match, used as a fallback
// context when the current page itself doesn't embed a tenant ID (e.g. the
// dashboard). Never used in place of a route match, only in its absence.
const LAST_TENANT_STORAGE_KEY = "askviv:lastTenantId";

/**
 * Resolve a tenant ID from the current route, if the route embeds one.
 * Every `/tenant/:id...` variant, `/tenant-detail/:id`, `/client-portal/:id/documents`,
 * `/admin/package/:id/tenant/:id...`, and `/compliance-audits/:id...` share a
 * `/<prefix>/<tenantId>` shape once the fixed prefix is stripped, so a small
 * ordered list of prefix regexes covers every current route.
 */
function resolveTenantIdFromPath(pathname: string): number | null {
  const patterns = [
    /^\/tenant\/(\d+)/,
    /^\/tenant-detail\/(\d+)/,
    /^\/client-portal\/(\d+)\/documents/,
    /^\/admin\/package\/\d+\/tenant\/(\d+)/,
    /^\/compliance-audits\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Extract just the "## Answer" section's body from a tiered markdown response.
 * Compliance-mode responses also contain "## Key records used", "## Confidence",
 * "## Gaps", and "## Next safe actions" sections, but those are already
 * rendered as dedicated UI below the message bubble (confidence badge, gaps
 * list, records-accessed collapsible) — showing them again as raw markdown
 * inside the bubble would just duplicate that. A no-op (returns the input
 * unchanged) for any content without an "## Answer" heading, so Knowledge and
 * Web-backed mode plain-prose answers pass through untouched.
 */
function extractAnswerSection(content: string): string {
  const match = content.match(/##\s*Answer\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[1].trim() : content;
}

interface FreshnessData {
  last_activity_at: string | null;
  days_since_activity: number | null;
  status: "fresh" | "aging" | "stale";
  derived_at: string;
}

interface WebCitation {
  index: number;
  url: string;
  retrieved_at: string;
}

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
  freshness?: FreshnessData;
  micro_explain?: MicroExplainPayload;
  ai_interaction_log_id?: string | null;
  audit_logged?: boolean;
  web_citations?: WebCitation[];
  research_job_id?: string;
  reasoning_tiers?: { tier: string; finding_count: number; critical_count: number }[];
  governance?: { caution_banners: string[] };
  validation?: { sanitized: boolean };
  created_at: string;
}

interface Thread {
  id: string;
  title: string;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

/**
 * AskVivPanel - Main chatbot panel wrapper with mode selector
 * Supports both Knowledge and Compliance Assistant modes
 */
export function AskVivPanel() {
  const { user, profile, loading } = useAuth();
  const { canAccessAskViv } = useRBAC();
  const { isOpen, closePanel, selectedMode } = useAskViv();
  const { flags } = useAskVivFeatureFlags();
  const location = useLocation();
  const navigate = useNavigate();

  const [isExpanded, setIsExpanded] = useState(false);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // Phase 6: portfolio-wide scope — every internal staff role can see the
  // whole active client base, ranked with their own assigned clients first.
  // Not a fourth mode; a toggle within compliance mode.
  const [portfolioScope, setPortfolioScope] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
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
    ensureScopeForTenant,
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

  // Resolve tenant context for compliance mode: the current route always
  // wins (a staff member looking at Test RTO A's page must get Test RTO A,
  // never their own Vivacity membership); a last-viewed tenant persisted in
  // localStorage is used only when the current page doesn't embed a tenant
  // ID at all (e.g. the dashboard); otherwise there is no context, and the
  // existing "Tenant Required" toast on send already handles that case.
  // Deliberately never falls back to the staff member's own tenant_members
  // row — that was the source of Ask Viv silently answering about Vivacity's
  // own tenant while a CSC was looking at a client's page.
  useEffect(() => {
    async function loadTenantContext() {
      if (!user?.id || selectedMode !== "compliance") return;

      const routeTenantId = resolveTenantIdFromPath(location.pathname);

      let resolvedTenantId: number | null = routeTenantId;
      if (resolvedTenantId === null) {
        try {
          const stored = localStorage.getItem(LAST_TENANT_STORAGE_KEY);
          if (stored) {
            resolvedTenantId = parseInt(stored, 10) || null;
          }
        } catch {
          resolvedTenantId = null;
        }
      }

      if (resolvedTenantId === null) {
        setContext({ tenant_id: null });
        ensureScopeForTenant(null);
        return;
      }

      try {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("id, name")
          .eq("id", resolvedTenantId)
          .maybeSingle();

        if (!tenantData) {
          // Stale/deleted tenant in a persisted fallback — don't keep offering it.
          if (routeTenantId === null) {
            try {
              localStorage.removeItem(LAST_TENANT_STORAGE_KEY);
            } catch {
              // ignore
            }
          }
          setContext({ tenant_id: null });
          ensureScopeForTenant(null);
          return;
        }

        setContext({ tenant_id: tenantData.id, tenant_name: tenantData.name });
        ensureScopeForTenant(tenantData.id);

        if (routeTenantId !== null) {
          try {
            localStorage.setItem(LAST_TENANT_STORAGE_KEY, String(tenantData.id));
          } catch {
            // Non-fatal — just means the dashboard fallback won't have a value.
          }
        }
      } catch (err) {
        console.debug("No tenant context available:", err);
        setContext({ tenant_id: null });
        ensureScopeForTenant(null);
      }
    }

    loadTenantContext();
  }, [user?.id, selectedMode, location.pathname, ensureScopeForTenant]);

  // Wait for auth to load before checking access
  if (loading || !profile) {
    return null;
  }

  // Gate through the single documented ask_viv:access permission rather than
  // duplicating the Vivacity-staff role check inline.
  if (!canAccessAskViv()) {
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
    if (portfolioScope) {
      const portfolioResponse = await supabase.functions.invoke("compliance-assistant", {
        body: {
          question: userMessage,
          scope_kind: "portfolio",
          conversation_id: currentConversationId,
        },
      });

      if (portfolioResponse.error) {
        throw new Error(portfolioResponse.error.message || "Failed to get portfolio response");
      }

      const portfolioResult = portfolioResponse.data;
      return {
        content: portfolioResult.answer_markdown,
        records_accessed: portfolioResult.records_accessed,
        confidence: portfolioResult.confidence,
        gaps: portfolioResult.gaps,
        reasoning_tiers: portfolioResult.reasoning_tiers,
        governance: portfolioResult.governance,
        validation: portfolioResult.validation,
        scope_lock: undefined,
        freshness: undefined,
        explain: undefined,
        ai_interaction_log_id: portfolioResult.ai_interaction_log_id ?? null,
        audit_logged: portfolioResult.audit_logged ?? false,
        conversation_id: portfolioResult.conversation_id ?? null,
      };
    }

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
        conversation_id: currentConversationId,
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
      reasoning_tiers: result.reasoning_tiers,
      governance: result.governance,
      validation: result.validation,
      scope_lock: result.scope_lock ?? undefined,
      freshness: result.freshness ?? undefined,
      explain: result.explain ?? undefined,
      ai_interaction_log_id: result.ai_interaction_log_id ?? null,
      audit_logged: result.audit_logged ?? false,
      conversation_id: result.conversation_id ?? null,
    };
  }

  async function sendWebBackedMessage(userMessage: string) {
    // Extract URLs from the message
    const urlRegex = /https?:\/\/[^\s]+/g;
    const extractedUrls = userMessage.match(urlRegex) || [];

    // 1. Create research job
    const { data: job, error: jobError } = await supabase
      .from("research_jobs")
      .insert({
        tenant_id: context.tenant_id || null,
        job_type: "ask_viv_webbacked",
        status: "pending",
        created_by: user?.id,
        input_json: { question: userMessage, urls: extractedUrls },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error("Failed to create research job");
    }

    const { data: session } = await supabase.auth.getSession();
    const authToken = session?.session?.access_token;

    // 2. If URLs found, scrape them first
    let sourceIds: string[] = [];
    if (extractedUrls.length > 0) {
      const scrapeResponse = await fetch(
        "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/research-scrape",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ job_id: job.id, urls: extractedUrls }),
        }
      );

      if (scrapeResponse.ok) {
        const scrapeResult = await scrapeResponse.json();
        sourceIds = (scrapeResult.results || [])
          .filter((r: any) => r.success && r.source_id)
          .map((r: any) => r.source_id);
      }
    }

    // 3. Call research-answer with question + context
    const answerResponse = await fetch(
      "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/research-answer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          job_id: job.id,
          question: userMessage,
          context_sources: sourceIds.length > 0 ? sourceIds : undefined,
        }),
      }
    );

    if (!answerResponse.ok) {
      const errData = await answerResponse.json();
      throw new Error(errData.detail || "Web research failed");
    }

    const answerResult = await answerResponse.json();

    return {
      content: answerResult.summary_md,
      web_citations: answerResult.citations as WebCitation[],
      research_job_id: job.id,
      confidence: "medium" as const,
    };
  }

  async function sendMessage() {
    if (!inputMessage.trim()) return;

    // Check context for compliance mode (portfolio scope needs no tenant context)
    if (selectedMode === "compliance" && !portfolioScope && !context.tenant_id) {
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

      if (selectedMode === "web") {
        const result = await sendWebBackedMessage(userMessage);
        assistantResponse = {
          id: "web-" + Date.now(),
          role: "assistant",
          content: result.content,
          confidence: result.confidence,
          web_citations: result.web_citations,
          research_job_id: result.research_job_id,
          created_at: new Date().toISOString(),
        };
      } else if (selectedMode === "knowledge" && thread) {
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
        if (result.conversation_id) {
          setCurrentConversationId(result.conversation_id);
        }
        assistantResponse = {
          id: "compliance-" + Date.now(),
          role: "assistant",
          content: result.content,
          records_accessed: result.records_accessed,
          confidence: result.confidence,
          gaps: result.gaps,
          reasoning_tiers: result.reasoning_tiers,
          governance: result.governance,
          validation: result.validation,
          scope_lock: result.scope_lock,
          freshness: result.freshness,
          explain: result.explain,
          ai_interaction_log_id: result.ai_interaction_log_id,
          audit_logged: result.audit_logged,
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
    setCurrentConversationId(null);
    setMessages([]);
    clearSessionScope();
  }

  // Phase 5: conversation history — scoped to the current tenant (a CSC's
  // history for one client is far more useful than a mixed cross-tenant
  // list). Lazy-loaded when the history dropdown opens.
  async function loadConversationHistory() {
    if (!user?.id || (!portfolioScope && !context.tenant_id)) {
      setConversationList([]);
      return;
    }
    setLoadingHistory(true);
    try {
      let query = supabase
        .from("ask_viv_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id);
      query = portfolioScope ? query.is("tenant_id", null) : query.eq("tenant_id", context.tenant_id);
      const { data, error } = await query.order("updated_at", { ascending: false }).limit(20);
      if (error) throw error;
      setConversationList(data || []);
    } catch (err) {
      console.error("Failed to load Ask Viv conversation history:", err);
      setConversationList([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  function togglePortfolioScope() {
    setPortfolioScope((prev) => !prev);
    startNewChat();
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadConversationHistory();
  }

  // Historical turns don't carry the rich per-message metadata (confidence,
  // records_accessed, scope_lock etc.) that a live response has — the
  // permanent audit trail with all of that lives in ai_interaction_logs
  // regardless. This view is for conversational continuity, not re-deriving
  // the audit record.
  async function openConversation(conversationId: string) {
    try {
      const { data, error } = await supabase
        .from("ask_viv_turns")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const loadedMessages: Message[] = (data || []).map((t: any) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        created_at: t.created_at,
      }));
      setMessages(loadedMessages);
      setCurrentConversationId(conversationId);
      setHistoryOpen(false);
    } catch (err) {
      console.error("Failed to load Ask Viv conversation:", err);
      toast({ title: "Error", description: "Failed to load conversation", variant: "destructive" });
    }
  }

  async function deleteConversation(conversationId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { error } = await supabase.from("ask_viv_conversations").delete().eq("id", conversationId);
      if (error) throw error;
      setConversationList((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete Ask Viv conversation:", err);
      toast({ title: "Error", description: "Failed to delete conversation", variant: "destructive" });
    }
  }

  function clearContext() {
    setContext({ tenant_id: null });
    clearSessionScope();
  }

  function handleConfirmScope(scopeLock: ScopeLock) {
    if (context.tenant_id === null) return;
    confirmScope(scopeLock, context.tenant_id);
    if (user?.id) {
      logScopeConfirmation(user.id, scopeLock);
    }
  }

  // Phase 7: draft a note from an Ask Viv answer, without a new save path.
  // Writes into the SAME localStorage draft key NoteFormDialog already
  // auto-restores from (note-draft-<tenantId>-new) — the CSC opens "Add
  // Note" on the real Notes page themselves, sees the draft pre-filled,
  // edits it, and presses Save through the existing, unmodified save logic.
  // No approval queue, no new insert path, never auto-saved.
  function draftNoteFromMessage(message: Message) {
    if (!context.tenant_id) return;
    const answerBody = isComplianceMode ? extractAnswerSection(message.content) : message.content;
    const content = `Drafted from an Ask Viv answer — review before saving.\n\n${answerBody}`;
    try {
      localStorage.setItem(
        `note-draft-${context.tenant_id}-new`,
        JSON.stringify({
          // Left blank deliberately — NoteFormDialog's existing AI title
          // extraction (extract-note-title) generates one from `content`
          // once restored, the same as if the CSC had typed it themselves.
          title: "",
          content,
          noteType: "general",
          priority: "normal",
          status: "noted",
          duration: "",
          isPinned: false,
          packageInstanceId: "none",
          assignees: [],
          savedAt: Date.now(),
        })
      );
      toast({
        title: "Draft ready",
        description: "Opening Notes — click \"Add Note\" to review and save the draft.",
      });
      navigate(`/tenant/${context.tenant_id}/notes`);
    } catch (err) {
      console.error("Failed to prepare note draft:", err);
      toast({ title: "Error", description: "Failed to prepare a note draft.", variant: "destructive" });
    }
  }

  function handleScopeChange(newScope: SelectedScope) {
    if (context.tenant_id === null) return;
    setSessionScope(newScope, context.tenant_id);
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
  const isWebMode = selectedMode === "web";
  const headerSubtitle = isComplianceMode
    ? "Compliance Assistant • Read-only"
    : isWebMode
    ? "Web Research • Citations included"
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
          : isWebMode
          ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10"
          : "bg-gradient-to-r from-primary/10 to-purple-500/10"
      )}>
        <div className="flex items-center gap-3">
          <img 
            src={vivIcon} 
            alt="Viv" 
            className="h-10 w-10 rounded-full object-contain"
          />
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
      <div className="relative px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <AskVivModeSelector />
          <div className="flex items-center gap-1">
            {/* Conversation history — compliance mode only, scoped to the current tenant */}
            {isComplianceMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleHistory}
                title="Conversation history"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Explain sources toggle - only for compliance mode and Vivacity internal */}
            {isComplianceMode && flags.explainSourcesEnabled && (
              <AskVivExplainSourcesToggle
                enabled={explainSourcesEnabled}
                onToggle={handleExplainSourcesToggle}
              />
            )}
          </div>
        </div>

        {historyOpen && isComplianceMode && (
          <div className="absolute top-full left-2 right-2 z-20 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Recent conversations</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {loadingHistory ? (
              <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
            ) : !portfolioScope && !context.tenant_id ? (
              <div className="p-3 text-xs text-muted-foreground text-center">Select a tenant to see its conversation history</div>
            ) : conversationList.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">No past conversations for this tenant</div>
            ) : (
              <div className="p-1">
                {conversationList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-muted/50 text-xs",
                      currentConversationId === c.id && "bg-muted"
                    )}
                  >
                    <span className="truncate flex-1 text-foreground">{c.title || "Untitled conversation"}</span>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Capabilities Banner & Context */}
      <div className="px-4 py-2 space-y-2 border-b border-border bg-muted/10">
        <AskVivCapabilitiesBanner mode={selectedMode} />
        {isComplianceMode && (
          <div className="flex items-center justify-between gap-2">
            <AskVivContextChips
              context={context}
              onClearContext={context.tenant_id && !portfolioScope ? clearContext : undefined}
            />
            <Button
              variant={portfolioScope ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2 flex-shrink-0"
              onClick={togglePortfolioScope}
              title="Ask across your whole active client base instead of one tenant"
            >
              {portfolioScope ? "Portfolio view" : "All clients"}
            </Button>
          </div>
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
              {isComplianceMode
                ? portfolioScope ? "Ask about your whole portfolio" : "Ask about your tenant data"
                : isWebMode ? "Web-backed research" : "How can I help you?"}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              {isComplianceMode
                ? portfolioScope
                  ? "Ask what needs attention across all active clients, ranked with yours first."
                  : "Query clients, phases, tasks, documents, and time entries."
                : isWebMode
                ? "Ask questions with real-time web citations. Paste URLs for targeted scraping."
                : "Ask about Unicorn procedures, EOS processes, or internal policies."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {isComplianceMode ? (
                <>
                  <Badge variant="outline" className="text-xs">Tenant-scoped</Badge>
                  <Badge variant="outline" className="text-xs">Read-only</Badge>
                  <Badge variant="outline" className="text-xs">Audit logged</Badge>
                </>
              ) : isWebMode ? (
                <>
                  <Badge variant="outline" className="text-xs">Web citations</Badge>
                  <Badge variant="outline" className="text-xs">Draft only</Badge>
                  <Badge variant="outline" className="text-xs">Review required</Badge>
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
                      : isWebMode
                      ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                      : "bg-gradient-to-br from-primary to-purple-600"
                  )}>
                    {isComplianceMode ? (
                      <Shield className="h-4 w-4 text-primary-foreground" />
                    ) : isWebMode ? (
                      <Globe className="h-4 w-4 text-primary-foreground" />
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

                  {/* Freshness Warning Chip - shows for aging/stale data */}
                  {message.role === "assistant" && isComplianceMode && message.freshness && (
                    <div className="mb-2">
                      <AskVivFreshnessChip freshness={message.freshness} />
                    </div>
                  )}

                  {/* Micro-Explain - shows when response is blocked */}
                  {message.role === "assistant" && message.micro_explain && (
                    <AskVivMicroExplain
                      payload={message.micro_explain}
                      className="mb-2"
                    />
                  )}

                  {/* Governance caution banners */}
                  {message.role === "assistant" && isComplianceMode && message.governance?.caution_banners &&
                    message.governance.caution_banners.length > 0 &&
                    message.governance.caution_banners.map((banner, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{banner}</span>
                      </div>
                    ))
                  }

                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <ReactMarkdown
                        components={{
                          h2: ({ node, ...props }) => (
                            <h2
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1 first:mt-0"
                              {...props}
                            />
                          ),
                          ul: ({ node, ...props }) => (
                            <ul className="space-y-1 pl-4" {...props} />
                          ),
                          ol: ({ node, ...props }) => (
                            <ol className="space-y-1 pl-4" {...props} />
                          ),
                          li: ({ node, ...props }) => (
                            <li className="text-sm list-disc" {...props} />
                          ),
                          p: ({ node, ...props }) => <p className="text-sm" {...props} />,
                        }}
                      >
                        {isComplianceMode ? extractAnswerSection(message.content) : message.content}
                      </ReactMarkdown>
                    )}
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

                      {/* Real per-message audit status — reflects whether the
                          two-write audit model's post-response update actually
                          succeeded, not a static "always on" badge. */}
                      {message.ai_interaction_log_id && (
                        <div
                          className={cn(
                            "flex items-center gap-1.5 text-xs",
                            message.audit_logged ? "text-muted-foreground" : "text-amber-600"
                          )}
                        >
                          {message.audit_logged ? (
                            <CheckCircle className="h-3.5 w-3.5" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {message.audit_logged
                              ? "Audit logged"
                              : "Audit not logged — this response may not be fully traceable"}
                          </span>
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

                      {/* Reasoning tiers summary */}
                      {message.reasoning_tiers && message.reasoning_tiers.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Reasoning:</span>{" "}
                          {message.reasoning_tiers.length} tier
                          {message.reasoning_tiers.length > 1 ? "s" : ""} ·{" "}
                          {message.reasoning_tiers.reduce((n, t) => n + t.critical_count, 0)} critical
                        </div>
                      )}

                      {/* Sanitisation notice */}
                      {message.validation?.sanitized && (
                        <p className="text-xs text-muted-foreground italic">
                          Response was automatically sanitised.
                        </p>
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

                      {/* Flag / escalate buttons */}
                      {message.scope_lock && context.tenant_id && (
                        <AskVivFlagButton
                          scopeLock={message.scope_lock}
                          aiInteractionLogId={message.ai_interaction_log_id ?? null}
                          tenantId={context.tenant_id}
                          className="mt-2"
                        />
                      )}

                      {/* Draft a note from this answer — single-tenant only, not portfolio scope */}
                      {context.tenant_id && !portfolioScope && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground mt-1"
                          onClick={() => draftNoteFromMessage(message)}
                        >
                          <FilePlus2 className="h-3 w-3 mr-1" />
                          Draft a note from this
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Knowledge sources */}
                  {message.role === "assistant" && !isComplianceMode && !isWebMode && message.sources_used && message.sources_used.length > 0 && (
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

                  {/* Web-backed citations */}
                  {message.role === "assistant" && isWebMode && (
                    <div className="mt-2 space-y-1.5">
                      {/* Confidence indicator */}
                      {message.confidence && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {getConfidenceIcon(message.confidence)}
                          <span>Confidence: {message.confidence}</span>
                          <Badge variant="outline" className="text-[10px] ml-1">Draft — needs review</Badge>
                        </div>
                      )}

                      {/* Citations list */}
                      {message.web_citations && message.web_citations.length > 0 && (
                        <Collapsible defaultOpen className="mt-1.5">
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <LinkIcon className="h-3 w-3" />
                            {message.web_citations.length} citation{message.web_citations.length > 1 ? "s" : ""}
                            <ChevronRight className="h-3 w-3" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1">
                            <div className="space-y-1">
                              {message.web_citations.map((citation) => {
                                const retrievedAt = new Date(citation.retrieved_at);
                                const daysSince = Math.floor((Date.now() - retrievedAt.getTime()) / (1000 * 60 * 60 * 24));
                                const isStale = daysSince > 7;

                                return (
                                  <div
                                    key={citation.index}
                                    className="text-xs bg-muted/50 rounded-lg p-2 flex items-start gap-2"
                                  >
                                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                                      [{citation.index}]
                                    </Badge>
                                    <div className="min-w-0 flex-1">
                                      <a
                                        href={citation.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline truncate block"
                                      >
                                        {citation.url}
                                      </a>
                                      <span className={cn(
                                        "text-[10px]",
                                        isStale ? "text-destructive" : "text-muted-foreground"
                                      )}>
                                        Retrieved {format(retrievedAt, 'dd/MM/yyyy')}
                                        {isStale && " ⚠ Older than 7 days"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
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
            placeholder={
              isComplianceMode
                ? portfolioScope ? "Ask about your whole portfolio..." : "Ask about tenant data..."
                : "Ask about procedures..."
            }
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
