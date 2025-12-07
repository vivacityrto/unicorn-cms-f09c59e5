import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

type EmailTemplate = {
  id: number;
  name: string;
  description: string | null;
  subject: string | null;
  content: string | null;
};

interface UseTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplate | null;
  onSuccess: () => void;
}

export default function UseTemplateDialog({ open, onOpenChange, template, onSuccess }: UseTemplateDialogProps) {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipient.trim()) {
      toast({
        title: "Error",
        description: "Please enter a recipient email address",
        variant: "destructive",
      });
      return;
    }

    try {
      setSending(true);
      // Here you would integrate with your email sending service
      // For now, we'll just show a success message
      toast({
        title: "Email Sent",
        description: `Email sent to ${recipient} using template "${template?.name}"`,
      });
      setRecipient("");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message ?? "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Use Template: {template.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Email *</Label>
            <Input
              id="recipient"
              type="email"
              placeholder="Enter recipient email address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={template.subject || ""}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={template.content || ""}
              disabled
              className="bg-muted min-h-[200px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
