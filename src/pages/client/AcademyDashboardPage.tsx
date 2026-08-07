import { Link } from "react-router-dom";
import {
  GraduationCap,
  BookOpen,
  Award,
  Calendar,
  Users,
  ShieldCheck,
  Building2,
  HeartHandshake,
  ClipboardList,
  ChevronRight,
  Clock,
  PlayCircle,
} from "lucide-react";
import { useLatestRecordings } from "@/hooks/academy/useLatestRecordings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { useAcademyDashboardStats, formatDuration } from "@/hooks/useAcademyCourses";
import { useMyEnrolledCourses } from "@/hooks/academy/useMyEnrolledCourses";
import { useAuth } from "@/hooks/useAuth";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { Skeleton } from "@/components/ui/skeleton";

const roleTiles = [
  {
    title: "Trainer Hub",
    description: "Professional development for trainers and assessors",
    icon: Users,
    accent: "#23c0dd",
    route: "/academy/trainer",
  },
  {
    title: "Compliance Manager",
    description: "Standards, audits, quality assurance, and regulatory compliance",
    icon: ShieldCheck,
    accent: "#ed1878",
    route: "/academy/compliance-manager",
  },
  {
    title: "Governance Person",
    description: "Board obligations, strategic governance, and business management",
    icon: Building2,
    accent: "#7130A0",
    route: "/academy/governance-person",
  },
  {
    title: "Student Support Officer",
    description: "Online delivery, student engagement, and support services",
    icon: HeartHandshake,
    accent: "#23c0dd",
    route: "/academy/student-support-officer",
  },
  {
    title: "Administration Assistant",
    description: "Strategic planning, branding, business operations, and governance",
    icon: ClipboardList,
    accent: "#7130A0",
    route: "/academy/administration-assistant",
  },
];

const statusVariant = (s: string | null) =>
  s === "completed" ? "default" : s === "active" ? "secondary" : "outline";

const statusLabel = (s: string | null) =>
  s === "completed" ? "Completed" : s === "active" ? "In Progress" : "Not Started";

export default function AcademyDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAcademyDashboardStats();
  const { data: myCoursesAll = [], isLoading: coursesLoading } = useMyEnrolledCourses();
  const { data: latestRecordings = [], isLoading: recordingsLoading } = useLatestRecordings();
  const { profile } = useAuth();
  const { isImpersonating } = useAcademyActingUserId();
  const { actingUserId, actingUserOptions, isPreviewMode } = useClientPreview();
  const myCourses = myCoursesAll
    .filter((c) => c.enrollment_status === "active")
    .slice(0, 3);

  const impersonated = isImpersonating
    ? actingUserOptions.find((o) => o.user_uuid === actingUserId) ?? null
    : null;
  const impersonatedFirst =
    impersonated?.full_name?.trim().split(/\s+/)[0] ??
    impersonated?.email?.split("@")[0] ??
    null;
  // In preview mode (impersonating or not), never leak staff identity into
  // the academy greeting. Show empty string when no valid acting user.
  const firstName = isPreviewMode
    ? (impersonatedFirst ?? "").trim()
    : (profile?.first_name ?? "").trim();

  const statCards = [
    { label: "Courses", value: stats?.courses ?? 0, icon: BookOpen, accent: "#7130A0" },
    { label: "In Progress", value: stats?.inProgress ?? 0, icon: Clock, accent: "#23C0DD" },
    { label: "Certificates", value: stats?.certificates ?? 0, icon: Award, accent: "#F9CB0C" },
    { label: "Events", value: stats?.events ?? 0, icon: Calendar, accent: "#ED1878" },
  ];

  return (
    <AcademyPageWrapper
      title="Vivacity Academy"
      subtitle="Your personalised learning portal — built for the VET sector"
      icon={<GraduationCap className="h-6 w-6" />}
      accentColour="#23c0dd"
    >
      {/* Welcome strip */}
      <div
        className="rounded-xl px-6 py-5 text-white"
        style={{ background: "var(--viv-grad-hero)" }}
      >
        <h2 className="text-3xl font-bold text-white leading-tight" style={{ color: '#ffffff' }}>
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h2>
        <p className="text-sm text-white/85 mt-1.5">
          Pick up where you left off, or explore a new pathway below.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="overflow-hidden border-l-[4px]" style={{ borderLeftColor: s.accent }}>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <s.icon className="h-6 w-6 mb-2" style={{ color: s.accent }} />
              {statsLoading ? (
                <Skeleton className="h-8 w-12 mb-1" />
              ) : (
                <span className="text-3xl font-bold text-[var(--viv-acai)]">{s.value}</span>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--viv-acai)]/70 mt-1">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roleTiles.map((tile) => (
          <Link key={tile.route} to={tile.route} className="block group">
            <Card
              className="bg-white hover:shadow-lg transition-shadow h-full"
              style={{ borderLeft: `4px solid ${tile.accent}` }}
            >
              <CardContent className="py-5 px-5 flex items-center gap-4">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${tile.accent}15` }}
                >
                  <tile.icon className="h-5 w-5" style={{ color: tile.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground">{tile.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{tile.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* My Courses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" style={{ color: "#23c0dd" }} />
            My Courses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {coursesLoading && (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-2 w-24" />
              </div>
            ))
          )}
          {!coursesLoading && myCourses.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">You haven't enrolled in any courses yet.</p>
            </div>
          )}
          {!coursesLoading && myCourses.map((c) => {
            const target = c.next_lesson
              ? `/academy/course/${c.next_lesson.slug}/lesson/${c.next_lesson.lessonId}`
              : c.course_slug
                ? `/academy/course/${c.course_slug}`
                : "/academy/courses";
            return (
              <Link
                key={c.enrollment_id}
                to={target}
                className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-foreground">{c.course_title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={statusVariant(c.enrollment_status)} className="text-xs">
                      {statusLabel(c.enrollment_status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDuration(c.estimated_minutes)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                    {c.progress_percentage ?? 0}%
                  </span>
                  <Progress
                    value={c.progress_percentage ?? 0}
                    className="w-24 h-2 [&>div]:bg-[#23c0dd]"
                  />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {/* Latest Recordings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" style={{ color: "#23c0dd" }} />
            Latest Recordings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recordingsLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <Skeleton className="h-12 w-20 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          {!recordingsLoading && latestRecordings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <PlayCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No recordings available yet.</p>
            </div>
          )}
          {!recordingsLoading &&
            latestRecordings.map((video) => (
              <Link
                key={video.id}
                to={`/academy/course/${video.courseSlug}/lesson/${video.lessonId}`}
                className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="h-12 w-20 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.video_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <PlayCircle className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-foreground truncate">
                    {video.video_name}
                  </h4>
                  <div className="text-xs text-muted-foreground mt-1">
                    {video.folder_name && <span>{video.folder_name} · </span>}
                    {video.duration_seconds
                      ? formatDuration(Math.round(video.duration_seconds / 60))
                      : "Recording"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
        </CardContent>
      </Card>

      {/* Team Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: "#23c0dd" }} />
            Team Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Team progress would appear here</p>
          </div>
        </CardContent>
      </Card>
    </AcademyPageWrapper>
  );
}
