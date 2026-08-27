import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { NodeLike } from "@/types/NodeLike"
import type { SubgraphIO } from "@/types/serialisation"

import { LinkDirection } from "@/types/globalEnums"

import { MovingLinkBase } from "./MovingLinkBase"

/**
 * Represents an existing link whose **input** end is being dragged to a new connection target.
 *
 * Created by `LinkConnector.moveInputLink` when the user begins dragging a link away from
 * an input slot. The output side of the link remains fixed; only the input side is repositioned
 * on drop.
 * @remarks
 * This is the input-side counterpart to `MovingOutputLink`. Instances are short-lived and
 * should be discarded when the drag operation completes. See `MovingLinkBase` for shared
 * link metadata (input/output nodes, slots, positions, etc.).
 * @see `LinkConnector.moveInputLink`
 * @see `MovingOutputLink`
 */
export class MovingInputLink extends MovingLinkBase {
  /** Always `"input"` — links being dragged by this class reconnect to a new input slot on drop. */
  override readonly toType = "input"

  /**
   * The node at the fixed (output) end of the link being moved.
   *
   * During the drag, this is the node whose output slot the link is still connected to.
   * Used for rendering the link origin and for type-compatibility checks against candidate inputs.
   */
  readonly node: LGraphNode

  /**
   * The output slot at the fixed end of the link being moved.
   *
   * Matches `MovingLinkBase.outputSlot`. Exposed here as `fromSlot` to satisfy the
   * `RenderLink` interface, which describes all drag operations from the perspective of
   * where the rendered link segment originates.
   */
  readonly fromSlot: INodeOutputSlot

  /**
   * Canvas-space position where the dragged link segment is rendered from.
   *
   * When the link passes through reroutes, this is the position of `MovingLinkBase.fromReroute`;
   * otherwise it falls back to `MovingLinkBase.outputPos`.
   */
  readonly fromPos: Point

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * Always `LinkDirection.NONE` for input-side moves, because the free end of the link
   * follows the cursor without a fixed facing constraint at the origin.
   */
  readonly fromDirection: LinkDirection

  /** Index of `fromSlot` on `node`. Equivalent to `MovingLinkBase.outputIndex`. */
  readonly fromSlotIndex: number

  /** When true, dropping near `disconnectOrigin` disconnects the link instead of reconnecting. */
  disconnectOnDrop: boolean

  /** Canvas position of the input slot for fast-disconnect circle hit testing. */
  readonly disconnectOrigin?: Point

  /**
   * @param network The graph (or subgraph) that owns the link and its nodes.
   * @param link The existing `LLink` whose input end is being repositioned.
   * @param fromReroute When the link chain starts at a reroute rather than directly at the output
   * slot, the first reroute in the chain. Its position becomes `fromPos` and it may be
   * hidden during the drag.
   * @param dragDirection Controls how the free end of the link follows the cursor. Defaults to
   * `LinkDirection.CENTER`.
   */
  constructor(network: LinkNetwork, link: LLink, fromReroute?: Reroute, dragDirection: LinkDirection = LinkDirection.CENTER, startPoint?: Point) {
    super(network, link, "input", fromReroute, dragDirection)

    this.node = this.outputNode
    this.fromSlot = this.outputSlot
    this.fromPos = fromReroute?.pos ?? this.outputPos
    this.fromDirection = LinkDirection.NONE
    this.fromSlotIndex = this.outputIndex
    this.disconnectOnDrop = true
    this.disconnectOrigin = startPoint ?? this.inputPos
  }

  /**
   * Determines whether dropping onto the given input slot would produce a valid connection.
   *
   * Delegates to `LGraphNode.canConnectTo`, passing this link's fixed output node and slot
   * as the upstream source. Also accepts `SubgraphIO` slots when dropping onto subgraph
   * boundary nodes.
   * @param inputNode The node that owns the candidate input slot.
   * @param input The input slot (or subgraph IO definition) being hovered or dropped on.
   */
  canConnectToInput(inputNode: NodeLike, input: INodeInputSlot | SubgraphIO): boolean {
    return this.node.canConnectTo(inputNode, input, this.outputSlot)
  }

  /**
   * Input-side moves never reconnect to an output slot.
   * @returns Always `false`. Used by `LinkConnector` hover/drop validation alongside other
   * `RenderLink` implementations.
   */
  canConnectToOutput(): false {
    return false
  }

  /**
   * Determines whether the dragged link may be dropped onto a reroute.
   *
   * Prevents connecting a link to a reroute that originates from the same node as this link's
   * current input, which would create a degenerate loop.
   * @param reroute The reroute under the pointer.
   */
  canConnectToReroute(reroute: Reroute): boolean {
    return reroute.originId !== this.inputNode.id
  }

  /**
   * Reconnects the link's input end to a new input slot.
   *
   * If the target slot is the link's current input, the call is a no-op. Otherwise, the existing
   * input connection is removed and `LGraphNode.connectSlots` creates or updates the
   * connection while preserving reroute parentage via `LLink.parentId`.
   * @param inputNode The node that owns the target input slot.
   * @param input The input slot to connect to.
   * @param events Dispatches `"input-moved"` when the connection succeeds, allowing listeners
   * to react to the completed reposition.
   * @returns The resulting `LLink`, or `undefined` if no connection was made.
   */
  connectToInput(inputNode: LGraphNode, input: INodeInputSlot, events: CustomEventTarget<LinkConnectorEventMap>): LLink | null | undefined {
    if (input === this.inputSlot) return

    this.inputNode.disconnectInput(this.inputIndex, true)
    const link = this.outputNode.connectSlots(this.outputSlot, inputNode, input, this.fromReroute?.id)
    if (link) events.dispatch("input-moved", this)
    return link
  }

  /**
   * Input-side moves cannot terminate on an output slot.
   * @throws Always throws — this operation is not supported for this link type.
   */
  connectToOutput(): never {
    throw new Error("MovingInputLink cannot connect to an output.")
  }

  /**
   * Input-side moves cannot terminate on a subgraph input boundary.
   * @throws Always throws — subgraph inputs are sources, not sinks, for this operation.
   */
  connectToSubgraphInput(): void {
    throw new Error("MovingInputLink cannot connect to a subgraph input.")
  }

  /**
   * Reconnects the link through a subgraph output boundary node.
   *
   * Used when the user drops a moving input link onto a `SubgraphOutput`. Creates a new
   * link from this link's fixed output slot to the subgraph output, optionally preserving reroute
   * parentage from `MovingLinkBase.fromReroute`.
   * @param output The subgraph output IO node being dropped on.
   * @param events When provided, dispatches `"link-created"` with the new link.
   */
  connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const newLink = output.connect(this.fromSlot, this.node, this.fromReroute?.id)
    events?.dispatch("link-created", newLink)
  }

  /**
   * Reconnects the link by attaching it to a reroute's input side.
   *
   * Used when the user drops onto an intermediate reroute rather than directly onto a node slot.
   * The reroute being dropped on is parented to `MovingLinkBase.fromReroute`, orphaned
   * reroutes in the original chain are cleaned up, and `LGraphNode.connectSlots` completes
   * the connection while retaining any downstream reroute chain via `LLink.parentId`.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node, slot, and existing link at the reroute terminus.
   * @param events Dispatches `"input-moved"` after the connection is made.
   * @param originalReroutes Reroutes in the chain between the drop target and the drag origin,
   * used to clean up orphaned reroutes after reconnection.
   */
  connectToRerouteInput(
    reroute: Reroute,
    { node: inputNode, input, link: existingLink }: { node: LGraphNode, input: INodeInputSlot, link: LLink },
    events: CustomEventTarget<LinkConnectorEventMap>,
    originalReroutes: Reroute[],
  ): void {
    const { outputNode, outputSlot, fromReroute } = this

    // Clean up reroutes
    for (const reroute of originalReroutes) {
      if (reroute.id === this.link.parentId) break

      if (reroute.totalLinks === 1) reroute.remove()
    }
    // Set the parentId of the reroute we dropped on, to the reroute we dragged from
    reroute.parentId = fromReroute?.id

    const newLink = outputNode.connectSlots(outputSlot, inputNode, input, existingLink.parentId)
    if (newLink) events.dispatch("input-moved", this)
  }

  /**
   * Input-side moves cannot terminate on a reroute's output side.
   * @throws Always throws — use `connectToRerouteInput` instead.
   */
  connectToRerouteOutput(): never {
    throw new Error("MovingInputLink cannot connect to an output.")
  }

  /**
   * Disconnects the link at its input end, leaving the output side unchanged.
   *
   * Called by `LinkConnector.disconnectLinks` when the user drops links onto empty canvas
   * (e.g. a delete/bin gesture) rather than onto a valid target.
   * @returns Whether the disconnection succeeded.
   */
  disconnect(): boolean {
    return this.inputNode.disconnectInput(this.inputIndex, true)
  }
}
