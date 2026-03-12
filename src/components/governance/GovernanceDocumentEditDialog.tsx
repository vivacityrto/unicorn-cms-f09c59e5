import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, FolderSearch } from 'lucide-react';
import { SharePointLinkDialog } from '@/components/ui/sharepoint-link-dialog';

interface GovernanceDocumentEditDialogProps {
  documentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GovernanceDocumentEditDialog({
  documentId,
  open,
  onOpenChange,
  onSuccess,
}: GovernanceDocumentEditDialogProps) {
  const queryClient = useQueryClient();
  const { categories } = useDocumentCategories();
  const { profile } = useAuth();
  const [showSpBrowser, setShowSpBrowser] = useState(false);

  // Fetch full document
  const { data: doc } = useQuery({
    queryKey: ['governance-doc-edit', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch dd_ lookups
  const { data: statuses } = useQuery({
    queryKey: ['dd_document_status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dd_document_status')
        .select('value, label')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: open,
  });

  const { data: frameworks } = useQuery({
    queryKey: ['dd_governance_framework'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dd_governance_framework')
        .select('value, label')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: open,
  });

  const { data: stages } = useQuery({
    queryKey: ['stages-list-for-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('stages')
        .select('id, name')
        .order('name');
      return (data as any[]) || [];
    },
    enabled: open,
  });

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    format: '',
    document_status: 'draft',
    framework_type: '' as string,
    category: '' as string,
    stage: '' as string,
    source_template_url: '',
    is_core: false,
    is_tenant_downloadable: false,
    standard_set: '',
  });

  // Populate form when doc loads
  useEffect(() => {
    if (doc) {
      setForm({
        title: doc.title || '',
        description: doc.description || '',
        format: doc.format || '',
        document_status: doc.document_status || 'draft',
        framework_type: doc.framework_type || '',
        category: doc.category || '',
        stage: doc.stage ? String(doc.stage) : '',
        source_template_url: doc.source_template_url || '',
        is_core: doc.is_core ?? false,
        is_tenant_downloadable: doc.is_tenant_downloadable ?? false,
        standard_set: doc.standard_set || '',
      });
    }
  }, [doc]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('documents')
        .update({
          title: form.title,
          description: form.description || null,
          format: form.format || null,
          document_status: form.document_status,
          framework_type: form.framework_type || null,
          category: form.category || null,
          stage: form.stage ? parseInt(form.stage) : null,
          source_template_url: form.source_template_url || null,
          is_core: form.is_core,
          is_tenant_downloadable: form.is_tenant_downloadable,
          standard_set: form.standard_set || null,
        })
        .eq('id', documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Document updated');
      queryClient.invalidateQueries({ queryKey: ['governance-doc-detail', documentId] });
      queryClient.invalidateQueries({ queryKey: ['governance-documents'] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update document');
    },
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[min(92vw,48rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Document Definition</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
            />
          </div>

          {/* Row: Status + Framework */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Document Status</Label>
              <Select value={form.document_status} onValueChange={(v) => updateField('document_status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses?.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Framework Type</Label>
              <Select value={form.framework_type || '__none__'} onValueChange={(v) => updateField('framework_type', v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {frameworks?.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Category + Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category || '__none__'} onValueChange={(v) => updateField('category', v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorised</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-format">Format</Label>
              <Select value={form.format || '__none__'} onValueChange={(v) => updateField('format', v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="pptx">PPTX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stage */}
          <div className="space-y-1.5">
            <Label>Stage (Template Association)</Label>
            <Select value={form.stage || '__none__'} onValueChange={(v) => updateField('stage', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {stages?.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SharePoint Template URL */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-source-url">SharePoint Template URL</Label>
            <Input
              id="edit-source-url"
              value={form.source_template_url}
              onChange={(e) => updateField('source_template_url', e.target.value)}
              placeholder="https://sharepoint.com/sites/..."
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Direct link to the source template file in SharePoint used for generation
            </p>
          </div>

          {/* Standard Set */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-standard-set">Standard Set Reference</Label>
            <Input
              id="edit-standard-set"
              value={form.standard_set}
              onChange={(e) => updateField('standard_set', e.target.value)}
              placeholder="e.g. RTO2025, CRICOS2018"
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3 border rounded-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Core Document</Label>
                <p className="text-xs text-muted-foreground">Automatically seeded into new client stage instances</p>
              </div>
              <Switch
                checked={form.is_core}
                onCheckedChange={(v) => updateField('is_core', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Tenant Downloadable</Label>
                <p className="text-xs text-muted-foreground">Clients can download this document from their portal</p>
              </div>
              <Switch
                checked={form.is_tenant_downloadable}
                onCheckedChange={(v) => updateField('is_tenant_downloadable', v)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !form.title.trim()}
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
