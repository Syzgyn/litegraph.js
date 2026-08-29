/**
 * Public entry point for the litegraph.js library.
 *
 * Re-exports the graph editor API — core classes (`LGraph`, `LGraphCanvas`,
 * `LGraphNode`), canvas utilities, widgets, subgraph support, and shared types.
 * Import from this module (or the package root) rather than individual source files.
 *
 * The singleton `LiteGraph` global holds runtime configuration, registered node types,
 * and legacy helpers. `loadPolyfills` is invoked automatically on import.
 */

import type { ContextMenu } from "./ContextMenu"
import type { ConnectingLink, Point } from "./interfaces"
import type {
  IContextMenuOptions,
  INodeSlot,
  Size,
} from "./interfaces"
import type { LGraphNode } from "./LGraphNode"
import type { CanvasEventDetail } from "./types/events"
import type { RenderShape, TitleMode } from "./types/globalEnums"

// Must remain above LiteGraphGlobal (circular dependency due to abstract factory behaviour in `configure`)
export { Subgraph } from "./subgraph/Subgraph"

import { LiteGraphGlobal } from "./LiteGraphGlobal"
import { loadPolyfills } from "./polyfills"

/**
 * Singleton global configuration and node registry for the entire litegraph runtime.
 *
 * Holds default colours, layout constants, feature flags, and registered node types.
 * Attach graphs and canvases to this instance indirectly via imports from this module.
 */
export const LiteGraph = new LiteGraphGlobal()

// Load legacy polyfills
// eslint-disable-next-line unicorn/no-top-level-side-effects
loadPolyfills()

// Backwards compat

// Type definitions for litegraph.js 0.7.0
// Project: litegraph.js
// Definitions by: NateScarlet <https://github.com/NateScarlet>
/** @deprecated Use `Point` instead. */
export type Vector2 = Point

/**
 * Legacy four-number tuple used in litegraph.js 0.7.0 type definitions.
 * @deprecated Use `Rect` (`[x, y, width, height]`) instead.
 */
export type Vector4 = [number, number, number, number]

/**
 * Describes a single entry in a `ContextMenu` menu list.
 * @remarks Backwards-compatibility interface retained from litegraph.js 0.7.0.
 * Prefer `IContextMenuValue` for new code.
 */
export interface IContextMenuItem {
  /** Primary label text shown for the menu entry. */
  content: string
  /** Handler invoked when the item is selected. */
  callback?: ContextMenuEventListener
  /** Used as innerHTML for extra child element */
  title?: string
  /** When `true`, the item is rendered disabled and ignores clicks. */
  disabled?: boolean
  /** When `true`, indicates a submenu is available (legacy flag). */
  hasSubmenu?: boolean
  /** Nested submenu definition opened when this item is selected. */
  submenu?: {
    options: IContextMenuItem[]
  } & IContextMenuOptions
  /** Additional CSS class name applied to the entry element. */
  className?: string
}

/**
 * Callback invoked when a legacy `IContextMenuItem` entry is selected.
 * @param value The menu item that was clicked.
 * @param options The options object passed when the menu was created.
 * @param event The originating mouse event.
 * @param parentMenu The parent menu, if this item opened a submenu.
 * @param node The `LGraphNode` associated with the menu, when provided via options.
 * @returns Return `true` to prevent the menu from closing automatically.
 */
export type ContextMenuEventListener = (
  value: IContextMenuItem,
  options: IContextMenuOptions,
  event: MouseEvent,
  parentMenu: ContextMenu<unknown> | undefined,
  node: LGraphNode,
) => boolean | void

/**
 * Context passed when the user releases a dragged link onto empty canvas or a search target.
 * @remarks Backwards-compatibility interface for link-release menu handlers.
 */
export interface LinkReleaseContext {
  /** Node that would receive the link on release, when dropping onto an input. */
  nodeTo?: LGraphNode
  /** Node that originates the released link, when dragging from an output. */
  nodeFrom?: LGraphNode
  /** Slot on `nodeFrom` from which the link was dragged. */
  slotFrom: INodeSlot
  /** When set, filters candidate input slot types during release handling. */
  typeFilterIn?: string
  /** When set, filters candidate output slot types during release handling. */
  typeFilterOut?: string
}

/**
 * Extended link-release context that includes all links being dragged as a batch.
 * @see `LinkReleaseContext`
 */
export interface LinkReleaseContextExtended {
  /** The links currently being moved or created by the user. */
  links: ConnectingLink[]
}

/**
 * DOM custom event dispatched by `LGraphCanvas` for canvas-level interactions.
 *
 * The event `detail` payload is typed as `CanvasEventDetail`.
 */
export interface LiteGraphCanvasEvent extends CustomEvent<CanvasEventDetail> {}

/**
 * Constructor signature and static metadata for a registered `LGraphNode` subclass.
 *
 * Used by `LiteGraph.registerNodeType` and node search/create flows to describe
 * default appearance and behaviour before an instance is constructed.
 */
export interface LGraphNodeConstructor<T extends LGraphNode = LGraphNode> {
  new (title: string, type?: string): T

  /** Default title shown in the node palette and on new instances. */
  title: string
  /** Registered node type path (e.g. `"math/add"`). */
  type: string
  /** Default node size `[width, height]`. */
  size?: Size
  /** Minimum node body height in pixels. */
  minHeight?: number
  /** Y offset where the first slot row is drawn. */
  slotStartY?: number
  /** Legacy widget metadata map keyed by widget name. */
  widgetsInfo?: any
  /** Whether the node can be collapsed to a compact representation. */
  collapsable?: boolean
  /** Default node accent colour. */
  color?: string
  /** Default node background colour. */
  bgColor?: string
  /** Default node render shape. */
  shape?: RenderShape
  /** How the node title bar is rendered. */
  titleMode?: TitleMode
  /** Title bar background colour override. */
  titleColor?: string
  /** Title text colour override. */
  titleTextColor?: string
  /** When `true`, bypassing the node preserves all link connections. */
  keepAllLinksOnBypass: boolean
  /** Width of the resize handle hit area in pixels. */
  resizeHandleSize?: number
  /** Width of the resize edge hit area in pixels. */
  resizeEdgeSize?: number
}

// End backwards compat

export { GraphHistory, type GraphHistoryEntry } from "./canvas/GraphHistory"
export { InputIndicators } from "./canvas/InputIndicators"
export { LinkConnector } from "./canvas/LinkConnector"
export { isOverNodeInput, isOverNodeOutput } from "./canvas/measureSlots"
export { CanvasPointer } from "./CanvasPointer"
export * as Constants from "./constants"
export { ContextMenu } from "./ContextMenu"
export { CurveEditor } from "./CurveEditor"
export { DragAndScale } from "./DragAndScale"
export { LabelPosition, SlotDirection, SlotShape, SlotType } from "./draw"
export { strokeShape } from "./draw"
export { Rectangle } from "./infrastructure/Rectangle"
export type {
  CanvasColour,
  ColorOption,
  ConnectingLink,
  Direction,
  IBoundaryNodes,
  IColorable,
  IContextMenuOptions,
  IContextMenuValue,
  IFoundSlot,
  IInputOrOutput,
  INodeFlags,
  INodeInputSlot,
  INodeOutputSlot,
  INodeSlot,
  ISlotType,
  KeysOfType,
  LinkNetwork,
  LinkSegment,
  MethodNames,
  Panel,
  PanelButton,
  PanelWidget,
  PanelWidgetCallback,
  PanelWidgetOptions,
  PickByType,
  Point,
  Positionable,
  ReadonlyLinkNetwork,
  ReadOnlyPoint,
  ReadOnlyRect,
  Rect,
  Size,
} from "./interfaces"
export { LGraph } from "./LGraph"
export { BadgePosition, LGraphBadge, type LGraphBadgeOptions } from "./LGraphBadge"
export { LGraphCanvas, type LGraphCanvasState } from "./LGraphCanvas"
export { LGraphGroup } from "./LGraphGroup"
export { LGraphNode, type NodeId } from "./LGraphNode"
export { type LinkId, LLink } from "./LLink"
export { clamp, createBounds } from "./measure"
export { Reroute, type RerouteId } from "./Reroute"
export { type ExecutableLGraphNode, ExecutableNodeDTO, type ExecutionId } from "./subgraph/ExecutableNodeDTO"
export { SubgraphNode } from "./subgraph/SubgraphNode"
export type { CanvasPointerEvent } from "./types/events"
export {
  CanvasItem,
  EaseFunction,
  LGraphEventMode,
  LinkMarkerShape,
  RenderShape,
  TitleMode,
} from "./types/globalEnums"
export type {
  ExportedSubgraph,
  ExportedSubgraphInstance,
  ExportedSubgraphIONode,
  ISerialisedGraph,
  SerialisableGraph,
  SerialisableLLink,
  SubgraphIO,
} from "./types/serialisation"
export type { IWidget, TWidgetValue } from "./types/widgets"
export { isColorable } from "./utils/type"
export { createUuidv4 } from "./utils/uuid"
export { evaluateInput, getWidgetStep, renameWidget, syncWidgetLabelsFromInputs } from "./utils/widget"
export { BaseSteppedWidget } from "./widgets/BaseSteppedWidget"
export { BaseWidget } from "./widgets/BaseWidget"
export { BooleanWidget } from "./widgets/BooleanWidget"
export { ButtonWidget } from "./widgets/ButtonWidget"
export { ColorWidget } from "./widgets/ColorWidget"
export { ComboWidget } from "./widgets/ComboWidget"
export { KnobWidget } from "./widgets/KnobWidget"
export { LegacyWidget } from "./widgets/LegacyWidget"
export { NumberWidget } from "./widgets/NumberWidget"
export { SliderWidget } from "./widgets/SliderWidget"
export { TextWidget } from "./widgets/TextWidget"
export { isColorWidget, isComboWidget } from "./widgets/widgetMap"
