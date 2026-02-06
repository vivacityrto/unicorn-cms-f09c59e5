import { supabase } from "@/integrations/supabase/client";

export interface CaptureMeetingRequest {
  provider?: string;
  external_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  organiser: {
    email: string;
    name?: string;
  };
  teams_join_url?: string;
  location?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    type?: 'required' | 'optional' | 'resource';
  }>;
  link?: {
    client_id?: string | null;
    package_id?: string | null;
  };
}

export interface CaptureMeetingResponse {
  meeting: {
    id: string;
    external_event_id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    teams_join_url: string | null;
    client_id: number | null;
    package_id: number | null;
    status: string;
  };
  participants_upserted: number;
  audit_event_id: string | null;
  links: Record<string, string>;
}

export interface TimeRules {
  rounding_minutes?: number;
  min_minutes?: number;
  max_minutes?: number;
}

export interface CreateTimeDraftRequest {
  external_event_id: string;
  client_id?: string;
  package_id?: string;
  minutes_override?: number | null;
  notes?: string;
  rules?: TimeRules;
}

export interface CreateTimeDraftResponse {
  time_entry: {
    id: string;
    status: string;
    minutes: number;
    source: string;
    meeting_id: string;
    client_id: number | null;
  };
  audit_event_id: string | null;
  links: Record<string, string>;
}

export interface AddinApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function getAddinToken(): string | null {
  const sessionData = sessionStorage.getItem('addin_session');
  if (!sessionData) return null;
  try {
    const parsed = JSON.parse(sessionData);
    return parsed.token || null;
  } catch {
    return null;
  }
}

export async function captureMeeting(
  request: CaptureMeetingRequest,
  idempotencyKey?: string
): Promise<CaptureMeetingResponse> {
  const token = getAddinToken();
  if (!token) {
    throw new Error('No add-in token available');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const { data, error } = await supabase.functions.invoke<CaptureMeetingResponse | { error: AddinApiError }>(
    'addin-meeting-capture',
    {
      body: request,
      headers,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (data && 'error' in data) {
    const apiError = data.error as AddinApiError;
    throw new Error(apiError.message);
  }

  return data as CaptureMeetingResponse;
}

export async function createTimeDraft(
  request: CreateTimeDraftRequest,
  idempotencyKey?: string
): Promise<CreateTimeDraftResponse> {
  const token = getAddinToken();
  if (!token) {
    throw new Error('No add-in token available');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const { data, error } = await supabase.functions.invoke<CreateTimeDraftResponse | { error: AddinApiError }>(
    'addin-meeting-create-time-draft',
    {
      body: request,
      headers,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (data && 'error' in data) {
    const apiError = data.error as AddinApiError;
    throw new Error(apiError.message);
  }

  return data as CreateTimeDraftResponse;
}
