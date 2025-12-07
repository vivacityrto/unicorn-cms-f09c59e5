import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

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
  };
  tenantName: string | null;
  canEdit: boolean;
  onAvatarChange: () => void;
  onEditClick: () => void;
  isEditing: boolean;
}

export function ProfileHeader({ user, tenantName, canEdit, onAvatarChange, onEditClick, isEditing }: ProfileHeaderProps) {
  const { toast } = useToast();
  const { refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);

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
        description: 'Please upload an image file',
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

      // Upload to avatars bucket with user folder structure
      const fileExt = file.name.split('.').pop();
      const fileName = `profile.${fileExt}`;
      const filePath = `${user.user_uuid}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Provide clear error messages for common issues
        const errorMsg = uploadError.message.includes('new row violates row-level security') 
          ? 'Permission denied: Unable to upload avatar. Please contact support.'
          : uploadError.message || 'Failed to upload avatar';
        throw new Error(errorMsg);
      }

      // Database trigger automatically updates user profile and audit log

      toast({
        title: 'Success',
        description: 'Avatar updated successfully',
      });

      onAvatarChange();
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload avatar',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    try {
      setUploading(true);

      // Delete from storage - trigger automatically updates profile
      if (user.avatar_url) {
        const pathParts = user.avatar_url.split('/avatars/');
        if (pathParts.length > 1) {
          const filePath = pathParts[1];
          await supabase.storage.from('avatars').remove([filePath]);
        }
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
        description: error.message,
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
          
          <Badge variant={isActive ? 'default' : 'destructive'}>
            {isActive ? 'Active' : 'Inactive'}
          </Badge>

          {user.user_type && (
            <Badge variant="outline">{user.user_type}</Badge>
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
