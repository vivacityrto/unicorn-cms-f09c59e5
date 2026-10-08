import { describe, expect, it } from 'vitest';
import {
  batchStatusLabel,
  exclusionReasonLabel,
  formatEventDateTime,
  formatEventZone,
  isBatchRunning,
  personName,
  resultStatusLabel,
  webinarConfirmationMessage,
} from './format';

// 20 Oct 2026 10:00 am AEDT (UTC+11) is 19 Oct 23:00 UTC.
const START = '2026-10-19T23:00:00.000Z';

describe('teams event formatting', () => {
  it('formats the start as Australia/Sydney, DD Month YYYY, lower-case am/pm', () => {
    expect(formatEventDateTime(START)).toBe('20 October 2026 at 10:00 am');
    expect(formatEventDateTime('2026-10-20T04:30:00.000Z')).toBe('20 October 2026 at 3:30 pm');
  });

  it('reports the zone abbreviation for the instant', () => {
    expect(formatEventZone(START)).toBe('AEDT');
    expect(formatEventZone('2026-07-20T00:00:00.000Z')).toBe('AEST');
  });

  it('builds the brief’s webinar confirmation sentence', () => {
    expect(webinarConfirmationMessage(184, 'Compliance Update Webinar', START)).toBe(
      'Register 184 people for “Compliance Update Webinar” on 20 October 2026 at 10:00 am?',
    );
    expect(webinarConfirmationMessage(1, 'Solo', START)).toContain('Register 1 person for');
  });

  it('labels exclusions, statuses and names', () => {
    expect(exclusionReasonLabel('invalid_email')).toBe('Missing or invalid email');
    expect(exclusionReasonLabel('duplicate_of:user:12')).toBe('Same email as another member');
    expect(exclusionReasonLabel('something_new')).toBe('something_new');
    expect(exclusionReasonLabel(null)).toBe('');
    expect(resultStatusLabel('already_processed')).toBe('Already registered');
    expect(batchStatusLabel('completed_with_errors')).toBe('Completed with errors');
    expect(personName({ first_name: 'Amanda', last_name: 'Hardy' })).toBe('Amanda Hardy');
    expect(personName({ first_name: null, last_name: null })).toBe('(no name)');
  });

  it('knows which batch states are still running', () => {
    expect(isBatchRunning('processing')).toBe(true);
    expect(isBatchRunning('queued')).toBe(true);
    expect(isBatchRunning('completed')).toBe(false);
    expect(isBatchRunning(undefined)).toBe(false);
  });
});
