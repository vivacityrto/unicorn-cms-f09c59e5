import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Download, Loader2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const CATEGORY_LABELS: Record<string, string> = {
  induction_training: "Induction & Training",
  onboarding_documents: "Onboarding Documents",
  communications: "Communications",
  system_access: "System Access",
};

const CATEGORY_ORDER = [
  "induction_training",
  "onboarding_documents",
  "communications",
  "system_access",
];

function toEmbedUrl(url: string): string {
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

export default function MyOnboardingPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userUuid = user?.id ?? null;

  const runQuery = useQuery({
    queryKey: ["my-onboarding", "run", userUuid],
    enabled: !!userUuid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_provisioning_runs")
        .select("id, first_name, last_name, start_date, role_code, workbook_file_path")
        .eq("target_user_id", userUuid!)
        .eq("status", "provisioned")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const runId = runQuery.data?.id ?? null;

  const instancesQuery = useQuery({
    queryKey: ["my-onboarding", "instances", runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lifecycle_checklist_instances")
        .select(
          "id, completed, completed_at, notes, lifecycle_checklist_templates!inner(category, step_title, sort_order, description)"
        )
        .eq("provisioning_run_id", runId!)
        .eq("lifecycle_type", "staff_onboarding");
      if (error) throw error;
      return (data ?? [])
        .map((r) => ({
          id: r.id,
          completed: !!r.completed,
          completed_at: r.completed_at,
          notes: r.notes ?? "",
          category: r.lifecycle_checklist_templates?.category ?? "",
          title: r.lifecycle_checklist_templates?.step_title ?? "",
          description: r.lifecycle_checklist_templates?.description ?? "",
          sort_order: r.lifecycle_checklist_templates?.sort_order ?? 0,
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["my-onboarding", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("staff_induction_video_url, staff_onboarding_workbook_url")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        videoUrl: data?.staff_induction_video_url ?? null,
        workbookUrl: data?.staff_onboarding_workbook_url ?? null,
      };
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("lifecycle_checklist_instances")
        .update({ notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Note saved" });
      qc.invalidateQueries({ queryKey: ["my-onboarding", "instances", runId] });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save note", description: e.message, variant: "destructive" }),
  });

  const run = runQuery.data;
  const instances = useMemo(() => instancesQuery.data ?? [], [instancesQuery.data]);
  const completed = instances.filter((i) => i.completed).length;
  const total = instances.length;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof instances>();
    for (const i of instances) {
      const arr = map.get(i.category) ?? [];
      arr.push(i);
      map.set(i.category, arr);
    }
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((c) => [c, map.get(c)!] as const);
  }, [instances]);

  if (runQuery.isLoading || instancesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle>No onboarding checklist found</CardTitle>
            <CardDescription>
              You don't have an active onboarding checklist linked to your account.
              If you think this is a mistake, please contact your team leader.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">
            Welcome to Vivacity, {run.first_name || "team member"}!
          </h1>
          <p className="text-muted-foreground">
            Here is your onboarding checklist. Work through these with your manager during your first week.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-6">
            <div className="relative h-20 w-20 shrink-0">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" className="stroke-muted" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="16" fill="none"
                  className="stroke-primary"
                  strokeWidth="3"
                  strokeDasharray={`${pct} 100`}
                  pathLength={100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                {pct}%
              </div>
            </div>
            <div className="flex-1">
              <div className="font-medium">
                {completed} of {total} complete
              </div>
              <Progress value={pct} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                Your manager will mark items complete as you finish them. You can leave notes for them below each item.
              </p>
            </div>
          </CardContent>
        </Card>

        {grouped.map(([category, items]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-lg">{CATEGORY_LABELS[category] ?? category}</CardTitle>
              <CardDescription>
                {items.filter((i) => i.completed).length} of {items.length} complete
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <ChecklistItem
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  description={item.description}
                  completed={item.completed}
                  completedAt={item.completed_at}
                  notes={item.notes}
                  onSaveNote={(notes) => updateNote.mutate({ id: item.id, notes })}
                />
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Induction Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            {settingsQuery.data?.videoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-md border">
                <iframe
                  src={toEmbedUrl(settingsQuery.data.videoUrl)}
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title="Induction video"
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                The induction video hasn't been configured yet. Your manager will share it with you shortly.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Onboarding Workbook
            </CardTitle>
          </CardHeader>
          <CardContent>
            {settingsQuery.data?.workbookUrl ? (
              <Button asChild>
                <a href={settingsQuery.data.workbookUrl} target="_blank" rel="noreferrer">
                  Download Workbook
                </a>
              </Button>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                The onboarding workbook hasn't been configured yet. Your manager will share it with you shortly.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}

function ChecklistItem({
  id, title, description, completed, completedAt, notes, onSaveNote,
}: {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
  notes: string;
  onSaveNote: (notes: string) => void;
}) {
  const [value, setValue] = useState(notes);
  const dirty = value !== notes;

  useEffect(() => {
    setValue(notes);
  }, [notes]);

  return (
    <div className="flex gap-3 rounded-lg border p-4">
      <div className="pt-0.5">
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium">{title}</div>
          {completed ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
              Completed{completedAt ? ` · ${new Date(completedAt).toLocaleDateString("en-AU")}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Pending</Badge>
          )}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="space-y-1">
          <Textarea
            placeholder="Notes for your manager (optional)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
          />
          {dirty ? (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onSaveNote(value)}>
                Save note
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
