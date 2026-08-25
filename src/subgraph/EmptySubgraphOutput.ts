import type { SubgraphOutputNode } from "./SubgraphOutputNode"
import type { INodeOutputSlot, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { RerouteId } from "@/Reroute"

import { LLink } from "@/LLink"
import { nextUniqueName } from "@/strings"
import { zeroUuid } from "@/utils/uuid"

import { SubgraphOutput } from "./SubgraphOutput"

/**
 * A placeholder subgraph output slot that materialises a real {@link SubgraphOutput} on first connection.
 *
 * Rendered at the bottom of the {@link SubgraphOutputNode} slot list. When the user drags a link
 * onto it from an internal node output, a new named output is added to the subgraph definition
 * and the connection is completed through that slot.
 * @remarks
 * Uses {@link zeroUuid} as its ID and an empty name/type so it is distinguishable from concrete
 * outputs. See {@link SubgraphOutputNode.emptySlot}.
 * @see {@link EmptySubgraphInput}
 * @see {@link SubgraphOutputNode}
 */
export class EmptySubgraphOutput extends SubgraphOutput {
  /** The IO boundary node that owns this virtual slot. */
  declare parent: SubgraphOutputNode

  /**
   * @param parent The subgraph output boundary node that displays this empty slot.
   */
  constructor(parent: SubgraphOutputNode) {
    super({
      id: zeroUuid,
      name: "",
      type: "",
    }, parent)
  }

  /**
   * Creates a new subgraph output and connects the dragged link through it.
   *
   * Derives a unique name from the source output slot, calls {@link Subgraph.addOutput}, then
   * delegates to the new {@link SubgraphOutput.connect}.
   * @param slot The node output slot being connected from inside the subgraph.
   * @param node The node that owns {@link slot}.
   * @param afterRerouteId When the link passes through reroutes, the reroute after which the new
   * link segment should attach.
   * @returns The created {@link LLink}, or `undefined` if the connection was rejected.
   */
  override connect(slot: INodeOutputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined {
    const { subgraph } = this.parent
    const existingNames = subgraph.outputs.map(x => x.name)

    const name = nextUniqueName(slot.name, existingNames)
    const output = subgraph.addOutput(name, String(slot.type))
    return output.connect(slot, node, afterRerouteId)
  }

  /**
   * Canvas-space position for rendering this slot's label.
   *
   * Vertically centred and offset to the right of the slot circle, matching the layout of
   * concrete {@link SubgraphOutput} slots.
   */
  override get labelPos(): Point {
    const [x, y, , height] = this.boundingRect
    return [x, y + height * 0.5]
  }
}
