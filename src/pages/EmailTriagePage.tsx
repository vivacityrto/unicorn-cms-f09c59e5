import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { TriageQueueTab } from "@/components/email-triage/TriageQueueTab";
import { AllTicketsTab } from "@/components/email-triage/AllTicketsTab";
import { MyTicketsTab } from "@/components/email-triage/MyTicketsTab";

export default function EmailTriagePage() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("email_tickets_triage")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_tickets" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["email-tickets"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email Triage</h1>
        <p className="text-sm text-muted-foreground">
          Triage incoming emails, assign owners, and track SLA status.
        </p>
      </div>

      <Tabs defaultValue="triage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="triage">Triage Queue</TabsTrigger>
          <TabsTrigger value="all">All Tickets</TabsTrigger>
          <TabsTrigger value="mine">My Tickets</TabsTrigger>
        </TabsList>
        <TabsContent value="triage">
          <TriageQueueTab />
        </TabsContent>
        <TabsContent value="all">
          <AllTicketsTab />
        </TabsContent>
        <TabsContent value="mine">
          <MyTicketsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
