/**
 * CopilotPanel – Unicorn 2.0
 *
 * Floating Advisory Copilot panel for internal Vivacity team.
 * Context-aware across tenant, stage, and template modes.
 */

import { useState, useRef, useEffect } from 'react';
import { useCopilot, type CopilotContext, type CopilotMessage } from '@/hooks/useCopilot';
import { useRBAC } from '@/hooks/useRBAC';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Send,
  X,
  Loader2,
  Bot,
  User,
  RotateCcw,
  Sparkles,
  Shield,
} from 'lucide-react';

interface CopilotPanelProps {
  context?: CopilotContext;
  defaultOpen?: boolean;
}

const CONTEXT_LABELS: Record<string, string> = {
  tenant: 'Tenant Context',
  stage: 'Stage Context',
  template: 'Template Context',
  executive: 'Executive Insight',
  general: 'General Advisory',
};

export function CopilotPanel({ context, defaultOpen = false }: CopilotPanelProps) {
  const { isVivacityTeam } = useRBAC();
  const {
    sessionId,
    messages,
    isLoading,
    isStarting,
    startSession,
    sendMessage,
    resetSession,
  } = useCopilot();

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const contextMode = context?.context_mode || 'general';

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Don't render for non-Vivacity users
  if (!isVivacityTeam) return null;

  const handleOpen = async () => {
    setIsOpen(true);
    if (!sessionId) {
      await startSession(context || { context_mode: 'general' });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewSession = async () => {
    resetSession();
    await startSession(context || { context_mode: 'general' });
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:shadow-xl transition-all hover:scale-105"
        aria-label="Open Advisory Copilot"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] max-h-[600px] flex flex-col">
      <Card className="flex flex-col h-full shadow-xl border-primary/20">
        {/* Header */}
        <CardHeader className="pb-2 pt-3 px-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Advisory Copilot
            </CardTitle>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9px]">
                {CONTEXT_LABELS[contextMode]}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleNewSession}
                title="New session"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <Separator />

        {/* Messages */}
        <CardContent className="flex-1 overflow-hidden p-0 min-h-[300px] max-h-[440px]">
          {isStarting ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Initialising copilot...</span>
            </div>
          ) : (
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="p-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Ask about compliance clauses, risk patterns, evidence requirements, or stage health.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {[
                        'What are the key risks for this tenant?',
                        'Summarise evidence requirements for Clause 1.8',
                        'What regulator updates affect current templates?',
                      ].map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(suggestion);
                          }}
                          className="block w-full text-left text-[11px] text-muted-foreground hover:text-foreground p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 p-2">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Analysing...</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>

        <Separator />

        {/* Input */}
        <div className="p-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the copilot..."
              className="text-xs h-8"
              disabled={isLoading || isStarting}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isStarting}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Shield className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">
              Internal advisory only • Standards for RTOs 2025
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <Bot className="h-4 w-4 text-primary mt-1 shrink-0" />}
      <div
        className={`max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.message_content}</div>
        {message.citations_json && message.citations_json.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-current/10">
            <span className="text-[9px] opacity-70">Sources: </span>
            {message.citations_json.map((c, i) => (
              <Badge key={i} variant="outline" className="text-[8px] mr-1">
                {c.type}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {isUser && <User className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />}
    </div>
  );
}
