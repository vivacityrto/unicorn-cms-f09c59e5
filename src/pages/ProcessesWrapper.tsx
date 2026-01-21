import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardLayout } from '@/components/DashboardLayout';

const Processes = lazy(() => import('./Processes'));

export default function ProcessesWrapper() {
  return (
    <Suspense 
      fallback={
        <DashboardLayout>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-24 w-full" />
            <div className="flex gap-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </DashboardLayout>
      }
    >
      <Processes />
    </Suspense>
  );
}
