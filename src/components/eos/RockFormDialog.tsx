import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useEosRocks } from '@/hooks/useEos';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EosRock } from '@/types/eos';

interface RockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock?: EosRock | null;
}

export function RockFormDialog({ open, onOpenChange, rock }: RockFormDialogProps) {
  const { profile } = useAuth();
  const { createRock, updateRock } = useEosRocks();
  
  const [title, setTitle] = useState(rock?.title || '');
  const [description, setDescription] = useState(rock?.description || '');
  const [clientId, setClientId] = useState(rock?.client_id || '');
  const [status, setStatus] = useState(rock?.status || 'on_track');
  const [priority, setPriority] = useState(rock?.priority || 1);
  const [quarterNumber, setQuarterNumber] = useState(
    rock?.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3)
  );
  const [quarterYear, setQuarterYear] = useState(rock?.quarter_year || new Date().getFullYear());
  const [dueDate, setDueDate] = useState(rock?.due_date ? rock.due_date.split('T')[0] : '');

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-for-rocks', profile?.tenant_id],
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

  const handleSubmit = async () => {
    const rockData = {
      title,
      description: description || null,
      client_id: clientId || null,
      status,
      priority,
      quarter_number: quarterNumber,
      quarter_year: quarterYear,
      due_date: dueDate,
      tenant_id: profile?.tenant_id,
      owner_id: profile?.user_uuid,
    };

    if (rock?.id) {
      await updateRock.mutateAsync({ id: rock.id, ...rockData });
    } else {
      await createRock.mutateAsync(rockData);
    }
    
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setClientId('');
    setStatus('on_track');
    setPriority(1);
    setQuarterNumber(Math.ceil((new Date().getMonth() + 1) / 3));
    setQuarterYear(new Date().getFullYear());
    setDueDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rock ? 'Edit Rock' : 'Create New Rock'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="90-day goal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Details about this rock..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quarter">Quarter *</Label>
              <div className="flex gap-2">
                <Select value={String(quarterNumber)} onValueChange={(v) => setQuarterNumber(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Year"
                  value={quarterYear}
                  onChange={(e) => setQuarterYear(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Due Date *</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client (Optional)</Label>
            <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.companyname || client.contactname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="off_track">Off Track</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority: {priority}</Label>
            <Slider
              value={[priority]}
              onValueChange={(v) => setPriority(v[0])}
              min={1}
              max={5}
              step={1}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low (1)</span>
              <span>Critical (5)</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !dueDate || createRock.isPending || updateRock.isPending}
          >
            {rock ? 'Update' : 'Create'} Rock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
