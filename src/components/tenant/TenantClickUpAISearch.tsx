import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface TenantClickUpAISearchProps {
  tenantId: number;
}

export function TenantClickUpAISearch({ tenantId }: TenantClickUpAISearchProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || isStreaming) return;

    setResponse("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        setIsStreaming(false);
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clickup-ai-search`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, question: q }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "AI search failed");
        setIsStreaming(false);
        return;
      }

      if (!resp.body) {
        toast.error("No response stream");
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              accumulated += content;
              setResponse(accumulated);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("AI search error:", e);
        toast.error("AI search failed");
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSaveAsNote = async () => {
    if (!response) return;
    setIsSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }

      const noteContent = `[ClickUp AI Summary]\n\n**Question:** ${question}\n\n${response}`;

      const { error } = await supabase.from("notes").insert({
        tenant_id: tenantId,
        title: `ClickUp AI: ${question.slice(0, 80)}`,
        note_details: noteContent,
        note_type: "ai_summary",
        created_by: session.user.id,
        parent_type: "tenant",
        parent_id: tenantId,
      });

      if (error) {
        console.error("Save note error:", error);
        toast.error("Failed to save note");
      } else {
        toast.success("Saved as tenant note");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-6 pb-4">
      <div className="flex gap-2">
        <Input
          placeholder="Ask about Notes... e.g. 'Summarise open tasks' or 'What mentions evidence gaps?' Include 'with ClickUp comments' for task context."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          disabled={isStreaming}
          className="flex-1"
        />
        <Button
          onClick={handleAsk}
          disabled={!question.trim() || isStreaming}
          size="sm"
          className="gap-1.5"
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </Button>
      </div>

      {(response || isStreaming) && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
          {isStreaming && !response && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analysing ClickUp data...
            </div>
          )}
          {response && (
            <>
              <div className="prose prose-sm max-w-none text-foreground">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>
              {!isStreaming && (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveAsNote}
                    disabled={isSaving}
                    className="gap-1.5"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save as Note
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
