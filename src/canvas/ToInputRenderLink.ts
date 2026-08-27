import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { NodeLike } from "@/types/NodeLike"

import { LinkDirection } from "@/types/globalEnums"

/**
 * Represents a new link being dragged **from** an output slot **to** an input slot.
 *
 * Created by `LinkConnector.dragNewFromOutput`, `LinkConnector.dragFromReroute`,
 * and `LinkConnector.dragFromLinkSegment`. On drop, `connectToInput` creates the
 * connection via `LGraphNode.connectSlots`.
 * @remarks
 * This is the "new link" counterpart to `MovingInputLink`, which repositions an existing
 * link's input end instead of creating one from scratch.
 * @see `ToOutputRenderLink`
 * @see `LinkConnector.dragNewFromOutput`
 */
export class ToInputRenderLink implements RenderLink {
  /** Always `"input"` — this link is being dragged toward an input slot. */
  readonly toType = "input"

  /** Canvas-space position where the rendered link segment originates. */
  readonly fromPos: Point

  /** Index of `fromSlot` on `node`. */
  readonly fromSlotIndex: number

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * Defaults to `LinkDirection.RIGHT` (output slots face right). May be overridden to
   * `LinkDirection.NONE` when dragging from a reroute.
   */
  fromDirection: LinkDirection = LinkDirection.RIGHT

  /**
   * @param network The graph (or subgraph) that will own the new link.
   * @param node The node whose output slot the link is being dragged from.
   * @param fromSlot The output slot at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin. Its
   * position becomes `fromPos` and its ID is passed as parentage when connecting.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @throws When `fromSlot` is not found on `node`.
   */
  constructor(
    readonly network: LinkNetwork,
    readonly node: LGraphNode,
    readonly fromSlot: INodeOutputSlot,
    readonly fromReroute?: Reroute,
    public dragDirection: LinkDirection = LinkDirection.CENTER,
  ) {
    const outputIndex = node.outputs.indexOf(fromSlot)
    if (outputIndex === -1) throw new Error(`Creating render link for node [${this.node.id}] failed: Slot index not found.`)

    this.fromSlotIndex = outputIndex
    this.fromPos = fromReroute
      ? fromReroute.pos
      : this.node.getOutputPos(outputIndex)
  }

  /**
   * Determines whether dropping onto the given input slot would produce a valid connection.
   *
   * Delegates to `LGraphNode.canConnectTo`, passing this link's origin output slot as the
   * upstream source.
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
   * Completes the drag by creating a new link to an input slot.
   *
   * No-op when the target node is the same as the origin node (loopback). Dispatches
   * `"link-created"` with the new `LLink` on success.
   * @param node The node that owns the target input slot.
   * @param input The input slot to connect to.
   * @param events Event target for dispatching `"link-created"`.
   */
  connectToInput(node: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>) {
    const { node: outputNode, fromSlot, fromReroute } = this
    if (node === outputNode) return

    const newLink = outputNode.connectSlots(fromSlot, node, input, fromReroute?.id)
    events.dispatch("link-created", newLink)
  }

  /**
   * Completes the drag by creating a link through a subgraph output boundary node.
   * @param output The subgraph output IO definition being dropped on.
   * @param events Dispatches `"link-created"` with the new link.
   */
  connectToSubgraphOutput(output: SubgraphOutput, events: CustomEventTarget<LinkConnectorEventMap>) {
    const newLink = output.connect(this.fromSlot, this.node, this.fromReroute?.id)
    events.dispatch("link-created", newLink)
  }

  /**
   * Completes the drag by connecting through a reroute's input side.
   *
   * Parents the drop-target reroute to `fromReroute`, creates the link via
   * `LGraphNode.connectSlots`, cleans up orphaned reroutes in the original chain, and
   * converts or removes floating links as needed.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node, slot, and existing link at the reroute terminus.
   * @param events Dispatches `"link-created"` with the new link.
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
    const { node: outputNode, fromSlot, fromReroute } = this

    // Check before creating new link overwrites the value
    const floatingTerminus = fromReroute?.floating?.slotType === "output"

    // Set the parentId of the reroute we dropped on, to the reroute we dragged from
    reroute.parentId = fromReroute?.id

    const newLink = outputNode.connectSlots(fromSlot, inputNode, input, link.parentId)

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
    events.dispatch("link-created", newLink)
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
   * @throws Always throws — use `connectToRerouteInput` instead.
   */
  connectToRerouteOutput() {
    throw new Error("ToInputRenderLink cannot connect to an output.")
  }
}
