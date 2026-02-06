import { useState } from 'react';
import { useCreateEvidenceRequest } from '@/hooks/useEvidenceRequests';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface CreateEvidenceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

interface RequestItem {
  item_name: string;
  guidance_text: string;
  is_required: boolean;
}

export function CreateEvidenceRequestDialog({ open, onOpenChange, tenantId }: CreateEvidenceRequestDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<RequestItem[]>([
    { item_name: '', guidance_text: '', is_required: true }
  ]);

  const createRequest = useCreateEvidenceRequest();

  const handleAddItem = () => {
    setItems([...items, { item_name: '', guidance_text: '', is_required: true }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof RequestItem, value: string | boolean) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = items.filter(item => item.item_name.trim() !== '');
    if (validItems.length === 0) return;

    await createRequest.mutateAsync({
      tenantId,
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      category: category || undefined,
      items: validItems,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDueDate('');
    setCategory('');
    setItems([{ item_name: '', guidance_text: '', is_required: true }]);
    onOpenChange(false);
  };

  const isValid = title.trim() !== '' && items.some(item => item.item_name.trim() !== '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Evidence from Client</DialogTitle>
          <DialogDescription>
            Create a checklist of documents you need from the client. They'll see this request in their portal.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Request Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Health Check Evidence Pack"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what you need and why..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Health Check, TAS, DAP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Request Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Required Documents</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label>Document Name *</Label>
                        <Input
                          value={item.item_name}
                          onChange={(e) => handleItemChange(index, 'item_name', e.target.value)}
                          placeholder="e.g., Training & Assessment Strategy"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Guidance for Client</Label>
                        <Input
                          value={item.guidance_text}
                          onChange={(e) => handleItemChange(index, 'guidance_text', e.target.value)}
                          placeholder="e.g., Upload the current version for CHC33021"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_required}
                          onCheckedChange={(checked) => handleItemChange(index, 'is_required', checked)}
                        />
                        <Label className="text-sm font-normal">Required</Label>
                      </div>
                    </div>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || createRequest.isPending}
              className="gap-2"
            >
              {createRequest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
