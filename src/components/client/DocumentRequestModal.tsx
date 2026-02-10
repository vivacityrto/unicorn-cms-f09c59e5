import { useState, useEffect } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useCreateDocumentRequest } from "@/hooks/useDocumentRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const CATEGORIES = ["Documents", "Compliance", "Evidence", "Admin", "Other"];

export interface DocumentRequestPrefill {
  title?: string;
  details?: string;
  category?: string;
  due_at?: string | null;
  related_package_id?: number | null;
}

interface DocumentRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: DocumentRequestPrefill;
}

export function DocumentRequestModal({ open, onOpenChange, prefill }: DocumentRequestModalProps) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("");
  const [dueAt, setDueAt] = useState("");

  const { activeTenantId, isReadOnly } = useClientTenant();
  const createMutation = useCreateDocumentRequest();

  // Apply prefill when modal opens
  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDetails(prefill?.details ?? "");
      setCategory(prefill?.category ?? "");
      setDueAt(prefill?.due_at ?? "");
    }
  }, [open, prefill]);

  const resetForm = () => {
    setTitle("");
    setDetails("");
    setCategory("");
    setDueAt("");
  };

  const handleCreate = () => {
    if (!activeTenantId || !title.trim() || !details.trim()) return;
    createMutation.mutate(
      {
        tenantId: activeTenantId,
        title: title.trim(),
        details: details.trim(),
        category: category || null,
        dueAt: dueAt || null,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New document request</DialogTitle>
          <DialogDescription>
            Describe what you need. Your Vivacity consultant will be notified.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="req-title">Request title *</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Compliance manual 2025"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="req-details">Details *</Label>
            <Textarea
              id="req-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what you need and why…"
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="req-category">Category (optional)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="req-due">Due date (optional)</Label>
            <Input
              id="req-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          {isReadOnly ? (
            <Button disabled className="opacity-60">
              Read-only preview
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || !details.trim() || createMutation.isPending}
              style={{
                backgroundColor: "hsl(189 74% 50%)",
                color: "hsl(270 47% 26%)",
              }}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
