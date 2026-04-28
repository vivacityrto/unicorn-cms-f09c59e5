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

const isCurrent = (item: any) => !item?.endDate;

function pickPrincipalAddress(addresses: any[] | undefined): string {
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

function pickPrincipalContact(contacts: any[] | undefined) {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;
  const current = contacts.filter(isCurrent);
  const pool = current.length ? current : contacts;
  return (
    pool.find(c => /principal executive|chief executive|ceo|principal/i.test(c?.type || c?.role || c?.title || '')) ||
    pool[0] ||
    null
  );
}

function pickPhone(contact: any, contacts: any[] | undefined): string {
  const direct = contact?.phone || contact?.phoneNumber || contact?.telephone;
  if (direct) return String(direct);
  const anyWithPhone = (contacts || []).find(c => c?.phone || c?.phoneNumber || c?.telephone);
  return anyWithPhone ? String(anyWithPhone.phone || anyWithPhone.phoneNumber || anyWithPhone.telephone) : '';
}

function pickEmail(contact: any, contacts: any[] | undefined): string {
  const direct = contact?.email || contact?.emailAddress;
  if (direct) return String(direct);
  const anyWithEmail = (contacts || []).find(c => c?.email || c?.emailAddress);
  return anyWithEmail ? String(anyWithEmail.email || anyWithEmail.emailAddress) : '';
}

function pickName(contact: any): string {
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
    let payload: any = data;
    if (error) {
      const ctx: any = (error as any).context;
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
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unexpected error during TGA lookup.' };
  }
}
