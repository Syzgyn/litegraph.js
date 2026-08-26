/**
 * {@link ProxyHandler} that exposes a {@link Map} with object-like property access.
 *
 * Allows legacy code to use `map[key]` syntax while backing storage remains a
 * {@link Map}. Numeric string keys are parsed as integers before lookup.
 * @remarks
 * Temporary workaround until downstream consumers migrate to Map directly.
 * Does not support all Map prototype keys (`values`, `entries`, etc.) as property names.
 * @template V Value type stored in the wrapped map.
 */
export class MapProxyHandler<V> implements ProxyHandler<Map<number | string, V>> {
  /**
   * Binds Map prototype methods on a proxied instance so `this` refers to the map.
   *
   * Required because property access through the proxy can detach method `this` binding.
   * @param map The map instance to patch in place.
   */
  static bindAllMethods(map: Map<any, any>): void {
    map.clear = map.clear.bind(map)
    map.delete = map.delete.bind(map)
    map.forEach = map.forEach.bind(map)
    map.get = map.get.bind(map)
    map.has = map.has.bind(map)
    map.set = map.set.bind(map)
    map.entries = map.entries.bind(map)
    map.keys = map.keys.bind(map)
    map.values = map.values.bind(map)

    map[Symbol.iterator] = map[Symbol.iterator].bind(map)
  }

  /**
   * Returns a property descriptor when {@link get} would return a defined value.
   * @param target The proxied map.
   * @param p Property key or symbol.
   */
  getOwnPropertyDescriptor(
    target: Map<number | string, V>,
    p: string | symbol,
  ): PropertyDescriptor | undefined {
    const value = this.get(target, p)
    if (value) {
      return {
        configurable: true,
        enumerable: true,
        value,
      }
    }
  }

  /**
   * Reports whether the map contains an entry for property key {@link p}.
   * @param target The proxied map.
   * @param p Property key. Symbol keys always return `false`.
   */
  has(target: Map<number | string, V>, p: string | symbol): boolean {
    if (typeof p === "symbol") return false

    const int = Number(p)
    return target.has(!isNaN(int) ? int : p)
  }

  /**
   * Lists all map keys as strings for `Object.keys()`-style enumeration.
   * @param target The proxied map.
   */
  ownKeys(target: Map<number | string, V>): ArrayLike<string | symbol> {
    return [...target.keys()].map(String)
  }

  /**
   * Retrieves a map entry or Map prototype member by property key.
   * @param target The proxied map.
   * @param p Property key. Symbol keys return `undefined`.
   */
  get(target: Map<number | string, V>, p: string | symbol): any {
    // Workaround does not support link IDs of "values", "entries", "constructor", etc.
    // eslint-disable-next-line unicorn/no-computed-property-existence-check
    if (p in target) return Reflect.get(target, p, target)
    if (typeof p === "symbol") return

    const int = Number(p)
    return target.get(!isNaN(int) ? int : p)
  }

  /**
   * Sets a map entry via property assignment syntax.
   * @param target The proxied map.
   * @param p Property key. Symbol keys are ignored (`false` returned).
   * @param newValue Value to store.
   * @returns `true` when the value was written.
   */
  set(target: Map<number | string, V>, p: string | symbol, newValue: any): boolean {
    if (typeof p === "symbol") return false

    const int = Number(p)
    target.set(!isNaN(int) ? int : p, newValue)
    return true
  }

  /**
   * Deletes a map entry via `delete map[key]` syntax.
   * @param target The proxied map.
   * @param p Property key to delete.
   */
  deleteProperty(target: Map<number | string, V>, p: string | symbol): boolean {
    return target.delete(p as number | string)
  }
}
