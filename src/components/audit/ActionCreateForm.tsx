import { useState } from 'react';
import { useAudits } from '@/hooks/useAudits';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface ActionCreateFormProps {
  findings: any[];
  tenantUsers: any[];
}

export const ActionCreateForm = ({ findings, tenantUsers }: ActionCreateFormProps) => {
  const { createAction } = useAudits();
  const [findingId, setFindingId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!findingId || !assignedTo || !dueDate || !description) return;
    
    await createAction.mutateAsync({
      findingId: parseInt(findingId),
      assignedTo,
      dueDate,
      description,
    });

    setFindingId('');
    setAssignedTo('');
    setDueDate('');
    setDescription('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Finding</label>
        <Select value={findingId} onValueChange={setFindingId}>
          <SelectTrigger>
            <SelectValue placeholder="Select finding" />
          </SelectTrigger>
          <SelectContent>
            {findings.map((finding) => (
              <SelectItem key={finding.finding_id} value={finding.finding_id.toString()}>
                {finding.summary.substring(0, 50)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Assign To</label>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger>
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {tenantUsers.map((user) => (
              <SelectItem key={user.user_uuid} value={user.user_uuid}>
                {user.first_name} {user.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Due Date</label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the action required..."
          rows={4}
        />
      </div>

      <Button 
        onClick={handleSubmit}
        disabled={!findingId || !assignedTo || !dueDate || !description || createAction.isPending}
        className="w-full"
      >
        Create Action
      </Button>
    </div>
  );
};
