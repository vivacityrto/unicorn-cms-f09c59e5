import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import TeamInboxPage from "@/pages/TeamInboxPage";
import MyNotificationsPage from "@/pages/MyNotificationsPage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TeamInboxWrapper() {
  return (
    <DashboardLayout>
      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notifications">My Notifications</TabsTrigger>
          <TabsTrigger value="team-inbox">Team Inbox</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications">
          <MyNotificationsPage />
        </TabsContent>
        <TabsContent value="team-inbox">
          <TeamInboxPage />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
