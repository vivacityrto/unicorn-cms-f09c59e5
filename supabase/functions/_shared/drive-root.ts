/**
 * Walk a DriveItem's parent chain and fail closed unless it reaches rootItemId.
 * The caller supplies the Graph lookup so this remains independently testable.
 */
export async function isDriveItemWithinRoot(
  itemId: string,
  rootItemId: string,
  getParentId: (itemId: string) => Promise<string | null>,
): Promise<boolean> {
  let currentId = itemId;

  for (let depth = 0; depth < 20; depth++) {
    if (currentId === rootItemId) return true;

    const parentId = await getParentId(currentId);
    if (!parentId) return false;
    if (parentId === rootItemId) return true;
    currentId = parentId;
  }

  return false;
}
