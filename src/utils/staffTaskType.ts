import { Mail, Settings, Briefcase, CircleDot, type LucideIcon } from 'lucide-react';

export type StaffTaskType = 'email' | 'admin' | 'om' | 'general';

export interface ParsedTaskType {
  type: StaffTaskType;
  cleanName: string;
}

export interface TaskAction {
  label: string;
  icon: LucideIcon;
  key: string;
}

const PREFIX_MAP: Record<string, StaffTaskType> = {
  'EMAIL:': 'email',
  'ADMIN:': 'admin',
  'OM:': 'om',
};

export function parseTaskType(name: string): ParsedTaskType {
  for (const [prefix, type] of Object.entries(PREFIX_MAP)) {
    if (name.toUpperCase().startsWith(prefix)) {
      return {
        type,
        cleanName: name.slice(prefix.length).trim(),
      };
    }
  }
  return { type: 'general', cleanName: name };
}

export function getTaskTypeIcon(type: StaffTaskType): LucideIcon {
  switch (type) {
    case 'email': return Mail;
    case 'admin': return Settings;
    case 'om': return Briefcase;
    default: return CircleDot;
  }
}

export function getTaskTypeBadgeLabel(type: StaffTaskType): string | null {
  switch (type) {
    case 'email': return 'EMAIL';
    case 'admin': return 'ADMIN';
    case 'om': return 'OM';
    default: return null;
  }
}

export function getTaskTypeBadgeClasses(type: StaffTaskType): string {
  switch (type) {
    case 'email':
      return 'border-primary/40 bg-primary/10 text-primary';
    case 'admin':
      return 'border-brand-aqua-500/40 bg-brand-aqua-50 text-brand-aqua-800';
    case 'om':
      return 'border-brand-macaron-600/40 bg-brand-macaron-50 text-brand-macaron-800';
    default:
      return '';
  }
}

export function getActionsForType(type: StaffTaskType): TaskAction[] {
  const common: TaskAction[] = [
    { label: 'Mark Complete', icon: CircleDot, key: 'mark_complete' },
  ];

  switch (type) {
    case 'email':
      return [
        { label: 'Send Email', icon: Mail, key: 'send_email' },
        { label: 'Preview Email', icon: Mail, key: 'preview_email' },
        { label: 'Mark as Sent', icon: Mail, key: 'mark_sent' },
        ...common,
      ];
    case 'admin':
      return [
        { label: 'Open Procedure', icon: Settings, key: 'open_procedure' },
        { label: 'Create Folder', icon: Settings, key: 'create_folder' },
        { label: 'Mark Done', icon: Settings, key: 'mark_done' },
        ...common,
      ];
    case 'om':
      return [
        { label: 'Notify CEO', icon: Briefcase, key: 'notify_ceo' },
        { label: 'Assign CSC', icon: Briefcase, key: 'assign_csc' },
        { label: 'Mark Done', icon: Briefcase, key: 'mark_done' },
        ...common,
      ];
    default:
      return common;
  }
}
