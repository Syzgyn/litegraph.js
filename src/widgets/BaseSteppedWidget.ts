import type { IBaseWidget } from "@/types/widgets"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Abstract base for widgets with left/right stepped controls ({@link NumberWidget}, {@link ComboWidget}).
 *
 * Extends {@link BaseWidget} with arrow-button rendering and increment/decrement semantics. The
 * default {@link drawWidget} draws the standard capsule, arrow buttons, and truncating label/value text.
 * @see {@link BaseWidget}
 */
export abstract class BaseSteppedWidget<TWidget extends IBaseWidget = IBaseWidget> extends BaseWidget<TWidget> {
  /**
   * Whether the increment (right) arrow should be drawn as active.
   * @returns `true` when another step in the positive direction is allowed.
   */
  abstract canIncrement(): boolean
  /**
   * Whether the decrement (left) arrow should be drawn as active.
   * @returns `true` when another step in the negative direction is allowed.
   */
  abstract canDecrement(): boolean
  /**
   * Applies one positive step to the widget value via {@link setValue}.
   * @param options Pointer and canvas context for the interaction.
   */
  abstract incrementValue(options: WidgetEventOptions): void
  /**
   * Applies one negative step to the widget value via {@link setValue}.
   * @param options Pointer and canvas context for the interaction.
   */
  abstract decrementValue(options: WidgetEventOptions): void

  /**
   * Renders left and right chevron buttons at the widget capsule edges.
   * @param ctx Canvas context (path may be left dirty).
   * @param width Full node width used to position the right arrow.
   * @remarks Arrow colour reflects {@link canDecrement}/{@link canIncrement}; disabled arrows use
   * {@link disabledTextColor}.
   */
  drawArrowButtons(ctx: CanvasRenderingContext2D, width: number) {
    const { height, text_color, disabledTextColor, y } = this
    const { arrowMargin, arrowWidth, margin } = BaseWidget
    const arrowTipX = margin + arrowMargin
    const arrowInnerX = arrowTipX + arrowWidth

    // Draw left arrow
    ctx.fillStyle = this.canDecrement() ? text_color : disabledTextColor
    ctx.beginPath()
    ctx.moveTo(arrowInnerX, y + 5)
    ctx.lineTo(arrowTipX, y + height * 0.5)
    ctx.lineTo(arrowInnerX, y + height - 5)
    ctx.fill()

    // Draw right arrow
    ctx.fillStyle = this.canIncrement() ? text_color : disabledTextColor
    ctx.beginPath()
    ctx.moveTo(width - arrowInnerX, y + 5)
    ctx.lineTo(width - arrowTipX, y + height * 0.5)
    ctx.lineTo(width - arrowInnerX, y + height - 5)
    ctx.fill()
  }

  /**
   * Default stepped-widget draw: capsule shape, arrow buttons, and truncating label/value text.
   * @param ctx Canvas 2D context.
   * @param options Node width and optional low-quality flag.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions) {
    // Store original context attributes
    const { fillStyle, strokeStyle, textAlign } = ctx

    this.drawWidgetShape(ctx, options)
    if (options.showText) {
      if (!this.computedDisabled) this.drawArrowButtons(ctx, options.width)

      this.drawTruncatingText({ ctx, width: options.width })
    }

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }
}
