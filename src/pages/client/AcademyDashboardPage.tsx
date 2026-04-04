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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { useAcademyDashboardStats, useMyAcademyCourses, formatDuration } from "@/hooks/useAcademyCourses";
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
  const { data: myCourses = [], isLoading: coursesLoading } = useMyAcademyCourses();

  const statCards = [
    { label: "Courses", value: stats?.courses ?? 0, icon: BookOpen },
    { label: "In Progress", value: stats?.inProgress ?? 0, icon: Clock },
    { label: "Certificates", value: stats?.certificates ?? 0, icon: Award },
    { label: "Events", value: stats?.events ?? 0, icon: Calendar },
  ];

  return (
    <AcademyPageWrapper
      title="Vivacity Academy"
      subtitle="Your personalised learning portal — built for the VET sector"
      icon={<GraduationCap className="h-6 w-6" />}
      accentColour="#23c0dd"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <s.icon className="h-6 w-6 mb-2" style={{ color: "#23c0dd" }} />
              {statsLoading ? (
                <Skeleton className="h-8 w-12 mb-1" />
              ) : (
                <span className="text-3xl font-bold text-foreground">{s.value}</span>
              )}
              <span className="text-sm text-muted-foreground mt-1">{s.label}</span>
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
          {!coursesLoading && myCourses.map((c) => (
            <div key={c.course_id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
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
            </div>
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
