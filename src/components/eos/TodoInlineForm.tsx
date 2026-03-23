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
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

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

  // Use Vivacity Team users per L10 standard (EOS is internal-only)
  const { data: vivacityUsers } = useVivacityTeamUsers();
  const users = vivacityUsers?.map(u => ({
    user_uuid: u.user_uuid,
    first_name: u.first_name,
    last_name: u.last_name,
  }));

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
