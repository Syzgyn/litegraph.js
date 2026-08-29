import type { WidgetEventOptions } from "./BaseWidget"
import type { INumericWidget } from "@/types/widgets"

import { clampWidgetValue, evaluateInput, getWidgetStep } from "@/utils/widget"

import { BaseSteppedWidget } from "./BaseSteppedWidget"

/**
 * Numeric stepped widget (`type: "number"`) with min/max clamping, arrow buttons, prompt editor,
 * and horizontal drag adjustment.
 * @see `INumericWidget`
 */
export class NumberWidget extends BaseSteppedWidget<INumericWidget> implements INumericWidget {
  /** Widget type discriminator; always `"number"`. */
  override type = "number" as const

  /**
   * Fixed-precision display string for the current value.
   * @remarks Uses `options.precision` when set, otherwise three decimal places.
   */
  override get displayValue() {
    if (this.computedDisabled) return ""
    return Number(this.value).toFixed(
      this.options.precision !== undefined
        ? this.options.precision
        : 3,
    )
  }

  /** `true` when `value` is below `options.max` or no max is defined. */
  override canIncrement(): boolean {
    const { max } = this.options
    return max == null || this.value < max
  }

  /** `true` when `value` is above `options.min` or no min is defined. */
  override canDecrement(): boolean {
    const { min } = this.options
    return min == null || this.value > min
  }

  /** Adds one `getWidgetStep` increment. */
  override incrementValue(options: WidgetEventOptions): void {
    this.setValue(this.value + getWidgetStep(this.options), options)
  }

  /** Subtracts one `getWidgetStep` increment. */
  override decrementValue(options: WidgetEventOptions): void {
    this.setValue(this.value - getWidgetStep(this.options), options)
  }

  /**
   * Clamps to `options.min` / `options.max` then delegates to `BaseWidget.setValue`.
   * @param value Proposed numeric value.
   * @param options Event context for callbacks.
   */
  override setValue(value: number, options: WidgetEventOptions) {
    super.setValue(clampWidgetValue(this, value), options)
  }

  /**
   * Arrow zones step by one step; centre opens a prompt supporting simple arithmetic expressions.
   * @param options Click X position selects decrement, increment, or prompt zones.
   */
  override onClick({ e, node, canvas }: WidgetEventOptions) {
    const x = e.canvasX - node.pos[0]
    const width = this.width || node.size[0]

    // Determine if clicked on left/right arrows
    const delta = x < 40
      ? -1
      : (x > width - 40
        ? 1
        : 0)

    if (delta) {
      // Handle left/right arrow clicks
      this.setValue(this.value + delta * getWidgetStep(this.options), { e, node, canvas })
      return
    }

    // Handle center click - show prompt
    canvas.prompt("Value", this.value, (v: string) => {
      const parsed = evaluateInput(v)
      if (parsed !== undefined) this.setValue(parsed, { e, node, canvas })
    }, e)
  }

  /**
   * Horizontal drag away from arrow zones adjusts value by `deltaX * step`.
   * @param options Pointer delta and node width for zone detection.
   */
  override onDrag({ e, node, canvas }: WidgetEventOptions) {
    const width = this.width || node.width
    const x = e.canvasX - node.pos[0]
    const delta = x < 40
      ? -1
      : (x > width - 40
        ? 1
        : 0)

    if (delta && (x > -3 && x < width + 3)) return
    this.setValue(this.value + (e.deltaX ?? 0) * getWidgetStep(this.options), { e, node, canvas })
  }
}
