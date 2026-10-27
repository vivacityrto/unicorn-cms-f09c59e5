import type { RockLevel } from '@/types/eos';
import { clientForParent } from '@/utils/rockEditor/rules';
import type { ParentCandidate } from '@/utils/rockEditor/types';

export interface ClientOriginal {
  parentId: string | null;
  clientTenantId: number | null;
}

/**
 * The client to save with a Rock. Creating: an Individual Rock follows its parent.
 * Editing: the stored client is kept while the parent is unchanged (some saved
 * Individual Rocks pre-date the server's client check and would otherwise lose it),
 * and follows the new parent once it changes.
 */
export function resolveClient(options: {
  level: RockLevel;
  parentId: string | null;
  rocks: readonly ParentCandidate[];
  original?: ClientOriginal | null;
}): { clientTenantId: number | null; droppedFrom: number | null } {
  const { level, parentId, rocks, original } = options;
  if (original && original.parentId === parentId) {
    return { clientTenantId: original.clientTenantId, droppedFrom: null };
  }
  const parent = rocks.find(r => r.id === parentId);
  const clientTenantId = level === 'individual' ? clientForParent(level, parent) : original?.clientTenantId ?? null;
  const droppedFrom = original?.clientTenantId != null && clientTenantId !== original.clientTenantId ? original.clientTenantId : null;
  return { clientTenantId, droppedFrom };
}

/**
 * A saved client Individual Rock that is not under a Team Rock for its client in the
 * same quarter is offered one, so the choice is visible instead of made by the server.
 */
export function findClientRockOffer(options: {
  level: RockLevel;
  parentId: string | null;
  clientTenantId: number | null;
  quarterYear: number;
  quarterNumber: number;
  rocks: readonly ParentCandidate[];
}): ParentCandidate | null {
  const { level, parentId, clientTenantId, quarterYear, quarterNumber, rocks } = options;
  if (level !== 'individual' || clientTenantId == null) return null;
  const current = rocks.find(r => r.id === parentId);
  if (current?.level === 'team' && current.clientTenantId === clientTenantId) return null;
  return rocks
    .filter(r => r.level === 'team' && !r.archived && r.clientTenantId === clientTenantId && r.quarterYear === quarterYear && r.quarterNumber === quarterNumber)
    .sort((a, b) => a.title.localeCompare(b.title))[0] ?? null;
}
