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
  currentDragOffset = 0

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

    const { gradientStops = "rgb(14, 182, 201); rgb(0, 216, 72)" } = this.options
    const effectiveHeight = this.computedHeight || this.height
    // Draw background
    const sizeModifier =
      Math.min(this.computedHeight || this.height, this.width || 20) / 20 // TODO: replace magic numbers
    const arcCenter = { x: width / 2, y: effectiveHeight / 2 + y }
    ctx.lineWidth =
      (Math.min(width, effectiveHeight) - margin * sizeModifier) / 6
    const arcSize =
      (Math.min(width, effectiveHeight) -
        margin * sizeModifier -
        ctx.lineWidth) / 2
    {
      const gradient = ctx.createRadialGradient(
        arcCenter.x,
        arcCenter.y,
        arcSize + ctx.lineWidth,
        0,
        0,
        arcSize + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(29, 29, 29)")
      gradient.addColorStop(1, "rgb(116, 116, 116)")
      ctx.fillStyle = gradient
    }
    ctx.beginPath()

    {
      ctx.arc(
        arcCenter.x,
        arcCenter.y,
        arcSize + ctx.lineWidth / 2,
        0,
        Math.PI * 2,
        false,
      )
      ctx.fill()
      ctx.closePath()
    }

    // Draw knob's background
    const arc = {
      startAngle: Math.PI * 0.6,
      endAngle: Math.PI * 2.4,
    }
    ctx.beginPath()
    {
      const gradient = ctx.createRadialGradient(
        arcCenter.x,
        arcCenter.y,
        arcSize + ctx.lineWidth,
        0,
        0,
        arcSize + ctx.lineWidth,
      )
      gradient.addColorStop(0, "rgb(99, 99, 99)")
      gradient.addColorStop(1, "rgb(36, 36, 36)")
      ctx.strokeStyle = gradient
    }
    ctx.arc(
      arcCenter.x,
      arcCenter.y,
      arcSize,
      arc.startAngle,
      arc.endAngle,
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
      arc.startAngle,
      arcCenter.x,
      arcCenter.y,
    )
    const gs = gradientStops.split(";")
    for (const [index, stop] of gs.entries()) {
      gradient.addColorStop(index, stop.trim())
    }

    ctx.strokeStyle = gradient
    const valueEndAngle =
      (arc.endAngle - arc.startAngle) * nvalue + arc.startAngle
    ctx.arc(
      arcCenter.x,
      arcCenter.y,
      arcSize,
      arc.startAngle,
      valueEndAngle,
      false,
    )
    ctx.stroke()
    ctx.closePath()

    // Draw outline if not disabled
    if (showText && !this.computedDisabled) {
      ctx.strokeStyle = this.outlineColor
      // Draw value
      ctx.beginPath()
      ctx.strokeStyle = this.outlineColor
      ctx.arc(
        arcCenter.x,
        arcCenter.y,
        arcSize + ctx.lineWidth / 2,
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
      ctx.fillStyle = this.textColor
      const fixedValue = Number(this.value).toFixed(this.options.precision ?? 3)
      ctx.fillText(
        `${this.label || this.name}\n${fixedValue}`,
        width * 0.5,
        y + effectiveHeight * 0.5,
      )
    }

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Resets accumulated drag offset when the user begins a new drag gesture.
   */
  onClick(): void {
    this.currentDragOffset = 0
  }

  /**
   * Adjusts the value based on horizontal or vertical drag delta.
   * @param options Pointer deltas and shift key state; no-op when `options.readOnly` is set.
   * @remarks Vertical drag is inverted so upward motion increases the value. Shift uses ~10%
   * range steps when larger than the base step.
   */
  override onDrag(options: WidgetEventOptions): void {
    if (this.options.readOnly) return
    const { e } = options
    const step = getWidgetStep(this.options)
    // Shift to move by 10% increments
    const range = (this.options.max - this.options.min)
    const range10Percent = range / 10
    const range1Percent = range / 100
    const stepFor = {
      deltaX: step,
      shift: range10Percent > step ? range10Percent - (range10Percent % step) : step,
      deltaY: range1Percent > step ? range1Percent - (range1Percent % step) : step, // 1% increments
    }

    const useY = Math.abs(e.movementY) > Math.abs(e.movementX)
    const delta = useY ? -e.movementY : e.movementX // Y is inverted so that UP increases the value
    const dragThreshold = 15
    // Calculate new value based on drag movement
    this.currentDragOffset += delta
    let adjustment = 0
    if (this.currentDragOffset > dragThreshold) {
      adjustment += 1
      this.currentDragOffset -= dragThreshold
    } else if (this.currentDragOffset < -dragThreshold) {
      adjustment -= 1
      this.currentDragOffset += dragThreshold
    }

    const stepWithShiftModifier = e.shiftKey
      ? stepFor.shift
      : (useY
        ? stepFor.deltaY
        : step)

    const deltaValue = adjustment * stepWithShiftModifier
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
