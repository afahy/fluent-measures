export function changesParser(files: string[]): boolean;
export function codeChanged(path: string, before: string | null, after: string | null): boolean;
export function addedEntries(diff: string): { id?: unknown; source?: unknown }[];
export function ticketOf(body: string): string | null;
export function issueOf(body: string): number | null;
export function hasTicketEntry(
  entries: { source?: unknown }[],
  ticket: string | null,
  issue?: number | null
): boolean;
