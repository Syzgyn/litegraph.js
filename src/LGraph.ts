import type { DragAndScaleState } from "./DragAndScale"
import type { LGraphEventMap } from "./infrastructure/LGraphEventMap"
import type {
  Dictionary,
  HasBoundingRect,
  IContextMenuValue,
  LinkNetwork,
  LinkSegment,
  MethodNames,
  OptionalProps,
  Point,
  Positionable,
  Size,
} from "./interfaces"
import type {
  ExportedSubgraph,
  ISerialisedGraph,
  ISerialisedNode,
  Serialisable,
  SerialisableGraph,
  SerialisableReroute,
} from "./types/serialisation"
import type { IBaseWidget, TWidgetValue } from "./types/widgets"
import type { UUID } from "@/utils/uuid"

import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID, UNASSIGNED_NODE_ID } from "@/constants"
import { forEachNode } from "@/utils/graphTraversal"
import { createUuidv4, zeroUuid } from "@/utils/uuid"

import { CustomEventTarget } from "./infrastructure/CustomEventTarget"
import { LGraphCanvas } from "./LGraphCanvas"
import { LGraphGroup } from "./LGraphGroup"
import { LGraphNode, type NodeId } from "./LGraphNode"
import { LiteGraph, SubgraphNode } from "./litegraph"
import { type LinkId, LLink } from "./LLink"
import { MapProxyHandler } from "./MapProxyHandler"
import { alignOutsideContainer, alignToContainer, createBounds, snapPoint } from "./measure"
import { inputLink, outputLinks } from "./node/slotLinks"
import { isWidgetInputSlot } from "./node/slotUtils"
import { Reroute, type RerouteId } from "./Reroute"
import { stringOrEmpty } from "./strings"
import { type GraphOrSubgraph, Subgraph } from "./subgraph/Subgraph"
import { deduplicateSubgraphNodeIds, topologicalSortSubgraphs } from "./subgraph/subgraphDeduplication"
import { SubgraphInput } from "./subgraph/SubgraphInput"
import { SubgraphOutput } from "./subgraph/SubgraphOutput"
import { findUsedSubgraphIds, getBoundaryLinks, groupResolvedByOutput, mapSubgraphInputsAndLinks, mapSubgraphOutputsAndLinks, multiClone, splitPositionables, walkSegment } from "./subgraph/subgraphUtils"
import { Alignment, LGraphEventMode } from "./types/globalEnums"
import { getAllNestedItems } from "./utils/collections"
import { toConcreteWidget } from "./widgets/widgetMap"

/**
 * Monotonic ID counters persisted with the graph during serialisation.
 *
 * Used when assigning new IDs to nodes, links, groups, and reroutes.
 */
export interface LGraphState {
  /** Last assigned {@link LGraphGroup.id}. */
  lastGroupId: number
  /** Last assigned {@link LGraphNode.id} (numeric mode only). */
  lastNodeId: number
  /** Last assigned {@link LLink.id}. */
  lastLinkId: number
  /** Last assigned {@link Reroute.id}. */
  lastRerouteId: number
}

type ParamsArray<T extends Record<any, any>, K extends MethodNames<T>> =
  Parameters<T[K]>[1] extends undefined
    ? Parameters<T[K]> | Parameters<T[K]>[0]
    : Parameters<T[K]>

/** Configuration used by {@link LGraph.config}. */
export interface LGraphConfig {
  /** @deprecated Legacy config - unused */
  align_to_grid?: any
  /** @deprecated Legacy config - unused */
  links_ontop?: any
}

/** Options for {@link LGraph.add}. */
export interface GraphAddOptions {
  /** If true, skip recomputing execution order after adding the node. */
  skipComputeOrder?: boolean
  /** If true, the node will be semi-transparent and follow the cursor until placed or cancelled. */
  ghost?: boolean
  /** Mouse event for ghost placement. Used to position node under cursor. */
  dragEvent?: MouseEvent
}

/**
 * Extra serialisable metadata stored alongside the graph.
 *
 * Used for viewport state, legacy link extensions, and embedded reroute data in older schemas.
 */
export interface LGraphExtra extends Dictionary<unknown> {
  /** Legacy 0.4 schema: reroute definitions embedded in `extra`. */
  reroutes?: SerialisableReroute[]
  /** Legacy 0.4 schema: {@link LLink.parentId} values stored outside link arrays. */
  linkExtensions?: { id: number, parentId: number | undefined }[]
  /** Canvas pan/zoom saved when {@link LiteGraph.saveViewportWithGraph} is enabled. */
  ds?: DragAndScaleState
}

/** Minimal interface shared by {@link LGraph} and {@link Subgraph} for root-graph resolution. */
export interface BaseLGraph {
  /** The top-level graph that owns subgraph definitions and the primary canvas. */
  readonly rootGraph: LGraph
}

function fireNodeRemovalLifecycle(node: LGraphNode): void {
  const graph = node.graph
  if (graph) {
    (graph.events as CustomEventTarget<LGraphEventMap>).dispatch("node:before-removed", { node })
  }
  node.onRemoved?.()
  graph?.onNodeRemoved?.(node)
}

/**
 * Core container for a node graph: nodes, links, groups, reroutes, and execution state.
 *
 * An {@link LGraph} owns all {@link LGraphNode} instances, maintains link and reroute maps,
 * computes execution order, and coordinates one or more attached {@link LGraphCanvas} views.
 * It implements {@link LinkNetwork} for link/reroute resolution and {@link Serialisable} for
 * persistence.
 * @remarks
 * Supported instance callbacks (optional):
 * - {@link LGraph.onNodeAdded} — node added to the graph
 * - {@link LGraph.onNodeRemoved} — node removed from the graph
 * - {@link LGraph.onBeforeChange} / {@link LGraph.onAfterChange} — undo/redo hooks
 * - {@link LGraph.onConnectionChange} — any node connection changed
 * - {@link LGraph.onTrigger} — global trigger dispatch
 * - {@link LGraph.onSerialize} / {@link LGraph.onConfigure} — serialisation hooks
 * @see {@link LGraphCanvas.attachCanvas}
 * @see {@link LGraph.runStep}
 */
export class LGraph implements LinkNetwork, BaseLGraph, Serialisable<SerialisableGraph> {
  /** Schema version written by {@link asSerialisable}. */
  static serialisedSchemaVersion = 1 as const

  /** {@link status} value when the execution loop is not running. */
  static STATUS_STOPPED = 1
  /** {@link status} value when {@link start} has activated the execution loop. */
  static STATUS_RUNNING = 2

  /** List of LGraph properties that are manually handled by {@link LGraph.configure}. */
  static readonly ConfigureProperties = new Set([
    "nodes",
    "groups",
    "links",
    "state",
    "reroutes",
    "floatingLinks",
    "id",
    "subgraphs",
    "definitions",
    "inputs",
    "outputs",
    "widgets",
    "inputNode",
    "outputNode",
    "extra",
  ])

  /** When `true`, the graph execution loop is driven by `requestAnimationFrame`. */
  #executionRafActive = false

  /** Internal only.  Not required for serialisation; calculated on deserialise. */
  #lastFloatingLinkId: number = 0

  #floatingLinks: Map<LinkId, LLink> = new Map()

  #reroutes = new Map<RerouteId, Reroute>()

  #canvas?: LGraphCanvas

  /** Stable UUID for this graph instance, persisted across save/load. */
  id: UUID = zeroUuid
  /** Incremented when the graph structure changes; used for change detection. */
  revision: number = 0

  /** Internal version counter bumped on structural edits. */
  _version: number = -1
  /** Backing store for {@link links}. Keys are stringified link IDs. */
  _links: Map<LinkId, LLink> = new Map()
  /**
   * Indexed property access is deprecated.
   * Backwards compatibility with a Proxy has been added, but will eventually be removed.
   *
   * Use {@link Map} methods:
   * ```
   * const linkId = 123
   * const link = graph.links.get(linkId)
   * // Deprecated: const link = graph.links[linkId]
   * ```
   */
  links: Map<LinkId, LLink> & Record<LinkId, LLink>
  /** Canvases currently displaying this graph; `null` until the first {@link attachCanvas}. */
  list_of_graphcanvas: LGraphCanvas[] | null
  /** Execution state; one of {@link STATUS_STOPPED} or {@link STATUS_RUNNING}. */
  status: number = LGraph.STATUS_STOPPED

  /** ID counters and other serialisable graph state. */
  state: LGraphState = {
    lastGroupId: 0,
    lastNodeId: 0,
    lastLinkId: 0,
    lastRerouteId: 0,
  }

  readonly events = new CustomEventTarget<LGraphEventMap>()
  /** Subgraph definitions keyed by subgraph UUID (root graph only). */
  readonly _subgraphs: Map<UUID, Subgraph> = new Map()

  /** All nodes in this graph, in insertion order. */
  _nodes: (LGraphNode | SubgraphNode)[] = []
  /** Fast lookup of nodes by {@link LGraphNode.id}. */
  _nodes_by_id: Record<NodeId, LGraphNode> = {}
  /** Nodes sorted in computed execution order. */
  _nodes_in_order: LGraphNode[] = []
  /** Subset of {@link _nodes_in_order} that define {@link LGraphNode.onExecute}. */
  _nodes_executable: LGraphNode[] | null = null
  /** Visual groups on the canvas. */
  _groups: LGraphGroup[] = []
  /** Number of {@link runStep} iterations completed since {@link start}. */
  iteration: number = 0
  /** Elapsed wall-clock time since {@link starttime}, in seconds. */
  globaltime: number = 0
  /** @deprecated Unused */
  runningtime: number = 0
  /** Fixed-timestep accumulator incremented each {@link runStep}. */
  fixedtime: number = 0
  /** Seconds added to {@link fixedtime} per execution step. */
  fixedtime_lapse: number = 0.01
  /** Wall-clock duration of the most recent step, in seconds. */
  elapsed_time: number = 0.01
  /** Timestamp of the previous {@link runStep}, in milliseconds. */
  last_update_time: number = 0
  /** Timestamp when {@link start} was called, in milliseconds. */
  starttime: number = 0
  /** When `true`, {@link runStep} catches errors and calls {@link stop} on failure. */
  catch_errors: boolean = true
  /** Timer handle for the execution loop; unset when using `requestAnimationFrame`. */
  execution_timer_id?: ReturnType<typeof setInterval> | null
  /** Set when the last {@link runStep} caught an execution error. */
  errors_in_execution?: boolean
  /** @deprecated Unused */
  execution_time!: number
  _last_trigger_time?: number
  /** Optional filter string applied when searching nodes (application-specific). */
  filter?: string
  /** User configuration; must contain only serialisable primitive values. */
  config: LGraphConfig = {}
  /** Arbitrary runtime variables; not serialised by default. */
  vars: Dictionary<unknown> = {}
  /** Per-step record of nodes currently executing (deprecated internal use). */
  nodes_executing: boolean[] = []
  /** Per-step record of nodes currently firing actions (deprecated internal use). */
  nodes_actioning: (string | boolean)[] = []
  /** Per-step record of last action call IDs (deprecated internal use). */
  nodes_executedAction: string[] = []
  /** Extra metadata persisted with the graph; see {@link LGraphExtra}. */
  extra: LGraphExtra = {}

  /** @deprecated Deserialising a workflow sets this unused property. */
  version?: number

  /**
   * Creates a new graph, optionally configuring it from serialised data.
   * @param o Deserialised graph object passed to {@link configure}, or `undefined` for an empty graph.
   */
  constructor(o?: ISerialisedGraph | SerialisableGraph) {
    if (LiteGraph.debug) console.log("Graph created")

    /** @see MapProxyHandler */
    const links = this._links
    MapProxyHandler.bindAllMethods(links)
    const handler = new MapProxyHandler<LLink>()
    this.links = new Proxy(links, handler) as Map<LinkId, LLink> & Record<LinkId, LLink>

    this.list_of_graphcanvas = null
    this.clear()

    if (o) this.configure(o)
  }

  /** Generates a unique string key for a link's connection tuple. */
  static _linkTupleKey(link: LLink): string {
    return `${link.origin_id}\0${link.origin_slot}\0${link.target_id}\0${link.target_slot}`
  }

  #unpackSubgraphImpl(
    subgraphNode: SubgraphNode,
    options?: { skipMissingNodes?: boolean },
  ): void {
    const skipMissingNodes = options?.skipMissingNodes ?? false

    const positionables = [
      ...subgraphNode.subgraph.nodes,
      ...subgraphNode.subgraph.reroutes.values(),
      ...subgraphNode.subgraph.groups,
    ].map((p: { pos: Point, size?: Size }): HasBoundingRect => ({
      boundingRect: [p.pos[0], p.pos[1], p.size?.[0] ?? 0, p.size?.[1] ?? 0],
    }))
    const bounds = createBounds(positionables) ?? [0, 0, 0, 0]
    const center = [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]

    const toSelect: Positionable[] = []
    const offsetX = subgraphNode.pos[0] - center[0] + subgraphNode.size[0] / 2
    const offsetY = subgraphNode.pos[1] - center[1] + subgraphNode.size[1] / 2
    const movedNodes = multiClone(subgraphNode.subgraph.nodes)
    const nodeIdMap = new Map<NodeId, NodeId>()

    // Detach boundary links from external reroute linkIds before rewiring.
    for (const islot of subgraphNode.inputs) {
      if (islot.link == null) continue
      const link = this.links.get(islot.link)
      if (!link) continue
      for (const reroute of LLink.getReroutes(this, link)) {
        reroute.linkIds.delete(link.id)
      }
    }
    for (const oslot of subgraphNode.outputs) {
      for (const linkId of oslot.links ?? []) {
        const link = this.links.get(linkId)
        if (!link) continue
        for (const reroute of LLink.getReroutes(this, link)) {
          reroute.linkIds.delete(link.id)
        }
      }
    }

    for (const n_info of movedNodes) {
      let node = LiteGraph.createNode(String(n_info.type), n_info.title)
      if (!node) {
        if (skipMissingNodes) {
          console.warn(
            `Cannot unpack node of type "${n_info.type}" - node type not found. Creating placeholder node.`,
          )
          node = new LGraphNode(
            n_info.title || String(n_info.type) || "Missing Node",
            String(n_info.type),
          )
          node.last_serialization = n_info
          node.has_errors = true
        } else {
          throw new Error(
            `Cannot unpack: node type "${n_info.type}" is not registered`,
          )
        }
      }

      const newNodeId = ++this.state.lastNodeId
      nodeIdMap.set(n_info.id, newNodeId)
      node.id = newNodeId
      n_info.id = newNodeId

      for (const input of n_info.inputs ?? []) {
        input.link = null
      }
      for (const output of n_info.outputs ?? []) {
        output.links = []
      }

      this.add(node, true)
      node.configure(n_info)
      node.pos[0] += offsetX
      node.pos[1] += offsetY
      toSelect.push(node)
    }

    const groups = structuredClone(
      [...subgraphNode.subgraph.groups].map(g => g.serialize()),
    )
    const newLinks: {
      oid: NodeId
      oslot: number
      tid: NodeId
      tslot: number
      id: LinkId
      iparent?: RerouteId
      eparent?: RerouteId
      externalFirst: boolean
    }[] = []

    for (const [, link] of subgraphNode.subgraph.links) {
      const outerLink = link.origin_id === SUBGRAPH_INPUT_ID
        ? inputLink(this, subgraphNode.id, link.origin_slot)
        : undefined
      const originId = link.origin_id === SUBGRAPH_INPUT_ID
        ? outerLink?.origin_id
        : (link.origin_id === UNASSIGNED_NODE_ID
          ? undefined
          : nodeIdMap.get(link.origin_id))
      if (originId == null) {
        console.error("Missing Link ID when unpacking")
        continue
      }

      const originSlot = outerLink?.origin_slot ?? link.origin_slot
      const externalParentId = outerLink?.parentId

      if (link.target_id === SUBGRAPH_OUTPUT_ID) {
        for (const sublink of outputLinks(this, subgraphNode.id, link.target_slot)) {
          newLinks.push({
            oid: originId,
            oslot: originSlot,
            tid: sublink.target_id,
            tslot: sublink.target_slot,
            id: link.id,
            iparent: link.parentId,
            eparent: sublink.parentId,
            externalFirst: true,
          })
          sublink.parentId = undefined
        }
        continue
      }

      const targetId = link.target_id === UNASSIGNED_NODE_ID
        ? undefined
        : nodeIdMap.get(link.target_id)
      if (targetId == null) {
        console.error("Missing Link ID when unpacking")
        continue
      }

      newLinks.push({
        oid: originId,
        oslot: originSlot,
        tid: targetId,
        tslot: link.target_slot,
        id: link.id,
        iparent: link.parentId,
        eparent: externalParentId,
        externalFirst: false,
      })
    }

    this.remove(subgraphNode)

    for (const groupInfo of groups) {
      const groupId = ++this.state.lastGroupId
      groupInfo.id = groupId
      const group = new LGraphGroup(groupInfo.title, groupId)
      this.add(group, true)
      group.configure(groupInfo)
      group.pos[0] += offsetX
      group.pos[1] += offsetY
      toSelect.push(group)
    }

    const seenLinks = new Set<string>()
    const dedupedNewLinks = newLinks.filter((link) => {
      const key = `${link.oid}\0${link.oslot}\0${link.tid}\0${link.tslot}`
      if (seenLinks.has(key)) return false
      seenLinks.add(key)
      return true
    })

    for (const newLink of dedupedNewLinks) {
      let created: LLink | null | undefined
      if (newLink.oid === SUBGRAPH_INPUT_ID) {
        if (!(this instanceof Subgraph)) {
          console.error("Ignoring link to subgraph outside subgraph")
          continue
        }
        if (newLink.tid === UNASSIGNED_NODE_ID) continue

        const subgraph = this

        const tnode = subgraph.getNodeById(newLink.tid)
        if (!tnode) continue
        created = subgraph.inputNode.slots[newLink.oslot].connect(
          tnode.inputs[newLink.tslot],
          tnode,
        )
      } else if (newLink.tid === SUBGRAPH_OUTPUT_ID) {
        if (!(this instanceof Subgraph)) {
          console.error("Ignoring link to subgraph outside subgraph")
          continue
        }
        if (newLink.oid === UNASSIGNED_NODE_ID) continue

        const subgraph = this

        const tnode = subgraph.getNodeById(newLink.oid)
        if (!tnode) continue
        created = subgraph.outputNode.slots[newLink.tslot].connect(
          tnode.outputs[newLink.oslot],
          tnode,
        )
      } else {
        if (newLink.oid === UNASSIGNED_NODE_ID || newLink.tid === UNASSIGNED_NODE_ID) continue
        const originNode = this.getNodeById(newLink.oid)
        const targetNode = this.getNodeById(newLink.tid)
        if (!originNode || !targetNode) continue
        created = originNode.connect(newLink.oslot, targetNode, newLink.tslot)
      }
      if (!created) {
        console.error("Failed to create link")
        continue
      }
      newLink.id = created.id
    }

    const rerouteIdMap = new Map<RerouteId, RerouteId>()
    const oldReroutes = subgraphNode.subgraph.reroutes
    for (const reroute of oldReroutes.values()) {
      const migratedReroute = this.setReroute({
        pos: [reroute.pos[0] + offsetX, reroute.pos[1] + offsetY],
        linkIds: [],
      })
      rerouteIdMap.set(reroute.id, migratedReroute.id)
      toSelect.push(migratedReroute)
    }

    for (const newLink of dedupedNewLinks) {
      const linkInstance = this.links.get(newLink.id)
      if (!linkInstance) continue

      const internal = walkSegment(newLink.iparent, (id) => {
        const emit = rerouteIdMap.get(id)
        return emit === undefined
          ? undefined
          : { emit, next: oldReroutes.get(id)?.parentId }
      })
      const external = walkSegment(newLink.eparent, (id) => {
        const reroute = this.reroutes.get(id)
        return reroute && { emit: id, next: reroute.parentId }
      })
      const [first, second] = newLink.externalFirst
        ? [external, internal]
        : [internal, external]
      const chain = first.complete
        ? [...first.segment, ...second.segment]
        : first.segment

      let segmentEnd: LLink | Reroute = linkInstance
      for (const rerouteId of chain) {
        segmentEnd.parentId = rerouteId
        const next = this.reroutes.get(rerouteId)
        if (!next) break
        next.linkIds.add(linkInstance.id)
        segmentEnd = next
      }
    }

    for (const nodeId of nodeIdMap.values()) {
      const node = this._nodes_by_id[nodeId]
      node._setConcreteSlots()
      node.arrange()
    }

    this.canvasAction(c => c.selectItems(toSelect))
  }

  #snapshotHostSubgraphWidgetValues(): Map<NodeId, Map<string, TWidgetValue>> {
    const snapshots = new Map<NodeId, Map<string, TWidgetValue>>()
    const allGraphs: LGraph[] = [
      this.rootGraph,
      ...this.rootGraph._subgraphs.values(),
    ]

    for (const graph of allGraphs) {
      for (const node of graph._nodes) {
        if (!node.isSubgraphNode() || node.type !== this.id) continue
        snapshots.set(
          node.id,
          new Map(node.widgets.map(widget => [widget.name, widget.value])),
        )
      }
    }

    return snapshots
  }

  /**
   * After packing nodes into a nested subgraph, refresh promoted widget
   * bindings on all host {@link SubgraphNode} instances of this subgraph.
   */
  #refreshHostSubgraphWidgetBindings(
    hostWidgetValues?: Map<NodeId, Map<string, TWidgetValue>>,
  ): void {
    const allGraphs: LGraph[] = [
      this.rootGraph,
      ...this.rootGraph._subgraphs.values(),
    ]

    for (const graph of allGraphs) {
      for (const node of graph._nodes) {
        if (!node.isSubgraphNode() || node.type !== this.id) continue
        const values = hostWidgetValues?.get(node.id)
        if (values) node.restorePromotedWidgetValues(values)
        else node.rebuildInputWidgetBindings()
      }
    }
  }

  /** @returns The drag and scale state of the first attached canvas, otherwise `undefined`. */
  #getDragAndScale(): DragAndScaleState | undefined {
    const ds = this.list_of_graphcanvas?.at(0)?.ds
    if (ds) return { scale: ds.scale, offset: ds.offset }
  }

  /** @returns All selectable items on the canvas: nodes, groups, and reroutes. */
  * positionableItems(): Generator<LGraphNode | LGraphGroup | Reroute> {
    for (const node of this._nodes) yield node
    for (const group of this._groups) yield group
    for (const reroute of this.reroutes.values()) yield reroute
    return
  }

  /** @returns Whether the graph has no nodes, groups, or reroutes. */
  get empty(): boolean {
    return this._nodes.length + this._groups.length + this.reroutes.size === 0
  }

  /** Links with one end disconnected, keyed by link ID. */
  get floatingLinks(): ReadonlyMap<LinkId, LLink> {
    return this.#floatingLinks
  }

  /** All reroutes in this graph, keyed by {@link Reroute.id}. */
  public get reroutes(): Map<RerouteId, Reroute> {
    return this.#reroutes
  }

  /** @inheritdoc BaseLGraph.rootGraph — for a root graph, returns `this`. */
  get rootGraph(): LGraph {
    return this
  }

  /** `true` when this graph is the root (not a {@link Subgraph} inner graph). */
  get isRootGraph(): boolean {
    return this.rootGraph === this
  }

  /** @deprecated See {@link LGraph.state} `lastNodeId` instead. */
  get last_node_id() {
    return this.state.lastNodeId
  }

  set last_node_id(value) {
    this.state.lastNodeId = value
  }

  /** @deprecated See {@link LGraph.state} `lastLinkId` instead. */
  get last_link_id() {
    return this.state.lastLinkId
  }

  set last_link_id(value) {
    this.state.lastLinkId = value
  }

  onAfterStep?(): void
  /** Called immediately before each {@link runStep} iteration. */
  onBeforeStep?(): void
  /** Called when {@link start} begins the execution loop. */
  onPlayEvent?(): void
  /** Called when {@link stop} halts the execution loop. */
  onStopEvent?(): void
  /** Called after all nodes execute in a {@link runStep} cycle (when errors are caught). */
  onAfterExecute?(): void
  /** Called after each inner iteration within {@link runStep}. */
  onExecuteStep?(): void
  /** Invoked from {@link add} after a node is registered. */
  onNodeAdded?(node: LGraphNode): void
  /** Invoked from {@link remove} after a node is unregistered. */
  onNodeRemoved?(node: LGraphNode): void
  /** Invoked from {@link trigger} when a global action fires. */
  onTrigger?(action: string, param: unknown): void
  /** Undo hook; called from {@link beforeChange}. */
  onBeforeChange?(graph: LGraph, info?: LGraphNode): void
  /** Undo hook; called from {@link afterChange}. */
  onAfterChange?(graph: LGraph, info?: LGraphNode | null): void
  /** Called when any node's connections change (application-specific). */
  onConnectionChange?(node: LGraphNode): void
  /** @deprecated Legacy change notification; prefer {@link events} or canvas hooks. */
  on_change?(graph: LGraph): void
  /** Hook invoked from {@link asSerialisable} before returning data. */
  onSerialize?(data: ISerialisedGraph | SerialisableGraph): void
  /** Hook invoked from {@link configure} after the graph is rebuilt. */
  onConfigure?(data: ISerialisedGraph | SerialisableGraph): void
  /** Allows extending the node context menu when a node is right-clicked. */
  onGetNodeMenuOptions?(options: (IContextMenuValue<unknown> | null)[], node: LGraphNode): void

  /**
   * Removes all nodes, links, groups, reroutes, and runtime state from this graph.
   *
   * Calls {@link stop}, resets ID counters, and notifies attached canvases to clear.
   */
  clear(): void {
    this.stop()
    this.status = LGraph.STATUS_STOPPED

    this.id = zeroUuid
    this.revision = 0

    this.state = {
      lastGroupId: 0,
      lastNodeId: 0,
      lastLinkId: 0,
      lastRerouteId: 0,
    }

    // used to detect changes
    this._version = -1
    this._subgraphs.clear()

    // safe clear
    if (this._nodes) {
      for (const _node of this._nodes) {
        fireNodeRemovalLifecycle(_node)
      }
    }

    // nodes
    this._nodes = []
    this._nodes_by_id = {}
    // nodes sorted in execution order
    this._nodes_in_order = []
    // nodes that contain onExecute sorted in execution order
    this._nodes_executable = null

    this._links.clear()
    this.reroutes.clear()
    this.#floatingLinks.clear()

    this.#lastFloatingLinkId = 0

    // other scene stuff
    this._groups = []

    // iterations
    this.iteration = 0

    // custom data
    this.config = {}
    this.vars = {}
    // to store custom data
    this.extra = {}

    // timing
    this.globaltime = 0
    this.runningtime = 0
    this.fixedtime = 0
    this.fixedtime_lapse = 0.01
    this.elapsed_time = 0.01
    this.last_update_time = 0
    this.starttime = 0

    this.catch_errors = true

    this.nodes_executing = []
    this.nodes_actioning = []
    this.nodes_executedAction = []

    // notify canvas to redraw
    this.change()

    this.canvasAction(c => c.clear())
  }

  /** Subgraph definitions owned by the {@link rootGraph}. */
  get subgraphs(): Map<UUID, Subgraph> {
    return this.rootGraph._subgraphs
  }

  /** All nodes in this graph. Same array as internal `_nodes`. */
  get nodes() {
    return this._nodes
  }

  /** All {@link LGraphGroup} instances in this graph. */
  get groups() {
    return this._groups
  }

  /**
   * Registers a canvas as a view of this graph and sets it as {@link primaryCanvas}.
   * @param canvas The {@link LGraphCanvas} to attach.
   * @throws {TypeError} If `canvas` is not an {@link LGraphCanvas} instance.
   */
  attachCanvas(canvas: LGraphCanvas): void {
    if (!(canvas instanceof LGraphCanvas)) {
      throw new TypeError("attachCanvas expects an LGraphCanvas instance")
    }

    this.primaryCanvas = canvas

    this.list_of_graphcanvas ??= []
    if (!this.list_of_graphcanvas.includes(canvas)) {
      this.list_of_graphcanvas.push(canvas)
    }

    if (canvas.graph === this) return

    canvas.graph?.detachCanvas(canvas)
    canvas.graph = this
    canvas.subgraph = undefined
  }

  /**
   * Unregisters a canvas from this graph.
   * @param canvas The canvas to detach; its {@link LGraphCanvas.graph} is set to `null`.
   */
  detachCanvas(canvas: LGraphCanvas): void {
    canvas.graph = null
    const canvases = this.list_of_graphcanvas
    if (canvases) {
      const pos = canvases.indexOf(canvas)
      if (pos !== -1) canvases.splice(pos, 1)
    }
  }

  /**
   * @deprecated Will be removed in 0.9
   * Starts running this graph every interval milliseconds.
   * @param interval amount of milliseconds between executions, if 0 then it renders to the monitor refresh rate
   */
  start(interval?: number): void {
    if (this.status == LGraph.STATUS_RUNNING) return
    this.status = LGraph.STATUS_RUNNING

    this.onPlayEvent?.()
    this.sendEventToAllNodes("onStart")

    // launch
    this.starttime = LiteGraph.getTime()
    this.last_update_time = this.starttime
    interval ||= 0

    // execute once per frame
    if (
      interval == 0 &&
      typeof window != "undefined" &&
      window.requestAnimationFrame
    ) {
      const on_frame = () => {
        if (!this.#executionRafActive) return

        window.requestAnimationFrame(on_frame)
        this.onBeforeStep?.()
        this.runStep(1, !this.catch_errors)
        this.onAfterStep?.()
      }
      this.#executionRafActive = true
      this.execution_timer_id = null
      on_frame()
    } else {
      this.#executionRafActive = false
      // execute every 'interval' ms
      this.execution_timer_id = setInterval(() => {
        // execute
        this.onBeforeStep?.()
        this.runStep(1, !this.catch_errors)
        this.onAfterStep?.()
      }, interval)
    }
  }

  /**
   * @deprecated Will be removed in 0.9
   * Stops the execution loop of the graph
   */
  stop(): void {
    if (this.status == LGraph.STATUS_STOPPED) return

    this.status = LGraph.STATUS_STOPPED

    this.onStopEvent?.()

    if (this.execution_timer_id != null) {
      clearInterval(this.execution_timer_id)
    }
    this.#executionRafActive = false
    this.execution_timer_id = null

    this.sendEventToAllNodes("onStop")
  }

  /**
   * Run N steps (cycles) of the graph
   * @param num number of steps to run, default is 1
   * @param do_not_catch_errors [optional] if you want to try/catch errors
   * @param limit max number of nodes to execute (used to execute from start to a node)
   */
  runStep(num: number, do_not_catch_errors: boolean, limit?: number): void {
    num = num || 1

    const start = LiteGraph.getTime()
    this.globaltime = 0.001 * (start - this.starttime)

    const nodes = this._nodes_executable || this._nodes
    if (!nodes) return

    limit = limit || nodes.length

    if (do_not_catch_errors) {
      // iterations
      for (let i = 0; i < num; i++) {
        for (let j = 0; j < limit; ++j) {
          const node = nodes[j]
          // FIXME: Looks like copy/paste broken logic - checks for "on", executes "do"
          if (node.mode == LGraphEventMode.ALWAYS && node.onExecute) {
            // wrap node.onExecute();
            node.doExecute?.()
          }
        }

        this.fixedtime += this.fixedtime_lapse
        this.onExecuteStep?.()
      }

      this.onAfterExecute?.()
    } else {
      try {
        // iterations
        for (let i = 0; i < num; i++) {
          for (let j = 0; j < limit; ++j) {
            const node = nodes[j]
            if (node.mode == LGraphEventMode.ALWAYS) {
              node.onExecute?.()
            }
          }

          this.fixedtime += this.fixedtime_lapse
          this.onExecuteStep?.()
        }

        this.onAfterExecute?.()
        this.errors_in_execution = false
      } catch (error) {
        this.errors_in_execution = true
        if (LiteGraph.throw_errors) throw error

        if (LiteGraph.debug) console.log("Error during execution:", error)
        this.stop()
      }
    }

    const now = LiteGraph.getTime()
    let elapsed = now - start
    if (elapsed == 0) elapsed = 1

    this.execution_time = 0.001 * elapsed
    this.globaltime += 0.001 * elapsed
    this.iteration += 1
    this.elapsed_time = (now - this.last_update_time) * 0.001
    this.last_update_time = now
    this.nodes_executing = []
    this.nodes_actioning = []
    this.nodes_executedAction = []
  }

  /**
   * Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
   * nodes with only inputs.
   */
  updateExecutionOrder(): void {
    this._nodes_in_order = this.computeExecutionOrder(false)
    this._nodes_executable = []
    for (const node of this._nodes_in_order) {
      if (node.onExecute) {
        this._nodes_executable.push(node)
      }
    }
  }

  // This is more internal, it computes the executable nodes in order and returns it
  /**
   * Computes a topological execution order for all nodes.
   *
   * Starting nodes have no connected inputs. Nodes in cycles are appended after the DAG portion.
   * Optionally assigns {@link LGraphNode._level} and {@link LGraphNode.order}.
   * @param only_onExecute When `true`, only nodes with {@link LGraphNode.onExecute} are considered.
   * @param set_level When `true`, writes `_level` on each node based on graph depth.
   * @returns Nodes sorted by priority and dependency order.
   */
  computeExecutionOrder(
    only_onExecute: boolean,
    set_level?: boolean,
  ): LGraphNode[] {
    const L: LGraphNode[] = []
    const S: LGraphNode[] = []
    const M: Dictionary<LGraphNode> = {}
    // to avoid repeating links
    const visited_links: Record<NodeId, boolean> = {}
    const remaining_links: Record<NodeId, number> = {}

    // search for the nodes without inputs (starting nodes)
    for (const node of this._nodes) {
      if (only_onExecute && !node.onExecute) {
        continue
      }

      // add to pending nodes
      M[node.id] = node

      // num of input connections
      let num = 0
      if (node.inputs) {
        for (const input of node.inputs) {
          if (input?.link != null) {
            num += 1
          }
        }
      }

      if (num == 0) {
        // is a starting node
        S.push(node)
        if (set_level) node._level = 1
      } else {
        // num of input links
        if (set_level) node._level = 0
        remaining_links[node.id] = num
      }
    }

    while (true) {
      // get an starting node
      const node = S.shift()
      if (node === undefined) break

      // add to ordered list
      L.push(node)
      // remove from the pending nodes
      delete M[node.id]

      if (!node.outputs) continue

      // for every output
      for (const output of node.outputs) {
        // not connected
        // TODO: Confirm functionality, clean condition
        if (output?.links == null || output.links.length == 0)
          continue

        // for every connection
        for (const link_id of output.links) {
          const link = this._links.get(link_id)
          if (!link) continue

          // already visited link (ignore it)
          if (visited_links[link.id] != null) continue

          const target_node = this.getNodeById(link.target_id)
          if (target_node == null) {
            visited_links[link.id] = true
            continue
          }

          if (set_level) {
            node._level ??= 0
            if (!target_node._level || target_node._level <= node._level) {
              target_node._level = node._level + 1
            }
          }

          // mark as visited
          visited_links[link.id] = true
          // reduce the number of links remaining
          remaining_links[target_node.id] -= 1

          // if no more links, then add to starters array
          if (remaining_links[target_node.id] == 0) S.push(target_node)
        }
      }
    }

    // the remaining ones (loops)
    for (const i in M) {
      L.push(M[i])
    }

    if (L.length != this._nodes.length && LiteGraph.debug)
      console.warn("something went wrong, nodes missing")

    /** Ensure type is set */
    type OrderedLGraphNode = LGraphNode & { order: number }

    // Sets the order property of each provided node to its index in nodes.
    function setOrder(nodes: LGraphNode[]): asserts nodes is OrderedLGraphNode[] {
      const l = nodes.length
      for (let i = 0; i < l; ++i) {
        nodes[i].order = i
      }
    }

    // save order number in the node
    setOrder(L)

    // sort now by priority
    L.sort(function (A, B) {
      // @ts-expect-error ctor props
      const Ap = A.constructor.priority || A.priority || 0
      // @ts-expect-error ctor props
      const Bp = B.constructor.priority || B.priority || 0
      // if same priority, sort by order

      return Ap == Bp
        ? A.order - B.order
        : Ap - Bp
    })

    // save order number in the node, again...
    setOrder(L)

    return L
  }

  /**
   * Positions every node in a more readable manner
   */
  arrange(margin?: number, layout?: string): void {
    margin = margin || 100

    const nodes = this.computeExecutionOrder(false, true)
    const columns: LGraphNode[][] = []
    for (const node of nodes) {
      const col = node._level || 1
      columns[col] ||= []
      columns[col].push(node)
    }

    let x = margin

    for (const column of columns) {
      if (!column) continue

      let max_size = 100
      let y = margin + LiteGraph.NODE_TITLE_HEIGHT
      for (const node of column) {
        node.pos[0] = layout == LiteGraph.VERTICAL_LAYOUT ? y : x
        node.pos[1] = layout == LiteGraph.VERTICAL_LAYOUT ? x : y
        const max_size_index = layout == LiteGraph.VERTICAL_LAYOUT ? 1 : 0
        if (node.size[max_size_index] > max_size) {
          max_size = node.size[max_size_index]
        }
        const node_size_index = layout == LiteGraph.VERTICAL_LAYOUT ? 0 : 1
        y += node.size[node_size_index] + margin + LiteGraph.NODE_TITLE_HEIGHT
      }
      x += max_size + margin
    }

    this.setDirtyCanvas(true, true)
  }

  /**
   * Returns the amount of time the graph has been running in milliseconds
   * @returns number of milliseconds the graph has been running
   */
  getTime(): number {
    return this.globaltime
  }

  /**
   * Returns the amount of time accumulated using the fixedtime_lapse var.
   * This is used in context where the time increments should be constant
   * @returns number of milliseconds the graph has been running
   */
  getFixedTime(): number {
    return this.fixedtime
  }

  /**
   * Returns the amount of time it took to compute the latest iteration.
   * Take into account that this number could be not correct
   * if the nodes are using graphical actions
   * @returns number of milliseconds it took the last cycle
   */
  getElapsedTime(): number {
    return this.elapsed_time
  }

  /**
   * Increments the internal version counter.
   * Currently only read for debug display in {@link LGraphCanvas.renderInfo}.
   * Centralized so a future VersionSystem can intercept, batch, or replace it.
   */
  incrementVersion(): void {
    this._version++
  }

  /**
   * @deprecated Will be removed in 0.9
   * Sends an event to all the nodes, useful to trigger stuff
   * @param eventname the name of the event (function to be called)
   * @param params parameters in array format
   */
  sendEventToAllNodes(
    eventname: string,
    params?: object | object[],
    mode?: LGraphEventMode,
  ): void {
    mode = mode || LGraphEventMode.ALWAYS

    const nodes = this._nodes_in_order || this._nodes
    if (!nodes) return

    for (const node of nodes) {
      // @ts-expect-error deprecated
      if (node[eventname] == null || node.mode != mode) continue
      if (params === undefined) {
        // @ts-expect-error deprecated
        node[eventname]()
      } else if (params && params.constructor === Array) {
        // @ts-expect-error deprecated
        node[eventname].apply(node, params)
      } else {
        // @ts-expect-error deprecated
        node[eventname](params)
      }
    }
  }

  /**
   * Runs an action on every canvas registered to this graph.
   * @param action Action to run for every canvas
   */
  canvasAction(action: (canvas: LGraphCanvas) => void): void {
    const canvases = this.list_of_graphcanvas
    if (!canvases) return
    for (const canvas of canvases) action(canvas)
  }

  /** @deprecated See {@link LGraph.canvasAction} */
  sendActionToCanvas<T extends MethodNames<LGraphCanvas>>(
    action: T,
    params?: ParamsArray<LGraphCanvas, T>,
  ): void {
    const { list_of_graphcanvas } = this
    if (!list_of_graphcanvas) return

    for (const c of list_of_graphcanvas) {
      c[action]?.apply(c, params)
    }
  }

  /**
   * Adds a new node instance to this graph
   * @param node the instance of the node
   * @param options Additional options for adding the node
   */
  add(
    node: LGraphNode | LGraphGroup,
    options?: GraphAddOptions,
  ): LGraphNode | null | undefined
  /**
   * Adds a new node instance to this graph
   * @param node the instance of the node
   * @param skipComputeOrder If true, skip recomputing execution order
   * @deprecated Use options object instead
   */
  add(
    node: LGraphNode | LGraphGroup,
    skipComputeOrder?: boolean,
  ): LGraphNode | null | undefined
  add(
    node: LGraphNode | LGraphGroup,
    skipComputeOrderOrOptions?: boolean | GraphAddOptions,
  ): LGraphNode | null | undefined {
    if (!node) return

    const opts: GraphAddOptions =
      typeof skipComputeOrderOrOptions === "object"
        ? skipComputeOrderOrOptions
        : { skipComputeOrder: skipComputeOrderOrOptions ?? false }
    const shouldSkipComputeOrder = opts.skipComputeOrder ?? false

    const { state } = this

    // Ensure created items are snapped
    if (LiteGraph.alwaysSnapToGrid) {
      const snapTo = this.getSnapToGridSize()
      if (snapTo) node.snapToGrid(snapTo)
    }

    // LEGACY: This was changed from constructor === LGraphGroup
    // groups
    if (node instanceof LGraphGroup) {
      // Assign group ID
      if (node.id == null || node.id === -1) node.id = ++state.lastGroupId
      if (node.id > state.lastGroupId) state.lastGroupId = node.id

      this._groups.push(node)
      this.setDirtyCanvas(true)
      this.change()
      node.graph = this
      this.incrementVersion()
      return
    }

    // nodes
    if (node.id != -1 && this._nodes_by_id[node.id] != null) {
      console.warn(
        "LiteGraph: there is already a node with this ID, changing it",
      )
      node.id = LiteGraph.use_uuids
        ? LiteGraph.uuidv4()
        : ++state.lastNodeId
    }

    if (this._nodes.length >= LiteGraph.MAX_NUMBER_OF_NODES) {
      throw "LiteGraph: max number of nodes in a graph reached"
    }

    // give him an id
    if (LiteGraph.use_uuids) {
      if (node.id == null || node.id == -1)
        node.id = LiteGraph.uuidv4()
    } else {
      if (node.id == null || node.id == -1) {
        node.id = ++state.lastNodeId
      } else if (typeof node.id === "number" && state.lastNodeId < node.id) {
        state.lastNodeId = node.id
      }
    }

    if (opts.ghost) {
      node.flags.ghost = true
    }

    node.graph = this
    this.incrementVersion()

    this._nodes.push(node)
    this._nodes_by_id[node.id] = node

    node.onAdded?.(this)

    if (this.config.align_to_grid) node.alignToGrid()

    if (!shouldSkipComputeOrder) this.updateExecutionOrder()

    this.onNodeAdded?.(node)

    this.setDirtyCanvas(true)
    this.change()

    if (opts.ghost) {
      this.canvasAction(c => c.startGhostPlacement(node, opts.dragEvent))
    }

    if (node.isSubgraphNode?.()) {
      forEachNode(node.subgraph, (innerNode) => {
        if (innerNode.isSubgraphNode())
          this.subgraphs.set(innerNode.subgraph.id, innerNode.subgraph)
      })
    }

    // to chain actions
    return node
  }

  /**
   * Removes a node from the graph
   * @param node the instance of the node
   */
  remove(node: LGraphNode | LGraphGroup): void {
    // LEGACY: This was changed from constructor === LiteGraph.LGraphGroup
    if (node instanceof LGraphGroup) {
      this.canvasAction(c => c.deselect(node))

      const index = this._groups.indexOf(node)
      if (index != -1) {
        this._groups.splice(index, 1)
      }
      node.graph = undefined
      this.incrementVersion()
      this.setDirtyCanvas(true, true)
      this.change()
      return
    }

    // not found
    if (this._nodes_by_id[node.id] == null) {
      console.warn("LiteGraph: node not found", node)
      return
    }
    // cannot be removed
    if (node.ignore_remove) {
      console.warn("LiteGraph: node cannot be removed", node)
      return
    }

    // sure? - almost sure is wrong
    this.beforeChange()

    this.events.dispatch("node:before-removed", { node })

    const { inputs, outputs } = node

    // disconnect inputs
    if (inputs) {
      for (const [i, slot] of inputs.entries()) {
        if (slot.link != null) node.disconnectInput(i, true)
      }
    }

    // disconnect outputs
    if (outputs) {
      for (const [i, slot] of outputs.entries()) {
        if (slot.links?.length) node.disconnectOutput(i)
      }
    }

    // Floating links
    for (const link of this.floatingLinks.values()) {
      if (link.origin_id === node.id || link.target_id === node.id) {
        this.removeFloatingLink(link)
      }
    }

    if (node.isSubgraphNode()) {
      const allGraphs = [this.rootGraph, ...this.rootGraph._subgraphs.values()]
      const hasRemainingReferences = allGraphs.some(graph =>
        graph.nodes.some(
          candidate =>
            candidate !== node &&
            candidate.isSubgraphNode() &&
            candidate.type === node.subgraph.id,
        ))

      if (!hasRemainingReferences) {
        forEachNode(node.subgraph, (innerNode) => {
          fireNodeRemovalLifecycle(innerNode)
          if (innerNode.isSubgraphNode())
            this.rootGraph.subgraphs.delete(innerNode.subgraph.id)
        })
        this.rootGraph.subgraphs.delete(node.subgraph.id)
      }
    }

    // callback
    node.onRemoved?.()

    node.graph = null
    this.incrementVersion()

    // remove from canvas render
    const { list_of_graphcanvas } = this
    if (list_of_graphcanvas) {
      for (const canvas of list_of_graphcanvas) {
        if (canvas.selected_nodes[node.id] != null)
          delete canvas.selected_nodes[node.id]

        canvas.deselect(node)
      }
    }

    // remove from containers
    const pos = this._nodes.indexOf(node)
    if (pos != -1) this._nodes.splice(pos, 1)

    delete this._nodes_by_id[node.id]

    this.onNodeRemoved?.(node)

    // close panels
    this.canvasAction(c => c.checkPanels())

    this.setDirtyCanvas(true, true)
    // sure? - almost sure is wrong
    this.afterChange()
    this.change()

    this.updateExecutionOrder()
  }

  /**
   * Returns a node by its id.
   */
  getNodeById(id: NodeId | null | undefined): LGraphNode | null {
    return id != null
      ? this._nodes_by_id[id]
      : null
  }

  /**
   * Returns a list of nodes that matches a class
   * @param classObject the class itself (not an string)
   * @returns a list with all the nodes of this type
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  findNodesByClass(classObject: Function, result?: LGraphNode[]): LGraphNode[] {
    result = result || []
    result.length = 0
    const { _nodes } = this
    for (const node of _nodes) {
      if (node.constructor === classObject)
        result.push(node)
    }
    return result
  }

  /**
   * Returns a list of nodes that matches a type
   * @param type the name of the node type
   * @returns a list with all the nodes of this type
   */
  findNodesByType(type: string, result: LGraphNode[]): LGraphNode[] {
    const matchType = type.toLowerCase()
    result = result || []
    result.length = 0
    const { _nodes } = this
    for (const node of _nodes) {
      if (node.type?.toLowerCase() == matchType)
        result.push(node)
    }
    return result
  }

  /**
   * Returns the first node that matches a name in its title
   * @param title the name of the node to search
   * @returns the node or null
   */
  findNodeByTitle(title: string): LGraphNode | null {
    const { _nodes } = this
    for (const node of _nodes) {
      if (node.title == title)
        return node
    }
    return null
  }

  /**
   * Returns a list of nodes that matches a name
   * @param title the name of the node to search
   * @returns a list with all the nodes with this name
   */
  findNodesByTitle(title: string): LGraphNode[] {
    const result: LGraphNode[] = []
    const { _nodes } = this
    for (const node of _nodes) {
      if (node.title == title)
        result.push(node)
    }
    return result
  }

  /**
   * Returns the top-most node in this position of the canvas
   * @param x the x coordinate in canvas space
   * @param y the y coordinate in canvas space
   * @param nodeList a list with all the nodes to search from, by default is all the nodes in the graph
   * @returns the node at this position or null
   */
  getNodeOnPos(
    x: number,
    y: number,
    nodeList?: LGraphNode[],
  ): LGraphNode | null {
    const nodes = nodeList || this._nodes
    let i = nodes.length
    while (--i >= 0) {
      const node = nodes[i]
      if (node.isPointInside(x, y)) return node
    }
    return null
  }

  /**
   * Returns the top-most group in that position
   * @param x The x coordinate in canvas space
   * @param y The y coordinate in canvas space
   * @returns The group or null
   */
  getGroupOnPos(x: number, y: number): LGraphGroup | undefined {
    return this._groups.findLast(g => g.isPointInside(x, y))
  }

  /**
   * Returns the top-most group with a titlebar in the provided position.
   * @param x The x coordinate in canvas space
   * @param y The y coordinate in canvas space
   * @returns The group or null
   */
  getGroupTitlebarOnPos(x: number, y: number): LGraphGroup | undefined {
    return this._groups.findLast(g => g.isPointInTitlebar(x, y))
  }

  /**
   * Finds a reroute a the given graph point
   * @param x X co-ordinate in graph space
   * @param y Y co-ordinate in graph space
   * @returns The first reroute under the given co-ordinates, or undefined
   */
  getRerouteOnPos(x: number, y: number, reroutes?: Iterable<Reroute>): Reroute | undefined {
    for (const reroute of reroutes ?? this.reroutes.values()) {
      if (reroute.containsPoint([x, y])) return reroute
    }
  }

  /**
   * Snaps the provided items to a grid.
   *
   * Item positions are reounded to the nearest multiple of {@link LiteGraph.CANVAS_GRID_SIZE}.
   *
   * When {@link LiteGraph.alwaysSnapToGrid} is enabled
   * and the grid size is falsy, a default of 1 is used.
   * @param items The items to be snapped to the grid
   * @todo Currently only snaps nodes.
   */
  snapToGrid(items: Set<Positionable>): void {
    const snapTo = this.getSnapToGridSize()
    if (!snapTo) return

    for (const item of getAllNestedItems(items)) {
      if (!item.pinned) item.snapToGrid(snapTo)
    }
  }

  /**
   * Finds the size of the grid that items should be snapped to when moved.
   * @returns The size of the grid that items should be snapped to
   */
  getSnapToGridSize(): number {
    // Default to 1 when always snapping
    return LiteGraph.alwaysSnapToGrid
      ? LiteGraph.CANVAS_GRID_SIZE || 1
      : LiteGraph.CANVAS_GRID_SIZE
  }

  /**
   * @deprecated Will be removed in 0.9
   * Checks that the node type matches the node type registered,
   * used when replacing a nodetype by a newer version during execution
   * this replaces the ones using the old version with the new version
   */
  checkNodeTypes() {
    const { _nodes } = this
    for (const [i, node] of _nodes.entries()) {
      const ctor = LiteGraph.registered_node_types[node.type]
      if (node.constructor == ctor) continue

      console.log("node being replaced by newer version:", node.type)
      const newnode = LiteGraph.createNode(node.type)
      if (!newnode) continue
      _nodes[i] = newnode
      newnode.configure(node.serialize())
      newnode.graph = this
      this._nodes_by_id[newnode.id] = newnode

      if (node.inputs) newnode.inputs = [...node.inputs]
      if (node.outputs) newnode.outputs = [...node.outputs]
    }
    this.updateExecutionOrder()
  }

  // ********** GLOBALS *****************
  /**
   * Dispatches a named trigger to {@link onTrigger} listeners.
   * @param action Trigger name.
   * @param param Payload passed to the handler.
   */
  trigger(action: string, param: unknown) {
    this.onTrigger?.(action, param)
  }

  /** @todo Clean up - never implemented. Fires `onTrigger` on nodes matched by title. */
  triggerInput(name: string, value: any): void {
    const nodes = this.findNodesByTitle(name)
    for (const node of nodes) {
      // @ts-expect-error
      node.onTrigger(value)
    }
  }

  /** @todo Clean up - never implemented. Sets trigger callback on nodes matched by title. */
  setCallback(name: string, func: any): void {
    const nodes = this.findNodesByTitle(name)
    for (const node of nodes) {
      // @ts-expect-error
      node.setTrigger(func)
    }
  }

  /**
   * Undo/redo hook invoked before structural changes.
   * @see {@link onBeforeChange}
   */
  beforeChange(info?: LGraphNode): void {
    this.onBeforeChange?.(this, info)
    this.canvasAction(c => c.onBeforeChange?.(this))
  }

  /**
   * Undo/redo hook invoked after structural changes.
   * @see {@link onAfterChange}
   */
  afterChange(info?: LGraphNode | null): void {
    this.onAfterChange?.(this, info)
    this.canvasAction(c => c.onAfterChange?.(this))
  }

  /**
   * clears the triggered slot animation in all links (stop visual animation)
   */
  clearTriggeredSlots(): void {
    for (const link_info of this._links.values()) {
      if (!link_info) continue

      if (link_info._last_time) link_info._last_time = 0
    }
  }

  /* Called when something visually changed (not the graph structure). */
  /**
   * Notifies canvases and {@link on_change} that a visual refresh is needed.
   */
  change(): void {
    if (LiteGraph.debug) {
      console.log("Graph changed")
    }
    this.canvasAction(c => c.setDirty(true, true))
    this.on_change?.(this)
  }

  /**
   * Marks attached canvases dirty for redraw.
   * @param fg When `true`, the foreground (nodes) layer needs redraw.
   * @param bg When `true`, the background (links/grid) layer needs redraw.
   */
  setDirtyCanvas(fg: boolean, bg?: boolean): void {
    this.canvasAction(c => c.setDirty(fg, bg))
  }

  /**
   * Registers a partially connected link in {@link floatingLinks}.
   *
   * Assigns an ID if {@link LLink.id} is `-1` and associates the link with its slot and reroutes.
   * @param link The floating link to track.
   * @returns The same link, with ID assigned if needed.
   */
  addFloatingLink(link: LLink): LLink {
    if (link.id === -1) {
      link.id = ++this.#lastFloatingLinkId
    }
    this.#floatingLinks.set(link.id, link)

    const slot = link.target_id !== -1
      ? this.getNodeById(link.target_id)?.inputs?.[link.target_slot]
      : this.getNodeById(link.origin_id)?.outputs?.[link.origin_slot]
    if (slot) {
      slot._floatingLinks ??= new Set()
      slot._floatingLinks.add(link)
    } else {
      console.warn(`Adding invalid floating link: target/slot: [${link.target_id}/${link.target_slot}] origin/slot: [${link.origin_id}/${link.origin_slot}]`)
    }

    const reroutes = LLink.getReroutes(this, link)
    for (const reroute of reroutes) {
      reroute.floatingLinkIds.add(link.id)
    }
    return link
  }

  /**
   * Removes a link from {@link floatingLinks} and cleans up slot/reroute references.
   * @param link The floating link to remove.
   */
  removeFloatingLink(link: LLink): void {
    this.#floatingLinks.delete(link.id)

    const slot = link.target_id !== -1
      ? this.getNodeById(link.target_id)?.inputs?.[link.target_slot]
      : this.getNodeById(link.origin_id)?.outputs?.[link.origin_slot]
    if (slot) {
      slot._floatingLinks?.delete(link)
    }

    const reroutes = LLink.getReroutes(this, link)
    for (const reroute of reroutes) {
      reroute.floatingLinkIds.delete(link.id)
      if (reroute.floatingLinkIds.size === 0) {
        delete reroute.floating
      }

      if (reroute.totalLinks === 0) this.removeReroute(reroute.id)
    }
  }

  /**
   * Finds the link with the provided ID.
   * @param id ID of link to find
   * @returns The link with the provided {@link id}, otherwise `undefined`. Always returns `undefined` if `id` is nullish.
   */
  getLink(id: null | undefined): undefined
  getLink(id: LinkId | null | undefined): LLink | undefined
  getLink(id: LinkId | null | undefined): LLink | undefined {
    return id == null ? undefined : this._links.get(id)
  }

  /**
   * Finds the reroute with the provided ID.
   * @param id ID of reroute to find
   * @returns The reroute with the provided {@link id}, otherwise `undefined`. Always returns `undefined` if `id` is nullish.
   */
  getReroute(id: null | undefined): undefined
  getReroute(id: RerouteId | null | undefined): Reroute | undefined
  getReroute(id: RerouteId | null | undefined): Reroute | undefined {
    return id == null ? undefined : this.reroutes.get(id)
  }

  /**
   * Configures a reroute on the graph where ID is already known (probably deserialisation).
   * Creates the object if it does not exist.
   * @param serialisedReroute See {@link SerialisableReroute}
   */
  setReroute({ id, parentId, pos, linkIds, floating }: OptionalProps<SerialisableReroute, "id">): Reroute {
    id ??= ++this.state.lastRerouteId
    if (id > this.state.lastRerouteId) this.state.lastRerouteId = id

    const reroute = this.reroutes.get(id) ?? new Reroute(id, this)
    reroute.update(parentId, pos, linkIds, floating)
    this.reroutes.set(id, reroute)
    return reroute
  }

  /**
   * Creates a new reroute and adds it to the graph.
   * @param pos Position in graph space
   * @param before The existing link segment (reroute, link) that will be after this reroute,
   * going from the node output to input.
   * @returns The newly created reroute - typically ignored.
   */
  createReroute(pos: Point, before: LinkSegment): Reroute {
    const rerouteId = ++this.state.lastRerouteId
    const linkIds = before instanceof Reroute
      ? before.linkIds
      : [before.id]
    const floatingLinkIds = before instanceof Reroute
      ? before.floatingLinkIds
      : [before.id]
    const reroute = new Reroute(rerouteId, this, pos, before.parentId, linkIds, floatingLinkIds)
    this.reroutes.set(rerouteId, reroute)
    for (const linkId of linkIds) {
      const link = this._links.get(linkId)
      if (!link) continue
      if (link.parentId === before.parentId) link.parentId = rerouteId

      const reroutes = LLink.getReroutes(this, link)
      for (const x of reroutes) {
        if (x.parentId === before.parentId) {
          x.parentId = rerouteId
        }
      }
    }

    for (const linkId of floatingLinkIds) {
      const link = this.floatingLinks.get(linkId)
      if (!link) continue
      if (link.parentId === before.parentId) link.parentId = rerouteId

      const reroutes = LLink.getReroutes(this, link)
      for (const x of reroutes) {
        if (x.parentId === before.parentId) {
          x.parentId = rerouteId
        }
      }
    }

    return reroute
  }

  /**
   * Removes a reroute from the graph
   * @param id ID of reroute to remove
   */
  removeReroute(id: RerouteId): void {
    const { reroutes } = this
    const reroute = reroutes.get(id)
    if (!reroute) return

    this.canvasAction(c => c.deselect(reroute))

    // Extract reroute from the reroute chain
    const { parentId, linkIds, floatingLinkIds } = reroute
    for (const reroute of reroutes.values()) {
      if (reroute.parentId === id) reroute.parentId = parentId
    }

    for (const linkId of linkIds) {
      const link = this._links.get(linkId)
      if (link && link.parentId === id) link.parentId = parentId
    }

    for (const linkId of floatingLinkIds) {
      const link = this.floatingLinks.get(linkId)
      if (!link) {
        console.warn(`Removed reroute had floating link ID that did not exist [${linkId}]`)
        continue
      }

      // A floating link is a unique branch; if there is no parent reroute, or
      // the parent reroute has any other links, remove this floating link.
      const floatingReroutes = LLink.getReroutes(this, link)
      const lastReroute = floatingReroutes.at(-1)
      const secondLastReroute = floatingReroutes.at(-2)

      if (reroute !== lastReroute) {
        continue
      }
      if (secondLastReroute?.totalLinks !== 1) {
        this.removeFloatingLink(link)
      } else if (link.parentId === id) {
        link.parentId = parentId
        secondLastReroute.floating = reroute.floating
      }
    }

    reroutes.delete(id)
    // This does not belong here; it should be handled by the caller, or run by a remove-many API.
    // https://github.com/Comfy-Org/litegraph.js/issues/898
    this.setDirtyCanvas(false, true)
  }

  /**
   * Destroys a link
   */
  removeLink(link_id: LinkId): void {
    const link = this._links.get(link_id)
    if (!link) return

    const node = this.getNodeById(link.target_id)
    node?.disconnectInput(link.target_slot, false)

    link.disconnect(this)
  }

  /**
   * Removes duplicate links that share the same connection tuple
   * (origin_id, origin_slot, target_id, target_slot). Keeps the link
   * referenced by input.link and removes orphaned duplicates from
   * output.links and the graph's _links map.
   */
  _removeDuplicateLinks(): void {
    // Group all link IDs by their connection tuple.
    const groups = new Map<string, LinkId[]>()
    for (const [id, link] of this._links) {
      const key = LGraph._linkTupleKey(link)
      let group = groups.get(key)
      if (!group) {
        group = []
        groups.set(key, group)
      }
      group.push(id)
    }

    for (const [, ids] of groups) {
      if (ids.length <= 1) continue

      const sampleLink = this._links.get(ids[0])!
      const node = this.getNodeById(sampleLink.target_id)

      // Find which link ID is actually referenced by any input on the target
      // node. Cannot rely on target_slot index because widget-to-input
      // conversions during configure() can shift slot indices.
      let keepId: LinkId | undefined
      if (node) {
        for (const input of node.inputs ?? []) {
          const match = ids.find(id => input.link === id)
          if (match != null) {
            keepId = match
            break
          }
        }
      }
      keepId ??= ids[0]

      for (const id of ids) {
        if (id === keepId) continue

        const link = this._links.get(id)
        if (!link) continue

        // Remove from origin node's output.links array
        const originNode = this.getNodeById(link.origin_id)
        if (originNode) {
          const output = originNode.outputs?.[link.origin_slot]
          if (output?.links) {
            const idx = output.links.indexOf(id)
            if (idx !== -1) output.links.splice(idx, 1)
          }
        }

        this._links.delete(id)
      }

      // Ensure input.link points to the surviving link
      if (node) {
        for (const input of node.inputs ?? []) {
          if (ids.includes(input.link as LinkId) && input.link !== keepId) {
            input.link = keepId
          }
        }
      }
    }
  }

  /**
   * Creates a new subgraph definition, and adds it to the graph.
   * @param data Exported data (typically serialised) to configure the new subgraph with
   * @returns The newly created subgraph definition.
   */
  createSubgraph(data: ExportedSubgraph): Subgraph {
    const { id } = data

    const subgraph = new Subgraph(this.rootGraph, data)
    this.subgraphs.set(id, subgraph)

    // FE: Create node defs
    this.rootGraph.events.dispatch("subgraph-created", { subgraph, data })
    return subgraph
  }

  /**
   * Wraps the selected canvas items in a new {@link Subgraph} definition and {@link SubgraphNode}.
   *
   * Computes boundary links, clones internal nodes, creates IO slots, and rewires the parent graph.
   * @param items Nodes, reroutes, and groups to convert.
   * @returns The new subgraph definition and its instance node on the parent graph.
   * @throws If `items` is empty or bounding-box creation fails.
   */
  convertToSubgraph(items: Set<Positionable>): { subgraph: Subgraph, node: SubgraphNode } {
    if (items.size === 0) throw new Error("Cannot convert to subgraph: nothing to convert")

    this.beforeChange()
    this.canvasAction(c => c.emitBeforeChange())

    try {
      const { state, revision, config } = this

      const { boundaryLinks, boundaryFloatingLinks, internalLinks, boundaryInputLinks, boundaryOutputLinks } = getBoundaryLinks(this, items)
      const { nodes, reroutes, groups } = splitPositionables(items)

      const boundingRect = createBounds(items)
      if (!boundingRect) throw new Error("Failed to create bounding rect for subgraph")

      const hostWidgetValues = !this.isRootGraph
        ? this.#snapshotHostSubgraphWidgetValues()
        : undefined

      const resolvedInputLinks = boundaryInputLinks.map(x => x.resolve(this))
      const resolvedOutputLinks = boundaryOutputLinks.map(x => x.resolve(this))

      const widgetBackup = new Map<NodeId, readonly IBaseWidget[]>()
      for (const node of nodes) {
        if (node.widgets?.length) widgetBackup.set(node.id, node.widgets)
      }

      const clonedNodes = multiClone(nodes)

      // Inputs, outputs, and links
      const links = internalLinks.map(x => x.asSerialisable())

      const internalReroutes = new Map([...reroutes].map(r => [r.id, r]))
      const externalReroutes = new Map(
        [...this.reroutes].filter(([id]) => !internalReroutes.has(id)),
      )
      const inputs = mapSubgraphInputsAndLinks(resolvedInputLinks, links, internalReroutes)
      const outputs = mapSubgraphOutputsAndLinks(resolvedOutputLinks, links, externalReroutes)

      // Prepare subgraph data
      const data = {
        id: createUuidv4(),
        name: "New Subgraph",
        inputNode: {
          id: SUBGRAPH_INPUT_ID,
          bounding: [0, 0, 75, 100],
        },
        outputNode: {
          id: SUBGRAPH_OUTPUT_ID,
          bounding: [0, 0, 75, 100],
        },
        inputs,
        outputs,
        widgets: [],
        version: LGraph.serialisedSchemaVersion,
        state,
        revision,
        config,
        links,
        nodes: clonedNodes,
        reroutes: structuredClone([...reroutes].map(reroute => reroute.asSerialisable())),
        groups: structuredClone([...groups].map(group => group.serialize())),
      } satisfies ExportedSubgraph

      const subgraph = this.createSubgraph(data)
      subgraph.configure(data)
      for (const node of subgraph.nodes) node.onGraphConfigured?.()
      for (const node of subgraph.nodes) node.onAfterGraphConfigured?.()

      for (const subgraphNode of subgraph.nodes) {
        const sourceWidgets = widgetBackup.get(subgraphNode.id)
        if (!sourceWidgets) continue

        subgraphNode.widgets = sourceWidgets.map((widget) => {
          const copy = toConcreteWidget(widget, subgraphNode).createCopyForNode(subgraphNode)
          copy.value = widget.value
          return copy
        })

        for (const input of subgraphNode.inputs) {
          if (!isWidgetInputSlot(input)) continue
          const widget = subgraphNode.widgets.find(w => w.name === input.widget.name)
          if (widget) input.widget = { name: widget.name }
        }
      }

      // Position the subgraph input nodes
      subgraph.inputNode.arrange()
      subgraph.outputNode.arrange()
      const { boundingRect: inputRect } = subgraph.inputNode
      const { boundingRect: outputRect } = subgraph.outputNode
      alignOutsideContainer(inputRect, Alignment.MidLeft, boundingRect, [50, 0])
      alignOutsideContainer(outputRect, Alignment.MidRight, boundingRect, [50, 0])

      // Remove items converted to subgraph
      for (const resolved of resolvedInputLinks) resolved.inputNode?.disconnectInput(resolved.inputNode.inputs.indexOf(resolved.input!), true)
      for (const resolved of resolvedOutputLinks) resolved.outputNode?.disconnectOutput(resolved.outputNode.outputs.indexOf(resolved.output!), resolved.inputNode)

      for (const node of nodes) this.remove(node)
      for (const reroute of reroutes) this.removeReroute(reroute.id)
      for (const group of groups) this.remove(group)

      this.rootGraph.events.dispatch("convert-to-subgraph", {
        subgraph,
        bounds: boundingRect,
        exportedSubgraph: data,
        boundaryLinks,
        resolvedInputLinks,
        resolvedOutputLinks,
        boundaryFloatingLinks,
        internalLinks,
      })

      // Create subgraph node object
      const subgraphNode = LiteGraph.createNode(subgraph.id, subgraph.name, {
        outputs: structuredClone(outputs),
      })
      if (!subgraphNode) throw new Error("Failed to create subgraph node")

      subgraphNode._setConcreteSlots()
      subgraphNode.arrange()

      // Resize to inputs/outputs
      subgraphNode.setSize(subgraphNode.computeSize())

      // Center the subgraph node
      alignToContainer(subgraphNode._posSize, Alignment.Centre | Alignment.Middle, boundingRect)

      // Add the subgraph node to the graph
      this.add(subgraphNode)

      // Group matching input links
      const groupedByOutput = groupResolvedByOutput(resolvedInputLinks)

      // Reconnect input links in parent graph
      let i = 0
      for (const [, connections] of groupedByOutput) {
        const [firstResolved, ...others] = connections
        const { output, outputNode, link, subgraphInput } = firstResolved

        // Special handling: Subgraph input node
        i++
        if (link.origin_id === SUBGRAPH_INPUT_ID) {
          link.target_id = subgraphNode.id
          link.target_slot = i - 1
          if (subgraphInput instanceof SubgraphInput) {
            subgraphInput.connect(subgraphNode.findInputSlotByType(link.type, true, true), subgraphNode, link.parentId)
          } else {
            throw new TypeError("Subgraph input node is not a SubgraphInput")
          }
          console.debug("Reconnect input links in parent graph", { ...link }, this.links.get(link.id), this.links.get(link.id) === link)

          for (const resolved of others) {
            resolved.link.disconnect(this)
          }
          continue
        }

        if (!output || !outputNode) {
          console.warn("Convert to Subgraph reconnect: Failed to resolve input link", connections[0])
          continue
        }

        const input = subgraphNode.findInputSlotByType(link.type, true, true)
        outputNode.connectSlots(
          output,
          subgraphNode,
          input,
          link.parentId,
        )
      }

      // Group matching links
      const outputsGroupedByOutput = groupResolvedByOutput(resolvedOutputLinks)

      // Reconnect output links in parent graph
      i = 0
      for (const [, connections] of outputsGroupedByOutput) {
      // Special handling: Subgraph output node
        i++
        for (const connection of connections) {
          const { input, inputNode, link, subgraphOutput } = connection
          if (link.target_id === SUBGRAPH_OUTPUT_ID) {
            link.origin_id = subgraphNode.id
            link.origin_slot = i - 1
            this.links.set(link.id, link)
            if (subgraphOutput instanceof SubgraphOutput) {
              subgraphOutput.connect(subgraphNode.findOutputSlotByType(link.type, true, true), subgraphNode, link.parentId)
            } else {
              throw new TypeError("Subgraph input node is not a SubgraphInput")
            }
            continue
          }

          if (!input || !inputNode) {
            console.warn("Convert to Subgraph reconnect: Failed to resolve output link", connection)
            continue
          }

          const output = subgraphNode.outputs[i - 1]
          subgraphNode.connectSlots(
            output,
            inputNode,
            input,
            link.parentId,
          )
        }
      }

      // When nodes are packed into a nested subgraph, host SubgraphNode instances
      // may hold stale promoted widget bindings that must be re-resolved.
      if (!this.isRootGraph) {
        if (subgraphNode.isSubgraphNode()) subgraphNode.rebuildInputWidgetBindings()
        this.#refreshHostSubgraphWidgetBindings(hostWidgetValues)
      }

      return { subgraph, node: subgraphNode as SubgraphNode }
    } finally {
      this.afterChange()
      this.canvasAction(c => c.emitAfterChange())
    }
  }

  /**
   * Expands a {@link SubgraphNode} back into its interior nodes on the parent graph.
   * Inverse of {@link convertToSubgraph}: rewires boundary links and migrates reroutes.
   */
  unpackSubgraph(
    subgraphNode: SubgraphNode,
    options?: { skipMissingNodes?: boolean },
  ): void {
    if (!(subgraphNode instanceof SubgraphNode))
      throw new Error("Can only unpack Subgraph Nodes")

    this.beforeChange()

    try {
      this.#unpackSubgraphImpl(subgraphNode, options)
    } finally {
      this.afterChange()
    }
  }

  /**
   * Resolve a path of subgraph node IDs into a list of subgraph nodes.
   * Not intended to be run from subgraphs.
   * @param nodeIds An ordered list of node IDs, from the root graph to the most nested subgraph node
   * @returns An ordered list of nested subgraph nodes.
   */
  resolveSubgraphIdPath(nodeIds: readonly NodeId[]): SubgraphNode[] {
    const result: SubgraphNode[] = []
    let currentGraph: GraphOrSubgraph = this.rootGraph

    for (const nodeId of nodeIds) {
      const node: LGraphNode | null = currentGraph.getNodeById(nodeId)
      if (!node) throw new Error(`Node [${nodeId}] not found.  ID Path: ${nodeIds.join(":")}`)
      if (!node.isSubgraphNode()) throw new Error(`Node [${nodeId}] is not a SubgraphNode.  ID Path: ${nodeIds.join(":")}`)

      result.push(node)
      currentGraph = node.subgraph
    }

    return result
  }

  /**
   * Creates a Object containing all the info about this graph, it can be serialized
   * @deprecated Use {@link asSerialisable}, which returns the newer schema version.
   * @returns value of the node
   */
  serialize(option?: { sortNodes: boolean }): ISerialisedGraph {
    const { config, state, groups, nodes, reroutes, extra, floatingLinks, definitions } = this.asSerialisable(option)
    const linkArray = [...this._links.values()]
    const links = linkArray.map(x => x.serialize())

    if (reroutes?.length) {
      // Link parent IDs cannot go in 0.4 schema arrays
      extra.linkExtensions = linkArray
        .filter(x => x.parentId !== undefined)
        .map(x => ({ id: x.id, parentId: x.parentId }))
    }

    extra.reroutes = reroutes?.length ? reroutes : undefined
    return {
      id: this.id,
      revision: this.revision,
      last_node_id: state.lastNodeId,
      last_link_id: state.lastLinkId,
      nodes,
      links,
      floatingLinks,
      groups,
      definitions,
      config,
      extra,
      version: LiteGraph.VERSION,
    }
  }

  /**
   * Prepares a shallow copy of this object for immediate serialisation or structuredCloning.
   * The return value should be discarded immediately.
   * @param options Serialise options = currently `sortNodes: boolean`, whether to sort nodes by ID.
   * @returns A shallow copy of parts of this graph, with shallow copies of its serialisable objects.
   * Mutating the properties of the return object may result in changes to your graph.
   * It is intended for use with {@link structuredClone} or {@link JSON.stringify}.
   */
  asSerialisable(options?: { sortNodes: boolean }): SerialisableGraph & Required<Pick<SerialisableGraph, "nodes" | "groups" | "extra">> {
    const { id, revision, config, state } = this

    const nodeList = !LiteGraph.use_uuids && options?.sortNodes
      // @ts-expect-error If LiteGraph.use_uuids is false, ids are numbers.
      ? [...this._nodes].sort((a, b) => a.id - b.id)
      : this._nodes

    const nodes = nodeList.map(node => node.serialize())
    const groups = this._groups.map(x => x.serialize())

    const links = this._links.size ? [...this._links.values()].map(x => x.asSerialisable()) : undefined
    const floatingLinks = this.floatingLinks.size ? [...this.floatingLinks.values()].map(x => x.asSerialisable()) : undefined
    const reroutes = this.reroutes.size ? [...this.reroutes.values()].map(x => x.asSerialisable()) : undefined

    // Save scale and offset
    const extra = { ...this.extra }
    if (LiteGraph.saveViewportWithGraph) extra.ds = this.#getDragAndScale()
    if (!extra.ds) delete extra.ds

    const data: ReturnType<typeof this.asSerialisable> = {
      id,
      revision,
      version: LGraph.serialisedSchemaVersion,
      config,
      state,
      groups,
      nodes,
      links,
      floatingLinks,
      reroutes,
      extra,
    }

    if (this.isRootGraph && this._subgraphs.size) {
      const usedSubgraphIds = findUsedSubgraphIds(this, this._subgraphs)
      const usedSubgraphs = [...this._subgraphs.values()]
        .filter(subgraph => usedSubgraphIds.has(subgraph.id))
        .map(x => x.asSerialisable())

      if (usedSubgraphs.length > 0) {
        data.definitions = { subgraphs: usedSubgraphs }
      }
    }

    this.onSerialize?.(data)
    return data
  }

  protected _configureBase(data: ISerialisedGraph | SerialisableGraph): void {
    const { id, extra } = data

    // Create a new graph ID if none is provided or the zero UUID is used on the root graph
    if (id && !(this.isRootGraph && id === zeroUuid)) {
      this.id = id
    } else if (this.id === zeroUuid) {
      this.id = createUuidv4()
    }

    // Extra
    this.extra = extra ? structuredClone(extra) : {}

    // Ensure auto-generated serialisation data is removed from extra
    delete this.extra.linkExtensions
  }

  /**
   * Configure a graph from a JSON string
   * @param data The deserialised object to configure this graph from
   * @param keep_old If `true`, the graph will not be cleared prior to
   * adding the configuration.
   */
  configure(
    data: ISerialisedGraph | SerialisableGraph,
    keep_old?: boolean,
  ): boolean | undefined {
    const options: LGraphEventMap["configuring"] = {
      data,
      clearGraph: !keep_old,
    }
    const mayContinue = this.events.dispatch("configuring", options)
    if (!mayContinue) return

    try {
      // TODO: Finish typing configure()
      if (!data) return
      if (options.clearGraph) this.clear()

      this._configureBase(data)

      let reroutes: SerialisableReroute[] | undefined

      // TODO: Determine whether this should this fall back to 0.4.
      if (data.version === 0.4) {
        const { extra } = data
        // Deprecated - old schema version, links are arrays
        if (Array.isArray(data.links)) {
          for (const linkData of data.links) {
            const link = LLink.createFromArray(linkData)
            this._links.set(link.id, link)
          }
        }
        // #region `extra` embeds for v0.4

        // LLink parentIds
        if (Array.isArray(extra?.linkExtensions)) {
          for (const linkEx of extra.linkExtensions) {
            const link = this._links.get(linkEx.id)
            if (link) link.parentId = linkEx.parentId
          }
        }

        // Reroutes
        reroutes = extra?.reroutes

        // #endregion `extra` embeds for v0.4
      } else {
        // New schema - one version so far, no check required.

        // State
        if (data.state) {
          const { lastGroupId, lastLinkId, lastNodeId, lastRerouteId } = data.state
          const { state } = this
          if (lastGroupId != null) state.lastGroupId = lastGroupId
          if (lastLinkId != null) state.lastLinkId = lastLinkId
          if (lastNodeId != null) state.lastNodeId = lastNodeId
          if (lastRerouteId != null) state.lastRerouteId = lastRerouteId
        }

        // Links
        if (Array.isArray(data.links)) {
          for (const linkData of data.links) {
            const link = LLink.create(linkData)
            this._links.set(link.id, link)
          }
        }

        reroutes = data.reroutes
      }

      // Reroutes
      if (Array.isArray(reroutes)) {
        for (const rerouteData of reroutes) {
          this.setReroute(rerouteData)
        }
      }

      const nodesData = data.nodes

      // copy all stored fields
      for (const i in data) {
        if (LGraph.ConfigureProperties.has(i)) continue

        // @ts-expect-error #574 Legacy property assignment
        this[i] = data[i]
      }

      // Subgraph definitions — deduplicate node IDs before configuring.
      const subgraphs = data.definitions?.subgraphs
      let effectiveNodesData = nodesData
      if (subgraphs) {
        const reservedNodeIds = new Set<number>()
        for (const node of this._nodes) {
          if (typeof node.id === "number") reservedNodeIds.add(node.id)
        }
        for (const sg of this.subgraphs.values()) {
          for (const node of sg.nodes) {
            if (typeof node.id === "number") reservedNodeIds.add(node.id)
          }
        }
        for (const n of nodesData ?? []) {
          if (typeof n.id === "number") reservedNodeIds.add(n.id)
        }

        const deduplicated = this.isRootGraph
          ? deduplicateSubgraphNodeIds(subgraphs, reservedNodeIds, this.state, nodesData)
          : undefined

        const finalSubgraphs = deduplicated?.subgraphs ?? subgraphs
        effectiveNodesData = deduplicated?.rootNodes ?? nodesData

        for (const subgraph of finalSubgraphs) this.createSubgraph(subgraph)

        const configureOrder = topologicalSortSubgraphs(finalSubgraphs)
        for (const subgraph of configureOrder) {
          this.subgraphs.get(subgraph.id)?.configure(subgraph)
        }
      }

      let error = false
      const nodeDataMap = new Map<NodeId, ISerialisedNode>()

      // create nodes
      this._nodes = []
      if (effectiveNodesData) {
        for (const n_info of effectiveNodesData) {
          // stored info
          let node = LiteGraph.createNode(String(n_info.type), n_info.title)
          if (!node) {
            if (LiteGraph.debug) console.log("Node not found or has errors:", n_info.type)

            // in case of error we create a replacement node to avoid losing info
            node = new LGraphNode("")
            node.last_serialization = n_info
            node.has_errors = true
            error = true
            // continue;
          }

          // id it or it will create a new id
          node.id = n_info.id
          // add before configure, otherwise configure cannot create links
          this.add(node, true)
          nodeDataMap.set(node.id, n_info)
        }

        // configure nodes afterwards so they can reach each other
        for (const [id, nodeData] of nodeDataMap) {
          const node = this.getNodeById(id)
          node?.configure(nodeData)

          if (LiteGraph.alwaysSnapToGrid && node) {
            const snapTo = this.getSnapToGridSize()
            if (node.snapToGrid(snapTo)) node.pos = [node.pos[0], node.pos[1]]
            snapPoint(node.size, snapTo, "ceil")
          }
        }
      }

      // Floating links
      if (Array.isArray(data.floatingLinks)) {
        for (const linkData of data.floatingLinks) {
          const floatingLink = LLink.create(linkData)
          this.addFloatingLink(floatingLink)

          if (floatingLink.id > this.#lastFloatingLinkId) this.#lastFloatingLinkId = floatingLink.id
        }
      }

      // Drop broken reroutes
      for (const reroute of this.reroutes.values()) {
        // Drop broken links, and ignore reroutes with no valid links
        if (!reroute.validateLinks(this._links, this.floatingLinks)) {
          this.reroutes.delete(reroute.id)
        }
      }

      // Remove duplicate links: links in output.links that share the same
      // (origin_id, origin_slot, target_id, target_slot) tuple.
      // This repairs corrupted data where extra link objects were created
      // without proper cleanup of the previous connection.
      this._removeDuplicateLinks()

      // groups
      this._groups.length = 0
      const groupData = data.groups
      if (groupData) {
        for (const data of groupData) {
          // TODO: Search/remove these global object refs
          const group = new LiteGraph.LGraphGroup()
          group.configure(data)
          this.add(group)
        }
      }

      this.updateExecutionOrder()

      this.onConfigure?.(data)
      this.incrementVersion()

      // Ensure the primary canvas is set to the correct graph
      const { primaryCanvas } = this
      const subgraphId = primaryCanvas?.subgraph?.id
      if (subgraphId) {
        const subgraph = this.subgraphs.get(subgraphId)
        if (subgraph) {
          primaryCanvas.setGraph(subgraph)
        } else {
          primaryCanvas.setGraph(this)
        }
      }

      this.setDirtyCanvas(true, true)
      return error
    } finally {
      this.events.dispatch("configured")
    }
  }

  /** The main canvas used for viewport persistence and subgraph navigation. Stored on {@link rootGraph}. */
  get primaryCanvas(): LGraphCanvas | undefined {
    return this.rootGraph.#canvas
  }

  set primaryCanvas(canvas: LGraphCanvas) {
    this.rootGraph.#canvas = canvas
  }

  /**
   * Loads graph JSON from a URL, {@link File}, or {@link Blob}.
   * @param URL URL string, or a file/blob to read as JSON.
   * @param callback Called after {@link configure} completes successfully.
   */
  load(URL: string | Blob | URL | File, callback: () => void) {
    const that = this

    // from file
    if (URL instanceof Blob || URL instanceof File) {
      const reader = new FileReader()
      reader.addEventListener("load", function (event) {
        const result = stringOrEmpty(event.target?.result)
        const data = JSON.parse(result)
        that.configure(data)
        callback?.()
      })

      reader.readAsText(URL)
      return
    }

    // is a string, then an URL
    const req = new XMLHttpRequest()
    req.open("GET", URL, true)
    req.send(null)
    req.addEventListener("load", function () {
      if (req.status !== 200) {
        console.error("Error loading graph:", req.status, req.response)
        return
      }
      const data = JSON.parse(req.response)
      that.configure(data)
      callback?.()
    })
    req.addEventListener("error", (err) => {
      console.error("Error loading graph:", err)
    })
  }
}
