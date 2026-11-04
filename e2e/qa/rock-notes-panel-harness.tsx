// Development-only test entrypoint. This file is outside src/ and is never
// imported into the production application bundle. Keep the project-ref and
// run-label checks: the real Notes panel may mount here only for one QA Rock.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@/index.css';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { RockNotesPanel } from '@/components/eos/rocks/notes/RockNotesPanel';
import { supabase } from '@/integrations/supabase/client';

const QA_PROJECT_URL = 'https://qfpxvumcrnzrjyvqkicq.supabase.co';
const QA_FIXTURE_TENANT_ID = 20;
const params = new URLSearchParams(window.location.search);
const rockId = params.get('rockId') ?? '';
const runId = params.get('runId') ?? '';
const expectedTitle = `[QA TEST ONLY] Rock Notes CRUD ${runId}`;
const root = createRoot(document.getElementById('root')!);

export function Refusal({ children }: { children: string }) {
  return <main role="alert"><h1>QA panel harness refused</h1><p>{children}</p></main>;
}

export function PanelFixture() {
  const { profile, loading } = useAuth();
  const fixture = useQuery({
    queryKey: ['qa-rock-notes-panel-fixture', rockId, runId],
    enabled: !!rockId && /^\d+-\d+$/.test(runId),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rocks')
        .select('id, title, tenant_id')
        .eq('id', rockId)
        .single();
      if (error) throw error;
      if (data.tenant_id !== QA_FIXTURE_TENANT_ID || data.title !== expectedTitle) {
        throw new Error('The Rock is outside this run-labeled QA fixture.');
      }
      return data;
    },
  });

  if (loading || fixture.isPending) return <main role="status">Checking the authenticated QA fixture…</main>;
  if (!profile?.user_uuid || !profile.is_vivacity_internal || !['Team Member', 'Integrator', 'Super Admin'].includes(profile.unicorn_role ?? '')) {
    return <Refusal>Use one of the existing active internal QA personas.</Refusal>;
  }
  if (fixture.isError || !fixture.data) return <Refusal>The exact run-labeled QA Rock could not be verified.</Refusal>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">QA Rock Notes panel test</h1>
      <p data-testid="fixture-title">{fixture.data.title}</p>
      <p data-testid="actor-role">{profile.unicorn_role}</p>
      <RockNotesPanel rock={{
        id: fixture.data.id,
        title: fixture.data.title,
        tenant_id: fixture.data.tenant_id,
      }} />
    </main>
  );
}

if (
  !import.meta.env.DEV
  || import.meta.env.VITE_SUPABASE_URL !== QA_PROJECT_URL
  || !/^\d+-\d+$/.test(runId)
  || !/^[0-9a-f-]{36}$/i.test(rockId)
) {
  root.render(<Refusal>This entrypoint runs only in Vite development on the allowlisted QA project with a run ID and Rock UUID.</Refusal>);
} else {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root.render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><PanelFixture /></AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}
