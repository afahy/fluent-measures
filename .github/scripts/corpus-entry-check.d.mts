export function addedEntries(diff: string): { id?: unknown; source?: unknown }[];
export function ticketOf(body: string): string | null;
export function hasTicketEntry(entries: { source?: unknown }[], ticket: string | null): boolean;
