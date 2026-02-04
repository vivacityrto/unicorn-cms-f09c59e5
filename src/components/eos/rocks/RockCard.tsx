import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  AlertCircle,
  ChevronRight,
  Edit,
  Users,
  Armchair,
  Calendar,
  Target,
  GitBranch
} from 'lucide-react';
import { format } from 'date-fns';
import type { RockWithHierarchy, RockLevel } from '@/types/eos';
import { normalizeStatus } from '@/utils/rockRollup';
import { cn } from '@/lib/utils';

interface RockCardProps {
  rock: RockWithHierarchy;
  onEdit?: (rock: RockWithHierarchy) => void;
  onViewCascade?: (rock: RockWithHierarchy) => void;
  onStatusChange?: (rockId: string, status: string) => void;
  showParent?: boolean;
  showChildren?: boolean;
  compact?: boolean;
  getUserName?: (userId: string) => string | null;
  getSeatName?: (seatId: string) => string | null;
}

export function RockCard({
  rock,
  onEdit,
  onViewCascade,
  onStatusChange,
  showParent = false,
  showChildren = true,
  compact = false,
  getUserName,
  getSeatName,
}: RockCardProps) {
  const status = normalizeStatus(rock.rollupStatus || rock.status);
  const hasChildren = rock.childStats && rock.childStats.total > 0;
  const milestones = Array.isArray(rock.milestones) ? rock.milestones : [];
  const completedMilestones = milestones.filter((m: any) => m.completed).length;
  const milestoneProgress = milestones.length > 0 
    ? Math.round((completedMilestones / milestones.length) * 100) 
    : 0;

  const getStatusConfig = (s: string) => {
    const configs: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; icon: typeof TrendingUp; label: string; className?: string }> = {
      on_track: { variant: 'default', icon: TrendingUp, label: 'On Track', className: 'bg-green-600' },
      off_track: { variant: 'destructive', icon: TrendingDown, label: 'Off Track' },
      at_risk: { variant: 'destructive', icon: AlertCircle, label: 'At Risk', className: 'bg-amber-600' },
      complete: { variant: 'secondary', icon: CheckCircle, label: 'Complete', className: 'bg-blue-600 text-white' },
      not_started: { variant: 'outline', icon: Target, label: 'Not Started' },
    };
    return configs[s] || configs.on_track;
  };

  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;

  const getLevelBadge = (level: RockLevel | undefined) => {
    const configs: Record<string, { label: string; className: string }> = {
      company: { label: 'Company', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
      team: { label: 'Team', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
      individual: { label: 'Individual', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    };
    const config = configs[level || 'company'] || configs.company;
    return (
      <Badge variant="outline" className={cn('text-xs', config.className)}>
        {config.label}
      </Badge>
    );
  };

  const ownerName = rock.owner_id && getUserName ? getUserName(rock.owner_id) : null;
  const seatName = rock.seat_id && getSeatName ? getSeatName(rock.seat_id) : rock.seat?.seat_name;

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Badge variant={statusConfig.variant} className={cn('gap-1 shrink-0', statusConfig.className)}>
            <StatusIcon className="w-3 h-3" />
          </Badge>
          <span className="font-medium truncate">{rock.title}</span>
          {getLevelBadge(rock.rock_level)}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasChildren && showChildren && (
            <Badge variant="outline" className="text-xs">
              {rock.childStats!.complete}/{rock.childStats!.total}
            </Badge>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(rock)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="font-semibold text-lg leading-tight">{rock.title}</h3>
              {getLevelBadge(rock.rock_level)}
              <Badge variant="outline" className="text-xs">
                Q{rock.quarter_number} {rock.quarter_year}
              </Badge>
            </div>
            
            {/* Owner/Seat info */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {seatName && (
                <div className="flex items-center gap-1">
                  <Armchair className="h-3.5 w-3.5" />
                  <span>{seatName}</span>
                </div>
              )}
              {ownerName && (
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{ownerName}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Due {format(new Date(rock.due_date), 'MMM d')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge variant={statusConfig.variant} className={cn('gap-1', statusConfig.className)}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {rock.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{rock.description}</p>
        )}

        {/* Parent link for team/individual rocks */}
        {showParent && rock.parent && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
            <GitBranch className="h-4 w-4 rotate-180" />
            <span>From:</span>
            <span className="font-medium text-foreground">{rock.parent.title}</span>
          </div>
        )}

        {/* Milestones progress */}
        {milestones.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Milestones</span>
              <span className="font-medium">{completedMilestones}/{milestones.length}</span>
            </div>
            <Progress value={milestoneProgress} className="h-2" />
          </div>
        )}

        {/* Children summary */}
        {hasChildren && showChildren && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold">{rock.childStats!.total}</div>
                <div className="text-xs text-muted-foreground">
                  {rock.rock_level === 'company' ? 'Team' : 'Individual'}
                </div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">{rock.childStats!.complete}</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
              {rock.childStats!.offTrack > 0 && (
                <>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <div className="text-lg font-semibold text-red-600">{rock.childStats!.offTrack}</div>
                    <div className="text-xs text-muted-foreground">Off Track</div>
                  </div>
                </>
              )}
            </div>
            {onViewCascade && (
              <Button variant="ghost" size="sm" onClick={() => onViewCascade(rock)}>
                View Cascade
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(rock)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {onViewCascade && rock.rock_level !== 'individual' && (
            <Button variant="ghost" size="sm" onClick={() => onViewCascade(rock)}>
              View Cascade
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
