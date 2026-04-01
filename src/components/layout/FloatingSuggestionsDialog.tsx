import { useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuggestItems } from '@/hooks/useSuggestItems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Lightbulb, Plus, Search, Loader2, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'outline',
  triaged: 'secondary',
  in_progress: 'secondary',
  blocked: 'destructive',
  resolved: 'default',
  closed: 'default',
};

interface FloatingSuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FloatingSuggestionsDialog({ open, onClose }: FloatingSuggestionsDialogProps) {
  const navigate = useNavigate();
  const { data: items, isLoading } = useSuggestItems();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Dragging state – compute safe initial position
  const [position, setPosition] = useState(() => ({
    x: Math.max(16, Math.min(window.innerWidth - 480, window.innerWidth - 520)),
    y: 64,
  }));
  const dragRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - dragOffset.current.y)),
      });
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const unreleased = items.filter(i => i.release_status?.code !== 'released');
    if (!search) return unreleased;
    const q = search.toLowerCase();
    return unreleased.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.description ?? '').toLowerCase().includes(q)
    );
  }, [items, search]);

  if (!open) return null;

  const width = expanded ? 680 : 460;
  const height = expanded ? 600 : 440;

  return (
    <>
      {/* Backdrop to make the dialog noticeable */}
      <div
        className="fixed inset-0 bg-black/10 z-[9998]"
        onClick={onClose}
      />
      <div
        ref={dragRef}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width,
          zIndex: 9999,
        }}
        className="rounded-xl border bg-background shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      >
      {/* Drag handle / header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold flex-1">Suggestions</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search suggestions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => { navigate('/suggestions/new'); onClose(); }}
        >
          <Plus className="h-3 w-3" />
          New
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => { navigate('/suggestions'); onClose(); }}
        >
          Full View
        </Button>
      </div>

      {/* Content */}
      <ScrollArea style={{ height }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {search ? 'No matching suggestions.' : 'No open suggestions.'}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(item => (
              <div
                key={item.id}
                className="px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => { navigate(`/suggestions/${item.id}`); onClose(); }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={STATUS_VARIANT[item.status?.code ?? ''] ?? 'outline'} className="text-[10px] h-5">
                        {item.status?.label ?? '—'}
                      </Badge>
                      <Badge variant={PRIORITY_VARIANT[item.priority?.code ?? ''] ?? 'outline'} className="text-[10px] h-5">
                        {item.priority?.label ?? '—'}
                      </Badge>
                      {item.category?.label && (
                        <span className="text-[10px] text-muted-foreground">{item.category.label}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground text-center">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} · Drag header to reposition
      </div>
    </div>
  );
}
