import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode, NodeId } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"

import { LinkDirection } from "@/types/globalEnums"

/**
 * Abstract base for representing an existing link that is currently being dragged by the user.
 *
 * Resolves and caches both ends of an {@link LLink} (output and input nodes, slots, and canvas
 * positions) so that {@link MovingInputLink} and {@link MovingOutputLink} can focus on the
 * drag-specific connection logic.
 * @remarks
 * This is a heavier, but short-lived convenience data structure. All refs to subclasses should be
 * discarded on drop. At time of writing, Litegraph uses several different styles and methods to
 * handle link dragging; once the library undergoes more substantial changes to link management,
 * many properties of this class will be superfluous and removable.
 * @see {@link MovingInputLink}
 * @see {@link MovingOutputLink}
 * @see {@link RenderLink}
 */
export abstract class MovingLinkBase implements RenderLink {
  /**
   * The node at the fixed (origin) end of the link being moved.
   *
   * Implemented by subclasses as either the output node ({@link MovingInputLink}) or the input
   * node ({@link MovingOutputLink}).
   */
  abstract readonly node: LGraphNode

  /**
   * The slot at the fixed (origin) end of the link being moved.
   *
   * Exposed as `fromSlot` to satisfy the {@link RenderLink} rendering contract.
   */
  abstract readonly fromSlot: INodeOutputSlot | INodeInputSlot

  /** Canvas-space position where the dragged link segment is rendered from. */
  abstract readonly fromPos: Point

  /** The direction the link segment faces as it leaves {@link fromPos}. */
  abstract readonly fromDirection: LinkDirection

  /** Index of {@link fromSlot} on {@link node}. */
  abstract readonly fromSlotIndex: number

  /** ID of the node at the output (source) end of the link. */
  readonly outputNodeId: NodeId

  /** The node at the output (source) end of the link. */
  readonly outputNode: LGraphNode

  /** The output slot the link originates from. */
  readonly outputSlot: INodeOutputSlot

  /** Index of {@link outputSlot} on {@link outputNode}. */
  readonly outputIndex: number

  /** Canvas-space position of {@link outputSlot}. */
  readonly outputPos: Point

  /** ID of the node at the input (target) end of the link. */
  readonly inputNodeId: NodeId

  /** The node at the input (target) end of the link. */
  readonly inputNode: LGraphNode

  /** The input slot the link terminates at. */
  readonly inputSlot: INodeInputSlot

  /** Index of {@link inputSlot} on {@link inputNode}. */
  readonly inputIndex: number

  /** Canvas-space position of {@link inputSlot}. */
  readonly inputPos: Point

  /**
   * @param network The graph (or subgraph) that owns the link and its nodes.
   * @param link The existing {@link LLink} being repositioned.
   * @param toType Which end of the link is free during the drag — `"input"` or `"output"`.
   * @param fromReroute When the link chain starts at a reroute, the first reroute in the chain.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @throws When either the output or input node/slot referenced by {@link link} cannot be found
   * in {@link network}.
   */
  constructor(
    readonly network: LinkNetwork,
    readonly link: LLink,
    readonly toType: "input" | "output",
    readonly fromReroute?: Reroute,
    readonly dragDirection: LinkDirection = LinkDirection.CENTER,
  ) {
    const {
      origin_id: outputNodeId,
      target_id: inputNodeId,
      origin_slot: outputIndex,
      target_slot: inputIndex,
    } = link

    // Store output info
    const outputNode = network.getNodeById(outputNodeId) ?? undefined
    if (!outputNode) throw new Error(`Creating MovingRenderLink for link [${link.id}] failed: Output node [${outputNodeId}] not found.`)

    const outputSlot = outputNode.outputs.at(outputIndex)
    if (!outputSlot) throw new Error(`Creating MovingRenderLink for link [${link.id}] failed: Output slot [${outputIndex}] not found.`)

    this.outputNodeId = outputNodeId
    this.outputNode = outputNode
    this.outputSlot = outputSlot
    this.outputIndex = outputIndex
    this.outputPos = outputNode.getOutputPos(outputIndex)

    // Store input info
    const inputNode = network.getNodeById(inputNodeId) ?? undefined
    if (!inputNode) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Input node [${inputNodeId}] not found.`)

    const inputSlot = inputNode.inputs.at(inputIndex)
    if (!inputSlot) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Input slot [${inputIndex}] not found.`)

    this.inputNodeId = inputNodeId
    this.inputNode = inputNode
    this.inputSlot = inputSlot
    this.inputIndex = inputIndex
    this.inputPos = inputNode.getInputPos(inputIndex)
  }

  /**
   * Reconnects the free end of the link to a new input slot.
   * @param node The node that owns the target input slot.
   * @param input The input slot to connect to.
   * @param events Optional event target for dispatching connection lifecycle events.
   */
  abstract connectToInput(node: LGraphNode, input: INodeInputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Reconnects the free end of the link to a new output slot.
   * @param node The node that owns the target output slot.
   * @param output The output slot to connect to.
   * @param events Optional event target for dispatching connection lifecycle events.
   */
  abstract connectToOutput(node: LGraphNode, output: INodeOutputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Reconnects the free end of the link through a subgraph input boundary node.
   * @param input The subgraph input IO definition being dropped on.
   * @param events Optional event target for dispatching `"link-created"`.
   */
  abstract connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Reconnects the free end of the link through a subgraph output boundary node.
   * @param output The subgraph output IO definition being dropped on.
   * @param events Optional event target for dispatching `"link-created"`.
   */
  abstract connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Reconnects the free end of the link by attaching it to a reroute's input side.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node, slot, and existing link at the reroute terminus.
   * @param events Event target for dispatching connection lifecycle events.
   * @param originalReroutes Reroutes in the chain used to clean up orphaned reroutes after reconnection.
   */
  abstract connectToRerouteInput(reroute: Reroute, { node, input, link }: { node: LGraphNode, input: INodeInputSlot, link: LLink }, events: CustomEventTarget<LinkConnectorEventMap>, originalReroutes: Reroute[]): void

  /**
   * Reconnects the free end of the link by attaching it to a reroute's output side.
   * @param reroute The reroute being dropped on.
   * @param outputNode The node that owns the output slot the link ultimately connects through.
   * @param output The output slot on {@link outputNode}.
   * @param events Event target for dispatching connection lifecycle events.
   */
  abstract connectToRerouteOutput(reroute: Reroute, outputNode: LGraphNode, output: INodeOutputSlot, events: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Disconnects the link at the free end, leaving the fixed end unchanged.
   *
   * Called by {@link LinkConnector.disconnectLinks} when links are dropped onto empty canvas.
   * @returns Whether the disconnection succeeded.
   */
  abstract disconnect(): boolean
}
