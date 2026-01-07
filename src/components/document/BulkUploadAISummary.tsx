import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Brain } from 'lucide-react';

interface AnalysisResult {
  documentId: number;
  title: string;
  status: AIStatus;
  categoryConfidence: number;
  descriptionConfidence: number;
  overallConfidence: number;
}

type AIStatus = 'pending' | 'auto_approved' | 'needs_review' | 'rejected';

interface BulkUploadAISummaryProps {
  results: AnalysisResult[];
  analyzing: boolean;
  totalDocuments: number;
}

export function BulkUploadAISummary({
  results,
  analyzing,
  totalDocuments
}: BulkUploadAISummaryProps) {
  const autoApproved = results.filter(r => r.status === 'auto_approved').length;
  const needsReview = results.filter(r => r.status === 'needs_review').length;
  const rejected = results.filter(r => r.status === 'rejected').length;
  const pending = totalDocuments - results.length;
  
  const progress = totalDocuments > 0 ? (results.length / totalDocuments) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">AI Analysis Summary</CardTitle>
          {analyzing && (
            <Badge variant="outline" className="text-xs gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        {analyzing && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Processing documents</span>
              <span>{results.length} / {totalDocuments}</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Status Counts */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mb-1" />
            <span className="text-lg font-bold text-green-700 dark:text-green-300">{autoApproved}</span>
            <span className="text-xs text-green-600 dark:text-green-400">Auto-approved</span>
          </div>
          
          <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mb-1" />
            <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{needsReview}</span>
            <span className="text-xs text-amber-600 dark:text-amber-400">Needs Review</span>
          </div>
          
          <div className="flex flex-col items-center p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mb-1" />
            <span className="text-lg font-bold text-red-700 dark:text-red-300">{rejected}</span>
            <span className="text-xs text-red-600 dark:text-red-400">Rejected</span>
          </div>
        </div>

        {/* Explanation */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>
            <span className="font-medium text-green-600">Auto-approved (≥90%):</span> Category and description applied automatically
          </p>
          <p>
            <span className="font-medium text-amber-600">Needs Review (70-89%):</span> Suggestions ready for your approval
          </p>
          <p>
            <span className="font-medium text-red-600">Rejected (&lt;70%):</span> Low confidence, requires manual input
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
