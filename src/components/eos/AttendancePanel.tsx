import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Users, UserPlus, CheckCircle, Clock, XCircle, 
  ChevronDown, ChevronUp, AlertTriangle, UserCheck, Trash2, RefreshCw
} from 'lucide-react';
import { useMeetingAttendance, AttendanceStatus, MeetingAttendee, MeetingRole } from '@/hooks/useMeetingAttendance';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OnlineUser } from '@/hooks/useMeetingRealtime';

interface AttendancePanelProps {
  meetingId: string;
  meetingType: string;
  meetingStatus?: string;
  isLive?: boolean;
  canEdit?: boolean;
  onlineUsers?: OnlineUser[];
}

const statusConfig: Record<AttendanceStatus, { label: string; icon: React.ReactNode; color: string }> = {
  invited: { label: 'Invited', icon: <Clock className="w-3 h-3" />, color: 'bg-muted text-muted-foreground' },
  accepted: { label: 'Accepted', icon: <CheckCircle className="w-3 h-3" />, color: 'bg-primary/20 text-primary' },
  declined: { label: 'Declined', icon: <XCircle className="w-3 h-3" />, color: 'bg-destructive/20 text-destructive' },
  attended: { label: 'Present', icon: <CheckCircle className="w-3 h-3" />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  late: { label: 'Late', icon: <Clock className="w-3 h-3" />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  left_early: { label: 'Left Early', icon: <Clock className="w-3 h-3" />, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  no_show: { label: 'No Show', icon: <XCircle className="w-3 h-3" />, color: 'bg-destructive/20 text-destructive' },
};

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  attendee: 'Attendee',
  guest: 'Guest',
  visionary: 'Visionary',
  integrator: 'Integrator',
  core_team: 'Core Team',
};

export const AttendancePanel = ({ 
  meetingId, 
  meetingType,
  meetingStatus = 'scheduled',
  isLive = false,
  canEdit = true,
  onlineUsers = []
}: AttendancePanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<MeetingRole>('attendee');
  const [guestNotes, setGuestNotes] = useState('');

  const isScheduled = meetingStatus === 'scheduled';

  // Helper to check if a user is currently online
  const isUserOnline = (userId: string) => {
    return onlineUsers.some(u => u.user_id === userId);
  };

  const {
    attendees,
    attendeesLoading,
    quorumStatus,
    presentCount,
    invitedCount,
    attendanceRate,
    updateAttendance,
    updateAttendanceSilent,
    markAllPresent,
    addGuest,
    addGuestSilent,
    addAttendee,
    removeAttendee,
    seedFromRoles,
  } = useMeetingAttendance(meetingId);

  // Track which online users we've already processed to avoid duplicate mutations
  const processedOnlineUsersRef = useRef<Set<string>>(new Set());

  // Auto-mark online users as attended during live meetings
  useEffect(() => {
    if (!isLive || !onlineUsers.length || attendeesLoading || !attendees) return;

    for (const onlineUser of onlineUsers) {
      const uid = onlineUser.user_id;
      if (!uid || uid === 'anonymous' || processedOnlineUsersRef.current.has(uid)) continue;

      const existingAttendee = attendees.find(a => a.user_id === uid);

      if (existingAttendee) {
        // Already in attendee list — mark as attended if not already present
        if (existingAttendee.attendance_status !== 'attended' && existingAttendee.attendance_status !== 'late') {
          processedOnlineUsersRef.current.add(uid);
          updateAttendanceSilent.mutate({ userId: uid, status: 'attended' });
        }
      } else {
        // Not in attendee list — add as guest and mark attended
        processedOnlineUsersRef.current.add(uid);
        addGuestSilent.mutate({ userId: uid, notes: 'Auto-added (joined online)' });
      }
    }
  }, [isLive, onlineUsers, attendees, attendeesLoading]);

  // Fetch available users for adding attendees/guests
  const { data: availableUsers } = useQuery({
    queryKey: ['tenant-users-for-attendee', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .order('first_name');
      if (error) throw error;
      return data;
    },
    enabled: addDialogOpen,
  });

  // Filter out users already in attendees list
  const availableToAdd = availableUsers?.filter(
    user => !attendees?.some(a => a.user_id === user.user_uuid)
  );

  const handleStatusChange = (attendee: MeetingAttendee, newStatus: AttendanceStatus) => {
    updateAttendance.mutate({ userId: attendee.user_id, status: newStatus });
  };

  const handleAddAttendee = () => {
    if (selectedUserId) {
      if (isLive) {
        // During live meeting, add as guest
        addGuest.mutate({ userId: selectedUserId, notes: guestNotes });
      } else {
        // Before meeting starts, add as regular attendee with role
        addAttendee.mutate({ userId: selectedUserId, role: selectedRole });
      }
      setAddDialogOpen(false);
      setSelectedUserId('');
      setSelectedRole('attendee');
      setGuestNotes('');
    }
  };

  const handleRemoveAttendee = (userId: string) => {
    removeAttendee.mutate({ userId });
  };

  const handleSeedFromRoles = () => {
    seedFromRoles.mutate();
  };

  const getInitials = (attendee: MeetingAttendee) => {
    const first = attendee.users?.first_name?.[0] || '';
    const last = attendee.users?.last_name?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  const getName = (attendee: MeetingAttendee) => {
    const first = attendee.users?.first_name || '';
    const last = attendee.users?.last_name || '';
    return `${first} ${last}`.trim() || 'Unknown User';
  };

  return (
    <Card className="border-border">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Attendance
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardTitle>
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {presentCount}/{invitedCount} ({attendanceRate}%)
              </Badge>
              {quorumStatus && (
                <Badge 
                  variant={quorumStatus.quorum_met ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {quorumStatus.quorum_met ? 'Quorum Met' : 'No Quorum'}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Quorum Issues Warning */}
            {quorumStatus && !quorumStatus.quorum_met && quorumStatus.issues.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Quorum Requirements Not Met</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {quorumStatus.issues.map((issue, idx) => (
                        <li key={idx}>• {issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions - Before meeting starts */}
            {isScheduled && canEdit && (
              <div className="flex flex-wrap gap-2">
                {attendees?.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSeedFromRoles}
                    disabled={seedFromRoles.isPending}
                    className="text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {seedFromRoles.isPending ? 'Loading...' : 'Seed from EOS Roles'}
                  </Button>
                )}
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-xs">
                      <UserPlus className="w-3 h-3 mr-1" />
                      Add Attendee
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Attendee</DialogTitle>
                      <DialogDescription>
                        Add a team member to this meeting.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select User</label>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a user..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableToAdd?.map((user) => (
                              <SelectItem key={user.user_uuid} value={user.user_uuid}>
                                {user.first_name} {user.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Role</label>
                        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as MeetingRole)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="attendee">Attendee</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="visionary">Visionary</SelectItem>
                            <SelectItem value="integrator">Integrator</SelectItem>
                            <SelectItem value="core_team">Core Team</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddAttendee} disabled={!selectedUserId || addAttendee.isPending}>
                        Add Attendee
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Quick Actions - During live meeting */}
            {isLive && canEdit && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAllPresent.mutate()}
                  disabled={markAllPresent.isPending}
                  className="text-xs"
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  Mark All Present
                </Button>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-xs">
                      <UserPlus className="w-3 h-3 mr-1" />
                      Add Guest
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Guest Attendee</DialogTitle>
                      <DialogDescription>
                        Add a guest who was not originally invited to this meeting.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select User</label>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a user..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableToAdd?.map((user) => (
                              <SelectItem key={user.user_uuid} value={user.user_uuid}>
                                {user.first_name} {user.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notes (optional)</label>
                        <Input
                          value={guestNotes}
                          onChange={(e) => setGuestNotes(e.target.value)}
                          placeholder="Reason for attending..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddAttendee} disabled={!selectedUserId || addGuest.isPending}>
                        Add Guest
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Attendee List */}
            <div className="space-y-2">
              {attendeesLoading ? (
                <div className="text-sm text-muted-foreground">Loading attendees...</div>
              ) : attendees?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No attendees yet</div>
              ) : (
                attendees?.map((attendee) => (
                  <div
                    key={attendee.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(attendee)}
                          </AvatarFallback>
                        </Avatar>
                        {isUserOnline(attendee.user_id) && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{getName(attendee)}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[attendee.role_in_meeting] || attendee.role_in_meeting}
                          {attendee.notes && ` • ${attendee.notes}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isScheduled && canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveAttendee(attendee.user_id)}
                          disabled={removeAttendee.isPending}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {isLive && canEdit ? (
                        <Select
                          value={attendee.attendance_status}
                          onValueChange={(value: AttendanceStatus) => handleStatusChange(attendee, value)}
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="attended">Present</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="left_early">Left Early</SelectItem>
                            <SelectItem value="no_show">No Show</SelectItem>
                            <SelectItem value="invited">Invited</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={statusConfig[attendee.attendance_status]?.color || ''}>
                          {statusConfig[attendee.attendance_status]?.icon}
                          <span className="ml-1">
                            {statusConfig[attendee.attendance_status]?.label || attendee.attendance_status}
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
