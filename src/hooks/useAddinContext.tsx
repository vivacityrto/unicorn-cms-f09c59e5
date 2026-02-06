import { useState, useEffect, useCallback } from 'react';
import type { AddinContextState, AddinSurface, MailContext, MeetingContext } from '@/lib/addin/types';
import { 
  isOfficeEnvironment, 
  detectSurface, 
  getMailContext, 
  getMeetingContext,
  initializeOffice 
} from '@/lib/addin/contextAdapter';

const initialState: AddinContextState = {
  surface: 'unknown',
  mailContext: null,
  meetingContext: null,
  isLoading: true,
  error: null,
};

export function useAddinContext() {
  const [state, setState] = useState<AddinContextState>(initialState);
  const [isOffice, setIsOffice] = useState(false);

  const refreshContext = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const surface = detectSurface();
      let mailContext: MailContext | null = null;
      let meetingContext: MeetingContext | null = null;

      if (surface === 'outlook_mail') {
        mailContext = await getMailContext();
      } else if (surface === 'outlook_calendar' || surface === 'teams_meeting') {
        meetingContext = await getMeetingContext();
      }

      setState({
        surface,
        mailContext,
        meetingContext,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[useAddinContext] Error refreshing context:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load context',
      }));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await initializeOffice();
      setIsOffice(isOfficeEnvironment());
      await refreshContext();
    };

    init();
  }, [refreshContext]);

  const getSurfaceLabel = (surface: AddinSurface): string => {
    switch (surface) {
      case 'outlook_mail':
        return 'Outlook Mail';
      case 'outlook_calendar':
        return 'Outlook Calendar';
      case 'teams_meeting':
        return 'Teams Meeting';
      case 'word':
        return 'Word';
      case 'excel':
        return 'Excel';
      default:
        return 'Browser';
    }
  };

  const hasContext = state.mailContext !== null || state.meetingContext !== null;

  return {
    ...state,
    isOffice,
    hasContext,
    refreshContext,
    getSurfaceLabel,
  };
}
