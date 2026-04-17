/** Helpers to derive M365 attributes from name + location. */

const VIVACITY_DOMAIN = "vivacity.com.au";

/** Normalise to lowercase ascii, strip diacritics, hyphens → empty. */
function clean(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function deriveMailNickname(firstName: string, lastName: string): string {
  return `${clean(firstName)}.${clean(lastName)}`.slice(0, 64);
}

export function deriveUpn(firstName: string, lastName: string): string {
  return `${deriveMailNickname(firstName, lastName)}@${VIVACITY_DOMAIN}`;
}

export function deriveDisplayName(firstName: string, lastName: string, preferred?: string): string {
  const first = (preferred?.trim() || firstName).trim();
  return `${first} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
}

/** Welcome2Vivacity-XXXX (4 random digits) */
export function generateTempPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Welcome2Vivacity-${n}`;
}
