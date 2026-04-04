import { useState } from "react";
import { ShieldCheck, FileText, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CourseCardLegacy as CourseCard, type CourseCardData } from "@/components/academy/CourseCard";
import { Card, CardContent } from "@/components/ui/card";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";

const ACCENT = "#ed1878";

const categories = ["All", "SRTO 2025", "Audit Preparation", "Quality Assurance", "CRICOS", "Self-Assessment"];

const courses: CourseCardData[] = [
  { id: "cm1", title: "Standards for RTOs 2025 — Full Implementation Guide", description: "End-to-end guide to understanding and implementing the Standards for RTOs 2025 across your organisation.", category: "SRTO 2025", duration: "6.5h", lessons: 13, totalLessons: 18, difficulty: "Intermediate", status: "In Progress", progress: 72 },
  { id: "cm2", title: "Preparing for an ASQA Audit — Practical Strategies", description: "Practical strategies and checklists to prepare your RTO for a successful ASQA regulatory audit.", category: "Audit Preparation", duration: "5h", lessons: 0, totalLessons: 15, difficulty: "Advanced", status: "Not Started" },
  { id: "cm3", title: "Continuous Improvement Frameworks for RTOs", description: "Build and maintain a continuous improvement culture with practical frameworks for VET providers.", category: "Quality Assurance", duration: "3.5h", lessons: 11, totalLessons: 11, difficulty: "Intermediate", status: "Completed" },
  { id: "cm4", title: "CRICOS Registration and Ongoing Compliance", description: "Navigate CRICOS registration requirements and maintain ongoing compliance for international students.", category: "CRICOS", duration: "4h", lessons: 0, totalLessons: 12, difficulty: "Intermediate", status: "Not Started" },
  { id: "cm5", title: "Self-Assessment and Evidence Collection", description: "Learn to conduct effective self-assessments and collect robust evidence for compliance demonstration.", category: "Self-Assessment", duration: "2.5h", lessons: 0, totalLessons: 8, difficulty: "Beginner", status: "Not Started" },
  { id: "cm6", title: "RTO Compliance Fundamentals", description: "Foundation course covering the key compliance obligations every RTO must understand.", category: "SRTO 2025", duration: "2.5h", lessons: 9, totalLessons: 9, difficulty: "Beginner", status: "Completed" },
  { id: "cm7", title: "Third-Party Arrangements — Compliance and Oversight", description: "Manage third-party arrangements with proper governance, contracts, and quality oversight.", category: "Quality Assurance", duration: "2h", lessons: 0, totalLessons: 7, difficulty: "Intermediate", status: "Not Started" },
  { id: "cm8", title: "Student Support Services and Wellbeing Compliance", description: "Ensure your student support services meet regulatory requirements and promote learner wellbeing.", category: "SRTO 2025", duration: "1.5h", lessons: 0, totalLessons: 6, difficulty: "Beginner", status: "Not Started" },
];

const resources = [
  "SRTO 2025 Quick Reference Checklist",
  "ASQA Evidence Matrix Template",
  "RTO Self-Assessment Workbook",
];

export default function ComplianceManagerPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const filtered = activeFilter === "All" ? courses : courses.filter((c) => c.category === activeFilter);

  return (
    <AcademyPageWrapper
      title="Compliance Manager"
      subtitle="Standards, audits, quality assurance, and regulatory compliance training"
      icon={<ShieldCheck className="h-6 w-6" />}
      accentColour={ACCENT}
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
              activeFilter === cat
                ? "border-b-2"
                : "text-muted-foreground hover:text-foreground"
            )}
            style={activeFilter === cat ? { color: ACCENT, borderColor: ACCENT } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Course grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((course) => (
          <CourseCard key={course.id} course={course} accentColor={ACCENT} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No courses in this category yet.</div>
      )}

      {/* Compliance Resources */}
      <div className="space-y-3 pt-4">
        <h2 className="text-lg font-semibold text-foreground">Compliance Resources</h2>
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
    </AcademyPageWrapper>
  );
}
