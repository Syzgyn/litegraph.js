import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import type { NodeLike } from "@/types/NodeLike"
import type { SubgraphIO } from "@/types/serialisation"

import { LinkDirection } from "@/types/globalEnums"

/**
 * Represents a link being dragged **from** a subgraph output boundary **to** an output slot.
 *
 * Created by `LinkConnector.dragNewFromSubgraphOutput` and
 * `LinkConnector.dragFromRerouteToOutput`. The origin is a `SubgraphOutput` exposed
 * on the subgraph's `SubgraphOutputNode`.
 * @remarks
 * Subgraph outputs act as virtual inputs inside the subgraph — data flows from inside the
 * subgraph out to the parent graph through these boundary slots.
 * @see `ToInputFromIoNodeLink`
 * @see `LinkConnector.dragNewFromSubgraphOutput`
 */
export class ToOutputFromIoNodeLink implements RenderLink {
  /** Always `"output"` — this link is being dragged toward an output slot. */
  readonly toType = "output"

  /** Canvas-space position where the rendered link segment originates. */
  readonly fromPos: Point

  /** Index of `fromSlot` on `node`. */
  readonly fromSlotIndex: number

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * Defaults to `LinkDirection.LEFT`. May be overridden to `LinkDirection.NONE`
   * when dragging from a reroute.
   */
  fromDirection: LinkDirection = LinkDirection.LEFT

  /**
   * @param network The subgraph that owns the output boundary.
   * @param node The `SubgraphOutputNode` displaying the subgraph outputs.
   * @param fromSlot The `SubgraphOutput` at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @throws When `fromSlot` is not found on `node` (unless it is the empty slot).
   */
  constructor(
    readonly network: LinkNetwork,
    readonly node: SubgraphOutputNode,
    readonly fromSlot: SubgraphOutput,
    readonly fromReroute?: Reroute,
    public dragDirection: LinkDirection = LinkDirection.CENTER,
  ) {
    const inputIndex = node.slots.indexOf(fromSlot)
    if (inputIndex === -1 && fromSlot !== node.emptySlot) {
      throw new Error(`Creating render link for node [${this.node.id}] failed: Slot index not found.`)
    }

    this.fromSlotIndex = inputIndex
    this.fromPos = fromReroute
      ? fromReroute.pos
      : fromSlot.pos
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
   * Delegates to `SubgraphOutputNode.canConnectTo`, passing this link's origin
   * `SubgraphOutput` as the downstream target.
   * @param outputNode The node that owns the candidate output slot.
   * @param output The output slot (or subgraph IO definition) being hovered or dropped on.
   */
  canConnectToOutput(outputNode: NodeLike, output: INodeOutputSlot | SubgraphIO): boolean {
    return this.node.canConnectTo(outputNode, this.fromSlot, output)
  }

  /**
   * Determines whether the dragged link may be dropped onto a reroute.
   *
   * Prevents connecting to a reroute that originates from the same subgraph output node.
   * @param reroute The reroute under the pointer.
   */
  canConnectToReroute(reroute: Reroute): boolean {
    if (reroute.origin_id === this.node.id) return false
    return true
  }

  /**
   * Completes the drag by connecting the subgraph output to an output slot inside the subgraph.
   *
   * Dispatches `"link-created"` with the new link on success.
   * @param node The node that owns the target output slot.
   * @param output The output slot to connect to.
   * @param events Event target for dispatching `"link-created"`.
   */
  connectToOutput(node: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>) {
    const { fromSlot, fromReroute } = this

    const newLink = fromSlot.connect(output, node, fromReroute?.id)
    events.dispatch("link-created", newLink)
  }

  /**
   * Subgraph-output drags cannot terminate on a subgraph input boundary.
   * @throws Always throws — not implemented for this link type.
   */
  connectToSubgraphInput(): void {
    throw new Error("Not implemented")
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
    const { fromSlot } = this

    const newLink = fromSlot.connect(output, outputNode, reroute?.id)
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
