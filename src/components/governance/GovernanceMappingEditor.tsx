import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MappingEntry {
  key: string;
  label: string;
  defaultValue: string;
}

interface GovernanceMappingEditorProps {
  versionId: string;
}

export function GovernanceMappingEditor({ versionId }: GovernanceMappingEditorProps) {
  const queryClient = useQueryClient();
  const [mappings, setMappings] = useState<MappingEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Load existing mapping for this version
  const { data: existingMapping, isLoading } = useQuery({
    queryKey: ['governance-mapping', versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_template_mappings')
        .select('*')
        .eq('template_version_id', versionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Initialise from existing mapping
  useEffect(() => {
    if (existingMapping?.mapping_json) {
      const json = existingMapping.mapping_json as Record<string, { label?: string; defaultValue?: string }>;
      setMappings(
        Object.entries(json).map(([key, val]) => ({
          key,
          label: val?.label || key,
          defaultValue: val?.defaultValue || '',
        }))
      );
    }
  }, [existingMapping]);

  const addField = () => {
    setMappings(prev => [...prev, { key: '', label: '', defaultValue: '' }]);
  };

  const removeField = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: keyof MappingEntry, value: string) => {
    setMappings(prev => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const handleSave = async () => {
    // Validate: all keys must be non-empty and unique
    const keys = mappings.map(m => m.key.trim());
    if (keys.some(k => !k)) {
      toast.error('All merge field keys must be non-empty');
      return;
    }
    if (new Set(keys).size !== keys.length) {
      toast.error('Duplicate merge field keys found');
      return;
    }

    setSaving(true);
    try {
      const mappingJson: Record<string, { label: string; defaultValue: string }> = {};
      for (const m of mappings) {
        mappingJson[m.key.trim()] = { label: m.label, defaultValue: m.defaultValue };
      }

      // Compute a simple checksum of the mapping
      const jsonStr = JSON.stringify(mappingJson, Object.keys(mappingJson).sort());
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(jsonStr));
      const checksum = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upsert: delete old, insert new
      await supabase
        .from('document_template_mappings')
        .delete()
        .eq('template_version_id', versionId);

      const { error } = await supabase
        .from('document_template_mappings')
        .insert({
          template_version_id: versionId,
          mapping_json: mappingJson,
          checksum_sha256: checksum,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Merge field mappings saved');
      queryClient.invalidateQueries({ queryKey: ['governance-mapping', versionId] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save mappings');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">Loading mappings…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Merge Field Mappings</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addField}>
            <Plus className="h-3 w-3 mr-1" /> Add Field
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || mappings.length === 0}>
            {saving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No merge fields defined. Add fields or import a template with merge fields.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Field Key</span>
              <span>Display Label</span>
              <span>Default Value</span>
              <span></span>
            </div>
            {mappings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 items-center">
                <Input
                  value={m.key}
                  onChange={(e) => updateField(i, 'key', e.target.value)}
                  placeholder="e.g. RTOName"
                  className="font-mono text-sm"
                />
                <Input
                  value={m.label}
                  onChange={(e) => updateField(i, 'label', e.target.value)}
                  placeholder="e.g. RTO Name"
                  className="text-sm"
                />
                <Input
                  value={m.defaultValue}
                  onChange={(e) => updateField(i, 'defaultValue', e.target.value)}
                  placeholder="Optional default"
                  className="text-sm"
                />
                <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {existingMapping && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono text-xs">
              {existingMapping.checksum_sha256?.slice(0, 12)}…
            </Badge>
            <span>Last saved mapping checksum</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
