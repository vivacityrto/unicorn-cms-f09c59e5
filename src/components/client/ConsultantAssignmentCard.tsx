import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useConsultantAssignment } from '@/hooks/useConsultantAssignment';
import { ReassignConsultantDialog } from './ReassignConsultantDialog';
import { 
  UserCheck, 
  AlertTriangle, 
  RefreshCw, 
  ArrowRightLeft, 
  Clock, 
  Loader2 
} from 'lucide-react';

interface ConsultantAssignmentCardProps {
  tenantId: number;
  canEdit: boolean;
}

export function ConsultantAssignmentCard({ tenantId, canEdit }: ConsultantAssignmentCardProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const { 
    assignmentInfo, 
    tierInfo, 
    latestAudit, 
    isLoading, 
    autoAssign, 
    isAutoAssigning 
  } = useConsultantAssignment(tenantId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  const hasConsultant = !!assignmentInfo?.assigned_consultant_user_id;
  const isOverCapacity = latestAudit?.over_capacity === true;
  const method = assignmentInfo?.consultant_assignment_method || 'none';

  return (
    <>
      <Card className={isOverCapacity ? 'border-amber-300 dark:border-amber-700' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Assigned Consultant
            </CardTitle>
            <div className="flex items-center gap-2">
              {method !== 'none' && (
                <Badge variant="outline" className="text-xs">
                  {method === 'auto' ? 'Auto-assigned' : 'Manual'}
                </Badge>
              )}
              {isOverCapacity && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Over Capacity
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Consultant info */}
          {hasConsultant ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {`${assignmentInfo?.consultant_first_name?.[0] || ''}${assignmentInfo?.consultant_last_name?.[0] || ''}`.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {assignmentInfo?.consultant_first_name} {assignmentInfo?.consultant_last_name}
                </p>
                {assignmentInfo?.consultant_job_title && (
                  <p className="text-xs text-muted-foreground">{assignmentInfo.consultant_job_title}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No consultant assigned</p>
          )}

          {/* Tier and capacity info */}
          {tierInfo && (
            <div className="grid grid-cols-3 gap-3 text-center bg-muted/50 rounded-lg p-3">
              <div>
                <p className="text-xs text-muted-foreground">Tier</p>
                <p className="text-sm font-medium">{tierInfo.tier_label}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Weekly Hours</p>
                <p className="text-sm font-medium">{tierInfo.effective_weekly_hours.toFixed(2)}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Multiplier
                </p>
                <p className="text-sm font-medium">{tierInfo.onboarding_multiplier}×</p>
              </div>
            </div>
          )}

          {/* Actions */}
          {canEdit && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoAssign()}
                disabled={isAutoAssigning}
                className="flex-1"
              >
                {isAutoAssigning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {hasConsultant ? 'Re-run Auto-assign' : 'Auto-assign'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReassignOpen(true)}
                className="flex-1"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                Reassign Manually
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ReassignConsultantDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        tenantId={tenantId}
        currentConsultantName={
          hasConsultant
            ? `${assignmentInfo?.consultant_first_name} ${assignmentInfo?.consultant_last_name}`
            : undefined
        }
      />
    </>
  );
}
