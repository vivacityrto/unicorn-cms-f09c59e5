import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_PRESETS } from '@/lib/queryConfig';

interface Timezone {
  tz: string;
  label: string;
  utc_offset_minutes: number;
  country_code: string | null;
}

export function useTimezones() {
  return useQuery({
    queryKey: ['timezones'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_timezones');
      
      if (error) {
        console.error('Error fetching timezones:', error);
        // Return fallback timezones if RPC fails
        return getFallbackTimezones();
      }
      
      return (data || []) as Timezone[];
    },
    ...QUERY_PRESETS.REFERENCE,
  });
}

// Grouped timezones for UI display
export function groupTimezones(timezones: Timezone[]) {
  const groups: Record<string, Timezone[]> = {
    'Australia': [],
    'Asia Pacific': [],
    'Europe': [],
    'Americas': [],
    'Other': [],
  };
  
  for (const tz of timezones) {
    if (tz.tz.startsWith('Australia/')) {
      groups['Australia'].push(tz);
    } else if (tz.tz.startsWith('Asia/') || tz.tz.startsWith('Pacific/')) {
      groups['Asia Pacific'].push(tz);
    } else if (tz.tz.startsWith('Europe/')) {
      groups['Europe'].push(tz);
    } else if (tz.tz.startsWith('America/')) {
      groups['Americas'].push(tz);
    } else {
      groups['Other'].push(tz);
    }
  }
  
  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, tzs]) => tzs.length > 0)
  );
}

function getFallbackTimezones(): Timezone[] {
  return [
    // Australia
    { tz: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)', utc_offset_minutes: 600, country_code: 'AU' },
    { tz: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)', utc_offset_minutes: 600, country_code: 'AU' },
    { tz: 'Australia/Brisbane', label: 'Brisbane (AEST)', utc_offset_minutes: 600, country_code: 'AU' },
    { tz: 'Australia/Adelaide', label: 'Adelaide (ACDT/ACST)', utc_offset_minutes: 570, country_code: 'AU' },
    { tz: 'Australia/Perth', label: 'Perth (AWST)', utc_offset_minutes: 480, country_code: 'AU' },
    { tz: 'Australia/Darwin', label: 'Darwin (ACST)', utc_offset_minutes: 570, country_code: 'AU' },
    { tz: 'Australia/Hobart', label: 'Hobart (AEDT/AEST)', utc_offset_minutes: 600, country_code: 'AU' },
    // Asia Pacific
    { tz: 'Asia/Manila', label: 'Manila (PHT) 🇵🇭', utc_offset_minutes: 480, country_code: 'PH' },
    { tz: 'Asia/Singapore', label: 'Singapore (SGT)', utc_offset_minutes: 480, country_code: 'SG' },
    { tz: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', utc_offset_minutes: 480, country_code: 'HK' },
    { tz: 'Asia/Tokyo', label: 'Tokyo (JST)', utc_offset_minutes: 540, country_code: 'JP' },
    { tz: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (MYT)', utc_offset_minutes: 480, country_code: 'MY' },
    { tz: 'Asia/Jakarta', label: 'Jakarta (WIB)', utc_offset_minutes: 420, country_code: 'ID' },
    { tz: 'Asia/Makassar', label: 'Makassar (WITA)', utc_offset_minutes: 480, country_code: 'ID' },
    { tz: 'Asia/Kolkata', label: 'Kolkata (IST)', utc_offset_minutes: 330, country_code: 'IN' },
    { tz: 'Asia/Shanghai', label: 'Shanghai (CST)', utc_offset_minutes: 480, country_code: 'CN' },
    { tz: 'Asia/Seoul', label: 'Seoul (KST)', utc_offset_minutes: 540, country_code: 'KR' },
    { tz: 'Asia/Bangkok', label: 'Bangkok (ICT)', utc_offset_minutes: 420, country_code: 'TH' },
    { tz: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (ICT)', utc_offset_minutes: 420, country_code: 'VN' },
    // Pacific
    { tz: 'Pacific/Auckland', label: 'Auckland (NZDT/NZST)', utc_offset_minutes: 720, country_code: 'NZ' },
    { tz: 'Pacific/Fiji', label: 'Fiji (FJT)', utc_offset_minutes: 720, country_code: 'FJ' },
    { tz: 'Pacific/Guam', label: 'Guam (ChST)', utc_offset_minutes: 600, country_code: 'GU' },
    // Europe
    { tz: 'Europe/London', label: 'London (GMT/BST)', utc_offset_minutes: 0, country_code: 'GB' },
    { tz: 'Europe/Dublin', label: 'Dublin (GMT/IST)', utc_offset_minutes: 0, country_code: 'IE' },
    { tz: 'Europe/Paris', label: 'Paris (CET/CEST)', utc_offset_minutes: 60, country_code: 'FR' },
    { tz: 'Europe/Berlin', label: 'Berlin (CET/CEST)', utc_offset_minutes: 60, country_code: 'DE' },
    { tz: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)', utc_offset_minutes: 60, country_code: 'NL' },
    { tz: 'Europe/Rome', label: 'Rome (CET/CEST)', utc_offset_minutes: 60, country_code: 'IT' },
    { tz: 'Europe/Madrid', label: 'Madrid (CET/CEST)', utc_offset_minutes: 60, country_code: 'ES' },
    // Americas
    { tz: 'America/New_York', label: 'New York (EST/EDT)', utc_offset_minutes: -300, country_code: 'US' },
    { tz: 'America/Chicago', label: 'Chicago (CST/CDT)', utc_offset_minutes: -360, country_code: 'US' },
    { tz: 'America/Denver', label: 'Denver (MST/MDT)', utc_offset_minutes: -420, country_code: 'US' },
    { tz: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)', utc_offset_minutes: -480, country_code: 'US' },
    { tz: 'America/Toronto', label: 'Toronto (EST/EDT)', utc_offset_minutes: -300, country_code: 'CA' },
    { tz: 'America/Vancouver', label: 'Vancouver (PST/PDT)', utc_offset_minutes: -480, country_code: 'CA' },
    // Other
    { tz: 'UTC', label: 'UTC (Coordinated Universal Time)', utc_offset_minutes: 0, country_code: null },
  ];
}
