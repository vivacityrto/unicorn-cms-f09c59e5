import { useTenantCSCAssignment, CSCUser } from '@/hooks/useTenantCSCAssignment';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, Loader2, UserX, Users, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface CSCQuickAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  canRemove?: boolean;
  onSuccess?: () => void;
}

export function CSCQuickAssignDialog({ 
  open, 
  onOpenChange, 
  tenantId, 
  tenantName,
  canRemove = false,
  onSuccess
}: CSCQuickAssignDialogProps) {
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
    onOpenChange(false);
    onSuccess?.();
  };

  const handleRemove = async () => {
    await removeCSC();
    onOpenChange(false);
    onSuccess?.();
  };

  const currentUser = currentCSC?.user;
  const isPending = isAssigning || isRemoving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign CSC</DialogTitle>
          <DialogDescription>
            Select a Client Success Champion for <strong>{tenantName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : availableCSCs.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No CSC users available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Mark team members as CSC in the Team Users admin panel
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {/* Active CSC users first */}
              {availableCSCs.filter(u => !u.archived).map((user) => {
                const isSelected = currentUser?.user_uuid === user.user_uuid;
                return (
                  <button
                    key={user.user_uuid}
                    onClick={() => handleSelect(user)}
                    disabled={isPending}
                    className={cn(
                      "flex items-center gap-3 w-full p-3 rounded-lg text-left transition-colors",
                      "border hover:bg-muted",
                      isSelected && "border-primary bg-primary/5",
                      isPending && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>
                        {`${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {`${user.first_name} ${user.last_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.job_title || user.email}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-primary font-medium">Current</span>
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    {isPending && isSelected && (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    )}
                  </button>
                );
              })}
              
              {/* Archived CSC users - separated at bottom */}
              {availableCSCs.filter(u => u.archived).length > 0 && (
                <>
                  <div className="flex items-center gap-2 py-2 px-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">Archived</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {availableCSCs.filter(u => u.archived).map((user) => {
                    const isSelected = currentUser?.user_uuid === user.user_uuid;
                    return (
                      <button
                        key={user.user_uuid}
                        onClick={() => handleSelect(user)}
                        disabled={isPending}
                        className={cn(
                          "flex items-center gap-3 w-full p-3 rounded-lg text-left transition-colors",
                          "border hover:bg-muted opacity-70",
                          isSelected && "border-primary bg-primary/5",
                          isPending && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {`${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {`${user.first_name} ${user.last_name}`}
                            </p>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              <Archive className="h-2.5 w-2.5 mr-0.5" />
                              Archived
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.job_title || user.email}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-primary font-medium">Current</span>
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        {isPending && isSelected && (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canRemove && currentUser && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              Remove Assignment
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
