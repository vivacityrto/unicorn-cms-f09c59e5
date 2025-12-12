import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogTitle, DialogDescription, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  FileText, Type, Hash, CheckSquare, CalendarDays, Image, SlidersHorizontal, 
  MessageSquare, PenTool, MapPin, Building2, Building, Box, CalendarClock,
  AlignLeft, FileStack, AlertTriangle, Star, CircleDot, List, Upload, Users
} from 'lucide-react';
import { format } from 'date-fns';
import type { AuditTemplate } from './AuditTemplatesTable';

interface LiveInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AuditTemplate | null;
}

interface TemplateQuestion {
  id: number;
  template_id: number;
  question_type: string;
  label: string;
  order_index: number;
  options?: any[];
  required?: boolean;
  category: string;
  notes?: string;
}

const questionTypeIcons: Record<string, any> = {
  text_answer: Type,
  number: Hash,
  checkbox: CheckSquare,
  date_time: CalendarDays,
  media: Image,
  slider: SlidersHorizontal,
  annotation: MessageSquare,
  signature: PenTool,
  location: MapPin,
  clients: Building2,
  vivacity_team: Users,
  documents: FileText,
  asset: Box,
  paragraph: AlignLeft,
  page_break: FileStack,
  multiple_choice: List,
};

function useTenants() {
  return useQuery({
    queryKey: ['tenants-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, created_at, status')
        .order('name');
      if (error) throw error;
      return data || [];
    }
  });
}

function useVivacityTeamUsers() {
  return useQuery({
    queryKey: ['vivacity-team-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url')
        .eq('user_type', 'Vivacity Team')
        .order('first_name');
      if (error) throw error;
      return data || [];
    }
  });
}

function QuestionCard({
  question,
  questionNumber,
  responseValue,
  onResponseChange,
  hasError
}: {
  question: TemplateQuestion;
  questionNumber: number;
  responseValue?: any;
  onResponseChange: (questionId: number, value: any) => void;
  hasError?: boolean;
}) {
  const Icon = questionTypeIcons[question.question_type] || FileText;
  const { data: tenants } = useTenants();
  const { data: vivacityUsers } = useVivacityTeamUsers();

  const clientOptions: ComboboxOption[] = useMemo(() => {
    if (!tenants) return [];
    return tenants.map(tenant => ({
      value: String(tenant.id),
      label: tenant.name || 'Unnamed Client',
      group: (tenant.name || 'Other').charAt(0).toUpperCase(),
    }));
  }, [tenants]);

  const userOptions: ComboboxOption[] = useMemo(() => {
    if (!vivacityUsers) return [];
    return vivacityUsers.map(user => ({
      value: user.user_uuid,
      label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown',
      group: 'Team Members',
    }));
  }, [vivacityUsers]);

  const renderInput = () => {
    switch (question.question_type) {
      case 'text_answer':
      case 'asset':
        return (
          <Input
            placeholder="Enter your answer..."
            className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
            value={responseValue || ''}
            onChange={(e) => onResponseChange(question.id, e.target.value)}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            placeholder="Enter a number..."
            className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
            value={responseValue || ''}
            onChange={(e) => onResponseChange(question.id, e.target.value)}
          />
        );
      case 'clients':
        return (
          <Combobox
            options={clientOptions}
            value={responseValue || ''}
            onValueChange={(val) => onResponseChange(question.id, val)}
            placeholder="Search clients..."
            searchPlaceholder="Type to search..."
            emptyText="No clients found."
            className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
          />
        );
      case 'vivacity_team':
        return (
          <Combobox
            options={userOptions}
            value={responseValue || ''}
            onValueChange={(val) => onResponseChange(question.id, val)}
            placeholder="Search team members..."
            searchPlaceholder="Type to search..."
            emptyText="No team members found."
            className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
          />
        );
      case 'checkbox':
        const options = question.options?.length ? question.options : [{ id: '1', label: 'Option 1' }];
        const selectedValues = Array.isArray(responseValue) ? responseValue : [];
        return (
          <div className="space-y-2">
            {options.map((opt: any) => (
              <div key={opt.id || opt.label} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                <Checkbox
                  checked={selectedValues.includes(opt.label)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, opt.label]
                      : selectedValues.filter((v: string) => v !== opt.label);
                    onResponseChange(question.id, newValues);
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </div>
            ))}
          </div>
        );
      case 'multiple_choice':
        const mcOptions = question.options?.length ? question.options : [{ label: 'Option 1' }];
        return (
          <div className="flex flex-wrap gap-2">
            {mcOptions.map((opt: any, idx: number) => (
              <Button
                key={idx}
                type="button"
                variant={responseValue === opt.label ? "default" : "outline"}
                size="sm"
                className={cn(
                  "transition-all",
                  responseValue === opt.label && opt.color,
                  hasError && "border-destructive"
                )}
                onClick={() => onResponseChange(question.id, opt.label)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        );
      case 'date_time':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal bg-muted/50 border-dashed",
                  hasError && "border-destructive"
                )}
              >
                <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className={responseValue ? "text-foreground" : "text-muted-foreground"}>
                  {responseValue ? format(new Date(responseValue), 'PPP') : 'Pick a date'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[80]" align="start">
              <Calendar
                mode="single"
                selected={responseValue ? new Date(responseValue) : undefined}
                onSelect={(date) => onResponseChange(question.id, date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );
      case 'paragraph':
        return (
          <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
            <p className="text-sm text-muted-foreground">{question.notes || 'Information paragraph'}</p>
          </div>
        );
      default:
        return (
          <Input
            placeholder="Enter response..."
            className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
            value={responseValue || ''}
            onChange={(e) => onResponseChange(question.id, e.target.value)}
          />
        );
    }
  };

  // Skip rendering page breaks
  if (question.question_type === 'page_break') {
    return null;
  }

  return (
    <div className={cn(
      "group relative rounded-xl border bg-card p-5 transition-all duration-200",
      hasError && "border-destructive bg-destructive/5"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "flex items-center justify-center h-10 w-10 rounded-xl shrink-0",
          "bg-primary/10"
        )}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Q{questionNumber}
            </span>
            {question.required && (
              <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Required
              </span>
            )}
          </div>
          <p className="text-base font-medium text-foreground">{question.label || 'Untitled question'}</p>
          {question.notes && question.question_type !== 'paragraph' && (
            <p className="text-sm text-muted-foreground">{question.notes}</p>
          )}
          <div className="pt-2">
            {renderInput()}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveInspectionDialog({ open, onOpenChange, template }: LiveInspectionDialogProps) {
  const { profile } = useAuth();
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [validationErrors, setValidationErrors] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch template questions
  const { data: questions, isLoading } = useQuery({
    queryKey: ['audit_template_questions', template?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_template_questions')
        .select('*')
        .eq('template_id', parseInt(template!.id))
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data as TemplateQuestion[];
    },
    enabled: !!template?.id && open,
  });

  // Split questions into pages based on page_break
  const pages = useMemo(() => {
    if (!questions) return [];
    const result: TemplateQuestion[][] = [];
    let currentPageQuestions: TemplateQuestion[] = [];
    
    questions.forEach((q) => {
      if (q.question_type === 'page_break') {
        if (currentPageQuestions.length > 0) {
          result.push(currentPageQuestions);
          currentPageQuestions = [];
        }
      } else {
        currentPageQuestions.push(q);
      }
    });
    if (currentPageQuestions.length > 0) {
      result.push(currentPageQuestions);
    }
    return result;
  }, [questions]);

  const totalPages = pages.length;
  const currentPageQuestions = pages[currentPage] || [];
  const isLastPage = currentPage >= totalPages - 1;
  const isFirstPage = currentPage === 0;

  // Calculate question number offset
  const questionOffset = useMemo(() => {
    let offset = 0;
    for (let i = 0; i < currentPage; i++) {
      offset += (pages[i] || []).length;
    }
    return offset;
  }, [pages, currentPage]);

  const handleResponseChange = useCallback((questionId: number, value: any) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
    setValidationErrors(prev => {
      const newErrors = new Set(prev);
      newErrors.delete(questionId);
      return newErrors;
    });
  }, []);

  const validateCurrentPage = useCallback(() => {
    const requiredQuestions = currentPageQuestions.filter(q => q.required);
    const errors: number[] = [];
    
    requiredQuestions.forEach(q => {
      const value = responses[q.id];
      if (!value || (typeof value === 'string' && value.trim() === '') || 
          (Array.isArray(value) && value.length === 0)) {
        errors.push(q.id);
      }
    });
    
    if (errors.length > 0) {
      setValidationErrors(new Set(errors));
      toast.error('Please fill in all required fields');
      return false;
    }
    return true;
  }, [currentPageQuestions, responses]);

  const handleNext = () => {
    if (validateCurrentPage()) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentPage(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateCurrentPage()) return;
    
    setIsSubmitting(true);
    try {
      // Here you would save the responses to the database
      // For now, we just show success
      toast.success('Inspection submitted successfully!');
      handleClose();
    } catch (error: any) {
      toast.error('Failed to submit: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setResponses({});
    setValidationErrors(new Set());
    setCurrentPage(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content 
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] flex flex-col w-full max-w-4xl max-h-[90vh]",
            "translate-x-[-50%] translate-y-[-50%] overflow-hidden scrollbar-hide",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          )}
        >
          {/* Header */}
          <div className="bg-card rounded-t-xl border border-b-0 px-6 py-4">
            <div className="flex items-center gap-3">
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {template?.name || "Untitled Template"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Complete the inspection by filling out all required fields below.
                </DialogDescription>
              </div>
            </div>
          </div>
          <Separator />
          
          {/* Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto">
              <div className="bg-card border border-t-0 shadow-sm p-6 min-h-[400px]">
                {isLoading ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading questions...</p>
                  </div>
                ) : currentPageQuestions.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No questions</h3>
                    <p className="text-sm text-muted-foreground">
                      This template has no questions configured.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentPageQuestions.map((question, index) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        questionNumber={questionOffset + index + 1}
                        responseValue={responses[question.id]}
                        onResponseChange={handleResponseChange}
                        hasError={validationErrors.has(question.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <Separator />
          <div className="bg-card rounded-b-xl border border-t-0 px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {totalPages > 1 && `Page ${currentPage + 1} of ${totalPages}`}
            </div>
            <div className="flex items-center gap-3">
              {totalPages > 1 && !isFirstPage && (
                <Button 
                  variant="ghost" 
                  onClick={handlePrevious}
                  className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                  style={{ border: "1px solid #00000052" }}
                >
                  Previous
                </Button>
              )}
              {totalPages > 1 && !isLastPage && (
                <Button 
                  variant="ghost" 
                  onClick={handleNext}
                  className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                  style={{ border: "1px solid #00000052" }}
                >
                  Next
                </Button>
              )}
              {isLastPage && (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
                    style={{ border: "1px solid #00000052" }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
