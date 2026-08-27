import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { NodeLike } from "@/types/NodeLike"
import type { SubgraphIO } from "@/types/serialisation"

import { LinkDirection } from "@/types/globalEnums"

/**
 * Represents a new link being dragged **from** an input slot **to** an output slot.
 *
 * Created by `LinkConnector.dragNewFromInput` and `LinkConnector.dragFromRerouteToOutput`
 * (via `ToOutputFromRerouteLink`). On drop, `connectToOutput` creates the connection
 * via `LGraphNode.connectSlots`.
 * @remarks
 * This is the "new link" counterpart to `MovingOutputLink`, which repositions an existing
 * link's output end instead of creating one from scratch.
 * @see `ToInputRenderLink`
 * @see `LinkConnector.dragNewFromInput`
 */
export class ToOutputRenderLink implements RenderLink {
  /** Always `"output"` — this link is being dragged toward an output slot. */
  readonly toType = "output"

  /** Canvas-space position where the rendered link segment originates. */
  readonly fromPos: Point

  /** Index of `fromSlot` on `node`. */
  readonly fromSlotIndex: number

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * Defaults to `LinkDirection.LEFT` (input slots face left). May be overridden when
   * dragging from a reroute.
   */
  fromDirection: LinkDirection = LinkDirection.LEFT

  /**
   * @param network The graph (or subgraph) that will own the new link.
   * @param node The node whose input slot the link is being dragged from.
   * @param fromSlot The input slot at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin. Its
   * position becomes `fromPos` and its ID is passed as parentage when connecting.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @throws When `fromSlot` is not found on `node`.
   */
  constructor(
    readonly network: LinkNetwork,
    readonly node: LGraphNode,
    readonly fromSlot: INodeInputSlot,
    readonly fromReroute?: Reroute,
    public dragDirection: LinkDirection = LinkDirection.CENTER,
  ) {
    const inputIndex = node.inputs.indexOf(fromSlot)
    if (inputIndex === -1) throw new Error(`Creating render link for node [${this.node.id}] failed: Slot index not found.`)

    this.fromSlotIndex = inputIndex
    this.fromPos = fromReroute
      ? fromReroute.pos
      : this.node.getInputPos(inputIndex)
  }

  /**
   * Output-directed drags never terminate on an input slot.
   * @returns Always `false`.
   */
  canConnectToInput(): false {
    return false
  }

  /**
   * Determines whether dropping onto the given output slot would produce a valid connection.
   *
   * Delegates to `LGraphNode.canConnectTo`, passing this link's origin input slot as the
   * downstream target. Also accepts `SubgraphIO` slots when dropping onto subgraph
   * boundary nodes.
   * @param outputNode The node that owns the candidate output slot.
   * @param output The output slot (or subgraph IO definition) being hovered or dropped on.
   */
  canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean {
    return this.node.canConnectTo(outputNode, this.fromSlot, output)
  }

  /**
   * Determines whether the dragged link may be dropped onto a reroute.
   *
   * Prevents connecting to a reroute that originates from the same node as the drag origin.
   * @param reroute The reroute under the pointer.
   */
  canConnectToReroute(reroute: Reroute): boolean {
    if (reroute.originId === this.node.id) return false
    return true
  }

  canConnectToSubgraphInput(input: SubgraphInput): boolean {
    return input.isValidTarget(this.fromSlot)
  }

  /**
   * Completes the drag by creating a new link to an output slot.
   *
   * Dispatches `"link-created"` with the new `LLink` on success.
   * @param node The node that owns the target output slot.
   * @param output The output slot to connect to.
   * @param events Event target for dispatching `"link-created"`.
   */
  connectToOutput(node: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>) {
    const { node: inputNode, fromSlot, fromReroute } = this
    if (!inputNode) return

    const newLink = node.connectSlots(output, inputNode, fromSlot, fromReroute?.id)
    events.dispatch("link-created", newLink)
  }

  /**
   * Completes the drag by creating a link through a subgraph input boundary node.
   * @param input The subgraph input IO definition being dropped on.
   * @param events When provided, dispatches `"link-created"` with the new link.
   */
  connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const newLink = input.connect(this.fromSlot, this.node, this.fromReroute?.id)
    events?.dispatch("link-created", newLink)
  }

  /**
   * Completes the drag by connecting through a reroute's output side.
   * @param reroute The reroute being dropped on.
   * @param outputNode The node that owns the output slot the link ultimately connects through.
   * @param output The output slot on `outputNode`.
   * @param events Dispatches `"link-created"` with the new link.
   */
  connectToRerouteOutput(
    reroute: Reroute,
    outputNode: LGraphNode,
    output: INodeOutputSlot,
    events: CustomEventTarget<LinkConnectorEventMap>,
  ): void {
    const { node: inputNode, fromSlot } = this
    const newLink = outputNode.connectSlots(output, inputNode, fromSlot, reroute?.id)
    events.dispatch("link-created", newLink)
  }

  /**
   * Output-directed drags cannot terminate on an input slot.
   * @throws Always throws — this operation is not supported for this link type.
   */
  connectToInput() {
    throw new Error("ToOutputRenderLink cannot connect to an input.")
  }

  /**
   * Output-directed drags cannot terminate on a subgraph output boundary.
   * @throws Always throws — subgraph outputs are sources, not sinks, for this operation.
   */
  connectToSubgraphOutput(): void {
    throw new Error("ToOutputRenderLink cannot connect to a subgraph output.")
  }

  /**
   * Output-directed drags cannot terminate on a reroute's input side.
   * @throws Always throws — use `connectToRerouteOutput` instead.
   */
  connectToRerouteInput() {
    throw new Error("ToOutputRenderLink cannot connect to an input.")
  }
}
