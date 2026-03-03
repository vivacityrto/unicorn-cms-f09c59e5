import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { Send } from "lucide-react";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    subject?: string;
    type: string;
    firstMessage: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

const CONVERSATION_TYPES = [
  { value: "general", label: "General" },
  { value: "package", label: "Package" },
  { value: "task", label: "Task" },
  { value: "rock", label: "Rock" },
];

export function NewConversationDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: NewConversationDialogProps) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!message.trim()) return;
    await onSubmit({
      subject: subject.trim() || undefined,
      type,
      firstMessage: message.trim(),
    });
    setSubject("");
    setType("general");
    setMessage("");
    onOpenChange(false);
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>New Message</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Subject (optional)
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Category
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Message
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
              rows={4}
            />
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || isSubmitting}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
