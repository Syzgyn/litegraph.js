import type { ISlotType } from "./litegraph"

/**
 * Uses the standard String() function to coerce to string, unless the value is null or undefined - then null.
 * @param value The value to convert
 * @returns String(value) or null
 */
export function stringOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

/**
 * Uses the standard String() function to coerce to string, unless the value is null or undefined - then an empty string
 * @param value The value to convert
 * @returns String(value) or ""
 */
export function stringOrEmpty(value: unknown): string {
  return value == null ? "" : String(value)
}

/**
 * Parses a slot type string into normalised lowercase type tokens.
 *
 * Empty string and `"0"` are treated as the wildcard `"*"`. Comma-separated lists
 * are split into individual types.
 * @param type Raw slot type from a node slot definition.
 * @returns Array of normalised type strings (never empty — defaults to `["*"]`).
 */
export function parseSlotTypes(type: ISlotType): string[] {
  return type == "" || type == "0" ? ["*"] : String(type).toLowerCase().split(",")
}

/**
 * Creates a unique name by appending an underscore and a number to the end of the name
 * if it already exists.
 * @param name The name to make unique
 * @param existingNames The names that already exist. Default: an empty array
 * @returns The name, or a unique name if it already exists.
 *
 * Used by SubgraphInputNode to deduplicate input names when promoting
 * the same widget name from multiple node instances (e.g. `seed` → `seed_1`).
 * Extensions matching by slot name should account for the `_N` suffix.
 */
export function nextUniqueName(name: string, existingNames: string[] = []): string {
  let i = 1
  const baseName = name
  while (existingNames.includes(name)) {
    name = `${baseName}_${i++}`
  }
  return name
}
