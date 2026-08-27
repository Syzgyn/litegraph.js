import type { IGradientSliderWidget } from "@/types/widgets"

import { clamp } from "@/litegraph"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

function valueFromPointer(
  widget: Pick<GradientSliderWidget, "options" | "value" | "width">,
  { e, node }: WidgetEventOptions,
): number {
  const width = widget.width || node.size[0]
  const x = e.canvasX - node.pos[0]
  const { margin } = BaseWidget
  const slideFactor = clamp((x - margin) / (width - margin * 2), 0, 1)
  return widget.options.min + (widget.options.max - widget.options.min) * slideFactor
}

/**
 * Horizontal gradient slider widget (`type: "gradientslider"`) for numeric values between
 * `options.min` and `options.max`.
 *
 * Click and drag map pointer X position to a value along the bar. Optional
 * {@link IWidgetGradientSliderOptions.gradient_stops} may be supplied for consumers that render
 * gradient styling outside the canvas.
 * @see {@link IGradientSliderWidget}
 */
export class GradientSliderWidget extends BaseWidget<IGradientSliderWidget> implements IGradientSliderWidget {
  /** Widget type discriminator; always `"gradientslider"`. */
  override type = "gradientslider" as const

  /**
   * Draws the slider track, filled value bar, outline, and centred label/value text.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, {
    width,
    showText = true,
  }: DrawWidgetOptions) {
    ctx.save()

    const { height, y } = this
    const { margin } = BaseWidget

    ctx.fillStyle = this.background_color
    ctx.fillRect(margin, y, width - margin * 2, height)

    const range = this.options.max - this.options.min
    let nvalue = (this.value - this.options.min) / range
    nvalue = clamp(nvalue, 0, 1)

    ctx.fillStyle = "#678"
    ctx.fillRect(margin, y, nvalue * (width - margin * 2), height)

    if (showText && !this.computedDisabled) {
      ctx.strokeStyle = this.outline_color
      ctx.strokeRect(margin, y, width - margin * 2, height)
    }

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

    ctx.restore()
  }

  /**
   * Sets the value from click X position along the slider track.
   * @param options No-op when `options.read_only` is set.
   */
  override onClick(options: WidgetEventOptions) {
    if (this.options.read_only) return

    const newValue = valueFromPointer(this, options)
    if (newValue !== this.value)
      this.setValue(newValue, options)
  }

  /**
   * Continuously updates the value while dragging along the slider track.
   * @param options No-op when `options.read_only` is set.
   * @returns `false` when read-only (legacy drag-handler contract).
   */
  override onDrag(options: WidgetEventOptions) {
    if (this.options.read_only) return false

    const newValue = valueFromPointer(this, options)
    if (newValue !== this.value)
      this.setValue(newValue, options)
  }
}
