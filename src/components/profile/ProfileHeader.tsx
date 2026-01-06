import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Edit2, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ProfileHeaderProps {
  user: {
    user_uuid: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
    user_type: string;
    unicorn_role: string;
    disabled: boolean;
    archived: boolean;
    created_at: string;
    last_sign_in_at: string | null;
    staff_team?: string | null;
  };
  tenantName: string | null;
  canEdit: boolean;
  onAvatarChange: () => void;
  onEditClick: () => void;
  isEditing: boolean;
  isSuperAdmin?: boolean; // Current user is SuperAdmin
  isViewingOwnProfile?: boolean; // Whether viewing own profile
}

const TEAM_LABELS: Record<string, { label: string; color: string }> = {
  csc: { label: 'Client Success Champion', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  csc_admin: { label: 'CSC Admin Assistant', color: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  growth: { label: 'Business Growth', color: 'bg-purple-500/10 text-purple-700 border-purple-200' },
  leadership: { label: 'Leadership', color: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  other: { label: 'Staff', color: 'bg-gray-500/10 text-gray-700 border-gray-200' },
};

export function ProfileHeader({ user, tenantName, canEdit, onAvatarChange, onEditClick, isEditing, isSuperAdmin = false, isViewingOwnProfile = true }: ProfileHeaderProps) {
  const { toast } = useToast();
  const { refreshProfile, user: authUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  
  // Determine target user for avatar upload
  // SuperAdmin can upload for the viewed user, others can only upload for themselves
  const targetUserId = isSuperAdmin ? user.user_uuid : authUser?.id;
  const isUploadingForSelf = targetUserId === authUser?.id;
  
  // Can toggle status if SuperAdmin viewing another user's profile
  const canToggleStatus = isSuperAdmin && !isViewingOwnProfile;

  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';

  const getRoleBadgeVariant = () => {
    if (user.unicorn_role === 'Super Admin') return 'default';
    if (user.unicorn_role === 'Admin') return 'secondary';
    return 'outline';
  };

  const getRoleIcon = () => {
    if (user.unicorn_role === 'Super Admin') return '🟣';
    if (user.unicorn_role === 'Admin') return '🟢';
    return '🔵';
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file (JPEG, PNG, GIF, or WebP)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploading(true);

      // Upload to avatars bucket with target user folder structure
      // SuperAdmin can upload for any user, others only for themselves
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `profile.${fileExt}`;
      const filePath = `${targetUserId}/${fileName}`;
      
      console.log(`[Avatar Upload Debug]`, { targetUserId, authUserId: authUser?.id, isSuperAdmin, viewedUserUuid: user.user_uuid, isUploadingForSelf: targetUserId === authUser?.id });

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Avatar upload error:', uploadError);
        
        // Provide clear error messages with original error
        let guidance = '';
        if (uploadError.message.includes('row-level security') || uploadError.message.includes('policy')) {
          guidance = isSuperAdmin 
            ? 'SuperAdmin permission check failed. Contact support.'
            : 'You can only upload your own avatar.';
        } else if (uploadError.message.includes('Payload too large')) {
          guidance = 'Please use an image under 5MB.';
        } else if (uploadError.message.includes('mime')) {
          guidance = 'Please upload a JPEG, PNG, GIF, or WebP image.';
        }
        
        throw new Error(guidance ? `${uploadError.message}\n${guidance}` : uploadError.message);
      }

      // Get public URL and update user record
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update user's avatar_url in the database
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          avatar_url: publicUrlData.publicUrl,
          avatar_path: filePath,
          avatar_updated_at: new Date().toISOString()
        })
        .eq('user_uuid', user.user_uuid);

      if (updateError) {
        console.error('Avatar URL update error:', updateError);
        // Don't throw - the file was uploaded successfully
      }

      toast({
        title: 'Success',
        description: 'Avatar updated successfully',
      });

      onAvatarChange();
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload avatar. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    try {
      setUploading(true);
      
      console.log(`[Avatar Delete] Target user: ${user.user_uuid}, Current user: ${authUser?.id}, SuperAdmin: ${isSuperAdmin}`);

      // Delete from storage
      if (user.avatar_url) {
        const pathParts = user.avatar_url.split('/avatars/');
        if (pathParts.length > 1) {
          const filePath = decodeURIComponent(pathParts[1]);
          const { error: deleteError } = await supabase.storage
            .from('avatars')
            .remove([filePath]);
          
          if (deleteError) {
            console.error('Avatar delete error:', deleteError);
            // SuperAdmin should have permission, show error if it fails
            if (!isSuperAdmin && (deleteError.message.includes('policy') || deleteError.message.includes('security'))) {
              throw new Error('Permission denied: You can only delete your own avatar.');
            }
            // Continue for other errors - we'll still clear the URL
          }
        }
      }

      // Clear avatar_url in the database
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          avatar_url: null,
          avatar_path: null,
          avatar_updated_at: new Date().toISOString()
        })
        .eq('user_uuid', user.user_uuid);

      if (updateError) {
        console.error('Avatar URL clear error:', updateError);
      }

      toast({
        title: 'Success',
        description: 'Avatar removed successfully',
      });

      onAvatarChange();
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove avatar',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isActive = !user.disabled && !user.archived;

  const handleToggleStatus = async () => {
    try {
      setTogglingStatus(true);

      const { data, error } = await supabase.functions.invoke('toggle-user-status', {
        body: {
          user_uuid: user.user_uuid,
          disabled: !user.disabled,
        },
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(data?.detail || data?.code || 'Failed to update status');
      }

      toast({
        title: 'Success',
        description: `User ${user.disabled ? 'activated' : 'deactivated'} successfully`,
      });

      onAvatarChange(); // This refreshes the user data
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative group">
          <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="text-3xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
          
          {canEdit && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full">
              <label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-2 shadow-lg transition-colors">
                  <Upload className="h-4 w-4" />
                </div>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
              
              {user.avatar_url && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="rounded-full h-8 w-8"
                  onClick={handleAvatarDelete}
                  disabled={uploading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        
        {uploading && (
          <p className="text-xs text-muted-foreground">Uploading...</p>
        )}
      </div>

      {/* Identity Section */}
      <div className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">
              {user.first_name} {user.last_name}
            </h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
          
          {canEdit && (
            <Button
              onClick={onEditClick}
              variant={isEditing ? "default" : "outline"}
              size="sm"
              className="gap-2 shrink-0"
            >
              <Edit2 className="h-4 w-4" />
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={getRoleBadgeVariant()} className="gap-1">
            <span>{getRoleIcon()}</span>
            {user.unicorn_role}
          </Badge>
          
          <Badge variant={isActive ? 'default' : 'destructive'} className="gap-1">
            {isActive ? 'Active' : 'Inactive'}
            {canToggleStatus && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="ml-1 hover:opacity-70 transition-opacity"
                    disabled={togglingStatus}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isActive ? (
                      <UserX className="h-3 w-3" />
                    ) : (
                      <UserCheck className="h-3 w-3" />
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {user.disabled ? 'Activate' : 'Deactivate'} User?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {user.disabled 
                        ? `This will restore access for ${user.first_name} ${user.last_name}.`
                        : `This will prevent ${user.first_name} ${user.last_name} from accessing the system.`
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleToggleStatus} disabled={togglingStatus}>
                      {togglingStatus ? 'Processing...' : 'Confirm'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </Badge>

          {user.user_type && (
            <Badge variant="outline">{user.user_type}</Badge>
          )}

          {user.staff_team && TEAM_LABELS[user.staff_team] && (
            <Badge variant="outline" className={TEAM_LABELS[user.staff_team].color}>
              {TEAM_LABELS[user.staff_team].label}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {tenantName && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium">Organization:</span>
              <span>{tenantName}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium">Member Since:</span>
            <span>{formatDate(user.created_at)}</span>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium">Last Login:</span>
            <span>{formatDate(user.last_sign_in_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
