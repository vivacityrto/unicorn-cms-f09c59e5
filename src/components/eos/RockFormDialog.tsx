import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useEosRocks } from '@/hooks/useEos';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Armchair, User } from 'lucide-react';
import type { EosRock } from '@/types/eos';

interface RockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock?: EosRock | null;
}

interface SeatWithOwner {
  id: string;
  seat_name: string;
  function_name: string;
  primary_owner_id: string | null;
  primary_owner_name: string | null;
}

export function RockFormDialog({ open, onOpenChange, rock }: RockFormDialogProps) {
  const { profile } = useAuth();
  const { createRock, updateRock } = useEosRocks();
  
  const [title, setTitle] = useState(rock?.title || '');
  const [description, setDescription] = useState(rock?.description || '');
  const [clientId, setClientId] = useState(rock?.client_id || '');
  const [seatId, setSeatId] = useState(rock?.seat_id || '');
  const [status, setStatus] = useState(rock?.status || 'on_track');
  const [priority, setPriority] = useState(rock?.priority || 1);
  const [quarterNumber, setQuarterNumber] = useState(
    rock?.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3)
  );
  const [quarterYear, setQuarterYear] = useState(rock?.quarter_year || new Date().getFullYear());
  const [dueDate, setDueDate] = useState(rock?.due_date ? rock.due_date.split('T')[0] : '');

  // Reset form when rock changes
  useEffect(() => {
    if (rock) {
      setTitle(rock.title || '');
      setDescription(rock.description || '');
      setClientId(rock.client_id || '');
      setSeatId(rock.seat_id || '');
      setStatus(rock.status || 'on_track');
      setPriority(rock.priority || 1);
      setQuarterNumber(rock.quarter_number || Math.ceil((new Date().getMonth() + 1) / 3));
      setQuarterYear(rock.quarter_year || new Date().getFullYear());
      setDueDate(rock.due_date ? rock.due_date.split('T')[0] : '');
    } else {
      resetForm();
    }
  }, [rock]);

  // Fetch seats with their primary owners
  const { data: seats, isLoading: seatsLoading } = useQuery({
    queryKey: ['seats-for-rocks', profile?.tenant_id],
    queryFn: async () => {
      // Get all seats
      const { data: seatsData, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', profile?.tenant_id!);
      
      if (seatsError) throw seatsError;

      // Get primary assignments
      const { data: assignments, error: assignError } = await supabase
        .from('accountability_seat_assignments')
        .select('seat_id, user_id')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('assignment_type', 'Primary')
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
      
      if (assignError) throw assignError;

      // Get user names
      const userIds = [...new Set(assignments?.map(a => a.user_id) || [])];
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);

      const userMap = new Map(users?.map(u => [u.user_uuid, `${u.first_name || ''} ${u.last_name || ''}`.trim()]) || []);
      const assignmentMap = new Map(assignments?.map(a => [a.seat_id, a.user_id]) || []);

      return seatsData?.map((seat): SeatWithOwner => ({
        id: seat.id,
        seat_name: seat.seat_name,
        function_name: (seat.accountability_functions as any)?.name || '',
        primary_owner_id: assignmentMap.get(seat.id) || null,
        primary_owner_name: assignmentMap.get(seat.id) ? userMap.get(assignmentMap.get(seat.id)!) || 'Unknown' : null,
      })) || [];
    },
    enabled: !!profile?.tenant_id && open,
  });

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

  // Get selected seat info
  const selectedSeat = useMemo(() => 
    seats?.find(s => s.id === seatId), 
    [seats, seatId]
  );

  // Validation states
  const seatHasNoOwner = selectedSeat && !selectedSeat.primary_owner_id;
  const isExistingRockWithoutSeat = rock && !rock.seat_id && !seatId;
  const canSubmit = title.trim() && dueDate && seatId && !seatHasNoOwner;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const rockData = {
      title,
      description: description || null,
      client_id: clientId || null,
      seat_id: seatId || null,
      status,
      priority,
      quarter_number: quarterNumber,
      quarter_year: quarterYear,
      due_date: dueDate,
      tenant_id: profile?.tenant_id,
      // owner_id will be set automatically by trigger from seat assignment
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
    setSeatId('');
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
          {/* Warning for existing rocks without seat */}
          {isExistingRockWithoutSeat && (
            <Alert variant="default" className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                This Rock is not linked to an Accountability Seat. 
                Select a seat to ensure proper ownership and tracking.
              </AlertDescription>
            </Alert>
          )}

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

          {/* Seat Selection - Required */}
          <div className="space-y-2">
            <Label htmlFor="seat" className="flex items-center gap-2">
              <Armchair className="h-4 w-4" />
              Accountability Seat *
            </Label>
            <Select value={seatId || "none"} onValueChange={(v) => setSeatId(v === "none" ? "" : v)}>
              <SelectTrigger className={!seatId ? 'border-amber-300' : ''}>
                <SelectValue placeholder="Select accountability seat..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a seat...</SelectItem>
                {seats?.map((seat) => (
                  <SelectItem key={seat.id} value={seat.id}>
                    <div className="flex items-center gap-2">
                      <span>{seat.seat_name}</span>
                      <Badge variant="outline" className="text-[10px]">{seat.function_name}</Badge>
                      {seat.primary_owner_name && (
                        <span className="text-muted-foreground text-xs">
                          — {seat.primary_owner_name}
                        </span>
                      )}
                      {!seat.primary_owner_id && (
                        <Badge variant="destructive" className="text-[10px]">No Owner</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Seat owner display */}
            {selectedSeat && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                {selectedSeat.primary_owner_name ? (
                  <span className="text-sm">
                    Owner: <strong>{selectedSeat.primary_owner_name}</strong>
                    <span className="text-muted-foreground ml-1">(auto-assigned from seat)</span>
                  </span>
                ) : (
                  <span className="text-sm text-destructive">
                    This seat has no primary owner. Assign a seat owner before creating Rocks.
                  </span>
                )}
              </div>
            )}

            {seatHasNoOwner && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cannot save Rock until this seat has a primary owner assigned.
                </AlertDescription>
              </Alert>
            )}
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
            disabled={!canSubmit || createRock.isPending || updateRock.isPending}
          >
            {rock ? 'Update' : 'Create'} Rock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
