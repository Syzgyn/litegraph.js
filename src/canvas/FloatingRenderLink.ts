import type { RenderLink } from "./RenderLink"
import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { INodeOutputSlot, LinkNetwork } from "@/interfaces"
import type { INodeInputSlot } from "@/interfaces"
import type { Point } from "@/interfaces"
import type { LGraphNode, NodeId } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"

import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "@/constants"
import { LinkDirection } from "@/types/globalEnums"

/**
 * Represents a floating (partially connected) link being dragged to complete its open end.
 *
 * Floating links have one end attached to a slot or reroute and the other end unresolved
 * (stored with sentinel node IDs). Created by {@link LinkConnector.moveInputLink} and
 * {@link LinkConnector.moveOutputLink} when the user drags from a slot that has floating links
 * rather than fully connected links.
 * @remarks
 * This is a heavier, but short-lived convenience data structure. All refs should be discarded on
 * drop. Unlike {@link MovingLinkBase} subclasses, floating links mutate the {@link LLink} in place
 * rather than disconnecting and reconnecting through {@link LGraphNode.connectSlots}.
 * @see {@link LinkConnector.moveInputLink}
 * @see {@link LinkConnector.moveOutputLink}
 * @see {@link LLink.toFloating}
 */
export class FloatingRenderLink implements RenderLink {
  /**
   * The node at the connected end of the floating link.
   *
   * When the floating end is an output ({@link toType} `"input"`), this is the output node;
   * when the floating end is an input ({@link toType} `"output"`), this is the input node.
   */
  readonly node: LGraphNode

  /** The slot at the connected end of the floating link. */
  readonly fromSlot: INodeOutputSlot | INodeInputSlot

  /** Canvas-space position where the rendered link segment originates (the reroute position). */
  readonly fromPos: Point

  /**
   * The direction the link segment faces as it leaves {@link fromPos}.
   *
   * {@link LinkDirection.LEFT} when dragging from an output-side float;
   * {@link LinkDirection.RIGHT} when dragging from an input-side float.
   */
  readonly fromDirection: LinkDirection

  /** Index of {@link fromSlot} on {@link node}. */
  readonly fromSlotIndex: number

  /** ID of the output node, or `-1` when the output end is the floating (unresolved) end. */
  readonly outputNodeId: NodeId = -1

  /** The output node, when the output end is connected. */
  readonly outputNode?: LGraphNode

  /** The connected output slot, when the output end is connected. */
  readonly outputSlot?: INodeOutputSlot

  /** Index of {@link outputSlot}, or `-1` when the output end is floating. */
  readonly outputIndex: number = -1

  /** Canvas-space position of {@link outputSlot}, when connected. */
  readonly outputPos?: Point

  /** ID of the input node, or `-1` when the input end is the floating (unresolved) end. */
  readonly inputNodeId: NodeId = -1

  /** The input node, when the input end is connected. */
  readonly inputNode?: LGraphNode

  /** The connected input slot, when the input end is connected. */
  readonly inputSlot?: INodeInputSlot

  /** Index of {@link inputSlot}, or `-1` when the input end is floating. */
  readonly inputIndex: number = -1

  /** Canvas-space position of {@link inputSlot}, when connected. */
  readonly inputPos?: Point

  /**
   * @param network The graph (or subgraph) that owns the floating link.
   * @param link The {@link LLink} in floating state being repositioned.
   * @param toType Which end is unresolved — `"input"` when completing toward an input slot,
   * `"output"` when completing toward an output slot.
   * @param fromReroute The reroute the floating link is parented to; its position becomes
   * {@link fromPos}.
   * @param dragDirection Controls how the free end of the link follows the cursor.
   * @throws When the connected node or slot referenced by {@link link} cannot be found in
   * {@link network}.
   */
  constructor(
    readonly network: LinkNetwork,
    readonly link: LLink,
    readonly toType: "input" | "output",
    readonly fromReroute: Reroute,
    readonly dragDirection: LinkDirection = LinkDirection.CENTER,
  ) {
    const {
      origin_id: outputNodeId,
      target_id: inputNodeId,
      origin_slot: outputIndex,
      target_slot: inputIndex,
    } = link

    if (outputNodeId !== -1) {
      // Output connected
      const outputNode = network.getNodeById(outputNodeId) ?? undefined
      if (!outputNode) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Output node [${outputNodeId}] not found.`)

      const outputSlot = outputNode?.outputs.at(outputIndex)
      if (!outputSlot) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Output slot [${outputIndex}] not found.`)

      this.outputNodeId = outputNodeId
      this.outputNode = outputNode
      this.outputSlot = outputSlot
      this.outputIndex = outputIndex
      this.outputPos = outputNode.getOutputPos(outputIndex)

      // RenderLink props
      this.node = outputNode
      this.fromSlot = outputSlot
      this.fromPos = fromReroute?.pos ?? this.outputPos
      this.fromDirection = LinkDirection.LEFT
      this.dragDirection = LinkDirection.RIGHT
      this.fromSlotIndex = outputIndex
    } else {
      // Input connected
      const inputNode = network.getNodeById(inputNodeId) ?? undefined
      if (!inputNode) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Input node [${inputNodeId}] not found.`)

      const inputSlot = inputNode?.inputs.at(inputIndex)
      if (!inputSlot) throw new Error(`Creating DraggingRenderLink for link [${link.id}] failed: Input slot [${inputIndex}] not found.`)

      this.inputNodeId = inputNodeId
      this.inputNode = inputNode
      this.inputSlot = inputSlot
      this.inputIndex = inputIndex
      this.inputPos = inputNode.getInputPos(inputIndex)

      // RenderLink props
      this.node = inputNode
      this.fromSlot = inputSlot
      this.fromDirection = LinkDirection.RIGHT
      this.fromSlotIndex = inputIndex
    }
    this.fromPos = fromReroute.pos
  }

  /**
   * Floating links completing toward an input slot may connect to inputs.
   * @returns `true` when {@link toType} is `"input"`.
   */
  canConnectToInput(): boolean {
    return this.toType === "input"
  }

  /**
   * Floating links completing toward an output slot may connect to outputs.
   * @returns `true` when {@link toType} is `"output"`.
   */
  canConnectToOutput(): boolean {
    return this.toType === "output"
  }

  /**
   * Determines whether the floating link may be dropped onto a reroute.
   *
   * Prevents connecting to a reroute that originates from the same node as the connected end,
   * which would create a degenerate loop.
   * @param reroute The reroute under the pointer.
   */
  canConnectToReroute(reroute: Reroute): boolean {
    if (this.toType === "input") {
      if (reroute.origin_id === this.inputNode?.id) return false
    } else {
      if (reroute.origin_id === this.outputNode?.id) return false
    }
    return true
  }

  canConnectToSubgraphInput(input: SubgraphInput): boolean {
    return this.toType === "output" && input.isValidTarget(this.fromSlot)
  }

  /**
   * Resolves the floating end by attaching it to an input slot.
   *
   * Mutates {@link link} in place, moving it from the origin slot's `_floatingLinks` set to
   * the target input's set.
   * @param node The node that owns the target input slot.
   * @param input The input slot to connect to.
   */
  connectToInput(node: LGraphNode, input: INodeInputSlot, _events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const floatingLink = this.link
    floatingLink.target_id = node.id
    floatingLink.target_slot = node.inputs.indexOf(input)

    node.disconnectInput(node.inputs.indexOf(input))

    this.fromSlot._floatingLinks?.delete(floatingLink)
    input._floatingLinks ??= new Set()
    input._floatingLinks.add(floatingLink)
  }

  /**
   * Resolves the floating end by attaching it to an output slot.
   *
   * Mutates {@link link} in place, moving it from the origin slot's `_floatingLinks` set to
   * the target output's set.
   * @param node The node that owns the target output slot.
   * @param output The output slot to connect to.
   */
  connectToOutput(node: LGraphNode, output: INodeOutputSlot, _events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const floatingLink = this.link
    floatingLink.origin_id = node.id
    floatingLink.origin_slot = node.outputs.indexOf(output)

    this.fromSlot._floatingLinks?.delete(floatingLink)
    output._floatingLinks ??= new Set()
    output._floatingLinks.add(floatingLink)
  }

  /**
   * Resolves the floating end by attaching it to a subgraph input boundary.
   *
   * Sets the link's origin to the subgraph input sentinel ID and updates floating-link tracking
   * on the target {@link SubgraphInput}.
   * @param input The subgraph input IO definition being dropped on.
   */
  connectToSubgraphInput(input: SubgraphInput, _events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const floatingLink = this.link
    floatingLink.origin_id = SUBGRAPH_INPUT_ID
    floatingLink.origin_slot = input.parent.slots.indexOf(input)

    this.fromSlot._floatingLinks?.delete(floatingLink)
    input._floatingLinks ??= new Set()
    input._floatingLinks.add(floatingLink)
  }

  /**
   * Resolves the floating end by attaching it to a subgraph output boundary.
   *
   * Sets the link's origin to the subgraph output sentinel ID and updates floating-link tracking
   * on the target {@link SubgraphOutput}.
   * @param output The subgraph output IO definition being dropped on.
   */
  connectToSubgraphOutput(output: SubgraphOutput, _events?: CustomEventTarget<LinkConnectorEventMap>): void {
    const floatingLink = this.link
    floatingLink.origin_id = SUBGRAPH_OUTPUT_ID
    floatingLink.origin_slot = output.parent.slots.indexOf(output)

    this.fromSlot._floatingLinks?.delete(floatingLink)
    output._floatingLinks ??= new Set()
    output._floatingLinks.add(floatingLink)
  }

  /**
   * Resolves the floating end by attaching it to a reroute's input side.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node and slot at the reroute terminus.
   * @param events Dispatches `"input-moved"` after the connection is made.
   */
  connectToRerouteInput(
    reroute: Reroute,
    { node: inputNode, input }: { node: LGraphNode, input: INodeInputSlot },
    events: CustomEventTarget<LinkConnectorEventMap>,
  ) {
    const floatingLink = this.link
    floatingLink.target_id = inputNode.id
    floatingLink.target_slot = inputNode.inputs.indexOf(input)

    this.fromSlot._floatingLinks?.delete(floatingLink)
    input._floatingLinks ??= new Set()
    input._floatingLinks.add(floatingLink)

    events.dispatch("input-moved", this)
  }

  /**
   * Resolves the floating end by attaching it to a reroute's output side.
   * @param reroute The reroute being dropped on.
   * @param outputNode The node that owns the output slot the link ultimately connects through.
   * @param output The output slot on {@link outputNode}.
   * @param events Dispatches `"output-moved"` after the connection is made.
   */
  connectToRerouteOutput(
    reroute: Reroute,
    outputNode: LGraphNode,
    output: INodeOutputSlot,
    events: CustomEventTarget<LinkConnectorEventMap>,
  ) {
    const floatingLink = this.link
    floatingLink.origin_id = outputNode.id
    floatingLink.origin_slot = outputNode.outputs.indexOf(output)

    this.fromSlot._floatingLinks?.delete(floatingLink)
    output._floatingLinks ??= new Set()
    output._floatingLinks.add(floatingLink)

    events.dispatch("output-moved", this)
  }
}
