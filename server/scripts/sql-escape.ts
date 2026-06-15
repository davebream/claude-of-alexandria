/**
 * sql-escape.ts
 * Shared SQL-escaping helpers for seed scripts targeting Cloudflare D1 (SQLite).
 *
 * SQLite escaping rules:
 *   - Single quotes are escaped by doubling: ' → ''
 *   - Double quotes and backslashes are NOT treated as escape sequences and are
 *     left literal.
 *   - NULL is represented as the unquoted keyword NULL.
 */

/**
 * Escape a string value for safe inclusion in a SQLite statement.
 * Returns a single-quoted literal with any internal single quotes doubled.
 * Returns the unquoted keyword NULL for null/undefined input.
 */
export function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/**
 * Escape a numeric value for safe inclusion in a SQLite statement.
 * Returns the numeric value as a string, or the unquoted keyword NULL for
 * null/undefined input.
 */
export function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}
