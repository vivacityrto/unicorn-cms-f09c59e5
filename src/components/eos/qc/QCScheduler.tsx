import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { Users, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { useVivacityTeamUsers, VivacityTeamUser } from '@/hooks/useVivacityTeamUsers';
import { supabase } from '@/integrations/supabase/client';
import { format, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';

interface QCSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

// Role badge color helper
const getRoleBadgeVariant = (role: string | null) => {
  switch (role) {
    case 'Super Admin': return 'default';
    case 'Team Leader': return 'secondary';
    case 'Team Member': return 'outline';
    default: return 'outline';
  }
};

export const QCScheduler = ({ open, onOpenChange, onScheduled }: QCSchedulerProps) => {
  const { profile } = useAuth();
  const { templates, scheduleQC } = useQuarterlyConversations();
  const { data: vivacityUsers, isLoading: usersLoading } = useVivacityTeamUsers();
  
  const [revieweeId, setRevieweeId] = useState('');
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [quarterStart, setQuarterStart] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [revieweeOpen, setRevieweeOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  // Auto-calculate quarter end (3 months from start)
  const quarterEnd = quarterStart 
    ? format(addMonths(new Date(quarterStart), 3), 'yyyy-MM-dd')
    : '';

  // Filter managers to only Super Admin and Team Leader
  const managerOptions = vivacityUsers?.filter(u => 
    u.unicorn_role === 'Super Admin' || u.unicorn_role === 'Team Leader'
  ) || [];

  // Auto-select manager when reviewee changes (if they have a manager)
  useEffect(() => {
    if (revieweeId && vivacityUsers) {
      const selectedUser = vivacityUsers.find(u => u.user_uuid === revieweeId);
      // If user has a manager_uuid field, auto-select it
      // For now, we leave it blank as the schema may not have this field
    }
  }, [revieweeId, vivacityUsers]);

  const defaultTemplate = templates?.find(t => t.is_default);

  const getSelectedUser = (userId: string): VivacityTeamUser | undefined => {
    return vivacityUsers?.find(u => u.user_uuid === userId);
  };

  const getDisplayName = (user: VivacityTeamUser | undefined): string => {
    if (!user) return '';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  };

  const getInitials = (user: VivacityTeamUser | undefined): string => {
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const last = user.last_name?.[0] || '';
    return (first + last).toUpperCase() || user.email[0].toUpperCase();
  };

  const handleSchedule = async () => {
    if (!revieweeId || managerIds.length === 0 || !quarterStart || !scheduledDate || !defaultTemplate) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const qcId = await scheduleQC.mutateAsync({
        reviewee_id: revieweeId,
        manager_ids: managerIds,
        template_id: defaultTemplate.id,
        quarter_start: quarterStart,
        quarter_end: quarterEnd,
        scheduled_at: scheduledDate,
      });

      // Send notifications to reviewee and managers
      const schedulerName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Your manager';
      const formattedDate = format(new Date(scheduledDate), 'PPP');
      const qcLink = `/eos/qc/${qcId}`;

      // In-app notification for reviewee
      try {
        await supabase.from('user_notifications').insert({
          user_id: revieweeId,
          type: 'qc_scheduled',
          title: 'Quarterly Conversation Scheduled',
          message: `${schedulerName} has scheduled a Quarterly Conversation with you for ${formattedDate}. Please complete your self-assessment before the meeting.`,
          link: qcLink,
          created_by: profile?.user_uuid || null,
        } as any);
      } catch (e) {
        console.error('Failed to create in-app notification:', e);
      }

      // Email notification to reviewee
      try {
        const revieweeUser = vivacityUsers?.find(u => u.user_uuid === revieweeId);
        if (revieweeUser?.email) {
          await supabase.functions.invoke('send-composed-email', {
            body: {
              tenant_id: 111, // Vivacity tenant
              to: revieweeUser.email,
              subject: `Quarterly Conversation Scheduled — ${formattedDate}`,
              body_html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Quarterly Conversation Scheduled</h2>
                  <p>Hi ${revieweeUser.first_name || 'there'},</p>
                  <p><strong>${schedulerName}</strong> has scheduled a Quarterly Conversation with you.</p>
                  <table style="margin: 16px 0; border-collapse: collapse;">
                    <tr><td style="padding: 4px 12px 4px 0; color: #666; font-weight: 600;">Date</td><td>${formattedDate}</td></tr>
                    <tr><td style="padding: 4px 12px 4px 0; color: #666; font-weight: 600;">Quarter</td><td>${format(new Date(quarterStart), 'MMM yyyy')} — ${format(new Date(quarterEnd), 'MMM yyyy')}</td></tr>
                  </table>
                  <p>Please log in and complete your <strong>self-assessment</strong> before the meeting. This includes rating your alignment with core values, GWC, and other sections.</p>
                  <p style="margin-top: 24px;">
                    <a href="https://unicorn-cms.lovable.app${qcLink}" style="background-color: #7c3aed; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                      Complete Your Assessment
                    </a>
                  </p>
                  <p style="margin-top: 24px; color: #888; font-size: 13px;">Your responses will remain private until the manager starts the meeting.</p>
                </div>
              `,
            },
          });
        }
      } catch (e) {
        console.error('Failed to send QC email notification:', e);
      }

      onScheduled?.();
      onOpenChange(false);
      
      // Reset form
      setRevieweeId('');
      setManagerIds([]);
      setQuarterStart('');
      setScheduledDate('');
    } catch (error: any) {
      toast({ title: 'Error scheduling QC', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedReviewee = getSelectedUser(revieweeId);
  const selectedManager = getSelectedUser(managerIds[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Schedule Quarterly Conversation
            <Badge variant="secondary" className="ml-2 text-xs font-normal">
              Vivacity Internal
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Team Member (Reviewee) Selector */}
          <div className="space-y-2">
            <Label>Team Member (Reviewee) *</Label>
            <Popover open={revieweeOpen} onOpenChange={setRevieweeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={revieweeOpen}
                  className="w-full justify-between h-auto min-h-10"
                >
                  {selectedReviewee ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={selectedReviewee.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(selectedReviewee)}</AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <span>{getDisplayName(selectedReviewee)}</span>
                        {selectedReviewee.unicorn_role && (
                          <Badge variant={getRoleBadgeVariant(selectedReviewee.unicorn_role)} className="ml-2 text-xs">
                            {selectedReviewee.unicorn_role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select team member...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search team members..." />
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandEmpty>No team members found.</CommandEmpty>
                    <CommandGroup>
                      {usersLoading ? (
                        <CommandItem disabled>Loading...</CommandItem>
                      ) : (
                        vivacityUsers?.map((user) => (
                          <CommandItem
                            key={user.user_uuid}
                            value={`${user.first_name} ${user.last_name} ${user.email}`}
                            onSelect={() => {
                              setRevieweeId(user.user_uuid);
                              setRevieweeOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                revieweeId === user.user_uuid ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <Avatar className="h-6 w-6 mr-2">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1">
                              <span>{getDisplayName(user)}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            </div>
                            {user.unicorn_role && (
                              <Badge variant={getRoleBadgeVariant(user.unicorn_role)} className="text-xs ml-2">
                                {user.unicorn_role}
                              </Badge>
                            )}
                          </CommandItem>
                        ))
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Manager Selector */}
          <div className="space-y-2">
            <Label>Manager (Facilitator) *</Label>
            <Popover open={managerOpen} onOpenChange={setManagerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={managerOpen}
                  className="w-full justify-between h-auto min-h-10"
                >
                  {selectedManager ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={selectedManager.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(selectedManager)}</AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <span>{getDisplayName(selectedManager)}</span>
                        {selectedManager.unicorn_role && (
                          <Badge variant={getRoleBadgeVariant(selectedManager.unicorn_role)} className="ml-2 text-xs">
                            {selectedManager.unicorn_role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select manager...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search managers..." />
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandEmpty>No managers found.</CommandEmpty>
                    <CommandGroup>
                      {usersLoading ? (
                        <CommandItem disabled>Loading...</CommandItem>
                      ) : (
                        managerOptions.map((user) => (
                          <CommandItem
                            key={user.user_uuid}
                            value={`${user.first_name} ${user.last_name} ${user.email}`}
                            onSelect={() => {
                              setManagerIds([user.user_uuid]);
                              setManagerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                managerIds[0] === user.user_uuid ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <Avatar className="h-6 w-6 mr-2">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1">
                              <span>{getDisplayName(user)}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            </div>
                            {user.unicorn_role && (
                              <Badge variant={getRoleBadgeVariant(user.unicorn_role)} className="text-xs ml-2">
                                {user.unicorn_role}
                              </Badge>
                            )}
                          </CommandItem>
                        ))
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quarter-start">Quarter Start *</Label>
              <Input
                id="quarter-start"
                type="date"
                value={quarterStart}
                onChange={(e) => setQuarterStart(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quarter-end">Quarter End</Label>
              <Input
                id="quarter-end"
                type="date"
                value={quarterEnd}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduled">Scheduled Date & Time *</Label>
            <Input
              id="scheduled"
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          {defaultTemplate && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">Template: {defaultTemplate.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {defaultTemplate.sections?.length || 0} sections • EOS standard format
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isSubmitting}>
            {isSubmitting ? 'Scheduling...' : 'Schedule QC'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
