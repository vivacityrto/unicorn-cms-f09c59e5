import { supabase } from '@/integrations/supabase/client';

export interface TargetRtoSnapshot {
  rto_name: string;
  rto_number: string;
  website: string;
  site_address: string;
  phone: string;
  email: string;
  ceo: string;
}

export interface LookupResult {
  ok: boolean;
  data?: TargetRtoSnapshot;
  error?: string;
}

// training.gov.au's own field naming varies across endpoints/versions, hence the alias fallbacks below.
interface TgaAddress {
  endDate?: string | null;
  type?: string;
  addressType?: string;
  street1?: string; addressLine1?: string; address1?: string;
  street2?: string; addressLine2?: string; address2?: string;
  suburb?: string; locality?: string; city?: string;
  state?: string;
  postcode?: string; postCode?: string;
}

interface TgaContact {
  endDate?: string | null;
  type?: string; role?: string; title?: string;
  phone?: string; phoneNumber?: string; telephone?: string;
  email?: string; emailAddress?: string;
  name?: string;
  firstName?: string; givenName?: string;
  lastName?: string; familyName?: string;
}

interface TgaRawSnapshot {
  addresses?: TgaAddress[];
  contacts?: TgaContact[];
}

interface TgaPreviewData {
  legal_name?: string;
  trading_name?: string;
  code?: string;
  web_address?: string;
}

interface TgaPreviewPayload {
  success?: boolean;
  error?: string;
  data?: TgaPreviewData;
  raw_snapshot?: TgaRawSnapshot;
}

const isCurrent = (item: TgaAddress | TgaContact) => !item?.endDate;

function pickPrincipalAddress(addresses: TgaAddress[] | undefined): string {
  if (!Array.isArray(addresses) || addresses.length === 0) return '';
  const current = addresses.filter(isCurrent);
  const pool = current.length ? current : addresses;
  const principal =
    pool.find(a => /principal|head/i.test(a?.type || a?.addressType || '')) ||
    pool[0];
  if (!principal) return '';
  const parts = [
    principal.street1 || principal.addressLine1 || principal.address1,
    principal.street2 || principal.addressLine2 || principal.address2,
    principal.suburb || principal.locality || principal.city,
    principal.state,
    principal.postcode || principal.postCode,
  ]
    .filter(Boolean)
    .map(String)
    .map(s => s.trim());
  // Combine suburb/state/postcode tighter
  const street = [parts[0], parts[1]].filter(Boolean).join(', ');
  const tail = [parts[2], parts[3], parts[4]].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}

function pickPrincipalContact(contacts: TgaContact[] | undefined): TgaContact | null {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;
  const current = contacts.filter(isCurrent);
  const pool = current.length ? current : contacts;
  return (
    pool.find(c => /principal executive|chief executive|ceo|principal/i.test(c?.type || c?.role || c?.title || '')) ||
    pool[0] ||
    null
  );
}

function pickPhone(contact: TgaContact | null, contacts: TgaContact[] | undefined): string {
  const direct = contact?.phone || contact?.phoneNumber || contact?.telephone;
  if (direct) return String(direct);
  const anyWithPhone = (contacts || []).find(c => c?.phone || c?.phoneNumber || c?.telephone);
  return anyWithPhone ? String(anyWithPhone.phone || anyWithPhone.phoneNumber || anyWithPhone.telephone) : '';
}

function pickEmail(contact: TgaContact | null, contacts: TgaContact[] | undefined): string {
  const direct = contact?.email || contact?.emailAddress;
  if (direct) return String(direct);
  const anyWithEmail = (contacts || []).find(c => c?.email || c?.emailAddress);
  return anyWithEmail ? String(anyWithEmail.email || anyWithEmail.emailAddress) : '';
}

function pickName(contact: TgaContact | null): string {
  if (!contact) return '';
  if (contact.name) return String(contact.name);
  const full = [contact.firstName || contact.givenName, contact.lastName || contact.familyName]
    .filter(Boolean)
    .join(' ');
  return full || '';
}

export async function lookupTargetRtoByCode(code: string): Promise<LookupResult> {
  const trimmed = (code || '').trim();
  if (!/^\d{4,6}$/.test(trimmed)) {
    return { ok: false, error: 'RTO Number must be 4–6 digits.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('tga-rto-preview', {
      body: { rtoId: trimmed },
    });

    // If the function returned a non-2xx, try to read the structured body from the Response context
    let payload: TgaPreviewPayload | undefined = data;
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          payload = await ctx.json();
        } catch {
          // ignore parse errors and fall through
        }
      }
      if (!payload) {
        return { ok: false, error: error.message || 'TGA lookup failed.' };
      }
    }

    if (!payload?.success) {
      return { ok: false, error: payload?.error || `RTO ${trimmed} not found on training.gov.au` };
    }

    const d = payload.data || {};
    const raw = payload.raw_snapshot || {};
    const principalContact = pickPrincipalContact(raw.contacts);

    const snapshot: TargetRtoSnapshot = {
      rto_name: d.legal_name || d.trading_name || '',
      rto_number: d.code || trimmed,
      website: d.web_address || '',
      site_address: pickPrincipalAddress(raw.addresses),
      phone: pickPhone(principalContact, raw.contacts),
      email: pickEmail(principalContact, raw.contacts),
      ceo: pickName(principalContact),
    };

    return { ok: true, data: snapshot };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unexpected error during TGA lookup.' };
  }
}
