import { PdpProgressCard } from "@/components/academy/pdp/PdpProgressCard";
import { EvidenceByTypeChart } from "./EvidenceByTypeChart";
import { CurrencySplitChart } from "./CurrencySplitChart";
import type {
  PdpCycleSummary,
  PdpEvidenceItem,
  PdpUserCurrency,
} from "@/features/pdp/types";

interface Props {
  summary: PdpCycleSummary | null | undefined;
  currency: PdpUserCurrency | null | undefined;
  evidence: PdpEvidenceItem[];
  isLoading: boolean;
}

export function OverviewTab({ summary, currency, evidence, isLoading }: Props) {
  return (
    <div className="space-y-4">
      <PdpProgressCard summary={summary} currency={currency} isLoading={isLoading} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EvidenceByTypeChart evidence={evidence} />
        </div>
        <CurrencySplitChart summary={summary} />
      </div>
    </div>
  );
}
