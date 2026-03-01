import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Upload, Trash2, Building2 } from 'lucide-react';

interface TenantLogoUploadProps {
  tenantId: number;
  currentLogoPath: string | null;
  onLogoChange: (newPath: string | null) => void;
}

export function TenantLogoUpload({ tenantId, currentLogoPath, onLogoChange }: TenantLogoUploadProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader';

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('client-logos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 2MB', variant: 'destructive' });
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Use PNG, JPG, SVG, or WebP', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${tenantId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update tenants.logo_path
      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_path: filePath } as any)
        .eq('id', tenantId);

      if (updateError) throw updateError;

      // Audit log
      if (user) {
        await supabase.from('client_audit_log').insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          action: 'logo.uploaded',
          entity_type: 'tenant',
          entity_id: String(tenantId),
          details: { file_path: filePath, file_name: file.name }
        });
      }

      onLogoChange(filePath);
      toast({ title: 'Logo uploaded successfully' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!currentLogoPath) return;

    setUploading(true);
    try {
      await supabase.storage.from('client-logos').remove([currentLogoPath]);

      const { error } = await supabase
        .from('tenants')
        .update({ logo_path: null } as any)
        .eq('id', tenantId);

      if (error) throw error;

      if (user) {
        await supabase.from('client_audit_log').insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          action: 'logo.deleted',
          entity_type: 'tenant',
          entity_id: String(tenantId),
          details: { removed_path: currentLogoPath }
        });
      }

      onLogoChange(null);
      toast({ title: 'Logo removed' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar className={`h-16 w-16 border-2 shadow-md ${!currentLogoPath ? 'border-dashed border-border' : 'border-border'}`}>
        {currentLogoPath ? (
          <AvatarImage src={getPublicUrl(currentLogoPath)} alt="Tenant logo" />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-xl">
          <Building2 className="h-7 w-7" />
        </AvatarFallback>
      </Avatar>

      {!currentLogoPath && (
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground leading-tight">
            Supported: jpeg, bmp, png
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Max: 600px longest side
          </p>
        </div>
      )}

      {isStaff && (
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,image/bmp"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3 w-3 mr-1" />
            {currentLogoPath ? 'Replace' : 'Upload'}
          </Button>
          {currentLogoPath && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive"
              onClick={handleDelete}
              disabled={uploading}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
