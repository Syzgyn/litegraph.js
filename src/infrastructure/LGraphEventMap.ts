import type { ReadOnlyRect } from "@/interfaces"
import type { LGraph } from "@/LGraph"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink, ResolvedConnection } from "@/LLink"
import type { Subgraph } from "@/subgraph/Subgraph"
import type { ExportedSubgraph, ISerialisedGraph, SerialisableGraph } from "@/types/serialisation"

/**
 * Strongly-typed event map for {@link LGraph} configuration and subgraph lifecycle.
 *
 * Extended by {@link SubgraphEventMap} and {@link SubgraphInputEventMap} for subgraph-specific
 * events. Listen on {@link LGraph.events} via {@link CustomEventTarget.addEventListener}.
 * @see {@link LGraph}
 * @see {@link SubgraphEventMap}
 */
export interface LGraphEventMap {
  /**
   * Dispatched immediately before a graph is configured from serialised data.
   *
   * Returning `false` from a listener cancels the configure operation (see
   * {@link CustomEventTarget.dispatch} cancelable semantics).
   */
  "configuring": {
    /** The serialised graph payload about to be applied. */
    data: ISerialisedGraph | SerialisableGraph
    /** When `true`, existing nodes and links are cleared before applying `data`. */
    clearGraph: boolean
  }

  /** Dispatched after a graph has finished configuring from serialised data. */
  "configured": never

  /**
   * A new {@link Subgraph} definition was created and registered on the root graph.
   *
   * Dispatched from {@link LGraph} when a subgraph asset is added programmatically or via
   * deserialisation.
   */
  "subgraph-created": {
    /** The subgraph instance that was created. */
    subgraph: Subgraph
    /** The raw exported payload used to create the subgraph. */
    data: ExportedSubgraph
  }

  /**
   * A selection of canvas items was converted into a new subgraph.
   *
   * Dispatched after boundary analysis completes and the subgraph node is inserted into the
   * parent graph. Carries both the exported subgraph data and the resolved boundary links used
   * to reconnect external wiring.
   */
  "convert-to-subgraph": {
    /** The newly created subgraph. */
    subgraph: Subgraph
    /** Axis-aligned bounds enclosing every item moved into the subgraph. */
    bounds: ReadOnlyRect
    /** Serialised subgraph payload produced by the conversion. */
    exportedSubgraph: ExportedSubgraph
    /** Links crossing the subgraph boundary that were rewired through the subgraph node. */
    boundaryLinks: LLink[]
    /** External links resolved to subgraph-node inputs. */
    resolvedInputLinks: ResolvedConnection[]
    /** Internal links resolved to subgraph-node outputs. */
    resolvedOutputLinks: ResolvedConnection[]
    /** Floating links on the boundary that were incorporated into the conversion. */
    boundaryFloatingLinks: LLink[]
    /** Links that remain entirely inside the new subgraph. */
    internalLinks: LLink[]
  }

  /**
   * The user or host application opened a subgraph for editing.
   *
   * Dispatched when navigation switches the active editing context from a parent graph to a
   * nested {@link Subgraph} view.
   */
  "open-subgraph": {
    /** The subgraph being opened. */
    subgraph: Subgraph
    /** The graph that is being closed or backgrounded. */
    closingGraph: LGraph | Subgraph
  }

  /**
   * Fires on the owning graph before per-node teardown begins.
   */
  "node:before-removed": {
    node: LGraphNode
  }
}
