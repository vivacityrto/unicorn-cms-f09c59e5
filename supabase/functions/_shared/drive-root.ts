/**
 * Walk a DriveItem's parent chain and fail closed unless it reaches rootItemId.
 * The caller supplies the Graph lookup so this remains independently testable.
 * The hop budget is an explicit Graph-request bound; cycle detection handles
 * malformed or cyclic parent data without relying on the old fixed 20-level
 * assumption.
 */
const MAX_PARENT_HOPS = 64;

export async function isDriveItemWithinRoot(
  itemId: string,
  rootItemId: string,
  getParentId: (itemId: string) => Promise<string | null>,
): Promise<boolean> {
  let currentId = itemId;
  const visited = new Set<string>();

  for (let hops = 0; hops <= MAX_PARENT_HOPS; hops++) {
    if (currentId === rootItemId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    if (hops === MAX_PARENT_HOPS) return false;

    const parentId = await getParentId(currentId);
    if (!parentId) return false;
    if (parentId === rootItemId) return true;
    currentId = parentId;
  }

  return false;
}
