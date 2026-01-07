import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { AIConfidenceBadge, ConfidenceBar, type AIStatus } from './AIConfidenceBadge';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AIAnalysisSummaryCardProps {
  aiStatus: AIStatus;
  overallConfidence: number | null;
  categoryConfidence: number | null;
  descriptionConfidence: number | null;
  suggestedCategory: string | null;
  suggestedDescription: string | null;
  currentCategory: string | null;
  currentDescription: string | null;
  reasoning: string | null;
  userEditedCategory: boolean;
  userEditedDescription: boolean;
  lastRunAt: string | null;
  onApprove?: (applyCategory: boolean, applyDescription: boolean) => void;
  onReject?: () => void;
  onRerun?: () => void;
  loading?: boolean;
}

export function AIAnalysisSummaryCard({
  aiStatus,
  overallConfidence,
  categoryConfidence,
  descriptionConfidence,
  suggestedCategory,
  suggestedDescription,
  currentCategory,
  currentDescription,
  reasoning,
  userEditedCategory,
  userEditedDescription,
  lastRunAt,
  onApprove,
  onReject,
  onRerun,
  loading = false
}: AIAnalysisSummaryCardProps) {
  const [expanded, setExpanded] = useState(aiStatus === 'needs_review');
  const [applyCategory, setApplyCategory] = useState(true);
  const [applyDescription, setApplyDescription] = useState(true);

  const hasSuggestions = suggestedCategory || suggestedDescription;
  const showActions = aiStatus === 'needs_review' && hasSuggestions;
  const categoryDiffers = suggestedCategory && suggestedCategory !== currentCategory;
  const descriptionDiffers = suggestedDescription && suggestedDescription !== currentDescription;

  return (
    <Card className={cn(
      'border-l-4',
      aiStatus === 'auto_approved' && 'border-l-green-500',
      aiStatus === 'needs_review' && 'border-l-amber-500',
      aiStatus === 'rejected' && 'border-l-red-500',
      (!aiStatus || aiStatus === 'pending') && 'border-l-muted'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">AI Analysis</CardTitle>
            <AIConfidenceBadge
              aiStatus={aiStatus}
              overallConfidence={overallConfidence}
              showConfidenceValues
            />
          </div>
          <div className="flex items-center gap-2">
            {onRerun && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRerun}
                disabled={loading}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
                Re-run
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 p-0"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {lastRunAt && (
          <CardDescription className="text-xs">
            Last analyzed: {new Date(lastRunAt).toLocaleString()}
          </CardDescription>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-2">
          {/* Confidence Scores */}
          {overallConfidence !== null && (
            <div className="space-y-2">
              {categoryConfidence !== null && (
                <ConfidenceBar 
                  value={categoryConfidence} 
                  label="Category Confidence" 
                  size="sm" 
                />
              )}
              {descriptionConfidence !== null && (
                <ConfidenceBar 
                  value={descriptionConfidence} 
                  label="Description Confidence" 
                  size="sm" 
                />
              )}
            </div>
          )}

          {/* AI Reasoning */}
          {reasoning && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <span className="font-medium">Reasoning:</span> {reasoning}
            </div>
          )}

          {/* Suggested Changes */}
          {hasSuggestions && (
            <div className="space-y-3">
              {suggestedCategory && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Suggested Category</span>
                    {userEditedCategory && (
                      <Badge variant="outline" className="text-xs">User Edited</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {showActions && !userEditedCategory && (
                      <input
                        type="checkbox"
                        checked={applyCategory}
                        onChange={(e) => setApplyCategory(e.target.checked)}
                        className="h-3 w-3"
                      />
                    )}
                    <Badge variant="secondary">{suggestedCategory}</Badge>
                    {categoryDiffers && currentCategory && (
                      <span className="text-xs text-muted-foreground">
                        (current: {currentCategory})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {suggestedDescription && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Suggested Description</span>
                    {userEditedDescription && (
                      <Badge variant="outline" className="text-xs">User Edited</Badge>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    {showActions && !userEditedDescription && (
                      <input
                        type="checkbox"
                        checked={applyDescription}
                        onChange={(e) => setApplyDescription(e.target.checked)}
                        className="h-3 w-3 mt-1"
                      />
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-3 flex-1">
                      {suggestedDescription}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {showActions && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                size="sm"
                onClick={() => onApprove?.(applyCategory && !userEditedCategory, applyDescription && !userEditedDescription)}
                disabled={loading || (!applyCategory && !applyDescription)}
                className="h-7 text-xs"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Apply Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onReject}
                disabled={loading}
                className="h-7 text-xs"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
            </div>
          )}

          {/* Status Messages */}
          {aiStatus === 'auto_approved' && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-950 rounded p-2">
              <CheckCircle2 className="h-3 w-3" />
              AI suggestions were automatically applied (confidence ≥ 90%)
            </div>
          )}

          {aiStatus === 'rejected' && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950 rounded p-2">
              <XCircle className="h-3 w-3" />
              AI suggestions were rejected (confidence &lt; 70% or manually rejected)
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
