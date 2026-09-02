import type { FloatingRenderLink } from "@/canvas/FloatingRenderLink"
import type { MovingInputLink } from "@/canvas/MovingInputLink"
import type { MovingOutputLink } from "@/canvas/MovingOutputLink"
import type { RenderLink } from "@/canvas/RenderLink"
import type { ToInputFromIoNodeLink } from "@/canvas/ToInputFromIoNodeLink"
import type { ToInputRenderLink } from "@/canvas/ToInputRenderLink"
import type { LinkNetwork } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { Reroute } from "@/Reroute"
import type { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import type { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import type { CanvasPointerEvent } from "@/types/events"
import type { IWidget } from "@/types/widgets"

/**
 * Strongly-typed event map for `LinkConnector` drag-and-drop link operations.
 *
 * Emitted on `LinkConnector.events` as the user moves, connects, or cancels links on the
 * canvas. `RenderLink` implementations dispatch connection events after successful drops.
 * @see `LinkConnector`
 * @see `RenderLink`
 */
export interface LinkConnectorEventMap {
  /**
   * The link connector state was reset, ending the current drag session.
   * @remarks Detail is `true` when the reset was forced; `false` for a normal completion.
   */
  "reset": boolean

  /**
   * Dispatched immediately before dropped links are committed.
   *
   * Returning `false` from a listener cancels the drop (see `CustomEventTarget.dispatch`).
   */
  "before-drop-links": {
    /** Render-link proxies representing every link segment being dropped. */
    renderLinks: RenderLink[]
    /** The pointer event that triggered the drop. */
    event: CanvasPointerEvent
  }

  /** Dispatched after dropped links have been processed, whether or not connections changed. */
  "after-drop-links": {
    renderLinks: RenderLink[]
    event: CanvasPointerEvent
  }

  /** Dispatched before an input-side link move begins (existing link or floating origin). */
  "before-move-input": MovingInputLink | FloatingRenderLink

  /** Dispatched before an output-side link move begins (existing link or floating origin). */
  "before-move-output": MovingOutputLink | FloatingRenderLink

  /** Dispatched after an input-side link was successfully repositioned or reconnected. */
  "input-moved": MovingInputLink | FloatingRenderLink | ToInputFromIoNodeLink

  /** Dispatched after an output-side link was successfully repositioned or reconnected. */
  "output-moved": MovingOutputLink | FloatingRenderLink

  /**
   * A new `LLink` was created during the drag operation.
   *
   * Detail may be `null` or `undefined` when creation was attempted but no link resulted.
   */
  "link-created": LLink | null | undefined

  /** The user dropped links onto a `Reroute`. */
  "dropped-on-reroute": {
    reroute: Reroute
    event: CanvasPointerEvent
  }

  /** The user dropped links onto a `LGraphNode` (but not necessarily onto a slot). */
  "dropped-on-node": {
    node: LGraphNode
    event: CanvasPointerEvent
  }

  /** The user dropped links onto a subgraph boundary IO node. */
  "dropped-on-io-node": {
    node: SubgraphInputNode | SubgraphOutputNode
    event: CanvasPointerEvent
  }

  /** The user dropped links onto empty canvas space. */
  "dropped-on-canvas": CanvasPointerEvent

  /**
   * A reposition drag of existing links ended (drop, disconnect, or cancel).
   * Fired from `LinkConnector.reset` after connection changes complete.
   */
  "link-drag-ended": {
    network: LinkNetwork
  }

  /** The user dropped a link onto a node widget that accepts connections. */
  "dropped-on-widget": {
    /** The render link being connected. */
    link: ToInputRenderLink
    node: LGraphNode
    widget: IWidget
  }
}
