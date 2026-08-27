import type { SubgraphInput } from "./SubgraphInput"
import type { SubgraphOutputNode } from "./SubgraphOutputNode"
import type { INodeInputSlot, INodeOutputSlot, Point, ReadOnlyRect } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { RerouteId } from "@/Reroute"

import { LiteGraph } from "@/litegraph"
import { LLink } from "@/LLink"
import { NodeSlotType } from "@/types/globalEnums"
import { removeFromArray } from "@/utils/collections"

import { SubgraphSlot } from "./SubgraphSlotBase"
import { isNodeSlot, isSubgraphInput } from "./subgraphUtils"

/**
 * An output boundary slot that bridges a subgraph interior to a parent graph.
 *
 * IMPORTANT: A subgraph "output" is both an output AND an input. It creates an extra link
 * connection point between a parent graph and a subgraph, so is conceptually similar to a reroute.
 *
 * When editing inside the subgraph, this slot is the **target** (input side) of links coming from
 * internal node outputs. On the parent {@link SubgraphNode}, the corresponding slot is a normal
 * output.
 * @see {@link SubgraphInput}
 * @see {@link SubgraphOutputNode}
 */
export class SubgraphOutput extends SubgraphSlot {
  /** The IO boundary node that owns and lays out this slot. */
  declare parent: SubgraphOutputNode

  /**
   * Connects an internal node output to this subgraph output boundary.
   *
   * Replaces any existing link on this output slot. Creates a link whose origin is the internal
   * node output and whose target is this slot on the {@link SubgraphOutputNode}.
   * @param slot The internal node output to connect from.
   * @param node The node that owns {@link slot}.
   * @param afterRerouteId Optional reroute ID when the link chain continues through reroutes.
   * @returns The created {@link LLink}, or `undefined` if the connection was rejected.
   */
  override connect(slot: INodeOutputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined {
    const { subgraph } = this.parent

    // Validate type compatibility
    if (!LiteGraph.isValidConnection(slot.type, this.type)) return

    // Allow nodes to block connection
    const outputIndex = node.outputs.indexOf(slot)
    if (outputIndex === -1) throw new Error("Slot is not an output of the given node")

    if (node.onConnectOutput?.(outputIndex, this.type, this, this.parent, -1) === false) return

    // Link should not be present, but just in case, disconnect it
    const existingLink = this.getLinks().at(0)
    if (existingLink != null) {
      subgraph.beforeChange()

      existingLink.disconnect(subgraph, "input")
      const resolved = existingLink.resolve(subgraph)
      const links = resolved.output?.links
      if (links) removeFromArray(links, existingLink.id)
    }

    const link = new LLink(
      ++subgraph.state.lastLinkId,
      slot.type,
      node.id,
      outputIndex,
      this.parent.id,
      this.parent.slots.indexOf(this),
      afterRerouteId,
    )

    // Add to graph links list
    subgraph.links.set(link.id, link)

    // Set link ID in each slot
    this.linkIds[0] = link.id
    slot.links ??= []
    slot.links.push(link.id)

    // Reroutes
    const reroutes = LLink.getReroutes(subgraph, link)
    for (const reroute of reroutes) {
      reroute.linkIds.add(link.id)
      if (reroute.floating) delete reroute.floating
      reroute.dragging = undefined
    }

    // If this is the terminus of a floating link, remove it
    const lastReroute = reroutes.at(-1)
    if (lastReroute) {
      for (const linkId of lastReroute.floatingLinkIds) {
        const link = subgraph.floatingLinks.get(linkId)
        if (link?.parentId === lastReroute.id) {
          subgraph.removeFloatingLink(link)
        }
      }
    }
    subgraph.incrementVersion()

    node.onConnectionsChange?.(
      NodeSlotType.OUTPUT,
      outputIndex,
      true,
      link,
      slot,
    )

    subgraph.afterChange()

    return link
  }

  /**
   * Canvas-space position for rendering this slot's label.
   *
   * Offset to the right of the connection circle, vertically centred on the slot.
   */
  get labelPos(): Point {
    const [x, y, , height] = this.boundingRect
    return [x + height, y + height * 0.5]
  }

  /**
   * Positions this slot within the output boundary node's layout.
   *
   * For outputs, the connection circle sits on the left edge of the IO node panel.
   * @param rect `[left, top, width, height]` in canvas space.
   */
  override arrange(rect: ReadOnlyRect): void {
    const [left, top, width, height] = rect
    const { boundingRect: b, pos } = this

    b[0] = left
    b[1] = top
    b[2] = width
    b[3] = height

    pos[0] = left + height * 0.5
    pos[1] = top + height * 0.5
  }

  /**
   * Checks if this slot is a valid target for a connection from the given slot.
   * For SubgraphOutput (which acts as an input inside the subgraph),
   * the fromSlot should be an output slot.
   * @param fromSlot The slot being dragged toward this output boundary slot.
   * @returns `true` when types are compatible and the source is an output or subgraph input.
   */
  override isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean {
    if (isNodeSlot(fromSlot)) {
      return "links" in fromSlot && LiteGraph.isValidConnection(fromSlot.type, this.type)
    }

    if (isSubgraphInput(fromSlot)) {
      return LiteGraph.isValidConnection(fromSlot.type, this.type)
    }

    return false
  }

  override disconnect(): void {
    const { subgraph } = this.parent
    // should never have more than one connection
    for (const linkId of this.linkIds) {
      const link = subgraph.getLink(linkId)
      if (!link) continue
      subgraph.removeLink(linkId)
      const { output, outputNode } = link.resolve(subgraph)
      if (output)
        output.links = output.links?.filter(id => id !== linkId) ?? null
      outputNode?.onConnectionsChange?.(
        NodeSlotType.OUTPUT,
        link.origin_slot,
        false,
        link,
        this,
      )
    }
    this.linkIds.length = 0
  }
}
