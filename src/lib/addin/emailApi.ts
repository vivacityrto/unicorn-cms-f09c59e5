import { supabase } from '@/integrations/supabase/client';
import type { MailContext } from '@/lib/addin/types';

const SUPABASE_PROJECT_ID = 'yxkgdalkbrriasiyyrwk';
const FUNCTIONS_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

export interface CaptureEmailRequest {
  external_message_id: string;
  client_id: number;
  package_id?: number;
  task_id?: string;
  subject: string;
  sender_email: string;
  sender_name?: string;
  received_at: string;
  body_preview?: string;
  has_attachments?: boolean;
}

export interface CaptureEmailResponse {
  success: boolean;
  email_record: {
    id: string;
    subject: string;
    client_id: number;
    package_id?: number;
    task_id?: string;
    linked_at: string;
  };
  deep_link: string;
}

export interface CreateTaskRequest {
  external_message_id: string;
  client_id: number;
  title: string;
  assigned_to: string;
  due_at?: string;
  description?: string;
}

export interface CreateTaskResponse {
  success: boolean;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    assigned_to: {
      user_uuid: string;
      email: string;
      first_name: string;
      last_name: string;
    };
    due_date?: string;
    created_at: string;
  };
  email_record_id?: string;
  deep_link: string;
}

export interface AttachmentItem {
  file_name: string;
  mime_type?: string;
  file_size?: number;
  source_url?: string;
  provider_item_id?: string;
}

export interface LinkAttachmentsRequest {
  external_message_id: string;
  client_id: string;
  package_id?: string;
  evidence_type?: string;
  attachments: AttachmentItem[];
}

export interface LinkedDocumentResult {
  document_link_id: string;
  file_name: string;
  web_url: string;
  client_id: string;
  package_id: string | null;
  evidence_type: string;
}

export interface LinkAttachmentsResponse {
  linked: LinkedDocumentResult[];
  skipped: string[];
  audit_event_id: string | null;
  links: {
    open_client_documents: string;
  };
}

export interface AddinApiError {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

/**
 * Get the add-in token from session storage
 */
function getAddinToken(): string | null {
  try {
    const sessionData = sessionStorage.getItem('unicorn_addin_session');
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      return parsed.token || null;
    }
  } catch {
    // Fallback to direct token storage
  }
  return sessionStorage.getItem('addin_token');
}

/**
 * Make an authenticated request to add-in API endpoints
 */
async function addinFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAddinToken();
  
  // If no add-in token, try to use supabase session
  let authHeader = token ? `Bearer ${token}` : null;
  
  if (!authHeader) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = `Bearer ${session.access_token}`;
    }
  }

  if (!authHeader) {
    throw new Error('No authentication token available');
  }

  const response = await fetch(`${FUNCTIONS_URL}/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as AddinApiError;
    throw new Error(error.error?.message || 'Request failed');
  }

  return data as T;
}

/**
 * Capture and link an email to a client
 */
export async function captureEmail(
  mailContext: MailContext,
  clientId: number,
  packageId?: number
): Promise<CaptureEmailResponse> {
  const request: CaptureEmailRequest = {
    external_message_id: mailContext.messageId,
    client_id: clientId,
    package_id: packageId,
    subject: mailContext.subject,
    sender_email: mailContext.sender.email,
    sender_name: mailContext.sender.name,
    received_at: mailContext.receivedAt,
    body_preview: undefined, // Not available in basic context
    has_attachments: (mailContext.attachments?.length || 0) > 0,
  };

  return addinFetch<CaptureEmailResponse>('addin-email-capture', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Create a task from an email
 */
export async function createTaskFromEmail(
  mailContext: MailContext,
  clientId: number,
  title: string,
  assignedTo: string,
  dueAt?: string
): Promise<CreateTaskResponse> {
  const request: CreateTaskRequest = {
    external_message_id: mailContext.messageId,
    client_id: clientId,
    title,
    assigned_to: assignedTo,
    due_at: dueAt,
    description: `Email from: ${mailContext.sender.name} <${mailContext.sender.email}>`,
  };

  return addinFetch<CreateTaskResponse>('addin-email-create-task', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Link email attachments as document links
 */
export async function linkEmailAttachments(
  mailContext: MailContext,
  clientId: string,
  packageId?: string,
  evidenceType?: string
): Promise<LinkAttachmentsResponse> {
  if (!mailContext.attachments || mailContext.attachments.length === 0) {
    throw new Error('No attachments to link');
  }

  const request: LinkAttachmentsRequest = {
    external_message_id: mailContext.messageId,
    client_id: clientId,
    package_id: packageId,
    evidence_type: evidenceType || 'record',
    attachments: mailContext.attachments.map((att) => ({
      file_name: att.name,
      mime_type: att.contentType,
      file_size: att.size,
      provider_item_id: att.id,
    })),
  };

  return addinFetch<LinkAttachmentsResponse>('addin-email-link-attachments', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
