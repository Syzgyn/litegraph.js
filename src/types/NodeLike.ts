import type { INodeInputSlot, INodeOutputSlot } from "@/interfaces"
import type { NodeId } from "@/LGraphNode"
import type { SubgraphIO } from "@/types/serialisation"

/**
 * Minimal interface shared by any object that can participate in link connection validation.
 *
 * Implemented by {@link LGraphNode}, subgraph boundary nodes, and other graph entities that
 * expose input/output slots. Used by drag-and-drop link operations to check type compatibility
 * without requiring a full node instance.
 */
export interface NodeLike {
  /** Unique identifier of this node within its graph. */
  id: NodeId

  /**
   * Determines whether a link from {@link fromSlot} on {@link node} may connect to {@link toSlot} on this node.
   * @param node The node at the origin (output) end of the proposed connection.
   * @param toSlot The input slot on this node that would receive the link.
   * @param fromSlot The output slot on {@link node} that would send the link.
   * @returns `true` if the connection is valid.
   */
  canConnectTo(
    node: NodeLike,
    toSlot: INodeInputSlot | SubgraphIO,
    fromSlot: INodeOutputSlot | SubgraphIO,
  ): boolean
}
