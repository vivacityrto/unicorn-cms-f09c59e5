import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Link as LinkIcon } from "lucide-react";
import type { AssistantMessage } from "@/hooks/useAskVivAssistantChat";

/**
 * Shared message bubble for Ask Viv Assistant — used by both the floating
 * widget and the full page. Markdown rendering pattern borrowed from the
 * existing AskVivPanel.tsx, stripped of its compliance-specific chips
 * (confidence/freshness/governance banners), since this assistant has no
 * fixed section structure to render around. Sources are shown as a simple
 * "N sources used" expander instead.
 */
export function AssistantMessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%]", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ node, ...props }) => <h2 className="text-sm font-semibold mt-3 mb-1 first:mt-0" {...props} />,
                h3: ({ node, ...props }) => (
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1" {...props} />
                ),
                ul: ({ node, ...props }) => <ul className="space-y-1 pl-4 list-disc" {...props} />,
                ol: ({ node, ...props }) => <ol className="space-y-1 pl-4 list-decimal" {...props} />,
                li: ({ node, ...props }) => <li className="text-sm" {...props} />,
                p: ({ node, ...props }) => <p className="text-sm mb-2 last:mb-0" {...props} />,
                table: ({ node, ...props }) => (
                  <div className="mb-2 overflow-x-auto">
                    <table className="w-full text-xs border-collapse" {...props} />
                  </div>
                ),
                thead: ({ node, ...props }) => <thead className="border-b border-border" {...props} />,
                th: ({ node, ...props }) => <th className="text-left font-semibold px-2 py-1 whitespace-nowrap" {...props} />,
                td: ({ node, ...props }) => <td className="px-2 py-1 align-top border-t border-border/50" {...props} />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {!isUser && message.sources_used && message.sources_used.length > 0 && (
          <Collapsible className="mt-1.5">
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <LinkIcon className="h-3 w-3" />
              {message.sources_used.length} source{message.sources_used.length > 1 ? "s" : ""} used
              <ChevronRight className="h-3 w-3" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="space-y-1">
                {message.sources_used.map((s, idx) => (
                  <div key={idx} className="text-xs bg-muted/50 rounded-lg p-2 text-foreground">
                    {s.summary}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
