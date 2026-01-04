import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import MembershipDashboard from "./MembershipDashboard";

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = profile?.unicorn_role === "Super Admin";
  const isTeamLeader = profile?.unicorn_role === "Team Leader";
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  // Redirect Admin/User roles to their tenant detail page
  useEffect(() => {
    if (isAdminOrUser && profile?.tenant_id) {
      navigate(`/tenant/${profile.tenant_id}`, { replace: true });
    }
  }, [isAdminOrUser, profile?.tenant_id, navigate]);

  // Show Membership Dashboard for Super Admin and Team Leader
  if (isSuperAdmin || isTeamLeader) {
    return (
      <DashboardLayout>
        <MembershipDashboard />
      </DashboardLayout>
    );
  }

  // Admin/User - show loading while redirecting to tenant detail page
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
