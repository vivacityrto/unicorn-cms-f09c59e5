import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { parseTaskType, getActionsForType, getTaskTypeBadgeLabel } from '@/utils/staffTaskType';
import { cn } from '@/lib/utils';

interface StaffTaskActionMenuProps {
  taskName: string;
  taskId: number;
  tenantId: number;
}

export function StaffTaskActionMenu({ taskName, taskId, tenantId }: StaffTaskActionMenuProps) {
  const { type } = parseTaskType(taskName);
  const actions = getActionsForType(type);
  const typeLabel = getTaskTypeBadgeLabel(type);

  const handleAction = (actionKey: string, actionLabel: string) => {
    toast({
      title: `Action: ${actionLabel}`,
      description: `"${actionLabel}" triggered for task #${taskId}. This will be wired up in a future update.`,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Task actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {typeLabel && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {typeLabel} Actions
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              onClick={() => handleAction(action.key, action.label)}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span>{action.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
