import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { User, Clock, Calendar, Users, Shield } from 'lucide-react';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { TimeCaptureTab } from '@/components/settings/TimeCaptureTab';
import { CalendarTab } from '@/components/settings/CalendarTab';
import { TeamProfileTab } from '@/components/settings/TeamProfileTab';
import { AdminActionsTab } from '@/components/settings/AdminActionsTab';

const TAB_VALUES = ['profile', 'time', 'calendar', 'team', 'admin'] as const;
type TabValue = typeof TAB_VALUES[number];

export default function Settings() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [teamUserData, setTeamUserData] = useState<any>(null);
  const [liveTime, setLiveTime] = useState('');
  const [timezoneOptions, setTimezoneOptions] = useState<{ value: string; label: string }[]>([]);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    job_title: '',
    timezone: 'Australia/Sydney',
    bio: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Get current tab from URL, default to 'profile'
  const currentTab = (searchParams.get('tab') as TabValue) || 'profile';

  // Validate tab value and redirect if invalid
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && !TAB_VALUES.includes(tab as TabValue)) {
      setSearchParams({ tab: 'profile' });
    }
    // Redirect non-SuperAdmins from admin tab
    if (tab === 'admin' && !isSuperAdmin) {
      setSearchParams({ tab: 'profile' });
    }
  }, [searchParams, isSuperAdmin, setSearchParams]);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // Fetch timezone options from database
  useEffect(() => {
    const fetchTimezones = async () => {
      const { data, error } = await supabase
        .from('timezone_options')
        .select('timezone_value, timezone_label')
        .eq('is_active', true)
        .order('id');
      
      if (!error && data) {
        setTimezoneOptions(data.map(tz => ({
          value: tz.timezone_value,
          label: tz.timezone_label
        })));
      }
    };
    fetchTimezones();
  }, []);

  // Live time update effect
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const userTime = now.toLocaleString('en-AU', {
        timeZone: formData.timezone || 'Australia/Sydney',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: '2-digit',
        month: 'short',
      });
      setLiveTime(userTime);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [formData.timezone]);

  useEffect(() => {
    if (user && profile) {
      fetchUserData();
    }
  }, [user, profile]);

  const fetchUserData = async () => {
    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_uuid', user?.id)
        .single();

      if (error) throw error;

      setFormData({
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        email: userData.email || '',
        phone: userData.mobile_phone || '',
        job_title: userData.job_title || '',
        timezone: userData.timezone || 'Australia/Sydney',
        bio: userData.bio || '',
        newPassword: '',
        confirmPassword: '',
      });
      setAvatarUrl(userData.avatar_url);

      // Set team user data for TeamProfileFields component
      setTeamUserData({
        user_uuid: userData.user_uuid,
        linkedin_url: userData.linkedin_url,
        booking_url: userData.booking_url,
        working_days: userData.working_days,
        working_hours: userData.working_hours,
        availability_note: userData.availability_note,
        public_holiday_region: userData.public_holiday_region,
        is_csc: userData.is_csc,
        leave_from: userData.leave_from,
        leave_until: userData.leave_until,
        away_message: userData.away_message,
        cover_user_id: userData.cover_user_id,
        user_type: userData.user_type,
        unicorn_role: userData.unicorn_role,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          mobile_phone: formData.phone,
          job_title: formData.job_title,
          timezone: formData.timezone,
          bio: formData.bio,
        })
        .eq('user_uuid', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if team profile tab should be shown (Vivacity team members only)
  const showTeamTab = isVivacityTeam && teamUserData;

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <div className="px-6 pt-2">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="time" className="gap-2 data-[state=active]:bg-background">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Time Capture</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-background">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            {showTeamTab && (
              <TabsTrigger value="team" className="gap-2 data-[state=active]:bg-background">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Team Profile</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="admin" className="gap-2 data-[state=active]:bg-background text-destructive data-[state=active]:text-destructive">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Admin Actions</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="mt-0">
            <ProfileTab
              formData={formData}
              setFormData={setFormData}
              avatarUrl={avatarUrl}
              setAvatarUrl={setAvatarUrl}
              timezoneOptions={timezoneOptions}
              liveTime={liveTime}
              onSaveProfile={handleSaveProfile}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="time" className="mt-0">
            <TimeCaptureTab />
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <CalendarTab />
          </TabsContent>

          {showTeamTab && (
            <TabsContent value="team" className="mt-0">
              <TeamProfileTab 
                teamUserData={teamUserData} 
                onSave={fetchUserData}
              />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="admin" className="mt-0">
              <AdminActionsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
