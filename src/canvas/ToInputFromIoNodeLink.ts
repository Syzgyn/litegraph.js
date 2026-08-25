import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import type { NodeLike } from "@/types/NodeLike"

import { LinkDirection } from "@/types/globalEnums"

/**
 * Represents a link being dragged **from** a subgraph input boundary **to** an input slot.
 *
 * Created by {@link LinkConnector.dragNewFromSubgraphInput}, {@link LinkConnector.dragFromReroute},
 * and {@link LinkConnector.moveInputLink} (for subgraph input links). The origin is a
 * {@link SubgraphInput} exposed on the subgraph's {@link SubgraphInputNode}.
 * @remarks
 * Subgraph inputs act as virtual outputs inside the subgraph — data flows from the parent graph
 * into the subgraph through these boundary slots. This class handles both creating new links and
 * moving existing subgraph-input links.
 * @see {@link ToOutputFromIoNodeLink}
 * @see {@link LinkConnector.dragNewFromSubgraphInput}
 */
export class ToInputFromIoNodeLink implements RenderLink {
  /** Always `"input"` — this link is being dragged toward an input slot. */
  readonly toType = "input"

  /** Index of {@link fromSlot} on {@link node}. */
  readonly fromSlotIndex: number

  /** Canvas-space position where the rendered link segment originates. */
  readonly fromPos: Point

  /**
   * The direction the link segment faces as it leaves {@link fromPos}.
   *
   * Defaults to {@link LinkDirection.RIGHT}. May be overridden to {@link LinkDirection.NONE}
   * when dragging from a reroute.
   */
  fromDirection: LinkDirection = LinkDirection.RIGHT

  /**
   * When set, the drag is repositioning an existing link rather than creating a new one.
   *
   * Set by {@link LinkConnector.moveInputLink} for subgraph input links. Affects which event
   * is dispatched on connect (`"input-moved"` vs `"link-created"`).
   */
  readonly existingLink?: LLink

  /**
   * @param network The subgraph that owns the input boundary.
   * @param node The {@link SubgraphInputNode} displaying the subgraph inputs.
   * @param fromSlot The {@link SubgraphInput} at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @param existingLink When repositioning an existing link, the {@link LLink} being moved.
   * @throws When {@link fromSlot} is not found on {@link node} (unless it is the empty slot).
   */
  constructor(
    readonly network: LinkNetwork,
    readonly node: SubgraphInputNode,
    readonly fromSlot: SubgraphInput,
    readonly fromReroute?: Reroute,
    public dragDirection: LinkDirection = LinkDirection.CENTER,
    existingLink?: LLink,
  ) {
    const outputIndex = node.slots.indexOf(fromSlot)
    if (outputIndex === -1 && fromSlot !== node.emptySlot) {
      throw new Error(`Creating render link for node [${this.node.id}] failed: Slot index not found.`)
    }

    this.fromSlotIndex = outputIndex
    this.fromPos = fromReroute
      ? fromReroute.pos
      : fromSlot.pos
    this.existingLink = existingLink
  }

  /**
   * Determines whether dropping onto the given input slot would produce a valid connection.
   *
   * Delegates to {@link SubgraphInputNode.canConnectTo}, passing this link's origin
   * {@link SubgraphInput} as the upstream source.
   * @param inputNode The node that owns the candidate input slot.
   * @param input The input slot being hovered or dropped on.
   */
  canConnectToInput(inputNode: NodeLike, input: INodeInputSlot): boolean {
    return this.node.canConnectTo(inputNode, input, this.fromSlot)
  }

  /**
   * Input-directed drags never terminate on an output slot.
   * @returns Always `false`.
   */
  canConnectToOutput(): false {
    return false
  }

  /**
   * Completes the drag by connecting the subgraph input to an input slot inside the subgraph.
   *
   * Dispatches `"input-moved"` when {@link existingLink} is set, otherwise `"link-created"`.
   * @param node The node that owns the target input slot.
   * @param input The input slot to connect to.
   * @param events Event target for dispatching connection lifecycle events.
   */
  connectToInput(node: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>) {
    const { fromSlot, fromReroute, existingLink } = this

    const newLink = fromSlot.connect(input, node, fromReroute?.id)

    if (existingLink) {
      // Moving an existing link
      events.dispatch("input-moved", this)
    } else {
      // Creating a new link
      events.dispatch("link-created", newLink)
    }
  }

  /**
   * Subgraph-input drags cannot terminate on a subgraph output boundary.
   * @throws Always throws — not implemented for this link type.
   */
  connectToSubgraphOutput(): void {
    throw new Error("Not implemented")
  }

  /**
   * Completes the drag by connecting through a reroute's input side.
   *
   * Parents the drop-target reroute to {@link fromReroute}, creates the link via
   * {@link SubgraphInput.connect}, cleans up orphaned reroutes, and dispatches the appropriate
   * lifecycle event based on whether {@link existingLink} is set.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node, slot, and existing link at the reroute terminus.
   * @param events Dispatches `"input-moved"` or `"link-created"`.
   * @param originalReroutes Reroutes in the chain between the drop target and the drag origin.
   */
  connectToRerouteInput(
    reroute: Reroute,
    {
      node: inputNode,
      input,
      link,
    }: { node: LGraphNode, input: INodeInputSlot, link: LLink },
    events: CustomEventTarget<LinkConnectorEventMap>,
    originalReroutes: Reroute[],
  ) {
    const { fromSlot, fromReroute } = this

    // Check before creating new link overwrites the value
    const floatingTerminus = fromReroute?.floating?.slotType === "output"

    // Set the parentId of the reroute we dropped on, to the reroute we dragged from
    reroute.parentId = fromReroute?.id

    const newLink = fromSlot.connect(input, inputNode, link.parentId)

    // Connecting from the final reroute of a floating reroute chain
    if (floatingTerminus) fromReroute.removeAllFloatingLinks()

    // Clean up reroutes
    for (const reroute of originalReroutes) {
      if (reroute.id === fromReroute?.id) break

      reroute.removeLink(link)
      if (reroute.totalLinks === 0) {
        if (link.isFloating) {
          // Cannot float from both sides - remove
          reroute.remove()
        } else {
          // Convert to floating
          const cl = link.toFloating("output", reroute.id)
          this.network.addFloatingLink(cl)
          reroute.floating = { slotType: "output" }
        }
      }
    }

    if (this.existingLink) {
      // Moving an existing link
      events.dispatch("input-moved", this)
    } else {
      // Creating a new link
      events.dispatch("link-created", newLink)
    }
  }

  /**
   * Input-directed drags cannot terminate on an output slot.
   * @throws Always throws — this operation is not supported for this link type.
   */
  connectToOutput() {
    throw new Error("ToInputRenderLink cannot connect to an output.")
  }

  /**
   * Input-directed drags cannot terminate on a subgraph input boundary.
   * @throws Always throws — subgraph inputs are sources, not sinks, for this operation.
   */
  connectToSubgraphInput(): void {
    throw new Error("ToInputRenderLink cannot connect to a subgraph input.")
  }

  /**
   * Input-directed drags cannot terminate on a reroute's output side.
   * @throws Always throws — use {@link connectToRerouteInput} instead.
   */
  connectToRerouteOutput() {
    throw new Error("ToInputRenderLink cannot connect to an output.")
  }

  /**
   * Disconnects the subgraph-input link at its target input slot.
   * @returns Whether a link was disconnected.
   */
  disconnect(): boolean {
    if (!this.existingLink) return false
    this.existingLink.disconnect(this.network, "input")
    return true
  }
}
