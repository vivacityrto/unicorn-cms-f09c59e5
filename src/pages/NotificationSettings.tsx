import { PageHeader } from '@/components/ui/page-header';
import { Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamsIntegrationCard } from '@/components/notifications/TeamsIntegrationCard';
import { NotificationRulesCard } from '@/components/notifications/NotificationRulesCard';
import { QuietHoursCard } from '@/components/notifications/QuietHoursCard';
import { RecentNotificationsCard } from '@/components/notifications/RecentNotificationsCard';
import { NotificationPreferenceMatrix } from '@/components/notifications/NotificationPreferenceMatrix';
import { ClientNotificationOverridesCard } from '@/components/notifications/ClientNotificationOverridesCard';
import { NotificationDelegatesCard } from '@/components/notifications/NotificationDelegatesCard';

export default function NotificationSettings() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Settings"
        description="Choose what you are notified about, for which clients, and how"
        icon={Bell}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What you hear about</CardTitle>
              <CardDescription>
                You are told about your own clients, and the clients of people you assist. Changes save as you click.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPreferenceMatrix />
            </CardContent>
          </Card>
          <ClientNotificationOverridesCard />
          <TeamsIntegrationCard />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <NotificationDelegatesCard />
          <QuietHoursCard />
          <NotificationRulesCard />
          <RecentNotificationsCard />
        </div>
      </div>
    </div>
  );
}
