import type { INodeInputSlot, INodeOutputSlot, OptionalProps, ReadOnlyPoint } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LinkId } from "@/LLink"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { IBaseWidget } from "@/types/widgets"

import { LabelPosition } from "@/draw"
import { LiteGraph } from "@/litegraph"
import { type IDrawOptions, NodeSlot } from "@/node/NodeSlot"
import { isSubgraphInput } from "@/subgraph/subgraphUtils"

/**
 * Concrete implementation of an {@link INodeInputSlot} on an {@link LGraphNode}.
 *
 * Input slots receive data from output slots via {@link LLink} connections. A single input slot
 * holds at most one link, and may optionally be bound to a widget (a "widget input slot").
 * @see {@link NodeOutputSlot}
 * @see {@link NodeSlot}
 */
export class NodeInputSlot extends NodeSlot implements INodeInputSlot {
  /** The ID of the {@link LLink} connected to this slot, or `null` if disconnected. */
  link: LinkId | null
  alwaysVisible?: boolean

  /**
   * Whether this input slot is backed by a widget rather than a traditional socket.
   *
   * Widget input slots are rendered without a visible label and use the widget's layout position.
   */
  get isWidgetInputSlot(): boolean {
    return !!this.widget
  }

  #widget: WeakRef<IBaseWidget> | undefined

  /**
   * The widget associated with this input slot, if any.
   * @remarks Internal use only; API is not finalised and may change at any time.
   */
  get _widget(): IBaseWidget | undefined {
    return this.#widget?.deref()
  }

  /** @see {@link _widget} */
  set _widget(widget: IBaseWidget | undefined) {
    this.#widget = widget ? new WeakRef(widget) : undefined
  }

  /**
   * Canvas-space position of this slot's centre when the parent node is collapsed.
   *
   * Input slots are always rendered on the left edge of the collapsed node title bar.
   */
  get collapsedPos(): ReadOnlyPoint {
    return [0, LiteGraph.NODE_TITLE_HEIGHT * -0.5]
  }

  /**
   * @param slot Serialised or partial slot properties used to initialise this instance.
   * @param node The parent node that owns this input slot.
   */
  constructor(slot: OptionalProps<INodeInputSlot, "boundingRect">, node: LGraphNode) {
    super(slot, node)
    this.link = slot.link
  }

  /** Whether this slot currently has an active link connected to it. */
  override get isConnected(): boolean {
    return this.link != null
  }

  /**
   * Determines whether a dragging link originating from {@link fromSlot} may connect here.
   *
   * Validates type compatibility via {@link LiteGraph.isValidConnection} for output slots and
   * {@link SubgraphInput} boundary nodes.
   * @param fromSlot The slot at the free end of the link being dragged.
   * @returns `true` if the connection types are compatible.
   */
  override isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean {
    if ("links" in fromSlot) {
      return LiteGraph.isValidConnection(fromSlot.type, this.type)
    }

    if (isSubgraphInput(fromSlot)) {
      return LiteGraph.isValidConnection(fromSlot.type, this.type)
    }

    return false
  }

  /**
   * Renders this input slot on the canvas.
   *
   * Labels are drawn to the right of the slot shape with left-aligned text and no stroke outline.
   * @param ctx The 2D rendering context for the node canvas.
   * @param options Drawing options excluding label position and stroke, which are fixed for inputs.
   */
  override draw(ctx: CanvasRenderingContext2D, options: Omit<IDrawOptions, "doStroke" | "labelPosition">) {
    const { textAlign } = ctx
    ctx.textAlign = "left"

    super.draw(ctx, {
      ...options,
      labelPosition: LabelPosition.Right,
      doStroke: false,
    })

    ctx.textAlign = textAlign
  }
}
