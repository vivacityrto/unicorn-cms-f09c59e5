import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Circle, Award } from "lucide-react";
import { format } from "date-fns";
import CourseProgressBar from "./CourseProgressBar";

interface Props {
  enrolmentId: number | null;
  onClose: () => void;
}

export default function EnrolmentProgressDrawer({ enrolmentId, onClose }: Props) {
  const open = enrolmentId !== null;

  const { data: enrolment, isLoading: loadingEnrolment } = useQuery({
    queryKey: ["enrolment-detail", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_enrollments")
        .select(`
          *,
          course:academy_courses(id, title),
          tenant:tenants(id, name),
          user:users!academy_enrollments_user_id_fkey(user_uuid, first_name, last_name, email, avatar_url)
        `)
        .eq("id", enrolmentId!)
        .single();
      if (error) throw error;
      return data;
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

  const { data: lessonProgress } = useQuery({
    queryKey: ["enrolment-lessons", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lesson_progress")
        .select(`
          *,
          lesson:academy_lessons(id, title, sort_order)
        `)
        .eq("enrollment_id", enrolmentId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: attempts } = useQuery({
    queryKey: ["enrolment-attempts", enrolmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_assessment_attempts")
        .select("*")
        .eq("enrollment_id", enrolmentId!)
        .order("attempt_number");
      if (error) throw error;
      return data;
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

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Progress Detail</SheetTitle>
        </SheetHeader>

        {loadingEnrolment ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : enrolment ? (
          <div className="space-y-6 mt-6">
            {/* User info */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium flex-shrink-0">
                {enrolment.user?.avatar_url ? (
                  <img src={enrolment.user.avatar_url} className="h-10 w-10 rounded-full object-cover" alt="" />
                ) : (
                  `${(enrolment.user?.first_name || "?")[0]}${(enrolment.user?.last_name || "")[0]}`
                )}
              </div>
              <div>
                <p className="font-medium">{enrolment.user?.first_name} {enrolment.user?.last_name}</p>
                <p className="text-sm text-muted-foreground">{enrolment.user?.email}</p>
                <p className="text-xs text-muted-foreground">{enrolment.tenant?.name}</p>
              </div>
            </div>

            <Separator />

            {/* Course info */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">{enrolment.course?.title}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Enrolled:</span> {enrolment.enrolled_at ? format(new Date(enrolment.enrolled_at), "dd MMM yyyy") : "—"}</div>
                <div><span className="text-muted-foreground">Expires:</span> {enrolment.expires_at ? format(new Date(enrolment.expires_at), "dd MMM yyyy") : "—"}</div>
              </div>
            </div>

            {/* Overall progress */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Overall Progress</p>
              <CourseProgressBar
                percentage={progress?.progress_percentage ?? 0}
                showLabel
                size="md"
              />
            </div>

            <Separator />

            {/* Lesson progress */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Lessons</h4>
              {lessonProgress && lessonProgress.length > 0 ? (
                <div className="space-y-2">
                  {lessonProgress.map((lp: any) => (
                    <div key={lp.id} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50">
                      {lp.is_completed ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lp.lesson?.title || `Lesson ${lp.lesson_id}`}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{lp.completion_percentage ?? 0}%</span>
                          {lp.last_position_seconds != null && (
                            <span>Pos: {Math.floor(lp.last_position_seconds / 60)}m {lp.last_position_seconds % 60}s</span>
                          )}
                          {lp.completed_at && (
                            <span>{format(new Date(lp.completed_at), "dd MMM yyyy")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No lesson progress recorded</p>
              )}
            </div>

            <Separator />

            {/* Assessment attempts */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Assessment Attempts</h4>
              {attempts && attempts.length > 0 ? (
                <div className="space-y-2">
                  {attempts.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/50">
                      <Badge variant={a.passed ? "default" : "destructive"} className="text-xs">
                        {a.passed ? "Passed" : "Failed"}
                      </Badge>
                      <span>Attempt {a.attempt_number}</span>
                      <span className="text-muted-foreground">Score: {a.score ?? "—"}%</span>
                      {a.submitted_at && (
                        <span className="text-muted-foreground text-xs ml-auto">
                          {format(new Date(a.submitted_at), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No assessment attempts</p>
              )}
            </div>

            <Separator />

            {/* Certificate */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Certificate</h4>
              {certificate ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <Award className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Certificate #{certificate.certificate_number}</p>
                    <p className="text-xs text-green-600">
                      Issued: {certificate.issued_at ? format(new Date(certificate.issued_at), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not yet issued</p>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
