import type { ConnectingLink } from "@/interfaces"
import type { LGraph } from "@/LGraph"
import type { LGraphButton } from "@/LGraphButton"
import type { LGraphGroup } from "@/LGraphGroup"
import type { LGraphNode } from "@/LGraphNode"
import type { Subgraph } from "@/subgraph/Subgraph"
import type { CanvasPointerEvent } from "@/types/events"

/**
 * Strongly-typed event map for {@link LGraphCanvas} lifecycle and pointer interactions.
 *
 * Listen via {@link LGraphCanvas.addEventListener} or dispatch from canvas code when the active
 * graph changes or the user interacts with nodes, groups, or empty canvas areas.
 * @see {@link LGraphCanvas}
 */
export interface LGraphCanvasEventMap {
  /**
   * The active graph displayed by the canvas has changed.
   *
   * Dispatched when {@link LGraphCanvas.setGraph} assigns a new root or subgraph view.
   */
  "litegraph:set-graph": {
    /** The new active graph. */
    newGraph: LGraph | Subgraph
    /** The previous active graph, or `null`/`undefined` if none was set. */
    oldGraph: LGraph | Subgraph | null | undefined
  }

  /**
   * Canvas-level pointer and edit lifecycle events.
   *
   * The `subType` field discriminates the specific interaction. Listeners typically switch on
   * `subType` to handle double-clicks, empty-canvas releases, or pre/post change hooks.
   */
  "litegraph:canvas":
    | { subType: "before-change" | "after-change" }
    | {
      /** Pointer released on empty canvas, optionally carrying link-drop context. */
      subType: "empty-release"
      /** The original pointer event, when available. */
      originalEvent?: CanvasPointerEvent
      /** Links that were being dragged when the pointer was released. */
      linkReleaseContext?: { links: ConnectingLink[] }
    }
    | {
      /** The user double-clicked a {@link LGraphGroup}. */
      subType: "group-double-click"
      originalEvent?: CanvasPointerEvent
      /** The group that was double-clicked. */
      group: LGraphGroup
    }
    | {
      /** The user double-clicked empty canvas space. */
      subType: "empty-double-click"
      originalEvent?: CanvasPointerEvent
    }
    | {
      /** The user double-clicked a {@link LGraphNode}. */
      subType: "node-double-click"
      originalEvent?: CanvasPointerEvent
      /** The node that was double-clicked. */
      node: LGraphNode
    }

  /**
   * A title-bar button on a node was clicked.
   *
   * Dispatched from {@link LGraphNode} when a configured {@link LGraphButton} is activated.
   */
  "litegraph:node-title-button-clicked": {
    /** The node whose title button was clicked. */
    node: LGraphNode
    /** The button definition that was activated. */
    button: LGraphButton
  }
}
