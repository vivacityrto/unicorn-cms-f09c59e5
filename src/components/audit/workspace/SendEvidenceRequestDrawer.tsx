import { useState, useEffect } from 'react';
import { AppDrawer, AppDrawerContent, AppDrawerHeader, AppDrawerTitle, AppDrawerBody, AppDrawerFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { useCreateAuditEvidenceRequest } from '@/hooks/useAuditPrep';
import { useAuditSections } from '@/hooks/useAuditWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { addDays, format } from 'date-fns';
import type { ClientAudit } from '@/types/clientAudits';

interface SendEvidenceRequestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: ClientAudit;
}

interface EvidenceItem {
  item_name: string;
  guidance_text: string;
  is_required: boolean;
  section_id: string | null;
}

export function SendEvidenceRequestDrawer({ open, onOpenChange, audit }: SendEvidenceRequestDrawerProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [introMessage, setIntroMessage] = useState('');
  const [items, setItems] = useState<EvidenceItem[]>([{ item_name: '', guidance_text: '', is_required: true, section_id: null }]);
  const [generating, setGenerating] = useState(false);

  const createRequest = useCreateAuditEvidenceRequest();
  const { data: sections = [] } = useAuditSections(audit.id);

  useEffect(() => {
    if (open) {
      setTitle(`Documents required for ${audit.title || 'audit'}`);
      setDueDate(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
      setIntroMessage('');
      setItems([{ item_name: '', guidance_text: '', is_required: true, section_id: null }]);
    }
  }, [open]);

  const addItem = () => {
    setItems(prev => [...prev, { item_name: '', guidance_text: '', is_required: true, section_id: null }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, updates: Partial<EvidenceItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const generateFromQuestions = async () => {
    if (!audit.template_id) return;
    setGenerating(true);
    try {
      // Load sections for this template
      const { data: tplSections } = await supabase
        .from('compliance_template_sections' as any)
        .select('id')
        .eq('template_id', audit.template_id);
      const sectionIds = (tplSections as any[] || []).map((s: any) => s.id);

      if (sectionIds.length === 0) return;

      const { data: questions } = await supabase
        .from('compliance_template_questions' as any)
        .select('id, clause, audit_statement, evidence_to_sight, section_id')
        .eq('is_active', true)
        .in('section_id', sectionIds)
        .not('evidence_to_sight', 'is', null)
        .order('sort_order', { ascending: true });

      if (questions && (questions as any[]).length > 0) {
        const generated = (questions as any[]).map(q => ({
          item_name: q.audit_statement || q.clause,
          guidance_text: q.evidence_to_sight || '',
          is_required: true,
          section_id: q.section_id,
        }));
        setItems(generated);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = () => {
    const validItems = items.filter(i => i.item_name.trim());
    if (!title.trim() || !dueDate || validItems.length === 0) return;

    createRequest.mutate({
      auditId: audit.id,
      tenantId: audit.subject_tenant_id,
      title: title.trim(),
      description: introMessage.trim() || null,
      dueDate,
      items: validItems,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <AppDrawer open={open} onOpenChange={onOpenChange}>
      <AppDrawerContent size="lg">
        <AppDrawerHeader>
          <AppDrawerTitle>Send Evidence Request</AppDrawerTitle>
        </AppDrawerHeader>
        <AppDrawerBody className="space-y-5">
          <div>
            <Label>Request Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Documents required for CHC…" />
          </div>
          <div>
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Introduction Message (shown to client)</Label>
            <Textarea value={introMessage} onChange={e => setIntroMessage(e.target.value)} rows={3} placeholder="Optional message…" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Evidence Items</Label>
              <div className="flex gap-2">
                {audit.template_id && (
                  <Button variant="outline" size="sm" onClick={generateFromQuestions} disabled={generating}>
                    {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                    Generate from audit questions
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                </Button>
              </div>
            </div>

            {items.map((item, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Document name"
                      value={item.item_name}
                      onChange={e => updateItem(index, { item_name: e.target.value })}
                    />
                    <Input
                      placeholder="Guidance / what to look for"
                      value={item.guidance_text}
                      onChange={e => updateItem(index, { guidance_text: e.target.value })}
                    />
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_required}
                          onCheckedChange={checked => updateItem(index, { is_required: checked })}
                        />
                        <span className="text-xs text-muted-foreground">Required</span>
                      </div>
                      {sections.length > 0 && (
                        <Select value={item.section_id || '__none__'} onValueChange={v => updateItem(index, { section_id: v === '__none__' ? null : v })}>
                          <SelectTrigger className="h-8 text-xs w-48">
                            <SelectValue placeholder="Section…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No section</SelectItem>
                            {sections.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AppDrawerBody>
        <AppDrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || !dueDate || items.filter(i => i.item_name.trim()).length === 0 || createRequest.isPending}
          >
            {createRequest.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : 'Send Request'}
          </Button>
        </AppDrawerFooter>
      </AppDrawerContent>
    </AppDrawer>
  );
}
