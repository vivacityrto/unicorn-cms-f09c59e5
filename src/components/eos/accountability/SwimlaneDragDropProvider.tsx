import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import type { FunctionWithSeats, SeatWithDetails, UserBasic } from '@/types/accountabilityChart';

interface SwimlaneDragDropProviderProps {
  functions: FunctionWithSeats[];
  canEdit: boolean;
  tenantUsers: UserBasic[];
  onReorderFunctions: (functionIds: string[]) => void;
  onReorderSeats: (functionId: string, seatIds: string[]) => void;
  onMoveSeat: (seatId: string, fromFunctionId: string, toFunctionId: string, newIndex: number) => void;
  children: React.ReactNode;
}

export function SwimlaneDragDropProvider({
  functions,
  canEdit,
  onReorderFunctions,
  onReorderSeats,
  onMoveSeat,
  children,
}: SwimlaneDragDropProviderProps) {
  const [activeItem, setActiveItem] = useState<{
    type: 'function' | 'seat';
    item: FunctionWithSeats | SeatWithDetails;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    if (data?.type === 'function') {
      setActiveItem({ type: 'function', item: data.function });
    } else if (data?.type === 'seat') {
      setActiveItem({ type: 'seat', item: data.seat });
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Only handle seat-to-function drops
    if (activeData?.type !== 'seat') return;

    const activeFunctionId = activeData.functionId;
    let targetFunctionId: string | null = null;

    if (overData?.type === 'function') {
      targetFunctionId = over.id as string;
    } else if (overData?.type === 'seat') {
      targetFunctionId = overData.functionId;
    }

    // If dropping in a different function, we'll handle it in dragEnd
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle function reordering
    if (activeData?.type === 'function') {
      if (active.id !== over.id) {
        const oldIndex = functions.findIndex(f => f.id === active.id);
        const newIndex = functions.findIndex(f => f.id === over.id);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(functions, oldIndex, newIndex);
          onReorderFunctions(newOrder.map(f => f.id));
          toast({ title: 'Function reordered' });
        }
      }
      return;
    }

    // Handle seat reordering/moving
    if (activeData?.type === 'seat') {
      const activeFunctionId = activeData.functionId;
      let targetFunctionId: string;
      let targetSeatId: string | null = null;

      if (overData?.type === 'function') {
        targetFunctionId = over.id as string;
      } else if (overData?.type === 'seat') {
        targetFunctionId = overData.functionId;
        targetSeatId = over.id as string;
      } else {
        return;
      }

      // Same function - reorder
      if (activeFunctionId === targetFunctionId) {
        const func = functions.find(f => f.id === activeFunctionId);
        if (!func) return;

        const oldIndex = func.seats.findIndex(s => s.id === active.id);
        const newIndex = targetSeatId 
          ? func.seats.findIndex(s => s.id === targetSeatId)
          : func.seats.length;

        if (oldIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(func.seats, oldIndex, newIndex);
          onReorderSeats(activeFunctionId, newOrder.map(s => s.id));
          toast({ title: 'Seat reordered' });
        }
      } else {
        // Different function - move seat
        const targetFunc = functions.find(f => f.id === targetFunctionId);
        if (!targetFunc) return;

        const newIndex = targetSeatId
          ? targetFunc.seats.findIndex(s => s.id === targetSeatId)
          : targetFunc.seats.length;

        onMoveSeat(active.id as string, activeFunctionId, targetFunctionId, newIndex);
        toast({ title: 'Seat moved to new function' });
      }
    }
  }, [functions, onReorderFunctions, onReorderSeats, onMoveSeat]);

  if (!canEdit) {
    // Just render children without drag functionality
    return <>{children}</>;
  }

  const functionIds = functions.map(f => f.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={functionIds} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>

      <DragOverlay>
        {activeItem?.type === 'function' && (
          <Card className="w-72 h-48 bg-muted/50 border-primary shadow-xl opacity-80">
            <div className="p-4 font-semibold">
              {(activeItem.item as FunctionWithSeats).name}
            </div>
          </Card>
        )}
        {activeItem?.type === 'seat' && (
          <Card className="w-64 p-3 bg-background border-primary shadow-xl opacity-80">
            <div className="font-semibold text-sm">
              {(activeItem.item as SeatWithDetails).seat_name}
            </div>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
