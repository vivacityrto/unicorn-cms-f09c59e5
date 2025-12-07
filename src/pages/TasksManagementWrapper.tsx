import { AppLayout } from "@/components/layout/AppLayout";
import TasksManagement from "./TasksManagement";

export default function TasksManagementWrapper() {
  return (
    <AppLayout>
      <TasksManagement />
    </AppLayout>
  );
}
