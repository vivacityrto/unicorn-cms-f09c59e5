import { createRoot } from 'react-dom/client';
import { AnonymousPlanningSurvey } from './AnonymousPlanningSurvey';
import { parseSurveyLink } from './transport';
import './survey.css';
// Separate entrypoint: no AuthProvider, app telemetry, Supabase client or replay.
// Fragment is not sent in the HTTP request and is cleared before any API call.
const link = window.location.search ? null : parseSurveyLink(window.location.hash);
window.history.replaceState(null, '', window.location.pathname);
const base = import.meta.env.VITE_SUPABASE_URL ?? '';
createRoot(document.getElementById('root')!).render(<AnonymousPlanningSurvey
  link={link} enabled={import.meta.env.VITE_PLANNING_SURVEYS_ENABLED === 'true'}
  endpoint={`${base}/functions/v1/planning-survey-collect`} />);
