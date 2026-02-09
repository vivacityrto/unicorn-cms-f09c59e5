import { useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { ImpersonationBanner } from "@/components/client/ImpersonationBanner";
import { Loader2, FileText, BookOpen, Users, Calendar, Bell, LayoutDashboard, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const clientNavItems = [
  { icon: LayoutDashboard, label: "Home", path: "/client-preview" },
  { icon: FileText, label: "Documents", path: "/manage-documents" },
  { icon: Calendar, label: "Calendar", path: "/client/calendar" },
  { icon: Bell, label: "Notifications", path: "/client/notifications" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];

const ClientPreview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPreviewMode, previewTenant, loading } = useClientPreview();

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

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />

      <div className="pt-12">
        {/* Client portal nav */}
        <nav className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-6 flex items-center gap-1 overflow-x-auto">
            {clientNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Quick Links
                </CardTitle>
                <CardDescription>
                  Helpful resources and support
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link to="/client/calendar" className="block p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Calendar</p>
                  <p className="text-sm text-muted-foreground">Events & reminders</p>
                </Link>
                <Link to="/client/notifications" className="block p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Notifications</p>
                  <p className="text-sm text-muted-foreground">Updates and alerts</p>
                </Link>
                <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                  <p className="font-medium">Contact Consultant</p>
                  <p className="text-sm text-muted-foreground">Get help from your consultant</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientPreview;
