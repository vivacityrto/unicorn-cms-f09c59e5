import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AddClientTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  stageId?: number;
  editTask?: { id: number; name: string; description: string | null; due_date_offset: number | null } | null;
}

export function AddClientTaskDialog({ open, onOpenChange, onSuccess, packageId, stageId, editTask }: AddClientTaskDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [dueDate, setDueDate] = useState<Date>();
  const [formData, setFormData] = useState({
    name: "",
    description: ""
  });

  // Update form when editTask changes
  useEffect(() => {
    if (editTask) {
      setFormData({
        name: editTask.name || "",
        description: editTask.description || ""
      });
      if (editTask.due_date_offset) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + editTask.due_date_offset);
        setDueDate(futureDate);
      }
    } else {
      setFormData({ name: "", description: "" });
      setDueDate(undefined);
    }
  }, [editTask]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Task name is required",
        variant: "destructive"
      });
      return;
    }

    if (!stageId || !packageId) {
      toast({
        title: "Error",
        description: "Package and phase must be selected for this task",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Calculate due date offset if date is provided
      let dueDateOffset = null;
      if (dueDate) {
        const today = new Date();
        const diffTime = Math.abs(dueDate.getTime() - today.getTime());
        dueDateOffset = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      
      if (editTask) {
        // Update existing task
        const { error } = await supabase
          .from('package_client_tasks')
          .update({
            name: formData.name,
            description: formData.description || null,
            due_date_offset: dueDateOffset,
          })
          .eq('id', editTask.id.toString());

        if (error) throw error;

        toast({
          title: "Success",
          description: "Client task updated successfully"
        });
      } else {
        // Insert new task
        const { error } = await supabase
          .from('package_client_tasks')
          .insert({
            package_id: packageId,
            stage_id: stageId,
            name: formData.name,
            description: formData.description || null,
            due_date_offset: dueDateOffset,
            order_number: 0
          });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Client task created successfully"
        });
      }

      // Reset form
      setFormData({
        name: "",
        description: ""
      });
      setDueDate(undefined);
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${editTask ? 'update' : 'create'} client task`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] grid w-full sm:max-w-[650px] max-w-[90vw] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editTask ? 'Edit' : 'Create'} Client Task
            </DialogTitle>
          </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Name */}
          <div className="space-y-2">
            <Label htmlFor="client-task-name">Client Task Name</Label>
            <Input
              id="client-task-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter client task name"
              autoFocus
            />
          </div>

          {/* Description with formatting toolbar */}
          <div className="space-y-2">
            <Label htmlFor="client-task-description">Task Description</Label>
            <div className="border border-input rounded-md overflow-hidden bg-background">
              {/* Formatting Toolbar */}
              <div className="flex items-center gap-1 border-b border-border/50 bg-muted/30 px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('bold');
                  }}
                >
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('italic');
                  }}
                >
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('underline');
                  }}
                >
                  <Underline className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('strikeThrough');
                  }}
                >
                  <Strikethrough className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-5 bg-border/50 mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('insertUnorderedList');
                  }}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('insertOrderedList');
                  }}
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-5 bg-border/50 mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    document.execCommand('undo');
                  }}
                >
                  <Undo className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              {/* Text Area */}
              <Textarea
                id="client-task-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter task description for client"
                rows={6}
                className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="client-task-due-date">Client Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal hover:bg-[#349fff1c] hover:text-black",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 group-hover:text-black" />
                  {dueDate ? format(dueDate, "PPP") : <span>Select client due date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[80]" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              The date this client task should become due
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="hover:bg-[#40c6e524] hover:text-black"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !formData.name.trim()}
            className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {editTask ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              editTask ? 'Update Task' : 'Create Task'
            )}
          </Button>
        </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
