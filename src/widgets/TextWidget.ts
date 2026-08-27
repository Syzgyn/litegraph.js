import type { LGraphNode } from "@/LGraphNode"
import type { IStringWidget } from "@/types/widgets"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

/**
 * Single-line (or multiline prompt) text widget (`type: "string"` or `"text"`).
 *
 * Displays `value` with truncating layout; click opens `LGraphCanvas.prompt` for editing.
 * @see `IStringWidget`
 */
export class TextWidget extends BaseWidget<IStringWidget> implements IStringWidget {
  /**
   * @param widget String widget definition; `value` is coerced to string.
   * @param node Owning node.
   */
  constructor(widget: IStringWidget, node: LGraphNode) {
    super(widget, node)
    this.type ??= "string"
    this.value = widget.value?.toString() ?? ""
  }

  /**
   * Draws the standard capsule with truncating label and string value.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, {
    width,
    showText = true,
  }: DrawWidgetOptions) {
    // Store original context attributes
    const { fillStyle, strokeStyle, textAlign } = ctx

    this.drawWidgetShape(ctx, { width, showText })

    if (showText) {
      this.drawTruncatingText({ ctx, width, leftPadding: 0, rightPadding: 0 })
    }

    // Restore original context attributes
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Opens a text prompt (optionally multiline) to edit `value`.
   * @param options Canvas prompt uses current value and `options.multiline` from widget options.
   */
  override onClick({ e, node, canvas }: WidgetEventOptions) {
    // Show prompt dialog for text input
    canvas.prompt(
      "Value",
      this.value,
      (v: string) => {
        if (v !== null) {
          this.setValue(v, { e, node, canvas })
        }
      },
      e,
      this.options?.multiline ?? false,
    )
  }
}
