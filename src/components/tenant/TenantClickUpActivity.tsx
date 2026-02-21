import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, MessageSquare, Loader2, Sparkles, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { TenantClickUpAISearch } from "./TenantClickUpAISearch";

interface TenantClickUpActivityProps {
  tenantId: number;
}

interface ClickUpTask {
  task_id: string;
  custom_id: string | null;
  name: string;
  status: string | null;
  date_created: number | null;
  time_estimate: number | null;
  time_spent: number | null;
  creator_username: string | null;
  url: string | null;
  sharepoint_url: string | null;
}

interface ClickUpComment {
  task_id: string;
  comment_text: string | null;
  comment_date: string | null;
  comment_by: string | null;
}

/** Format milliseconds to "Xh Ym" */
function formatMs(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Format ms epoch to AU date */
function formatEpochDate(ms: number | null): string {
  if (!ms) return "—";
  return formatDate(new Date(ms));
}

export function TenantClickUpActivity({ tenantId }: TenantClickUpActivityProps) {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<ClickUpComment[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Fetch tasks on mount
  useEffect(() => {
    async function fetchTasks() {
      setLoadingTasks(true);
      const { data, error } = await supabase
        .from("clickup_tasks_api")
        .select("task_id, custom_id, name, status, date_created, time_estimate, time_spent, creator_username, url, sharepoint_url")
        .eq("tenant_id", tenantId)
        .order("date_created", { ascending: false });

      if (!error && data) setTasks(data as ClickUpTask[]);
      setLoadingTasks(false);
    }
    fetchTasks();
  }, [tenantId]);

  // Fetch comments when task selected
  useEffect(() => {
    if (!selectedTaskId) {
      setComments([]);
      return;
    }
    async function fetchComments() {
      setLoadingComments(true);
      const { data, error } = await supabase
        .from("v_clickup_comments")
        .select("task_id, comment_text, comment_date, comment_by")
        .eq("task_id", selectedTaskId)
        .order("comment_date", { ascending: true });

      if (!error && data) setComments(data as ClickUpComment[]);
      setLoadingComments(false);
    }
    fetchComments();
  }, [selectedTaskId]);

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <div className="bg-muted/30 px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">ClickUp Activity</span>
            <span className="text-xs text-muted-foreground">({tasks.length} tasks)</span>
          </div>
          <CollapsibleTrigger
            onClick={() => setAiOpen(!aiOpen)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Search
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aiOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </div>
      </div>

      <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
        <CollapsibleContent>
          <div className="border-b border-border/50 pt-3">
            <TenantClickUpAISearch tenantId={tenantId} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {/* Left: Tasks */}
          <div className="lg:col-span-2 border-r border-border/50">
            <ScrollArea className="h-[420px]">
              {loadingTasks ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">No ClickUp tasks found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Est.</TableHead>
                      <TableHead>Spent</TableHead>
                      <TableHead>Creator</TableHead>
                      <TableHead className="w-[60px]">Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow
                        key={task.task_id}
                        className={`cursor-pointer ${selectedTaskId === task.task_id ? "bg-accent" : ""}`}
                        onClick={() => setSelectedTaskId(task.task_id)}
                      >
                        <TableCell className="font-mono text-xs">{task.custom_id || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm font-medium">{task.name}</TableCell>
                        <TableCell className="text-xs">{task.status || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatEpochDate(task.date_created)}</TableCell>
                        <TableCell className="text-xs">{formatMs(task.time_estimate)}</TableCell>
                        <TableCell className="text-xs">{formatMs(task.time_spent)}</TableCell>
                        <TableCell className="text-xs">{task.creator_username || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {task.url && (
                              <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="ClickUp">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </a>
                            )}
                            {task.sharepoint_url && (
                              <a href={task.sharepoint_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="SharePoint">
                                <ExternalLink className="h-3.5 w-3.5 text-primary hover:text-primary/80" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>

          {/* Right: Comments */}
          <div className="lg:col-span-1">
            <ScrollArea className="h-[420px]">
              {!selectedTaskId ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-sm text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                  <p>Select a task to view comments</p>
                </div>
              ) : loadingComments ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">No comments for this task</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {comments.map((comment, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{comment.comment_by || "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">{comment.comment_date ? formatDate(comment.comment_date) : "—"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.comment_text || ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
