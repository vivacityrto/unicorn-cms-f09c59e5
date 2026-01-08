import { useState } from 'react';
import { WorkboardItem, ItemStatus, ItemPriority, STATUS_CONFIG, PRIORITY_CONFIG } from '@/hooks/useClientWorkboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, Edit, Trash2, Calendar as CalendarIcon, 
  CheckCircle2, Circle, AlertCircle, Package, Layers
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

interface TeamMember {
  user_uuid: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface WorkboardListViewProps {
  items: WorkboardItem[];
  teamMembers: TeamMember[];
  onUpdateItem: (id: string, updates: Partial<WorkboardItem>) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
  onOpenDetail: (item: WorkboardItem) => void;
}

export function WorkboardListView({
  items,
  teamMembers,
  onUpdateItem,
  onDeleteItem,
  onOpenDetail
}: WorkboardListViewProps) {
  const [editingDue, setEditingDue] = useState<string | null>(null);

  const handleQuickComplete = async (item: WorkboardItem) => {
    if (item.status === 'done') return;
    await onUpdateItem(item.id, { status: 'done' });
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead className="w-[130px]">Priority</TableHead>
            <TableHead className="w-[150px]">Assignee</TableHead>
            <TableHead className="w-[130px]">Due Date</TableHead>
            <TableHead className="w-[100px]">Links</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No action items found
              </TableCell>
            </TableRow>
          ) : (
            items.map(item => {
              const isOverdue = item.due_date && 
                isPast(new Date(item.due_date)) && 
                !isToday(new Date(item.due_date)) && 
                !['done', 'cancelled'].includes(item.status);

              return (
                <TableRow 
                  key={item.id} 
                  className={`${item.status === 'done' ? 'opacity-60' : ''} ${isOverdue ? 'bg-red-50/50' : ''}`}
                >
                  {/* Complete checkbox */}
                  <TableCell>
                    <button 
                      onClick={() => handleQuickComplete(item)}
                      className={`${item.status === 'done' ? 'text-green-600' : 'text-muted-foreground hover:text-green-600'}`}
                      disabled={item.status === 'done'}
                    >
                      {item.status === 'done' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                  </TableCell>

                  {/* Title */}
                  <TableCell>
                    <button 
                      onClick={() => onOpenDetail(item)}
                      className={`text-left font-medium hover:text-primary ${item.status === 'done' ? 'line-through' : ''}`}
                    >
                      {item.title}
                    </button>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </TableCell>

                  {/* Status - inline dropdown */}
                  <TableCell>
                    <Select 
                      value={item.status} 
                      onValueChange={(value: ItemStatus) => onUpdateItem(item.id, { status: value })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <Badge variant="outline" className={`${config.color} text-xs`}>
                              {config.label}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Priority - inline dropdown */}
                  <TableCell>
                    <Select 
                      value={item.priority} 
                      onValueChange={(value: ItemPriority) => onUpdateItem(item.id, { priority: value })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <Badge variant="outline" className={`${config.color} text-xs`}>
                              {config.label}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Assignee - inline dropdown */}
                  <TableCell>
                    <Select 
                      value={item.assignee_user_id || 'unassigned'} 
                      onValueChange={(value) => onUpdateItem(item.id, { 
                        assignee_user_id: value === 'unassigned' ? null : value 
                      })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {teamMembers.map(member => (
                          <SelectItem key={member.user_uuid} value={member.user_uuid}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={member.avatar_url || undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {member.first_name?.[0]}{member.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.first_name} {member.last_name?.[0]}.</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Due Date - inline picker */}
                  <TableCell>
                    <Popover open={editingDue === item.id} onOpenChange={(open) => setEditingDue(open ? item.id : null)}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-7 text-xs justify-start px-2 ${isOverdue ? 'text-red-600' : ''}`}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {isOverdue && <AlertCircle className="h-3 w-3 mr-1" />}
                          {item.due_date ? format(new Date(item.due_date), 'MMM d') : 'No date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={item.due_date ? new Date(item.due_date) : undefined}
                          onSelect={(date) => {
                            onUpdateItem(item.id, { 
                              due_date: date ? format(date, 'yyyy-MM-dd') : null 
                            });
                            setEditingDue(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>

                  {/* Links */}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {item.package && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          <Package className="h-2.5 w-2.5 mr-0.5" />
                          {item.package.name.slice(0, 8)}
                        </Badge>
                      )}
                      {item.stage && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          <Layers className="h-2.5 w-2.5 mr-0.5" />
                          {item.stage.name.slice(0, 8)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenDetail(item)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Open Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => onDeleteItem(item.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
