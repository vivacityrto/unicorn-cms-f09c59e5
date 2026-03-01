import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMergeFields } from '@/hooks/useMergeFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Plus, Save, FileText, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MergeFieldsEditorProps {
  documentId: number;
}

export function MergeFieldsEditor({ documentId }: MergeFieldsEditorProps) {
  const { mergeFields: availableFields, loading: fieldsLoading } = useMergeFields();
  const [linkedFieldIds, setLinkedFieldIds] = useState<number[]>([]);
  const [localFieldIds, setLocalFieldIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchLinkedFields = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_fields')
        .select('field_id')
        .eq('document_id', documentId);
      if (error) throw error;
      const ids = (data || []).map((r) => r.field_id);
      setLinkedFieldIds(ids);
      setLocalFieldIds(ids);
    } catch (err: any) {
      console.error('Error fetching document fields:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchLinkedFields();
  }, [fetchLinkedFields]);

  const addField = (fieldId: number) => {
    if (!localFieldIds.includes(fieldId)) {
      setLocalFieldIds((prev) => [...prev, fieldId]);
      setHasChanges(true);
    }
    setPopoverOpen(false);
    setSearchTerm('');
  };

  const removeField = (fieldId: number) => {
    setLocalFieldIds((prev) => prev.filter((id) => id !== fieldId));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing links
      await supabase.from('document_fields').delete().eq('document_id', documentId);
      // Insert new links
      if (localFieldIds.length > 0) {
        const rows = localFieldIds.map((field_id) => ({ document_id: documentId, field_id }));
        const { error } = await supabase.from('document_fields').insert(rows);
        if (error) throw error;
      }
      setLinkedFieldIds(localFieldIds);
      setHasChanges(false);
      toast.success('Required merge fields updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const activeAvailableFields = availableFields.filter((f) => f.is_active);
  const filteredAvailableFields = activeAvailableFields.filter((f) => {
    return (
      !localFieldIds.includes(f.id) &&
      (f.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Required Merge Fields
          </CardTitle>
          <CardDescription>
            Define which merge fields this document requires for completeness checks
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search fields..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-8"
                  />
                </div>
              </div>
              <ScrollArea className="h-[250px]">
                <div className="p-2">
                  {fieldsLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading fields...</p>
                  ) : filteredAvailableFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {searchTerm ? 'No matching fields' : 'All fields added'}
                    </p>
                  ) : (
                    filteredAvailableFields.map((field) => (
                      <button
                        key={field.id}
                        onClick={() => addField(field.id)}
                        className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{`{{${field.tag}}}`}</code>
                          <span className="text-sm text-muted-foreground truncate">{field.name}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : localFieldIds.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No required merge fields defined</p>
            <p className="text-sm mt-1">Add fields that must be populated for this document</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {localFieldIds.map((fieldId) => {
              const fieldDef = availableFields.find((f) => f.id === fieldId);
              return (
                <Badge key={fieldId} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
                  <code className="text-xs">{`{{${fieldDef?.tag || fieldId}}}`}</code>
                  {fieldDef && (
                    <span className="text-xs text-muted-foreground">({fieldDef.name})</span>
                  )}
                  <button
                    onClick={() => removeField(fieldId)}
                    className="ml-1 hover:bg-destructive/20 rounded p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
