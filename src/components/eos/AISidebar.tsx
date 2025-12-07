import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Check, X, RefreshCw } from 'lucide-react';
import { useAISuggestions } from '@/hooks/useAISuggestions';
import { EmptyState } from '@/components/ui/empty-state';

interface AISidebarProps {
  meetingId?: string;
  tenantId: number;
  isFacilitator: boolean;
}

export const AISidebar = ({ meetingId, tenantId, isFacilitator }: AISidebarProps) => {
  const {
    suggestions,
    isLoading,
    generateSuggestions,
    acceptSuggestion,
    dismissSuggestion,
  } = useAISuggestions(meetingId, tenantId);

  if (!isFacilitator) {
    return null;
  }

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'issue': return '🎯';
      case 'priority': return '⭐';
      case 'todo': return '📋';
      default: return '💡';
    }
  };

  const getSuggestionColor = (priority?: number): "default" | "secondary" | "destructive" | "outline" => {
    if (!priority) return 'default';
    if (priority >= 4) return 'destructive';
    if (priority >= 3) return 'secondary';
    return 'outline';
  };

  return (
    <div className="w-80 border-l border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Assistant</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => generateSuggestions.mutate({ meeting_id: meetingId, tenant_id: tenantId })}
          disabled={generateSuggestions.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${generateSuggestions.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !suggestions || suggestions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No suggestions yet"
          description="Click refresh to generate AI suggestions based on current meeting data"
        />
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          {suggestions.map((suggestion) => (
            <Card key={suggestion.id} className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getSuggestionIcon(suggestion.suggestion_type)}</span>
                    <div>
                      <CardTitle className="text-sm">
                        {suggestion.payload.title}
                      </CardTitle>
                      {suggestion.payload.priority && (
                        <Badge variant={getSuggestionColor(suggestion.payload.priority)} className="mt-1">
                          Priority: {suggestion.payload.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestion.payload.description && (
                  <CardDescription className="text-xs">
                    {suggestion.payload.description}
                  </CardDescription>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={() => acceptSuggestion.mutate(suggestion.id)}
                    disabled={acceptSuggestion.isPending}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismissSuggestion.mutate(suggestion.id)}
                    disabled={dismissSuggestion.isPending}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
        <p className="font-medium mb-1">ℹ️ AI Assistant Guidelines</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Suggestions are based on recent data</li>
          <li>Review before accepting</li>
          <li>All actions are audited</li>
        </ul>
      </div>
    </div>
  );
};
