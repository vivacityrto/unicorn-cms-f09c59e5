import { DashboardLayout } from "@/components/DashboardLayout";
import ManageEmails from "./ManageEmails";

export default function ManageEmailsWrapper() {
  return (
    <DashboardLayout>
      <ManageEmails />
    </DashboardLayout>
  );
}