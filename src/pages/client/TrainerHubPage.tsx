import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, GraduationCap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CourseCardLegacy as CourseCard, type CourseCardData } from "@/components/academy/CourseCard";

const categories = ["All", "TAE Training", "Assessor Skills", "Industry Currency", "Wellbeing", "New Releases"];

const courses: CourseCardData[] = [
  {
    id: "1",
    title: "Certificate IV in Training and Assessment (TAE40122)",
    description: "Comprehensive qualification covering training design, delivery, and assessment in vocational education.",
    category: "TAE Training",
    duration: "12h",
    lessons: 14,
    totalLessons: 32,
    difficulty: "Intermediate",
    status: "In Progress",
    progress: 45,
  },
  {
    id: "2",
    title: "Assessment Design and Validation",
    description: "Learn to design, develop, and validate assessment tools that meet compliance requirements.",
    category: "Assessor Skills",
    duration: "4.5h",
    lessons: 0,
    totalLessons: 14,
    difficulty: "Beginner",
    status: "Not Started",
  },
  {
    id: "3",
    title: "Industry Currency — Maintaining Vocational Competency",
    description: "Strategies for maintaining current industry skills and meeting vocational competency requirements.",
    category: "Industry Currency",
    duration: "2h",
    lessons: 8,
    totalLessons: 8,
    difficulty: "Beginner",
    status: "Completed",
  },
  {
    id: "4",
    title: "Designing Learning Programs for Adult Learners",
    description: "Principles and practices for creating effective learning programs tailored to adult learners in VET.",
    category: "Assessor Skills",
    duration: "3h",
    lessons: 0,
    totalLessons: 10,
    difficulty: "Intermediate",
    status: "Not Started",
  },
  {
    id: "5",
    title: "Using Digital Tools for Training Delivery",
    description: "Explore digital platforms and tools to enhance online and blended training delivery.",
    category: "TAE Training",
    duration: "2.5h",
    lessons: 6,
    totalLessons: 9,
    difficulty: "Beginner",
    status: "In Progress",
    progress: 70,
  },
  {
    id: "6",
    title: "Trainer Wellbeing and Resilience in VET",
    description: "Build personal resilience and manage wellbeing as a trainer in the vocational education sector.",
    category: "Wellbeing",
    duration: "1.5h",
    lessons: 0,
    totalLessons: 6,
    difficulty: "Beginner",
    status: "Not Started",
  },
];

export default function TrainerHubPage() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filtered =
    activeFilter === "All"
      ? courses
      : courses.filter((c) => c.category === activeFilter);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/academy" className="hover:text-foreground transition-colors flex items-center gap-1">
          <GraduationCap className="h-3.5 w-3.5" />
          Vivacity Academy
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Trainer Hub</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-6 w-6" style={{ color: "#23c0dd" }} />
          <h1 className="text-2xl font-bold text-foreground">Trainer Hub</h1>
        </div>
        <p className="text-muted-foreground">
          Professional development for trainers and assessors in the VET sector
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors",
              activeFilter === cat
                ? "text-[#23c0dd] border-b-2 border-[#23c0dd]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Course grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No courses in this category yet.
        </div>
      )}
    </div>
  );
}
