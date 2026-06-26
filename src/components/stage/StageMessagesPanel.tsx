import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, Send, Copy, Loader2 } from 'lucide-react';

export interface StageMessageTemplate {
  id: string;
  stage_id: number;
  name: string;
  description: string | null;
  body: string;
  recipient_type: 'client' | 'internal' | string;
  trigger_hint: string | null;
  sort_order: number;
  is_active: boolean;
}

interface StageMessagesPanelProps {
  stageId: number;
  /** When provided, "Send Message" is enabled and routes to the tenant messaging panel. */
  tenantId?: number | null;
  /** Optional callback for "Send Message" — receives pre-filled body. */
  onSendMessage?: (template: StageMessageTemplate) => void;
}

export function StageMessagesPanel({ stageId, tenantId, onSendMessage }: StageMessagesPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<StageMessageTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('stage_message_templates')
        .select('*')
        .eq('stage_id', stageId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: 'Failed to load messages', description: error.message, variant: 'destructive' });
        setTemplates([]);
      } else {
        setTemplates((data ?? []) as StageMessageTemplate[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [stageId, toast]);

  const handleCopy = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const canSend = !!tenantId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Portal Messages</CardTitle>
            <CardDescription>
              {loading ? 'Loading…' : `${templates.length} message${templates.length === 1 ? '' : 's'} configured`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No messages configured</p>
          </div>
        ) : (
          <ScrollArea className="h-[460px] pr-3">
            <div className="space-y-3">
              {templates.map((t) => {
                const preview = t.body.length > 120 ? `${t.body.slice(0, 120)}…` : t.body;
                const isClient = t.recipient_type === 'client';
                return (
                  <div key={t.id} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{t.name}</span>
                          <Badge
                            variant="outline"
                            className={
                              isClient
                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                : 'bg-muted text-muted-foreground'
                            }
                          >
                            {isClient ? 'Client' : 'Internal'}
                          </Badge>
                        </div>
                        {t.trigger_hint && (
                          <p className="text-xs text-muted-foreground mt-0.5">{t.trigger_hint}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                          {preview}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopy(t.body)}
                              aria-label="Copy message"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy message body</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!canSend}
                                onClick={() => onSendMessage?.(t)}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Send Message
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!canSend && (
                            <TooltipContent>Select a client to send this message</TooltipContent>
                          )}
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default function StageMessagesPanelWithProvider(props: StageMessagesPanelProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <StageMessagesPanel {...props} />
    </TooltipProvider>
  );
}
