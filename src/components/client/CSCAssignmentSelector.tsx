import { useState } from 'react';
import { useTenantCSCAssignment, CSCUser } from '@/hooks/useTenantCSCAssignment';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown, Loader2, UserX, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface CSCAssignmentSelectorProps {
  tenantId: number;
  canEdit: boolean;
  canRemove?: boolean;
}

export function CSCAssignmentSelector({ 
  tenantId, 
  canEdit, 
  canRemove = false 
}: CSCAssignmentSelectorProps) {
  const [open, setOpen] = useState(false);
  const { 
    currentCSC, 
    availableCSCs, 
    isLoading, 
    assignCSC, 
    removeCSC,
    isAssigning,
    isRemoving 
  } = useTenantCSCAssignment(tenantId);

  const handleSelect = async (user: CSCUser) => {
    await assignCSC(user.user_uuid);
    setOpen(false);
  };

  const handleRemove = async () => {
    await removeCSC();
    setOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">CSC:</span>
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const currentUser = currentCSC?.user;
  const isPending = isAssigning || isRemoving;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">CSC:</span>
      
      {canEdit ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-1 gap-2 hover:bg-muted"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentUser ? (
                <>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={currentUser.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {`${currentUser.first_name?.[0] || ''}${currentUser.last_name?.[0] || ''}`.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {`${currentUser.first_name} ${currentUser.last_name}`}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Not Assigned</span>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Select Client Success Champion
              </div>
              
              {availableCSCs.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No CSC users available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mark team members as CSC in Team Users
                  </p>
                </div>
              ) : (
                availableCSCs.map((user) => {
                  const isSelected = currentUser?.user_uuid === user.user_uuid;
                  return (
                    <button
                      key={user.user_uuid}
                      onClick={() => handleSelect(user)}
                      className={cn(
                        "flex items-center gap-3 w-full p-2 rounded-md text-left transition-colors",
                        "hover:bg-muted",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {`${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {`${user.first_name} ${user.last_name}`}
                        </p>
                        {user.job_title && (
                          <p className="text-xs text-muted-foreground truncate">
                            {user.job_title}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}

              {canRemove && currentUser && (
                <>
                  <div className="border-t my-2" />
                  <button
                    onClick={handleRemove}
                    className="flex items-center gap-2 w-full p-2 rounded-md text-left text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <UserX className="h-4 w-4" />
                    <span className="text-sm">Remove Assignment</span>
                  </button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      ) : currentUser ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {`${currentUser.first_name?.[0] || ''}${currentUser.last_name?.[0] || ''}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {`${currentUser.first_name} ${currentUser.last_name}`}
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Not Assigned</span>
      )}
    </div>
  );
}
