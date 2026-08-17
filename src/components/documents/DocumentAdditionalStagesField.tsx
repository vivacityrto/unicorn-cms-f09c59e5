import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronsUpDown, X } from 'lucide-react';
import { toast } from 'sonner';

interface StageOption {
  id: number;
  name: string;
}

interface Props {
  /** Document being edited. When null/undefined the picker is idle. */
  documentId: number | null | undefined;
  /** All available stages (id/name). Optional — if omitted we fetch. */
  stages?: StageOption[];
  /**
   * The primary stage from `documents.stage`. It's excluded from the
   * additional-stages picker (a doc cannot be an "additional" copy of its
   * own primary stage).
   */
  primaryStageId?: number | null;
  /**
   * Called after the user changes the additional-stages selection and it
   * has been persisted. Parents can use this to invalidate queries.
   */
  onChange?: (stageIds: number[]) => void;
}

/**
 * Reusable field that lets a staff user link a document to additional
 * stages beyond its primary `documents.stage` column, using the
 * `document_stage_links` table.
 *
 * Writes happen immediately (add/remove) so parents don't need to plumb
 * anything through their existing save handlers.
 */
export function DocumentAdditionalStagesField({
  documentId,
  stages: stagesProp,
  primaryStageId,
  onChange,
}: Props) {
  const [stages, setStages] = useState<StageOption[]>(stagesProp ?? []);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  // Fetch stages if not provided
  useEffect(() => {
    if (stagesProp && stagesProp.length) {
      setStages(stagesProp);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('stages').select('id, name').order('name');
      if (!cancelled && data) setStages(data as StageOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [stagesProp]);

  // Load current additional stage links
  useEffect(() => {
    if (!documentId) {
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_stage_links' as any)
        .select('stage_id')
        .eq('document_id', documentId);
      if (!cancelled) {
        if (!error && data) {
          setSelected(new Set((data as any[]).map((r) => r.stage_id as number)));
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const availableStages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stages.filter((s) => {
      if (primaryStageId && s.id === primaryStageId) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q);
    });
  }, [stages, search, primaryStageId]);

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const toggle = async (stageId: number) => {
    if (!documentId) return;
    const isSelected = selected.has(stageId);
    const next = new Set(selected);

    if (isSelected) {
      const { error } = await supabase
        .from('document_stage_links' as any)
        .delete()
        .eq('document_id', documentId)
        .eq('stage_id', stageId);
      if (error) {
        toast.error(`Failed to remove stage link: ${error.message}`);
        return;
      }
      next.delete(stageId);
    } else {
      const { error } = await supabase
        .from('document_stage_links' as any)
        .insert({ document_id: documentId, stage_id: stageId });
      if (error) {
        toast.error(`Failed to add stage link: ${error.message}`);
        return;
      }
      next.add(stageId);
    }
    setSelected(next);
    onChange?.(Array.from(next));
  };

  const selectedList = useMemo(
    () => Array.from(selected).map((id) => stageById.get(id)).filter(Boolean) as StageOption[],
    [selected, stageById]
  );

  if (!documentId) {
    return (
      <div className="space-y-1.5">
        <Label>Additional Stages</Label>
        <p className="text-xs text-muted-foreground">
          Save the document first to link it to additional stages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Additional Stages</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className="text-muted-foreground">
              {selectedList.length === 0
                ? 'Select additional stages…'
                : `${selectedList.length} additional stage${selectedList.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Search stages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <ScrollArea className="max-h-72">
            <div className="p-1">
              {availableStages.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No matching stages
                </p>
              ) : (
                availableStages.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(s.id);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-sm cursor-pointer"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="flex-1 truncate">{s.name}</span>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedList.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[16rem] truncate">{s.name}</span>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="ml-1 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${s.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Documents linked to additional stages are seeded into those stages' instances too, alongside their primary stage.
      </p>
    </div>
  );
}
