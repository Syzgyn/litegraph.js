import type { SubgraphInputNode } from "./SubgraphInputNode"
import type { INodeInputSlot, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { RerouteId } from "@/Reroute"

import { LLink } from "@/LLink"
import { nextUniqueName } from "@/strings"
import { zeroUuid } from "@/utils/uuid"

import { SubgraphInput } from "./SubgraphInput"

/**
 * A placeholder subgraph input slot that materialises a real {@link SubgraphInput} on first connection.
 *
 * Rendered at the bottom of the {@link SubgraphInputNode} slot list. When the user drags a link
 * onto it, a new named input is added to the subgraph definition and the connection is completed
 * through that slot.
 * @remarks
 * Uses {@link zeroUuid} as its ID and an empty name/type so it is distinguishable from concrete
 * inputs. See {@link SubgraphInputNode.emptySlot}.
 * @see {@link EmptySubgraphOutput}
 * @see {@link SubgraphInputNode}
 */
export class EmptySubgraphInput extends SubgraphInput {
  /** The IO boundary node that owns this virtual slot. */
  declare parent: SubgraphInputNode

  /**
   * @param parent The subgraph input boundary node that displays this empty slot.
   */
  constructor(parent: SubgraphInputNode) {
    super({
      id: zeroUuid,
      name: "",
      type: "",
    }, parent)
  }

  /**
   * Creates a new subgraph input and connects the dragged link through it.
   *
   * Derives a unique name from the target input slot, calls {@link Subgraph.addInput}, then
   * delegates to the new {@link SubgraphInput.connect}.
   * @param slot The node input slot being connected from inside the subgraph.
   * @param node The node that owns {@link slot}.
   * @param afterRerouteId When the link passes through reroutes, the reroute after which the new
   * link segment should attach.
   * @returns The created {@link LLink}, or `undefined` if the connection was rejected.
   */
  override connect(slot: INodeInputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined {
    const { subgraph } = this.parent
    const existingNames = subgraph.inputs.map(x => x.name)

    const name = nextUniqueName(slot.name, existingNames)
    const input = subgraph.addInput(name, String(slot.type))
    return input.connect(slot, node, afterRerouteId)
  }

  /**
   * Canvas-space position for rendering this slot's label.
   *
   * Vertically centred on the right edge of the slot's bounding rectangle, matching the layout
   * of concrete {@link SubgraphInput} slots.
   */
  override get labelPos(): Point {
    const [x, y, , height] = this.boundingRect
    return [x, y + height * 0.5]
  }
}
