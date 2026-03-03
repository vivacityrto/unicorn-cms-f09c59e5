export interface InboxItem {
  inbox_id: string;
  tenant_id: number;
  user_id: string | null;
  item_type: 'message' | 'task' | 'announcement' | 'rock';
  item_source: string;
  source_id: string;
  title: string;
  preview: string | null;
  status: string | null;
  due_at: string | null;
  priority: number | null;
  unread: boolean;
  action_required: boolean;
  related_entity: string | null;
  related_entity_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InboxFilterType = 'all' | 'message' | 'task' | 'announcement' | 'rock';
