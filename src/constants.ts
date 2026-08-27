/**
 * Core constants used by LiteGraph, primarily for subgraph boundary nodes.
 *
 * This entire module is re-exported as `Constants` from the package barrel.
 * @see `SubgraphInputNode`
 * @see `SubgraphOutputNode`
 */

/** ID of the virtual input node of a subgraph. */
export const SUBGRAPH_INPUT_ID = -10

/** ID of the virtual output node of a subgraph. */
export const SUBGRAPH_OUTPUT_ID = -20

/** Sentinel node id for unassigned link endpoints. */
export const UNASSIGNED_NODE_ID = -1
