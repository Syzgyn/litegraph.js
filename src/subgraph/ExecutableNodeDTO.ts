import type { SubgraphNode } from "./SubgraphNode"
import type { CallbackParams, CallbackReturn, ISlotType } from "@/interfaces"
import type { LGraph } from "@/LGraph"
import type { LGraphNode, NodeId } from "@/LGraphNode"

import { InvalidLinkError } from "@/infrastructure/InvalidLinkError"
import { NullGraphError } from "@/infrastructure/NullGraphError"
import { RecursionError } from "@/infrastructure/RecursionError"
import { SlotIndexError } from "@/infrastructure/SlotIndexError"
import { LGraphEventMode } from "@/litegraph"

import { Subgraph } from "./Subgraph"

/**
 * A colon-separated path that uniquely identifies a node within a nested subgraph hierarchy.
 *
 * Each segment is a {@link NodeId}: subgraph instance IDs from the root graph outward, followed
 * by the inner node's ID. For example, `"1:2:3"` means instance `1` in the root graph, instance
 * `2` inside that subgraph, and node `3` inside the innermost subgraph definition.
 */
export type ExecutionId = string

/**
 * Flattened, execution-ready view of a graph node with subgraph instances expanded away.
 *
 * Omits the live graph references ({@link ExecutableNodeDTO.graph}, {@link ExecutableNodeDTO.node},
 * {@link ExecutableNodeDTO.subgraphNode}) so DTOs can be passed to executors without retaining
 * the full editor object graph.
 * @see {@link ExecutableNodeDTO}
 */
export type ExecutableLGraphNode = Omit<ExecutableNodeDTO, "graph" | "node" | "subgraphNode">

/**
 * The end result of resolving a DTO input.
 * When a widget value is returned, {@link widgetInfo} is present and {@link origin_slot} is `-1`.
 */
type ResolvedInput = {
  /** DTO for the node that the link originates from. */
  node: ExecutableLGraphNode
  /** Full unique execution ID of the node that the link originates from. In the case of a widget value, this is the ID of the subgraph node. */
  origin_id: ExecutionId
  /** The slot index of the output on the node that the link originates from. `-1` when widget value is set. */
  origin_slot: number
  /** Boxed widget value (e.g. for widgets). If this box is `undefined`, then an input link is connected, and widget values from the subgraph node are ignored. */
  widgetInfo?: { value: unknown }
}

/**
 * Data transfer object representing a single node in a flattened execution graph.
 *
 * Created during subgraph expansion ({@link SubgraphNode.getInnerNodes}) to give executors a
 * stable, path-qualified view of each node. Resolves input links across subgraph boundaries,
 * bypass nodes, and virtual nodes via {@link resolveInput} and {@link resolveOutput}.
 * @remarks
 * Each DTO's {@link id} encodes the full instance path from the root graph. Link resolution
 * walks outward through {@link SubgraphNode} instances when a link crosses a subgraph boundary.
 * @see {@link ExecutableLGraphNode}
 * @see {@link SubgraphNode.getInnerNodes}
 */
export class ExecutableNodeDTO implements ExecutableLGraphNode {
  /**
   * Optional wrapper around the wrapped node's `applyToGraph` callback.
   *
   * Only assigned when the source node defines `applyToGraph`.
   */
  applyToGraph?(...args: CallbackParams<typeof this.node.applyToGraph>): CallbackReturn<typeof this.node.applyToGraph>

  /** The graph (or subgraph definition) that owns the wrapped node. */
  readonly graph: LGraph | Subgraph

  /**
   * Snapshot of the wrapped node's input slots.
   *
   * Each entry records the link ID (or `null` when disconnected), slot name, and slot type.
   */
  inputs: { linkId: number | null, name: string, type: ISlotType }[]

  /** Backing field for {@link id}. */
  #id: ExecutionId

  /**
   * Unique execution identifier for this node within the flattened graph.
   *
   * Formed by joining {@link subgraphNodePath} and {@link node.id} with `:`.
   * @example `"1:2:3"` — instance `1` in the root, instance `2` nested inside, node `3` in the definition.
   */
  get id() {
    return this.#id
  }

  /** The wrapped node's {@link LGraphNode.type}. */
  get type() {
    return this.node.type
  }

  /** The wrapped node's display title. */
  get title() {
    return this.node.title
  }

  /** The wrapped node's execution mode (e.g. bypass). */
  get mode() {
    return this.node.mode
  }

  /** The wrapped node's ComfyUI class identifier, when set. */
  get comfyClass() {
    return this.node.comfyClass
  }

  /** Whether the wrapped node is a virtual (passthrough) node. */
  get isVirtualNode() {
    return this.node.isVirtualNode
  }

  /** The wrapped node's widgets, when any. */
  get widgets() {
    return this.node.widgets
  }

  /** The subgraph definition ID when this DTO is contained within a {@link SubgraphNode} instance. */
  get subgraphId() {
    return this.subgraphNode?.subgraph.id
  }

  /**
   * @param node The live node this DTO represents.
   * @param subgraphNodePath Ordered list of {@link SubgraphNode} instance IDs from the root graph
   * to the containing instance. Empty when the node lives directly in the root graph.
   * @param nodesByExecutionId Shared map populated during flattening; used to resolve links across
   * the expanded node network.
   * @param subgraphNode The {@link SubgraphNode} instance that directly contains this node,
   * or `undefined` when the node is not inside a subgraph instance.
   */
  constructor(
    /** The actual node that this DTO wraps. */
    readonly node: LGraphNode | SubgraphNode,
    /** A list of subgraph instance node IDs from the root graph to the containing instance. @see {@link id} */
    readonly subgraphNodePath: readonly NodeId[],
    /** A flattened map of all DTOs in this node network. Subgraph instances have been expanded into their inner nodes. */
    readonly nodesByExecutionId: Map<ExecutionId, ExecutableLGraphNode>,
    /** The actual subgraph instance that contains this node, otherise undefined. */
    readonly subgraphNode?: SubgraphNode,
  ) {
    if (!node.graph) throw new NullGraphError()

    // Set the internal ID of the DTO
    this.#id = [...this.subgraphNodePath, this.node.id].join(":")
    this.graph = node.graph
    this.inputs = this.node.inputs.map(x => ({
      linkId: x.link,
      name: x.name,
      type: x.type,
    }))

    // Only create a wrapper if the node has an applyToGraph method
    if (this.node.applyToGraph) {
      this.applyToGraph = (...args) => this.node.applyToGraph?.(...args)
    }
  }

  /**
   * Returns the DTOs that should be executed for this node.
   *
   * For a {@link SubgraphNode}, recursively expands and returns all inner node DTOs. For any
   * other node, returns a single-element array containing this DTO.
   * @returns The executable DTO(s) represented by this node.
   */
  getInnerNodes(): ExecutableLGraphNode[] {
    return this.node.isSubgraphNode() ? this.node.getInnerNodes(this.nodesByExecutionId, this.subgraphNodePath) : [this]
  }

  /**
   * Resolves the upstream source for a given input slot.
   *
   * Follows links through subgraph boundaries, bypass nodes, and virtual nodes until a concrete
   * output endpoint (or widget value) is found. Throws {@link RecursionError} on circular paths.
   * @param slot The input slot index on this DTO.
   * @param visited Set of visited resolution keys used to detect cycles. Leave empty unless
   * overriding; pass through on all recursive calls when overriding.
   * @returns The resolved upstream node, origin ID, and output slot index; `undefined` when the
   * input is disconnected.
   */
  resolveInput(slot: number, visited = new Set<string>()): ResolvedInput | undefined {
    const uniqueId = `${this.subgraphNode?.subgraph.id}:${this.node.id}[I]${slot}`
    if (visited.has(uniqueId)) {
      const nodeInfo = `${this.node.id}${this.node.title ? ` (${this.node.title})` : ""}`
      const pathInfo = this.subgraphNodePath.length > 0 ? ` at path ${this.subgraphNodePath.join(":")}` : ""
      throw new RecursionError(
        `Circular reference detected while resolving input ${slot} of node ${nodeInfo}${pathInfo}. ` +
        `This creates an infinite loop in link resolution. UniqueID: [${uniqueId}]`,
      )
    }
    visited.add(uniqueId)

    const input = this.inputs.at(slot)
    if (!input) throw new SlotIndexError(`No input found for flattened id [${this.id}] slot [${slot}]`)

    // Nothing connected
    if (input.linkId == null) return

    const link = this.graph.getLink(input.linkId)
    if (!link) throw new InvalidLinkError(`No link found in parent graph for id [${this.id}] slot [${slot}] ${input.name}`)

    const { subgraphNode } = this

    // Link goes up and out of this subgraph
    if (subgraphNode && link.originIsIoNode) {
      const subgraphNodeInput = subgraphNode.inputs.at(link.origin_slot)
      if (!subgraphNodeInput) throw new SlotIndexError(`No input found for slot [${link.origin_slot}] ${input.name}`)

      // Nothing connected
      const linkId = subgraphNodeInput.link
      if (linkId == null) {
        const widget = subgraphNode.getWidgetFromSlot(subgraphNodeInput)
        if (!widget) return

        // Special case: SubgraphNode widget.
        return {
          node: this,
          origin_id: this.id,
          origin_slot: -1,
          widgetInfo: { value: widget.value },
        }
      }

      const outerLink = subgraphNode.graph!.getLink(linkId)
      if (!outerLink) throw new InvalidLinkError(`No outer link found for slot [${link.origin_slot}] ${input.name}`)

      const subgraphNodeExecutionId = this.subgraphNodePath.join(":")
      const subgraphNodeDto = this.nodesByExecutionId.get(subgraphNodeExecutionId)
      if (!subgraphNodeDto) throw new Error(`No subgraph node DTO found for id [${subgraphNodeExecutionId}]`)

      return subgraphNodeDto.resolveInput(outerLink.target_slot, visited)
    }

    // Not part of a subgraph; use the original link
    const outputNode = this.graph.getNodeById(link.origin_id)
    if (!outputNode) throw new InvalidLinkError(`No input node found for id [${this.id}] slot [${slot}] ${input.name}`)

    const outputNodeExecutionId = [...this.subgraphNodePath, outputNode.id].join(":")
    const outputNodeDto = this.nodesByExecutionId.get(outputNodeExecutionId)
    if (!outputNodeDto) throw new Error(`No output node DTO found for id [${outputNodeExecutionId}]`)

    return outputNodeDto.resolveOutput(link.origin_slot, input.type, visited)
  }

  /**
   * Resolves whether an output slot is a valid execution endpoint.
   *
   * Bypass and virtual nodes are transparently skipped. {@link SubgraphNode} outputs are resolved
   * to their inner connected nodes. Throws {@link RecursionError} on circular paths.
   * @param slot The output slot index on this DTO.
   * @param type The type of the downstream input requesting this output; used when traversing
   * bypass nodes.
   * @param visited Set of visited resolution keys. See {@link resolveInput}.
   * @returns The concrete source node, origin ID, and output slot index; `undefined` when the
   * output cannot be resolved to a valid endpoint.
   */
  resolveOutput(slot: number, type: ISlotType, visited: Set<string>): ResolvedInput | undefined {
    const uniqueId = `${this.subgraphNode?.subgraph.id}:${this.node.id}[O]${slot}`
    if (visited.has(uniqueId)) {
      const nodeInfo = `${this.node.id}${this.node.title ? ` (${this.node.title})` : ""}`
      const pathInfo = this.subgraphNodePath.length > 0 ? ` at path ${this.subgraphNodePath.join(":")}` : ""
      throw new RecursionError(
        `Circular reference detected while resolving output ${slot} of node ${nodeInfo}${pathInfo}. ` +
        `This creates an infinite loop in link resolution. UniqueID: [${uniqueId}]`,
      )
    }
    visited.add(uniqueId)

    // Upstreamed: Bypass nodes are bypassed using the first input with matching type
    if (this.mode === LGraphEventMode.BYPASS) {
      const { inputs } = this

      // Bypass nodes by finding first input with matching type
      const parentInputIndexes = Object.keys(inputs).map(Number)
      // Prioritise exact slot index
      const indexes = [slot, ...parentInputIndexes]
      const matchingIndex = indexes.find(i => inputs[i]?.type === type)

      // No input types match
      if (matchingIndex === undefined) {
        console.debug(`[ExecutableNodeDTO.resolveOutput] No input types match type [${type}] for id [${this.id}] slot [${slot}]`, this)
        return
      }

      return this.resolveInput(matchingIndex, visited)
    }

    const { node } = this
    if (node.isSubgraphNode()) return this.#resolveSubgraphOutput(slot, type, visited)

    // Upstreamed: Other virtual nodes are bypassed using the same input/output index (slots must match)
    if (node.isVirtualNode) {
      if (this.inputs.at(slot)) return this.resolveInput(slot, visited)

      // Fallback check for nodes performing link redirection
      const virtualLink = this.node.getInputLink(slot)
      if (virtualLink) {
        const outputNode = this.graph.getNodeById(virtualLink.origin_id)
        if (!outputNode) throw new InvalidLinkError(`Virtual node failed to resolve parent [${this.id}] slot [${slot}]`)

        const outputNodeExecutionId = [...this.subgraphNodePath, outputNode.id].join(":")
        const outputNodeDto = this.nodesByExecutionId.get(outputNodeExecutionId)
        if (!outputNodeDto) throw new Error(`No output node DTO found for id [${outputNode.id}]`)

        return outputNodeDto.resolveOutput(virtualLink.origin_slot, type, visited)
      }

      // Virtual nodes without a matching input should be discarded.
      return
    }

    return {
      node: this,
      origin_id: this.id,
      origin_slot: slot,
    }
  }

  /**
   * Resolves the link inside a subgraph node, from the subgraph IO node to the node inside the subgraph.
   * @param slot The slot index of the output on the subgraph node.
   * @param visited A set of unique IDs to guard against infinite recursion. See {@link resolveInput}.
   * @returns A DTO for the node, and the origin ID / slot index of the output.
   */
  #resolveSubgraphOutput(slot: number, type: ISlotType, visited: Set<string>): ResolvedInput | undefined {
    const { node } = this
    const output = node.outputs.at(slot)

    if (!output) throw new SlotIndexError(`No output found for flattened id [${this.id}] slot [${slot}]`)
    if (!node.isSubgraphNode()) throw new TypeError(`Node is not a subgraph node: ${node.id}`)

    // Link inside the subgraph
    const innerResolved = node.resolveSubgraphOutputLink(slot)
    if (!innerResolved) return

    const innerNode = innerResolved.outputNode
    if (!innerNode) throw new Error(`No output node found for id [${this.id}] slot [${slot}] ${output.name}`)

    // Recurse into the subgraph
    const innerNodeExecutionId = [...this.subgraphNodePath, node.id, innerNode.id].join(":")
    const innerNodeDto = this.nodesByExecutionId.get(innerNodeExecutionId)
    if (!innerNodeDto) throw new Error(`No inner node DTO found for id [${innerNodeExecutionId}]`)

    return innerNodeDto.resolveOutput(innerResolved.link.origin_slot, type, visited)
  }
}
