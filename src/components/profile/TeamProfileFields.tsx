import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Save, 
  Calendar, 
  Clock, 
  Linkedin, 
  MapPin,
  Globe,
  Plane,
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TeamUser {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface TeamProfileFieldsProps {
  user: {
    user_uuid: string;
    linkedin_url?: string | null;
    booking_url?: string | null;
    working_days?: string[] | null;
    working_hours?: { start: string; end: string } | null;
    availability_note?: string | null;
    public_holiday_region?: string | null;
    is_csc?: boolean;
    leave_from?: string | null;
    leave_to?: string | null;
    away_message?: string | null;
    cover_user_id?: string | null;
    user_type?: string;
    unicorn_role?: string;
  };
  canEdit: boolean;
  onSave: () => void;
}

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

const HOLIDAY_REGIONS = [
  { value: 'AU-NSW', label: 'Australia - NSW' },
  { value: 'AU-VIC', label: 'Australia - VIC' },
  { value: 'AU-QLD', label: 'Australia - QLD' },
  { value: 'AU-SA', label: 'Australia - SA' },
  { value: 'AU-WA', label: 'Australia - WA' },
  { value: 'AU-TAS', label: 'Australia - TAS' },
  { value: 'AU-NT', label: 'Australia - NT' },
  { value: 'AU-ACT', label: 'Australia - ACT' },
  { value: 'PH', label: 'Philippines' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'SG', label: 'Singapore' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

export function TeamProfileFields({ user, canEdit, onSave }: TeamProfileFieldsProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  
  // Check if user is a Team (SuperAdmin) user
  const isTeamUser = user.unicorn_role === 'Super Admin' && 
    (user.user_type === 'Vivacity' || user.user_type === 'Vivacity Team');

  const [formData, setFormData] = useState({
    linkedin_url: user.linkedin_url || '',
    booking_url: user.booking_url || '',
    working_days: user.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
    working_hours_start: user.working_hours?.start || '09:00',
    working_hours_end: user.working_hours?.end || '17:00',
    availability_note: user.availability_note || '',
    public_holiday_region: user.public_holiday_region || '',
    leave_from: user.leave_from ? user.leave_from.split('T')[0] : '',
    leave_to: user.leave_to ? user.leave_to.split('T')[0] : '',
    away_message: user.away_message || '',
    cover_user_id: user.cover_user_id || '',
  });

  useEffect(() => {
    if (isTeamUser) {
      fetchTeamUsers();
    }
  }, [isTeamUser]);

  const fetchTeamUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_team_users');
      if (error) throw error;
      const users = (data || []).filter((u: any) => u.user_uuid !== user.user_uuid) as TeamUser[];
      setTeamUsers(users);
    } catch (error) {
      console.error('Error fetching team users:', error);
    }
  };

  // Only show for Team users
  if (!isTeamUser) {
    return null;
  }

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter(d => d !== day)
        : [...prev.working_days, day]
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate URLs
      if (formData.linkedin_url && !formData.linkedin_url.match(/^https?:\/\//)) {
        toast({
          title: 'Invalid URL',
          description: 'LinkedIn URL must start with http:// or https://',
          variant: 'destructive',
        });
        return;
      }

      if (formData.booking_url && !formData.booking_url.match(/^https?:\/\//)) {
        toast({
          title: 'Invalid URL',
          description: 'Booking URL must start with http:// or https://',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.rpc('update_own_team_profile', {
        p_linkedin_url: formData.linkedin_url || null,
        p_booking_url: formData.booking_url || null,
        p_working_days: formData.working_days,
        p_working_hours: { 
          start: formData.working_hours_start, 
          end: formData.working_hours_end 
        },
        p_availability_note: formData.availability_note || null,
        p_public_holiday_region: formData.public_holiday_region || null,
        p_leave_from: formData.leave_from ? new Date(formData.leave_from).toISOString() : null,
        p_leave_to: formData.leave_to ? new Date(formData.leave_to).toISOString() : null,
        p_away_message: formData.away_message || null,
        p_cover_user_id: formData.cover_user_id || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to update team profile');
      }

      toast({
        title: 'Success',
        description: 'Team profile updated successfully',
      });

      onSave();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasLeaveActive = formData.leave_from && formData.leave_to && 
    new Date(formData.leave_to) >= new Date();

  const hasChanges = 
    formData.linkedin_url !== (user.linkedin_url || '') ||
    formData.booking_url !== (user.booking_url || '') ||
    JSON.stringify(formData.working_days.sort()) !== JSON.stringify((user.working_days || []).sort()) ||
    formData.working_hours_start !== (user.working_hours?.start || '09:00') ||
    formData.working_hours_end !== (user.working_hours?.end || '17:00') ||
    formData.availability_note !== (user.availability_note || '') ||
    formData.public_holiday_region !== (user.public_holiday_region || '') ||
    formData.leave_from !== (user.leave_from?.split('T')[0] || '') ||
    formData.leave_to !== (user.leave_to?.split('T')[0] || '') ||
    formData.away_message !== (user.away_message || '') ||
    formData.cover_user_id !== (user.cover_user_id || '');

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-blue-600">Team</Badge>
          <CardTitle>Team Profile</CardTitle>
        </div>
        <CardDescription>
          Your team profile and availability settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Leave Status Banner */}
        {hasLeaveActive && (
          <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <strong>You are currently marked as away</strong> until {new Date(formData.leave_to).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </AlertDescription>
          </Alert>
        )}

        {/* Links section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin_url" className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn Profile URL
            </Label>
            <Input
              id="linkedin_url"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              disabled={!canEdit}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking_url" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Meeting Booking URL
            </Label>
            <Input
              id="booking_url"
              value={formData.booking_url}
              onChange={(e) => setFormData({ ...formData, booking_url: e.target.value })}
              disabled={!canEdit}
              placeholder="https://outlook.office365.com/book/..."
            />
            <p className="text-xs text-muted-foreground">
              Microsoft Bookings or Calendly link for tenants to schedule meetings
            </p>
          </div>
        </div>

        {/* Working schedule */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Working Schedule
          </Label>
          
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => canEdit && handleDayToggle(day.value)}
                  disabled={!canEdit}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    formData.working_days.includes(day.value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  } ${!canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="working_hours_start" className="text-xs">Start</Label>
                <Input
                  id="working_hours_start"
                  type="time"
                  value={formData.working_hours_start}
                  onChange={(e) => setFormData({ ...formData, working_hours_start: e.target.value })}
                  disabled={!canEdit}
                  className="w-28"
                />
              </div>
              <span className="text-muted-foreground mt-6">to</span>
              <div className="space-y-1.5">
                <Label htmlFor="working_hours_end" className="text-xs">End</Label>
                <Input
                  id="working_hours_end"
                  type="time"
                  value={formData.working_hours_end}
                  onChange={(e) => setFormData({ ...formData, working_hours_end: e.target.value })}
                  disabled={!canEdit}
                  className="w-28"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Holiday region */}
        <div className="space-y-2">
          <Label htmlFor="public_holiday_region" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Public Holiday Region
          </Label>
          <Select
            value={formData.public_holiday_region}
            onValueChange={(value) => setFormData({ ...formData, public_holiday_region: value })}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select region..." />
            </SelectTrigger>
            <SelectContent>
              {HOLIDAY_REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  {region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leave Management */}
        <div className="space-y-4 pt-4 border-t">
          <Label className="flex items-center gap-2 text-base font-semibold">
            <Plane className="h-4 w-4" />
            Leave / Away Status
          </Label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leave_from">Leave From</Label>
              <Input
                id="leave_from"
                type="date"
                value={formData.leave_from}
                onChange={(e) => setFormData({ ...formData, leave_from: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="leave_to">Leave Until</Label>
              <Input
                id="leave_to"
                type="date"
                value={formData.leave_to}
                onChange={(e) => setFormData({ ...formData, leave_to: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="away_message">Away Message</Label>
            <Textarea
              id="away_message"
              value={formData.away_message}
              onChange={(e) => setFormData({ ...formData, away_message: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., 'On annual leave. For urgent matters, please contact my cover.'"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cover_user_id" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Cover Contact While Away
            </Label>
            <Select
              value={formData.cover_user_id || 'none'}
              onValueChange={(value) => setFormData({ ...formData, cover_user_id: value === 'none' ? '' : value })}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cover contact..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {teamUsers.map((teamUser) => (
                  <SelectItem key={teamUser.user_uuid} value={teamUser.user_uuid}>
                    {teamUser.first_name} {teamUser.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This person will be shown to tenants as your cover during leave
            </p>
          </div>
        </div>

        {/* Availability note */}
        <div className="space-y-2">
          <Label htmlFor="availability_note" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Availability Note
          </Label>
          <Textarea
            id="availability_note"
            value={formData.availability_note}
            onChange={(e) => setFormData({ ...formData, availability_note: e.target.value })}
            disabled={!canEdit}
            placeholder="e.g., 'Available for calls 9am-3pm. Best contacted via email for non-urgent matters.'"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Optional note displayed to tenants about your availability
          </p>
        </div>

        {/* Save button */}
        {canEdit && hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Team Profile'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}