import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, CheckCircle2, AlertCircle, FileText, Sparkles, 
  Check, X, ChevronDown, ChevronUp, Edit2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisResult {
  category: string;
  description: string;
  framework_type: 'RTO' | 'CRICOS' | 'GTO' | null;
  quality_area?: string;
  document_type: string;
  confidence: number;
  merge_fields: string[];
  dropdown_sources: Record<string, string[]>;
}

interface DocumentWithAnalysis {
  id: number;
  title: string;
  storage_path: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed' | 'skipped';
  result?: AnalysisResult;
  error?: string;
  accepted?: boolean;
  edited?: {
    category?: string;
    description?: string;
  };
}

const CATEGORIES = [
  'Outcome Standards',
  'Credential Policy',
  'Compliance Requirements',
  'Quality Indicators',
  'Training and Assessment',
  'Student Services',
  'Governance and Administration',
  'National Code',
  'ESOS Framework',
  'Apprenticeship Management',
  'Policy',
  'Procedure',
  'Form',
  'Template',
  'Checklist',
  'Register',
  'Other'
];

interface AIAnalysisReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: DocumentWithAnalysis[];
  analyzing: boolean;
  onUpdateEdit: (docId: number, edits: { category?: string; description?: string }) => void;
  onAccept: (docId: number) => void;
  onAcceptAll: () => void;
  onSave: () => Promise<boolean>;
}

export function AIAnalysisReviewDialog({
  open,
  onOpenChange,
  documents,
  analyzing,
  onUpdateEdit,
  onAccept,
  onAcceptAll,
  onSave
}: AIAnalysisReviewDialogProps) {
  const [saving, setSaving] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);

  const completedCount = documents.filter(d => d.status === 'completed').length;
  const acceptedCount = documents.filter(d => d.accepted).length;
  const progress = documents.length > 0 
    ? Math.round((documents.filter(d => d.status !== 'pending' && d.status !== 'analyzing').length / documents.length) * 100)
    : 0;

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave();
    setSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return { label: 'High', className: 'bg-green-100 text-green-700 border-green-200' };
    if (confidence >= 50) return { label: 'Medium', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    return { label: 'Low', className: 'bg-red-100 text-red-700 border-red-200' };
  };

  const getStatusIcon = (status: DocumentWithAnalysis['status']) => {
    switch (status) {
      case 'pending': return <div className="h-4 w-4 rounded-full bg-muted" />;
      case 'analyzing': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'skipped': return <X className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Document Analysis Review
          </DialogTitle>
          <DialogDescription>
            Review AI-suggested categories and descriptions. Edit as needed before saving.
          </DialogDescription>
        </DialogHeader>

        {analyzing && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Analyzing documents...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-b">
          <div className="text-sm text-muted-foreground">
            {completedCount} of {documents.length} analyzed • {acceptedCount} accepted
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onAcceptAll}
            disabled={completedCount === 0}
          >
            <Check className="h-3 w-3 mr-1" />
            Accept All
          </Button>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {documents.map((doc) => {
              const isExpanded = expandedDoc === doc.id;
              const confidence = doc.result?.confidence || 0;
              const confidenceBadge = getConfidenceBadge(confidence);
              const category = doc.edited?.category || doc.result?.category || '';
              const description = doc.edited?.description || doc.result?.description || '';

              return (
                <div 
                  key={doc.id} 
                  className={cn(
                    "border rounded-lg transition-colors",
                    doc.accepted && "border-green-200 bg-green-50/50",
                    doc.status === 'failed' && "border-destructive/50 bg-destructive/5"
                  )}
                >
                  {/* Header Row */}
                  <div 
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                  >
                    {getStatusIcon(doc.status)}
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{doc.title}</span>
                      {doc.status === 'completed' && (
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">{category}</Badge>
                          <Badge variant="outline" className={cn("text-xs", confidenceBadge.className)}>
                            {confidence}% {confidenceBadge.label}
                          </Badge>
                          {doc.result?.merge_fields && doc.result.merge_fields.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {doc.result.merge_fields.length} merge fields
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.status === 'completed' && !doc.accepted && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAccept(doc.id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Accept
                        </Button>
                      )}
                      {doc.accepted && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Accepted
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && doc.status === 'completed' && (
                    <div className="px-3 pb-3 pt-0 border-t space-y-3">
                      {/* Category */}
                      <div className="space-y-1.5 pt-3">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          Category
                          <Edit2 className="h-3 w-3" />
                        </Label>
                        <Select 
                          value={category} 
                          onValueChange={(val) => onUpdateEdit(doc.id, { category: val })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Description */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          Description
                          <Edit2 className="h-3 w-3" />
                        </Label>
                        <Textarea
                          value={description}
                          onChange={(e) => onUpdateEdit(doc.id, { description: e.target.value })}
                          className="text-sm min-h-[60px]"
                          placeholder="Document description..."
                        />
                      </div>

                      {/* Detected Fields */}
                      {doc.result?.merge_fields && doc.result.merge_fields.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Detected Merge Fields</Label>
                          <div className="flex flex-wrap gap-1">
                            {doc.result.merge_fields.slice(0, 10).map((field, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs font-mono">
                                {`{{${field}}}`}
                              </Badge>
                            ))}
                            {doc.result.merge_fields.length > 10 && (
                              <Badge variant="secondary" className="text-xs">
                                +{doc.result.merge_fields.length - 10} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Framework & Quality Area */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {doc.result?.framework_type && (
                          <span>Framework: <strong>{doc.result.framework_type}</strong></span>
                        )}
                        {doc.result?.quality_area && (
                          <span>Quality Area: <strong>{doc.result.quality_area}</strong></span>
                        )}
                        {doc.result?.document_type && (
                          <span>Type: <strong>{doc.result.document_type}</strong></span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {doc.status === 'failed' && (
                    <div className="px-3 pb-3 text-xs text-destructive">
                      {doc.error || 'Analysis failed'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || acceptedCount === 0}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Save {acceptedCount} Document{acceptedCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
