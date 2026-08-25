import type { LGraphNode } from "@/LGraphNode"
import type { GraphOrSubgraph } from "@/subgraph/Subgraph"

/** Depth-first visit of every node in a graph, including nested subgraph interiors. */
export function forEachNode(graph: GraphOrSubgraph, fn: (node: LGraphNode) => void): void {
  for (const node of graph.nodes) {
    fn(node)
    if (node.isSubgraphNode?.()) forEachNode(node.subgraph, fn)
  }
}
