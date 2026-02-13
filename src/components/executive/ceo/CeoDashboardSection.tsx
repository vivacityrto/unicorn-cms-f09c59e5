/**
 * CeoDashboardSection – Unicorn 2.0
 * 
 * CEO Executive panels rendered as a section within the Executive Dashboard.
 * Provides operational visibility across 9 domains.
 */

import { useAuth } from '@/hooks/useAuth';
import {
  useRockStats,
  useTodoStats,
  useCeoReliefIndex,
  useUnicornIntegrity,
  useFinancialControls,
  useRiskCapacity,
  useDiamondCommitments,
  useCeoDecisionQueue,
  useCeoKpiScore,
} from '@/hooks/useCeoDashboard';
import { TractionStatusPanel } from './TractionStatusPanel';
import { EosDisciplinePanel } from './EosDisciplinePanel';
import { CeoReliefPanel } from './CeoReliefPanel';
import { UnicornIntegrityPanel } from './UnicornIntegrityPanel';
import { FinancialControlPanel } from './FinancialControlPanel';
import { RiskCapacityPanel } from './RiskCapacityPanel';
import { DiamondClientPanel } from './DiamondClientPanel';
import { DecisionQueuePanel } from './DecisionQueuePanel';
import { KpiScorePanel } from './KpiScorePanel';
import { Separator } from '@/components/ui/separator';

export function CeoDashboardSection() {
  const { profile } = useAuth();
  const ceoUserId = profile?.user_uuid;

  // Current quarter
  const now = new Date();
  const quarterNumber = Math.ceil((now.getMonth() + 1) / 3);
  const quarterYear = now.getFullYear();

  // Hooks
  const { data: rockStats, isLoading: rocksLoading } = useRockStats(quarterYear, quarterNumber);
  const { data: todoStats, isLoading: todosLoading } = useTodoStats();
  const { data: reliefStats, isLoading: reliefLoading } = useCeoReliefIndex(ceoUserId);
  const { data: integrityStats, isLoading: integrityLoading } = useUnicornIntegrity();
  const { data: financialControls, isLoading: financialLoading } = useFinancialControls();
  const { data: riskStats, isLoading: riskLoading } = useRiskCapacity();
  const { data: diamondData, isLoading: diamondLoading } = useDiamondCommitments();
  const { data: decisionItems, isLoading: decisionLoading } = useCeoDecisionQueue();

  // KPI Score computed from other stats
  const kpiScore = useCeoKpiScore(rockStats, todoStats, integrityStats, reliefStats, financialControls);

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">CEO Executive View</h2>
        <span className="text-[10px] text-muted-foreground">Q{quarterNumber} {quarterYear}</span>
      </div>

      {/* Row 1: KPI Score (hero) + Traction + EOS Discipline */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <KpiScorePanel score={kpiScore} />
        <TractionStatusPanel stats={rockStats} isLoading={rocksLoading} />
        <EosDisciplinePanel stats={todoStats} isLoading={todosLoading} />
      </div>

      {/* Row 2: CEO Relief + Integrity + Risk */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <CeoReliefPanel stats={reliefStats} isLoading={reliefLoading} />
        <UnicornIntegrityPanel stats={integrityStats} isLoading={integrityLoading} />
        <RiskCapacityPanel stats={riskStats} isLoading={riskLoading} />
      </div>

      {/* Row 3: Financial + Diamond + Decision Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <FinancialControlPanel controls={financialControls} isLoading={financialLoading} />
        <DiamondClientPanel data={diamondData} isLoading={diamondLoading} />
        <DecisionQueuePanel items={decisionItems} isLoading={decisionLoading} />
      </div>
    </div>
  );
}
