import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAcademyCourses, useCreateCourse } from "@/hooks/academy/useAdminAcademyCourses";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, GraduationCap, BookOpen, Video, Award, Clock,
} from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export default function AcademyBuilderLibrary() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: courses = [], isLoading } = useAdminAcademyCourses({
    status: statusFilter,
    search: search || undefined,
  });

  const createCourse = useCreateCourse();

  const handleCreateCourse = async () => {
    if (!newTitle.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    let slug = generateSlug(newTitle);
    // Check uniqueness
    const { data: existing } = await supabase
      .from("academy_courses")
      .select("slug")
      .ilike("slug", `${slug}%`);
    if (existing && existing.length > 0) {
      const existingSlugs = new Set(existing.map((r: any) => r.slug));
      let i = 2;
      while (existingSlugs.has(slug)) {
        slug = `${generateSlug(newTitle)}-${i}`;
        i++;
      }
    }
    createCourse.mutate(
      { title: newTitle.trim(), slug, status: "draft", created_by: user?.id } as any,
      {
        onSuccess: (row: any) => {
          setNewCourseOpen(false);
          setNewTitle("");
          navigate(`/superadmin/academy/builder/${row.id}`);
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6" style={{ color: "#7130A0" }} />
            Academy Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage training courses for Vivacity Academy</p>
        </div>
        <Button onClick={() => setNewCourseOpen(true)} className="text-white hover:opacity-90" style={{ backgroundColor: "#23c0dd" }}>
          <Plus className="h-4 w-4 mr-2" /> New Course
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Course Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No courses found</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first course to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Card
              key={course.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderLeft: "4px solid #7130A0" }}
              onClick={() => navigate(`/superadmin/academy/builder/${course.id}`)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">{course.title}</h3>
                  <Badge className={`text-[10px] shrink-0 ml-2 ${statusColors[course.status ?? "draft"]}`}>
                    {course.status ?? "draft"}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> {course.module_count} modules
                  </span>
                  <span className="flex items-center gap-1">
                    <Video className="h-3.5 w-3.5" /> {course.lesson_count} lessons
                  </span>
                  {course.certificate_enabled && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Award className="h-3.5 w-3.5" /> Certificate
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{course.difficulty_level ?? "beginner"}</span>
                  {course.estimated_minutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {course.estimated_minutes}m
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Course Dialog */}
      <Dialog open={newCourseOpen} onOpenChange={setNewCourseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Course Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. RTO Compliance Fundamentals"
                className="mt-1"
                onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCourseOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateCourse}
              disabled={!newTitle.trim() || createCourse.isPending}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: "#23c0dd" }}
            >
              {createCourse.isPending ? "Creating…" : "Create Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
