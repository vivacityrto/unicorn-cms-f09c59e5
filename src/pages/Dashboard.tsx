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
  const isTeamMember = profile?.unicorn_role === "Team Member";
  const isAdminOrUser = profile?.unicorn_role === "Admin" || profile?.unicorn_role === "User";

  // Redirect client roles to the isolated client portal
  useEffect(() => {
    if (isAdminOrUser) {
      navigate("/client/home", { replace: true });
    }
  }, [isAdminOrUser, navigate]);

  // Show Membership Dashboard for Vivacity team
  if (isSuperAdmin || isTeamLeader || isTeamMember) {
    return (
      <DashboardLayout>
        <MembershipDashboard />
      </DashboardLayout>
    );
  }

  // Fallback loading while redirecting
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
