import type { ISliderWidget } from "@/types/widgets"

import { clamp } from "@/litegraph"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Horizontal slider widget (`type: "slider"`) for numeric values between `options.min` and
 * `options.max`.
 *
 * Click and drag map pointer X position to a value along the bar. An optional `marker`
 * displays a secondary position (e.g. default or reference value).
 * @see `ISliderWidget`
 */
export class SliderWidget extends BaseWidget<ISliderWidget> implements ISliderWidget {
  /** Widget type discriminator; always `"slider"`. */
  override type = "slider" as const

  /**
   * Optional secondary position drawn as a vertical marker on the slider track.
   * @remarks Normalised against the same min/max range as `value`.
   */
  marker?: number

  /**
   * Draws the slider track, filled value bar, optional marker, outline, and centred label/value text.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, {
    width,
    showText = true,
  }: DrawWidgetOptions) {
    // Store original context attributes
    const { fillStyle, strokeStyle, textAlign } = ctx

    const { height, y } = this
    const { margin } = BaseWidget

    // Draw background
    ctx.fillStyle = this.background_color
    ctx.fillRect(margin, y, width - margin * 2, height)

    // Calculate normalized value
    const range = this.options.max - this.options.min
    let nvalue = (this.value - this.options.min) / range
    nvalue = clamp(nvalue, 0, 1)

    // Draw slider bar
    ctx.fillStyle = this.options.slider_color ?? "#678"
    ctx.fillRect(margin, y, nvalue * (width - margin * 2), height)

    // Draw outline if not disabled
    if (showText && !this.computedDisabled) {
      ctx.strokeStyle = this.outline_color
      ctx.strokeRect(margin, y, width - margin * 2, height)
    }

    // Draw marker if present
    if (this.marker != null) {
      let marker_nvalue = (this.marker - this.options.min) / range
      marker_nvalue = clamp(marker_nvalue, 0, 1)
      ctx.fillStyle = this.options.marker_color ?? "#AA9"
      ctx.fillRect(
        margin + marker_nvalue * (width - margin * 2),
        y,
        2,
        height,
      )
    }

    // Draw text
    if (showText) {
      ctx.textAlign = "center"
      ctx.fillStyle = this.text_color
      const fixedValue = Number(this.value).toFixed(this.options.precision ?? 3)
      ctx.fillText(
        `${this.label || this.name}  ${fixedValue}`,
        width * 0.5,
        y + height * 0.7,
      )
    }

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Sets the value from click X position along the slider track.
   * @param options No-op when `options.read_only` is set.
   */
  override onClick(options: WidgetEventOptions) {
    if (this.options.read_only) return

    const { e, node } = options
    const width = this.width || node.size[0]
    const x = e.canvasX - node.pos[0]

    // Calculate new value based on click position
    const slideFactor = clamp((x - 15) / (width - 30), 0, 1)
    const newValue = this.options.min + (this.options.max - this.options.min) * slideFactor

    if (newValue !== this.value) {
      this.setValue(newValue, options)
    }
  }

  /**
   * Continuously updates the value while dragging along the slider track.
   * @param options No-op when `options.read_only` is set.
   * @returns `false` when read-only (legacy drag-handler contract).
   */
  override onDrag(options: WidgetEventOptions) {
    if (this.options.read_only) return false

    const { e, node } = options
    const width = this.width || node.size[0]
    const x = e.canvasX - node.pos[0]

    // Calculate new value based on drag position
    const slideFactor = clamp((x - 15) / (width - 30), 0, 1)
    const newValue = this.options.min + (this.options.max - this.options.min) * slideFactor

    if (newValue !== this.value) {
      this.setValue(newValue, options)
    }
  }
}
