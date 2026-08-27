import type { IKnobWidget } from "@/types/widgets"

import { clamp } from "@/litegraph"
import { getWidgetStep } from "@/utils/widget"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Radial knob widget (`type: "knob"`) for numeric values within `options.min` / `options.max`.
 *
 * Renders a circular dial with conic gradient fill proportional to the current value. Supports
 * drag-to-adjust (horizontal or vertical movement) with shift-modified coarse steps. Height is
 * layout-driven via `computeLayoutSize` and `computedHeight`.
 * @see `IKnobWidget`
 */
export class KnobWidget extends BaseWidget<IKnobWidget> implements IKnobWidget {
  /** Widget type discriminator; always `"knob"`. */
  override type = "knob" as const

  /**
   * Accumulated pointer movement since `onClick`; used to threshold discrete step changes
   * during drag.
   */
  current_drag_offset = 0

  /**
   * Reports flexible min/max dimensions so layout can allocate a tall knob region.
   * @returns Minimum 60px height and 20px width with very large max bounds.
   */
  override computeLayoutSize(): {
    minHeight: number
    maxHeight?: number
    minWidth: number
    maxWidth?: number
  } {
    return {
      minHeight: 60,
      minWidth: 20,
      maxHeight: 1_000_000,
      maxWidth: 1_000_000,
    }
  }

  /** Uses `computedHeight` when layout has assigned extra vertical space. */
  override get height(): number {
    return this.computedHeight || super.height
  }

  /**
   * Draws the radial knob, value arc, optional outline, and centred label/value text.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  drawWidget(
    ctx: CanvasRenderingContext2D,
    {
      width,
      showText = true,
    }: DrawWidgetOptions,
  ): void {
    // Store original context attributes
    const { fillStyle, strokeStyle, textAlign } = ctx

    const { y } = this
    const { margin } = BaseWidget

    const { gradient_stops = "rgb(14, 182, 201); rgb(0, 216, 72)" } = this.options
    const effective_height = this.computedHeight || this.height
    // Draw background
    const size_modifier =
      Math.min(this.computedHeight || this.height, this.width || 20) / 20 // TODO: replace magic numbers
    const arc_center = { x: width / 2, y: effective_height / 2 + y }
    ctx.lineWidth =
      (Math.min(width, effective_height) - margin * size_modifier) / 6
    const arc_size =
      (Math.min(width, effective_height) -
        margin * size_modifier -
        ctx.lineWidth) / 2
    {
      const gradient = ctx.createRadialGradient(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth,
        0,
        0,
        arc_size + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(29, 29, 29)")
      gradient.addColorStop(1, "rgb(116, 116, 116)")
      ctx.fillStyle = gradient
    }
    ctx.beginPath()

    {
      ctx.arc(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth / 2,
        0,
        Math.PI * 2,
        false,
      )
      ctx.fill()
      ctx.closePath()
    }

    // Draw knob's background
    const arc = {
      start_angle: Math.PI * 0.6,
      end_angle: Math.PI * 2.4,
    }
    ctx.beginPath()
    {
      const gradient = ctx.createRadialGradient(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth,
        0,
        0,
        arc_size + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(99, 99, 99)")
      gradient.addColorStop(1, "rgb(36, 36, 36)")
      ctx.strokeStyle = gradient
    }
    ctx.arc(
      arc_center.x,
      arc_center.y,
      arc_size,
      arc.start_angle,
      arc.end_angle,
      false,
    )
    ctx.stroke()
    ctx.closePath()

    const range = this.options.max - this.options.min
    let nvalue = (this.value - this.options.min) / range
    nvalue = clamp(nvalue, 0, 1)

    // Draw value
    ctx.beginPath()
    const gradient = ctx.createConicGradient(
      arc.start_angle,
      arc_center.x,
      arc_center.y,
    )
    const gs = gradient_stops.split(";")
    for (const [index, stop] of gs.entries()) {
      gradient.addColorStop(index, stop.trim())
    }

    ctx.strokeStyle = gradient
    const value_end_angle =
      (arc.end_angle - arc.start_angle) * nvalue + arc.start_angle
    ctx.arc(
      arc_center.x,
      arc_center.y,
      arc_size,
      arc.start_angle,
      value_end_angle,
      false,
    )
    ctx.stroke()
    ctx.closePath()

    // Draw outline if not disabled
    if (showText && !this.computedDisabled) {
      ctx.strokeStyle = this.outline_color
      // Draw value
      ctx.beginPath()
      ctx.strokeStyle = this.outline_color
      ctx.arc(
        arc_center.x,
        arc_center.y,
        arc_size + ctx.lineWidth / 2,
        0,
        Math.PI * 2,
        false,
      )
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.closePath()
    }

    // Draw marker if present
    // TODO: TBD later when options work

    // Draw text
    if (showText) {
      ctx.textAlign = "center"
      ctx.fillStyle = this.text_color
      const fixedValue = Number(this.value).toFixed(this.options.precision ?? 3)
      ctx.fillText(
        `${this.label || this.name}\n${fixedValue}`,
        width * 0.5,
        y + effective_height * 0.5,
      )
    }

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Resets accumulated drag offset when the user begins a new drag gesture.
   */
  onClick(): void {
    this.current_drag_offset = 0
  }

  /**
   * Adjusts the value based on horizontal or vertical drag delta.
   * @param options Pointer deltas and shift key state; no-op when `options.read_only` is set.
   * @remarks Vertical drag is inverted so upward motion increases the value. Shift uses ~10%
   * range steps when larger than the base step.
   */
  override onDrag(options: WidgetEventOptions): void {
    if (this.options.read_only) return
    const { e } = options
    const step = getWidgetStep(this.options)
    // Shift to move by 10% increments
    const range = (this.options.max - this.options.min)
    const range_10_percent = range / 10
    const range_1_percent = range / 100
    const step_for = {
      delta_x: step,
      shift: range_10_percent > step ? range_10_percent - (range_10_percent % step) : step,
      delta_y: range_1_percent > step ? range_1_percent - (range_1_percent % step) : step, // 1% increments
    }

    const use_y = Math.abs(e.movementY) > Math.abs(e.movementX)
    const delta = use_y ? -e.movementY : e.movementX // Y is inverted so that UP increases the value
    const drag_threshold = 15
    // Calculate new value based on drag movement
    this.current_drag_offset += delta
    let adjustment = 0
    if (this.current_drag_offset > drag_threshold) {
      adjustment += 1
      this.current_drag_offset -= drag_threshold
    } else if (this.current_drag_offset < -drag_threshold) {
      adjustment -= 1
      this.current_drag_offset += drag_threshold
    }

    const step_with_shift_modifier = e.shiftKey
      ? step_for.shift
      : (use_y
        ? step_for.delta_y
        : step)

    const deltaValue = adjustment * step_with_shift_modifier
    const newValue = clamp(
      this.value + deltaValue,
      this.options.min,
      this.options.max,
    )
    if (newValue !== this.value) {
      this.setValue(newValue, options)
    }
  }
}
