/**
 * Parses a JSON string with a fallback value if parsing fails.
 *
 * @param json - The JSON string to parse
 * @param fallback - The value to return if parsing fails
 * @returns The parsed object or the fallback value
 *
 * @example
 * ```typescript
 * const data = parseJsonWithFallback('{"key": "value"}', {});
 * const invalid = parseJsonWithFallback('invalid', { default: true });
 * ```
 */
export function parseJsonWithFallback<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * @deprecated Use parseJsonWithFallback instead
 */
export const safeJsonParse = parseJsonWithFallback;
