import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";


import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { EXIT_INTERVIEW_SECTIONS, RATING_LABELS } from "./exitInterviewSchema";

type Engagement = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  type: string;
  status: string;
  created_at: string;
};

type Interview = {
  id: string;
  engagement_id: string;
  responses: Record<string, unknown>;
  is_submitted: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
};

type ExitInterviewInsert = TablesInsert<"engagement_exit_interviews">;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Try again.";

export default function MyExitInterview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<string, unknown>>({});

  const engagementQuery = useQuery({
    queryKey: ["my-exit-interview-engagement", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Engagement | null> => {
      const { data, error } = await supabase
        .from("staff_engagements")
        .select("id, first_name, last_name, type, status, created_at")
        .eq("linked_unicorn_user_id", user!.id)
        .eq("type", "offboarding")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Engagement) ?? null;
    },
  });

  const engagement = engagementQuery.data;

  const interviewQuery = useQuery({
    queryKey: ["my-exit-interview", engagement?.id],
    enabled: !!engagement?.id,
    queryFn: async (): Promise<Interview | null> => {
      const { data, error } = await supabase
        .from("engagement_exit_interviews")
        .select("id, engagement_id, responses, is_submitted, submitted_at, submitted_by")
        .eq("engagement_id", engagement!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Interview) ?? null;
    },
  });

  const interview = interviewQuery.data;

  useEffect(() => {
    if (interview?.responses && typeof interview.responses === "object") {
      setResponses(interview.responses as Record<string, unknown>);
    }
    // interview.responses is intentionally excluded: this should only seed
    // local state when a different interview loads (interview.id changes),
    // not every time the query refetches while the user is mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview?.id]);

  const upsertMutation = useMutation({
    mutationFn: async (nextResponses: Record<string, unknown>) => {
      if (!engagement?.id) throw new Error("No engagement");
      const { error } = await supabase
        .from("engagement_exit_interviews")
        .upsert(
          {
            engagement_id: engagement.id,
            responses: nextResponses as unknown as Json,
          } satisfies ExitInterviewInsert,
          { onConflict: "engagement_id" },
        );
      if (error) throw error;
    },
    onError: (e: unknown) => {
      toast({ title: "Could not save", description: errorMessage(e), variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-exit-interview", engagement?.id] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!engagement?.id || !user?.id) throw new Error("Missing context");
      // Ensure latest responses persisted
      const { error: upsertErr } = await supabase
        .from("engagement_exit_interviews")
        .upsert(
          {
            engagement_id: engagement.id,
            responses: responses as unknown as Json,
            is_submitted: true,
            submitted_at: new Date().toISOString(),
            submitted_by: user.id,
          } satisfies ExitInterviewInsert,
          { onConflict: "engagement_id" },
        );
      if (upsertErr) throw upsertErr;
    },
    onSuccess: () => {
      toast({ title: "Exit interview submitted", description: "Thank you for your feedback." });
      queryClient.invalidateQueries({ queryKey: ["my-exit-interview", engagement?.id] });
    },
    onError: (e: unknown) => {
      toast({ title: "Submission failed", description: errorMessage(e), variant: "destructive" });
    },
  });

  const setValue = (key: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
  };

  const persistOnBlur = () => {
    if (!engagement?.id) return;
    upsertMutation.mutate(responses);
  };

  const isLoading = engagementQuery.isLoading || (!!engagement && interviewQuery.isLoading);
  const isSubmitted = !!interview?.is_submitted;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-sm text-muted-foreground">Vivacity Coaching & Consulting</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Exit Interview</h1>
          <p className="text-sm text-muted-foreground">
            Your feedback helps Vivacity improve. All responses are reviewed by leadership.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && !engagement && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No exit interview found for your account. If you believe this is an error, please contact your manager.
            </CardContent>
          </Card>
        )}

        {!isLoading && engagement && isSubmitted && (
          <ReadOnlyView interview={interview!} />
        )}

        {!isLoading && engagement && !isSubmitted && (
          <FormView
            responses={responses}
            setValue={setValue}
            onBlur={persistOnBlur}
            onSubmit={() => submitMutation.mutate()}
            submitting={submitMutation.isPending}
            saving={upsertMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function FormView({
  responses,
  setValue,
  onBlur,
  onSubmit,
  submitting,
  saving,
}: {
  responses: Record<string, unknown>;
  setValue: (key: string, value: unknown) => void;
  onBlur: () => void;
  onSubmit: () => void;
  submitting: boolean;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Draft autosaves as you type</AlertTitle>
        <AlertDescription>
          Your answers are saved automatically when you leave a field. You can return later to finish.
        </AlertDescription>
      </Alert>

      {EXIT_INTERVIEW_SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description && (
              <CardDescription>{section.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {section.questions.map((q) => {
              if (q.type === "textarea") {
                const v = typeof responses[q.key] === "string" ? (responses[q.key] as string) : "";
                return (
                  <div key={q.key} className="space-y-2">
                    <label className="text-sm font-medium leading-snug block">{q.label}</label>
                    <Textarea
                      value={v}
                      rows={4}
                      onChange={(e) => setValue(q.key, e.target.value)}
                      onBlur={onBlur}
                    />
                  </div>
                );
              }
              // rating
              const current = typeof responses[q.key] === "number" ? (responses[q.key] as number) : null;
              return (
                <div key={q.key} className="space-y-2">
                  <label className="text-sm font-medium leading-snug block">{q.label}</label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setValue(q.key, n);
                          // persist immediately for ratings
                          setTimeout(onBlur, 0);
                        }}
                        className={cn(
                          "px-3 py-2 rounded-md border text-xs min-w-[88px] text-center transition-colors",
                          current === n
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted",
                        )}
                      >
                        <div className="font-semibold text-sm">{n}</div>
                        <div className="text-[10px] opacity-80">{RATING_LABELS[n - 1]}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Submitting is final</AlertTitle>
        <AlertDescription>
          Once submitted, your responses cannot be edited. Please review your answers before submitting.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {saving ? "Saving…" : "All changes saved"}
        </span>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Interview"}
        </Button>
      </div>
    </div>
  );
}

function ReadOnlyView({ interview }: { interview: Interview }) {
  const responses = (interview.responses ?? {}) as Record<string, unknown>;
  const submittedAt = interview.submitted_at
    ? format(new Date(interview.submitted_at), "dd MMMM yyyy HH:mm")
    : "—";

  return (
    <div className="space-y-6">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Thank you — your exit interview has been submitted</AlertTitle>
        <AlertDescription>Submitted on {submittedAt}.</AlertDescription>
      </Alert>

      {EXIT_INTERVIEW_SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.questions.map((q) => {
              const raw = responses[q.key];
              const display =
                q.type === "rating"
                  ? typeof raw === "number"
                    ? `${raw} / 5 — ${RATING_LABELS[raw - 1] ?? ""}`
                    : "—"
                  : typeof raw === "string" && raw.trim()
                    ? raw
                    : "—";
              return (
                <div key={q.key} className="space-y-1">
                  <div className="text-sm font-medium">{q.label}</div>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">{display}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
