import type { LGraphNode } from "@/LGraphNode"
import type { IBaseWidget } from "@/types/widgets"

import { LiteGraph } from "@/litegraph"

import { BaseWidget, type DrawWidgetOptions } from "./BaseWidget"

/**
 * Adapter that wraps legacy plain-object custom widgets in the {@link BaseWidget} interface.
 *
 * Delegates drawing to the original `draw` function while routing value changes through the
 * standard {@link BaseWidget} pipeline where possible.
 * @remarks Support will eventually be removed. Expect breaking changes without warning.
 * Third-party click handling still occurs via {@link LGraphCanvas} mouse callbacks, not
 * {@link onClick} here.
 * @see {@link toConcreteWidget}
 */
export class LegacyWidget<TWidget extends IBaseWidget = IBaseWidget> extends BaseWidget<TWidget> implements IBaseWidget {
  /**
   * Legacy draw hook from the wrapped POJO widget.
   * @param ctx Canvas context.
   * @param node Owning node.
   * @param widget_width Node width for layout.
   * @param y Widget Y offset within the node.
   * @param H Standard widget row height.
   * @param lowQuality When `true`, skip expensive text and strokes.
   */
  draw?(
    ctx: CanvasRenderingContext2D,
    node: LGraphNode,
    widget_width: number,
    y: number,
    H: number,
    lowQuality?: boolean,
  ): void

  /**
   * Forwards to the legacy `draw` method when present.
   * @param ctx Canvas 2D context.
   * @param options Width and low-quality flag from the canvas draw pass.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions) {
    const H = LiteGraph.NODE_WIDGET_HEIGHT
    this.draw?.(ctx, this.node, options.width, this.y, H, !!options.showText)
  }

  /**
   * No-op placeholder; legacy widgets handle clicks via {@link LGraphCanvas} mouse routing.
   */
  override onClick() {
    console.warn("Custom widget wrapper onClick was just called. Handling for third party widgets is done via LGraphCanvas - the mouse callback.")
  }
}
