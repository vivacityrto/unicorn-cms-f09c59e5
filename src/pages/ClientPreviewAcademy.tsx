import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { Loader2, BookOpen, Award, Calendar, Users, Play, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/**
 * Academy Preview - Shows the Vivacity Academy experience as the client sees it
 */
const ClientPreviewAcademy = () => {
  const navigate = useNavigate();
  const { isPreviewMode, previewTenant, loading } = useClientPreview();

  // Redirect if not in preview mode
  useEffect(() => {
    if (!loading && !isPreviewMode) {
      navigate("/dashboard");
    }
  }, [isPreviewMode, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPreviewMode || !previewTenant) {
    return null;
  }

  // Mock course data for preview
  const mockCourses = [
    { id: 1, title: "RTO Compliance Fundamentals", progress: 75, duration: "2h 30m", status: "in_progress" },
    { id: 2, title: "Standards for RTOs 2025", progress: 100, duration: "3h 15m", status: "completed" },
    { id: 3, title: "Assessment Validation", progress: 0, duration: "1h 45m", status: "not_started" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation Banner */}
      <ImpersonationBanner />

      {/* Add top padding to account for banner */}
      <div className="pt-12">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Vivacity Academy</h1>
            </div>
            <p className="text-muted-foreground">
              Preview of the Academy experience for {previewTenant.name}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">Available courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  In Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">3</div>
                <p className="text-xs text-muted-foreground">Active courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Certificates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">5</div>
                <p className="text-xs text-muted-foreground">Earned certificates</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2</div>
                <p className="text-xs text-muted-foreground">Upcoming events</p>
              </CardContent>
            </Card>
          </div>

          {/* Courses Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                My Courses
              </CardTitle>
              <CardDescription>
                Continue learning from where you left off
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockCourses.map((course) => (
                <div
                  key={course.id}
                  className="p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{course.title}</h3>
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
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {course.duration}
                        </span>
                        <span>{course.progress}% complete</span>
                      </div>
                      <Progress value={course.progress} className="h-2" />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Team Section (if applicable) */}
          {previewTenant.tenant_type !== "academy_solo" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Progress
                </CardTitle>
                <CardDescription>
                  Track your team's learning progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Team progress would appear here in the actual Academy</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientPreviewAcademy;
