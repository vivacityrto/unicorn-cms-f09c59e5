/**
 * Add-in context types and interfaces
 * These will be populated by Office.js when running inside Outlook/Teams
 */

export interface MailContext {
  messageId: string;
  subject: string;
  sender: {
    email: string;
    name: string;
  };
  recipients: Array<{
    email: string;
    name: string;
    type: 'to' | 'cc' | 'bcc';
  }>;
  receivedAt: string;
  conversationId?: string;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}

export interface MeetingContext {
  meetingId: string;
  subject: string;
  startTime: string;
  endTime: string;
  organizer: {
    email: string;
    name: string;
  };
  attendees: Array<{
    email: string;
    name: string;
    response: 'accepted' | 'declined' | 'tentative' | 'none';
  }>;
  location?: string;
  isOnlineMeeting: boolean;
  onlineMeetingUrl?: string;
}

export interface AddinUser {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: string;
}

export interface AddinFeatures {
  microsoft_addin_enabled: boolean;
  addin_outlook_mail_enabled: boolean;
  addin_meetings_enabled: boolean;
  addin_documents_enabled: boolean;
}

export interface AddinSession {
  token: string;
  expiresAt: Date;
  user: AddinUser;
  features: AddinFeatures;
}

export type AddinSurface = 'outlook_mail' | 'outlook_calendar' | 'teams_meeting' | 'word' | 'excel' | 'unknown';

export interface AddinContextState {
  surface: AddinSurface;
  mailContext: MailContext | null;
  meetingContext: MeetingContext | null;
  isLoading: boolean;
  error: string | null;
}
