import type {
  Dictionary,
  INodeFlags,
  INodeInputSlot,
  INodeOutputSlot,
  INodeSlot,
  ISlotType,
  Point,
  Size,
} from "../interfaces"
import type { LGraphConfig, LGraphExtra, LGraphState } from "../LGraph"
import type { IGraphGroupFlags } from "../LGraphGroup"
import type { NodeId, NodeProperty } from "../LGraphNode"
import type { LiteGraph } from "../litegraph"
import type { LinkId, SerialisedLLinkArray } from "../LLink"
import type { FloatingRerouteSlot, RerouteId } from "../Reroute"
import type { TWidgetValue } from "../types/widgets"
import type { RenderShape } from "./globalEnums"
import type { UUID } from "@/utils/uuid"

/**
 * An object that implements custom pre-serialization logic via {@link Serialisable.asSerialisable}.
 */
export interface Serialisable<SerialisableObject> {
  /**
   * Prepares this object for serialization.
   * Creates a partial shallow copy of itself, with only the properties that should be serialised.
   * @returns An object that can immediately be serialized to JSON.
   */
  asSerialisable(): SerialisableObject
}

export interface BaseExportedGraph {
  /** Unique graph ID. Automatically generated if not provided. */
  id: UUID
  /**
   * The revision number of this graph.
   *
   * Not automatically incremented; intended for use by a downstream save function to detect changes.
   */
  revision: number
  /** Optional graph-level configuration overrides. */
  config?: LGraphConfig
  /**
   * Details of the appearance and location of subgraph instances shown in this graph.
   *
   * Each entry references a subgraph definition in {@link definitions}.
   */
  subgraphs?: ExportedSubgraphInstance[]
  /** Definitions of re-usable objects referenced elsewhere in this exported graph. */
  definitions?: {
    /**
     * Base definitions of subgraphs used in this workflow.
     *
     * These are the full subgraph contents visible when opening or editing a subgraph.
     */
    subgraphs?: ExportedSubgraph[]
  }
}

/** Top-level serialisable representation of a graph, used for save/load and clipboard operations. */
export interface SerialisableGraph extends BaseExportedGraph {
  /**
   * Schema version for forward-compatible deserialisation.
   * @remarks Version bump should add to the const union, which is used to narrow types during deserialise.
   */
  version: 0 | 1
  /** Runtime state persisted with the graph (e.g. execution mode, last IDs). */
  state: LGraphState
  /** Serialised group annotations on the canvas. */
  groups?: ISerialisedGroup[]
  /** Serialised nodes contained in this graph. */
  nodes?: ISerialisedNode[]
  /** Serialised links connecting nodes in this graph. */
  links?: SerialisableLLink[]
  /** Links that originate from a slot but are not yet connected to a target. */
  floatingLinks?: SerialisableLLink[]
  /** Serialised reroute points on link paths. */
  reroutes?: SerialisableReroute[]
  /** Arbitrary extra data attached to the graph by downstream consumers. */
  extra?: LGraphExtra
}

/**
 * Serialisable representation of a node input slot.
 *
 * Omits runtime-only properties ({@link INodeInputSlot.boundingRect}, live widget reference).
 * Widget-backed slots serialise a `{ widget: { name } }` reference instead of a position.
 */
export type ISerialisableNodeInput = Omit<INodeInputSlot, "boundingRect" | "widget"> & {
  /** Reference to the widget this input slot is bound to, if any. */
  widget?: { name: string }
}

/**
 * Serialisable representation of a node output slot.
 *
 * Omits runtime-only properties ({@link INodeOutputSlot.boundingRect}, {@link INodeOutputSlot._data}).
 */
export type ISerialisableNodeOutput = Omit<INodeOutputSlot, "boundingRect" | "_data"> & {
  /** Reference to an associated widget, used by some downstream workarounds. */
  widget?: { name: string }
}

/** Serialised representation of an {@link LGraphNode}. */
export interface ISerialisedNode {
  /** Display title shown on the node. Falls back to the node type when omitted. */
  title?: string
  /** Unique node identifier within the graph. */
  id: NodeId
  /** Registered node type name (e.g. `"basic/constant"`). */
  type: string
  /** Canvas position of the node's top-left corner. */
  pos: Point
  /** Width and height of the node on the canvas. */
  size: Size
  /** Node behaviour flags (collapsed, pinned, etc.). */
  flags: INodeFlags
  /** Execution order index within the graph. */
  order: number
  /** Execution mode ({@link LGraphEventMode} value). */
  mode: number
  /** Serialised output slots on this node. */
  outputs?: ISerialisableNodeOutput[]
  /** Serialised input slots on this node. */
  inputs?: ISerialisableNodeInput[]
  /** Custom node properties persisted across save/load. */
  properties?: Dictionary<NodeProperty | undefined>
  /** Visual render shape for this node's body. */
  shape?: RenderShape
  /** Border colour override. */
  boxcolor?: string
  /** Title bar text colour override. */
  color?: string
  /** Node body background colour override. */
  bgcolor?: string
  /** Whether advanced widgets are expanded in the UI. */
  showAdvanced?: boolean
  /**
   * Note: Some custom nodes overrides the `widgets_values` property to an
   * object that has `length` property and index access. It is not safe to call
   * any array methods on it.
   * See example in https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/blob/8629188458dc6cb832f871ece3bd273507e8a766/web/js/VHS.core.js#L59-L84
   */
  widgets_values?: TWidgetValue[]
}

/** Properties shared between a serialised node and a subgraph instance on the parent graph. */
type NodeSubgraphSharedProps = Omit<ISerialisedNode, "properties" | "showAdvanced">

/**
 * A single placed instance of a subgraph on a parent graph.
 *
 * Stores the instance's position, size, and visual customisations. The actual subgraph
 * definition is referenced by {@link type} and stored in {@link BaseExportedGraph.definitions}.
 */
export interface ExportedSubgraphInstance extends NodeSubgraphSharedProps {
  /**
   * The ID of the actual subgraph definition.
   * @see {@link ExportedSubgraph.subgraphs}
   */
  type: UUID
}

/**
 * Legacy serialised graph format.
 *
 * Maintained for backwards compatibility with the original `litegraph.d.ts` schema.
 * @deprecated Prefer {@link SerialisableGraph} for new save/load implementations.
 */
export interface ISerialisedGraph extends BaseExportedGraph {
  /** Highest node ID assigned in this graph. Used to allocate new IDs on deserialise. */
  last_node_id: NodeId
  /** Highest link ID assigned in this graph. Used to allocate new IDs on deserialise. */
  last_link_id: number
  /** All nodes in this graph. */
  nodes: ISerialisedNode[]
  /** All links in this graph, stored as compact arrays. */
  links: SerialisedLLinkArray[]
  /** Links not yet connected to a target slot. */
  floatingLinks?: SerialisableLLink[]
  /** All groups in this graph. */
  groups: ISerialisedGroup[]
  /** Schema version, matching {@link LiteGraph.VERSION}. */
  version: typeof LiteGraph.VERSION
  /** Arbitrary extra data attached by downstream consumers. */
  extra?: LGraphExtra
}

/**
 * Defines a subgraph and its contents.
 * Can be referenced multiple times in a schema.
 */
export interface ExportedSubgraph extends SerialisableGraph {
  /** The display name of the subgraph. */
  name: string
  /** Layout and identity of the subgraph's input boundary node. */
  inputNode: ExportedSubgraphIONode
  /** Layout and identity of the subgraph's output boundary node. */
  outputNode: ExportedSubgraphIONode
  /** Ordered list of inputs to the subgraph itself. Similar to a reroute, with the input side in the graph, and the output side in the subgraph. */
  inputs?: SubgraphIO[]
  /** Ordered list of outputs from the subgraph itself. Similar to a reroute, with the input side in the subgraph, and the output side in the graph. */
  outputs?: SubgraphIO[]
  /** A list of node widgets displayed in the parent graph, on the subgraph object. */
  widgets?: ExposedWidget[]
}

/** Properties shared by subgraph boundary I/O slots and regular node slots. */
type SubgraphIOShared = Omit<INodeSlot, "boundingRect" | "nameLocked" | "locked" | "removable" | "_floatingLinks">

/**
 * A subgraph input or output boundary slot.
 *
 * Similar to a reroute: inputs have their socket on the parent graph and their target inside
 * the subgraph; outputs are reversed.
 */
export interface SubgraphIO extends SubgraphIOShared {
  /** Slot ID (internal; never changes once instantiated). */
  id: UUID
  /** The data type this slot uses. Unlike nodes, this does not support legacy numeric types. */
  type: string
  /** Links connected to this slot, or `undefined` if not connected. An ouptut slot should only ever have one link. */
  linkIds?: LinkId[]
}

/** A reference to a node widget shown in the parent graph */
export interface ExposedWidget {
  /** The ID of the node (inside the subgraph) that the widget belongs to. */
  id: NodeId
  /** The name of the widget to show in the parent graph. */
  name: string
}

/** Serialised representation of an {@link LGraphGroup}. */
export interface ISerialisedGroup {
  /** Unique group identifier. */
  id: number
  /** Display title shown on the group header. */
  title: string
  /** Bounding rectangle as `[x, y, width, height]`. */
  bounding: number[]
  /** Background colour override. */
  color?: string
  /** Font size for the group title. */
  font_size?: number
  /** Group behaviour flags. */
  flags?: IGraphGroupFlags
}

/**
 * Compact tuple representation of a clipboard link.
 *
 * Indices reference nodes relative to the clipboard's node array rather than absolute IDs.
 */
export type TClipboardLink = [
  targetRelativeIndex: number,
  originSlot: number,
  nodeRelativeIndex: number,
  targetSlot: number,
  targetNodeId: NodeId,
]

/** Items copied from the canvas to the clipboard. */
export interface ClipboardItems {
  /** Serialised nodes included in the clipboard selection. */
  nodes?: ISerialisedNode[]
  /** Serialised groups included in the clipboard selection. */
  groups?: ISerialisedGroup[]
  /** Serialised reroutes included in the clipboard selection. */
  reroutes?: SerialisableReroute[]
  /** Serialised links connecting clipboard nodes. */
  links?: SerialisableLLink[]
  /** Full subgraph definitions referenced by clipboard subgraph instances. */
  subgraphs?: ExportedSubgraph[]
}

/**
 * Legacy clipboard contents format.
 * @deprecated Prefer {@link ClipboardItems} which uses {@link SerialisableLLink} instead of tuple links.
 */
export interface IClipboardContents {
  nodes?: ISerialisedNode[]
  links?: TClipboardLink[]
}

/** Serialisable representation of a {@link Reroute} point on a link path. */
export interface SerialisableReroute {
  /** Unique reroute identifier. */
  id: RerouteId
  /** ID of the parent reroute in the chain, if this reroute is nested. */
  parentId?: RerouteId
  /** Canvas position of the reroute point. */
  pos: Point
  /** IDs of all links that pass through this reroute. */
  linkIds: LinkId[]
  /** Floating link state when this reroute terminates an unconnected chain. */
  floating?: FloatingRerouteSlot
}

/** Serialisable representation of an {@link LLink} between two node slots. */
export interface SerialisableLLink {
  /** Link ID */
  id: LinkId
  /** Output node ID */
  origin_id: NodeId
  /** Output slot index */
  origin_slot: number
  /** Input node ID */
  target_id: NodeId
  /** Input slot index */
  target_slot: number
  /** Data type of the link */
  type: ISlotType
  /** ID of the last reroute (from input to output) that this link passes through, otherwise `undefined` */
  parentId?: RerouteId
}

/** Layout and identity of a subgraph's input or output boundary node. */
export interface ExportedSubgraphIONode {
  /** Node identifier of the boundary node within the subgraph. */
  id: NodeId
  /** Bounding rectangle as `[x, y, width, height]`. */
  bounding: [number, number, number, number]
  /** When `true`, the boundary node cannot be moved by the user. */
  pinned?: boolean
}
