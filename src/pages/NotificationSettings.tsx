import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Bell } from 'lucide-react';
import { TeamsIntegrationCard } from '@/components/notifications/TeamsIntegrationCard';
import { NotificationRulesCard } from '@/components/notifications/NotificationRulesCard';
import { QuietHoursCard } from '@/components/notifications/QuietHoursCard';
import { RecentNotificationsCard } from '@/components/notifications/RecentNotificationsCard';

export default function NotificationSettings() {
  return (
    <DashboardLayout>
      <NotificationSettingsContent />
    </DashboardLayout>
  );
}

function NotificationSettingsContent() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Settings"
        description="Manage how you receive notifications and reminders"
        icon={Bell}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <TeamsIntegrationCard />
          <NotificationRulesCard />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <QuietHoursCard />
          <RecentNotificationsCard />
        </div>
      </div>
    </div>
  );
}
