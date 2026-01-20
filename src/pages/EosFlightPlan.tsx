import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useFlightPlan, useQuarterlyRocks } from '@/hooks/useFlightPlan';
import { useRBAC } from '@/hooks/useRBAC';
import { QuarterSelector } from '@/components/eos/flight-plan/QuarterSelector';
import { QuarterlyGoalSection } from '@/components/eos/flight-plan/QuarterlyGoalSection';
import { ScoreboardSection } from '@/components/eos/flight-plan/ScoreboardSection';
import { QuarterlyRocksSection } from '@/components/eos/flight-plan/QuarterlyRocksSection';
import { MonthlyFocusSection } from '@/components/eos/flight-plan/MonthlyFocusSection';
import { format } from 'date-fns';
import { getQuarterDueDate, QUARTER_LABELS } from '@/types/flightPlan';
import type { FlightPlan } from '@/types/flightPlan';

export default function EosFlightPlan() {
  return (
    <DashboardLayout>
      <FlightPlanContent />
    </DashboardLayout>
  );
}

function FlightPlanContent() {
  const currentDate = new Date();
  const currentQuarter = Math.ceil((currentDate.getMonth() + 1) / 3) as 1 | 2 | 3 | 4;
  const currentYear = currentDate.getFullYear();

  const [quarter, setQuarter] = useState<number>(currentQuarter);
  const [year, setYear] = useState<number>(currentYear);

  const { flightPlan, isLoading, upsertFlightPlan } = useFlightPlan(quarter, year);
  const { data: rocks, isLoading: rocksLoading } = useQuarterlyRocks(quarter, year);
  const { canEditVTO } = useRBAC(); // Reuse VTO permissions for flight plan

  const canEdit = canEditVTO();
  const dueDate = getQuarterDueDate(quarter, year);

  const handleSave = (updates: Partial<FlightPlan>) => {
    upsertFlightPlan.mutate(updates);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Flight Plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Rocket className="h-8 w-8 text-primary" />
            Superhero Flight Plan
          </h1>
          <p className="text-lg text-muted-foreground mt-1">Quarterly Rocks</p>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            This page defines the quarterly mission, success conditions, and execution priorities.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <QuarterSelector
            quarter={quarter}
            year={year}
            onQuarterChange={setQuarter}
            onYearChange={setYear}
          />
          <p className="text-sm text-muted-foreground">
            Due: {format(new Date(dueDate), 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Quarterly Goal (spans 2 cols on large screens) */}
        <div className="lg:col-span-2">
          <QuarterlyGoalSection
            flightPlan={flightPlan}
            canEdit={canEdit}
            onSave={handleSave}
            isSaving={upsertFlightPlan.isPending}
          />
        </div>

        {/* Right Column - Scoreboard */}
        <div>
          <ScoreboardSection
            flightPlan={flightPlan}
            canEdit={canEdit}
            onSave={handleSave}
            isSaving={upsertFlightPlan.isPending}
          />
        </div>
      </div>

      {/* Quarterly Rocks */}
      <QuarterlyRocksSection
        rocks={rocks}
        isLoading={rocksLoading}
        quarter={quarter}
        year={year}
      />

      {/* Monthly Focus */}
      <MonthlyFocusSection
        flightPlan={flightPlan}
        quarter={quarter}
        canEdit={canEdit}
        onSave={handleSave}
        isSaving={upsertFlightPlan.isPending}
      />
    </div>
  );
}
