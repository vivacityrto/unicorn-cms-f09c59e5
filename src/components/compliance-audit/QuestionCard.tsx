import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { ComplianceQuestion, ComplianceResponse, ComplianceCAA } from '@/hooks/useComplianceAudits';

interface QuestionCardProps {
  question: ComplianceQuestion;
  response: ComplianceResponse | undefined;
  caa: ComplianceCAA | undefined;
  onResponseChange: (questionId: string, responseId: string, value: string) => void;
  onNotesChange: (responseId: string, notes: string) => void;
  onEvidenceUpload: (questionId: string, responseId: string, file: File) => void;
  onCAAChange: (data: {
    responseId: string;
    description: string;
    responsiblePerson: string | null;
    dueDate: string | null;
    existingCaaId?: string;
  }) => void;
  isReadOnly?: boolean;
}

const RESPONSE_OPTIONS: Record<string, { value: string; label: string; color: string }[]> = {
  safe_at_risk: [
    { value: 'safe', label: 'Safe', color: 'bg-accent text-accent-foreground' },
    { value: 'at_risk', label: 'At Risk', color: 'bg-warning text-warning-foreground' },
  ],
  compliant_non_compliant_na: [
    { value: 'compliant', label: 'Compliant', color: 'bg-accent text-accent-foreground' },
    { value: 'non_compliant', label: 'Non-Compliant', color: 'bg-destructive text-destructive-foreground' },
    { value: 'na', label: 'N/A', color: 'bg-muted text-muted-foreground' },
  ],
};

export function QuestionCard({
  question,
  response,
  caa,
  onResponseChange,
  onNotesChange,
  onEvidenceUpload,
  onCAAChange,
  isReadOnly = false,
}: QuestionCardProps) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [caaDescription, setCaaDescription] = useState(caa?.description || question.corrective_action || '');
  const [caaResponsible, setCaaResponsible] = useState(caa?.responsible_person || '');
  const [caaDueDate, setCaaDueDate] = useState<Date | undefined>(
    caa?.due_date ? new Date(caa.due_date) : undefined
  );

  const options = RESPONSE_OPTIONS[question.response_set] || RESPONSE_OPTIONS.compliant_non_compliant_na;
  const isFlagged = response?.is_flagged;
  const selectedResponse = response?.response;

  const handleResponse = (value: string) => {
    if (isReadOnly || !response) return;
    onResponseChange(question.id, response.id, value);
  };

  const handleNotesBlur = () => {
    if (!response || isReadOnly) return;
    onNotesChange(response.id, response.notes || '');
  };

  const handleCAABlur = () => {
    if (!response || isReadOnly) return;
    onCAAChange({
      responseId: response.id,
      description: caaDescription,
      responsiblePerson: caaResponsible || null,
      dueDate: caaDueDate ? format(caaDueDate, 'yyyy-MM-dd') : null,
      existingCaaId: caa?.id,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !response) return;
    onEvidenceUpload(question.id, response.id, e.target.files[0]);
  };

  // Parse unicorn_documents as comma-separated pills
  const unicornDocs = question.unicorn_documents
    ? question.unicorn_documents.split(/[,;]/).map(d => d.trim()).filter(Boolean)
    : [];

  return (
    <div className={cn(
      'rounded-xl border p-5 transition-all duration-200',
      isFlagged ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card',
    )}>
      {/* Question Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {question.clause && (
              <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                {question.clause}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {question.audit_statement}
          </p>
        </div>
      </div>

      {/* Response Buttons */}
      <div className="flex gap-2 mb-4">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleResponse(opt.value)}
            disabled={isReadOnly}
            className={cn(
              'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 border-2',
              selectedResponse === opt.value
                ? `${opt.color} border-transparent shadow-sm`
                : 'bg-background border-border text-muted-foreground hover:border-primary/30',
              isReadOnly && 'cursor-default opacity-80'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Guidance Panel */}
      <Collapsible open={guidanceOpen} onOpenChange={setGuidanceOpen}>
        <CollapsibleTrigger asChild>
          <button className="text-xs text-primary hover:underline flex items-center gap-1 mb-3">
            {guidanceOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {guidanceOpen ? 'Hide guidance' : 'Show guidance'}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3 mb-4 text-sm">
            {question.evidence_to_sight && (
              <div>
                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Evidence to Sight
                </div>
                <p className="text-foreground/80">{question.evidence_to_sight}</p>
              </div>
            )}
            {unicornDocs.length > 0 && (
              <div>
                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Unicorn Documents
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {unicornDocs.map((doc, i) => (
                    <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      {doc}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {question.corrective_action && (
              <div>
                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Suggested Corrective Action
                </div>
                <p className="text-foreground/80">{question.corrective_action}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Notes */}
      <div className="mb-3">
        <Textarea
          placeholder="Add notes..."
          className="min-h-[60px] text-sm"
          value={response?.notes || ''}
          onChange={(e) => {
            if (response && !isReadOnly) {
              // Direct update via parent
              onNotesChange(response.id, e.target.value);
            }
          }}
          onBlur={handleNotesBlur}
          disabled={isReadOnly}
        />
      </div>

      {/* Evidence Upload */}
      <div className="flex items-center gap-2 mb-3">
        <label className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed cursor-pointer transition-colors',
          isReadOnly
            ? 'border-muted text-muted-foreground cursor-default'
            : 'border-primary/30 text-primary hover:bg-primary/5'
        )}>
          <Upload className="h-3.5 w-3.5" />
          Attach evidence
          <input
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={isReadOnly}
          />
        </label>
        {(response?.evidence_urls || []).map((url, i) => (
          <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            <FileText className="h-3 w-3" />
            <span className="truncate max-w-[120px]">File {i + 1}</span>
          </div>
        ))}
      </div>

      {/* CAA Inline Form (when flagged) */}
      {isFlagged && !isReadOnly && (
        <div className="border-t border-destructive/20 mt-4 pt-4">
          <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5 mb-3">
            ⚠ Corrective Action Required
          </h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <Textarea
                value={caaDescription}
                onChange={(e) => setCaaDescription(e.target.value)}
                onBlur={handleCAABlur}
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Responsible Person</label>
                <Input
                  value={caaResponsible}
                  onChange={(e) => setCaaResponsible(e.target.value)}
                  onBlur={handleCAABlur}
                  placeholder="Name..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !caaDueDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {caaDueDate ? format(caaDueDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={caaDueDate}
                      onSelect={(d) => { setCaaDueDate(d); setTimeout(handleCAABlur, 100); }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
