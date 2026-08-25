/**
 * Creates a shallow copy of {@link obj} omitting entries whose values satisfy {@link predicate}.
 * @param obj The source object to filter.
 * @param predicate Called for each value; entries where this returns `true` are excluded.
 * @returns A new partial object containing only the entries that were not omitted.
 */
export function omitBy<T extends object>(obj: T, predicate: (value: any) => boolean): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_key, value]) => !predicate(value)),
  ) as Partial<T>
}
