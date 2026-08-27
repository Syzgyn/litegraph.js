import type { ReadOnlyRect, ReadOnlySize, Size } from "@/interfaces"

import { clamp } from "@/litegraph"

/**
 * Mutable width/height pair with independent min/max constraints.
 *
 * Used by `SubgraphSlot` to measure slot label dimensions: callers set
 * `desiredWidth` and `desiredHeight`, and the readonly `width` and
 * `height` properties reflect the clamped result.
 * @remarks
 * Constraint bounds (`minWidth`, `maxWidth`, etc.) are writable and take effect
 * on the next desired-size assignment.
 * @see `SubgraphSlotBase.measurement`
 */
export class ConstrainedSize {
  #width: number = 0
  #height: number = 0
  #desiredWidth: number = 0
  #desiredHeight: number = 0

  /** Minimum allowed `width` after clamping. Defaults to `0`. */
  minWidth: number = 0

  /** Minimum allowed `height` after clamping. Defaults to `0`. */
  minHeight: number = 0

  /** Maximum allowed `width` after clamping. Defaults to `Infinity`. */
  maxWidth: number = Infinity

  /** Maximum allowed `height` after clamping. Defaults to `Infinity`. */
  maxHeight: number = Infinity

  /**
   * @param width Initial desired width; clamped immediately using current min/max bounds.
   * @param height Initial desired height; clamped immediately using current min/max bounds.
   */
  constructor(width: number, height: number) {
    this.desiredWidth = width
    this.desiredHeight = height
  }

  /**
   * Creates a `ConstrainedSize` from a `ReadOnlySize` tuple.
   * @param size `[width, height]` pair to use as initial desired dimensions.
   * @returns A new instance with clamped `width` and `height`.
   */
  static fromSize(size: ReadOnlySize): ConstrainedSize {
    return new ConstrainedSize(size[0], size[1])
  }

  /**
   * Creates a `ConstrainedSize` from the width and height components of a rectangle.
   * @param rect `[x, y, width, height]` tuple; only indices 2 and 3 are used.
   * @returns A new instance sized to the rectangle's dimensions.
   */
  static fromRect(rect: ReadOnlyRect): ConstrainedSize {
    return new ConstrainedSize(rect[2], rect[3])
  }

  /** Current clamped width; updated whenever `desiredWidth` changes. */
  get width() {
    return this.#width
  }

  /** Current clamped height; updated whenever `desiredHeight` changes. */
  get height() {
    return this.#height
  }

  /** Unclamped width request; assigning triggers clamping into `width`. */
  get desiredWidth() {
    return this.#desiredWidth
  }

  set desiredWidth(value: number) {
    this.#desiredWidth = value
    this.#width = clamp(value, this.minWidth, this.maxWidth)
  }

  /** Unclamped height request; assigning triggers clamping into `height`. */
  get desiredHeight() {
    return this.#desiredHeight
  }

  set desiredHeight(value: number) {
    this.#desiredHeight = value
    this.#height = clamp(value, this.minHeight, this.maxHeight)
  }

  /**
   * Sets both desired dimensions from a `ReadOnlySize` tuple.
   * @param size `[width, height]` pair to assign to `desiredWidth` and `desiredHeight`.
   */
  setSize(size: ReadOnlySize): void {
    this.desiredWidth = size[0]
    this.desiredHeight = size[1]
  }

  /**
   * Sets both desired dimensions from scalar values.
   * @param width Desired width before clamping.
   * @param height Desired height before clamping.
   */
  setValues(width: number, height: number): void {
    this.desiredWidth = width
    this.desiredHeight = height
  }

  /**
   * @returns The current clamped dimensions as a `Size` tuple `[width, height]`.
   */
  toSize(): Size {
    return [this.#width, this.#height]
  }
}
