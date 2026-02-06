import { useSearchParams } from 'react-router-dom';
import AddinShell from '@/pages/addin/AddinShell';

/**
 * Teams wrapper page - reuses the add-in shell components.
 * Can be embedded as a Microsoft Teams tab.
 * 
 * Query params:
 * - mode=meeting: Shows meeting panel by default, hides mail actions
 */
export default function TeamsShell() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'default';
  
  // Pass mode to AddinShell via the shell's mode prop
  return <AddinShell embedMode="teams" viewMode={mode as 'default' | 'meeting'} />;
}
