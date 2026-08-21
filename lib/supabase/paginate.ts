// ---------------------------------------------------------------------
// Fetches every row of a query, regardless of how many there are.
//
// PostgREST (what Supabase's REST API runs on) caps an unbounded select
// at a project-configured row limit — commonly 1000, and not something
// this codebase controls or can assume is a fixed number. A query with
// no `.range()` silently returns only the first page up to that cap; a
// bug from a truncated cap does not throw or come back empty, it comes
// back PLAUSIBLE — a real subset of real rows, just not all of them —
// which is exactly what makes it dangerous. That is how a therapist's
// commission total quietly dropped from 141 treatments to 61: nothing
// errored, the number just started lying, matching the fake ~5-8jt
// bad demo volume the team happened to be testing with that pushed the
// tenant over the cap for the first time.
//
// This loops with an explicit `.range()` per page and keeps going until
// a page comes back smaller than requested — correct no matter what the
// project's actual cap is set to, and it costs nothing extra when the
// real row count is small (one page, one round trip).
// ---------------------------------------------------------------------

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  pageFetch: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await pageFetch(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break; // last page — fewer rows than asked means nothing is left
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}
