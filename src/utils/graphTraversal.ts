import type { LGraphNode } from "@/LGraphNode"
import type { GraphOrSubgraph } from "@/subgraph/Subgraph"
import type { UUID } from "@/utils/uuid"

/** Depth-first visit of every node in a graph, including nested subgraph interiors. */
export function forEachNode(
  graph: GraphOrSubgraph,
  fn: (node: LGraphNode) => void,
  visitedSubgraphIds: Set<UUID> = new Set(),
): void {
  if (visitedSubgraphIds.has(graph.id)) return
  visitedSubgraphIds.add(graph.id)

  for (const node of graph.nodes) {
    fn(node)
    if (node.isSubgraphNode?.()) forEachNode(node.subgraph, fn, visitedSubgraphIds)
  }
}
