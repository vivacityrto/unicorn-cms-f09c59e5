import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Building2, 
  Users, 
  User,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import type { RockWithHierarchy } from '@/types/eos';
import { normalizeStatus } from '@/utils/rockRollup';
import { cn } from '@/lib/utils';

interface UserInfo {
  name: string;
  initials: string;
  avatarUrl?: string | null;
}

interface RockCascadeViewProps {
  rock: RockWithHierarchy;
  allRocks: RockWithHierarchy[];
  onCreateTeamRock?: (parentRock: RockWithHierarchy) => void;
  onCreateIndividualRock?: (parentRock: RockWithHierarchy) => void;
  onEditRock?: (rock: RockWithHierarchy) => void;
  getUserName?: (userId: string) => string | null;
  getUserInfo?: (userId: string) => UserInfo | null;
  getFunctionName?: (functionId: string) => string | null;
  level?: number;
}

export function RockCascadeView({
  rock,
  allRocks,
  onCreateTeamRock,
  onCreateIndividualRock,
  onEditRock,
  getUserName,
  getUserInfo,
  getFunctionName,
  level = 0,
}: RockCascadeViewProps) {
  const [isOpen, setIsOpen] = useState(level < 2);
  
  const children = allRocks.filter(r => r.parent_rock_id === rock.id);
  const hasChildren = children.length > 0;
  const status = normalizeStatus(rock.rollupStatus || rock.status);

  const getLevelIcon = (rockLevel: string | undefined) => {
    switch (rockLevel) {
      case 'company': return Building2;
      case 'team': return Users;
      case 'individual': return User;
      default: return Building2;
    }
  };

  const getLevelColor = (rockLevel: string | undefined) => {
    switch (rockLevel) {
      case 'company': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/30';
      case 'team': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
      case 'individual': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      default: return 'text-purple-600 bg-purple-100';
    }
  };

  const getStatusConfig = (s: string) => {
    const configs: Record<string, { icon: typeof TrendingUp; className: string }> = {
      on_track: { icon: TrendingUp, className: 'text-green-600' },
      off_track: { icon: TrendingDown, className: 'text-red-600' },
      at_risk: { icon: AlertCircle, className: 'text-amber-600' },
      complete: { icon: CheckCircle, className: 'text-blue-600' },
    };
    return configs[s] || configs.on_track;
  };

  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;
  const LevelIcon = getLevelIcon(rock.rock_level);

  const ownerInfo = rock.owner_id && getUserInfo ? getUserInfo(rock.owner_id) : null;
  const ownerName = ownerInfo?.name || (rock.owner_id && getUserName ? getUserName(rock.owner_id) : null);
  const functionName = rock.function_id && getFunctionName ? getFunctionName(rock.function_id) : rock.function?.name;

  return (
    <div className={cn('relative', level > 0 && 'ml-6 border-l-2 border-muted pl-4')}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-start gap-2 py-2">
          {/* Expand/Collapse button */}
          {hasChildren || rock.rock_level !== 'individual' ? (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          ) : (
            <div className="w-6" />
          )}

          {/* Rock card */}
          <Card 
            className={cn(
              'flex-1 p-3 hover:shadow-md transition-shadow cursor-pointer',
              status === 'off_track' && 'border-l-4 border-l-red-500',
              status === 'at_risk' && 'border-l-4 border-l-amber-500',
              status === 'complete' && 'border-l-4 border-l-blue-500'
            )}
            onClick={() => onEditRock?.(rock)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Level icon */}
                <div className={cn('p-1.5 rounded', getLevelColor(rock.rock_level))}>
                  <LevelIcon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{rock.title}</span>
                    {functionName && (
                      <Badge variant="outline" className="text-xs">
                        {functionName}
                      </Badge>
                    )}
                  </div>
                  
                  {ownerName && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      {ownerInfo?.avatarUrl ? (
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={ownerInfo.avatarUrl} alt={ownerName} />
                          <AvatarFallback className="text-[9px]">{ownerInfo.initials}</AvatarFallback>
                        </Avatar>
                      ) : ownerInfo?.initials ? (
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">{ownerInfo.initials}</AvatarFallback>
                        </Avatar>
                      ) : null}
                      <span>{ownerName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 shrink-0">
                {rock.childStats && rock.childStats.total > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {rock.childStats.complete}/{rock.childStats.total}
                  </Badge>
                )}
                <StatusIcon className={cn('h-5 w-5', statusConfig.className)} />
              </div>
            </div>
          </Card>
        </div>

        <CollapsibleContent>
          {/* Children */}
          {hasChildren && (
            <div className="space-y-1">
              {children.map(child => (
                <RockCascadeView
                  key={child.id}
                  rock={child}
                  allRocks={allRocks}
                  onCreateTeamRock={onCreateTeamRock}
                  onCreateIndividualRock={onCreateIndividualRock}
                  onEditRock={onEditRock}
                  getUserName={getUserName}
                  getUserInfo={getUserInfo}
                  getFunctionName={getFunctionName}
                  level={level + 1}
                />
              ))}
            </div>
          )}

          {/* Add child buttons */}
          {rock.rock_level === 'company' && onCreateTeamRock && (
            <div className="ml-8 py-2">
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTeamRock(rock);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Team Rock
              </Button>
            </div>
          )}

          {rock.rock_level === 'team' && onCreateIndividualRock && (
            <div className="ml-8 py-2">
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateIndividualRock(rock);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Individual Rock
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
