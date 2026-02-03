import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { AdminActions } from '@/components/profile/AdminActions';
import { ActivityPanel } from '@/components/profile/ActivityPanel';
import { CSCProfileFields } from '@/components/profile/CSCProfileFields';
import { TeamProfileFields } from '@/components/profile/TeamProfileFields';
import { TimeInboxSettings } from '@/components/profile/TimeInboxSettings';

interface UserData {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone: string | null;
  user_type: string;
  unicorn_role: string;
  tenant_id: number | null;
  disabled: boolean;
  archived: boolean;
  avatar_url: string | null;
  job_title: string | null;
  timezone: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  tenant_name?: string | null;
  staff_team?: string | null;
  staff_teams?: string[] | null;  // New array field for multiple teams
  // CSC fields
  linkedin_url?: string | null;
  booking_url?: string | null;
  working_days?: string[] | null;
  working_hours?: { start: string; end: string } | null;
  availability_note?: string | null;
  public_holiday_region?: string | null;
  is_csc?: boolean;
  // Leave fields
  leave_from?: string | null;
  leave_until?: string | null;  // Corrected field name
  away_message?: string | null;
  cover_user_id?: string | null;
  superadmin_level?: string | null;
}

interface CurrentUser {
  user_uuid: string;
  unicorn_role: string | null;
  user_type: string | null;
  tenant_id: number | null;
  global_role: string | null;
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<UserData | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserData();
      fetchCurrentUser();
    }
  }, [userId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: userData } = await supabase
        .from('users')
        .select('user_uuid, unicorn_role, user_type, tenant_id, global_role')
        .eq('user_uuid', authUser.id)
        .single();

      if (userData) {
        setCurrentUser(userData);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      // Use raw query to include all team profile columns
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          user_uuid,
          first_name,
          last_name,
          email,
          mobile_phone,
          user_type,
          unicorn_role,
          tenant_id,
          disabled,
          archived,
          avatar_url,
          job_title,
          timezone,
          bio,
          created_at,
          updated_at,
          last_sign_in_at,
          staff_team,
          staff_teams,
          linkedin_url,
          booking_url,
          working_days,
          working_hours,
          availability_note,
          public_holiday_region,
          is_csc,
          leave_from,
          leave_until,
          away_message,
          cover_user_id,
          superadmin_level,
          tenants!tenant_id(name)
        `)
        .eq('user_uuid', userId)
        .single();

      if (userError) throw userError;

      // Add tenant name to user data and cast JSON fields
      const rawData = userData as any;
      const userWithTenant: UserData = {
        ...rawData,
        tenant_name: rawData.tenants?.name || null,
        staff_team: rawData.staff_team || null,
        staff_teams: rawData.staff_teams || null,
        working_days: rawData.working_days as string[] | null,
        working_hours: rawData.working_hours as { start: string; end: string } | null,
        leave_from: rawData.leave_from || null,
        leave_until: rawData.leave_until || null,
        away_message: rawData.away_message || null,
        cover_user_id: rawData.cover_user_id || null,
        superadmin_level: rawData.superadmin_level || null,
      };
      delete (userWithTenant as any).tenants;

      setUser(userWithTenant);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load user profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const canEditProfile = user && currentUser && (
    user.user_uuid === currentUser.user_uuid || // User editing themselves
    (currentUser.unicorn_role === 'Super Admin' && 
     (currentUser.user_type === 'Vivacity' || currentUser.user_type === 'Vivacity Team')) || // Super Admin
    (currentUser.unicorn_role === 'Admin' && 
     (currentUser.user_type === 'Client' || currentUser.user_type === 'Client Parent') && 
     user.tenant_id === currentUser.tenant_id) // Client Admin
  );

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl space-y-6 animate-fade-in">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!user || !currentUser) {
    return (
      <div className="container mx-auto p-6 max-w-7xl text-center">
        <p className="text-muted-foreground">User not found</p>
        <Button onClick={() => navigate(-1)} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const canEdit = canEditProfile ?? false;
  // Use global_role as authoritative source for SuperAdmin check
  const isSuperAdmin = currentUser.global_role === 'SuperAdmin' || currentUser.unicorn_role === 'Super Admin';
  const isAdmin = isSuperAdmin || 
                  (currentUser.unicorn_role === 'Admin' && 
                   (currentUser.user_type === 'Client' || currentUser.user_type === 'Client Parent') &&
                   user.tenant_id === currentUser.tenant_id);

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6 animate-fade-in">
      {/* Profile Header Card */}
      <Card className="animate-scale-in">
        <CardContent className="pt-6">
          <ProfileHeader
            user={user}
            tenantName={user.tenant_name}
            canEdit={canEdit}
            onAvatarChange={fetchUserData}
            onEditClick={() => setIsEditing(!isEditing)}
            isEditing={isEditing}
            isSuperAdmin={isSuperAdmin}
            isViewingOwnProfile={user.user_uuid === currentUser.user_uuid}
          />
        </CardContent>
      </Card>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          <ProfileForm
            user={user}
            canEdit={canEdit && isEditing}
            onSave={() => {
              fetchUserData();
              setIsEditing(false);
            }}
          />

          {/* Team Profile Fields (for Team/SuperAdmin users) */}
          <TeamProfileFields
            user={user}
            canEdit={canEdit && isEditing}
            onSave={() => {
              fetchUserData();
              setIsEditing(false);
            }}
            currentUserId={currentUser.user_uuid}
            isCurrentUserSuperAdmin={isSuperAdmin}
          />

          {/* CSC Profile Fields (for CSC users) */}
          {user.is_csc && (
            <CSCProfileFields
              user={user}
              canEdit={canEdit && isEditing}
              onSave={() => {
                fetchUserData();
                setIsEditing(false);
              }}
            />
          )}

          {/* Admin Actions - SuperAdmins can see on any profile including their own */}
          {isAdmin && (
            <AdminActions
              user={user}
              currentUserRole={currentUser.unicorn_role}
              currentUserType={currentUser.user_type}
              currentUserTenantId={currentUser.tenant_id}
              onUpdate={fetchUserData}
            />
          )}
        </div>

        {/* Right Column - Activity Panel + Settings */}
        <div className="space-y-6">
          <ActivityPanel user={user} />
          {user.user_uuid === currentUser.user_uuid && <TimeInboxSettings />}
        </div>
      </div>
    </div>
  );
}
