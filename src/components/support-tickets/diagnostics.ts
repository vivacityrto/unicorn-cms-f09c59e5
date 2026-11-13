export function getBrowserName(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'Unknown';
}

export function getOSName(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

/** Page and device details sent with a new ticket. The database keeps only an allowlist of these keys, staff-only. */
export function collectDiagnostics(): { page_path: string; browser: string; os: string; screen: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    page_path: typeof window !== 'undefined' ? window.location.pathname : '',
    browser: getBrowserName(ua),
    os: getOSName(ua),
    screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
  };
}
