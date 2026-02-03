import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, ListTodo, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CarryForwardItem {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
}

interface CarryForwardReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unsolvedIssues: CarryForwardItem[];
  openTodos: CarryForwardItem[];
  onConfirm: () => void;
  isLoading?: boolean;
}

export function CarryForwardReviewDialog({
  open,
  onOpenChange,
  unsolvedIssues,
  openTodos,
  onConfirm,
  isLoading = false,
}: CarryForwardReviewDialogProps) {
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(
    new Set(unsolvedIssues.map(i => i.id))
  );
  const [selectedTodos, setSelectedTodos] = useState<Set<string>>(
    new Set(openTodos.map(t => t.id))
  );

  const toggleIssue = (id: string) => {
    const newSet = new Set(selectedIssues);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIssues(newSet);
  };

  const toggleTodo = (id: string) => {
    const newSet = new Set(selectedTodos);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTodos(newSet);
  };

  const totalItems = unsolvedIssues.length + openTodos.length;
  const selectedItems = selectedIssues.size + selectedTodos.size;

  const handleConfirm = () => {
    // Note: Currently carries forward all items. 
    // Future enhancement: pass selected items to the RPC
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-primary" />
            Review Carry-Forward Items
          </DialogTitle>
          <DialogDescription>
            These unresolved items will be carried forward to the next meeting in the series.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {unsolvedIssues.length > 0 && (
              <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  Unresolved Issues ({unsolvedIssues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <ul className="space-y-2">
                    {unsolvedIssues.map(issue => (
                      <li key={issue.id} className="flex items-start gap-2">
                        <Checkbox
                          checked={selectedIssues.has(issue.id)}
                          onCheckedChange={() => toggleIssue(issue.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm block truncate">{issue.title}</span>
                          {issue.priority && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {issue.priority}
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {openTodos.length > 0 && (
              <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-primary" />
                  Open To-Dos ({openTodos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <ul className="space-y-2">
                    {openTodos.map(todo => (
                      <li key={todo.id} className="flex items-start gap-2">
                        <Checkbox
                          checked={selectedTodos.has(todo.id)}
                          onCheckedChange={() => toggleTodo(todo.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm block truncate">{todo.title}</span>
                          {todo.status && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {todo.status}
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {totalItems === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No items to carry forward.</p>
                <p className="text-sm mt-1">All issues and to-dos have been resolved.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-sm text-muted-foreground mr-auto">
            {selectedItems} of {totalItems} items selected
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing...
              </>
            ) : (
              <>
                Complete Meeting
                {selectedItems > 0 && ` & Carry Forward ${selectedItems}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
