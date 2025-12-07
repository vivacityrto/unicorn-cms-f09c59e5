import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId?: string;
  source?: 'scorecard' | 'rock' | 'headline' | 'ad_hoc';
  defaultTitle?: string;
  defaultDescription?: string;
  linkedRockId?: string;
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  meetingId,
  source = 'ad_hoc',
  defaultTitle = '',
  defaultDescription = '',
  linkedRockId,
}: CreateIssueDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [clientId, setClientId] = useState('');

  const { data: clients } = useQuery({
    queryKey: ['clients-for-issues', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('id, companyname, contactname')
        .eq('tenant_id', profile?.tenant_id!)
        .order('companyname');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id && open,
  });

  const createIssueMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_issue', {
        p_tenant_id: profile?.tenant_id!,
        p_source: source,
        p_title: title,
        p_description: description || null,
        p_priority: priority,
        p_client_id: clientId || null,
        p_linked_rock_id: linkedRockId || null,
        p_meeting_id: meetingId || null,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-issues'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-issues'] });
      toast({ title: 'Issue created successfully' });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating issue', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setClientId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Client (Optional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyname || client.contactname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createIssueMutation.mutate()}
            disabled={!title.trim() || createIssueMutation.isPending}
          >
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
