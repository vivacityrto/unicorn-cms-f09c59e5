import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Link2, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAllStagesForDependencies } from '@/hooks/useStageDependencies';

interface StageDependencySelectorProps {
  currentStageKey?: string;
  selectedStageKeys: string[];
  onChange: (stageKeys: string[]) => void;
  disabled?: boolean;
}

export function StageDependencySelector({
  currentStageKey,
  selectedStageKeys,
  onChange,
  disabled = false
}: StageDependencySelectorProps) {
  const { stages, isLoading } = useAllStagesForDependencies();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out current stage and apply search
  const filteredStages = useMemo(() => {
    return stages.filter(stage => {
      if (stage.stage_key === currentStageKey) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return stage.name.toLowerCase().includes(query) || 
             stage.stage_key.toLowerCase().includes(query);
    });
  }, [stages, currentStageKey, searchQuery]);

  const selectedStages = useMemo(() => {
    return stages.filter(s => selectedStageKeys.includes(s.stage_key));
  }, [stages, selectedStageKeys]);

  const toggleStage = (stageKey: string) => {
    if (selectedStageKeys.includes(stageKey)) {
      onChange(selectedStageKeys.filter(k => k !== stageKey));
    } else {
      onChange([...selectedStageKeys, stageKey]);
    }
  };

  const removeStage = (stageKey: string) => {
    onChange(selectedStageKeys.filter(k => k !== stageKey));
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading stages...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              {selectedStageKeys.length === 0
                ? 'Select required stages...'
                : `${selectedStageKeys.length} stage${selectedStageKeys.length > 1 ? 's' : ''} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Search stages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <ScrollArea className="h-[250px]">
            {filteredStages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No stages found
              </p>
            ) : (
              <div className="p-1">
                {filteredStages.map((stage) => {
                  const isSelected = selectedStageKeys.includes(stage.stage_key);
                  return (
                    <button
                      key={stage.stage_key}
                      type="button"
                      onClick={() => toggleStage(stage.stage_key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 text-primary' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{stage.name}</span>
                          {stage.is_certified && (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        {stage.version_label && (
                          <span className="text-xs text-muted-foreground">
                            {stage.version_label}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Selected stages display */}
      {selectedStages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedStages.map((stage) => (
            <Badge
              key={stage.stage_key}
              variant="secondary"
              className="flex items-center gap-1.5 py-1 px-2"
            >
              {stage.is_certified && (
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
              )}
              <span>{stage.name}</span>
              {stage.version_label && (
                <span className="text-muted-foreground">({stage.version_label})</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeStage(stage.stage_key)}
                  className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
