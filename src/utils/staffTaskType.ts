import { Mail, Settings, Briefcase, CircleDot, Send, Users, type LucideIcon } from 'lucide-react';

export type StaffTaskType = string;

export interface ParsedTaskType {
  type: StaffTaskType;
  cleanName: string;
}

export interface TaskAction {
  label: string;
  icon: LucideIcon;
  key: string;
}

/**
 * Detects any UPPERCASE: prefix at the start of a task name.
 * Returns the lowercase type and the clean name without the prefix.
 */
export function parseTaskType(name: string): ParsedTaskType {
  const match = name.match(/^([A-Z]+):\s*/);
  if (match) {
    return {
      type: match[1].toLowerCase(),
      cleanName: name.slice(match[0].length).trim(),
    };
  }
  return { type: 'general', cleanName: name };
}

export function getTaskTypeIcon(type: StaffTaskType): LucideIcon {
  switch (type) {
    case 'email': return Mail;
    case 'admin': return Settings;
    case 'om': return Briefcase;
    case 'csc': return Users;
    case 'post': return Send;
    default: return CircleDot;
  }
}

export function getTaskTypeBadgeLabel(type: StaffTaskType): string | null {
  if (type === 'general') return null;
  return type.toUpperCase();
}

export function getTaskTypeBadgeClasses(type: StaffTaskType): string {
  switch (type) {
    case 'email':
      return 'border-primary/40 bg-primary/10 text-primary';
    case 'admin':
      return 'border-brand-aqua-500/40 bg-brand-aqua-50 text-brand-aqua-800';
    case 'om':
      return 'border-brand-macaron-600/40 bg-brand-macaron-50 text-brand-macaron-800';
    case 'csc':
      return 'border-emerald-500/40 bg-emerald-50 text-emerald-800';
    case 'post':
      return 'border-orange-500/40 bg-orange-50 text-orange-800';
    default:
      // Unknown prefix — neutral grey badge
      return 'border-muted-foreground/30 bg-muted text-muted-foreground';
  }
}

export function getActionsForType(type: StaffTaskType): TaskAction[] {
  if (type === 'email') {
    return [
      { label: 'Send Internal CSC', icon: Users, key: 'send_internal_csc' },
      { label: 'Send External Primary', icon: Send, key: 'send_external_primary' },
    ];
  }

  // All other types (including unknown prefixes) just get Mark Complete
  return [
    { label: 'Mark Complete', icon: CircleDot, key: 'mark_complete' },
  ];
}
