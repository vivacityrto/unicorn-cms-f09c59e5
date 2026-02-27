import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Search, ChevronDown, FileCheck, X } from 'lucide-react';
import { useFilteredStandards, StandardReference, updateStageStandards } from '@/hooks/useStageStandards';
import { useToast } from '@/hooks/use-toast';

interface StageStandardsSelectorProps {
  stageId: number;
  frameworks: string[] | null;
  selectedStandards: string[] | null;
  onUpdate: (standards: string[] | null) => void;
  userId: string | null;
  disabled?: boolean;
}

export function StageStandardsSelector({
  stageId,
  frameworks,
  selectedStandards,
  onUpdate,
  userId,
  disabled = false
}: StageStandardsSelectorProps) {
  const { toast } = useToast();
  const { standards, loading } = useFilteredStandards(frameworks);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedStandards || []));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelected(new Set(selectedStandards || []));
  }, [selectedStandards]);

  const filteredStandards = standards.filter(s =>
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group by framework
  const groupedStandards = filteredStandards.reduce((acc, s) => {
    if (!acc[s.framework]) acc[s.framework] = [];
    acc[s.framework].push(s);
    return acc;
  }, {} as Record<string, StandardReference[]>);

  const handleToggle = (code: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelected(newSelected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const newStandards = selected.size > 0 ? Array.from(selected) : null;
    const success = await updateStageStandards(stageId, selectedStandards, newStandards, userId);
    
    if (success) {
      onUpdate(newStandards);
      toast({
        title: 'Standards Updated',
        description: 'Stage standards mapping has been saved.'
      });
      setOpen(false);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to update standards.',
        variant: 'destructive'
      });
    }
    setIsSaving(false);
  };

  const handleRemove = (code: string) => {
    const newSelected = new Set(selected);
    newSelected.delete(code);
    setSelected(newSelected);
    
    // Auto-save when removing via badge
    const newStandards = newSelected.size > 0 ? Array.from(newSelected) : null;
    updateStageStandards(stageId, selectedStandards, newStandards, userId).then(success => {
      if (success) {
        onUpdate(newStandards);
      }
    });
  };

  const selectedList = standards.filter(s => selected.has(s.code));

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <FileCheck className="h-4 w-4" />
        Standards covered by this stage
      </Label>
      <p className="text-xs text-muted-foreground">
        Select the regulatory standards this stage helps address.
      </p>

      {/* Selected badges */}
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedList.map(s => (
            <Badge 
              key={s.code} 
              variant="secondary" 
              className="text-xs gap-1 pr-1"
            >
              <span className="font-medium">{s.code}</span>
              {!disabled && (
                <button
                  onClick={() => handleRemove(s.code)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || loading}
            className="w-full justify-between"
          >
            <span className="text-muted-foreground">
              {loading ? 'Loading standards...' : 'Select standards...'}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search standards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>

          <ScrollArea className="h-[300px]">
            <div className="p-2">
              {Object.entries(groupedStandards).map(([framework, stds]) => (
                <div key={framework} className="mb-4">
                  <div className="text-xs font-semibold text-muted-foreground px-2 py-1 sticky top-0 bg-popover">
                    {framework}
                  </div>
                  <div className="space-y-1">
                    {stds.map(s => (
                      <label
                        key={s.code}
                        className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(s.code)}
                          onCheckedChange={() => handleToggle(s.code)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{s.code}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {s.title}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {Object.keys(groupedStandards).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No standards found.
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="p-2 border-t flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Display component for standards badges (read-only)
export function StageStandardsBadges({
  standards,
  allStandards,
  maxDisplay = 3
}: {
  standards: string[] | null;
  allStandards: StandardReference[];
  maxDisplay?: number;
}) {
  if (!standards || standards.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const resolved = standards
    .map(code => allStandards.find(s => s.code === code))
    .filter((s): s is StandardReference => !!s);

  const displayed = resolved.slice(0, maxDisplay);
  const remaining = resolved.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1">
      {displayed.map(s => (
        <Badge key={s.code} variant="outline" className="text-xs">
          {s.code}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}
