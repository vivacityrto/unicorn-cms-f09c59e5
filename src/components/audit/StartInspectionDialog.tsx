import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Play } from 'lucide-react';
import type { AuditTemplate } from './AuditTemplatesTable';

interface StartInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AuditTemplate | null;
}

export function StartInspectionDialog({ open, onOpenChange, template }: StartInspectionDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  // Fetch clients
  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('id, companyname, rto_name, rtoid, logo_url')
        .eq('tenant_id', profile!.tenant_id!)
        .order('companyname');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id && open,
  });

  const handleStartInspection = async () => {
    if (!selectedClient || !template || !profile) return;

    setIsCreating(true);
    try {
      // Create new audit/inspection record linked to the template
      const { data: newAudit, error } = await supabase
        .from('audit')
        .insert({
          tenant_id: profile.tenant_id!,
          client_id: selectedClient,
          created_by: profile.user_uuid,
          template_id: parseInt(template.id),
          audit_title: template.name,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Inspection started successfully');
      onOpenChange(false);
      setSelectedClient('');
      
      // Navigate to the inspection workspace in live/input mode
      navigate(`/audits/${newAudit.id}`);
    } catch (error: any) {
      console.error('Error creating inspection:', error);
      toast.error('Failed to start inspection: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedClient('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Start Inspection
          </DialogTitle>
          <DialogDescription>
            Select a client to start an inspection using the "{template?.name}" template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client">Select Client</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger id="client">
                <SelectValue placeholder={clientsLoading ? "Loading clients..." : "Choose a client"} />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <div className="flex items-center gap-2">
                      {client.logo_url && (
                        <img 
                          src={client.logo_url} 
                          alt="" 
                          className="h-5 w-5 rounded object-cover"
                        />
                      )}
                      <span>{client.companyname || client.rto_name || 'Unknown'}</span>
                      {client.rtoid && (
                        <span className="text-muted-foreground text-xs">({client.rtoid})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {template && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Template:</span> {template.name}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleStartInspection} 
            disabled={!selectedClient || isCreating}
            className="gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Inspection
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
