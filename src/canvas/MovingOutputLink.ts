import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { NodeLike } from "@/types/NodeLike"
import type { SubgraphIO } from "@/types/serialisation"

import { LinkDirection } from "@/types/globalEnums"

import { MovingLinkBase } from "./MovingLinkBase"

/**
 * Represents an existing link whose **output** end is being dragged to a new connection target.
 *
 * Created by `LinkConnector.moveOutputLink` when the user begins dragging one or more links
 * away from an output slot. The input side of each link remains fixed; only the output side is
 * repositioned on drop.
 * @remarks
 * This is the output-side counterpart to `MovingInputLink`. Instances are short-lived and
 * should be discarded when the drag operation completes. See `MovingLinkBase` for shared
 * link metadata (input/output nodes, slots, positions, etc.).
 * @see `LinkConnector.moveOutputLink`
 * @see `MovingInputLink`
 */
export class MovingOutputLink extends MovingLinkBase {
  /** Always `"output"` — links being dragged by this class reconnect to a new output slot on drop. */
  override readonly toType = "output"

  /**
   * The node at the fixed (input) end of the link being moved.
   *
   * During the drag, this is the node whose input slot the link is still connected to.
   * Used for rendering the link origin and for type-compatibility checks against candidate outputs.
   */
  readonly node: LGraphNode

  /**
   * The input slot at the fixed end of the link being moved.
   *
   * Matches `MovingLinkBase.inputSlot`. Exposed here as `fromSlot` to satisfy the
   * `RenderLink` interface, which describes all drag operations from the perspective of
   * where the rendered link segment originates.
   */
  readonly fromSlot: INodeInputSlot

  /**
   * Canvas-space position where the dragged link segment is rendered from.
   *
   * When the link passes through reroutes, this is the position of `MovingLinkBase.fromReroute`;
   * otherwise it falls back to `MovingLinkBase.inputPos`.
   */
  readonly fromPos: Point

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * Always `LinkDirection.LEFT` for output-side moves, because the fixed input slot sits
   * to the right of the drag cursor during an output reposition.
   */
  readonly fromDirection: LinkDirection

  /** Index of `fromSlot` on `node`. Equivalent to `MovingLinkBase.inputIndex`. */
  readonly fromSlotIndex: number

  /**
   * @param network The graph (or subgraph) that owns the link and its nodes.
   * @param link The existing `LLink` whose output end is being repositioned.
   * @param fromReroute When the link chain starts at a reroute rather than directly at the input
   * slot, the first reroute in the chain. Its position becomes `fromPos` and it may be
   * hidden during the drag.
   * @param dragDirection Controls how the free end of the link follows the cursor. Defaults to
   * `LinkDirection.CENTER`. `LinkConnector.moveOutputLink` passes
   * `LinkDirection.RIGHT` so multi-link drags fan out predictably.
   */
  constructor(network: LinkNetwork, link: LLink, fromReroute?: Reroute, dragDirection: LinkDirection = LinkDirection.CENTER) {
    super(network, link, "output", fromReroute, dragDirection)

    this.node = this.inputNode
    this.fromSlot = this.inputSlot
    this.fromPos = fromReroute?.pos ?? this.inputPos
    this.fromDirection = LinkDirection.LEFT
    this.fromSlotIndex = this.inputIndex
  }

  /**
   * Output-side moves never reconnect to an input slot.
   * @returns Always `false`. Used by `LinkConnector` hover/drop validation alongside other
   * `RenderLink` implementations.
   */
  canConnectToInput(): false {
    return false
  }

  /**
   * Determines whether dropping onto the given output slot would produce a valid connection.
   *
   * Delegates to `LGraphNode.canConnectTo`, passing this link's fixed input node and slot
   * as the downstream target. Also accepts `SubgraphIO` slots when dropping onto subgraph
   * boundary nodes.
   * @param outputNode The node that owns the candidate output slot.
   * @param output The output slot (or subgraph IO definition) being hovered or dropped on.
   */
  canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean {
    return outputNode.canConnectTo(this.node, this.inputSlot, output)
  }

  /**
   * Determines whether the dragged link may be dropped onto a reroute.
   *
   * Prevents connecting a link to a reroute that originates from the same node as this link's
   * current output, which would create a degenerate loop.
   * @param reroute The reroute under the pointer.
   */
  canConnectToReroute(reroute: Reroute): boolean {
    return reroute.originId !== this.outputNode.id
  }

  canConnectToSubgraphInput(input: SubgraphInput): boolean {
    return input.isValidTarget(this.fromSlot)
  }

  /**
   * Output-side moves cannot terminate on an input slot.
   * @throws Always throws — this operation is not supported for this link type.
   */
  connectToInput(): never {
    throw new Error("MovingOutputLink cannot connect to an input.")
  }

  /**
   * Reconnects the link's output end to a new output slot.
   *
   * If the target slot is the link's current output, the call is a no-op. Otherwise,
   * `LGraphNode.connectSlots` creates or updates the connection while preserving
   * reroute parentage via `LLink.parentId`.
   * @param outputNode The node that owns the target output slot.
   * @param output The output slot to connect to.
   * @param events Dispatches `"output-moved"` when the connection succeeds, allowing listeners
   * to react to the completed reposition.
   * @returns The resulting `LLink`, or `undefined` if no connection was made.
   */
  connectToOutput(outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): LLink | null | undefined {
    if (output === this.outputSlot) return

    const link = outputNode.connectSlots(output, this.inputNode, this.inputSlot, this.link.parentId)
    if (link) events.dispatch("output-moved", this)
    return link
  }

  /**
   * Reconnects the link through a subgraph input boundary node.
   *
   * Used when the user drops a moving output link onto a `SubgraphInput`. Creates a new
   * link from the subgraph input to this link's fixed input slot, optionally preserving reroute
   * parentage from `MovingLinkBase.fromReroute`.
   * @param input The subgraph input IO node being dropped on.
   * @param events When provided, dispatches `"link-created"` with the new link.
   */
  connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const newLink = input.connect(this.fromSlot, this.node, this.fromReroute?.id)
    events?.dispatch("link-created", newLink)
  }

  /**
   * Output-side moves cannot terminate on a subgraph output boundary.
   * @throws Always throws — subgraph outputs are sources, not sinks, for this operation.
   */
  connectToSubgraphOutput(): void {
    throw new Error("MovingOutputLink cannot connect to a subgraph output.")
  }

  /**
   * Output-side moves cannot terminate on a reroute's input side.
   * @throws Always throws — use `connectToRerouteOutput` instead.
   */
  connectToRerouteInput(): never {
    throw new Error("MovingOutputLink cannot connect to an input.")
  }

  /**
   * Reconnects the link by attaching it to a reroute's output side.
   *
   * Used when the user drops onto an intermediate reroute rather than directly onto a node slot.
   * The first reroute in the dragged chain (or the link itself, if there are no reroutes) is
   * parented to the target reroute, and `LGraphNode.connectSlots` completes the connection
   * while retaining any downstream reroute chain via `LLink.parentId`.
   *
   * If the target reroute terminates a floating reroute chain, all floating links on that reroute
   * are removed once the connection is established.
   * @param reroute The reroute being dropped on.
   * @param outputNode The node that owns the output slot the link ultimately connects through.
   * @param output The output slot on `outputNode`.
   * @param events Dispatches `"output-moved"` after the connection is made.
   */
  connectToRerouteOutput(
    reroute: Reroute,
    outputNode: LGraphNode,
    output: INodeOutputSlot,
    events: CustomEventTarget<LinkConnectorEventMap>,
  ): void {
    // Moving output side of links
    const { inputNode, inputSlot, fromReroute } = this

    // Creating a new link removes floating prop - check before connecting
    const floatingTerminus = reroute?.floating?.slotType === "output"

    // Connect the first reroute of the link being dragged to the reroute being dropped on
    if (fromReroute) {
      fromReroute.parentId = reroute.id
    } else {
      // If there are no reroutes, directly connect the link
      this.link.parentId = reroute.id
    }
    // Use the last reroute id on the link to retain all reroutes
    outputNode.connectSlots(output, inputNode, inputSlot, this.link.parentId)

    // Connecting from the final reroute of a floating reroute chain
    if (floatingTerminus) reroute.removeAllFloatingLinks()

    events.dispatch("output-moved", this)
  }

  /**
   * Disconnects the link at its output end, leaving the input side unchanged.
   *
   * Called by `LinkConnector.disconnectLinks` when the user drops links onto empty canvas
   * (e.g. a delete/bin gesture) rather than onto a valid target.
   * @returns Whether the disconnection succeeded.
   */
  disconnect(): boolean {
    return this.outputNode.disconnectOutput(this.outputIndex, this.inputNode)
  }
}
