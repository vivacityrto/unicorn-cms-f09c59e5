import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AcademyStatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  loading?: boolean;
}

export default function AcademyStatCard({ label, value, icon, trend, loading }: AcademyStatCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          {loading ? (
            <>
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
              {trend && <p className="text-xs text-green-600 mt-0.5">{trend}</p>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
