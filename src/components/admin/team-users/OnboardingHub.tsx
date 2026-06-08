import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  PlayCircle,
  Settings,
} from "lucide-react";
import { useOnboardingHub } from "@/hooks/useOnboardingHub";

interface Props {
  runId: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  induction_training: "Induction & Training",
  onboarding_documents: "Onboarding Documents",
  communications: "Communications",
  system_access: "System Access",
};

function toEmbedUrl(url: string): string {
  // Best-effort Vimeo / YouTube / generic embed
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

export function OnboardingHub({ runId }: Props) {
  const { run, instances, settings, isLoading, updateRun, toggleInstance } =
    useOnboardingHub(runId);

  const completedCount = instances.filter((i) => i.completed).length;
  const total = instances.length || 9;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof instances>();
    for (const i of instances) {
      const arr = map.get(i.category) ?? [];
      arr.push(i);
      map.set(i.category, arr);
    }
    return Array.from(map.entries());
  }, [instances]);

  if (isLoading || !run) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fullName =
    run.display_name || `${run.first_name ?? ""} ${run.last_name ?? ""}`.trim() || "Team member";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-2xl">Onboarding Hub — {fullName}</CardTitle>
              <CardDescription className="mt-1">
                {[run.role_code, run.start_date, run.location_code].filter(Boolean).join(" · ")}
              </CardDescription>
            </div>
            <div className="min-w-[220px]">
              <Progress
                value={(completedCount / total) * 100}
                label={`${completedCount} of ${total} onboarding tasks complete`}
                showValue
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Three hero cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <InductionVideoCard
          videoUrl={settings.staff_induction_video_url}
          sentAt={run.induction_video_sent_at}
          watchedAt={run.induction_video_watched_at}
          onMarkSent={(when) =>
            updateRun.mutate({ induction_video_sent_at: when })
          }
          onMarkWatched={(when) =>
            updateRun.mutate({ induction_video_watched_at: when })
          }
          saving={updateRun.isPending}
        />
        <WorkbookCard
          workbookUrl={settings.staff_onboarding_workbook_url}
          sentAt={run.onboarding_workbook_sent_at}
          returnedAt={run.onboarding_workbook_returned_at}
          onMarkSent={(when) =>
            updateRun.mutate({ onboarding_workbook_sent_at: when })
          }
          onMarkReturned={(when) =>
            updateRun.mutate({ onboarding_workbook_returned_at: when })
          }
          saving={updateRun.isPending}
        />
        <WelcomeEmailCard
          sentAt={run.welcome_email_sent_at}
          notes={run.welcome_email_notes}
          onSave={(when, notes) =>
            updateRun.mutate({
              welcome_email_sent_at: when,
              welcome_email_notes: notes,
            })
          }
          saving={updateRun.isPending}
        />
      </div>

      {/* Full checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Full onboarding checklist</CardTitle>
          <CardDescription>
            Tick each step as it is completed. Hero cards above auto-tick their matching steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {grouped.map(([category, items]) => (
            <Collapsible key={category} defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-muted/40 transition">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {CATEGORY_LABELS[category] ?? category}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {items.filter((i) => i.completed).length}/{items.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 pl-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-md border bg-card"
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={(checked) =>
                        toggleInstance.mutate({ id: item.id, completed: !!checked })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div
                        className={`text-sm ${
                          item.completed ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {item.step_title}
                      </div>
                      {item.completed_at && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Completed {new Date(item.completed_at).toLocaleDateString("en-AU")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- Hero cards -------------------------------- */

function StatusBadge({ status }: { status: "not_sent" | "sent" | "done" }) {
  if (status === "not_sent") return <Badge variant="outline">Not Sent</Badge>;
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  return <Badge className="bg-success text-success-foreground">Done</Badge>;
}

function ConfigPlaceholder({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-2">
      <p>{what} not yet configured.</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/admin/integrations">
          <Settings className="h-3.5 w-3.5 mr-1.5" /> Open System Config
        </Link>
      </Button>
    </div>
  );
}

function InductionVideoCard({
  videoUrl,
  sentAt,
  watchedAt,
  onMarkSent,
  onMarkWatched,
  saving,
}: {
  videoUrl: string | null;
  sentAt: string | null;
  watchedAt: string | null;
  onMarkSent: (when: string) => void;
  onMarkWatched: (when: string) => void;
  saving: boolean;
}) {
  const status: "not_sent" | "sent" | "done" = watchedAt ? "done" : sentAt ? "sent" : "not_sent";
  const now = new Date().toISOString();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary" /> Induction Video
          </CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {videoUrl ? (
          <div className="aspect-video w-full rounded-md overflow-hidden bg-muted">
            <iframe
              src={toEmbedUrl(videoUrl)}
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Induction video"
            />
          </div>
        ) : (
          <ConfigPlaceholder what="Induction video" />
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={sentAt ? "outline" : "default"}
            disabled={saving}
            onClick={() => onMarkSent(sentAt ? "" : now)}
            className="flex-1"
          >
            {sentAt ? "Sent " + new Date(sentAt).toLocaleDateString("en-AU") : "Mark as Sent"}
          </Button>
          <Button
            size="sm"
            variant={watchedAt ? "outline" : "default"}
            disabled={saving || !sentAt}
            onClick={() => onMarkWatched(watchedAt ? "" : now)}
            className="flex-1"
          >
            {watchedAt ? "Watched" : "Mark Watched"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkbookCard({
  workbookUrl,
  sentAt,
  returnedAt,
  onMarkSent,
  onMarkReturned,
  saving,
}: {
  workbookUrl: string | null;
  sentAt: string | null;
  returnedAt: string | null;
  onMarkSent: (when: string) => void;
  onMarkReturned: (when: string) => void;
  saving: boolean;
}) {
  const status: "not_sent" | "sent" | "done" = returnedAt ? "done" : sentAt ? "sent" : "not_sent";
  const now = new Date().toISOString();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Onboarding Workbook
          </CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {workbookUrl ? (
          <Button asChild variant="outline" className="w-full">
            <a href={workbookUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" /> Download Onboarding Workbook
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
        ) : (
          <ConfigPlaceholder what="Onboarding workbook" />
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={sentAt ? "outline" : "default"}
            disabled={saving}
            onClick={() => onMarkSent(sentAt ? "" : now)}
            className="flex-1"
          >
            {sentAt ? "Sent " + new Date(sentAt).toLocaleDateString("en-AU") : "Mark as Sent"}
          </Button>
          <Button
            size="sm"
            variant={returnedAt ? "outline" : "default"}
            disabled={saving || !sentAt}
            onClick={() => onMarkReturned(returnedAt ? "" : now)}
            className="flex-1"
          >
            {returnedAt ? "Returned" : "Mark Returned"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WelcomeEmailCard({
  sentAt,
  notes,
  onSave,
  saving,
}: {
  sentAt: string | null;
  notes: string | null;
  onSave: (when: string, notes: string) => void;
  saving: boolean;
}) {
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [draftDate, setDraftDate] = useState(
    sentAt ? sentAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const status: "not_sent" | "sent" = sentAt ? "sent" : "not_sent";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Welcome Email
          </CardTitle>
          {status === "sent" ? (
            <Badge className="bg-success text-success-foreground">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Sent
            </Badge>
          ) : (
            <Badge variant="outline">Not Sent</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="welcome-date">Date sent</Label>
          <Input
            id="welcome-date"
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="welcome-notes">Notes (optional)</Label>
          <Textarea
            id="welcome-notes"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="Any context about the welcome email"
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving}
            className="flex-1"
            onClick={() =>
              onSave(
                new Date(draftDate + "T00:00:00").toISOString(),
                draftNotes
              )
            }
          >
            {sentAt ? "Update" : "Mark as Sent"}
          </Button>
          {sentAt && (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => onSave("", draftNotes)}
            >
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
