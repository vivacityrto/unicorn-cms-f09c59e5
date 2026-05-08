import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

const AcademyCommunity = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Community</h1>
          <p className="text-muted-foreground">
            Connect with fellow learners and industry professionals
          </p>
        </div>

        <Card>
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-base font-medium text-foreground">
              Community module coming soon
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {/* TODO: wire to discussions / community data source */}
              We're building out community discussions. Check back shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    </AcademyLayout>
  );
};

export default AcademyCommunity;
