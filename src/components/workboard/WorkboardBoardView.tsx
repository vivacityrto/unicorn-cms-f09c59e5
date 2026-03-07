import { useMemo } from 'react';
import { WorkboardItem, ItemStatus, STATUS_CONFIG, PRIORITY_CONFIG, KANBAN_COLUMNS } from '@/hooks/useClientWorkboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Package, Layers, AlertCircle, GripVertical } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

interface WorkboardBoardViewProps {
  items: WorkboardItem[];
  onUpdateStatus: (id: string, status: ItemStatus) => Promise<boolean>;
  onOpenDetail: (item: WorkboardItem) => void;
}

// Kanban card component
function KanbanCard({ 
  item, 
  onOpenDetail,
  isDragging = false
}: { 
  item: WorkboardItem; 
  onOpenDetail: (item: WorkboardItem) => void;
  isDragging?: boolean;
}) {
  const priorityConfig = PRIORITY_CONFIG[item.priority];
  const isOverdue = item.due_date && 
    isPast(new Date(item.due_date)) && 
    !isToday(new Date(item.due_date)) && 
    !['done', 'cancelled'].includes(item.status);

  return (
    <div 
      className={`
        p-3 bg-background rounded-lg border shadow-sm cursor-pointer
        hover:border-primary/50 hover:shadow-md transition-all
        ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}
        ${item.status === 'done' ? 'opacity-60' : ''}
        ${isDragging ? 'shadow-lg rotate-2 scale-105' : ''}
      `}
      onClick={() => onOpenDetail(item)}
    >
      {/* Title */}
      <p className={`text-sm font-medium line-clamp-2 ${item.status === 'done' ? 'line-through' : ''}`}>
        {item.title}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Priority */}
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityConfig.color}`}>
          {priorityConfig.label}
        </Badge>

        {/* Due date */}
        {item.due_date && (
          <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            {isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(item.due_date), 'MMM d')}
          </span>
        )}

        {/* Item type */}
        {item.item_type === 'client' && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Client
          </Badge>
        )}
      </div>

      {/* Links and assignee */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {item.package && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              <Package className="h-2 w-2 mr-0.5" />
              {item.package.name.slice(0, 6)}
            </Badge>
          )}
          {item.stage && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              <Layers className="h-2 w-2 mr-0.5" />
              {item.stage.name.slice(0, 6)}
            </Badge>
          )}
        </div>

        {item.assignee && (
          <Avatar className="h-5 w-5">
            <AvatarImage src={item.assignee.avatar_url || undefined} />
            <AvatarFallback className="text-[8px]">
              {item.assignee.first_name?.[0]}{item.assignee.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}

// Sortable wrapper
function SortableCard({ item, onOpenDetail }: { item: WorkboardItem; onOpenDetail: (item: WorkboardItem) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-start gap-1">
        <button {...listeners} className="p-1 text-muted-foreground hover:text-foreground cursor-grab">
          <GripVertical className="h-3 w-3" />
        </button>
        <div className="flex-1">
          <KanbanCard item={item} onOpenDetail={onOpenDetail} />
        </div>
      </div>
    </div>
  );
}

// Column component
function KanbanColumn({ 
  status, 
  items, 
  onOpenDetail 
}: { 
  status: ItemStatus; 
  items: WorkboardItem[]; 
  onOpenDetail: (item: WorkboardItem) => void;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <Card className="flex-shrink-0 w-72 bg-muted/30">
      <CardHeader className="py-3 px-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <Badge variant="outline" className={config.color}>
            {config.label}
          </Badge>
          <span className="text-muted-foreground text-xs font-normal">
            {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ScrollArea className="h-[calc(100vh-350px)] pr-2">
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map(item => (
                <SortableCard key={item.id} item={item} onOpenDetail={onOpenDetail} />
              ))}
              {items.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No items
                </div>
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function WorkboardBoardView({ items, onUpdateStatus, onOpenDetail }: WorkboardBoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor)
  );

  // Group items by status
  const itemsByStatus = useMemo(() => {
    const grouped: Record<ItemStatus, WorkboardItem[]> = {
      todo: [],
      open: [],
      in_progress: [],
      blocked: [],
      waiting_client: [],
      done: [],
      cancelled: []
    };

    items.forEach(item => {
      if (grouped[item.status]) {
        grouped[item.status].push(item);
      }
    });

    return grouped;
  }, [items]);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItemId = active.id as string;
    const overId = over.id as string;

    // Determine target column
    let targetStatus: ItemStatus | null = null;

    // Check if dropped on a column
    if (KANBAN_COLUMNS.includes(overId as ItemStatus)) {
      targetStatus = overId as ItemStatus;
    } else {
      // Dropped on another item - find its status
      const overItem = items.find(i => i.id === overId);
      if (overItem) {
        targetStatus = overItem.status;
      }
    }

    if (targetStatus) {
      const item = items.find(i => i.id === activeItemId);
      if (item && item.status !== targetStatus) {
        onUpdateStatus(activeItemId, targetStatus);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            items={itemsByStatus[status]}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="w-72">
            <KanbanCard item={activeItem} onOpenDetail={() => {}} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
