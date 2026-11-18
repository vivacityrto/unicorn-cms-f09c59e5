/** The most rows the database returns for one request, whatever limit is asked for. */
export const PAGE_SIZE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Reads every row of a query by asking for one page at a time until a short page comes back. A single request
 * silently stops at PAGE_SIZE rows, which would undercount; this does not. The query must be ordered by something
 * unique, so pages never overlap or skip rows. `maxPages` is a backstop against a runaway loop, and it throws
 * rather than returning a partial answer.
 */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>, pageSize = PAGE_SIZE, maxPages = 50): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await fetchPage(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new Error('Too many rows to read in one go.');
}
