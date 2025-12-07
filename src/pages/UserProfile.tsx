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
}

interface CurrentUser {
  user_uuid: string;
  unicorn_role: string | null;
  user_type: string | null;
  tenant_id: number | null;
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
        .select('user_uuid, unicorn_role, user_type, tenant_id')
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
          tenants!tenant_id(name)
        `)
        .eq('user_uuid', userId)
        .single();

      if (userError) throw userError;

      // Add tenant name to user data
      const userWithTenant = {
        ...userData,
        tenant_name: (userData.tenants as any)?.name || null,
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
    (currentUser.unicorn_role === 'Super Admin' && currentUser.user_type === 'Vivacity') || // Super Admin
    (currentUser.unicorn_role === 'Admin' && currentUser.user_type === 'Client' && user.tenant_id === currentUser.tenant_id) // Client Admin
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
  const isAdmin = currentUser.unicorn_role === 'Super Admin' || 
                  (currentUser.unicorn_role === 'Admin' && user.tenant_id === currentUser.tenant_id);

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

          {/* Admin Actions */}
          {isAdmin && user.user_uuid !== currentUser.user_uuid && (
            <AdminActions
              user={user}
              currentUserRole={currentUser.unicorn_role}
              currentUserType={currentUser.user_type}
              currentUserTenantId={currentUser.tenant_id}
              onUpdate={fetchUserData}
            />
          )}
        </div>

        {/* Right Column - Activity Panel */}
        <div className="space-y-6">
          <ActivityPanel user={user} />
        </div>
      </div>
    </div>
  );
}
