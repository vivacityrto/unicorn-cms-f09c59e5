import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Search, Plus, Pencil, Building2, FileText, Box, Building, Type, Hash, CheckSquare, CalendarDays, Image, SlidersHorizontal, MessageSquare, PenTool, MapPin, GripVertical, Trash2, X, Eye, Shield, ToggleLeft, Star, CircleDot, AlertTriangle, CheckCircle, List, CalendarClock, AlignLeft, FileStack, Upload, File } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from '@/lib/utils';
import { useAuditTemplates, useAuditTemplateQuestions, AuditTemplateQuestion } from '@/hooks/useAuditTemplates';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useReusableAuditTemplates, ResponseOption } from '@/hooks/useReusableAuditTemplates';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';

// Hook to fetch tenants/clients
function useTenants() {
  return useQuery({
    queryKey: ['tenants-clients'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('tenants').select('id, name, created_at, status').order('name');
      if (error) throw error;
      return data || [];
    }
  });
}

// Hook to fetch documents
function useDocuments() {
  return useQuery({
    queryKey: ['documents-list'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('documents').select('id, title, category').order('category').order('title');
      if (error) throw error;
      return data || [];
    }
  });
}

// Clients dropdown preview component with smart search
function ClientsDropdownPreview() {
  const {
    data: tenants,
    isLoading
  } = useTenants();
  const [selectedClient, setSelectedClient] = useState<string>('');
  const clientOptions: ComboboxOption[] = useMemo(() => {
    if (!tenants) return [];
    return tenants.map(tenant => ({
      value: String(tenant.id),
      label: tenant.name || 'Unnamed Client',
      group: (tenant.name || 'Other').charAt(0).toUpperCase(),
      createdAt: tenant.created_at || undefined,
      status: tenant.status || undefined
    }));
  }, [tenants]);
  return <Combobox options={clientOptions} value={selectedClient} onValueChange={setSelectedClient} placeholder={isLoading ? "Loading clients..." : "Search clients..."} searchPlaceholder="Type to search clients..." emptyText="No clients found." disabled={isLoading} className="bg-muted/50 border-dashed" />;
}

// Documents dropdown preview component with smart search
function DocumentsDropdownPreview() {
  const {
    data: documents,
    isLoading
  } = useDocuments();
  const [selectedDocument, setSelectedDocument] = useState<string>('');
  const documentOptions: ComboboxOption[] = useMemo(() => {
    if (!documents) return [];
    return documents.map(doc => ({
      value: String(doc.id),
      label: doc.title || 'Untitled Document',
      group: doc.category || 'Uncategorized'
    }));
  }, [documents]);
  return <Combobox options={documentOptions} value={selectedDocument} onValueChange={setSelectedDocument} placeholder={isLoading ? "Loading documents..." : "Search documents..."} searchPlaceholder="Type to search documents..." emptyText="No documents found." disabled={isLoading} className="bg-muted/50 border-dashed" />;
}

// Hook to fetch Vivacity Team users
function useVivacityTeamUsers() {
  return useQuery({
    queryKey: ['vivacity-team-users'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('users').select('user_uuid, first_name, last_name, email').eq('user_type', 'Vivacity Team').order('first_name');
      if (error) throw error;
      return data || [];
    }
  });
}

// Vivacity Team dropdown preview component with smart search
function VivacityTeamDropdownPreview() {
  const {
    data: users,
    isLoading
  } = useVivacityTeamUsers();
  const [selectedUser, setSelectedUser] = useState<string>('');
  const userOptions: ComboboxOption[] = useMemo(() => {
    if (!users) return [];
    return users.map(user => ({
      value: user.user_uuid,
      label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User',
      group: (user.first_name || 'Other').charAt(0).toUpperCase()
    }));
  }, [users]);
  return <Combobox options={userOptions} value={selectedUser} onValueChange={setSelectedUser} placeholder={isLoading ? "Loading team members..." : "Search Vivacity Team..."} searchPlaceholder="Type to search team members..." emptyText="No team members found." disabled={isLoading} className="bg-muted/50 border-dashed" />;
}
interface ResponseSet {
  id: string;
  name: string;
  options: {
    label: string;
    color?: string;
  }[];
}
interface QuestionType {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  category: 'title_page' | 'other_responses';
}

// Default response sets are now fetched from the database via useReusableAuditTemplates hook

const questionTypes: QuestionType[] = [{
  id: 'clients',
  label: 'Clients',
  icon: Building2,
  color: 'text-blue-500',
  category: 'title_page'
}, {
  id: 'documents',
  label: 'Documents',
  icon: FileText,
  color: 'text-orange-500',
  category: 'title_page'
}, {
  id: 'asset',
  label: 'Asset',
  icon: Box,
  color: 'text-cyan-500',
  category: 'title_page'
}, {
  id: 'vivacity_team',
  label: 'Vivacity Team',
  icon: Building,
  color: 'text-blue-600',
  category: 'title_page'
}, {
  id: 'text_answer',
  label: 'Text answer',
  icon: Type,
  color: 'text-red-500',
  category: 'other_responses'
}, {
  id: 'number',
  label: 'Number',
  icon: Hash,
  color: 'text-blue-500',
  category: 'other_responses'
}, {
  id: 'checkbox',
  label: 'Checkbox',
  icon: CheckSquare,
  color: 'text-blue-600',
  category: 'other_responses'
}, {
  id: 'date_time',
  label: 'Date & Time',
  icon: CalendarDays,
  color: 'text-green-600',
  category: 'other_responses'
}, {
  id: 'media',
  label: 'Media',
  icon: Image,
  color: 'text-purple-500',
  category: 'other_responses'
}, {
  id: 'slider',
  label: 'Slider',
  icon: SlidersHorizontal,
  color: 'text-cyan-500',
  category: 'other_responses'
}, {
  id: 'annotation',
  label: 'Annotation',
  icon: MessageSquare,
  color: 'text-amber-500',
  category: 'other_responses'
}, {
  id: 'signature',
  label: 'Signature',
  icon: PenTool,
  color: 'text-blue-500',
  category: 'other_responses'
}, {
  id: 'location',
  label: 'Location',
  icon: MapPin,
  color: 'text-red-500',
  category: 'other_responses'
}, {
  id: 'paragraph',
  label: 'Paragraph',
  icon: AlignLeft,
  color: 'text-purple-600',
  category: 'other_responses'
}, {
  id: 'page_break',
  label: 'Next Page',
  icon: FileStack,
  color: 'text-indigo-500',
  category: 'other_responses'
}];
interface CanvasQuestion {
  id: string;
  tempId?: string;
  question_type: string;
  label: string;
  order_index: number;
  options?: any[];
  category: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  notes?: string;
  media_files?: { name: string; url: string }[];
}
function SortableQuestionCard({
  question,
  onDelete,
  onUpdate,
  previewMode = false,
  questionNumber,
  responseValue,
  onResponseChange,
  hasError
}: {
  question: CanvasQuestion;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<CanvasQuestion>) => void;
  previewMode?: boolean;
  questionNumber?: number;
  responseValue?: any;
  onResponseChange?: (questionId: string, value: any) => void;
  hasError?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: question.id
  });
  const [isFocused, setIsFocused] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(
    responseValue !== undefined && question.options?.length 
      ? question.options.findIndex((opt: any) => opt.label === responseValue)
      : null
  );
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const questionType = questionTypes.find(q => q.id === question.question_type);
  const Icon = questionType?.icon || FileText;
  const getPlaceholderByType = (type: string) => {
    switch (type) {
      case 'text_answer':
        return 'Enter your answer here...';
      case 'number':
        return 'Enter a number...';
      case 'clients':
        return 'Select a client...';
      case 'vivacity_team':
        return 'Select a team member...';
      case 'documents':
        return 'Select a document...';
      case 'asset':
        return 'Enter asset ID...';
      case 'date_time':
        return 'Select date and time...';
      case 'location':
        return 'Enter or select location...';
      case 'signature':
        return 'Sign here...';
      default:
        return 'Enter response...';
    }
  };
  const renderInputPreview = () => {
    switch (question.question_type) {
      case 'clients':
        return <ClientsDropdownPreview />;
      case 'documents':
        return <DocumentsDropdownPreview />;
      case 'vivacity_team':
        return <VivacityTeamDropdownPreview />;
      case 'text_answer':
      case 'asset':
        return <Input 
          placeholder={question.placeholder || getPlaceholderByType(question.question_type)} 
          className={cn("bg-muted/50 border-dashed", hasError && "border-destructive")}
          value={responseValue || ''}
          onChange={(e) => onResponseChange?.(question.id, e.target.value)}
        />;
      case 'number':
        return <Input 
          type="number" 
          placeholder={question.placeholder || getPlaceholderByType(question.question_type)} 
          className={cn("bg-muted/50 border-dashed w-full", hasError && "border-destructive")}
          value={responseValue || ''}
          onChange={(e) => onResponseChange?.(question.id, e.target.value)}
        />;
      case 'checkbox':
        const checkboxOptions = question.options && question.options.length > 0 ? question.options : [{
          id: '1',
          label: 'Option 1'
        }, {
          id: '2',
          label: 'Option 2'
        }];
        const updateCheckboxOption = (optionId: string, newLabel: string) => {
          const updatedOptions = checkboxOptions.map(opt => opt.id === optionId ? {
            ...opt,
            label: newLabel
          } : opt);
          onUpdate(question.id, {
            options: updatedOptions
          });
        };
        const addCheckboxOption = () => {
          const newOption = {
            id: String(Date.now()),
            label: `Option ${checkboxOptions.length + 1}`
          };
          onUpdate(question.id, {
            options: [...checkboxOptions, newOption]
          });
        };
        const removeCheckboxOption = (optionId: string) => {
          if (checkboxOptions.length <= 1) return;
          const updatedOptions = checkboxOptions.filter(opt => opt.id !== optionId);
          onUpdate(question.id, {
            options: updatedOptions
          });
        };
        return <div className="space-y-3">
            {checkboxOptions.map((option: {
            id: string;
            label: string;
          }, index: number) => <div key={option.id} className="group relative flex items-center gap-3 py-1 px-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all duration-200">
              
              <Checkbox className="h-5 w-5 rounded-md border-2 border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              <Input value={option.label} onChange={e => updateCheckboxOption(option.id, e.target.value)} placeholder="Enter option..." className="flex-1 h-9 text-sm bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60" />
              {checkboxOptions.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all" onClick={() => removeCheckboxOption(option.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>}
            </div>)}
            <Button variant="outline" size="sm" className="w-full mt-2 border-dashed border-violet-400/50 text-violet-500 hover:bg-violet-50 hover:border-violet-400 hover:text-violet-500 transition-all" onClick={addCheckboxOption}>
              <Plus className="h-4 w-4 mr-2" />
              Add option
            </Button>
          </div>;
      case 'date_time':
        return <div className="grid grid-cols-2 gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-primary/5 hover:border-primary/30 transition-all")}>
                <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Pick a date</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[80]" align="start">
              <Calendar mode="single" initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-primary/5 hover:border-primary/30 transition-all")}>
                <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Pick a time</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4 z-[80]" align="start">
              <div className="flex items-center gap-2 pointer-events-auto">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Hour</Label>
                  <Select defaultValue="09">
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({
                        length: 12
                      }, (_, i) => i + 1).map(h => <SelectItem key={h} value={h.toString().padStart(2, "0")}>
                          {h.toString().padStart(2, "0")}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-2xl font-bold mt-5">:</span>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Minute</Label>
                  <Select defaultValue="00">
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({
                        length: 60
                      }, (_, i) => i).map(m => <SelectItem key={m} value={m.toString().padStart(2, "0")}>
                          {m.toString().padStart(2, "0")}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Period</Label>
                  <Select defaultValue="AM">
                    <SelectTrigger className="w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>;
      case 'media':
        return <label className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors block">
            <input type="file" accept="image/*,video/*" className="hidden" />
            <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
          </label>;
      case 'slider':
        return <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
            <input type="range" min="0" max="100" defaultValue="50" className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary" />
          </div>;
      case 'signature':
        return <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
            <PenTool className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click to sign here</p>
          </div>;
      case 'location':
        return <div className="flex items-center gap-2">
            <Input placeholder={getPlaceholderByType(question.question_type)} className="bg-muted/50 border-dashed flex-1" />
            <Button variant="outline" size="icon" className="shrink-0">
              <MapPin className="h-4 w-4" />
            </Button>
          </div>;
      case 'multiple_choice':
        const colorMapPreview: Record<string, string> = {
          'bg-green-500': 'bg-green-500/15 text-green-600 border-green-500/30',
          'bg-red-500': 'bg-red-500/15 text-red-600 border-red-500/30',
          'bg-blue-500': 'bg-blue-500/15 text-blue-600 border-blue-500/30',
          'bg-yellow-500': 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
          'bg-purple-500': 'bg-purple-500/15 text-purple-600 border-purple-500/30',
          'bg-orange-500': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
          'bg-muted': 'bg-muted/80 text-muted-foreground border-border'
        };
        return <div className="flex flex-wrap gap-2">
            {question.options?.map((opt: any, idx: number) => {
            const isSelected = selectedOptionIdx === idx;
            const badgeClassPreview = isSelected ? colorMapPreview[opt.color || 'bg-muted'] || colorMapPreview['bg-muted'] : 'bg-muted/50 text-muted-foreground border-border/50';
            return <span key={idx} onClick={() => {
              setSelectedOptionIdx(idx);
              onResponseChange?.(question.id, opt.label);
            }} className={cn("px-2.5 py-1 rounded-lg text-[15px] font-normal border backdrop-blur-sm cursor-pointer transition-all duration-200", badgeClassPreview, isSelected ? "scale-105" : "hover:bg-muted/80")}>
                {opt.label}
              </span>;
          })}
          </div>;
      case 'annotation':
        return <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">Add notes or comments...</span>
            </div>
          </div>;
      default:
        return null;
    }
  };
  return <div ref={setNodeRef} style={style} className={cn("bg-card border rounded-lg shadow-sm transition-all duration-200", isDragging && "opacity-50 shadow-xl scale-[1.02]", hasError && "border-destructive ring-1 ring-destructive/20", isFocused ? "border-primary/50 shadow-md ring-1 ring-primary/20" : !hasError && "border-border/60 hover:border-border hover:shadow-md")} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}>
      {/* Header with drag handle and delete */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border/40 rounded-t-lg">
        <div className="flex items-center gap-3">
          {previewMode ? <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {questionNumber}.
            </span> : <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-background/80 transition-colors">
              <GripVertical className="h-4 w-4" />
            </button>}
          <div className={cn("h-8 w-8 rounded-md flex items-center justify-center bg-background shadow-sm border border-border/50", questionType?.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {question.question_type.replace(/_/g, ' ')}
          </span>
        </div>
        {!previewMode && <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={() => onDelete(question.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>}
      </div>

      {/* Content area */}
      <div className="p-5 space-y-4">
        {/* Question label input */}
        <Input value={question.label} onChange={e => onUpdate(question.id, {
        label: e.target.value
      })} placeholder="Enter your question" className="text-base font-medium border-none bg-transparent px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50" />

        {/* Input preview based on question type */}
        <div className="pt-2">
          {renderInputPreview()}
        </div>
      </div>

      {/* Footer with actions */}
      <div className="bg-muted/20 border-t border-border/40 rounded-b-lg">
        {/* Notes display or input */}
        {question.notes && !isEditingNote ? (
          <div className="px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-foreground">{question.notes}</p>
            <button 
              onClick={() => {
                setShowNotes(true);
                setIsEditingNote(true);
              }} 
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ) : showNotes && (
          <>
            <div className="px-5 py-3">
              <Input 
                value={question.notes || ''} 
                onChange={e => onUpdate(question.id, { notes: e.target.value })} 
                placeholder="Add Notes" 
                className="w-full text-sm text-muted-foreground border-none bg-transparent px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40" 
              />
            </div>
            {/* Separator */}
            <div className="border-t border-border/40 mx-5" />
          </>
        )}
        
        {/* Media upload section */}
        {showMedia && (
          <>
            <div className="px-5 py-3">
              <div className="border-2 border-dashed rounded-lg p-4 bg-muted/30">
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,video/*,.pdf,.doc,.docx" 
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      const newFiles = Array.from(files).map(file => ({
                        name: file.name,
                        url: URL.createObjectURL(file)
                      }));
                      const existingFiles = question.media_files || [];
                      onUpdate(question.id, { media_files: [...existingFiles, ...newFiles] });
                      setShowMedia(false);
                    }
                  }}
                  className="hidden" 
                  id={`media-upload-${question.id}`} 
                />
                <label htmlFor={`media-upload-${question.id}`} className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload media files</p>
                  <p className="text-xs text-muted-foreground/60">Images, videos, PDFs, documents</p>
                </label>
              </div>
            </div>
            {/* Separator */}
            <div className="border-t border-border/40 mx-5" />
          </>
        )}
        
        {/* Media files display */}
        {question.media_files && question.media_files.length > 0 && (
          <>
            <div className="px-5 py-3 flex flex-wrap gap-2">
              {question.media_files.map((file, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                >
                  <File className="h-3.5 w-3.5" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button 
                    onClick={() => {
                      const updatedFiles = question.media_files?.filter((_, i) => i !== index);
                      onUpdate(question.id, { media_files: updatedFiles });
                    }}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Separator */}
            <div className="border-t border-border/40 mx-5" />
          </>
        )}
        
        {/* Required and action buttons row */}
        <div className="flex items-center justify-between px-5 py-3">
          {!previewMode ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground transition-colors">
              <input type="checkbox" checked={question.required || false} onChange={e => onUpdate(question.id, {
              required: e.target.checked
            })} className="rounded border-muted-foreground/30" />
              <span className="flex items-center gap-1">
                {question.required && <span className="text-destructive">*</span>}
                <span className="text-foreground">Required</span>
              </span>
            </label>
          ) : (
            question.required ? (
              <span className="flex items-center gap-1 text-sm">
                <span className="text-destructive">*</span>
                <span className="text-foreground">Required</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Optional</span>
            )
          )}
          <div className="flex items-center gap-4">
            {!previewMode && !question.required && (
              <span className="text-sm text-muted-foreground">Optional</span>
            )}
            <button 
              onClick={() => {
                if (showNotes && question.notes) {
                  // Save the note
                  setShowNotes(false);
                  setIsEditingNote(false);
                } else {
                  // Show the note input
                  setShowNotes(!showNotes);
                  setIsEditingNote(true);
                }
              }} 
              className={cn("flex items-center gap-2 text-sm cursor-pointer transition-colors", showNotes ? "text-primary" : "text-muted-foreground hover:text-primary")}
            >
              <MessageSquare className="h-4 w-4" />
              {showNotes && question.notes ? "Save Note" : "Add Note"}
            </button>
            <button 
              onClick={() => setShowMedia(!showMedia)}
              className={cn("flex items-center gap-2 text-sm cursor-pointer transition-colors", showMedia || (question.media_files && question.media_files.length > 0) ? "text-primary" : "text-muted-foreground hover:text-primary")}
            >
              <Image className="h-4 w-4" />
              {question.media_files && question.media_files.length > 0 ? `Media (${question.media_files.length})` : "Add Media"}
            </button>
            <button className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors">
              <Plus className="h-4 w-4" />
              Create Action
            </button>
          </div>
        </div>
      </div>
    </div>;
}
export default function AuditTemplateBuilder() {
  const navigate = useNavigate();
  const {
    templateId: templateIdParam
  } = useParams();
  const {
    profile
  } = useAuth();
  const {
    createTemplate,
    updateTemplate
  } = useAuditTemplates();
  const [templateId, setTemplateId] = useState<number | undefined>(templateIdParam ? parseInt(templateIdParam) : undefined);
  const {
    questions: savedQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions
  } = useAuditTemplateQuestions(templateId);

  // Reusable audit templates (response sets)
  const {
    templates: reusableTemplates,
    isLoading: isLoadingTemplates,
    createTemplate: createReusableTemplate,
    updateTemplate: updateReusableTemplate,
    deleteTemplate: deleteReusableTemplate
  } = useReusableAuditTemplates();
  const [templateName, setTemplateName] = useState('Untitled template');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResponseSets, setSelectedResponseSets] = useState<string[]>([]);
  const [canvasQuestions, setCanvasQuestions] = useState<CanvasQuestion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [isLoading, setIsLoading] = useState(!!templateIdParam);
  const [previewResponses, setPreviewResponses] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Create response set dialog state
  const [isCreateResponseSetOpen, setIsCreateResponseSetOpen] = useState(false);
  const [editingResponseSet, setEditingResponseSet] = useState<{
    id: number;
    name: string;
    options: ResponseOption[];
  } | null>(null);
  const [newResponseSetName, setNewResponseSetName] = useState('');
  const [newResponseSetType, setNewResponseSetType] = useState<'multiple_choice' | 'text_answer' | 'number' | 'checkbox' | 'date_time' | 'slider'>('multiple_choice');
  const [newResponseSetOptions, setNewResponseSetOptions] = useState<ResponseOption[]>([{
    label: 'Option 1',
    color: 'bg-green-500'
  }, {
    label: 'Option 2',
    color: 'bg-red-500'
  }]);

  // Load existing template data in edit mode
  useEffect(() => {
    const loadTemplate = async () => {
      if (!templateIdParam) return;
      setIsLoading(true);
      try {
        // Load template details
        const {
          data: template,
          error: templateError
        } = await supabase.from('audit_templates').select('*').eq('id', parseInt(templateIdParam)).single();
        if (templateError) throw templateError;
        if (template) {
          setTemplateName(template.name);
        }

        // Load template questions
        const {
          data: questions,
          error: questionsError
        } = await supabase.from('audit_template_questions').select('*').eq('template_id', parseInt(templateIdParam)).order('order_index', {
          ascending: true
        });
        if (questionsError) throw questionsError;
        if (questions && questions.length > 0) {
          const loadedQuestions: CanvasQuestion[] = questions.map(q => ({
            id: q.id.toString(),
            question_type: q.question_type,
            label: q.label,
            order_index: q.order_index,
            options: q.options as any[] || [],
            required: q.required,
            category: q.category,
            description: ''
          }));
          setCanvasQuestions(loadedQuestions);
        }
      } catch (error: any) {
        toast.error('Failed to load template: ' + error.message);
        navigate('/audits');
      } finally {
        setIsLoading(false);
      }
    };
    loadTemplate();
  }, [templateIdParam, navigate]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }));
  const titlePageTypes = questionTypes.filter(q => q.category === 'title_page');
  const otherResponseTypes = questionTypes.filter(q => q.category === 'other_responses');
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      setCanvasQuestions(items => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          order_index: index
        }));
        return newItems;
      });
    }
  };
  const addQuestionToCanvas = useCallback((type: QuestionType, responseSet?: ResponseSet) => {
    const newQuestion: CanvasQuestion = {
      id: `temp-${Date.now()}`,
      tempId: `temp-${Date.now()}`,
      question_type: responseSet ? 'multiple_choice' : type.id,
      label: '',
      order_index: canvasQuestions.length,
      options: responseSet ? responseSet.options : [],
      category: type.category
    };
    setCanvasQuestions(prev => [...prev, newQuestion]);
    toast.success(`Added "${newQuestion.label}" to template`);
  }, [canvasQuestions.length]);
  const deleteCanvasQuestion = useCallback((id: string) => {
    setCanvasQuestions(prev => prev.filter(q => q.id !== id));
  }, []);
  const updateCanvasQuestion = useCallback((id: string, updates: Partial<CanvasQuestion>) => {
    setCanvasQuestions(prev => prev.map(q => q.id === id ? {
      ...q,
      ...updates
    } : q));
  }, []);
  const handleSaveTemplate = async () => {
    if (!profile?.tenant_id) {
      toast.error('You must be logged in to save templates');
      return;
    }
    setIsSaving(true);
    try {
      let currentTemplateId = templateId;

      // Create or update the template
      if (!currentTemplateId) {
        const result = await createTemplate.mutateAsync({
          name: templateName,
          status: 'draft',
          access: 'all_users'
        });
        currentTemplateId = result.id;
        setTemplateId(result.id);
      } else {
        await updateTemplate.mutateAsync({
          id: currentTemplateId,
          name: templateName
        });
      }

      // Get existing question IDs from canvas (non-temp questions that were loaded)
      const existingQuestionIds = canvasQuestions.filter(q => !q.tempId && q.id).map(q => parseInt(q.id));

      // Delete questions that were removed from canvas
      if (templateIdParam) {
        const {
          data: dbQuestions
        } = await supabase.from('audit_template_questions').select('id').eq('template_id', currentTemplateId!);
        if (dbQuestions) {
          const dbQuestionIds = dbQuestions.map(q => q.id);
          const removedIds = dbQuestionIds.filter(id => !existingQuestionIds.includes(id));
          for (const id of removedIds) {
            await supabase.from('audit_template_questions').delete().eq('id', id);
          }
        }
      }

      // Save/update all questions
      for (const question of canvasQuestions) {
        if (question.tempId) {
          // New question - insert it
          await addQuestion.mutateAsync({
            template_id: currentTemplateId!,
            question_type: question.question_type,
            label: question.label,
            order_index: question.order_index,
            options: question.options,
            category: question.category,
            required: question.required || false
          });
        } else if (question.id) {
          // Existing question - update it
          await supabase.from('audit_template_questions').update({
            label: question.label,
            order_index: question.order_index,
            options: question.options,
            required: question.required || false,
            updated_at: new Date().toISOString()
          }).eq('id', parseInt(question.id));
        }
      }
      toast.success('Template saved successfully!');
      navigate('/audits');
    } catch (error: any) {
      toast.error('Failed to save template: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading template...</p>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/audits')} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black [&:hover_svg]:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          <div>
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} className="text-xl font-semibold border-none bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 cursor-text" placeholder="Template name" />
              <p className="text-sm text-muted-foreground">
                {canvasQuestions.length} question{canvasQuestions.length !== 1 ? 's' : ''} added
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setIsPreviewOpen(true)} disabled={canvasQuestions.length === 0} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black [&:hover_svg]:text-black" style={{
            boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
            border: "1px solid #00000052"
          }}>
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button onClick={handleSaveTemplate} disabled={isSaving || canvasQuestions.length === 0} className="bg-primary hover:bg-primary/90">
              {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel - Response Sets */}
        <div className="w-80 border-r bg-card flex flex-col">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-background" />
            </div>
          </div>

          <ScrollArea className="flex-1 px-4">
            {/* Multiple choice responses */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Saved choice responses</h3>
                <Button variant="ghost" size="sm" className="h-7 text-primary hover:text-primary/80 hover:bg-transparent text-xs" onClick={() => setIsCreateResponseSetOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Responses
                </Button>
              </div>
              <div className="space-y-2">
                {isLoadingTemplates ? <div className="text-sm text-muted-foreground text-center py-4">Loading response sets...</div> : reusableTemplates && reusableTemplates.length > 0 ? reusableTemplates.map(template => <div key={template.id} className={cn("relative rounded-xl border bg-card/50 backdrop-blur-sm cursor-pointer transition-all duration-200 group overflow-hidden", selectedResponseSets.includes(String(template.id)) ? "border-primary/50 bg-primary/5 shadow-md shadow-primary/10" : "border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:bg-card")} onClick={() => {
                addQuestionToCanvas({
                  id: 'multiple_choice',
                  label: template.name,
                  icon: CheckSquare,
                  color: 'text-purple-600',
                  category: 'other_responses'
                }, {
                  id: String(template.id),
                  name: template.name,
                  options: template.options
                });
              }}>
                      {/* Gradient accent line */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="p-3">
                        {/* Card Header */}
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                              {(() => {
                          const name = template.name.toLowerCase();
                          const optionLabels = template.options.map(o => o.label.toLowerCase()).join(' ');

                          // Check for compliance-related
                          if (name.includes('complian') || optionLabels.includes('compliant') || optionLabels.includes('non-compliant')) {
                            return <Shield className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Check for yes/no type
                          if (name.includes('yes') || name.includes('no') || optionLabels.includes('yes') && optionLabels.includes('no')) {
                            return <ToggleLeft className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Check for rating/scale type
                          if (name.includes('rating') || name.includes('scale') || name.includes('likert') || name.includes('satisfaction')) {
                            return <Star className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Check for status type
                          if (name.includes('status') || optionLabels.includes('complete') || optionLabels.includes('progress')) {
                            return <CircleDot className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Check for priority type
                          if (name.includes('priority') || optionLabels.includes('high') || optionLabels.includes('medium') || optionLabels.includes('low')) {
                            return <AlertTriangle className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Check for pass/fail type
                          if (optionLabels.includes('pass') || optionLabels.includes('fail')) {
                            return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
                          }
                          // Default icon
                          return <List className="h-3.5 w-3.5 text-primary" />;
                        })()}
                            </div>
                            <span className="text-sm font-semibold text-foreground truncate max-w-[150px]">{template.name}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {template.is_global && <span className="text-[10px] text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full font-medium">Global</span>}
                            {!template.is_global && <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={e => {
                          e.stopPropagation();
                          setEditingResponseSet({
                            id: template.id,
                            name: template.name,
                            options: template.options
                          });
                          setNewResponseSetName(template.name);
                          setNewResponseSetOptions(template.options);
                          setIsCreateResponseSetOpen(true);
                        }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={e => {
                          e.stopPropagation();
                          if (confirm(`Delete "${template.name}"? This cannot be undone.`)) {
                            deleteReusableTemplate.mutate(template.id);
                          }
                        }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>}
                          </div>
                        </div>
                        
                        {/* Modern Badge Style Options */}
                        <div className="flex flex-wrap items-center gap-2 w-full">
                          {template.options.map((option, idx) => {
                      const colorMap: Record<string, string> = {
                        'bg-green-500': 'bg-green-500/15 text-green-600 border-green-500/30',
                        'bg-red-500': 'bg-red-500/15 text-red-600 border-red-500/30',
                        'bg-yellow-500': 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
                        'bg-blue-500': 'bg-blue-500/15 text-blue-600 border-blue-500/30',
                        'bg-purple-500': 'bg-purple-500/15 text-purple-600 border-purple-500/30',
                        'bg-orange-500': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
                        'bg-muted': 'bg-muted/80 text-muted-foreground border-border'
                      };
                      const badgeClass = colorMap[option.color || 'bg-muted'] || colorMap['bg-muted'];
                      return <span key={idx} className={cn("px-2.5 py-1 rounded-lg text-[15px] font-normal border backdrop-blur-sm text-center whitespace-nowrap", badgeClass)}>
                                {option.label}
                              </span>;
                    })}
                        </div>
                      </div>
                    </div>) : <div className="text-sm text-muted-foreground text-center py-4">No response sets available</div>}
              </div>
            </div>

            <Separator className="my-4" />
          </ScrollArea>
        </div>

        {/* Center Panel - Template Builder Canvas */}
        <div className="flex-1 bg-muted/30 p-8 overflow-auto">
          <div className="max-w-3xl mx-auto">
            <div className="bg-card rounded-xl border shadow-sm p-6 min-h-[500px]">
              {canvasQuestions.length === 0 ? <div className="text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Add questions to your template</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Click on response types from the side panels to add questions to your inspection template.
                  </p>
                </div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <SortableContext items={canvasQuestions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {canvasQuestions.map(question => <SortableQuestionCard key={question.id} question={question} onDelete={deleteCanvasQuestion} onUpdate={updateCanvasQuestion} />)}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeId ? <div className="bg-card border rounded-lg p-4 shadow-xl opacity-80">
                        <p className="font-medium text-sm">
                          {canvasQuestions.find(q => q.id === activeId)?.label}
                        </p>
                      </div> : null}
                  </DragOverlay>
                </DndContext>}
            </div>
          </div>
        </div>

        {/* Right Panel - Question Types */}
        <div className="w-72 border-l bg-card">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Title page information */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-primary mb-3">System Responses</h3>
                <div className="space-y-1">
                  {titlePageTypes.map(type => {
                  const Icon = type.icon;
                  return <div key={type.id} onClick={() => addQuestionToCanvas(type)} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
                        <Icon className={cn("h-5 w-5", type.color)} />
                        <span className="text-sm font-medium text-foreground flex-1">{type.label}</span>
                        <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>;
                })}
                </div>
              </div>

              <Separator className="my-4" />

              {/* Other responses */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Other responses</h3>
                <div className="space-y-1">
                  {otherResponseTypes.map(type => {
                  const Icon = type.icon;
                  return <div key={type.id} onClick={() => addQuestionToCanvas(type)} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
                        <Icon className={cn("h-5 w-5", type.color)} />
                        <span className="text-sm font-medium text-foreground flex-1">{type.label}</span>
                        <Plus className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>;
                })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={open => {
      setIsPreviewOpen(open);
      if (!open) {
        setPreviewPage(0);
        setPreviewResponses({});
        setValidationErrors(new Set());
      }
    }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/70" />
          <DialogPrimitive.Content className={cn("fixed left-[50%] top-[50%] z-[70] flex flex-col w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] overflow-hidden scrollbar-hide duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]")}>
            {/* Preview Header */}
            <div className="bg-card rounded-t-xl border border-b-0 px-6 py-4">
              <div className="flex items-center gap-3">
                
                <div>
                  <DialogTitle className="text-lg font-semibold text-foreground">{templateName || "Untitled Template"}</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    You're viewing how this template will appear to users. Close to continue editing.
                  </DialogDescription>
                </div>
              </div>
            </div>
            <Separator />
            
            {/* Same canvas container as edit mode */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-4xl mx-auto">
                <div className="bg-card border border-t-0 shadow-sm p-6 min-h-[400px]">
                  {(() => {
                    // Split questions into pages based on page_break
                    const pages: CanvasQuestion[][] = [];
                    let currentPage: CanvasQuestion[] = [];
                    
                    canvasQuestions.forEach((question) => {
                      if (question.question_type === 'page_break') {
                        if (currentPage.length > 0) {
                          pages.push(currentPage);
                          currentPage = [];
                        }
                      } else {
                        currentPage.push(question);
                      }
                    });
                    if (currentPage.length > 0) {
                      pages.push(currentPage);
                    }
                    
                    const totalPages = pages.length;
                    const currentPageQuestions = pages[previewPage] || [];
                    
                    // Calculate question number offset for current page
                    let questionOffset = 0;
                    for (let i = 0; i < previewPage; i++) {
                      questionOffset += (pages[i] || []).length;
                    }
                    
                    if (canvasQuestions.length === 0 || currentPageQuestions.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Plus className="h-8 w-8 text-primary" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">No questions added</h3>
                          <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            Add questions to your template to see them here.
                          </p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-4">
                        {currentPageQuestions.map((question, index) => (
                          <SortableQuestionCard 
                            key={question.id} 
                            question={question} 
                            onDelete={deleteCanvasQuestion} 
                            onUpdate={updateCanvasQuestion} 
                            previewMode={true} 
                            questionNumber={questionOffset + index + 1}
                            responseValue={previewResponses[question.id]}
                            onResponseChange={(qId, value) => {
                              setPreviewResponses(prev => ({ ...prev, [qId]: value }));
                              setValidationErrors(prev => {
                                const newErrors = new Set(prev);
                                newErrors.delete(qId);
                                return newErrors;
                              });
                            }}
                            hasError={validationErrors.has(question.id)}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            
            {/* Sticky Footer */}
            <Separator />
            <div className="bg-card rounded-b-xl border border-t-0 px-6 py-4 flex items-center justify-between gap-3">
              {(() => {
                // Calculate total pages again for footer
                const pages: CanvasQuestion[][] = [];
                let currentPage: CanvasQuestion[] = [];
                
                canvasQuestions.forEach((question) => {
                  if (question.question_type === 'page_break') {
                    if (currentPage.length > 0) {
                      pages.push(currentPage);
                      currentPage = [];
                    }
                  } else {
                    currentPage.push(question);
                  }
                });
                if (currentPage.length > 0) {
                  pages.push(currentPage);
                }
                
                const totalPages = pages.length;
                const isLastPage = previewPage >= totalPages - 1;
                const isFirstPage = previewPage === 0;
                
                const currentPageQuestions = pages[previewPage] || [];
                
                // Validation function
                const validateCurrentPage = () => {
                  const requiredQuestions = currentPageQuestions.filter(q => q.required);
                  const errors: string[] = [];
                  
                  requiredQuestions.forEach(q => {
                    const value = previewResponses[q.id];
                    if (!value || (typeof value === 'string' && value.trim() === '')) {
                      errors.push(q.id);
                    }
                  });
                  
                  if (errors.length > 0) {
                    setValidationErrors(new Set(errors));
                    toast.error('Please fill in all required fields');
                    return false;
                  }
                  return true;
                };
                
                const handleNext = () => {
                  if (validateCurrentPage()) {
                    setPreviewPage(prev => prev + 1);
                  }
                };
                
                const handleSubmit = () => {
                  if (validateCurrentPage()) {
                    toast.success('Form submitted successfully!');
                    setIsPreviewOpen(false);
                    setPreviewResponses({});
                    setValidationErrors(new Set());
                    setPreviewPage(0);
                  }
                };
                
                return (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {totalPages > 1 && `Page ${previewPage + 1} of ${totalPages}`}
                    </div>
                    <div className="flex items-center gap-3">
                      {totalPages > 1 && !isFirstPage && (
                        <Button variant="ghost" onClick={() => setPreviewPage(prev => prev - 1)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{ boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)", border: "1px solid #00000052" }}>
                          Previous
                        </Button>
                      )}
                      {totalPages > 1 && !isLastPage && (
                        <Button variant="ghost" onClick={handleNext} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{ boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)", border: "1px solid #00000052" }}>
                          Next
                        </Button>
                      )}
                      {isLastPage && (
                        <>
                          <Button variant="ghost" onClick={() => {
                            setIsPreviewOpen(false);
                            setPreviewResponses({});
                            setValidationErrors(new Set());
                            setPreviewPage(0);
                          }} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{ boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)", border: "1px solid #00000052" }}>
                            Cancel
                          </Button>
                          <Button onClick={handleSubmit}>
                            Submit
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Create/Edit Response Set Dialog */}
      <Dialog open={isCreateResponseSetOpen} onOpenChange={open => {
      setIsCreateResponseSetOpen(open);
      if (!open) {
        setEditingResponseSet(null);
        setNewResponseSetName('');
        setNewResponseSetType('multiple_choice');
        setNewResponseSetOptions([{
          label: 'Option 1',
          color: 'bg-green-500'
        }, {
          label: 'Option 2',
          color: 'bg-red-500'
        }]);
      }
    }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/70" />
          <DialogPrimitive.Content className={cn("fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[500px] max-w-[90vw] max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden scrollbar-hide border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg")}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                {editingResponseSet ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editingResponseSet ? 'Edit Response Set' : 'Create Response Set'}
              </DialogTitle>
              <DialogDescription>
                {editingResponseSet ? 'Update your response template.' : 'Create a reusable response template for your audits.'}
              </DialogDescription>
            </DialogHeader>
            
            <Separator />
            
            <div className="overflow-y-auto scrollbar-hide flex-1 space-y-5 py-2 px-1">
              <div className="space-y-2">
                <Label htmlFor="response-set-name" className="text-sm font-medium">Name</Label>
                <Input id="response-set-name" placeholder="e.g., Risk Assessment, Pass/Fail" value={newResponseSetName} onChange={e => setNewResponseSetName(e.target.value)} className="bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Response Type</Label>
                <Combobox options={[{
                value: 'multiple_choice',
                label: 'Multiple Choice',
                group: 'Response Types'
              }, {
                value: 'text_answer',
                label: 'Text Answer',
                group: 'Response Types'
              }, {
                value: 'number',
                label: 'Number',
                group: 'Response Types'
              }, {
                value: 'checkbox',
                label: 'Checkbox',
                group: 'Response Types'
              }, {
                value: 'date_time',
                label: 'Date & Time',
                group: 'Response Types'
              }, {
                value: 'slider',
                label: 'Slider',
                group: 'Response Types'
              }]} value={newResponseSetType} onValueChange={val => setNewResponseSetType(val as typeof newResponseSetType)} placeholder="Select response type..." searchPlaceholder="Search types..." emptyText="No type found." className="bg-background" />
              </div>
              
              {newResponseSetType === 'multiple_choice' && <div className="space-y-3">
                  <Label className="text-sm font-medium">Options</Label>
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                    {newResponseSetOptions.map((option, idx) => <div key={idx} className="flex items-center gap-2">
                        <Input value={option.label} onChange={e => {
                    const updated = [...newResponseSetOptions];
                    updated[idx] = {
                      ...updated[idx],
                      label: e.target.value
                    };
                    setNewResponseSetOptions(updated);
                  }} placeholder="Option label" className="flex-1 bg-background" />
                        <Combobox showColorDots hideCheck options={[{
                    value: 'bg-green-500',
                    label: 'Green',
                    colorDot: 'bg-green-500'
                  }, {
                    value: 'bg-red-500',
                    label: 'Red',
                    colorDot: 'bg-red-500'
                  }, {
                    value: 'bg-yellow-500',
                    label: 'Yellow',
                    colorDot: 'bg-yellow-500'
                  }, {
                    value: 'bg-blue-500',
                    label: 'Blue',
                    colorDot: 'bg-blue-500'
                  }, {
                    value: 'bg-purple-500',
                    label: 'Purple',
                    colorDot: 'bg-purple-500'
                  }, {
                    value: 'bg-orange-500',
                    label: 'Orange',
                    colorDot: 'bg-orange-500'
                  }, {
                    value: 'bg-muted',
                    label: 'Gray',
                    colorDot: 'bg-gray-400'
                  }]} value={option.color || 'bg-muted'} onValueChange={val => {
                    const updated = [...newResponseSetOptions];
                    updated[idx] = {
                      ...updated[idx],
                      color: val
                    };
                    setNewResponseSetOptions(updated);
                  }} placeholder="Color" className="w-[110px] bg-background" />
                        {newResponseSetOptions.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setNewResponseSetOptions(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="h-4 w-4" />
                          </Button>}
                      </div>)}
                    <Button variant="outline" size="sm" className="w-full mt-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" onClick={() => setNewResponseSetOptions(prev => [...prev, {
                  label: `Option ${prev.length + 1}`,
                  color: 'bg-muted'
                }])}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Option
                    </Button>
                  </div>
                </div>}

              {newResponseSetType === 'slider' && <div className="space-y-3">
                  <Label className="text-sm font-medium">Slider Range</Label>
                  <div className="flex items-center gap-3 border rounded-lg p-3 bg-muted/20">
                    <Input type="number" placeholder="Min" defaultValue="0" className="flex-1 bg-background" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="number" placeholder="Max" defaultValue="100" className="flex-1 bg-background" />
                  </div>
                </div>}

              {(newResponseSetType === 'text_answer' || newResponseSetType === 'number' || newResponseSetType === 'checkbox' || newResponseSetType === 'date_time') && <div className="rounded-lg border border-dashed p-4 bg-muted/20">
                  <p className="text-sm text-muted-foreground text-center">
                    {newResponseSetType === 'text_answer' && 'Text answer will allow free-form text input'}
                    {newResponseSetType === 'number' && 'Number input will allow numeric values only'}
                    {newResponseSetType === 'checkbox' && 'Checkbox will allow yes/no or checked/unchecked responses'}
                    {newResponseSetType === 'date_time' && 'Date & Time picker for scheduling or recording dates'}
                  </p>
                </div>}
            </div>
            
            <Separator />
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => {
              setIsCreateResponseSetOpen(false);
              setEditingResponseSet(null);
            }} className="hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black">
                Cancel
              </Button>
              <Button onClick={async () => {
              if (!newResponseSetName.trim()) {
                toast.error('Please enter a name for the response set');
                return;
              }
              if (newResponseSetType === 'multiple_choice' && newResponseSetOptions.length < 2) {
                toast.error('Please add at least 2 options for multiple choice');
                return;
              }
              const optionsToSave = newResponseSetType === 'multiple_choice' ? newResponseSetOptions : [{
                label: newResponseSetType,
                color: 'bg-muted'
              }];
              if (editingResponseSet) {
                // Update existing response set
                await updateReusableTemplate.mutateAsync({
                  id: editingResponseSet.id,
                  name: newResponseSetName,
                  description: `Type: ${newResponseSetType}`,
                  options: optionsToSave
                });
              } else {
                // Create new response set
                await createReusableTemplate.mutateAsync({
                  name: newResponseSetName,
                  description: `Type: ${newResponseSetType}`,
                  options: optionsToSave
                });
              }
              setIsCreateResponseSetOpen(false);
              setEditingResponseSet(null);
              setNewResponseSetName('');
              setNewResponseSetType('multiple_choice');
              setNewResponseSetOptions([{
                label: 'Option 1',
                color: 'bg-green-500'
              }, {
                label: 'Option 2',
                color: 'bg-red-500'
              }]);
            }} disabled={createReusableTemplate.isPending || updateReusableTemplate?.isPending}>
                {createReusableTemplate.isPending || updateReusableTemplate?.isPending ? editingResponseSet ? 'Updating...' : 'Creating...' : editingResponseSet ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>;
}