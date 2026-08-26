/**
 * Event type definitions for canvas pointer interactions.
 *
 * These interfaces extend native DOM events with graph-space coordinates and workarounds
 * for browser inconsistencies. They are attached by {@link LGraphCanvas.adjustMouseEvent}
 * before dispatching to node and canvas event handlers.
 */

import type { LGraphGroup } from "../LGraphGroup"
import type { LGraphNode } from "../LGraphNode"
import type { LinkReleaseContextExtended } from "../litegraph"

/**
 * Graph-space coordinates added to canvas pointer events.
 *
 * Used by {@link CanvasPointerEvent} and related types. Property names are part of the public API.
 */
export interface ICanvasPosition {
  /** X co-ordinate of the event, in graph space (NOT canvas space). */
  canvasX: number
  /** Y co-ordinate of the event, in graph space (NOT canvas space). */
  canvasY: number
}

/** Pointer movement deltas added to canvas pointer events. */
export interface IDeltaPosition {
  /** Horizontal pointer movement since the last event, in canvas pixels. */
  deltaX: number
  /** Vertical pointer movement since the last event, in canvas pixels. */
  deltaY: number
}

/**
 * Workaround properties for Firefox returning `0` on `offsetX`/`offsetY`.
 * @see https://github.com/Comfy-Org/litegraph.js/issues/403
 */
export interface IOffsetWorkaround {
  /**
   * Reliable equivalent of {@link MouseEvent.offsetX}.
   *
   * Required (as of 2024-12-31) to support Firefox, which always returns `0` for the native property.
   */
  safeOffsetX: number
  /**
   * Reliable equivalent of {@link MouseEvent.offsetY}.
   *
   * Required (as of 2024-12-31) to support Firefox, which always returns `0` for the native property.
   */
  safeOffsetY: number
}

/**
 * All properties added when converting a native pointer event to a canvas pointer event
 * via {@link LGraphCanvas.adjustMouseEvent}.
 */
export type CanvasPointerExtensions = ICanvasPosition & IDeltaPosition & IOffsetWorkaround

interface LegacyMouseEvent {
  /** @deprecated Part of DragAndScale mouse API - incomplete / not maintained */
  dragging?: boolean
  click_time?: number
}

/**
 * A {@link PointerEvent} enriched with graph-space coordinates and pointer deltas.
 *
 * The primary event type used by {@link LGraphCanvas} for all pointer interactions.
 */
export interface CanvasPointerEvent extends PointerEvent, CanvasMouseEvent {}

/**
 * A {@link MouseEvent} enriched with graph-space coordinates and pointer deltas.
 *
 * Used where legacy mouse event handling is still required.
 */
export interface CanvasMouseEvent extends
  MouseEvent,
  Readonly<CanvasPointerExtensions>,
  LegacyMouseEvent {}

/**
 * A {@link DragEvent} enriched with graph-space coordinates and pointer deltas.
 *
 * Used for drag-and-drop operations onto the canvas.
 */
export interface CanvasDragEvent extends
  DragEvent,
  CanvasPointerExtensions {}

/**
 * Discriminated union of all custom event detail payloads dispatched by the canvas.
 *
 * Each variant is identified by its `subType` field.
 */
export type CanvasEventDetail =
  | GenericEventDetail |
  GroupDoubleClickEventDetail |
  NodeDoubleClickEventDetail |
  EmptyDoubleClickEventDetail |
  EmptyReleaseEventDetail

/** Detail payload for generic before/after change notifications on the canvas. */
export interface GenericEventDetail {
  /** Whether the event fires before or after a canvas state change. */
  subType: "before-change" | "after-change"
}

/** Mixin providing access to the original canvas pointer event that triggered a custom event. */
export interface OriginalEvent {
  /** The canvas pointer event that originated this custom event. */
  originalEvent: CanvasPointerEvent
}

/**
 * Detail payload dispatched when the user releases the pointer over empty canvas
 * while finishing a link drag operation.
 */
export interface EmptyReleaseEventDetail extends OriginalEvent {
  subType: "empty-release"
  /** Context describing the link(s) released and their connection state. */
  linkReleaseContext: LinkReleaseContextExtended
}

/** Detail payload dispatched when the user double-clicks empty canvas space. */
export interface EmptyDoubleClickEventDetail extends OriginalEvent {
  subType: "empty-double-click"
}

/** Detail payload dispatched when the user double-clicks a group. */
export interface GroupDoubleClickEventDetail extends OriginalEvent {
  subType: "group-double-click"
  /** The group that was double-clicked. */
  group: LGraphGroup
}

/** Detail payload dispatched when the user double-clicks a node. */
export interface NodeDoubleClickEventDetail extends OriginalEvent {
  subType: "node-double-click"
  /** The node that was double-clicked. */
  node: LGraphNode
}
