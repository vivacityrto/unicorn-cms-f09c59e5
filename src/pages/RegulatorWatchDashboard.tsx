/**
 * RegulatorWatchDashboard – SuperAdmin page for managing the Regulator Change Watch Engine.
 * Shows watchlist entries, change events, and allows managing the watch pipeline.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, ShieldAlert, Globe, Plus, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

const IMPACT_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const REVIEW_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "secondary", label: "Pending" },
  reviewed: { variant: "default", label: "Reviewed" },
  actioned: { variant: "outline", label: "Actioned" },
};

const CATEGORY_LABELS: Record<string, string> = {
  standards: "Standards",
  guidance: "Guidance",
  fact_sheet: "Fact Sheet",
  audit_focus: "Audit Focus",
  legislation: "Legislation",
};

export default function RegulatorWatchDashboard() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [impactFilter, setImpactFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");

  // New entry form state
  const [newEntry, setNewEntry] = useState({ name: "", url: "", category: "guidance", check_frequency_days: 7 });

  // Fetch watchlist
  const { data: watchlist, isLoading: watchlistLoading } = useQuery({
    queryKey: ["regulator-watchlist-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulator_watchlist")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin || isVivacityTeam,
  });

  // Fetch change events
  const { data: changeEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["regulator-change-events", impactFilter, reviewFilter],
    queryFn: async () => {
      let query = supabase
        .from("regulator_change_events")
        .select(`*, regulator_watchlist(name, url, category)`)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (impactFilter !== "all") query = query.eq("impact_level", impactFilter);
      if (reviewFilter !== "all") query = query.eq("review_status", reviewFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin || isVivacityTeam,
  });

  // Add watchlist entry
  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("regulator_watchlist").insert({
        name: newEntry.name,
        url: newEntry.url,
        category: newEntry.category,
        check_frequency_days: newEntry.check_frequency_days,
        created_by: session?.user?.id,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Entry added", description: `${newEntry.name} added to watchlist.` });
      queryClient.invalidateQueries({ queryKey: ["regulator-watchlist-full"] });
      setAddDialogOpen(false);
      setNewEntry({ name: "", url: "", category: "guidance", check_frequency_days: 7 });
    },
    onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
  });

  // Manual scan trigger
  const handleManualScan = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("regulator-watch-check", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      toast({
        title: "Scan complete",
        description: `Checked ${data?.checked || 0} sources. ${data?.changed || 0} changes detected.`,
      });
      queryClient.invalidateQueries({ queryKey: ["regulator-change-events"] });
      queryClient.invalidateQueries({ queryKey: ["regulator-watchlist-full"] });
    } catch (err) {
      toast({ title: "Scan failed", description: String(err), variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  // Review a change event
  const reviewEvent = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: string }) => {
      const { error } = await supabase
        .from("regulator_change_events")
        .update({
          review_status: status,
          reviewed_by_user_id: session?.user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      if (error) throw error;

      // Audit log
      await supabase.from("research_audit_log").insert({
        user_id: session?.user?.id,
        action: status === "reviewed" ? "change_reviewed" : "change_actioned",
        details: { entity_type: "regulator_change_event", entity_id: eventId, new_status: status },
      });
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["regulator-change-events"] });
    },
  });

  if (!isSuperAdmin && !isVivacityTeam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
        </div>
      </DashboardLayout>
    );
  }

  const filteredWatchlist = (watchlist || []).filter(w =>
    categoryFilter === "all" || (w as any).category === categoryFilter
  );

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Regulator Change Watch
            </h1>
            <p className="text-xs text-muted-foreground">Automated monitoring of regulator guidance and standards</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add Source
            </Button>
            <Button size="sm" onClick={handleManualScan} disabled={isRunning} className="gap-1">
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Run Scan Now
            </Button>
          </div>
        </div>

        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events">Change Events</TabsTrigger>
            <TabsTrigger value="watchlist">Watchlist ({filteredWatchlist.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-3">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <Select value={impactFilter} onValueChange={setImpactFilter}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Impact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Impact</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reviewFilter} onValueChange={setReviewFilter}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Review Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="actioned">Actioned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Detected</TableHead>
                        <TableHead className="text-xs">Impact</TableHead>
                        <TableHead className="text-xs">Review</TableHead>
                        <TableHead className="text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(changeEvents || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                            No change events found
                          </TableCell>
                        </TableRow>
                      ) : (
                        (changeEvents || []).map((evt: any) => {
                          const wl = evt.regulator_watchlist;
                          const badge = REVIEW_BADGE[evt.review_status] || REVIEW_BADGE.pending;
                          return (
                            <TableRow key={evt.id}>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium">{wl?.name || "Unknown"}</span>
                                  {wl?.url && (
                                    <a href={wl.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className="text-[10px]">
                                  {CATEGORY_LABELS[wl?.category] || wl?.category || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(evt.detected_at), { addSuffix: true })}
                              </TableCell>
                              <TableCell>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${IMPACT_COLORS[evt.impact_level] || ""}`}>
                                  {evt.impact_level}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost" size="sm" className="h-6 text-[10px]"
                                    onClick={() => navigate(`/admin/regulator-watch/${evt.id}`)}
                                  >
                                    View
                                  </Button>
                                  {evt.review_status === "pending" && (
                                    <Button
                                      variant="outline" size="sm" className="h-6 text-[10px]"
                                      onClick={() => reviewEvent.mutate({ eventId: evt.id, status: "reviewed" })}
                                    >
                                      Mark Reviewed
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="watchlist" className="space-y-3">
            <div className="flex items-center gap-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {watchlistLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Frequency</TableHead>
                        <TableHead className="text-xs">Last Checked</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWatchlist.map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{entry.name}</span>
                              <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px]">
                              {CATEGORY_LABELS[entry.category] || entry.category || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            Every {entry.check_frequency_days || 7} days
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.last_checked_at
                              ? formatDistanceToNow(new Date(entry.last_checked_at), { addSuffix: true })
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.is_active ? "default" : "secondary"} className="text-[10px]">
                              {entry.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Source Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Watchlist Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newEntry.name}
                onChange={e => setNewEntry(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. ASQA Standards for RTOs 2025"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                value={newEntry.url}
                onChange={e => setNewEntry(p => ({ ...p, url: e.target.value }))}
                placeholder="https://..."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={newEntry.category} onValueChange={v => setNewEntry(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Check Frequency (days)</Label>
              <Input
                type="number" min={1} max={90}
                value={newEntry.check_frequency_days}
                onChange={e => setNewEntry(p => ({ ...p, check_frequency_days: parseInt(e.target.value) || 7 }))}
                className="h-8 text-xs w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} size="sm">Cancel</Button>
            <Button onClick={() => addEntry.mutate()} disabled={!newEntry.name || !newEntry.url || addEntry.isPending} size="sm">
              {addEntry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Add Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
