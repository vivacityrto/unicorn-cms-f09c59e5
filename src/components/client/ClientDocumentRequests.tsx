import { useState } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  useDocumentRequests,
  useCreateDocumentRequest,
  useCancelDocumentRequest,
  type DocumentRequest,
} from "@/hooks/useDocumentRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Inbox, XCircle, Eye, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = ["Compliance", "Evidence", "Admin", "Other"];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "hsl(189 74% 50%)", bg: "hsl(189 74% 95%)" },
  in_progress: { label: "In progress", color: "hsl(270 55% 41%)", bg: "hsl(270 20% 88%)" },
  completed: { label: "Completed", color: "hsl(142 60% 40%)", bg: "hsl(142 60% 92%)" },
  cancelled: { label: "Cancelled", color: "hsl(0 0% 50%)", bg: "hsl(0 0% 92%)" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.open;
  return (
    <Badge
      variant="outline"
      className="text-xs border-0"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </Badge>
  );
}

export function ClientDocumentRequests() {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("");
  const [dueAt, setDueAt] = useState("");

  const { activeTenantId, isReadOnly } = useClientTenant();
  const { user } = useAuth();
  const requests = useDocumentRequests(activeTenantId);
  const createMutation = useCreateDocumentRequest();
  const cancelMutation = useCancelDocumentRequest();

  // Sort: open/in_progress first, then by created_at desc
  const sortedRequests = [...(requests.data ?? [])].sort((a, b) => {
    const priority = (s: string) => (s === "open" || s === "in_progress" ? 0 : 1);
    const p = priority(a.status) - priority(b.status);
    if (p !== 0) return p;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

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
          setCreateOpen(false);
        },
      }
    );
  };

  if (requests.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "hsl(270 55% 41%)" }}>
            Document requests
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Request documents from your Vivacity consultant.
          </p>
        </div>
        {!isReadOnly ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="text-xs font-medium"
                style={{
                  backgroundColor: "hsl(189 74% 50%)",
                  color: "hsl(270 47% 26%)",
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New request
              </Button>
            </DialogTrigger>
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
                <Button variant="outline" onClick={() => { resetForm(); setCreateOpen(false); }}>
                  Cancel
                </Button>
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
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Read-only preview
          </Badge>
        )}
      </div>

      {/* Request List */}
      {!sortedRequests.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 mb-3" style={{ color: "hsl(270 20% 88%)" }} />
          <p className="text-sm text-muted-foreground">No document requests yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "hsl(270 20% 88%)" }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Due date</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned to</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm truncate max-w-[200px]">{req.title}</p>
                      {req.category && (
                        <span className="text-xs text-muted-foreground">{req.category}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {req.due_at ? format(new Date(req.due_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {format(new Date(req.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {req.assignee_name || "Unassigned"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(req.status === "open" || req.status === "in_progress") && !isReadOnly && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel request?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will close the request. You can always create a new one.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep open</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  cancelMutation.mutate({
                                    requestId: req.id,
                                    tenantId: activeTenantId!,
                                  })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Cancel request
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
