import type { IColorable, IContextMenuValue, ISlotType } from "@/interfaces"

/**
 * Converts a plain object to a class instance if it is not already an instance of the class.
 *
 * Requires specific constructor signature; first parameter must be the object to convert.
 * @param cls The class to convert to
 * @param args The object to convert, followed by any other constructor arguments
 * @returns The class instance
 */
export function toClass<P, C extends P, Args extends unknown[]>(
  cls: new (instance: P, ...args: Args) => C,
  ...args: [P, ...Args]
): C {
  return args[0] instanceof cls ? args[0] : new cls(...args)
}

/**
 * Checks if an object is an instance of `IColorable`.
 */
export function isColorable(obj: unknown): obj is IColorable {
  return typeof obj === "object" && obj !== null && "setColorOption" in obj && "getColorOption" in obj
}

export function commonType(...types: ISlotType[]): ISlotType | undefined {
  if (!isStrings(types)) return undefined

  const withoutWildcards = types.filter(type => type !== "*")
  if (withoutWildcards.length === 0) return "*"

  const typeLists: string[][] = withoutWildcards.map(type => type.split(","))

  const combinedTypes = intersection(...typeLists)
  if (combinedTypes.length === 0) return undefined

  return combinedTypes.join(",")
}

function intersection(...sets: string[][]): string[] {
  const itemCounts: Record<string, number> = {}
  for (const set of sets) {
    for (const item of new Set(set))
      itemCounts[item] = (itemCounts[item] ?? 0) + 1
  }
  return Object.entries(itemCounts)
    .filter(([, count]) => count === sets.length)
    .map(([key]) => key)
}

function isStrings(types: unknown[]): types is string[] {
  return types.every(t => typeof t === "string")
}

/**
 * Checks whether a value is a structured {@link IContextMenuValue} menu entry.
 * Uses `"content"` as the discriminator (not `"value"`, which is too generic).
 */
export function isContextMenuValue<T = unknown>(
  value: unknown,
): value is IContextMenuValue<T> {
  return value != null && typeof value === "object" && "content" in value
}

/**
 * Returns the wire value from a context menu callback argument.
 * Plain strings are returned as-is; structured entries return their `.value`.
 */
export function getContextMenuWireValue<T>(
  selected: string | number | IContextMenuValue<T> | null | undefined,
): T | string | number | undefined | null {
  return isContextMenuValue(selected) ? selected.value : selected
}

/**
 * Returns the display label for a context menu callback argument.
 * Structured entries prefer `.content`, then fall back to stringifying `.value`.
 */
export function getContextMenuDisplayContent(selected: unknown): string {
  if (isContextMenuValue(selected)) {
    return selected.content ?? String(selected.value ?? "")
  }
  if (selected == null) return ""
  return String(selected)
}
