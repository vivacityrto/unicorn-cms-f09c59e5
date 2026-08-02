import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScopeLock } from '@/components/ask-viv/AskVivScopeBanner';
import type { SelectedScope } from '@/components/ask-viv/AskVivScopeSelectorModal';

interface SessionScopeState {
  // User-confirmed or selected scope for the session
  sessionScope: SelectedScope;

  // Whether the user has confirmed an inferred scope
  scopeConfirmed: boolean;

  // Which tenant sessionScope applies to. Guards against a persisted scope
  // from tenant A silently leaking into tenant B after a page refresh.
  scopeTenantId: number | null;

  // Set confirmed scope from inferred values
  confirmScope: (scopeLock: ScopeLock, tenantId: number) => void;

  // Update scope manually
  setSessionScope: (scope: SelectedScope, tenantId: number) => void;

  // Clear session scope
  clearSessionScope: () => void;

  // Called whenever the resolved tenant changes; clears scope if it belongs
  // to a different tenant than the one now in view.
  ensureScopeForTenant: (tenantId: number | null) => void;

  // Log scope confirmation activity
  logScopeConfirmation: (userId: string, scopeLock: ScopeLock) => void;
}

const DEFAULT_SCOPE: SelectedScope = {
  client_id: null,
  client_name: null,
  package_id: null,
  package_name: null,
  phase_id: null,
  phase_name: null,
};

/**
 * Session-scoped store for Ask Viv scope management.
 * Persisted in localStorage so a refresh doesn't lose a confirmed scope
 * mid-conversation, but only for as long as the resolved tenant matches
 * scopeTenantId — see ensureScopeForTenant.
 */
export const useAskVivSessionScope = create<SessionScopeState>()(
  persist(
    (set, get) => ({
      sessionScope: DEFAULT_SCOPE,
      scopeConfirmed: false,
      scopeTenantId: null,

      confirmScope: (scopeLock: ScopeLock, tenantId: number) => {
        set({
          sessionScope: {
            client_id: scopeLock.client.id,
            client_name: scopeLock.client.label,
            package_id: scopeLock.package.id,
            package_name: scopeLock.package.label,
            phase_id: scopeLock.phase.id,
            phase_name: scopeLock.phase.label,
          },
          scopeConfirmed: true,
          scopeTenantId: tenantId,
        });
      },

      setSessionScope: (scope: SelectedScope, tenantId: number) => {
        set({
          sessionScope: scope,
          scopeConfirmed: true,
          scopeTenantId: tenantId,
        });
      },

      clearSessionScope: () => {
        set({
          sessionScope: DEFAULT_SCOPE,
          scopeConfirmed: false,
          scopeTenantId: null,
        });
      },

      ensureScopeForTenant: (tenantId: number | null) => {
        const { scopeTenantId } = get();
        if (scopeTenantId !== null && scopeTenantId !== tenantId) {
          set({
            sessionScope: DEFAULT_SCOPE,
            scopeConfirmed: false,
            scopeTenantId: tenantId,
          });
        } else if (scopeTenantId === null && tenantId !== null) {
          set({ scopeTenantId: tenantId });
        }
      },

      logScopeConfirmation: async (userId: string, scopeLock: ScopeLock) => {
        // Log scope confirmation as user activity (optional)
        // This could be extended to write to a user_activity table
        console.debug("[Ask Viv] Scope confirmed", {
          userId,
          client_inferred: scopeLock.client.inferred,
          package_inferred: scopeLock.package.inferred,
          phase_inferred: scopeLock.phase.inferred,
          timestamp: new Date().toISOString(),
        });
      },
    }),
    {
      name: 'ask-viv-session-scope',
      partialize: (state) => ({
        sessionScope: state.sessionScope,
        scopeConfirmed: state.scopeConfirmed,
        scopeTenantId: state.scopeTenantId,
      }),
    }
  )
);

/**
 * Helper to determine if session scope should override request scope.
 */
export function getEffectiveScope(
  sessionScope: SelectedScope,
  scopeConfirmed: boolean,
  requestScope: { client_id?: number | null; package_id?: number | null; phase_id?: number | null }
): { client_id: string | null; package_id: string | null; phase_id: string | null } {
  if (scopeConfirmed && sessionScope.client_id) {
    return {
      client_id: sessionScope.client_id,
      package_id: sessionScope.package_id,
      phase_id: sessionScope.phase_id,
    };
  }
  
  return {
    client_id: requestScope.client_id?.toString() ?? null,
    package_id: requestScope.package_id?.toString() ?? null,
    phase_id: requestScope.phase_id?.toString() ?? null,
  };
}
