import type { NeverNever, PickNevers } from "@/types/utility"

type EventListeners<T> = {
  readonly [K in keyof T]: ((this: EventTarget, ev: CustomEvent<T[K]>) => any) | EventListenerObject | null
}

/**
 * Typed listener registration contract for a {@link CustomEventTarget}.
 *
 * Mirrors the DOM {@link EventTarget.addEventListener} and
 * {@link EventTarget.removeEventListener} signatures but restricts event names and listener
 * payloads to those declared in {@link EventMap}.
 * @template EventMap - Record mapping event name strings to detail payload types. Keys mapped
 * to `never` represent events with no detail payload.
 * @template Keys - Union of string keys from {@link EventMap}; defaults to all keys.
 * @see {@link CustomEventTarget}
 * @see {@link CustomEventDispatcher}
 */
export interface ICustomEventTarget<
  EventMap extends Record<Keys, unknown>,
  Keys extends keyof EventMap & string = keyof EventMap & string,
> {
  /**
   * Registers a typed listener for the named event.
   * @param type Event name key from {@link EventMap}.
   * @param listener Callback invoked with a {@link CustomEvent} whose `detail` matches
   * {@link EventMap}[`type`].
   * @param options Standard DOM listener options (capture, once, passive, signal).
   */
  addEventListener<K extends Keys>(
    type: K,
    listener: EventListeners<EventMap>[K],
    options?: boolean | AddEventListenerOptions,
  ): void

  /**
   * Removes a previously registered typed listener.
   * @param type Event name key from {@link EventMap}.
   * @param listener The same listener reference passed to {@link addEventListener}.
   * @param options Capture flag or options object matching the original registration.
   */
  removeEventListener<K extends Keys>(
    type: K,
    listener: EventListeners<EventMap>[K],
    options?: boolean | EventListenerOptions,
  ): void

  /** @deprecated Use {@link CustomEventTarget.dispatch} instead of raw {@link EventTarget.dispatchEvent}. */
  dispatchEvent(event: never): boolean
}

/**
 * Typed event dispatch contract for a {@link CustomEventTarget}.
 *
 * Overloads ensure the `detail` argument is required for events with a payload and omitted for
 * events mapped to `never`.
 * @template EventMap - Record mapping event name strings to detail payload types.
 * @template Keys - Union of string keys from {@link EventMap}; defaults to all keys.
 * @see {@link CustomEventTarget.dispatch}
 */
export interface CustomEventDispatcher<
  EventMap extends Record<Keys, unknown>,
  Keys extends keyof EventMap & string = keyof EventMap & string,
> {
  /**
   * Dispatches an event that carries a detail payload.
   * @param type Event name whose {@link EventMap} entry is not `never`.
   * @param detail Payload attached to the {@link CustomEvent}.
   * @returns `true` if the event was not cancelled by a listener; `false` otherwise.
   */
  dispatch<T extends keyof NeverNever<EventMap>>(type: T, detail: EventMap[T]): boolean

  /**
   * Dispatches an event with no detail payload.
   * @param type Event name whose {@link EventMap} entry is `never`.
   * @returns `true` if the event was not cancelled by a listener; `false` otherwise.
   */
  dispatch<T extends keyof PickNevers<EventMap>>(type: T): boolean
}

/**
 * Strongly-typed {@link EventTarget} for custom application events.
 *
 * Subclass or instantiate directly to emit and listen for events defined by an event-map
 * interface (e.g. {@link LGraphEventMap}, {@link LinkConnectorEventMap}).
 * @template EventMap - Record mapping event name strings to detail payload types.
 * @template Keys - Union of string keys from {@link EventMap}; defaults to all keys.
 * @remarks
 * **Usage**
 *
 * 1. Define an event map:
 *    ```ts
 *    export interface CustomEventMap {
 *      "my-event": { message: string }
 *      "simple-event": never
 *    }
 *    ```
 *
 * 2. Create an emitter (subclass or direct instance):
 *    ```ts
 *    class MyClass extends CustomEventTarget<CustomEventMap> {}
 *    const events = new CustomEventTarget<CustomEventMap>()
 *    ```
 *
 * 3. Dispatch and listen:
 *    ```ts
 *    events.dispatch("my-event", { message: "Hello" })
 *    events.dispatch("simple-event")
 *    events.addEventListener("my-event", (ev) => console.log(ev.detail.message))
 *    ```
 * @see {@link ICustomEventTarget}
 * @see {@link CustomEventDispatcher}
 */
export class CustomEventTarget<
  EventMap extends Record<Keys, unknown>,
  Keys extends keyof EventMap & string = keyof EventMap & string,
>
  extends EventTarget implements ICustomEventTarget<EventMap, Keys> {
  /**
   * Dispatches a cancelable {@link CustomEvent} with optional typed detail.
   *
   * Prefer this over {@link EventTarget.dispatchEvent} to preserve type safety.
   * @param type Event name key from {@link EventMap}.
   * @param detail Payload for events that require one; omit for `never`-mapped events.
   * @returns `true` if no listener called {@link Event.preventDefault}; otherwise `false`.
   * @see {@link EventTarget.dispatchEvent}
   */
  dispatch<T extends keyof NeverNever<EventMap>>(type: T, detail: EventMap[T]): boolean
  dispatch<T extends keyof PickNevers<EventMap>>(type: T): boolean
  dispatch<T extends keyof EventMap>(type: T, detail?: EventMap[T]) {
    const event = new CustomEvent(type as string, { detail, cancelable: true })
    return super.dispatchEvent(event)
  }

  /**
   * Registers a typed listener for the named event.
   * @param type Event name key from {@link EventMap}.
   * @param listener Callback invoked with a {@link CustomEvent} whose `detail` matches the map entry.
   * @param options Standard DOM listener options (capture, once, passive, signal).
   */
  override addEventListener<K extends Keys>(
    type: K,
    listener: EventListeners<EventMap>[K],
    options?: boolean | AddEventListenerOptions,
  ): void {
    // Assertion: Contravariance on CustomEvent => Event
    super.addEventListener(type as string, listener as EventListener, options)
  }

  /**
   * Removes a previously registered typed listener.
   * @param type Event name key from {@link EventMap}.
   * @param listener The same listener reference passed to {@link addEventListener}.
   * @param options Capture flag or options object matching the original registration.
   */
  override removeEventListener<K extends Keys>(
    type: K,
    listener: EventListeners<EventMap>[K],
    options?: boolean | EventListenerOptions,
  ): void {
    // Assertion: Contravariance on CustomEvent => Event
    super.removeEventListener(type as string, listener as EventListener, options)
  }

  /** @deprecated Use {@link dispatch} instead. */
  override dispatchEvent(event: never): boolean {
    return super.dispatchEvent(event)
  }
}
