/**
 * ClientAICompanionPanel – Unicorn 2.0 Phase 17
 * Client-facing guided AI companion with phase-gated behaviour.
 */
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Send,
  ListChecks,
  RotateCcw,
  Loader2,
  Info,
} from 'lucide-react';
import { useClientAICompanion } from '@/hooks/useClientAICompanion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface Props {
  tenantId: number;
  mode?: 'orientation' | 'evidence_prep' | 'active_build';
  stageInstanceId?: number;
}

const modeLabels: Record<string, string> = {
  orientation: 'Orientation',
  evidence_prep: 'Evidence Preparation',
  active_build: 'Active Build',
};

const suggestedPrompts: Record<string, string[]> = {
  orientation: [
    'What is the purpose of this stage?',
    'What evidence categories should I know about?',
    'How should I organise my preparation?',
  ],
  evidence_prep: [
    'What documents do I need to prepare?',
    'What does a Trainer Matrix typically include?',
    'Explain the evidence requirements for this stage',
  ],
  active_build: [
    'What are the key TAS components?',
    'What are LLND expectations?',
    'What are common marketing claim risks?',
  ],
};

export function ClientAICompanionPanel({ tenantId, mode = 'orientation', stageInstanceId }: Props) {
  const {
    messages,
    isLoading,
    sendMessage,
    generateChecklist,
    resetSession,
  } = useClientAICompanion(tenantId, mode, stageInstanceId);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const prompts = suggestedPrompts[mode] ?? suggestedPrompts.orientation;

  return (
    <Card className="flex flex-col h-full max-h-[600px]">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" /> Guided AI Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {modeLabels[mode]}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={resetSession}
              title="New session"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Preparation support banner */}
        <div className="flex items-start gap-2 bg-muted/50 rounded-md p-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Preparation support only. Vivacity reviews final compliance.
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 p-3 pt-0 min-h-0">
        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="space-y-3 pr-2">
            {messages.length === 0 && (
              <div className="space-y-2 py-4">
                <p className="text-xs text-muted-foreground text-center">
                  Ask a question about your preparation requirements
                </p>

                {/* Suggested prompts */}
                <div className="space-y-1.5">
                  {prompts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(p)}
                      className="w-full text-left text-xs px-3 py-2 rounded-md border hover:bg-muted/50 transition-colors text-foreground"
                      disabled={isLoading}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Checklist button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={generateChecklist}
                  disabled={isLoading}
                >
                  <ListChecks className="h-3 w-3 mr-1.5" />
                  Generate Preparation Checklist
                </Button>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'text-xs rounded-lg px-3 py-2',
                  msg.role === 'user'
                    ? 'bg-primary/10 ml-8'
                    : 'bg-muted/50 mr-4'
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-xs max-w-none text-foreground [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Preparing response...
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2 pt-1 border-t">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your preparation..."
            className="text-xs h-8"
            disabled={isLoading}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
