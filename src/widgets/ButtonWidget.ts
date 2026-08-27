import type { LGraphNode } from "@/LGraphNode"
import type { IButtonWidget } from "@/types/widgets"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Clickable button widget (`type: "button"`) that invokes `callback` instead of storing a
 * persistent value.
 *
 * Briefly highlights on click via `clicked`. The callback receives the widget instance as its
 * first argument rather than a value.
 * @see `IButtonWidget`
 */
export class ButtonWidget extends BaseWidget<IButtonWidget> implements IButtonWidget {
  /** Widget type discriminator; always `"button"`. */
  override type = "button" as const
  /**
   * When `true` on the next draw pass, the button renders a pressed highlight then resets to `false`.
   */
  clicked: boolean

  /**
   * @param widget Button definition POJO.
   * @param node Owning node.
   */
  constructor(widget: IButtonWidget, node: LGraphNode) {
    super(widget, node)
    this.clicked ??= false
  }

  /**
   * Draws a rectangular button with centred `displayName` text.
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

    // Draw button background
    ctx.fillStyle = this.background_color
    if (this.clicked) {
      ctx.fillStyle = "#AAA"
      this.clicked = false
    }
    ctx.fillRect(margin, y, width - margin * 2, height)

    // Draw button outline if not disabled
    if (showText && !this.computedDisabled) {
      ctx.strokeStyle = this.outline_color
      ctx.strokeRect(margin, y, width - margin * 2, height)
    }

    // Draw button text
    if (showText) this.drawLabel(ctx, width * 0.5)

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Draws centred button label text.
   * @param ctx Canvas context.
   * @param x Horizontal centre X for the text.
   */
  drawLabel(ctx: CanvasRenderingContext2D, x: number): void {
    ctx.textAlign = "center"
    ctx.fillStyle = this.text_color
    ctx.fillText(this.displayName, x, this.y + this.height * 0.7)
  }

  /**
   * Marks the button as clicked, redraws, and invokes `callback` with the widget instance.
   * @param options Pointer event, node, and canvas for the callback.
   */
  override onClick({ e, node, canvas }: WidgetEventOptions) {
    const pos = canvas.graph_mouse

    // Set clicked state and mark canvas as dirty
    this.clicked = true
    canvas.setDirty(true)

    // Call the callback with widget instance and other context
    this.callback?.(this, canvas, node, pos, e)
  }
}
