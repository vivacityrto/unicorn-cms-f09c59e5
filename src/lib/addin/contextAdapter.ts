/**
 * Context Adapter for Microsoft Office Add-in
 * 
 * This module provides placeholder functions for getting context from
 * Outlook Mail, Calendar, and Teams meetings.
 * 
 * When running inside Office, these will be implemented using Office.js APIs.
 * When running in a normal browser, they return null.
 */

import type { MailContext, MeetingContext, AddinSurface } from './types';

/**
 * Check if we're running inside an Office Add-in context
 */
export function isOfficeEnvironment(): boolean {
  // Office.js sets this global when loaded
  return typeof (window as unknown as Record<string, unknown>).Office !== 'undefined';
}

/**
 * Detect which Office surface we're running in
 */
export function detectSurface(): AddinSurface {
  if (!isOfficeEnvironment()) {
    return 'unknown';
  }

  // Placeholder - will be implemented with Office.js
  // Office.context.mailbox indicates Outlook
  // Office.context.host can indicate specific host
  const office = (window as unknown as Record<string, unknown>).Office as Record<string, unknown> | undefined;
  
  if (office?.context) {
    const context = office.context as Record<string, unknown>;
    
    // Check for mailbox (Outlook)
    if (context.mailbox) {
      // Determine if it's mail or calendar based on item type
      const mailbox = context.mailbox as Record<string, unknown>;
      const item = mailbox.item as Record<string, unknown> | undefined;
      
      if (item?.itemType === 'appointment') {
        return 'outlook_calendar';
      }
      return 'outlook_mail';
    }
    
    // Check for Teams
    if (context.host === 'Teams') {
      return 'teams_meeting';
    }
  }

  return 'unknown';
}

/**
 * Get the current mail context from Outlook
 * Returns null when not in Outlook Mail context or when running in browser
 */
export async function getMailContext(): Promise<MailContext | null> {
  if (!isOfficeEnvironment()) {
    console.log('[addin-context] Not in Office environment, returning null mail context');
    return null;
  }

  const surface = detectSurface();
  if (surface !== 'outlook_mail') {
    console.log('[addin-context] Not in Outlook Mail surface:', surface);
    return null;
  }

  // Placeholder for Office.js implementation
  // Will use Office.context.mailbox.item to get message details
  console.log('[addin-context] Mail context retrieval not yet implemented');
  return null;
}

/**
 * Get the current meeting context from Outlook Calendar or Teams
 * Returns null when not in meeting context or when running in browser
 */
export async function getMeetingContext(): Promise<MeetingContext | null> {
  if (!isOfficeEnvironment()) {
    console.log('[addin-context] Not in Office environment, returning null meeting context');
    return null;
  }

  const surface = detectSurface();
  if (surface !== 'outlook_calendar' && surface !== 'teams_meeting') {
    console.log('[addin-context] Not in meeting surface:', surface);
    return null;
  }

  // Placeholder for Office.js implementation
  // Will use Office.context.mailbox.item for calendar
  // or Teams SDK for Teams meetings
  console.log('[addin-context] Meeting context retrieval not yet implemented');
  return null;
}

/**
 * Initialize the Office.js library
 * Call this when the add-in loads
 */
export function initializeOffice(): Promise<void> {
  return new Promise((resolve) => {
    if (!isOfficeEnvironment()) {
      console.log('[addin-context] Not in Office environment, skipping initialization');
      resolve();
      return;
    }

    const office = (window as unknown as Record<string, unknown>).Office as {
      onReady?: (callback: () => void) => void;
    };

    if (office?.onReady) {
      office.onReady(() => {
        console.log('[addin-context] Office.js initialized');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
