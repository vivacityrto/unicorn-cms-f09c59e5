import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle, Circle, Award, Download, ChevronDown, RotateCcw, CheckCheck, ShieldOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import CourseProgressBar from "./CourseProgressBar";
import {
  useLessonDetail,
  useMarkLessonComplete,
  useResetLesson,
  useIssueCertificate,
  useRevokeCertificate,
} from "@/hooks/academy/useAcademyEnrollments";
import { toast } from "sonner";

interface Props {
  enrolmentId: number | null;
  onClose: () => void;
}

const fmtDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const sourceTone = (s?: string | null) => {
  if (s === "manual") return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "auto_package") return "bg-purple-100 text-purple-700 border-purple-200";
  if (s === "auto_package_backfill") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-muted text-muted-foreground";
};

const statusTone = (s?: string | null, expired?: boolean) => {
  if (expired) return "bg-red-100 text-red-700 border-red-200";
  if (s === "completed") return "bg-blue-100 text-blue-700 border-blue-200";
  if (s === "active") return "bg-green-100 text-green-700 border-green-200";
  if (s === "revoked") return "bg-red-100 text-red-700 border-red-200";
  return "bg-muted text-muted-foreground";
};

export default function EnrolmentProgressDrawer({ enrolmentId, onClose }: Props) {
  const open = enrolmentId !== null;
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  const markComplete = useMarkLessonComplete();
  const resetLesson = useResetLesson();
  const issueCert = useIssueCertificate();
  const revokeCert = useRevokeCertificate();

  const { data: enrolment, isLoading: loadingEnrolment } = useQuery({
    queryKey: ["enrolment-detail", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data: enr, error } = await supabase
        .from("academy_enrollments")
        .select("*")
        .eq("id", enrolmentId!)
        .single();
      if (error) throw error;

      const [courseRes, userRes, tenantRes] = await Promise.all([
        supabase.from("academy_courses").select("id, title, thumbnail_url, estimated_minutes").eq("id", enr.course_id).single(),
        supabase.from("users").select("user_uuid, first_name, last_name, email, avatar_url").eq("user_uuid", enr.user_id).single(),
        enr.tenant_id
          ? supabase.from("tenants").select("id, name, tenant_type").eq("id", enr.tenant_id).single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...enr,
        course: courseRes.data,
        user: userRes.data,
        tenant: tenantRes.data,
      };
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["enrolment-progress", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_academy_course_progress")
        .select("*")
        .eq("enrollment_id", enrolmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lessons = [], isLoading: loadingLessons } = useLessonDetail(enrolmentId);

  const { data: assessments = [] } = useQuery({
    queryKey: ["enrolment-assessments", enrolmentId, enrolment?.course_id],
    enabled: open && !!enrolment?.course_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessments")
        .select("id, title, pass_score")
        .eq("course_id", enrolment.course_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["enrolment-attempts", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_attempts")
        .select("*")
        .eq("enrollment_id", enrolmentId!)
        .order("attempt_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: certificate } = useQuery({
    queryKey: ["enrolment-certificate", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_certificates")
        .select("*")
        .eq("enrollment_id", enrolmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const expired = useMemo(() => {
    if (!enrolment?.expires_at || enrolment.status !== "active") return false;
    return new Date(enrolment.expires_at).getTime() <= Date.now();
  }, [enrolment]);

  // Group lessons by module
  const groupedLessons = useMemo(() => {
    const groups: Record<string, { module_id: number; module_title: string; module_sort_order: number; items: (typeof lessons)[number][] }> = {};
    for (const l of lessons) {
      const k = String(l.module_id);
      if (!groups[k]) {
        groups[k] = { module_id: l.module_id, module_title: l.module_title, module_sort_order: l.module_sort_order, items: [] };
      }
      groups[k].items.push(l);
    }
    return Object.values(groups).sort((a, b) => a.module_sort_order - b.module_sort_order);
  }, [lessons]);

  const handleDownloadCert = async () => {
    if (!certificate?.storage_path) {
      toast.error("Certificate PDF not yet generated");
      return;
    }
    const { data, error } = await supabase.storage
      .from("certificates")
      .createSignedUrl(certificate.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleRevokeCert = () => {
    if (!certificate?.id) return;
    const reason = window.prompt("Reason for revoking this certificate?");
    if (reason === null) return;
    revokeCert.mutate({ certificateId: certificate.id, reason });
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-[720px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Progress Detail</SheetTitle>
        </SheetHeader>

        {loadingEnrolment ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : enrolment ? (
          <div className="p-6 space-y-6">
            {/* Header: learner + chips */}
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {enrolment.user?.avatar_url ? (
                  <img src={enrolment.user.avatar_url} className="h-12 w-12 rounded-full object-cover" alt="" />
                ) : (
                  `${(enrolment.user?.first_name || "?")[0] ?? ""}${(enrolment.user?.last_name || "")[0] ?? ""}`
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold", enrolment.status === "revoked" && "line-through opacity-60")}>
                  {enrolment.user?.first_name} {enrolment.user?.last_name}
                </p>
                <p className="text-sm text-muted-foreground truncate">{enrolment.user?.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {enrolment.tenant?.name && (
                    <Badge variant="outline" className="text-xs">
                      {enrolment.tenant.name}
                      {enrolment.tenant.tenant_type && (
                        <span className="ml-1 uppercase opacity-70">· {enrolment.tenant.tenant_type}</span>
                      )}
                    </Badge>
                  )}
                  {enrolment.source && (
                    <Badge variant="outline" className={cn("text-xs capitalize", sourceTone(enrolment.source))}>
                      {String(enrolment.source).replace(/_/g, " ")}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn("text-xs capitalize", statusTone(enrolment.status, expired))}>
                    {expired ? "expired" : enrolment.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Course summary */}
            <div className="flex gap-3 rounded-lg border p-3">
              {enrolment.course?.thumbnail_url ? (
                <img
                  src={enrolment.course.thumbnail_url}
                  alt=""
                  className="h-16 w-16 object-cover rounded-md flex-shrink-0 aspect-square"
                />
              ) : (
                <div className="h-16 w-16 rounded-md bg-muted flex-shrink-0 aspect-square" />
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium truncate">{enrolment.course?.title}</p>
                <p className="text-xs text-muted-foreground">
                  {enrolment.course?.estimated_minutes ? `${enrolment.course.estimated_minutes} min` : "—"}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground pt-1">
                  <div>Enrolled: {enrolment.enrolled_at ? format(new Date(enrolment.enrolled_at), "dd MMM yyyy") : "—"}</div>
                  <div>Expires: {enrolment.expires_at ? format(new Date(enrolment.expires_at), "dd MMM yyyy") : "—"}</div>
                  {enrolment.completed_at && (
                    <div>Completed: {format(new Date(enrolment.completed_at), "dd MMM yyyy")}</div>
                  )}
                  {enrolment.revoked_at && (
                    <div className="text-red-600">Revoked: {format(new Date(enrolment.revoked_at), "dd MMM yyyy")}</div>
                  )}
                </div>
                {enrolment.revoke_reason && (
                  <p className="text-xs text-red-600 mt-1">Reason: {enrolment.revoke_reason}</p>
                )}
              </div>
            </div>

            {/* Overall progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Overall progress</p>
                {progress?.last_activity_at && (
                  <p className="text-xs text-muted-foreground">
                    Last activity {formatDistanceToNow(new Date(progress.last_activity_at), { addSuffix: true })}
                  </p>
                )}
              </div>
              <CourseProgressBar
                percentage={progress?.progress_percentage ?? 0}
                showLabel
                size="md"
              />
              <p className="text-xs text-muted-foreground">
                {progress?.completed_lessons ?? 0} of {progress?.total_lessons ?? 0} lessons complete
              </p>
            </div>

            <Separator />

            {/* Lessons grouped by module */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Lessons</h4>
                <Collapsible open={troubleshootOpen} onOpenChange={setTroubleshootOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs">
                      Troubleshoot <ChevronDown className={cn("h-3 w-3 ml-1 transition-transform", troubleshootOpen && "rotate-180")} />
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>
              {loadingLessons ? (
                <Skeleton className="h-24 w-full" />
              ) : groupedLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lessons published in this course.</p>
              ) : (
                <div className="space-y-4">
                  {groupedLessons.map((group) => (
                    <div key={group.module_id} className="space-y-1">
                      <div className="sticky top-0 z-10 bg-background py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
                        {group.module_title}
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {group.items.map((l) => {
                          const status =
                            l.is_completed ? "completed" :
                            (l.completion_percentage ?? 0) > 0 || (l.watch_seconds ?? 0) > 0 ? "in-progress" :
                            "not-started";
                          return (
                            <div
                              key={l.lesson_id}
                              className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm"
                            >
                              {l.is_completed ? (
                                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium truncate">{l.lesson_title}</p>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] capitalize flex-shrink-0",
                                      status === "completed" && "bg-green-100 text-green-700 border-green-200",
                                      status === "in-progress" && "bg-amber-100 text-amber-700 border-amber-200",
                                      status === "not-started" && "bg-muted text-muted-foreground"
                                    )}
                                  >
                                    {status.replace("-", " ")}
                                  </Badge>
                                </div>
                                <Progress value={Number(l.completion_percentage ?? 0)} className="h-1.5" />
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <span>
                                    {fmtDuration(l.watch_seconds)}
                                    {l.video_duration_seconds ? ` / ${fmtDuration(l.video_duration_seconds)}` : ""}
                                  </span>
                                  {l.last_position_seconds > 0 && !l.is_completed && (
                                    <span>Resumes at {fmtDuration(l.last_position_seconds)}</span>
                                  )}
                                  {l.completed_at && (
                                    <span>Done {format(new Date(l.completed_at), "dd MMM yyyy")}</span>
                                  )}
                                </div>
                                {troubleshootOpen && (
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      disabled={markComplete.isPending || l.is_completed}
                                      onClick={() => markComplete.mutate({ enrollmentId: enrolmentId!, lessonId: l.lesson_id })}
                                    >
                                      <CheckCheck className="h-3 w-3 mr-1" /> Mark complete
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      disabled={resetLesson.isPending}
                                      onClick={() => resetLesson.mutate({ enrollmentId: enrolmentId!, lessonId: l.lesson_id })}
                                    >
                                      <RotateCcw className="h-3 w-3 mr-1" /> Reset
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assessments (only when course has any) */}
            {assessments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Assessments</h4>
                  {assessments.map((a) => {
                    const myAttempts = attempts.filter((at) => at.assessment_id === a.id);
                    return (
                      <div key={a.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{a.title}</p>
                            <p className="text-xs text-muted-foreground">Pass score: {a.pass_score ?? "—"}%</p>
                          </div>
                        </div>
                        {myAttempts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No attempts yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {myAttempts.map((at) => (
                              <div key={at.id} className="flex items-center gap-2 text-xs">
                                <Badge variant={at.passed ? "default" : "destructive"} className="text-[10px]">
                                  {at.passed ? "Pass" : "Fail"}
                                </Badge>
                                <span>Attempt {at.attempt_number}</span>
                                <span className="text-muted-foreground">Score {at.score ?? "—"}%</span>
                                {at.time_taken_seconds && (
                                  <span className="text-muted-foreground">
                                    · {Math.round(at.time_taken_seconds / 60)}m
                                  </span>
                                )}
                                {at.submitted_at && (
                                  <span className="text-muted-foreground ml-auto">
                                    {format(new Date(at.submitted_at), "dd MMM yyyy")}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <Separator />

            {/* Certificate */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Certificate</h4>
              {certificate ? (
                <div className={cn(
                  "rounded-lg border p-3 space-y-2",
                  certificate.revoked_at ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                )}>
                  <div className="flex items-center gap-2">
                    <Award className={cn("h-5 w-5", certificate.revoked_at ? "text-red-600" : "text-green-600")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", certificate.revoked_at ? "text-red-800" : "text-green-800")}>
                        Certificate #{certificate.certificate_number}
                      </p>
                      <p className={cn("text-xs", certificate.revoked_at ? "text-red-600" : "text-green-600")}>
                        Issued {certificate.issued_at ? format(new Date(certificate.issued_at), "dd MMM yyyy") : "—"}
                        {certificate.revoked_at && ` · Revoked ${format(new Date(certificate.revoked_at), "dd MMM yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadCert}
                      disabled={!certificate.storage_path}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {certificate.storage_path ? "Download PDF" : "PDF pending"}
                    </Button>
                    {!certificate.revoked_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={handleRevokeCert}
                        disabled={revokeCert.isPending}
                      >
                        <ShieldOff className="h-3 w-3 mr-1" /> Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No certificate issued yet. Certificates are issued automatically on course completion.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => issueCert.mutate(enrolmentId!)}
                    disabled={issueCert.isPending}
                  >
                    <Award className="h-3 w-3 mr-1" /> Issue certificate
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
