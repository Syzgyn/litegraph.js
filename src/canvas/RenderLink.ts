import type { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { LinkNetwork, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { INodeInputSlot, INodeOutputSlot, LLink, Reroute } from "@/litegraph"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphIONodeBase } from "@/subgraph/SubgraphIONodeBase"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { LinkDirection } from "@/types/globalEnums"

/**
 * Contract for a link segment currently being dragged or rendered during a connection operation.
 *
 * Implemented by `MovingInputLink`, `MovingOutputLink`, `FloatingRenderLink`,
 * `ToInputRenderLink`, `ToOutputRenderLink`, and their subgraph IO variants. The
 * `LinkConnector` holds an array of `RenderLink` instances while the user drags,
 * queries them for hover validation, and calls the appropriate `connectTo*` method on drop.
 * @see `LinkConnector`
 */
export interface RenderLink {
  /**
   * Which slot type the free end of the link is being dragged toward.
   *
   * - `"input"` — creating or moving a link **to** an input slot (origin is an output).
   * - `"output"` — creating or moving a link **to** an output slot (origin is an input).
   */
  readonly toType: "input" | "output"

  /**
   * Canvas-space position where the rendered link segment originates.
   *
   * Typically the slot position or, when dragging from a reroute, the reroute's position.
   */
  readonly fromPos: Point

  /**
   * The direction the link segment faces as it leaves `fromPos`.
   *
   * When `toType` is `"output"`, this is the direction the link input faces at the origin.
   */
  readonly fromDirection: LinkDirection

  /**
   * When set, forces the free end of the dragged link to extend from the cursor in this direction.
   *
   * Used by `LinkConnector.moveOutputLink` to fan out multi-link drags predictably.
   */
  dragDirection: LinkDirection

  /** When true, dropping near `disconnectOrigin` disconnects the link instead of reconnecting. */
  disconnectOnDrop?: boolean

  /** Canvas position of the input slot for fast-disconnect circle hit testing. */
  readonly disconnectOrigin?: Point

  /** The graph (or subgraph) that owns the nodes and links involved in this drag operation. */
  readonly network: LinkNetwork

  /**
   * The node (or subgraph IO boundary node) at the fixed origin of the link being dragged.
   */
  readonly node: LGraphNode | SubgraphIONodeBase<SubgraphInput | SubgraphOutput>

  /**
   * The slot at the fixed origin of the link being dragged.
   *
   * May be a regular node slot or a `SubgraphInput` / `SubgraphOutput` definition.
   */
  readonly fromSlot: INodeOutputSlot | INodeInputSlot | SubgraphInput | SubgraphOutput

  /** Index of `fromSlot` on `node`. */
  readonly fromSlotIndex: number

  /**
   * When the link originates from (or passes through) a reroute, the first reroute in the chain.
   *
   * Its position is used for `fromPos` and its ID is passed as parentage when connecting.
   */
  readonly fromReroute?: Reroute

  /**
   * Completes the drag by connecting the free end to an input slot on a regular node.
   * @param node The node that owns the target input slot.
   * @param input The input slot to connect to.
   * @param events Optional event target; implementations dispatch `"link-created"` or
   * `"input-moved"` on success.
   */
  connectToInput(node: LGraphNode, input: INodeInputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Completes the drag by connecting the free end to an output slot on a regular node.
   * @param node The node that owns the target output slot.
   * @param output The output slot to connect to.
   * @param events Optional event target; implementations dispatch `"link-created"` or
   * `"output-moved"` on success.
   */
  connectToOutput(node: LGraphNode, output: INodeOutputSlot, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Completes the drag by connecting through a subgraph input boundary node.
   * @param input The subgraph input IO definition being dropped on.
   * @param events Optional event target for dispatching `"link-created"`.
   */
  connectToSubgraphInput(input: SubgraphInput, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Completes the drag by connecting through a subgraph output boundary node.
   * @param output The subgraph output IO definition being dropped on.
   * @param events Optional event target for dispatching `"link-created"`.
   */
  connectToSubgraphOutput(output: SubgraphOutput, events?: CustomEventTarget<LinkConnectorEventMap>): void

  /**
   * Completes the drag by connecting the free end to a reroute's input side.
   * @param reroute The reroute being dropped on.
   * @param param1 The target input node, slot, and existing link at the reroute terminus.
   * @param events Event target for dispatching connection lifecycle events.
   * @param originalReroutes Reroutes in the chain used to clean up orphaned reroutes after reconnection.
   */
  connectToRerouteInput(
    reroute: Reroute,
    { node, input, link }: { node: LGraphNode, input: INodeInputSlot, link: LLink },
    events: CustomEventTarget<LinkConnectorEventMap>,
    originalReroutes: Reroute[],
  ): void

  /**
   * Completes the drag by connecting the free end to a reroute's output side.
   * @param reroute The reroute being dropped on.
   * @param outputNode The node that owns the output slot the link ultimately connects through.
   * @param output The output slot on `outputNode`.
   * @param events Event target for dispatching connection lifecycle events.
   */
  connectToRerouteOutput(
    reroute: Reroute,
    outputNode: LGraphNode,
    output: INodeOutputSlot,
    events: CustomEventTarget<LinkConnectorEventMap>,
  ): void
}
