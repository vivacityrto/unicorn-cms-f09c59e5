import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Flag,
  CheckCircle,
  Clock,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewFlag {
  id: string;
  tenant_id: number;
  client_id: number;
  package_id: number | null;
  phase_id: number | null;
  ai_interaction_log_id: string;
  flagged_by: string;
  flagged_reason: string | null;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  // Joined data
  flagged_by_user?: { first_name: string | null; last_name: string | null };
  resolved_by_user?: { first_name: string | null; last_name: string | null };
  tenant?: { name: string | null };
  interaction?: { prompt_text: string; response_text: string };
}

/**
 * AskVivFlags - Internal page for managing CSC review flags
 */
export default function AskVivFlags() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();

  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("open");

  // Check access
  const hasAccess = isSuperAdmin || isVivacityTeam;
  
  // Resolve modal state
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<ReviewFlag | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  // View interaction modal
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingFlag, setViewingFlag] = useState<ReviewFlag | null>(null);

  useEffect(() => {
    if (!authLoading && hasAccess) {
      loadFlags();
    }
  }, [authLoading, hasAccess, statusFilter]);

  async function loadFlags() {
    setLoading(true);
    try {
      // Simple query first, then enrich with related data if needed
      let query = supabase
        .from("ai_review_flags")
        .select(`
          *
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.error("Failed to load flags:", error);
        toast({
          title: "Failed to load flags",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setFlags((data as unknown as ReviewFlag[]) || []);
    } catch (err) {
      console.error("Error loading flags:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve() {
    if (!selectedFlag || !user?.id) return;

    setIsResolving(true);
    try {
      const { error } = await supabase
        .from("ai_review_flags")
        .update({
          status: "resolved",
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          resolution_note: resolutionNote.trim() || null,
        })
        .eq("id", selectedFlag.id);

      if (error) {
        toast({
          title: "Failed to resolve",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Flag resolved",
        description: "The flag has been marked as resolved.",
      });

      setResolveModalOpen(false);
      setSelectedFlag(null);
      setResolutionNote("");
      loadFlags();
    } catch (err) {
      console.error("Error resolving flag:", err);
    } finally {
      setIsResolving(false);
    }
  }

  function openResolveModal(flag: ReviewFlag) {
    setSelectedFlag(flag);
    setResolutionNote("");
    setResolveModalOpen(true);
  }

  async function openViewModal(flag: ReviewFlag) {
    setViewingFlag(flag);
    setViewModalOpen(true);
    
    // Fetch interaction details if not already loaded
    if (!flag.interaction && flag.ai_interaction_log_id) {
      try {
        const { data: interaction } = await supabase
          .from("ai_interaction_logs")
          .select("prompt_text, response_text")
          .eq("id", flag.ai_interaction_log_id)
          .single();
        
        if (interaction) {
          setViewingFlag({ ...flag, interaction });
        }
      } catch (err) {
        console.error("Failed to load interaction:", err);
      }
    }
  }

  function formatUserName(userData: { first_name: string | null; last_name: string | null } | null | undefined): string {
    if (!userData) return "Unknown";
    const parts = [userData.first_name, userData.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Unknown";
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground">This page is only available to Vivacity internal users.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Flag className="h-6 w-6" />
              Ask Viv - CSC Flags
            </h1>
            <p className="text-sm text-muted-foreground">
              Review AI interactions flagged for CSC follow-up
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Flags Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-12">
          <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No flags found</h3>
          <p className="text-sm text-muted-foreground">
            {statusFilter === "open"
              ? "No open flags to review"
              : statusFilter === "resolved"
              ? "No resolved flags"
              : "No flags have been created yet"}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Flagged by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="text-sm">
                    {format(new Date(flag.created_at), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {flag.tenant?.name || `Tenant ${flag.tenant_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Client #{flag.client_id}
                      {flag.package_id && ` • Pkg #${flag.package_id}`}
                      {flag.phase_id && ` • Phase #${flag.phase_id}`}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatUserName(flag.flagged_by_user)}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm text-muted-foreground truncate">
                      {flag.flagged_reason || "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={flag.status === "open" ? "default" : "secondary"}
                      className={cn(
                        "gap-1",
                        flag.status === "open" && "bg-amber-500/10 text-amber-600 border-amber-200"
                      )}
                    >
                      {flag.status === "open" ? (
                        <Clock className="h-3 w-3" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      {flag.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openViewModal(flag)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      {flag.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResolveModal(flag)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Resolve Modal */}
      <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Flag</DialogTitle>
            <DialogDescription>
              Mark this flag as resolved. Add an optional note about the resolution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resolution-note">
                Resolution note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="resolution-note"
                placeholder="What action was taken?"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="resize-none"
                disabled={isResolving}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setResolveModalOpen(false)}
              disabled={isResolving}
            >
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={isResolving}>
              {isResolving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Interaction Modal */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Flagged Interaction</DialogTitle>
            <DialogDescription>
              View the AI interaction that was flagged for review
            </DialogDescription>
          </DialogHeader>

          {viewingFlag && (
            <div className="space-y-4 py-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Flagged by:</span>{" "}
                  <span className="font-medium">{formatUserName(viewingFlag.flagged_by_user)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <span className="font-medium">
                    {format(new Date(viewingFlag.created_at), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
              </div>

              {/* Flag reason */}
              {viewingFlag.flagged_reason && (
                <div>
                  <Label className="text-sm text-muted-foreground">Flag reason</Label>
                  <p className="text-sm mt-1 p-2 bg-muted rounded">
                    {viewingFlag.flagged_reason}
                  </p>
                </div>
              )}

              {/* Resolution info */}
              {viewingFlag.status === "resolved" && (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    Resolved by {formatUserName(viewingFlag.resolved_by_user)}
                  </div>
                  {viewingFlag.resolved_at && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      {format(new Date(viewingFlag.resolved_at), "MMM d, yyyy HH:mm")}
                    </p>
                  )}
                  {viewingFlag.resolution_note && (
                    <p className="text-sm mt-2 text-green-800 dark:text-green-300">
                      {viewingFlag.resolution_note}
                    </p>
                  )}
                </div>
              )}

              {/* Interaction content */}
              {viewingFlag.interaction && (
                <>
                  <div>
                    <Label className="text-sm text-muted-foreground">User question</Label>
                    <p className="text-sm mt-1 p-3 bg-primary/10 rounded-lg">
                      {viewingFlag.interaction.prompt_text}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">AI response</Label>
                    <pre className="text-sm mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
                      {viewingFlag.interaction.response_text}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
