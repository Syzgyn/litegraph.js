/**
 * General-purpose TypeScript utility types used across the codebase.
 */

/**
 * {@link Pick} only the properties whose values evaluate to `never`.
 *
 * Useful for extracting impossible or uninitialised keys from a type.
 */
export type PickNevers<T> = {
  [K in keyof T as T[K] extends never ? K : never]: T[K]
}

/**
 * {@link Omit} all properties whose values evaluate to `never`.
 *
 * Produces a type with only the keys that have assignable value types.
 */
export type NeverNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K]
}
