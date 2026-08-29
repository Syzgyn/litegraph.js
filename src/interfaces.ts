import type { ContextMenu } from "./ContextMenu"
import type { LGraphNode, NodeId } from "./LGraphNode"
import type { LinkId, LLink } from "./LLink"
import type { Reroute, RerouteId } from "./Reroute"
import type { SubgraphInputNode } from "./subgraph/SubgraphInputNode"
import type { SubgraphOutputNode } from "./subgraph/SubgraphOutputNode"
import type { LinkDirection, RenderShape } from "./types/globalEnums"
import type { TWidgetValue } from "./types/widgets"
import type { IBaseWidget } from "./types/widgets"
import type { Rectangle } from "@/infrastructure/Rectangle"
import type { CanvasPointerEvent } from "@/types/events"

/**
 * A string-keyed object map.
 *
 * Used throughout LiteGraph for registries such as node colours, link type colours,
 * and legacy selected-node lookups.
 */
export type Dictionary<T> = { [key: string]: T }

/**
 * Allows all properties of `T` to be `null`.
 *
 * Similar to `Partial<T>`, but uses `null` instead of `undefined` for absent values.
 */
export type NullableProperties<T> = {
  [P in keyof T]: T[P] | null
}

/**
 * If `T` is `null` or `undefined`, evaluates to `Result`. Otherwise, evaluates to `T`.
 *
 * Useful for functions that return e.g. `undefined` when a param is nullish.
 */
export type WhenNullish<T, Result> = T & {} | (T extends null ? Result : T extends undefined ? Result : T & {})

/**
 * A type with each of the `Properties` made optional.
 * @template T - The base object type.
 * @template Properties - Keys of `T` to make optional.
 */
export type OptionalProps<T, Properties extends keyof T> = Omit<T, Properties> & { [K in Properties]?: T[K] }

/**
 * A type with each of the `Properties` marked as required.
 * @template T - The base object type.
 * @template Properties - Keys of `T` to make required.
 */
export type RequiredProps<T, Properties extends keyof T> = Omit<T, Properties> & { [K in Properties]-?: T[K] }

/**
 * Bitwise AND intersection of two types.
 *
 * Returns a new, non-union type that includes only properties that exist on both `T1` and `T2`.
 */
export type SharedIntersection<T1, T2> = {
  [P in keyof T1 as P extends keyof T2 ? P : never]: T1[P]
} & {
  [P in keyof T2 as P extends keyof T1 ? P : never]: T2[P]
}

/**
 * Any valid 2D canvas fill or stroke colour.
 *
 * May be a CSS colour string, a `CanvasGradient`, or a `CanvasPattern`.
 */
export type CanvasColour = string | CanvasGradient | CanvasPattern

/** A single stop in a multi-stop colour gradient used by gradient slider widgets. */
export interface ColorStop {
  readonly offset: number
  readonly color: readonly [r: number, g: number, b: number]
}

/**
 * Any object that has a `boundingRect`.
 */
export interface HasBoundingRect {
  /**
   * A rectangle that represents the outer edges of the item.
   *
   * Used for various calculations, such as overlap, selective rendering, and click checks.
   * For most items, this is cached position & size as `x, y, width, height`.
   * Some items (such as nodes and slots) may extend above and/or to the left of their `pos`.
   * @readonly
   * @see `move`
   */
  readonly boundingRect: ReadOnlyRect
}

/**
 * An object that owns a set of child objects.
 * @template TChild - The type of items contained by this parent.
 */
export interface Parent<TChild> {
  /** All objects owned by the parent object. */
  readonly children?: ReadonlySet<TChild>
}

/**
 * An object that can be positioned, selected, and moved on the graph canvas.
 *
 * May contain other `Positionable` objects (e.g. group contents).
 */
export interface Positionable extends Parent<Positionable>, HasBoundingRect {
  /** Unique identifier for this item within its graph. */
  readonly id: NodeId | RerouteId | number
  /**
   * Position in graph coordinates. This may be the top-left corner,
   * the centre, or another point depending on concrete type.
   * @default 0,0
   */
  readonly pos: Point
  /** `true` if this object is part of the current selection, otherwise `false`. */
  selected?: boolean

  /** See `IPinnable.pinned` */
  readonly pinned?: boolean

  /**
   * When explicitly set to `false`, no options to delete this item will be provided.
   * @default undefined (true)
   */
  readonly removable?: boolean

  /**
   * Adds a delta to the current position.
   * @param deltaX X value to add to current position
   * @param deltaY Y value to add to current position
   * @param skipChildren If true, any child objects like group contents will not be moved
   */
  move(deltaX: number, deltaY: number, skipChildren?: boolean): void

  /**
   * Snaps this item to a grid.
   *
   * Position values are rounded to the nearest multiple of `snapTo`.
   * @param snapTo The size of the grid to align to
   * @returns `true` if it moved, or `false` if the snap was rejected (e.g. `pinned`)
   */
  snapToGrid(snapTo: number): boolean

  /** Called whenever the item is selected */
  onSelected?(): void
  /** Called whenever the item is deselected */
  onDeselected?(): void
}

/**
 * A colour preset used to customise the appearance of `LGraphNode` or `LGraphGroup`.
 * @see `LGraphCanvas.nodeColors`
 */
export interface ColorOption {
  /** Primary foreground / title-bar colour. */
  color: string
  /** Node body background colour. */
  bgColor: string
  /** Group border / header colour when applied to a group. */
  groupColor: string
}

/**
 * An object whose colours can be set from a `ColorOption` preset.
 */
export interface IColorable {
  /**
   * Applies a colour preset, or clears custom colours when `null`.
   * @param colorOption The preset to apply, or `null` to reset.
   */
  setColorOption(colorOption: ColorOption | null): void
  /**
   * Returns the currently applied colour preset, if any.
   * @returns The active preset, or `null` if using default colours.
   */
  getColorOption(): ColorOption | null
}

/**
 * An object that can be pinned in place.
 *
 * Prevents the object being accidentally moved or resized by mouse interaction.
 */
export interface IPinnable {
  /** Whether this item is currently pinned. */
  readonly pinned: boolean
  /**
   * Pins or unpins this item.
   * @param value If provided, sets pinned state explicitly; otherwise toggles.
   */
  pin(value?: boolean): void
  /** Unpins this item, allowing movement and resize. */
  unpin(): void
}

/**
 * Read-only view of a graph's link and reroute collections.
 *
 * Implemented by `LGraph` and `Subgraph` for safe traversal without mutation.
 */
export interface ReadonlyLinkNetwork {
  /** All permanent links in the graph, keyed by link ID. */
  readonly links: ReadonlyMap<LinkId, LLink>
  /** All reroute nodes in the graph, keyed by reroute ID. */
  readonly reroutes: ReadonlyMap<RerouteId, Reroute>
  /** Links that are not yet connected at both ends (mid-drag), keyed by link ID. */
  readonly floatingLinks: ReadonlyMap<LinkId, LLink>
  /**
   * Looks up a node by its ID.
   * @param id Node ID, or a nullish value.
   * @returns The node, or `null` if not found.
   */
  getNodeById(id: NodeId | null | undefined): LGraphNode | null
  /** @param id Must be `null` or `undefined`. */
  getLink(id: null | undefined): undefined
  /**
   * Looks up a link by its ID.
   * @param id Link ID, or a nullish value.
   * @returns The link, or `undefined` if not found.
   */
  getLink(id: LinkId | null | undefined): LLink | undefined
  /** @param parentId Must be `null` or `undefined`. */
  getReroute(parentId: null | undefined): undefined
  /**
   * Looks up a reroute by its ID.
   * @param parentId Reroute ID, or a nullish value.
   * @returns The reroute, or `undefined` if not found.
   */
  getReroute(parentId: RerouteId | null | undefined): Reroute | undefined

  /** The virtual input boundary node when this network is a subgraph. */
  readonly inputNode?: SubgraphInputNode
  /** The virtual output boundary node when this network is a subgraph. */
  readonly outputNode?: SubgraphOutputNode
}

/**
 * A mutable graph network containing links, reroutes, and nodes.
 *
 * Extends `ReadonlyLinkNetwork` with write access to link collections
 * and floating-link management.
 */
export interface LinkNetwork extends ReadonlyLinkNetwork {
  readonly links: Map<LinkId, LLink>
  readonly reroutes: Map<RerouteId, Reroute>
  /**
   * Registers a link as floating (in-progress connection).
   * @param link The link to add.
   * @returns The registered link.
   */
  addFloatingLink(link: LLink): LLink
  /**
   * Removes a reroute by ID.
   * @param id Reroute ID to remove.
   */
  removeReroute(id: number): unknown
  /**
   * Removes a link from the floating-links collection.
   * @param link The floating link to remove.
   */
  removeFloatingLink(link: LLink): void
}

/**
 * Provides hit-testing helpers to locate graph items at canvas coordinates.
 *
 * Implemented by `LGraph` and used by `LGraphCanvas` during pointer interaction.
 */
export interface ItemLocator {
  /**
   * Finds the topmost node at the given graph coordinates.
   * @param x Graph-space X coordinate.
   * @param y Graph-space Y coordinate.
   * @param nodeList Optional subset of nodes to search; defaults to all graph nodes.
   */
  getNodeOnPos(x: number, y: number, nodeList?: LGraphNode[]): LGraphNode | null
  /**
   * Finds a reroute at the given graph coordinates.
   * @param x Graph-space X coordinate.
   * @param y Graph-space Y coordinate.
   */
  getRerouteOnPos(x: number, y: number): Reroute | undefined
  /**
   * Finds a subgraph I/O boundary node at the given graph coordinates.
   * @param x Graph-space X coordinate.
   * @param y Graph-space Y coordinate.
   */
  getIoNodeOnPos?(x: number, y: number): SubgraphInputNode | SubgraphOutputNode | undefined
}

/**
 * A rendered segment of a link or reroute chain, with cached geometry for hit-testing.
 */
export interface LinkSegment {
  /** Link or reroute ID this segment represents. */
  readonly id: LinkId | RerouteId
  /** The reroute ID this segment starts from (output side), otherwise `undefined`. */
  readonly parentId?: RerouteId

  /** The last canvas 2D path that was used to render this segment. */
  path?: Path2D
  /** Centre point of the `path`. Calculated during render only — can be inaccurate. */
  readonly pathCentre: Float32Array
  /**
   * Y-forward angle along the `path` from its centre point, in radians.
   * `undefined` if using circles for link centres.
   * Calculated during render only — can be inaccurate.
   */
  centreAngle?: number

  /**
   * Whether the link is currently being moved.
   * @internal
   */
  dragging?: boolean

  /** Output node ID at the origin of this segment. */
  readonly originId: NodeId | undefined
  /** Output slot index at the origin of this segment. */
  readonly originSlot: number | undefined
}

/**
 * Discriminated union helper: exactly one of `input` or `output` is set
 * when describing a slot found during hit-testing or link dragging.
 */
export interface IInputOrOutput {
  /** Set when the found slot is an input. */
  input?: INodeInputSlot | null
  /** Set when the found slot is an output. */
  output?: INodeOutputSlot | null
}

/**
 * Result of hit-testing a node slot at a pointer position.
 *
 * Extends `IInputOrOutput` with the slot index and rendered connection point.
 */
export interface IFoundSlot extends IInputOrOutput {
  /** Index of the slot on its parent node. */
  slot: number
  /** Centre point of the rendered slot connection circle in graph coordinates. */
  linkPos: Point
}

/** A 2D point represented as `[x, y]` coordinates or a typed array. */
export type Point = [x: number, y: number] | Float32Array | Float64Array

/** A 2D size represented as `[width, height]` or a typed array. */
export type Size = [width: number, height: number] | Float32Array | Float64Array

/** A very firm array */
type ArRect = [x: number, y: number, width: number, height: number]

/** A rectangle as `[x, y, width, height]` starting at the top-left corner. */
export type Rect = ArRect | Float32Array | Float64Array

/** A read-only 2D point that will not be modified by consumers. */
export type ReadOnlyPoint =
  | readonly [x: number, y: number] |
  ReadOnlyTypedArray<Float32Array> |
  ReadOnlyTypedArray<Float64Array>

/** A read-only 2D size that will not be modified by consumers. */
export type ReadOnlySize =
  | readonly [width: number, height: number] |
  ReadOnlyTypedArray<Float32Array> |
  ReadOnlyTypedArray<Float64Array>

/** A read-only rectangle `[x, y, width, height]` that will not be modified by consumers. */
export type ReadOnlyRect =
  | readonly [x: number, y: number, width: number, height: number] |
  ReadOnlyTypedArray<Float32Array> |
  ReadOnlyTypedArray<Float64Array>

type TypedArrays =
  | Int8Array |
  Uint8Array |
  Uint8ClampedArray |
  Int16Array |
  Uint16Array |
  Int32Array |
  Uint32Array |
  Float32Array |
  Float64Array

type TypedBigIntArrays = BigInt64Array | BigUint64Array

/**
 * A read-only view of a typed array with mutating methods removed.
 *
 * Used for `ReadOnlyPoint`, `ReadOnlySize`, and `ReadOnlyRect` to
 * prevent accidental in-place modification of shared geometry buffers.
 */
export type ReadOnlyTypedArray<T extends TypedArrays | TypedBigIntArrays> =
  Omit<Readonly<T>, "fill" | "copyWithin" | "reverse" | "set" | "sort" | "subarray">

/**
 * Union of property names on `T` whose values extend `Match`.
 * @template T - The object type to inspect.
 * @template Match - The value type to filter properties by.
 */
export type KeysOfType<T, Match> = Exclude<{ [P in keyof T]: T[P] extends Match ? P : never }[keyof T], undefined>

/**
 * A new type containing only the properties of `T` whose values extend `Match`.
 * @template T - The object type to filter.
 * @template Match - The value type to keep.
 */
export type PickByType<T, Match> = { [P in keyof T]: Extract<T[P], Match> }

/**
 * The names of all (optional) methods and functions in `T`.
 *
 * Useful for extracting callback property names from interface types.
 */
export type MethodNames<T> = KeysOfType<T, ((...args: any) => any) | undefined>

/**
 * The four extreme nodes in a selection, used for alignment operations.
 */
export interface IBoundaryNodes {
  /** Northernmost (smallest Y) node in the selection. */
  top: LGraphNode
  /** Easternmost (largest X) node in the selection. */
  right: LGraphNode
  /** Southernmost (largest Y) node in the selection. */
  bottom: LGraphNode
  /** Westernmost (smallest X) node in the selection. */
  left: LGraphNode
}

/** Cardinal direction used for node alignment and distribution. */
export type Direction = "top" | "bottom" | "left" | "right"

/** Resize handle positions at compass corners (north-east, south-east, etc.). */
export type CompassCorners = "NE" | "SE" | "SW" | "NW"

/**
 * A string or numeric identifier for a slot's data type, e.g. `"STRING"` or `LiteGraph.EVENT`.
 *
 * Can be comma-delimited to specify multiple allowed types, e.g. `"STRING,INT"`.
 */
export type ISlotType = number | string

/**
 * Common properties shared by node input and output slots.
 */
export interface INodeSlot extends HasBoundingRect {
  /**
   * The name of the slot in English.
   * Will be included in the serialized data.
   */
  name: string
  /**
   * The localized name of the slot to display in the UI.
   * Takes higher priority than `name` if set.
   * Will be included in the serialized data.
   */
  localizedName?: string
  /**
   * The name of the slot to display in the UI, modified by the user.
   * Takes higher priority than `localizedName` if set.
   * Will be included in the serialized data.
   */
  label?: string

  /** Data type accepted or produced by this slot. */
  type: ISlotType
  /** Direction the link leaves or enters this slot. */
  dir?: LinkDirection
  /** When `true`, the slot can be removed via context menu. */
  removable?: boolean
  /** Visual shape of the slot connection point. */
  shape?: RenderShape
  /** Colour when the slot is disconnected. */
  colorOff?: CanvasColour
  /** Colour when the slot is connected. */
  colorOn?: CanvasColour
  /** When `true`, the slot cannot be connected or disconnected. */
  locked?: boolean
  /** When `true`, the slot name cannot be renamed. */
  nameLocked?: boolean
  /** Cached render position of the slot in graph coordinates. */
  pos?: Point
  /** @remarks Automatically calculated; not included in serialisation. */
  boundingRect: Rect
  /**
   * A list of floating link IDs that are connected to this slot.
   * This is calculated at runtime; it is **not** serialized.
   */
  floatingLinks?: Set<LLink>
  /**
   * Whether the slot has validation errors. It is **not** serialized.
   */
  hasErrors?: boolean
}

/**
 * Runtime flags that control node behaviour and appearance.
 *
 * Stored on `LGraphNode` and included in serialisation when set.
 */
export interface INodeFlags {
  /** When `true`, repeated output values are not re-emitted each execution tick. */
  skipRepeatedOutputs?: boolean
  /** When `false`, disables widget and slot interaction on this node. */
  allowInteraction?: boolean
  /** When `true`, the node cannot be moved by pointer interaction. */
  pinned?: boolean
  /** When `true`, the node is rendered in collapsed (compact) form. */
  collapsed?: boolean
  /** Configuration setting for `LGraphNode.connectInputToOutput` */
  keepAllLinksOnBypass?: boolean
  /** Node is in ghost placement mode (semi-transparent, following cursor) */
  ghost?: boolean
}

/**
 * A widget that is linked to a slot.
 *
 * This is set by the ComfyUI_frontend logic. See
 * https://github.com/Comfy-Org/ComfyUI_frontend/blob/b80e0e1a3c74040f328c4e344326c969c97f67e0/src/extensions/core/widgetInputs.ts#L659
 */
export interface IWidgetLocator {
  /** Name of the widget to bind to the input slot. */
  name: string
}

/**
 * An input slot on a node, optionally linked to a widget or an upstream link.
 */
export interface INodeInputSlot extends INodeSlot {
  /** ID of the incoming link, or `null` if disconnected. */
  link: LinkId | null
  /** Reference to a widget that provides this input's value. */
  widget?: IWidgetLocator
  /** When true, widget input slots remain visible even when disconnected. */
  alwaysVisible?: boolean

  /**
   * Internal use only; API is not finalised and may change at any time.
   */
  _widget?: IBaseWidget
}

/**
 * An input slot that is always backed by a named widget.
 */
export interface IWidgetInputSlot extends INodeInputSlot {
  widget: IWidgetLocator
}

/**
 * An output slot on a node that may fan out to multiple downstream links.
 */
export interface INodeOutputSlot extends INodeSlot {
  /** IDs of all outgoing links, or `null` if disconnected. */
  links: LinkId[] | null
  /** Cached runtime data produced by this output during execution. */
  data?: unknown
  /** Stable index assigned when the slot was created. */
  slotIndex?: number
}

/**
 * Describes an in-progress or moving link during pointer interaction.
 *
 * Used by `LGraphCanvas.connectingLinks` and the `LinkConnector` system.
 */
export interface ConnectingLink extends IInputOrOutput {
  /** The node at the fixed end of the connection being dragged. */
  node: LGraphNode
  /** Slot index on `node` at the fixed end. */
  slot: number
  /** Canvas position where the free end of the link is rendered. */
  pos: Point
  /** Direction the free end of the link faces. */
  direction?: LinkDirection
  /** Reroute ID immediately before the free end, if the link passes through reroutes. */
  afterRerouteId?: RerouteId
  /** The first reroute in the chain, if any. */
  firstRerouteId?: RerouteId
  /** The existing `LLink` being moved, or `undefined` if creating a new link. */
  link?: LLink
}

interface IContextMenuBase {
  title?: string
  className?: string
}

/**
 * Options passed when constructing a `ContextMenu`.
 * @template TValue - The value type associated with menu entries.
 * @template TExtra - Arbitrary extra data attached to the menu instance.
 */
export interface IContextMenuOptions<TValue = unknown, TExtra = unknown> extends IContextMenuBase {
  /** When `true`, item-level callbacks are not invoked automatically. */
  ignoreItemCallbacks?: boolean
  /** Parent menu, when this menu is a submenu. */
  parentMenu?: ContextMenu<TValue>
  /** DOM event that triggered the menu. */
  event?: MouseEvent
  /** Arbitrary extra data for menu callbacks. */
  extra?: TExtra
  /** @deprecated Context menu scrolling is now controlled by the browser */
  scrollSpeed?: number
  /** Absolute left position for the menu element. */
  left?: number
  /** Absolute top position for the menu element. */
  top?: number
  /** @deprecated Context menus no longer scale using transform */
  scale?: number
  /** Node context for node-specific menus. */
  node?: LGraphNode
  /** When `true`, the menu opens immediately without waiting for a click. */
  autoopen?: boolean
  /** Global callback invoked when any menu item is selected. */
  callback?(
    value?: string | IContextMenuValue<TValue>,
    options?: unknown,
    event?: MouseEvent,
    previousMenu?: ContextMenu<TValue>,
    extra?: unknown,
  ): void | boolean
}

/**
 * A single entry in a `ContextMenu`.
 * @template TValue - The value returned when this entry is selected.
 * @template TExtra - Extra data forwarded to the entry callback.
 * @template TCallbackValue - Value type passed to the entry's own callback.
 */
export interface IContextMenuValue<TValue = unknown, TExtra = unknown, TCallbackValue = unknown> extends IContextMenuBase {
  /** Value associated with this menu entry. */
  value?: TValue
  /** Display text shown in the menu. */
  content: string | undefined
  /** When `true`, a submenu arrow is shown and `submenu` is opened on click. */
  hasSubmenu?: boolean
  /** When `true`, the entry is greyed out and not selectable. */
  disabled?: boolean
  /** Submenu configuration opened when this entry is clicked. */
  submenu?: IContextMenuSubmenu<TValue>
  /** Node property name, when this entry edits a property. */
  property?: string
  /** Property editor type hint (e.g. `"string"`, `"number"`). */
  type?: string
  /** Slot context, when this entry operates on a node slot. */
  slot?: IFoundSlot
  /** Per-entry callback invoked when this item is selected. */
  callback?(
    this: ContextMenuDivElement<TValue>,
    value?: TCallbackValue,
    options?: unknown,
    event?: MouseEvent,
    previousMenu?: ContextMenu<TValue>,
    extra?: TExtra,
  ): void | boolean
}

/**
 * Configuration for a submenu attached to a `IContextMenuValue` entry.
 * @template TValue - The value type for submenu entries.
 */
export interface IContextMenuSubmenu<TValue = unknown> extends IContextMenuOptions<TValue> {
  /** Constructor arguments for the nested `ContextMenu`. */
  options: ConstructorParameters<typeof ContextMenu<TValue>>[0]
}

/**
 * A menu item DOM element extended with LiteGraph context-menu metadata.
 * @template TValue - The value type bound to this element.
 */
export interface ContextMenuDivElement<TValue = unknown> extends HTMLDivElement {
  /** The menu entry value or full entry object. */
  value?: string | IContextMenuValue<TValue>
  /** Legacy onclick callback — always `never` in current API. */
  onclickCallback?: never
}

/**
 * Tuple describing a slot to add via context menu: `[name, type, optionalOverrides]`.
 */
export type INodeSlotContextItem = [string, ISlotType, Partial<INodeInputSlot & INodeOutputSlot>]

/**
 * Strategy for resolving link and slot colours based on connection state and type.
 */
export interface DefaultConnectionColors {
  /**
   * Returns the colour for a connected slot of the given type.
   * @param type Slot type identifier.
   */
  getConnectedColor(type: ISlotType): CanvasColour
  /**
   * Returns the colour for a disconnected slot of the given type.
   * @param type Slot type identifier.
   */
  getDisconnectedColor(type: ISlotType): CanvasColour
}

import type { SubgraphInput } from "@/subgraph/SubgraphInput"

/**
 * A subgraph input slot with optional event-listener lifecycle management.
 */
export interface ISubgraphInput extends INodeInputSlot {
  /** The subgraph boundary slot this node input mirrors. */
  _subgraphSlot?: SubgraphInput
  /** Abort controller for cleaning up slot event listeners. */
  _listenerController?: AbortController
}

/**
 * Shorthand for `Parameters` of optional callbacks.
 * @example
 * ```ts
 * const { onClick } = CustomClass.prototype
 * CustomClass.prototype.onClick = function (...args: CallbackParams<typeof onClick>) {
 *   const r = onClick?.apply(this, args)
 *   // ...
 *   return r
 * }
 * ```
 */
export type CallbackParams<T extends ((...args: any) => any) | undefined> =
  Parameters<Exclude<T, undefined>>

/**
 * Shorthand for `ReturnType` of optional callbacks.
 * @see `CallbackParams`
 */
export type CallbackReturn<T extends ((...args: any) => any) | undefined> = ReturnType<Exclude<T, undefined>>

/**
 * An object that responds to pointer hover events on the canvas.
 *
 * Implemented by reroutes and other interactive overlays.
 */
export interface Hoverable extends HasBoundingRect {
  readonly boundingRect: Rectangle
  /** Whether the pointer is currently over this item. */
  isPointerOver: boolean

  /**
   * Hit-tests whether a point lies within this item's bounds.
   * @param point Graph-space coordinates to test.
   */
  containsPoint(point: Point): boolean

  /** Called on each pointer move while over this item. */
  onPointerMove(e: CanvasPointerEvent): void
  /** Called when the pointer enters this item's bounds. */
  onPointerEnter?(e?: CanvasPointerEvent): void
  /** Called when the pointer leaves this item's bounds. */
  onPointerLeave?(e?: CanvasPointerEvent): void
}

/**
 * Callback for panel widget value changes.
 */
export type PanelWidgetCallback = (
  name: string | undefined,
  value: TWidgetValue,
  options: PanelWidgetOptions,
) => void

/**
 * Options for panel widgets.
 */
export interface PanelWidgetOptions {
  label?: string
  type?: string
  widget?: string
  values?: Array<string | IContextMenuValue<unknown, unknown, unknown> | null>
  callback?: PanelWidgetCallback
}

/**
 * A button element with optional options property.
 */
export interface PanelButton extends HTMLButtonElement {
  options?: unknown
}

/**
 * A widget element with options and value properties.
 */
export interface PanelWidget extends HTMLDivElement {
  options?: PanelWidgetOptions
  value?: TWidgetValue
}

/**
 * A dialog panel created by `LGraphCanvas.createPanel()`.
 * Extends `HTMLDivElement` with additional properties and methods for panel management.
 */
export interface Panel extends HTMLDivElement {
  header: HTMLElement
  titleElement: HTMLSpanElement
  content: HTMLDivElement
  altContent: HTMLDivElement
  footer: HTMLDivElement
  node?: LGraphNode
  onOpen?: () => void
  onClose?: () => void
  close(): void
  toggleAltContent(force?: boolean): void
  toggleFooterVisibility(force?: boolean): void
  clear(): void
  addHTML(code: string, classname?: string, onFooter?: boolean): HTMLDivElement
  addButton(name: string, callback: () => void, options?: unknown): PanelButton
  addSeparator(): void
  addWidget(
    type: string,
    name: string,
    value: TWidgetValue,
    options?: PanelWidgetOptions,
    callback?: PanelWidgetCallback,
  ): PanelWidget
  innerShowCodePad?(property: string): void
}
