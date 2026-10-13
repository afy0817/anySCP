import i18n from "../i18n";

/**
 * Parse a timestamp string from SQLite into a Date.
 * SQLite's `datetime('now')` returns UTC without a trailing "Z", which
 * `new Date()` would otherwise interpret as local time. Append "Z" so the
 * string is parsed as UTC.
 */
export function parseSqliteUtc(isoDate: string): Date {
  return new Date(isoDate.endsWith("Z") ? isoDate : isoDate + "Z");
}

/**
 * Format an ISO date string as a human-readable relative time.
 * Handles SQLite UTC strings without the trailing "Z".
 */
export function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = parseSqliteUtc(isoDate).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return i18n.t("core:time.justNow");
  if (minutes < 60) return i18n.t("core:time.minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t("core:time.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return i18n.t("core:time.yesterday");
  if (days < 30) return i18n.t("core:time.daysAgo", { days });
  return i18n.t("core:time.monthsAgo", { months: Math.floor(days / 30) });
}
