import { ClientLayout } from "@/components/layout/ClientLayout";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function ClientReportsWrapper() {
  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Reports</h1>
          <p className="text-muted-foreground mt-1">View your compliance and activity reports.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Reports will be available here.</p>
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
