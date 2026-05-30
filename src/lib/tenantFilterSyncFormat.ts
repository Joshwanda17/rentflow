/**
 * Single source of truth for formatting the tenant filter "last updated"
 * timestamp across the app. Timezone-aware so users always see when the
 * filter was saved locally or synced to their account in their own locale.
 */

const SHORT_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
};

const LONG_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'long',
};

/** Compact inline label, e.g. "Jun 1, 2026, 02:30 PM EAT". */
export function formatTenantSyncShort(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleString(undefined, SHORT_OPTS);
}

/** Verbose label with full timezone name for tooltips. */
export function formatTenantSyncLong(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleString(undefined, LONG_OPTS);
}
