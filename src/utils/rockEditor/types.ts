import type { RockLevel, RockMilestoneStatus } from '@/types/eos';

export type MilestonePriority = 'critical' | 'high' | 'medium' | 'low';

export interface EditorMilestone {
  id: string;
  title: string;
  /** Null means "same as the Rock's owner", which is what gets stored. */
  ownerId: string | null;
  /** Empty means "the Rock's due date". */
  dueDate: string;
  priority: MilestonePriority;
  exitCriteria: string;
  evidenceUrl: string;
  status: RockMilestoneStatus;
  /** Company milestones this one supports (Individual Rocks only). */
  supports: string[];
}

export interface RockEditorValues {
  level: RockLevel;
  parentId: string | null;
  functionId: string | null;
  ownerId: string | null;
  title: string;
  description: string;
  issue: string;
  outcome: string;
  quarterYear: number;
  quarterNumber: number;
  /** YYYY-MM-DD */
  dueDate: string;
  milestones: EditorMilestone[];
}

/** A Rock that could be chosen as a parent, with just what the rules need. */
export interface ParentCandidate {
  id: string;
  title: string;
  level: RockLevel;
  quarterYear: number;
  quarterNumber: number;
  ownerId: string | null;
  archived: boolean;
  parentId: string | null;
}

export interface ValidationResult {
  /** Blocks saving. Keys: level, parent, function, owner, title, dueDate, quarter, `milestone:<id>`. */
  errors: Record<string, string>;
  /** Worth a look, never blocks. Keys: dueDate, `milestone:<id>:link`. */
  warnings: Record<string, string>;
}
