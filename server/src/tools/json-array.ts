/**
 * Zod preprocessing utility for array parameters that may be sent as JSON strings.
 *
 * XML-based tool calling formats (like Claude Code's tool use) send array parameters
 * as string literals containing JSON syntax, not as native JSON arrays:
 *
 *   <parameter name="lemmas">["H2617a", "H5315"]</parameter>
 *
 * The XML parser treats everything between tags as a string, so the MCP server
 * receives: lemmas: "[\"H2617a\", \"H5315\"]" (string, not array)
 *
 * This preprocessing allows schemas to accept both:
 * - Native arrays from MCP clients that send proper JSON
 * - JSON-encoded strings from XML-based tool calling formats
 */
import { z } from 'zod';

/**
 * Creates a Zod schema that accepts either:
 * 1. A native JavaScript array
 * 2. A JSON-encoded string that parses to an array
 *
 * Invalid JSON strings and non-array JSON values are rejected.
 *
 * @param innerSchema - The array schema to wrap (e.g., z.array(z.string()).min(1))
 * @returns A preprocessed schema that handles both formats, typed as the inner schema's output
 */
export function jsonArray<T extends z.ZodArray<any>>(innerSchema: T) {
  return z.preprocess(
    (val): unknown => {
      // Pass through non-strings (including arrays) unchanged
      if (typeof val !== 'string') {
        return val;
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(val);
        // Only return if it's an array; otherwise let Zod reject it
        return Array.isArray(parsed) ? parsed : val;
      } catch {
        // Invalid JSON - let Zod reject with original value
        return val;
      }
    },
    innerSchema
  ) as unknown as T;
}
