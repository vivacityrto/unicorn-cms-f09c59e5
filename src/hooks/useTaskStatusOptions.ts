import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Circle,
  Clock,
  CheckCircle2,
  Ban,
  ShieldCheck,
  AlertCircle,
  Eye,
  type LucideIcon,
} from 'lucide-react';

export interface TaskStatusOption {
  code: number;
  value: string;
  label: string;
}

// UI metadata keyed by status code — single source of truth for icons and colours.
// dd_status doesn't store presentation data, so we keep it here.
const ICON_MAP: Record<number, LucideIcon> = {
  0: Circle,
  1: Clock,
  2: CheckCircle2,
  3: Ban,
  4: ShieldCheck,
  5: AlertCircle,
};

const COLOR_MAP: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-blue-600',
  2: 'text-green-600',
  3: 'text-muted-foreground',
  4: 'text-emerald-500',
  5: 'text-red-600',
};

const DEFAULT_ICON = Circle;
const DEFAULT_COLOR = 'text-muted-foreground';

// Module-level cache so multiple hook consumers share one fetch
let cachedStatuses: TaskStatusOption[] | null = null;
let fetchPromise: Promise<TaskStatusOption[]> | null = null;

async function loadStatuses(): Promise<TaskStatusOption[]> {
  if (cachedStatuses) return cachedStatuses;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_status')
      .select('code, value, description, seq')
      .lt('code', 100)
      .order('seq')
      .order('value');

    if (error) {
      console.error('Failed to load dd_status:', error);
      fetchPromise = null;
      return [];
    }

    cachedStatuses = (data || []).map((row) => ({
      code: row.code,
      value: row.value,
      label: row.description,
    }));

    return cachedStatuses;
  })();

  return fetchPromise;
}

export function useTaskStatusOptions() {
  const [statuses, setStatuses] = useState<TaskStatusOption[]>(cachedStatuses || []);
  const [loading, setLoading] = useState(!cachedStatuses);

  useEffect(() => {
    let mounted = true;
    loadStatuses().then((result) => {
      if (mounted) {
        setStatuses(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { statuses, loading };
}

/** Get a human-readable label for a status code */
export function getStatusLabel(code: number, statuses?: TaskStatusOption[]): string {
  if (statuses) {
    const found = statuses.find((s) => s.code === code);
    if (found) return found.label;
  }
  return `Status ${code}`;
}

/** Get the icon component for a status code */
export function getStatusIcon(code: number): LucideIcon {
  return ICON_MAP[code] ?? DEFAULT_ICON;
}

/** Get the Tailwind colour class for a status code */
export function getStatusColor(code: number): string {
  return COLOR_MAP[code] ?? DEFAULT_COLOR;
}
