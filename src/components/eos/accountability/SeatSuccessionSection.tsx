import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Shield, 
  ShieldAlert, 
  UserCheck, 
  AlertTriangle,
  Save,
  X,
  CalendarOff,
  Edit2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeatSuccessionStatus } from '@/hooks/useSeatSuccession';
import type { VivacityTeamUser } from '@/hooks/useVivacityTeamUsers';
import { SeatCoverageIndicator } from './SeatCoverageIndicator';

interface SeatSuccessionSectionProps {
  succession: SeatSuccessionStatus | null;
  seatId: string;
  canEdit: boolean;
  teamUsers: VivacityTeamUser[];
  onUpdateBackup: (seatId: string, backupUserId: string | null) => void;
  onUpdateCritical: (seatId: string, critical: boolean) => void;
  onUpdateCoverNotes: (seatId: string, notes: string) => void;
}

export function SeatSuccessionSection({
  succession,
  seatId,
  canEdit,
  teamUsers,
  onUpdateBackup,
  onUpdateCritical,
  onUpdateCoverNotes,
}: SeatSuccessionSectionProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(succession?.coverNotes || '');

  // Filter out primary owner from backup options
  const availableBackups = teamUsers.filter(
    u => u.user_uuid !== succession?.primaryOwnerUserId
  );

  const getInitials = (name: string | null): string => {
    if (!name) return '?';
    const parts = name.split(' ');
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleSaveNotes = () => {
    onUpdateCoverNotes(seatId, notesDraft);
    setIsEditingNotes(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Succession & Cover
          </CardTitle>
          {succession && <SeatCoverageIndicator succession={succession} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Critical Seat Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Critical Seat</Label>
            <p className="text-xs text-muted-foreground">
              Mark if this seat is essential and needs backup coverage
            </p>
          </div>
          <Switch
            checked={succession?.criticalSeat || false}
            onCheckedChange={(checked) => onUpdateCritical(seatId, checked)}
            disabled={!canEdit}
          />
        </div>

        {/* Critical seat warning */}
        {succession?.criticalSeat && !succession?.backupOwnerUserId && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium">Backup Recommended</p>
              <p>Critical seats should have a backup owner assigned</p>
            </div>
          </div>
        )}

        {/* Backup Owner Selector */}
        <div className="space-y-2">
          <Label className="text-sm">Backup Owner</Label>
          {canEdit ? (
            <Select
              value={succession?.backupOwnerUserId || 'none'}
              onValueChange={(value) => 
                onUpdateBackup(seatId, value === 'none' ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select backup owner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No backup assigned</SelectItem>
                {availableBackups.map(user => (
                  <SelectItem key={user.user_uuid} value={user.user_uuid}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(`${user.first_name} ${user.last_name}`)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{user.first_name} {user.last_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : succession?.backupOwnerName ? (
            <div className="flex items-center gap-2 p-2 rounded-lg border">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {getInitials(succession.backupOwnerName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{succession.backupOwnerName}</span>
              {succession.backupOnLeave && (
                <Badge variant="outline" className="text-[10px] gap-0.5">
                  <CalendarOff className="h-2 w-2" />
                  On Leave
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No backup assigned</p>
          )}
        </div>

        {/* Cover Status */}
        {succession?.coverActive && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Cover Active
              </span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {succession.backupOwnerName} is covering while {succession.primaryOwnerName} is on leave
            </p>
          </div>
        )}

        {/* Cover Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Cover Instructions</Label>
            {canEdit && !isEditingNotes && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs"
                onClick={() => {
                  setNotesDraft(succession?.coverNotes || '');
                  setIsEditingNotes(true);
                }}
              >
                <Edit2 className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
          </div>
          
          {isEditingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="When primary is unavailable, backup should..."
                className="text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveNotes}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setIsEditingNotes(false)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {succession?.coverNotes || 'No cover instructions provided'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
