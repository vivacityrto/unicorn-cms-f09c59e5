import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, GraduationCap, ChevronRight, FileText, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CourseCardLegacy as CourseCard, type CourseCardData } from "@/components/academy/CourseCard";
import { Card, CardContent } from "@/components/ui/card";

const ACCENT = "#7130A0";

const categories = ["All", "Governing Obligations", "Strategic Planning", "Financial Governance", "Risk Management", "Leadership"];

const courses: CourseCardData[] = [
  { id: "gp1", title: "Governing Persons Obligations Under SRTO 2025", description: "Understand the legal and regulatory obligations of Governing Persons under the Standards for RTOs 2025.", category: "Governing Obligations", duration: "3h", lessons: 0, totalLessons: 9, difficulty: "Intermediate", status: "Not Started" },
  { id: "gp2", title: "Strategic Planning for RTO Sustainability", description: "Develop and implement strategic plans that ensure long-term sustainability for your RTO.", category: "Strategic Planning", duration: "4h", lessons: 4, totalLessons: 12, difficulty: "Advanced", status: "In Progress", progress: 30 },
  { id: "gp3", title: "Financial Governance and Accountability for RTOs", description: "Financial oversight, budgeting, and accountability frameworks for Governing Persons of RTOs.", category: "Financial Governance", duration: "3.5h", lessons: 0, totalLessons: 10, difficulty: "Intermediate", status: "Not Started" },
  { id: "gp4", title: "Risk Management Frameworks for Governing Persons", description: "Build and maintain risk management frameworks tailored to Governing Persons' responsibilities.", category: "Risk Management", duration: "2.5h", lessons: 0, totalLessons: 8, difficulty: "Intermediate", status: "Not Started" },
  { id: "gp5", title: "Leading High-Performance RTO Teams", description: "Leadership strategies for Governing Persons to build and maintain high-performance teams.", category: "Leadership", duration: "3h", lessons: 0, totalLessons: 10, difficulty: "Intermediate", status: "Not Started" },
  { id: "gp6", title: "Understanding ASQA's Regulatory Approach — A Governing Person Perspective", description: "How ASQA's regulatory framework impacts Governing Persons and what you need to know.", category: "Governing Obligations", duration: "2h", lessons: 0, totalLessons: 7, difficulty: "Beginner", status: "Not Started" },
  { id: "gp7", title: "Data-Driven Decision Making for RTO Leaders", description: "Use data and analytics to inform strategic decisions as a Governing Person of an RTO.", category: "Strategic Planning", duration: "2.5h", lessons: 0, totalLessons: 8, difficulty: "Advanced", status: "Not Started" },
];

const resources = [
  "Governing Persons Obligations Checklist (SRTO 2025)",
  "RTO Strategic Plan Template",
  "Board Meeting Agenda and Minutes Template",
];

export default function GovernancePersonPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const filtered = activeFilter === "All" ? courses : courses.filter((c) => c.category === activeFilter);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/academy" className="hover:text-foreground transition-colors flex items-center gap-1">
          <GraduationCap className="h-3.5 w-3.5" />
          Vivacity Academy
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Governance Person</span>
      </nav>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-6 w-6" style={{ color: ACCENT }} />
          <h1 className="text-2xl font-bold text-foreground">Governance Person</h1>
        </div>
        <p className="text-muted-foreground">Board obligations, strategic governance, financial management, and business leadership for RTO Governing Persons</p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
              activeFilter === cat ? "border-b-2" : "text-muted-foreground hover:text-foreground"
            )}
            style={activeFilter === cat ? { color: ACCENT, borderColor: ACCENT } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((course) => (
          <CourseCard key={course.id} course={course} accentColor={ACCENT} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No courses in this category yet.</div>
      )}

      <div className="space-y-3 pt-4">
        <h2 className="text-lg font-semibold text-foreground">Governance Toolkit</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {resources.map((title) => (
            <Card key={title} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="py-4 px-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${ACCENT}15` }}>
                  <FileText className="h-4 w-4" style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{title}</p>
                </div>
                <span className="text-xs font-medium flex items-center gap-0.5 flex-shrink-0" style={{ color: ACCENT }}>
                  View <ArrowRight className="h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
