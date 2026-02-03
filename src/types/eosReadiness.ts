// EOS Readiness Types

export type EosReadinessState = 
  | 'not_started'    // EOS visible, nothing configured
  | 'in_progress'    // Core artefacts partially set
  | 'operational'    // Weekly cadence running
  | 'disciplined'    // Quarterly rhythm established
  | 'mature';        // EOS fully embedded

export const READINESS_STATE_LABELS: Record<EosReadinessState, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  operational: 'Operational',
  disciplined: 'Disciplined',
  mature: 'Mature',
};

export const READINESS_STATE_DESCRIPTIONS: Record<EosReadinessState, string> = {
  not_started: 'EOS is visible but nothing has been configured yet.',
  in_progress: 'Core artefacts are partially set up.',
  operational: 'Weekly cadence is running with regular L10 meetings.',
  disciplined: 'Quarterly rhythm is established with planning cycles.',
  mature: 'EOS is fully embedded with consistent execution.',
};

export const READINESS_STATE_COLORS: Record<EosReadinessState, { bg: string; text: string; border: string }> = {
  not_started: { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-muted' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  operational: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  disciplined: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  mature: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' },
};

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  description: string;
  isComplete: boolean;
  incompleteReason?: string;
  category: 'foundation' | 'vision' | 'execution' | 'weekly' | 'quarterly' | 'people';
}

export interface OnboardingCategory {
  id: 'foundation' | 'vision' | 'execution' | 'weekly' | 'quarterly' | 'people';
  title: string;
  description: string;
  items: OnboardingChecklistItem[];
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
}

export interface EosReadinessData {
  state: EosReadinessState;
  stateLabel: string;
  stateDescription: string;
  categories: OnboardingCategory[];
  overallProgress: number; // 0-100
  completedItems: number;
  totalItems: number;
}
