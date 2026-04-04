import { Link } from "react-router-dom";
import {
  GraduationCap,
  BookOpen,
  Award,
  Calendar,
  Users,
  ShieldCheck,
  Building2,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";

const statCards = [
  { label: "Courses", value: 12, icon: BookOpen },
  { label: "In Progress", value: 3, icon: Clock },
  { label: "Certificates", value: 7, icon: Award },
  { label: "Events", value: 2, icon: Calendar },
];

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
];

const myCourses = [
  { name: "RTO Compliance Fundamentals", status: "In Progress", duration: "4h 30m", progress: 45 },
  { name: "Quality Assurance Best Practices", status: "In Progress", duration: "3h 15m", progress: 20 },
  { name: "Trainer & Assessor Essentials", status: "In Progress", duration: "6h", progress: 68 },
  { name: "CRICOS National Code Overview", status: "Completed", duration: "2h", progress: 100 },
  { name: "Governance Foundations for RTOs", status: "Not Started", duration: "5h", progress: 0 },
];

const statusVariant = (s: string) =>
  s === "Completed" ? "default" : s === "In Progress" ? "secondary" : "outline";

export default function AcademyDashboardPage() {
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
              <span className="text-3xl font-bold text-foreground">{s.value}</span>
              <span className="text-sm text-muted-foreground mt-1">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {myCourses.map((c) => (
            <div key={c.name} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-foreground">{c.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={statusVariant(c.status)} className="text-xs">
                    {c.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{c.duration}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                  {c.progress}%
                </span>
                <Progress
                  value={c.progress}
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
