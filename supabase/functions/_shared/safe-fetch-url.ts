/**
 * F-031: SSRF-safe URL validation for research functions that forward a
 * caller- or tenant-configured URL to Firecrawl (research-scrape,
 * research-public-snapshot, research-tas-context, research-enrich-tenant).
 *
 * Rejects non-HTTPS URLs, embedded credentials, and hosts that resolve to
 * localhost/loopback/private/link-local/cloud-metadata ranges from the URL
 * or IP literal itself. This is a literal/hostname-level allowlist, not a
 * DNS resolver — it cannot stop a public hostname that later resolves (or
 * is rebound) to a private address; that needs a Firecrawl-side or
 * resolver-side control and is tracked separately, not solved here.
 */

export interface UrlValidationResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isDisallowedHost(rawHostname: string): boolean {
  // A terminal DNS root dot is equivalent to the bare hostname. Normalize
  // terminal dots before comparing blocklist values.
  const hostname = stripBrackets(rawHostname.toLowerCase()).replace(/\.+$/, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "metadata.google.internal") return true;

  // IPv4 literal
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return true; // malformed — reject rather than risk misparse
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918 private
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 private
    if (a === 192 && b === 168) return true; // RFC1918 private
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
    if (a === 0) return true; // "this network"
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
    return false;
  }

  // IPv6 literal
  if (hostname === "::1" || hostname === "::") return true;
  // IPv4-mapped IPv6 literals can encode loopback, RFC1918, or metadata
  // IPv4 addresses (for example ::ffff:127.0.0.1). URL normalisation may
  // render the IPv4 portion in hex, so reject the entire mapped range rather
  // than trying to reconstruct an IPv4 string from its representation.
  if (hostname.startsWith("::ffff:")) return true;
  if (hostname.startsWith("fe80")) return true; // link-local
  if (hostname.startsWith("fc") || hostname.startsWith("fd")) return true; // unique local (fc00::/7)

  return false;
}

/**
 * Validate and normalize a caller- or config-supplied URL before it is
 * forwarded to Firecrawl. Bare domains (no scheme) are treated as https.
 *
 * @param requireHostSuffix - when set, the resolved hostname must equal
 *   this suffix or be a subdomain of it (e.g. "training.gov.au").
 */
export function validateExternalScrapeUrl(
  rawUrl: string,
  opts?: { requireHostSuffix?: string },
): UrlValidationResult {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return { ok: false, error: "URL is required" };

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// URLs are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed" };
  }
  if (isDisallowedHost(parsed.hostname)) {
    return { ok: false, error: "URL resolves to a blocked or private host" };
  }
  if (opts?.requireHostSuffix) {
    const suffix = opts.requireHostSuffix.toLowerCase().replace(/\.+$/, "");
    const hostname = stripBrackets(parsed.hostname.toLowerCase()).replace(/\.+$/, "");
    if (hostname !== suffix && !hostname.endsWith(`.${suffix}`)) {
      return { ok: false, error: `URL must be a ${opts.requireHostSuffix} address` };
    }
  }

  return { ok: true, url: parsed.toString() };
}
