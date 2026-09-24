/**
 * Shape of a message returned by sync-outlook-calendar's get-emails action
 * (a thin passthrough of the Microsoft Graph message resource, scoped to the
 * fields the app actually uses). Shared between useOutlookInbox and
 * OutlookInboxBrowser — previously declared separately in both, which had
 * drifted out of sync.
 */
export interface OutlookEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime: string;
  sentDateTime?: string;
  hasAttachments: boolean;
  bodyPreview: string;
  isRead: boolean;
  conversationId?: string;
  /** Microsoft Outlook category labels assigned to this message (free-text
   * names set by the user in their real mailbox — no colour data is
   * available without the MailboxSettings.Read scope, so the app assigns
   * its own deterministic colour per name; see categoryColor.ts). */
  categories?: string[];
}
