import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Play } from "lucide-react";

const courses = [
  {
    id: 1,
    title: "RTO Compliance Fundamentals",
    description: "Learn the essential requirements for RTO compliance under ASQA standards.",
    duration: "8 hours",
    modules: 8,
    progress: 45,
    status: "in_progress",
  },
  {
    id: 2,
    title: "Quality Assurance Best Practices",
    description: "Master quality assurance processes for training and assessment.",
    duration: "6 hours",
    modules: 6,
    progress: 20,
    status: "in_progress",
  },
  {
    id: 3,
    title: "Student Management Essentials",
    description: "Effective strategies for managing student records and progression.",
    duration: "4 hours",
    modules: 4,
    progress: 100,
    status: "completed",
  },
  {
    id: 4,
    title: "Audit Preparation Masterclass",
    description: "Prepare your RTO for successful regulatory audits.",
    duration: "5 hours",
    modules: 5,
    progress: 0,
    status: "not_started",
  },
];

const AcademyCourses = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Courses</h1>
          <p className="text-muted-foreground">Browse and continue your enrolled courses</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => (
            <Card key={course.id} className="overflow-hidden">
              <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <BookOpen className="h-12 w-12 text-primary/50" />
              </div>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  <Badge
                    variant={
                      course.status === "completed"
                        ? "default"
                        : course.status === "in_progress"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {course.status === "completed"
                      ? "Completed"
                      : course.status === "in_progress"
                      ? "In Progress"
                      : "Not Started"}
                  </Badge>
                </div>
                <CardDescription>{course.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {course.duration}
                  </span>
                  <span>{course.modules} modules</span>
                </div>

                {course.progress > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  variant={course.status === "completed" ? "outline" : "default"}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {course.status === "completed"
                    ? "Review Course"
                    : course.status === "in_progress"
                    ? "Continue"
                    : "Start Course"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AcademyLayout>
  );
};

export default AcademyCourses;
