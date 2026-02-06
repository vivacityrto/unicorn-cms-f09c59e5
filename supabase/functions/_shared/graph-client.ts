/**
 * Microsoft Graph API client utilities for add-in edge functions
 * Used to optionally enrich email and meeting data when Graph tokens are available
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export interface GraphToken {
  access_token: string;
  expires_at: string;
}

export interface GraphEmailDetails {
  body?: {
    content: string;
    contentType: 'text' | 'html';
  };
  bodyPreview?: string;
  importance?: string;
  isRead?: boolean;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  attachments?: GraphAttachment[];
  categories?: string[];
  webLink?: string;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentId?: string;
}

export interface GraphMeetingDetails {
  webLink?: string;
  onlineMeetingUrl?: string;
  onlineMeeting?: {
    joinUrl?: string;
  };
  attendees?: GraphAttendee[];
  bodyPreview?: string;
  body?: {
    content: string;
    contentType: 'text' | 'html';
  };
  importance?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  responseStatus?: {
    response: string;
    time: string;
  };
  showAs?: string;
  location?: {
    displayName?: string;
    address?: {
      city?: string;
      countryOrRegion?: string;
    };
  };
  recurrence?: unknown;
}

export interface GraphAttendee {
  emailAddress: {
    address: string;
    name?: string;
  };
  type: 'required' | 'optional' | 'resource';
  status?: {
    response: 'none' | 'organizer' | 'accepted' | 'declined' | 'tentativelyAccepted';
    time: string;
  };
}

/**
 * Attempt to retrieve user's Graph access token from oauth_tokens table
 */
export async function getUserGraphToken(userUuid: string): Promise<GraphToken | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data, error } = await supabase
      .from('oauth_tokens')
      .select('access_token, expires_at')
      .eq('user_id', userUuid)
      .eq('provider', 'microsoft')
      .maybeSingle();

    if (error || !data) {
      console.log('[graph-client] No Graph token found for user');
      return null;
    }

    // Check if token is expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      console.log('[graph-client] Graph token is expired');
      return null;
    }

    return {
      access_token: data.access_token,
      expires_at: data.expires_at,
    };
  } catch (err) {
    console.error('[graph-client] Error fetching Graph token:', err);
    return null;
  }
}

/**
 * Fetch email details from Microsoft Graph
 */
export async function fetchEmailFromGraph(
  accessToken: string,
  messageId: string
): Promise<GraphEmailDetails | null> {
  try {
    // URL-encode the message ID as it may contain special characters
    const encodedId = encodeURIComponent(messageId);
    
    const response = await fetch(
      `${GRAPH_BASE_URL}/me/messages/${encodedId}?$select=body,bodyPreview,importance,isRead,receivedDateTime,hasAttachments,categories,webLink`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('[graph-client] Failed to fetch email from Graph:', response.status, response.statusText);
      return null;
    }

    const email = await response.json();
    
    // Also fetch attachments if present
    let attachments: GraphAttachment[] = [];
    if (email.hasAttachments) {
      const attachResponse = await fetch(
        `${GRAPH_BASE_URL}/me/messages/${encodedId}/attachments?$select=id,name,contentType,size,isInline`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (attachResponse.ok) {
        const attachData = await attachResponse.json();
        attachments = attachData.value || [];
      }
    }

    return {
      body: email.body,
      bodyPreview: email.bodyPreview,
      importance: email.importance,
      isRead: email.isRead,
      receivedDateTime: email.receivedDateTime,
      hasAttachments: email.hasAttachments,
      attachments,
      categories: email.categories,
      webLink: email.webLink,
    };
  } catch (err) {
    console.error('[graph-client] Error fetching email from Graph:', err);
    return null;
  }
}

/**
 * Fetch meeting/event details from Microsoft Graph
 */
export async function fetchMeetingFromGraph(
  accessToken: string,
  eventId: string
): Promise<GraphMeetingDetails | null> {
  try {
    // URL-encode the event ID as it may contain special characters
    const encodedId = encodeURIComponent(eventId);
    
    const response = await fetch(
      `${GRAPH_BASE_URL}/me/events/${encodedId}?$select=webLink,onlineMeetingUrl,onlineMeeting,attendees,bodyPreview,body,importance,isAllDay,isCancelled,isOrganizer,responseStatus,showAs,location,recurrence`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('[graph-client] Failed to fetch meeting from Graph:', response.status, response.statusText);
      return null;
    }

    const event = await response.json();

    return {
      webLink: event.webLink,
      onlineMeetingUrl: event.onlineMeetingUrl,
      onlineMeeting: event.onlineMeeting,
      attendees: event.attendees,
      bodyPreview: event.bodyPreview,
      body: event.body,
      importance: event.importance,
      isAllDay: event.isAllDay,
      isCancelled: event.isCancelled,
      isOrganizer: event.isOrganizer,
      responseStatus: event.responseStatus,
      showAs: event.showAs,
      location: event.location,
      recurrence: event.recurrence,
    };
  } catch (err) {
    console.error('[graph-client] Error fetching meeting from Graph:', err);
    return null;
  }
}
