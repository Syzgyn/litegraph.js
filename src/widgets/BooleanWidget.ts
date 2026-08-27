import type { IBooleanWidget } from "@/types/widgets"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Boolean toggle widget (`type: "toggle"`) rendered as a capsule with an on/off indicator disc.
 *
 * Clicking anywhere on the widget flips `value`. Display strings come from
 * `options.on` / `options.off` when provided, defaulting to `"true"` / `"false"`.
 * @see `IBooleanWidget`
 */
export class BooleanWidget extends BaseWidget<IBooleanWidget> implements IBooleanWidget {
  /** Widget type discriminator; always `"toggle"`. */
  override type = "toggle" as const

  /**
   * Draws the toggle capsule, coloured status disc, label, and on/off text.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, {
    width,
    showText = true,
  }: DrawWidgetOptions) {
    const { height, y } = this
    const { margin } = BaseWidget

    this.drawWidgetShape(ctx, { width, showText })

    ctx.fillStyle = this.value ? "#89A" : "#333"
    ctx.beginPath()
    ctx.arc(
      width - margin * 2,
      y + height * 0.5,
      height * 0.36,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    if (showText) {
      this.drawLabel(ctx, margin * 2)
      this.drawValue(ctx, width - 40)
    }
  }

  /**
   * Draws the widget label at the given X coordinate.
   * @param ctx Canvas context.
   * @param x Left edge X position for the label text.
   */
  drawLabel(ctx: CanvasRenderingContext2D, x: number): void {
    // Draw label
    ctx.fillStyle = this.secondary_text_color
    const { displayName } = this
    if (displayName) ctx.fillText(displayName, x, this.labelBaseline)
  }

  /**
   * Draws the on/off display string aligned to the right at the given X coordinate.
   * @param ctx Canvas context.
   * @param x Right-edge X position for the value text.
   */
  drawValue(ctx: CanvasRenderingContext2D, x: number): void {
    // Draw value
    ctx.fillStyle = this.value ? this.text_color : this.secondary_text_color
    ctx.textAlign = "right"
    const value = this.value ? this.options.on || "true" : this.options.off || "false"
    ctx.fillText(value, x, this.labelBaseline)
  }

  /**
   * Toggles `value` on click.
   * @param options Pointer event context passed to `setValue`.
   */
  override onClick(options: WidgetEventOptions) {
    this.setValue(!this.value, options)
  }
}
