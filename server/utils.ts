/**
 * Shared server utilities.
 */

/**
 * Escape LIKE wildcard characters in a search string so user input
 * cannot inject SQL LIKE pattern characters (% and _).
 *
 * Usage: like(column, `%${escapeLike(userInput)}%`)
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Extract insertId from a Drizzle mysql2 insert result.
 *
 * Drizzle ORM with mysql2 can return either:
 *   - ResultSetHeader directly  → result.insertId
 *   - [ResultSetHeader, ...]    → result[0].insertId
 *
 * This helper handles both forms so callers don't need to guess.
 */
export function getInsertId(result: unknown): number {
  const r = result as any;
  const id = Array.isArray(r) ? r[0]?.insertId : r?.insertId;
  return Number(id);
}
