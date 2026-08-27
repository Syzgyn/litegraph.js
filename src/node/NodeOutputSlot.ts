import type { INodeInputSlot, INodeOutputSlot, OptionalProps, ReadOnlyPoint } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LinkId } from "@/LLink"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"

import { LabelPosition } from "@/draw"
import { LiteGraph } from "@/litegraph"
import { type IDrawOptions, NodeSlot } from "@/node/NodeSlot"
import { isSubgraphOutput } from "@/subgraph/subgraphUtils"

/**
 * Concrete implementation of an `INodeOutputSlot` on an `LGraphNode`.
 *
 * Output slots send data to one or more input slots via `LLink` connections. Unlike inputs,
 * a single output may fan out to multiple downstream links.
 * @see `NodeInputSlot`
 * @see `NodeSlot`
 */
export class NodeOutputSlot extends NodeSlot implements INodeOutputSlot {
  #node: LGraphNode

  /** Arbitrary runtime data attached to this slot. Not serialised. */
  data?: unknown

  /**
   * IDs of all `LLink` instances connected from this slot, or `null` when none are connected.
   *
   * An empty array is treated as disconnected by `isConnected`.
   */
  links: LinkId[] | null

  /** Legacy index used by some custom nodes to identify this slot. */
  slot_index?: number

  /**
   * @param slot Serialised or partial slot properties used to initialise this instance.
   * @param node The parent node that owns this output slot.
   */
  constructor(slot: OptionalProps<INodeOutputSlot, "boundingRect">, node: LGraphNode) {
    super(slot, node)
    this.links = slot.links
    this.data = slot.data
    this.slot_index = slot.slot_index
    this.#node = node
  }

  /** Output slots are never widget-backed; always returns `false`. */
  get isWidgetInputSlot(): false {
    return false
  }

  /**
   * Canvas-space position of this slot's centre when the parent node is collapsed.
   *
   * Output slots are rendered on the right edge of the collapsed node title bar, offset by the
   * node's collapsed width.
   */
  get collapsedPos(): ReadOnlyPoint {
    return [
      this.#node.collapsed_width ?? LiteGraph.NODE_COLLAPSED_WIDTH,
      LiteGraph.NODE_TITLE_HEIGHT * -0.5,
    ]
  }

  /**
   * Determines whether a dragging link originating from `fromSlot` may connect to an input
   * that would receive data from this output.
   *
   * Validates type compatibility via `LiteGraph.isValidConnection` for input slots and
   * `SubgraphOutput` boundary nodes.
   * @param fromSlot The slot at the free end of the link being dragged.
   * @returns `true` if the connection types are compatible.
   */
  override isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean {
    if ("link" in fromSlot) {
      return LiteGraph.isValidConnection(this.type, fromSlot.type)
    }

    if (isSubgraphOutput(fromSlot)) {
      return LiteGraph.isValidConnection(this.type, fromSlot.type)
    }

    return false
  }

  /** Whether at least one link is currently connected from this slot. */
  override get isConnected(): boolean {
    return this.links != null && this.links.length > 0
  }

  /**
   * Renders this output slot on the canvas.
   *
   * Labels are drawn to the left of the slot shape with right-aligned text and a black stroke outline.
   * @param ctx The 2D rendering context for the node canvas.
   * @param options Drawing options excluding label position and stroke, which are fixed for outputs.
   */
  override draw(ctx: CanvasRenderingContext2D, options: Omit<IDrawOptions, "doStroke" | "labelPosition">) {
    const { textAlign, strokeStyle } = ctx
    ctx.textAlign = "right"
    ctx.strokeStyle = "black"

    super.draw(ctx, {
      ...options,
      labelPosition: LabelPosition.Left,
      doStroke: true,
    })

    ctx.textAlign = textAlign
    ctx.strokeStyle = strokeStyle
  }
}
