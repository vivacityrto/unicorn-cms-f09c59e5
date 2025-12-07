import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TodoInlineFormProps {
  meetingId: string;
  onTodoCreated: (todo: any) => Promise<void>;
}

export function TodoInlineForm({ meetingId, onTodoCreated }: TodoInlineFormProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState<Date>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['users', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .eq('tenant_id', profile?.tenant_id!)
        .order('first_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  const handleSubmit = async () => {
    if (!title.trim() || !ownerId || !dueDate) return;

    setIsSubmitting(true);
    try {
      await onTodoCreated({
        title,
        owner_id: ownerId,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        meeting_id: meetingId,
        tenant_id: profile?.tenant_id,
      });

      setTitle('');
      setOwnerId('');
      setDueDate(undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <Input
          placeholder="To-do title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        
        <div className="grid grid-cols-2 gap-3">
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger>
              <SelectValue placeholder="Assign to" />
            </SelectTrigger>
            <SelectContent>
              {users?.map((user) => (
                <SelectItem key={user.user_uuid} value={user.user_uuid}>
                  {user.first_name} {user.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !dueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate ? format(dueDate, 'PP') : 'Due date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!title.trim() || !ownerId || !dueDate || isSubmitting}
          size="sm"
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add To-Do
        </Button>
      </div>
    </Card>
  );
}
