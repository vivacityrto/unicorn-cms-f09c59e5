import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, User, Clock, Pencil, Trash2, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StageTeamTask } from '@/hooks/useStageTemplateContent';

interface SortableStaffTaskListProps {
  tasks: StageTeamTask[];
  isRecurring: boolean;
  onReorder: (orderedIds: number[]) => void;
  onEdit: (task: StageTeamTask) => void;
  onDelete: (taskId: number) => void;
  onToggleKeyEvent: (task: StageTeamTask) => void;
}

function SortableTaskItem({
  task,
  isRecurring,
  onEdit,
  onDelete,
  onToggleKeyEvent,
}: {
  task: StageTeamTask;
  isRecurring: boolean;
  onEdit: (task: StageTeamTask) => void;
  onDelete: (taskId: number) => void;
  onToggleKeyEvent: (task: StageTeamTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 p-3 rounded-lg border",
        task.is_key_event
          ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
          : "bg-muted/30"
      )}
    >
      <GripVertical
        className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab"
        {...attributes}
        {...listeners}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{task.name}</span>
          {task.is_key_event && (
            <Badge
              variant="outline"
              className="text-xs border-amber-300 bg-amber-50 text-amber-700 gap-0.5"
            >
              <KeyRound className="h-2.5 w-2.5" />
              Key Event
            </Badge>
          )}
          {task.is_mandatory && (
            <Badge variant="secondary" className="text-xs">
              Required
            </Badge>
          )}
        </div>
        {task.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {task.description.replace(/<[^>]*>/g, '').slice(0, 120)}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {task.owner_role}
          </span>
          {task.estimated_hours && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.estimated_hours}h
            </span>
          )}
        </div>
      </div>
      {isRecurring && (
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", task.is_key_event && "text-primary")}
          onClick={() => onToggleKeyEvent(task)}
          title={
            task.is_key_event
              ? 'Remove key event flag'
              : 'Mark as key event (drives milestone date)'
          }
        >
          <KeyRound className="h-3 w-3" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(task)}>
        <Pencil className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(task.id)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function SortableStaffTaskList({
  tasks,
  isRecurring,
  onReorder,
  onEdit,
  onDelete,
  onToggleKeyEvent,
}: SortableStaffTaskListProps) {
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tasks, oldIndex, newIndex);
      onReorder(reordered.map((t) => t.id));
    },
    [tasks, onReorder]
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((task) => (
            <SortableTaskItem
              key={task.id}
              task={task}
              isRecurring={isRecurring}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleKeyEvent={onToggleKeyEvent}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeTask && (
          <div className="p-3 rounded-lg border bg-background shadow-lg opacity-90">
            <span className="font-medium">{activeTask.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
