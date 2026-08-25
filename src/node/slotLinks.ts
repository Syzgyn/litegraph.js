import type { LGraph } from "@/LGraph"
import type { NodeId } from "@/LGraphNode"
import type { LLink } from "@/LLink"

/** The link targeting an input slot, resolved in the owning graph. */
export function inputLink(
  graph: LGraph,
  nodeId: NodeId,
  slot: number,
): LLink | undefined {
  const node = graph.getNodeById(nodeId)
  const linkId = node?.inputs[slot]?.link
  return linkId == null ? undefined : graph.getLink(linkId)
}

/**
 * Snapshot of the links leaving an output slot, resolved in the owning graph.
 * Safe to disconnect links while iterating the result.
 */
export function outputLinks(
  graph: LGraph,
  nodeId: NodeId,
  slot: number,
): LLink[] {
  const node = graph.getNodeById(nodeId)
  const linkIds = node?.outputs[slot]?.links
  if (!linkIds?.length) return []

  const links: LLink[] = []
  for (const id of linkIds) {
    const link = graph.getLink(id)
    if (link) links.push(link)
  }
  return links
}
