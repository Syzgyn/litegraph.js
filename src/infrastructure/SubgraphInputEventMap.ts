import type { LGraphEventMap } from "./LGraphEventMap"
import type { INodeInputSlot } from "@/litegraph"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { IBaseWidget } from "@/types/widgets"

/**
 * Strongly-typed event map for {@link SubgraphInput} connection lifecycle.
 *
 * Extends {@link LGraphEventMap} with events fired when external links are connected to or
 * disconnected from a subgraph input boundary slot.
 *
 * Listen on {@link SubgraphInput.events}.
 * @see {@link SubgraphInput}
 * @see {@link LGraphEventMap}
 */
export interface SubgraphInputEventMap extends LGraphEventMap {
  /**
   * An external link was connected to this subgraph input.
   *
   * Dispatched after the input slot and optional promoted widget are wired up.
   */
  "input-connected": {
    /** The input slot that received the connection. */
    input: INodeInputSlot
    /** Widget associated with the input, when the input is widget-backed. */
    widget?: IBaseWidget
  }

  /** An external link was disconnected from this subgraph input. */
  "input-disconnected": {
    input: SubgraphInput
  }
}
