import { useState, useEffect } from 'react';
import { Dialog, DialogPortal, DialogOverlay, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Mail, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StageEmail } from '@/hooks/useStageTemplateContent';

interface EditStageEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: StageEmail;
  onSave: (emailId: number, data: Partial<Omit<StageEmail, 'id'>>) => Promise<void>;
}

export function EditStageEmailDialog({ open, onOpenChange, email, onSave }: EditStageEmailDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    description: '',
    content: '',
    to: '',
    order_number: 0,
    automation_enabled: false,
    auth_mode: false,
    auto_send_on_document_added: false,
    auto_send_on_document_updated: false,
    auto_send_on_task_assignment: false,
  });

  useEffect(() => {
    if (email) {
      setForm({
        name: email.name || '',
        subject: email.subject || '',
        description: email.description || '',
        content: email.content || '',
        to: email.to || '',
        order_number: email.order_number ?? 0,
        automation_enabled: email.automation_enabled ?? false,
        auth_mode: (email as any).auth_mode ?? false,
        auto_send_on_document_added: (email as any).auto_send_on_document_added ?? false,
        auto_send_on_document_updated: (email as any).auto_send_on_document_updated ?? false,
        auto_send_on_task_assignment: (email as any).auto_send_on_task_assignment ?? false,
      });
    }
  }, [email]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(email.id, {
        name: form.name,
        subject: form.subject || null as any,
        description: form.description || null,
        content: form.content || null,
        to: form.to || null,
        order_number: form.order_number,
        automation_enabled: form.automation_enabled,
        auth_mode: form.auth_mode,
        auto_send_on_document_added: form.auto_send_on_document_added,
        auto_send_on_document_updated: form.auto_send_on_document_updated,
        auto_send_on_task_assignment: form.auto_send_on_task_assignment,
      } as any);
      onOpenChange(false);
    } catch (error) {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[1024px] max-w-[95vw] max-h-[95vh] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Edit Email Template
            </DialogTitle>
            <DialogDescription>
              Update all email template properties including HTML content.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto scrollbar-hide flex-1 space-y-4 min-h-0">
            {/* Row 1: Name, Subject, To */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Internal email name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subject</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Email subject line"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default To</Label>
                <Input
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  placeholder="e.g. {{PrimaryContact}}"
                />
              </div>
            </div>

            {/* Row 2: Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description (internal notes)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Internal description of this email's purpose"
              />
            </div>

            {/* Row 3: Order & Toggles */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Order #</Label>
                <Input
                  type="number"
                  value={form.order_number}
                  onChange={(e) => setForm({ ...form, order_number: parseInt(e.target.value) || 0 })}
                  className="w-20 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.automation_enabled} onCheckedChange={(c) => setForm({ ...form, automation_enabled: c })} className="scale-90" />
                <Label className="text-xs">Automation</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.auth_mode} onCheckedChange={(c) => setForm({ ...form, auth_mode: c })} className="scale-90" />
                <Label className="text-xs">Auth Mode</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.auto_send_on_task_assignment} onCheckedChange={(c) => setForm({ ...form, auto_send_on_task_assignment: c })} className="scale-90" />
                <Label className="text-xs">Auto on Task Assign</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.auto_send_on_document_added} onCheckedChange={(c) => setForm({ ...form, auto_send_on_document_added: c })} className="scale-90" />
                <Label className="text-xs">Auto on Doc Added</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.auto_send_on_document_updated} onCheckedChange={(c) => setForm({ ...form, auto_send_on_document_updated: c })} className="scale-90" />
                <Label className="text-xs">Auto on Doc Updated</Label>
              </div>
            </div>

            {/* Row 4: Rich Text Content */}
            <div className="space-y-1 flex-1">
              <Label className="text-xs font-semibold">Content (HTML body)</Label>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm({ ...form, content: html })}
                minHeight="350px"
                placeholder="Compose email body content..."
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="hover:bg-[#40c6e524] hover:text-black">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
