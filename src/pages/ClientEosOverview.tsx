import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import { Target, AlertCircle, Megaphone, FileText } from 'lucide-react';
import { ClientRocksList } from '@/components/eos/client/ClientRocksList';
import { ClientIssuesList } from '@/components/eos/client/ClientIssuesList';
import { ClientHeadlinesList } from '@/components/eos/client/ClientHeadlinesList';
import { ClientSummariesList } from '@/components/eos/client/ClientSummariesList';
import { useState } from 'react';
import { StatCardSkeleton } from '@/components/ui/loading-skeleton';
import type { UserProfile } from '@/types/eos';

export default function ClientEosOverview() {
  return (
    <DashboardLayout>
      <ClientEosContent />
    </DashboardLayout>
  );
}

function ClientEosContent() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('rocks');
  const clientId = (profile as UserProfile)?.client_id;

  const { data: overview, isLoading } = useQuery({
    queryKey: ['client-eos-overview', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase.rpc('get_client_eos_overview', {
        p_client_id: clientId,
      });
      
      if (error) throw error;
      return data as any;
    },
    enabled: !!clientId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your EOS Overview"
        description="View your company's progress on rocks, issues, and meeting outcomes"
        icon={Target}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Active Rocks"
              value={overview?.rocks?.active ?? 0}
              icon={Target}
              intent="info"
            />
            <StatCard
              label="Completed Rocks"
              value={overview?.rocks?.complete ?? 0}
              icon={Target}
              intent="success"
            />
            <StatCard
              label="Open Issues"
              value={overview?.issues?.open ?? 0}
              icon={AlertCircle}
              intent="danger"
            />
            <StatCard
              label="Solved Issues"
              value={overview?.issues?.solved ?? 0}
              icon={AlertCircle}
              intent="success"
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <AnimatedTabs
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          {
            value: 'rocks',
            label: 'Rocks',
            icon: <Target className="h-4 w-4" />,
            content: <ClientRocksList />,
          },
          {
            value: 'issues',
            label: 'Issues',
            icon: <AlertCircle className="h-4 w-4" />,
            content: <ClientIssuesList />,
          },
          {
            value: 'headlines',
            label: 'Headlines',
            icon: <Megaphone className="h-4 w-4" />,
            content: <ClientHeadlinesList />,
          },
          {
            value: 'summaries',
            label: 'Meeting Summaries',
            icon: <FileText className="h-4 w-4" />,
            content: <ClientSummariesList />,
          },
        ]}
      />
    </div>
  );
}
