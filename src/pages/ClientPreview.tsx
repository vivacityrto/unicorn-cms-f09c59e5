import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { Loader2 } from "lucide-react";

// Import client layouts
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BookOpen, Users, Calendar, HelpCircle, Bell } from "lucide-react";

/**
 * Client Portal Preview - Shows the compliance system client experience
 */
const ClientPreview = () => {
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

  // For compliance system, show a simplified client portal preview
  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation Banner */}
      <ImpersonationBanner />

      {/* Add top padding to account for banner */}
      <div className="pt-12">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Welcome to {previewTenant.name}</h1>
            <p className="text-muted-foreground">
              This is a preview of the client portal experience.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">--</div>
                <p className="text-xs text-muted-foreground">Available documents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">--</div>
                <p className="text-xs text-muted-foreground">Active courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Team Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">--</div>
                <p className="text-xs text-muted-foreground">Active users</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">--</div>
                <p className="text-xs text-muted-foreground">Unread</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Documents */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Documents
                </CardTitle>
                <CardDescription>
                  Latest compliance documents and resources
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Document list would appear here in the actual client portal</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Quick Links
                </CardTitle>
                <CardDescription>
                  Helpful resources and support
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Resource Hub</p>
                  <p className="text-sm text-muted-foreground">Access templates and guides</p>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Vivacity Academy</p>
                  <p className="text-sm text-muted-foreground">Training courses and certificates</p>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Contact Consultant</p>
                  <p className="text-sm text-muted-foreground">Get help from your consultant</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Events
              </CardTitle>
              <CardDescription>
                Scheduled training sessions and webinars
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Event calendar would appear here in the actual client portal</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ClientPreview;
