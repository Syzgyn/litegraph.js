import type { ContextMenu } from "./ContextMenu"
import type { CustomEventDispatcher, ICustomEventTarget } from "./infrastructure/CustomEventTarget"
import type { LGraphCanvasEventMap } from "./infrastructure/LGraphCanvasEventMap"
import type {
  CanvasColour,
  ColorOption,
  ConnectingLink,
  ContextMenuDivElement,
  DefaultConnectionColors,
  Dictionary,
  Direction,
  IBoundaryNodes,
  IColorable,
  IContextMenuOptions,
  IContextMenuValue,
  INodeInputSlot,
  INodeOutputSlot,
  INodeSlot,
  INodeSlotContextItem,
  ISlotType,
  LinkNetwork,
  LinkSegment,
  NullableProperties,
  Panel,
  PanelButton,
  PanelWidget,
  PanelWidgetCallback,
  PanelWidgetOptions,
  Point,
  Positionable,
  ReadOnlyPoint,
  ReadOnlyRect,
  Rect,
  Size,
} from "./interfaces"
import type { LGraph } from "./LGraph"
import type {
  CanvasPointerEvent,
  CanvasPointerExtensions,
} from "./types/events"
import type { ClipboardItems, ISerialisedNode, SubgraphIO } from "./types/serialisation"
import type { NeverNever } from "./types/utility"
import type { PickNevers } from "./types/utility"
import type { IBaseWidget, TWidgetValue } from "./types/widgets"
import type { UUID } from "./utils/uuid"

import DOMPurify from "dompurify"

import { AutoPanController } from "@/canvas/AutoPanController"
import { LinkConnector, type RenderLinkUnion } from "@/canvas/LinkConnector"
import { MovingInputLink } from "@/canvas/MovingInputLink"
import { forEachNode } from "@/utils/graphTraversal"
import { isMiddleButtonEvent } from "@/utils/pointerUtils"

import { isOverNodeInput, isOverNodeOutput } from "./canvas/measureSlots"
import { CanvasPointer } from "./CanvasPointer"
import { createCursorCache } from "./cursorCache"
import { type AnimationOptions, DragAndScale } from "./DragAndScale"
import { strokeShape } from "./draw"
import { NullGraphError } from "./infrastructure/NullGraphError"
import { LGraphGroup } from "./LGraphGroup"
import { LGraphNode, type NodeId, type NodeProperty } from "./LGraphNode"
import { createUuidv4, LiteGraph, Rectangle, SubgraphNode } from "./litegraph"
import { type LinkId, LLink } from "./LLink"
import {
  containsRect,
  createBounds,
  distance,
  findPointOnCurve,
  isInRect,
  isInRectangle,
  isPointInRect,
  overlapBounding,
  snapPoint,
} from "./measure"
import { NodeInputSlot } from "./node/NodeInputSlot"
import { Reroute, type RerouteId } from "./Reroute"
import { stringOrEmpty } from "./strings"
import { Subgraph } from "./subgraph/Subgraph"
import { SubgraphInputNode } from "./subgraph/SubgraphInputNode"
import { SubgraphIONodeBase } from "./subgraph/SubgraphIONodeBase"
import { SubgraphOutputNode } from "./subgraph/SubgraphOutputNode"
import {
  CanvasItem,
  LGraphEventMode,
  LinkDirection,
  LinkMarkerShape,
  LinkRenderType,
  RenderShape,
  TitleMode,
} from "./types/globalEnums"
import { alignNodes, distributeNodes, getBoundaryNodes } from "./utils/arrange"
import { findFirstNode, getDraggedItems } from "./utils/collections"
import { cachedMeasureText, clearTextMeasureCache } from "./utils/textMeasureCache"
import { BaseWidget } from "./widgets/BaseWidget"
import { toConcreteWidget } from "./widgets/widgetMap"

interface IShowSearchOptions {
  nodeTo?: LGraphNode | null
  nodeFrom?: LGraphNode | null
  slotFrom: number | INodeOutputSlot | INodeInputSlot | null | undefined
  typeFilterIn?: ISlotType
  typeFilterOut?: ISlotType | false

  // TODO check for registeredSlot[In/Out]Types not empty // this will be checked for functionality enabled : filter on slot type, in and out
  doTypeFilter?: boolean
  showGeneralIfNoneOnTypeFilter?: boolean
  showGeneralAfterTypeFiltered?: boolean
  hideOnMouseLeave?: boolean
  showAllIfEmpty?: boolean
  showAllOnOpen?: boolean
}

interface ICreateNodeOptions {
  /** input */
  nodeFrom?: SubgraphInputNode | LGraphNode | null
  /** input */
  slotFrom?: number | INodeOutputSlot | INodeInputSlot | SubgraphIO | null
  /** output */
  nodeTo?: SubgraphOutputNode | LGraphNode | null
  /** output */
  slotTo?: number | INodeOutputSlot | INodeInputSlot | SubgraphIO | null
  /** pass the event coords */

  /** Create the connection from a reroute */
  afterRerouteId?: RerouteId

  // FIXME: Should not be optional
  /** choose a nodetype to add, AUTO to set at first good */
  nodeType?: string
  e?: CanvasPointerEvent
  allowSearchbox?: boolean
}

interface ICreateDefaultNodeOptions extends ICreateNodeOptions {
  /** Position of new node */
  position: Point
  /** adjust x,y */
  posAdd?: Point
  /** alpha, adjust the position x,y based on the new node size w,h */
  posSizeFix?: Point
}

interface HasShowSearchCallback {
  /** See `LGraphCanvas.showSearchBox` */
  showSearchbox: (
    event: MouseEvent,
    options?: IShowSearchOptions,
  ) => HTMLDivElement | void
}

interface ICloseable {
  close(): void
}

interface IDialogExtensions extends ICloseable {
  modified(): void
  isModified: boolean
}

interface IDialog extends HTMLDivElement, IDialogExtensions {}
type PromptDialog = Omit<IDialog, "modified">

interface IDialogOptions {
  position?: Point
  event?: MouseEvent
  checkForInput?: boolean
  closeOnLeave?: boolean
  onclose?(): void
}

/**
 * Runtime interaction state for an `LGraphCanvas` instance.
 *
 * Tracked separately from rendering configuration so it can be proxied or observed
 * without affecting draw settings. Access via `LGraphCanvas.state`.
 */
export interface LGraphCanvasState {
  /** `Positionable` items are being dragged on the canvas. */
  draggingItems: boolean
  /** The canvas itself is being dragged. */
  draggingCanvas: boolean
  /** The canvas is read-only, preventing changes to nodes, disconnecting links, moving items, etc. */
  readOnly: boolean

  /** Bit flags indicating what is currently below the pointer. */
  hoveringOver: CanvasItem
  /** If `true`, pointer move events will set the canvas cursor style. */
  shouldSetCursor: boolean

  /**
   * Dirty flag indicating that `selectedItems` has changed.
   * Downstream consumers may reset to false once actioned.
   */
  selectionChanged: boolean

  /** ID of node currently in ghost placement mode (semi-transparent, following cursor). */
  ghostNodeId: NodeId | null
}

/**
 * The items created by a clipboard paste operation.
 * Includes maps of original copied IDs to newly created items.
 */
interface ClipboardPasteResult {
  /** All successfully created items */
  created: Positionable[]
  /** Map: original node IDs to newly created nodes */
  nodes: Map<NodeId, LGraphNode>
  /** Map: original link IDs to new link IDs */
  links: Map<LinkId, LLink>
  /** Map: original reroute IDs to newly created reroutes */
  reroutes: Map<RerouteId, Reroute>
  /** Map: original subgraph IDs to newly created subgraphs */
  subgraphs: Map<UUID, Subgraph>
}

/** Options for `LGraphCanvas.pasteFromClipboard`. */
interface IPasteFromClipboardOptions {
  /** If `true`, always attempt to connect inputs of pasted nodes - including to nodes that were not pasted. */
  connectInputs?: boolean
  /** The position to paste the items at. */
  position?: Point
}

interface ICreatePanelOptions {
  closable?: boolean
  window?: Window
  onOpen?: () => void
  onClose?: () => void
  width?: number | string
  height?: number | string
}

interface SlotTypeDefaultNodeOpts {
  node?: string
  title?: string
  properties?: Record<string, NodeProperty>
  inputs?: [string, string][]
  outputs?: [string, string][]
  json?: Parameters<LGraphNode["configure"]>[0]
}

const cursors = {
  NE: "nesw-resize",
  SE: "nwse-resize",
  SW: "nesw-resize",
  NW: "nwse-resize",
} as const

/**
 * Renders and interacts with a single `LGraph` (or `Subgraph`) on an HTML canvas.
 *
 * Owns the render loop, pointer/keyboard input, selection, clipboard, context menus,
 * link dragging (`LinkConnector`), and pan/zoom (`DragAndScale`).
 * @remarks
 * Most user-facing behaviour is configurable via instance properties (e.g.
 * `allowDragNodes`, `renderCurvedConnections`) and optional callbacks
 * (`onNodeSelected`, `onNodeDblClicked`, `onShowNodePanel`,
 * `onRender`). Dispatches typed events through `dispatch` /
 * `LGraphCanvasEventMap`.
 * @see `LGraph.attachCanvas`
 * @see `LinkConnector`
 */
export class LGraphCanvas implements CustomEventDispatcher<LGraphCanvasEventMap> {
  // Optimised buffers used during rendering
  static #temp = new Float32Array(4)
  static #tempVec2 = new Float32Array(2)
  static #tempArea = new Float32Array(4)
  static #marginArea = new Float32Array(4)
  static #linkBounding = new Float32Array(4)
  static #lTempA: Point = new Float32Array(2)
  static #lTempB: Point = new Float32Array(2)
  static #lTempC: Point = new Float32Array(2)

  /** Default tiled background image (base64 PNG) used when no custom `LGraphCanvas.backgroundImage` is set. */
  static DEFAULT_BACKGROUND_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQBJREFUeNrs1rEKwjAUhlETUkj3vP9rdmr1Ysammk2w5wdxuLgcMHyptfawuZX4pJSWZTnfnu/lnIe/jNNxHHGNn//HNbbv+4dr6V+11uF527arU7+u63qfa/bnmh8sWLBgwYJlqRf8MEptXPBXJXa37BSl3ixYsGDBMliwFLyCV/DeLIMFCxYsWLBMwSt4Be/NggXLYMGCBUvBK3iNruC9WbBgwYJlsGApeAWv4L1ZBgsWLFiwYJmCV/AK3psFC5bBggULloJX8BpdwXuzYMGCBctgwVLwCl7Be7MMFixYsGDBsu8FH1FaSmExVfAxBa/gvVmwYMGCZbBg/W4vAQYA5tRF9QYlv/QAAAAASUVORK5CYII="

  /** Default colour for event-type links when no per-type override exists in `LGraphCanvas.linkTypeColors`. */
  static DEFAULT_EVENT_LINK_COLOR = "#A86"

  /** Link type to colour dictionary. */
  static linkTypeColors: Dictionary<string> = {
    "-1": LGraphCanvas.DEFAULT_EVENT_LINK_COLOR,
    "number": "#AAA",
    "node": "#DCA",
  }

  /** Cache of named `CanvasGradient` objects created during rendering. */
  static gradients: Record<string, CanvasGradient> = {}

  /** Maximum number of search results shown in the node search box. `-1` means unlimited. */
  static searchLimit = -1
  /** Named `ColorOption` presets available for nodes and groups via context menus. */
  static nodeColors: Record<string, ColorOption> = {
    red: { color: "#322", bgColor: "#533", groupColor: "#A88" },
    brown: { color: "#332922", bgColor: "#593930", groupColor: "#b06634" },
    green: { color: "#232", bgColor: "#353", groupColor: "#8A8" },
    blue: { color: "#223", bgColor: "#335", groupColor: "#88A" },
    paleBlue: {
      color: "#2a363b",
      bgColor: "#3f5159",
      groupColor: "#3f789e",
    },
    cyan: { color: "#233", bgColor: "#355", groupColor: "#8AA" },
    purple: { color: "#323", bgColor: "#535", groupColor: "#a1309b" },
    yellow: { color: "#432", bgColor: "#653", groupColor: "#b58b2a" },
    black: { color: "#222", bgColor: "#000", groupColor: "#444" },
  }

  /**
   * @internal Exclusively a workaround for design limitation in `LGraphNode.computeSize`.
   */
  static measureText?: (text: string, fontStyle?: string) => number

  /** The canvas instance that most recently received pointer input. Used by static menu handlers. */
  static activeCanvas: LGraphCanvas

  /** The node that was most recently right-clicked. Set during `processContextMenu`. */
  static activeNode: LGraphNode

  #subgraph?: Subgraph
  #maximumFrameGap = 0

  // Whether the canvas was previously being dragged prior to pressing space key.
  // null if space key is not pressed.
  #previouslyDraggingCanvas: boolean | null = null

  #setCursor!: ReturnType<typeof createCursorCache>

  // Cached LOD threshold values for performance
  #lowQualityZoomThreshold: number = 0
  #isLowQuality: boolean = false

  /**
   * Once per frame check of snap to grid value.
   * @todo Update on change.
   */
  #snapToGrid?: number
  /**
   * Set on keydown, keyup.
   * @todo
   */
  #shiftDown: boolean = false
  /** The start position of the drag zoom. */
  #dragZoomStart: null | { pos: Point, scale: number } = null
  /** Minimum font size in pixels before switching to low quality rendering. */
  #minFontSizeForLod: number = 8
  /**
   * The IDs of the nodes that are currently visible on the canvas. More
   * performant than `visibleNodes` for visibility checks.
   */
  #visibleNodeIds: Set<NodeId> = new Set()

  #visibleReroutes: Set<Reroute> = new Set()
  /**
   * Modifier state of the most recent drag pointer event, so the auto-pan
   * callback resolves the same dragged-item set as normal pointer movement
   * (e.g. Cmd/Ctrl-drag moves a group without its contents). Updated on every
   * drag move and seeded from the pointer-down event when a drag starts.
   */
  #lastDragModifiers: Pick<MouseEvent, "ctrlKey" | "metaKey"> = {
    ctrlKey: false,
    metaKey: false,
  }

  #ghostPointerHandler: ((e: PointerEvent) => void) | null = null
  #ghostKeyHandler: ((e: KeyboardEvent) => void) | null = null
  /** Whether pointer and keyboard events are currently bound to `canvas`. */
  #eventsBinded?: boolean
  /** Canvas position of the slot highlight indicator shown during link dragging. */
  #highlightPos?: Point
  /** Input slot currently highlighted as a valid drop target during link dragging. */
  #highlightInput?: INodeInputSlot
  /** Cached `HTMLImageElement` for the tiled background pattern. */
  #bgImg?: HTMLImageElement
  /** Cached `CanvasPattern` created from `bgImg`. */
  #pattern?: CanvasPattern
  /** Cached `CanvasPattern` created from `bgImg`. */
  // private patternImg?: HTMLImageElement
  /** Bound pointer-down handler registered on `canvas`. */
  #mousedownCallback?: (e: PointerEvent) => void
  /** Bound wheel handler registered on `canvas`. */
  #mousewheelCallback?: (e: WheelEvent) => void
  /** Bound pointer-move handler registered on `canvas`. */
  #mousemoveCallback?: (e: PointerEvent) => void
  /** Bound pointer-up handler registered on `canvas`. */
  #mouseupCallback?: (e: PointerEvent) => void
  /** Bound pointer-out handler registered on `canvas`. */
  #mouseoutCallback?: (e: PointerEvent) => void
  /** Bound pointer-cancel handler registered on `canvas`. */
  #mousecancelCallback?: (e: PointerEvent) => void
  /** Bound subgraph-opened handler registered on `canvas`. */
  #subgraphOpenedCallback?: (e: CustomEvent) => void
  /** Bound keyboard handler registered on `canvas` and its document. */
  #keyCallback?: (e: KeyboardEvent) => void
  /** @deprecated Panels */
  #blockClick?: boolean
  /** Stack of parent graphs for navigation. */
  #navStack: (LGraph | Subgraph)[] = []

  autoPan: AutoPanController | null = null

  /** If true, enable drag zoom. Ctrl+Shift+Drag Up/Down: zoom canvas. */
  dragZoomEnabled: boolean = false

  /**
   * The state of this canvas, e.g. whether it is being dragged, or read-only.
   *
   * Implemented as a POCO that can be proxied without side-effects.
   */
  state: LGraphCanvasState = {
    draggingItems: false,
    draggingCanvas: false,
    readOnly: false,
    hoveringOver: CanvasItem.Nothing,
    shouldSetCursor: true,
    selectionChanged: false,
    ghostNodeId: null,
  }

  /**
   * Constructor options retained from `LGraphCanvas`'s constructor.
   * Controls viewport clipping, event binding, render startup, and autoresize behaviour.
   */
  options: {
    skipEvents?: boolean
    viewport?: Rect
    skipRender?: boolean
    autoresize?: boolean
  }

  /** Base64 or URL of the tiled background image drawn behind the graph. */
  backgroundImage: string
  /** Pan/zoom controller for this canvas. Tightly coupled with `LGraphCanvas.visibleArea`. */
  readonly ds: DragAndScale
  /** Unified pointer state tracker for mouse, touch, and pen input on this canvas. */
  readonly pointer: CanvasPointer
  /** When `true`, element alpha is scaled down when zoomed out to reduce visual noise. */
  zoomModifyAlpha: boolean
  /** Multiplier applied per mouse-wheel zoom step. Values below 1 invert zoom direction. */
  zoomSpeed: number
  autoPanSpeed: number
  /** Default CSS colour for node title bars. */
  nodeTitleColor: string
  /** Fallback colour for links when no type-specific colour is defined. */
  defaultLinkColor: string
  /** Default on/off colours for input and output slot connection points. */
  defaultConnectionColor: {
    inputOff: string
    inputOn: string
    outputOff: string
    outputOn: string
  }

  /** Per-type colours for connected slots. Keys are `ISlotType` strings. */
  defaultConnectionColorByType: Dictionary<CanvasColour>
  /** Per-type colours for disconnected slots. Falls back to `defaultConnectionColorByType` when a type is missing. */
  defaultconnectionColorByTypeOff: Dictionary<CanvasColour>

  /** Gets link colours. Extremely basic impl. until the legacy object dictionaries are removed. */
  colourGetter: DefaultConnectionColors = {
    getConnectedColor: (type: string) =>
      this.defaultConnectionColorByType[type] ||
      LiteGraph.slotTypeColors[type]?.colorOn ||
      this.defaultConnectionColor.outputOn,
    getDisconnectedColor: (type: string) =>
      this.defaultconnectionColorByTypeOff[type] ||
      LiteGraph.slotTypeColors[type]?.colorOff ||
      this.defaultConnectionColorByType[type] ||
      LiteGraph.slotTypeColors[type]?.colorOn ||
      this.defaultConnectionColor.outputOff,
  }

  /** When `true`, enables higher-quality rendering (shadows, anti-aliasing). */
  highqualityRender: boolean
  /** When `true`, node title bars are rendered with gradient fills. */
  useGradients: boolean
  /** Global opacity multiplier (0–1) applied to most canvas drawing operations. */
  editorAlpha: number
  /** When `true`, the render loop continues but skips drawing frames. */
  pauseRendering: boolean
  /** When `true`, fills the background with `clearBackgroundColor` before drawing. */
  clearBackground: boolean
  /** CSS colour used when `clearBackground` is enabled. */
  clearBackgroundColor: string
  /** When `true`, only selected nodes are fully rendered; others may be simplified. */
  renderOnlySelected: boolean
  /** When `true`, renders debug info (FPS, node count) in the corner of the canvas. */
  showInfo: boolean
  /** When `true`, allows panning the canvas by dragging empty space. */
  allowDragCanvas: boolean
  /** When `true`, allows dragging nodes with the pointer. */
  allowDragNodes: boolean
  /** When `true`, enables widget interaction, collapse buttons, and other node UI. */
  allowInteraction: boolean
  /** When `true`, clicking items toggles selection without requiring modifier keys. */
  multiSelect: boolean
  /** When `true`, selecting a group also selects its child nodes, reroutes, and nested groups. */
  groupSelectChildren: boolean
  /** When `true`, enables the node search box for adding nodes. */
  allowSearchbox: boolean
  /** When `true`, allows dragging existing links to new slots without recreating them. */
  allowReconnectLinks: boolean
  /** When `true`, snaps moved items to the graph grid on release. */
  alignToGrid: boolean
  /** When `true`, enables click-drag rectangle selection of multiple items. */
  dragMode: boolean
  /** The current marquee-selection rectangle in graph coordinates, or `null` if not selecting. */
  draggingRectangle: Rect | null
  /** Optional node-type filter applied when showing add-node menus. */
  filter?: string | null
  /** When `true`, marks the canvas dirty on most mouse events (except move). */
  setCanvasDirtyOnMouseEvent: boolean
  /** When `true`, redraws the background canvas every frame regardless of dirty flags. */
  alwaysRenderBackground: boolean
  /** When `true`, renders drop shadows on nodes and groups. */
  renderShadows: boolean
  /** When `true`, draws a border around the canvas viewport. */
  renderCanvasBorder: boolean
  /** When `true`, renders shadows under link segments (CPU-intensive). */
  renderConnectionsShadows: boolean
  /** When `true`, draws an outline around link segments. */
  renderConnectionsBorder: boolean
  /** When `true`, renders links as curved splines instead of straight segments. */
  renderCurvedConnections: boolean
  /** When `true`, draws directional arrows on links. */
  renderConnectionArrows: boolean
  /** When `true`, renders slot indicators on collapsed nodes. */
  renderCollapsedSlots: boolean
  /** When `true`, overlays execution order numbers on nodes. */
  renderExecutionOrder: boolean
  /** When `true`, shows a tooltip when hovering over link midpoints. */
  renderLinkTooltip: boolean

  /** Shape of the markers shown at the midpoint of links.  Default: Circle */
  linkMarkerShape: LinkMarkerShape = LinkMarkerShape.Circle
  /** Controls link rendering style. See `LinkRenderType` constants. */
  linksRenderMode: number

  /** Pointer position in canvas pixel coordinates, where `(0, 0)` is the top-left of the canvas element. */
  readonly mouse: Point
  /** Pointer position in graph coordinates, where `(0, 0)` is the top-left of the visible graph area. */
  readonly graphMouse: Point
  /** @deprecated LEGACY: REMOVE THIS, USE `graphMouse` INSTEAD */
  canvasMouse: Point
  /** Callback to customise the node search box UI as the user types. */
  onSearchBox?: (
    helper: HTMLDivElement,
    str: string,
    canvas: LGraphCanvas,
  ) => string[] | undefined

  /** Callback invoked when the user selects an entry from the node search box. */
  onSearchBoxSelection?: (
    name: string,
    event: MouseEvent,
    canvas: LGraphCanvas,
  ) => void

  /**
   * Global pointer event hook invoked during mouse move processing.
   * Return `true` to consume the event and prevent default canvas handling.
   */
  onMouse?: (e: CanvasPointerEvent) => boolean
  /**
   * Called to render custom content behind nodes and links (affected by pan/zoom transform).
   * @param ctx The 2D rendering context.
   * @param visibleArea The visible graph rectangle `[x, y, width, height]`.
   */
  onDrawBackground?: (
    ctx: CanvasRenderingContext2D,
    visibleArea: Rectangle,
  ) => void

  /**
   * Called to render custom content above nodes and links (affected by pan/zoom transform).
   * @param ctx The 2D rendering context.
   * @param visibleArea The visible graph rectangle `[x, y, width, height]`.
   */
  onDrawForeground?: (
    ctx: CanvasRenderingContext2D,
    visibleArea: Rectangle,
  ) => void

  /** Stroke width in pixels for rendered link segments. */
  connectionsWidth: number
  /** The current node being drawn by `drawNode`.  This should NOT be used to determine the currently selected node.  See `selectedItems` */
  currentNode: LGraphNode | null
  /** Transient state while a widget is being interacted with: `[node, widget]`, or `null`. */
  nodeWidget?: [LGraphNode, IBaseWidget] | null
  /** Link segment currently under the pointer, used for tooltip rendering. */
  overLinkCenter?: LinkSegment
  /** Last known pointer position in canvas pixel coordinates. */
  lastMousePosition: Point
  /** The visible area of this canvas.  Tightly coupled with `ds`. */
  visibleArea: Rectangle
  /** Contains all links and reroutes that were rendered.  Repopulated every render cycle. */
  renderedPaths: Set<LinkSegment> = new Set()
  /** @deprecated Replaced by `renderedPaths`, but length is set to 0 by some extensions. */
  visibleLinks: LLink[] = []
  /** @deprecated This array is populated and cleared to support legacy extensions. The contents are ignored by Litegraph. */
  connectingLinks: ConnectingLink[] | null
  /** Manages in-progress link drag operations and floating link state during pointer interaction. */
  linkConnector = new LinkConnector(links => this.connectingLinks = links)
  /** The viewport of this canvas.  Tightly coupled with `ds`. */
  readonly viewport?: Rect
  /** When `true`, resizes the canvas to match its parent element dimensions. */
  autoresize: boolean
  /** Incremented each render frame; used for animation timing. */
  frame = 0
  /** Timestamp (ms) of the last completed draw call. */
  lastDrawTime = 0
  /** Duration (ms) of the most recent draw call. */
  renderTime = 0
  /** Smoothed frames-per-second estimate updated each render frame. */
  fps = 0
  /** @deprecated See `LGraphCanvas.selectedItems` */
  selectedNodes: Dictionary<LGraphNode> = {}
  /** All selected nodes, groups, and reroutes */
  selectedItems: Set<Positionable> = new Set()
  /** The group currently being resized. */
  resizingGroup: LGraphGroup | null = null
  /** @deprecated See `LGraphCanvas.selectedItems` */
  selectedGroup: LGraphGroup | null = null
  /** The nodes that are currently visible on the canvas. */
  visibleNodes: LGraphNode[] = []
  /** The node currently under the pointer, if any. Cleared on pointer leave. */
  nodeOver?: LGraphNode
  /** Node that has captured keyboard/pointer input for widget editing, if any. */
  nodeCapturingInput?: LGraphNode | null
  /** Map of link IDs that should be rendered in a highlighted state (e.g. when their endpoint node is selected). */
  highlightedLinks: Dictionary<boolean> = {}

  /** When `true`, the foreground canvas needs to be redrawn on the next frame. */
  dirtyCanvas: boolean = true
  /** When `true`, the background canvas needs to be redrawn on the next frame. */
  dirtyBgCanvas: boolean = true
  /** A map of nodes that require selective redraw on the next frame. */
  dirtyNodes = new Map<NodeId, LGraphNode>()
  /** Sub-rectangle of the canvas that needs repainting, or `null` for a full redraw. */
  dirtyArea?: Rect | null
  /** @deprecated Unused */
  nodeInPanel?: LGraphNode | null
  /** Last pointer position in graph coordinates `[x, y]`. */
  lastMouse: ReadOnlyPoint = [0, 0]
  /** Timestamp (ms) of the last mouse click, used for double-click detection. */
  lastMouseClick: number = 0
  /** The `LGraph` or `Subgraph` currently displayed and edited by this canvas. */
  graph: LGraph | Subgraph | null

  /** The primary HTML canvas element used for foreground rendering and event dispatch. */
  canvas: HTMLCanvasElement & ICustomEventTarget<LGraphCanvasEventMap>
  /** Off-screen canvas used for background rendering (links, groups, grid). */
  bgcanvas: HTMLCanvasElement
  /** 2D rendering context for the primary `canvas`. */
  ctx: CanvasRenderingContext2D
  /** 2D rendering context for the off-screen `bgcanvas`. */
  bgctx?: CanvasRenderingContext2D | null
  /** Whether the requestAnimationFrame render loop is currently active. */
  isRendering?: boolean
  /** @deprecated Panels */
  lastClickPosition?: Point | null
  /** Node currently being resized via its corner handles, if any. */
  resizingNode?: LGraphNode | null
  /** @deprecated See `LGraphCanvas.resizingGroup` */
  selectedGroupResizing?: boolean
  /** @deprecated See `pointer`.`CanvasPointer.dragStarted dragStarted` */
  lastMouseDragging?: boolean
  /** Optional hook called at the start of pointer-down processing, before default handling. */
  onMouseDown?: (arg0: CanvasPointerEvent) => void
  // TODO: Check if panels are used
  /** @deprecated Panels */
  nodePanel?: Panel
  /** @deprecated Panels */
  optionsPanel?: Panel
  // TODO: This looks like another panel thing
  /** Active prompt dialog element, if a `prompt` is open. */
  promptBox?: PromptDialog | null
  /** Active node search box DOM element, if `showSearchBox` is open. */
  searchBox?: HTMLDivElement
  /** @deprecated Panels */
  SELECTED_NODE?: LGraphNode
  /** @deprecated Panels */
  NODEPANEL_IS_OPEN?: boolean
  /** Called when `clear` resets canvas state. */
  onClear?: () => void
  /**
   * Called after moving a node
   * @deprecated Does not handle multi-node move, and can return the wrong node.
   */
  onNodeMoved?: (nodeDragged: LGraphNode | undefined) => void
  /** @deprecated Called with the deprecated `selectedNodes` when the selection changes. Replacement not yet impl. */
  onSelectionChange?: (selected: Dictionary<Positionable>) => void
  /**
   * Called when rendering a link tooltip. Return `true` to suppress the default tooltip.
   * @param ctx The 2D rendering context.
   * @param link The link under the pointer, or `null`.
   * @param canvas This canvas instance.
   */
  onDrawLinkTooltip?: (
    ctx: CanvasRenderingContext2D,
    link: LLink | null,
    canvas?: LGraphCanvas,
  ) => boolean

  /** Called to render GUI overlays in screen space (not affected by pan/zoom). */
  onDrawOverlay?: (ctx: CanvasRenderingContext2D) => void
  /**
   * Called before the default background is drawn. Return `true` to skip default background rendering.
   * @param canvas The primary canvas element.
   * @param ctx The 2D rendering context.
   */
  onRenderBackground?: (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) => boolean

  /** Called when the user double-clicks a node. */
  onNodeDblClicked?: (n: LGraphNode) => void
  /** Called when a node panel should be shown (double-click or context menu). */
  onShowNodePanel?: (n: LGraphNode) => void
  /** Called when a node is added to the selection. */
  onNodeSelected?: (node: LGraphNode) => void
  /** Called when a node is removed from the selection. */
  onNodeDeselected?: (node: LGraphNode) => void
  /**
   * Called at the end of each render frame, after all default drawing.
   * @param canvas The primary canvas element.
   * @param ctx The 2D rendering context.
   */
  onRender?: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void

  /**
   * Creates a new instance of LGraphCanvas.
   * @param canvas The canvas HTML element (or its id) to use, or null / undefined to leave blank.
   * @param graph The graph that owns this canvas.
   * @param options Optional constructor flags (viewport, skipEvents, skipRender, autoresize).
   */
  constructor(
    canvas: HTMLCanvasElement,
    graph: LGraph,
    options?: LGraphCanvas["options"],
  ) {
    options ||= {}
    this.options = options

    // if(graph === undefined)
    // throw ("No graph assigned");
    this.backgroundImage = LGraphCanvas.DEFAULT_BACKGROUND_IMAGE

    this.ds = new DragAndScale(canvas)
    this.pointer = new CanvasPointer(canvas)

    // Set up zoom change handler for efficient LOD updates
    this.ds.onChanged = (scale: number, _offset: Point) => {
      // Only check LOD threshold if it's enabled
      if (this.#lowQualityZoomThreshold > 0) {
        this.#isLowQuality = scale < this.#lowQualityZoomThreshold
      }
    }

    this.linkConnector.events.addEventListener("link-created", () => this.#dirty())

    // @deprecated Workaround: Keep until connectingLinks is removed.
    this.linkConnector.events.addEventListener("reset", () => {
      if (this.state.ghostNodeId == null) {
        this.autoPan?.stop()
        this.autoPan = null
      }
      this.connectingLinks = null
      this.dirtyBgCanvas = true
    })

    // Dropped a link on the canvas
    this.linkConnector.events.addEventListener("dropped-on-canvas", (customEvent) => {
      if (!this.connectingLinks) return

      const e = customEvent.detail
      this.emitEvent({
        subType: "empty-release",
        originalEvent: e,
        linkReleaseContext: { links: this.connectingLinks },
      })

      const firstLink = this.linkConnector.renderLinks[0]

      // No longer in use
      // add menu when releasing link in empty space
      if (LiteGraph.releaseLinkOnEmptyShowsMenu) {
        const linkReleaseContext = this.linkConnector.state.connectingTo === "input"
          ? {
            nodeFrom: firstLink.node as LGraphNode,
            slotFrom: firstLink.fromSlot as INodeOutputSlot,
            typeFilterIn: firstLink.fromSlot.type,
          }
          : {
            nodeTo: firstLink.node as LGraphNode,
            slotTo: firstLink.fromSlot as INodeInputSlot,
            typeFilterOut: firstLink.fromSlot.type,
          }

        const afterRerouteId = firstLink.fromReroute?.id

        if ("shiftKey" in e && e.shiftKey) {
          if (this.allowSearchbox) {
            this.showSearchbox(e as unknown as MouseEvent, linkReleaseContext as IShowSearchOptions)
          }
        } else if (this.linkConnector.state.connectingTo === "input") {
          this.showConnectionMenu({ nodeFrom: firstLink.node as LGraphNode, slotFrom: firstLink.fromSlot as INodeOutputSlot, e, afterRerouteId })
        } else {
          this.showConnectionMenu({ nodeTo: firstLink.node as LGraphNode, slotTo: firstLink.fromSlot as INodeInputSlot, e, afterRerouteId })
        }
      }
    })

    // otherwise it generates ugly patterns when scaling down too much
    this.zoomModifyAlpha = true
    // in range (1.01, 2.5). Less than 1 will invert the zoom direction
    this.zoomSpeed = 1.1
    this.autoPanSpeed = 15

    this.nodeTitleColor = LiteGraph.NODE_TITLE_COLOR
    this.defaultLinkColor = LiteGraph.LINK_COLOR
    this.defaultConnectionColor = {
      inputOff: "#778",
      inputOn: "#7F7",
      outputOff: "#778",
      outputOn: "#7F7",
    }
    this.defaultConnectionColorByType = {
      /* number: "#7F7",
            string: "#77F",
            boolean: "#F77", */
    }
    this.defaultconnectionColorByTypeOff = {
      /* number: "#474",
            string: "#447",
            boolean: "#744", */
    }

    this.highqualityRender = true
    // set to true to render titlebar with gradients
    this.useGradients = false
    // used for transition
    this.editorAlpha = 1
    this.pauseRendering = false
    this.clearBackground = true
    this.clearBackgroundColor = "#222"

    this.renderOnlySelected = true
    this.showInfo = true
    this.allowDragCanvas = true
    this.allowDragNodes = true
    // allow to control widgets, buttons, collapse, etc
    this.allowInteraction = true
    // allow selecting multi nodes without pressing extra keys
    this.multiSelect = false
    this.groupSelectChildren = false
    this.allowSearchbox = true
    // allows to change a connection with having to redo it again
    this.allowReconnectLinks = true
    // snap to grid
    this.alignToGrid = false

    this.dragMode = false
    this.draggingRectangle = null

    // allows to filter to only accept some type of nodes in a graph
    this.filter = null

    // forces to redraw the canvas on mouse events (except move)
    this.setCanvasDirtyOnMouseEvent = true
    this.alwaysRenderBackground = false
    this.renderShadows = true
    this.renderCanvasBorder = true
    // too much CPU
    this.renderConnectionsShadows = false
    this.renderConnectionsBorder = true
    this.renderCurvedConnections = false
    this.renderConnectionArrows = false
    this.renderCollapsedSlots = true
    this.renderExecutionOrder = false
    this.renderLinkTooltip = true

    this.linksRenderMode = LinkRenderType.SPLINE_LINK

    this.mouse = [0, 0]
    this.graphMouse = [0, 0]
    this.canvasMouse = this.graphMouse

    this.connectionsWidth = 3

    this.currentNode = null
    this.nodeWidget = null
    this.lastMousePosition = [0, 0]
    this.visibleArea = this.ds.visibleArea
    // Explicitly null-checked
    this.connectingLinks = null

    // to constraint render area to a portion of the canvas
    this.viewport = options.viewport

    // link canvas and graph
    this.graph = graph
    graph?.attachCanvas(this)

    // TypeScript strict workaround: cannot use method to initialize properties.
    this.canvas = undefined!
    this.bgcanvas = undefined!
    this.ctx = undefined!

    this.setCanvas(canvas, options.skipEvents)
    this.clear()

    LGraphCanvas.measureText = (text: string, fontStyle = this.innerTextFont) => {
      const { ctx } = this
      const { font } = ctx
      try {
        ctx.font = fontStyle
        return ctx.measureText(text).width
      } finally {
        ctx.font = font
      }
    }

    if (!options.skipRender) {
      this.startRendering()
    }

    this.autoresize = options.autoresize ?? false

    this.#updateLowQualityThreshold()
  }

  /** Context-menu callback that creates a new `LGraphGroup` at the pointer position. */
  static onGroupAdd(_info: unknown, _entry: unknown, mouseEvent: MouseEvent): void {
    const canvas = LGraphCanvas.activeCanvas

    const group = new LiteGraph.LGraphGroup()
    group.pos = canvas.convertEventToCanvasOffset(mouseEvent)
    if (!canvas.graph) throw new NullGraphError()
    canvas.graph.add(group)
  }

  /**
   * @deprecated Functionality moved to `getBoundaryNodes`.  The new function returns null on failure, instead of an object with all null properties.
   * Determines the furthest nodes in each direction
   * @param nodes the nodes to from which boundary nodes will be extracted
   * @returns
   */
  static getBoundaryNodes(
    nodes: LGraphNode[] | Dictionary<LGraphNode>,
  ): NullableProperties<IBoundaryNodes> {
    const resultNodes = Array.isArray(nodes) ? nodes : Object.values(nodes)
    return (
      getBoundaryNodes(resultNodes) ?? {
        top: null,
        right: null,
        bottom: null,
        left: null,
      }
    )
  }

  /**
   * @deprecated Functionality moved to `alignNodes`.  The new function does not set dirty canvas.
   * @param nodes a list of nodes
   * @param direction Direction to align the nodes
   * @param alignTo Node to align to (if null, align to the furthest node in the given direction)
   */
  static alignNodes(
    nodes: Dictionary<LGraphNode>,
    direction: Direction,
    alignTo?: LGraphNode,
  ): void {
    alignNodes(Object.values(nodes), direction, alignTo)
    LGraphCanvas.activeCanvas.setDirty(true, true)
  }

  /** Context-menu callback that opens a submenu to align selected nodes relative to a reference node. */
  static onNodeAlign(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    event: MouseEvent,
    prevMenu: ContextMenu<string>,
    node: LGraphNode,
  ): void {
    new LiteGraph.ContextMenu(["Top", "Bottom", "Left", "Right"], {
      event,
      callback: innerClicked,
      parentMenu: prevMenu,
    })

    function innerClicked(value: string) {
      alignNodes(
        Object.values(LGraphCanvas.activeCanvas.selectedNodes),
        value.toLowerCase() as Direction,
        node,
      )
      LGraphCanvas.activeCanvas.setDirty(true, true)
    }
  }

  /** Context-menu callback that opens a submenu to align the current selection. */
  static onGroupAlign(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    event: MouseEvent,
    prevMenu: ContextMenu<string>,
  ): void {
    new LiteGraph.ContextMenu(["Top", "Bottom", "Left", "Right"], {
      event,
      callback: innerClicked,
      parentMenu: prevMenu,
    })

    function innerClicked(value: string) {
      alignNodes(
        Object.values(LGraphCanvas.activeCanvas.selectedNodes),
        value.toLowerCase() as Direction,
      )
      LGraphCanvas.activeCanvas.setDirty(true, true)
    }
  }

  /** Context-menu callback that opens a submenu to distribute selected nodes evenly. */
  static createDistributeMenu(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    event: MouseEvent,
    prevMenu: ContextMenu<string>,
  ): void {
    new LiteGraph.ContextMenu(["Vertically", "Horizontally"], {
      event,
      callback: innerClicked,
      parentMenu: prevMenu,
    })

    function innerClicked(value: string) {
      const canvas = LGraphCanvas.activeCanvas
      distributeNodes(Object.values(canvas.selectedNodes), value === "Horizontally")
      canvas.setDirty(true, true)
    }
  }

  /**
   * Context-menu callback that opens the hierarchical "Add Node" menu.
   * Creates a node at the pointer position when an entry is selected.
   */
  static onMenuAdd(
    _value: unknown,
    _options: unknown,
    e: MouseEvent,
    prevMenu?: ContextMenu<string>,
    callback?: (node: LGraphNode | null) => void,
  ): boolean | undefined {
    const canvas = LGraphCanvas.activeCanvas
    const refWindow = canvas.getCanvasWindow()
    const { graph } = canvas
    if (!graph) return

    innerOnMenuAdded("", prevMenu)
    return false

    type AddNodeMenu = Omit<IContextMenuValue<string>, "callback"> & {
      callback: (
        value: { value: string },
        event: Event,
        mouseEvent: MouseEvent,
        contextMenu: ContextMenu<string>,
      ) => void
    }

    function innerOnMenuAdded(baseCategory: string, prevMenu?: ContextMenu<string>): void {
      if (!graph) return

      const categories = LiteGraph
        .getNodeTypesCategories(canvas.filter || graph.filter)
        .filter(category => category.startsWith(baseCategory))
      const entries: AddNodeMenu[] = []

      for (const category of categories) {
        if (!category) continue

        const baseCategoryRegex = new RegExp(`^(${baseCategory})`)
        const categoryName = category
          .replace(baseCategoryRegex, "")
          .split("/", 1)[0]
        const categoryPath =
          baseCategory === ""
            ? `${categoryName}/`
            : `${baseCategory}${categoryName}/`

        let name = categoryName
        // in case it has a namespace like "shader::math/rand" it hides the namespace
        if (name.includes("::")) name = name.split("::", 2)[1]

        const index = entries.findIndex(entry => entry.value === categoryPath)
        if (index === -1) {
          entries.push({
            value: categoryPath,
            content: name,
            hasSubmenu: true,
            callback: function (value, _event, _mouseEvent, contextMenu) {
              innerOnMenuAdded(value.value, contextMenu)
            },
          })
        }
      }

      const nodes = LiteGraph.getNodeTypesInCategory(
        baseCategory.slice(0, -1),
        canvas.filter || graph.filter,
      )

      for (const node of nodes) {
        if (node.skipList) continue

        const entry: AddNodeMenu = {
          value: node.type,
          content: node.title,
          hasSubmenu: false,
          callback: function (value, _event, _mouseEvent, contextMenu) {
            if (!canvas.graph) throw new NullGraphError()

            const firstEvent = contextMenu.getFirstEvent()
            canvas.graph.beforeChange()
            const node = LiteGraph.createNode(value.value)
            if (node) {
              if (!firstEvent) throw new TypeError("Context menu event was null. This should not occur in normal usage.")
              node.pos = canvas.convertEventToCanvasOffset(firstEvent)
              canvas.graph.add(node)
            } else {
              console.warn("Failed to create node of type:", value.value)
            }

            callback?.(node)
            canvas.graph.afterChange()
          },
        }

        entries.push(entry)
      }

      // @ts-expect-error Remove param refWindow - unused
      new LiteGraph.ContextMenu(entries, { event: e, parentMenu: prevMenu }, refWindow)
    }
  }

  /** Context-menu stub for collapsing all nodes. Currently a no-op placeholder. */
  static onMenuCollapseAll() {}
  /** Context-menu stub for node editing. Currently a no-op placeholder. */
  static onMenuNodeEdit() {}

  /** @param _options Parameter is never used */
  static showMenuNodeOptionalOutputs(
    _v: unknown,
    /** Unused - immediately overwritten */
    _options: INodeOutputSlot[],
    e: MouseEvent,
    prevMenu: ContextMenu<INodeSlotContextItem>,
    node: LGraphNode,
  ): boolean | undefined {
    if (!node) return

    const canvas = LGraphCanvas.activeCanvas

    let entries: (IContextMenuValue<INodeSlotContextItem> | null)[] = []

    if (LiteGraph.doAddTriggersSlots && node.findOutputSlot("onExecuted") == -1) {
      entries.push({ content: "On Executed", value: ["onExecuted", LiteGraph.EVENT, { nameLocked: true }], className: "event" })
    }
    // add callback for modifing the menu elements onMenuNodeOutputs
    const retEntries = node.onMenuNodeOutputs?.(entries)
    if (retEntries) entries = retEntries

    if (!entries.length) return

    new LiteGraph.ContextMenu<INodeSlotContextItem>(
      entries,
      {
        event: e,
        callback: innerClicked,
        parentMenu: prevMenu,
        node,
      },
    )

    function innerClicked(
      this: ContextMenuDivElement<INodeSlotContextItem>,
      v?: string | IContextMenuValue<INodeSlotContextItem>,
      _options?: unknown,
      e?: MouseEvent,
      prev?: ContextMenu<INodeSlotContextItem>,
    ) {
      if (!node) return
      if (!v || typeof v === "string") return

      // TODO: This is a static method, so the below "that" appears broken.
      if (v.callback) v.callback.call(this, node, v, e, prev)

      if (!v.value) return

      const value = v.value[1]

      if (value &&
        (typeof value === "object" || Array.isArray(value))) {
        // submenu why?
        const entries = []
        for (const i in value) {
          entries.push({ content: i, value: value[i] })
        }
        new LiteGraph.ContextMenu(entries, {
          event: e,
          callback: innerClicked,
          parentMenu: prevMenu,
          node,
        })
        return false
      }

      const { graph } = node
      if (!graph) throw new NullGraphError()

      graph.beforeChange()
      node.addOutput(v.value[0], v.value[1], v.value[2])

      // a callback to the node when adding a slot
      node.onNodeOutputAdd?.(v.value)
      canvas.setDirty(true, true)
      graph.afterChange()
    }

    return false
  }

  /** @param value Parameter is never used */
  static onShowMenuNodeProperties(
    value: NodeProperty | undefined,
    _options: unknown,
    e: MouseEvent,
    prevMenu: ContextMenu<string>,
    node: LGraphNode,
  ): boolean | undefined {
    if (!node || !node.properties) return

    const canvas = LGraphCanvas.activeCanvas
    const refWindow = canvas.getCanvasWindow()

    const entries: IContextMenuValue<string>[] = []
    for (const i in node.properties) {
      value = node.properties[i] !== undefined ? node.properties[i] : " "
      if (typeof value == "object")
        value = JSON.stringify(value)
      const info = node.getPropertyInfo(i)
      if (info.type == "enum" || info.type == "combo")
        value = LGraphCanvas.getPropertyPrintableValue(value, info.values)

      // value could contain invalid HTML characters, clean that
      value = DOMPurify.sanitize(stringOrEmpty(value))
      entries.push({
        content:
         `<span class='property-name'>${info.label || i}</span>` +
         `<span class='property-value'>${value}</span>`,
        value: i,
      })
    }
    if (!entries.length) {
      return
    }

    new LiteGraph.ContextMenu<string>(
      entries,
      {
        event: e,
        callback: innerClicked,
        parentMenu: prevMenu,
        allowHtml: true,
        node,
      },
      // @ts-expect-error Unused
      refWindow,
    )

    function innerClicked(this: ContextMenuDivElement, v: { value: any }) {
      if (!node) return

      const rect = this.getBoundingClientRect()
      canvas.showEditPropertyValue(node, v.value, {
        position: [rect.left, rect.top],
      })
    }

    return false
  }

  /** @deprecated */
  static decodeHTML(str: string): string {
    return DOMPurify.sanitize(str)
  }

  /** Context-menu callback that resets a node's size to its computed default. */
  static onMenuResizeNode(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    _e: MouseEvent,
    _menu: ContextMenu,
    node: LGraphNode,
  ): void {
    if (!node) return

    const fApplyMultiNode = function (node: LGraphNode) {
      node.setSize(node.computeSize())
    }

    const canvas = LGraphCanvas.activeCanvas
    if (!canvas.selectedNodes || Object.keys(canvas.selectedNodes).length <= 1) {
      fApplyMultiNode(node)
    } else {
      for (const i in canvas.selectedNodes) {
        fApplyMultiNode(canvas.selectedNodes[i])
      }
    }

    canvas.setDirty(true, true)
  }

  // TODO refactor :: this is used fot title but not for properties!
  /** Context-menu callback that opens an inline editor for a node property value. */
  static onShowPropertyEditor(
    item: { property: keyof LGraphNode, type: string },
    _options: IContextMenuOptions<string>,
    e: MouseEvent,
    _menu: ContextMenu<string>,
    node: LGraphNode,
  ): void {
    const property = item.property || "title"
    const value = node[property]

    const title = document.createElement("span")
    title.className = "name"
    title.textContent = property

    const input = document.createElement("input")
    Object.assign(input, { type: "text", className: "value", autofocus: true })

    const button = document.createElement("button")
    button.textContent = "OK"

    // TODO refactor :: use createDialog ?
    const dialog = Object.assign(document.createElement("div"), {
      isModified: false,
      className: "graphdialog",
      close: () => dialog.remove(),
    })
    dialog.append(title, input, button)

    input.value = String(value)
    input.addEventListener("blur", function () {
      this.focus()
    })
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      dialog.isModified = true
      if (e.key == "Escape") {
        // ESC
        dialog.close()
      } else if (e.key == "Enter") {
        // save
        inner()
      } else if (!e.target || !("localName" in e.target) || e.target.localName != "textarea") {
        return
      }
      e.preventDefault()
      e.stopPropagation()
    })

    const canvas = LGraphCanvas.activeCanvas
    const canvasEl = canvas.canvas

    const rect = canvasEl.getBoundingClientRect()
    const offsetx = rect ? -20 - rect.left : -20
    const offsety = rect ? -20 - rect.top : -20

    if (e) {
      dialog.style.left = `${e.clientX + offsetx}px`
      dialog.style.top = `${e.clientY + offsety}px`
    } else {
      dialog.style.left = `${canvasEl.width * 0.5 + offsetx}px`
      dialog.style.top = `${canvasEl.height * 0.5 + offsety}px`
    }

    button.addEventListener("click", inner)

    if (canvasEl.parentNode == null) throw new TypeError("canvasEl.parentNode was null")
    canvasEl.parentNode.append(dialog)

    input.focus()

    let dialogCloseTimer: ReturnType<typeof setTimeout>
    dialog.addEventListener("mouseleave", function () {
      if (LiteGraph.dialogCloseOnMouseLeave) {
        if (!dialog.isModified && LiteGraph.dialogCloseOnMouseLeave) {
          dialogCloseTimer = setTimeout(
            dialog.close,
            LiteGraph.dialogCloseOnMouseLeaveDelay,
          )
        }
      }
    })
    dialog.addEventListener("mouseenter", function () {
      if (LiteGraph.dialogCloseOnMouseLeave) {
        if (dialogCloseTimer) clearTimeout(dialogCloseTimer)
      }
    })

    function inner() {
      if (input) setValue(input.value)
    }

    function setValue(value: NodeProperty) {
      if (item.type == "Number") {
        value = Number(value)
      } else if (item.type == "Boolean") {
        value = Boolean(value)
      }
      // @ts-expect-error Requires refactor.
      node[property] = value
      dialog.remove()
      canvas.setDirty(true, true)
    }
  }

  static getPropertyPrintableValue(value: unknown, values: unknown[] | object | undefined): string | undefined {
    if (!values) return String(value)

    if (Array.isArray(values)) {
      return String(value)
    }

    if (typeof values === "object") {
      let descValue = ""
      for (const k in values) {
        // @ts-expect-error deprecated #578
        if (values[k] != value) continue

        descValue = k
        break
      }
      return `${String(value)} (${descValue})`
    }
  }

  /**
   * Updates a properties-panel row to reflect the node's current property value.
   * Used after `setProperty` when clamping or `onPropertyChanged` may alter the stored value.
   */
  static syncPanelPropertyWidget(panel: Panel, name: string, value: TWidgetValue): void {
    const widgets = panel.content.querySelectorAll(":scope [data-property]") as NodeListOf<PanelWidget>
    let elem: PanelWidget | undefined
    for (const widget of widgets) {
      if (widget.dataset["property"] === name) {
        elem = widget
        break
      }
    }
    if (!elem) return

    const valueElement = elem.querySelector(":scope .property-value")
    if (!valueElement) return

    const type = (elem.dataset["type"] || elem.options?.type || "string").toLowerCase()
    elem.value = value

    if (type === "boolean") {
      elem.classList.toggle("bool-on", !!value)
      valueElement.textContent = value ? "true" : "false"
      return
    }

    if (type === "enum" || type === "combo") {
      valueElement.textContent = LGraphCanvas.getPropertyPrintableValue(value, elem.options?.values) ?? ""
      return
    }

    if (type === "number" && typeof value === "number") {
      valueElement.textContent = value.toFixed(3)
      return
    }

    valueElement.textContent = String(value ?? "")
  }

  /** Context-menu callback that toggles a node's collapsed state. */
  static onMenuNodeCollapse(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    _e: MouseEvent,
    _menu: ContextMenu,
    node: LGraphNode,
  ): void {
    if (!node.graph) throw new NullGraphError()

    node.graph.beforeChange()

    const fApplyMultiNode = function (node: LGraphNode) {
      node.collapse()
    }

    const graphcanvas = LGraphCanvas.activeCanvas
    if (!graphcanvas.selectedNodes || Object.keys(graphcanvas.selectedNodes).length <= 1) {
      fApplyMultiNode(node)
    } else {
      for (const i in graphcanvas.selectedNodes) {
        fApplyMultiNode(graphcanvas.selectedNodes[i])
      }
    }

    node.graph.afterChange()
  }

  /** Context-menu callback that toggles a node's advanced-widget visibility. */
  static onMenuToggleAdvanced(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    _e: MouseEvent,
    _menu: ContextMenu,
    node: LGraphNode,
  ): void {
    if (!node.graph) throw new NullGraphError()

    node.graph.beforeChange()
    const fApplyMultiNode = function (node: LGraphNode) {
      node.toggleAdvanced()
    }

    const graphcanvas = LGraphCanvas.activeCanvas
    if (!graphcanvas.selectedNodes || Object.keys(graphcanvas.selectedNodes).length <= 1) {
      fApplyMultiNode(node)
    } else {
      for (const i in graphcanvas.selectedNodes) {
        fApplyMultiNode(graphcanvas.selectedNodes[i])
      }
    }
    node.graph.afterChange()
  }

  /** Context-menu callback that opens a submenu to change a node's execution mode. */
  static onMenuNodeMode(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    e: MouseEvent,
    menu: ContextMenu,
    node: LGraphNode,
  ): boolean {
    new LiteGraph.ContextMenu(
      LiteGraph.NODE_MODES,
      { event: e, callback: innerClicked, parentMenu: menu, node },
    )

    function innerClicked(v: string) {
      if (!node) return

      const kV = Object.values(LiteGraph.NODE_MODES).indexOf(v)
      const fApplyMultiNode = function (node: LGraphNode) {
        if (kV !== -1 && LiteGraph.NODE_MODES[kV] != undefined) {
          node.changeMode(kV)
        } else {
          console.warn(`unexpected mode: ${v}`)
          node.changeMode(LGraphEventMode.ALWAYS)
        }
      }

      const graphcanvas = LGraphCanvas.activeCanvas
      if (!graphcanvas.selectedNodes || Object.keys(graphcanvas.selectedNodes).length <= 1) {
        fApplyMultiNode(node)
      } else {
        for (const i in graphcanvas.selectedNodes) {
          fApplyMultiNode(graphcanvas.selectedNodes[i])
        }
      }
    }

    return false
  }

  /** @param value Parameter is never used */
  static onMenuNodeColors(
    value: IContextMenuValue<string | null>,
    _options: IContextMenuOptions,
    e: MouseEvent,
    menu: ContextMenu<string | null>,
    node: LGraphNode,
  ): boolean {
    if (!node) throw "no node for color"

    const values: IContextMenuValue<string | null, unknown, { value: string | null }>[] = [
      {
        value: null,
        content: "<span style='display: block; padding-left: 4px;'>No color</span>",
      },
    ]

    for (const i in LGraphCanvas.nodeColors) {
      const color = LGraphCanvas.nodeColors[i]
      value = {
        value: i,
        content: `<span style='display: block; color: #999; padding-left: 4px;` +
          ` border-left: 8px solid ${color.color}; background-color:${color.bgColor}'>${i}</span>`,
      }
      values.push(value)
    }
    new LiteGraph.ContextMenu<string | null>(values, {
      event: e,
      callback: innerClicked,
      parentMenu: menu,
      node,
    })

    function innerClicked(v: IContextMenuValue<string>) {
      if (!node) return

      const fApplyColor = function (item: IColorable) {
        const colorOption = v.value ? LGraphCanvas.nodeColors[v.value] : null
        item.setColorOption(colorOption)
      }

      const canvas = LGraphCanvas.activeCanvas
      if (!canvas.selectedNodes || Object.keys(canvas.selectedNodes).length <= 1) {
        fApplyColor(node)
      } else {
        for (const i in canvas.selectedNodes) {
          fApplyColor(canvas.selectedNodes[i])
        }
      }
      canvas.setDirty(true, true)
    }

    return false
  }

  /** Context-menu callback that opens a submenu to change a node's render shape. */
  static onMenuNodeShapes(
    _value: IContextMenuValue<typeof LiteGraph.VALID_SHAPES[number]>,
    _options: IContextMenuOptions<typeof LiteGraph.VALID_SHAPES[number]>,
    e: MouseEvent,
    menu?: ContextMenu<typeof LiteGraph.VALID_SHAPES[number]>,
    node?: LGraphNode,
  ): boolean {
    if (!node) throw "no node passed"

    new LiteGraph.ContextMenu<typeof LiteGraph.VALID_SHAPES[number]>(LiteGraph.VALID_SHAPES, {
      event: e,
      callback: innerClicked,
      parentMenu: menu,
      node,
    })

    function innerClicked(v: typeof LiteGraph.VALID_SHAPES[number]) {
      if (!node) return
      if (!node.graph) throw new NullGraphError()

      node.graph.beforeChange()

      const fApplyMultiNode = function (node: LGraphNode) {
        node.shape = v
      }

      const canvas = LGraphCanvas.activeCanvas
      if (!canvas.selectedNodes || Object.keys(canvas.selectedNodes).length <= 1) {
        fApplyMultiNode(node)
      } else {
        for (const i in canvas.selectedNodes) {
          fApplyMultiNode(canvas.selectedNodes[i])
        }
      }

      node.graph.afterChange()
      canvas.setDirty(true)
    }

    return false
  }

  static onMenuNodeRemove(): void {
    LGraphCanvas.activeCanvas.deleteSelected()
  }

  /** Context-menu callback that clones the active node (and multi-selection) with a small offset. */
  static onMenuNodeClone(
    _value: IContextMenuValue,
    _options: IContextMenuOptions,
    _e: MouseEvent,
    _menu: ContextMenu,
    node: LGraphNode,
  ): void {
    const canvas = LGraphCanvas.activeCanvas
    const nodes = canvas.selectedItems.size ? canvas.selectedItems : [node]

    let offsetX = Infinity
    let offsetY = Infinity
    for (const item of nodes) {
      if (item.pos == null)
        throw new TypeError("Invalid node encountered on clone. `pos` was null.")
      if (item.pos[0] < offsetX) offsetX = item.pos[0]
      if (item.pos[1] < offsetY) offsetY = item.pos[1]
    }

    canvas.#deserializeItems(canvas.#serializeItems(nodes), {
      position: [offsetX + 5, offsetY + 5],
    })
  }

  /**
   * Updates the low quality zoom threshold based on current settings.
   * Called when minFontSizeForLod or DPR changes.
   */
  #updateLowQualityThreshold(): void {
    if (this.#minFontSizeForLod === 0) {
      // LOD disabled
      this.#lowQualityZoomThreshold = 0
      this.#isLowQuality = false
      return
    }

    const baseFontSize = LiteGraph.NODE_TEXT_SIZE // 14px
    const dprAdjustment = Math.sqrt(window.devicePixelRatio || 1)

    // Calculate the zoom level where text becomes unreadable
    this.#lowQualityZoomThreshold =
      this.#minFontSizeForLod / (baseFontSize * dprAdjustment)

    // Update current state based on current zoom
    this.#isLowQuality = this.ds.scale < this.#lowQualityZoomThreshold
  }

  #updateCursorStyle() {
    if (!this.state.shouldSetCursor) return

    const crosshairItems =
      CanvasItem.Node |
      CanvasItem.RerouteSlot |
      CanvasItem.SubgraphIoNode |
      CanvasItem.SubgraphIoSlot

    let cursor = "default"
    if (this.state.draggingCanvas) {
      cursor = "grabbing"
    } else if (this.state.readOnly) {
      cursor = "grab"
    } else if (this.pointer.resizeDirection) {
      cursor = cursors[this.pointer.resizeDirection] ?? cursors.SE
    } else if (this.state.hoveringOver & crosshairItems) {
      cursor = "crosshair"
    } else if (this.state.hoveringOver & CanvasItem.Reroute) {
      cursor = "grab"
    }

    this.#setCursor(cursor)
  }

  /**
   * Finds the canvas if required, throwing on failure.
   * @param canvas Canvas element, or its element ID
   * @returns The canvas element
   * @throws If `canvas` is an element ID that does not belong to a valid HTML canvas element
   */
  #validateCanvas(
    canvas: string | HTMLCanvasElement,
  ): HTMLCanvasElement & { data?: LGraphCanvas } {
    if (typeof canvas === "string") {
      const el = document.getElementById(canvas)
      if (!(el instanceof HTMLCanvasElement)) throw "Error validating LiteGraph canvas: Canvas element not found"
      return el
    }
    return canvas
  }

  /** Marks the entire canvas as dirty. */
  #dirty(): void {
    this.dirtyCanvas = true
    this.dirtyBgCanvas = true
  }

  #linkConnectorDrop(): void {
    const { graph, linkConnector, pointer } = this
    if (!graph) throw new NullGraphError()

    pointer.onDragEnd = upEvent => linkConnector.dropLinks(graph, upEvent)
    pointer.finally = () => {
      this.autoPan?.stop()
      this.autoPan = null
      this.linkConnector.reset(true)
    }

    this.autoPan = new AutoPanController({
      canvas: this.canvas,
      ds: this.ds,
      maxPanSpeed: this.autoPanSpeed,
      onPan: () => {
        const rect = this.canvas.getBoundingClientRect()
        const { scale } = this.ds
        this.graphMouse[0] =
          (this.mouse[0] - rect.left) / scale - this.ds.offset[0]
        this.graphMouse[1] =
          (this.mouse[1] - rect.top) / scale - this.ds.offset[1]
        this.#dirty()
      },
    })
    this.autoPan.updatePointer(this.mouse[0], this.mouse[1])
    this.autoPan.start()
  }

  /**
   * Returns the first matching positionable item at the given co-ordinates.
   *
   * Order of preference:
   * - Subgraph IO Nodes
   * - Reroutes
   * - Group titlebars
   * @param x The x coordinate in canvas space
   * @param y The y coordinate in canvas space
   * @returns The positionable item or undefined
   */
  #getPositionableOnPos(x: number, y: number): Positionable | undefined {
    const ioNode = this.subgraph?.getIoNodeOnPos(x, y)
    if (ioNode) return ioNode

    for (const reroute of this.#visibleReroutes) {
      if (reroute.containsPoint([x, y])) return reroute
    }

    return this.graph?.getGroupTitlebarOnPos(x, y)
  }

  #processPrimaryButton(e: CanvasPointerEvent, node: LGraphNode | undefined) {
    const { pointer, graph, linkConnector, subgraph } = this
    if (!graph) throw new NullGraphError()

    const x = e.canvasX
    const y = e.canvasY

    // Modifiers
    const ctrlOrMeta = e.ctrlKey || e.metaKey

    // Multi-select drag rectangle
    if (ctrlOrMeta && !e.altKey && LiteGraph.canvasNavigationMode === "legacy") {
      this.#setupNodeSelectionDrag(e, pointer, node)

      return
    }

    if (this.readOnly) {
      pointer.finally = () => this.draggingCanvas = false
      this.draggingCanvas = true
      return
    }

    // clone node ALT dragging
    if (LiteGraph.altDragDoCloneNodes && e.altKey && !e.ctrlKey && node && this.allowInteraction) {
      const items = this.#deserializeItems(this.#serializeItems([node]), {
        position: node.pos,
      })
      const cloned = items?.created[0] as LGraphNode | undefined
      if (!cloned) return

      cloned.pos[0] += 5
      cloned.pos[1] += 5

      if (this.allowDragNodes) {
        pointer.onDragStart = (pointer) => {
          this.#startDraggingItems(cloned, pointer)
        }
        pointer.onDragEnd = e => this.#processDraggedItems(e)
      }
      return
    }

    // Node clicked
    if (node && (this.allowInteraction || node.flags.allowInteraction)) {
      this.#processNodeClick(e, ctrlOrMeta, node)
    } else {
      // Subgraph IO nodes
      if (subgraph) {
        const { inputNode, outputNode } = subgraph

        if (processSubgraphIONode(this, inputNode)) return
        if (processSubgraphIONode(this, outputNode)) return

        function processSubgraphIONode(canvas: LGraphCanvas, ioNode: SubgraphInputNode | SubgraphOutputNode) {
          if (!ioNode.containsPoint([x, y])) return false

          ioNode.onPointerDown(e, pointer, linkConnector)
          pointer.onClick ??= () => canvas.processSelect(ioNode, e)
          pointer.onDragStart ??= () => canvas.#startDraggingItems(ioNode, pointer, true)
          pointer.onDragEnd ??= eUp => canvas.#processDraggedItems(eUp)
          return true
        }
      }

      // Reroutes
      if (this.linksRenderMode !== LinkRenderType.HIDDEN_LINK) {
        for (const reroute of this.#visibleReroutes) {
          const overReroute = reroute.containsPoint([x, y])
          if (!reroute.isSlotHovered && !overReroute) continue

          if (overReroute) {
            pointer.onClick = () => this.processSelect(reroute, e)
            if (!e.shiftKey) {
              pointer.onDragStart = pointer => this.#startDraggingItems(reroute, pointer, true)
              pointer.onDragEnd = e => this.#processDraggedItems(e)
            }
          }

          if (reroute.isOutputHovered || (overReroute && e.shiftKey)) {
            linkConnector.dragFromReroute(graph, reroute)
            this.#linkConnectorDrop()
          }

          if (reroute.isInputHovered) {
            linkConnector.dragFromRerouteToOutput(graph, reroute)
            this.#linkConnectorDrop()
          }

          reroute.hideSlots()
          this.dirtyBgCanvas = true
          return
        }
      }

      // Links - paths of links & reroutes
      // Set the width of the line for isPointInStroke checks
      const { lineWidth } = this.ctx
      this.ctx.lineWidth = this.connectionsWidth + 7
      const dpi = Math.max(window?.devicePixelRatio ?? 1, 1)

      for (const linkSegment of this.renderedPaths) {
        const centre = linkSegment.pathCentre
        if (!centre) continue

        // If we shift click on a link then start a link from that input
        if (
          (e.shiftKey || e.altKey) &&
          linkSegment.path &&
          this.ctx.isPointInStroke(linkSegment.path, x * dpi, y * dpi)
        ) {
          this.ctx.lineWidth = lineWidth

          if (e.shiftKey && !e.altKey) {
            linkConnector.dragFromLinkSegment(graph, linkSegment)
            this.#linkConnectorDrop()

            return
          }
          if (e.altKey && !e.shiftKey) {
            const newReroute = graph.createReroute([x, y], linkSegment)
            pointer.onDragStart = pointer => this.#startDraggingItems(newReroute, pointer)
            pointer.onDragEnd = e => this.#processDraggedItems(e)
            return
          }
        } else if (isInRectangle(x, y, centre[0] - 4, centre[1] - 4, 8, 8)) {
          this.ctx.lineWidth = lineWidth

          pointer.onClick = () => this.showLinkMenu(linkSegment, e)
          pointer.onDragStart = () => this.draggingCanvas = true
          pointer.finally = () => this.draggingCanvas = false

          // clear tooltip
          this.overLinkCenter = undefined
          return
        }
      }

      // Restore line width
      this.ctx.lineWidth = lineWidth

      // Groups
      const group = graph.getGroupOnPos(x, y)
      this.selectedGroup = group ?? null
      if (group) {
        if (group.isInResize(x, y)) {
          // Resize group
          const b = group.boundingRect
          const offsetX = x - (b[0] + b[2])
          const offsetY = y - (b[1] + b[3])

          pointer.onDragStart = () => this.resizingGroup = group
          pointer.onDrag = (eMove) => {
            if (this.readOnly) return

            // Resize only by the exact pointer movement
            const pos: Point = [
              eMove.canvasX - group.pos[0] - offsetX,
              eMove.canvasY - group.pos[1] - offsetY,
            ]
            // Unless snapping.
            if (this.#snapToGrid) snapPoint(pos, this.#snapToGrid)

            const resized = group.resize(pos[0], pos[1])
            if (resized) this.dirtyBgCanvas = true
          }
          pointer.finally = () => this.resizingGroup = null
        } else {
          const headerHeight = LiteGraph.NODE_TITLE_HEIGHT
          if (
            isInRectangle(
              x,
              y,
              group.pos[0],
              group.pos[1],
              group.size[0],
              headerHeight,
            )
          ) {
            // In title bar
            pointer.onClick = () => this.processSelect(group, e)
            pointer.onDragStart = (pointer) => {
              group.recomputeInsideNodes()
              this.#startDraggingItems(group, pointer, true)
            }
            pointer.onDragEnd = e => this.#processDraggedItems(e)
          }
        }

        pointer.onDoubleClick = () => {
          this.emitEvent({
            subType: "group-double-click",
            originalEvent: e,
            group,
          })
        }
      } else {
        pointer.onDoubleClick = () => {
          // Double click within group should not trigger the searchbox.
          if (this.allowSearchbox) {
            this.showSearchbox(e)
            e.preventDefault()
          }
          this.emitEvent({
            subType: "empty-double-click",
            originalEvent: e,
          })
        }
      }
    }

    if (
      !pointer.onDragStart &&
      !pointer.onClick &&
      !pointer.onDrag &&
      this.allowDragCanvas
    ) {
      // allow dragging canvas if canvas is not in standard, or read-only (pan mode in standard)
      if (LiteGraph.canvasNavigationMode !== "standard" || this.readOnly) {
        pointer.onClick = () => this.processSelect(null, e)
        pointer.finally = () => this.draggingCanvas = false
        this.draggingCanvas = true
      } else {
        this.#setupNodeSelectionDrag(e, pointer)
      }
    }
  }

  #setupNodeSelectionDrag(e: CanvasPointerEvent, pointer: CanvasPointer, node?: LGraphNode | undefined): void {
    const dragRect = new Float32Array(4)

    dragRect[0] = e.canvasX
    dragRect[1] = e.canvasY
    dragRect[2] = 1
    dragRect[3] = 1

    pointer.onClick = (eUp) => {
      // Click, not drag
      const clickedItem = node ?? this.#getPositionableOnPos(eUp.canvasX, eUp.canvasY)
      this.processSelect(clickedItem, eUp)
    }
    pointer.onDragStart = () => this.draggingRectangle = dragRect
    pointer.onDragEnd = upEvent => this.#handleMultiSelect(upEvent, dragRect)
    pointer.finally = () => this.draggingRectangle = null
  }

  /**
   * Processes a pointerdown event inside the bounds of a node.  Part of `processMouseDown`.
   * @param e The pointerdown event
   * @param ctrlOrMeta Ctrl or meta key is pressed
   * @param node The node to process a click event for
   */
  #processNodeClick(
    e: CanvasPointerEvent,
    ctrlOrMeta: boolean,
    node: LGraphNode,
  ): void {
    const { pointer, graph, linkConnector } = this
    if (!graph) throw new NullGraphError()

    const x = e.canvasX
    const y = e.canvasY

    pointer.onClick = () => this.processSelect(node, e)

    // Immediately bring to front
    if (!node.flags.pinned) {
      this.bringToFront(node)
    }

    // Collapse toggle
    const inCollapse = node.isPointInCollapse(x, y)
    if (inCollapse) {
      pointer.onClick = () => {
        node.collapse()
        this.setDirty(true, true)
      }
    } else if (!node.flags.collapsed) {
      const { inputs, outputs } = node

      function hasRelevantOutputLinks(
        output: INodeOutputSlot,
        network: LinkNetwork,
      ): boolean {
        const outputLinks = [
          ...(output.links ?? []),
          ...(output.floatingLinks ?? new Set()),
        ]
        return outputLinks.some(
          linkId => typeof linkId === "number" && network.getLink(linkId) !== undefined,
        )
      }

      // Outputs
      if (outputs) {
        for (const [i, output] of outputs.entries()) {
          const linkPos = node.getOutputPos(i)
          if (isInRectangle(x, y, linkPos[0] - 15, linkPos[1] - 10, 30, 20)) {
            // Drag multiple output links
            if (e.shiftKey && hasRelevantOutputLinks(output, graph)) {
              linkConnector.moveOutputLink(graph, output)
              this.#linkConnectorDrop()
              return
            }

            // New output link
            linkConnector.dragNewFromOutput(graph, node, output)
            this.#linkConnectorDrop()

            if (LiteGraph.shiftClickDoBreakLinkFrom) {
              if (e.shiftKey) {
                node.disconnectOutput(i)
              }
            } else if (LiteGraph.ctrlAltClickDoBreakLink) {
              if (ctrlOrMeta && e.altKey && !e.shiftKey) {
                node.disconnectOutput(i)
              }
            }

            // TODO: Move callbacks to the start of this closure (onInputClick is already correct).
            pointer.onDoubleClick = () => node.onOutputDblClick?.(i, e)
            pointer.onClick = () => node.onOutputClick?.(i, e)

            return
          }
        }
      }

      // Inputs
      if (inputs) {
        for (const [i, input] of inputs.entries()) {
          const linkPos = node.getInputPos(i)
          const isInSlot = input instanceof NodeInputSlot
            ? isInRect(x, y, input.boundingRect)
            : isInRectangle(x, y, linkPos[0] - 15, linkPos[1] - 10, 30, 20)

          if (isInSlot) {
            pointer.onDoubleClick = () => node.onInputDblClick?.(i, e)
            pointer.onClick = () => node.onInputClick?.(i, e)

            const shouldBreakLink = LiteGraph.ctrlAltClickDoBreakLink &&
              ctrlOrMeta &&
              e.altKey &&
              !e.shiftKey
            if (input.link !== null || input.floatingLinks?.size) {
              // Existing link
              if (shouldBreakLink || LiteGraph.clickDoBreakLinkTo) {
                node.disconnectInput(i, true)
              } else if (e.shiftKey || this.allowReconnectLinks) {
                linkConnector.moveInputLink(graph, input, { startPoint: linkPos })
              }
            }

            // Dragging a new link from input to output
            if (!linkConnector.isConnecting) {
              linkConnector.dragNewFromInput(graph, node, input)
            }

            this.#linkConnectorDrop()
            this.dirtyBgCanvas = true

            return
          }
        }
      }
    }

    // Click was inside the node, but not on input/output, or resize area
    const pos: Point = [x - node.pos[0], y - node.pos[1]]

    // Widget
    const widget = node.getWidgetOnPos(x, y)
    if (widget) {
      this.#processWidgetClick(e, node, widget)
      this.nodeWidget = [node, widget]
    } else {
      // Node background
      pointer.onDoubleClick = () => {
        // Double-click
        // Check if it's a double click on the title bar
        // Note: pos[1] is the y-coordinate of the node's body
        // If clicking on node header (title), pos[1] is negative
        if (pos[1] < 0 && !inCollapse) {
          node.onNodeTitleDblClick?.(e, pos, this)
        } else if (node instanceof SubgraphNode) {
          this.openSubgraph(node.subgraph)
        }

        node.onDblClick?.(e, pos, this)
        this.emitEvent({
          subType: "node-double-click",
          originalEvent: e,
          node,
        })
        this.processNodeDblClicked(node)
      }

      // Check for title button clicks before calling onMouseDown
      if (node.titleButtons?.length && !node.flags.collapsed) {
        // pos contains the offset from the node's position, so we need to use node-relative coordinates
        const nodeRelativeX = pos[0]
        const nodeRelativeY = pos[1]

        for (let i = 0; i < node.titleButtons.length; i++) {
          const button = node.titleButtons[i]
          if (button.visible && button.isPointInside(nodeRelativeX, nodeRelativeY)) {
            node.onTitleButtonClick(button, this)
            // Set a no-op click handler to prevent fallback canvas dragging
            pointer.onClick = () => {}
            return
          }
        }
      }

      // Mousedown callback - can block drag
      if (node.onMouseDown?.(e, pos, this)) {
        // Node handled the event (e.g., title button clicked)
        // Set a no-op click handler to prevent fallback canvas dragging
        pointer.onClick = () => {}
        return
      }

      if (!this.allowDragNodes) return

      // Check for resize AFTER checking all other interaction areas
      if (!node.flags.collapsed) {
        const resizeDirection = node.findResizeDirection(x, y)
        if (resizeDirection) {
          pointer.resizeDirection = resizeDirection
          const startBounds = new Rectangle(node.pos[0], node.pos[1], node.size[0], node.size[1])

          pointer.onDragStart = () => {
            graph.beforeChange()
            this.resizingNode = node
          }

          pointer.onDrag = (eMove) => {
            if (this.readOnly) return

            const deltaX = eMove.canvasX - x
            const deltaY = eMove.canvasY - y

            const newBounds = new Rectangle(startBounds.x, startBounds.y, startBounds.width, startBounds.height)

            // Handle resize based on the direction
            switch (resizeDirection) {
              case "NE": // North-East (top-right)
                newBounds.y = startBounds.y + deltaY
                newBounds.width = startBounds.width + deltaX
                newBounds.height = startBounds.height - deltaY
                break
              case "SE": // South-East (bottom-right)
                newBounds.width = startBounds.width + deltaX
                newBounds.height = startBounds.height + deltaY
                break
              case "SW": // South-West (bottom-left)
                newBounds.x = startBounds.x + deltaX
                newBounds.width = startBounds.width - deltaX
                newBounds.height = startBounds.height + deltaY
                break
              case "NW": // North-West (top-left)
                newBounds.x = startBounds.x + deltaX
                newBounds.y = startBounds.y + deltaY
                newBounds.width = startBounds.width - deltaX
                newBounds.height = startBounds.height - deltaY
                break
            }

            // Apply snapping to position changes
            if (this.#snapToGrid) {
              if (resizeDirection.includes("N") || resizeDirection.includes("W")) {
                const originalX = newBounds.x
                const originalY = newBounds.y

                snapPoint(newBounds.pos, this.#snapToGrid)

                // Adjust size to compensate for snapped position
                if (resizeDirection.includes("N")) {
                  newBounds.height += originalY - newBounds.y
                }
                if (resizeDirection.includes("W")) {
                  newBounds.width += originalX - newBounds.x
                }
              }

              snapPoint(newBounds.size, this.#snapToGrid)
            }

            // Apply snapping to size changes

            // Enforce minimum size
            const min = node.computeSize()
            if (this.#snapToGrid) {
              snapPoint(min, this.#snapToGrid, "ceil")
            }
            if (newBounds.width < min[0]) {
              // If resizing from left, adjust position to maintain right edge
              if (resizeDirection.includes("W")) {
                newBounds.x = startBounds.x + startBounds.width - min[0]
              }
              newBounds.width = min[0]
            }
            if (newBounds.height < min[1]) {
              // If resizing from top, adjust position to maintain bottom edge
              if (resizeDirection.includes("N")) {
                newBounds.y = startBounds.y + startBounds.height - min[1]
              }
              newBounds.height = min[1]
            }

            node.pos = newBounds.pos
            node.setSize(newBounds.size)

            this.#dirty()
          }

          pointer.onDragEnd = () => {
            this.#dirty()
            graph.afterChange(node)
          }
          pointer.finally = () => {
            this.resizingNode = null
            pointer.resizeDirection = undefined
          }

          // Set appropriate cursor for resize direction
          this.#setCursor(cursors[resizeDirection])
          return
        }
      }

      // Drag node
      pointer.onDragStart = pointer => this.#startDraggingItems(node, pointer, true)
      pointer.onDragEnd = e => this.#processDraggedItems(e)
    }

    this.dirtyCanvas = true
  }

  #processWidgetClick(e: CanvasPointerEvent, node: LGraphNode, widget: IBaseWidget) {
    const { pointer } = this

    // Custom widget - CanvasPointer
    if (typeof widget.onPointerDown === "function") {
      const handled = widget.onPointerDown(pointer, node, this)
      if (handled) return
    }

    const oldValue = widget.value

    const pos = this.graphMouse
    const x = pos[0] - node.pos[0]
    const y = pos[1] - node.pos[1]

    const widgetInstance = toConcreteWidget(widget, node, false)
    if (widgetInstance) {
      pointer.onClick = () => widgetInstance.onClick({
        e,
        node,
        canvas: this,
      })
      pointer.onDrag = eMove => widgetInstance.onDrag?.({
        e: eMove,
        node,
        canvas: this,
      })
    } else if (widget.mouse) {
      const result = widget.mouse(e, [x, y], node)
      if (result != null) this.dirtyCanvas = result
    }

    // value changed
    if (oldValue != widget.value) {
      node.onWidgetChanged?.(widget.name, widget.value, oldValue, widget)
      if (!node.graph) throw new NullGraphError()
      node.graph.incrementVersion()
    }

    // Clean up state var
    pointer.finally = () => {
      // Legacy custom widget callback
      if (widget.mouse) {
        const { eUp } = pointer
        if (!eUp) return
        const { canvasX, canvasY } = eUp
        widget.mouse(eUp, [canvasX - node.pos[0], canvasY - node.pos[1]], node)
      }

      this.nodeWidget = null
    }
  }

  /**
   * Pointer middle button click processing.  Part of `processMouseDown`.
   * @param e The pointerdown event
   * @param node The node to process a click event for
   */
  #processMiddleButton(e: CanvasPointerEvent, node: LGraphNode | undefined) {
    const { pointer } = this

    if (
      LiteGraph.middleClickSlotAddDefaultNode &&
      node &&
      this.allowInteraction &&
      !this.readOnly &&
      !this.connectingLinks &&
      !node.flags.collapsed
    ) {
      // not dragging mouse to connect two slots
      let mClickSlot: INodeSlot | false = false
      let mClickSlotIndex: number | false = false
      let mClikcSlotIsOut: boolean = false
      const { inputs, outputs } = node

      // search for outputs
      if (outputs) {
        for (const [i, output] of outputs.entries()) {
          const linkPos = node.getOutputPos(i)
          if (isInRectangle(e.canvasX, e.canvasY, linkPos[0] - 15, linkPos[1] - 10, 30, 20)) {
            mClickSlot = output
            mClickSlotIndex = i
            mClikcSlotIsOut = true
            break
          }
        }
      }

      // search for inputs
      if (inputs) {
        for (const [i, input] of inputs.entries()) {
          const linkPos = node.getInputPos(i)
          if (isInRectangle(e.canvasX, e.canvasY, linkPos[0] - 15, linkPos[1] - 10, 30, 20)) {
            mClickSlot = input
            mClickSlotIndex = i
            mClikcSlotIsOut = false
            break
          }
        }
      }
      // Middle clicked a slot
      if (mClickSlot && mClickSlotIndex !== false) {
        const alphaPosY =
          0.5 -
          (mClickSlotIndex + 1) /
          (mClikcSlotIsOut ? outputs.length : inputs.length)
        const nodeBounding = node.getBounding()
        // estimate a position: this is a bad semi-bad-working mess .. REFACTOR with
        // a correct autoplacement that knows about the others slots and nodes
        const posRef: Point = [
          !mClikcSlotIsOut
            ? nodeBounding[0]
            : nodeBounding[0] + nodeBounding[2],
          e.canvasY - 80,
        ]

        pointer.onClick = () => this.createDefaultNodeForSlot({
          nodeFrom: !mClikcSlotIsOut ? null : node,
          slotFrom: !mClikcSlotIsOut ? null : mClickSlotIndex,
          nodeTo: !mClikcSlotIsOut ? node : null,
          slotTo: !mClikcSlotIsOut ? mClickSlotIndex : null,
          position: posRef,
          nodeType: "AUTO",
          posAdd: [!mClikcSlotIsOut ? -30 : 30, -alphaPosY * 130],
          posSizeFix: [!mClikcSlotIsOut ? -1 : 0, 0],
        })
      }
    }

    // Drag canvas using middle mouse button
    if (this.allowDragCanvas) {
      pointer.onDragStart = () => this.draggingCanvas = true
      pointer.finally = () => this.draggingCanvas = false
    }
  }

  #processDragZoom(e: PointerEvent): void {
    // stop canvas zoom action
    if (!e.buttons) {
      this.#dragZoomStart = null
      return
    }

    const start = this.#dragZoomStart
    if (!start) throw new TypeError("Drag-zoom state object was null")
    if (!this.graph) throw new NullGraphError()

    // calculate delta
    const deltaY = e.y - start.pos[1]
    const startScale = start.scale

    const scale = startScale - deltaY / 100

    this.ds.changeScale(scale, start.pos)
    this.graph.change()
  }

  /**
   * Updates the hover / snap state of all visible reroutes.
   * @returns The original value of `underPointer`, with any found reroute items added.
   */
  #updateReroutes(underPointer: CanvasItem): CanvasItem {
    const { graph, pointer, linkConnector } = this
    if (!graph) throw new NullGraphError()

    // Update reroute hover state
    if (!pointer.isDown) {
      let anyChanges = false
      for (const reroute of this.#visibleReroutes) {
        anyChanges ||= reroute.updateVisibility(this.graphMouse)

        if (reroute.isSlotHovered) underPointer |= CanvasItem.RerouteSlot
      }
      if (anyChanges) this.dirtyBgCanvas = true
    } else if (linkConnector.isConnecting) {
      // Highlight the reroute that the mouse is over
      for (const reroute of this.#visibleReroutes) {
        if (reroute.containsPoint(this.graphMouse)) {
          if (linkConnector.isRerouteValidDrop(reroute)) {
            linkConnector.overReroute = reroute
            this.#highlightPos = reroute.pos
          }

          return underPointer | CanvasItem.RerouteSlot
        }
      }
    }

    this.#highlightPos &&= undefined
    linkConnector.overReroute &&= undefined
    return underPointer
  }

  /**
   * Start dragging an item, optionally including all other selected items.
   *
   * ** This function sets the `CanvasPointer.finally`() callback. **
   * @param item The item that the drag event started on
   * @param pointer The pointer event that initiated the drag, e.g. pointerdown
   * @param sticky If `true`, the item is added to the selection - see `processSelect`
   */
  #startDraggingItems(item: Positionable, pointer: CanvasPointer, sticky = false): void {
    this.emitBeforeChange()
    this.graph?.beforeChange()
    // Ensure that dragging is properly cleaned up, on success or failure.
    pointer.finally = () => {
      this.isDragging = false
      this.autoPan?.stop()
      this.autoPan = null
      this.graph?.afterChange()
      this.emitAfterChange()
    }

    this.processSelect(item, pointer.eDown, sticky)
    this.isDragging = true

    // Seed the auto-pan modifier state from the pointer-down event so a drag
    // that reaches the canvas edge before the first move still honours the
    // "move group without contents" modifier.
    if (pointer.eDown) {
      this.#lastDragModifiers = {
        ctrlKey: pointer.eDown.ctrlKey,
        metaKey: pointer.eDown.metaKey,
      }
    }

    this.#startNodeAutoPan()
  }

  #startNodeAutoPan(): void {
    this.autoPan = new AutoPanController({
      canvas: this.canvas,
      ds: this.ds,
      maxPanSpeed: this.autoPanSpeed,
      onPan: (panX, panY) => {
        const selected = this.selectedItems
        const allItems = getDraggedItems(selected, this.#lastDragModifiers)

        for (const item of allItems) {
          item.move(panX, panY, true)
        }

        this.#dirty()
      },
    })
    this.autoPan.updatePointer(this.mouse[0], this.mouse[1])
    this.autoPan.start()
  }

  /**
   * Handles shared clean up and placement after items have been dragged.
   * @param e The event that completed the drag, e.g. pointerup, pointermove
   */
  #processDraggedItems(e: CanvasPointerEvent): void {
    const { graph } = this
    if (e.shiftKey || LiteGraph.alwaysSnapToGrid)
      graph?.snapToGrid(this.selectedItems)

    this.dirtyCanvas = true
    this.dirtyBgCanvas = true

    // TODO: Replace legacy behaviour: callbacks were never extended for multiple items
    this.onNodeMoved?.(findFirstNode(this.selectedItems))
  }

  #noItemsSelected(): void {
    const event = new CustomEvent("litegraph:no-items-selected", { bubbles: true })
    this.canvas.dispatchEvent(event)
  }

  #handleMultiSelect(e: CanvasPointerEvent, dragRect: Float32Array) {
    // Process drag
    // Convert Point pair (pos, offset) to Rect
    const { graph, selectedItems, subgraph } = this
    if (!graph) throw new NullGraphError()

    const w = Math.abs(dragRect[2])
    const h = Math.abs(dragRect[3])
    if (dragRect[2] < 0) dragRect[0] -= w
    if (dragRect[3] < 0) dragRect[1] -= h
    dragRect[2] = w
    dragRect[3] = h

    // Select nodes - any part of the node is in the select area
    const isSelected = new Set<Positionable>()
    const notSelected: Positionable[] = []

    if (subgraph) {
      const { inputNode, outputNode } = subgraph

      if (overlapBounding(dragRect, inputNode.boundingRect)) {
        addPositionable(inputNode)
      }
      if (overlapBounding(dragRect, outputNode.boundingRect)) {
        addPositionable(outputNode)
      }
    }

    for (const nodeX of graph.nodes) {
      if (overlapBounding(dragRect, nodeX.boundingRect)) {
        addPositionable(nodeX)
      }
    }

    // Select groups - the group is wholly inside the select area
    for (const group of graph.groups) {
      if (!containsRect(dragRect, group.boundingRect)) continue

      group.recomputeInsideNodes()
      addPositionable(group)
    }

    // Select reroutes - the centre point is inside the select area
    for (const reroute of graph.reroutes.values()) {
      if (!isPointInRect(reroute.pos, dragRect)) continue

      selectedItems.add(reroute)
      reroute.selected = true
      addPositionable(reroute)
    }

    if (e.shiftKey) {
      // Add to selection
      for (const item of notSelected) this.select(item)
    } else if (e.altKey) {
      // Remove from selection
      for (const item of isSelected) this.deselect(item)
    } else {
      // Replace selection
      for (const item of selectedItems) {
        if (!isSelected.has(item)) this.deselect(item)
      }
      for (const item of notSelected) this.select(item)
    }
    this.onSelectionChange?.(this.selectedNodes)

    function addPositionable(item: Positionable): void {
      if (!item.selected || !selectedItems.has(item)) notSelected.push(item)
      else isSelected.add(item)
    }
  }

  /**
   * Iterative traversal of a group's descendants.
   * Calls `groupAction` on nested groups and `leafAction` on
   * non-group children.  Always recurses into nested groups regardless of
   * their current selection state.
   */
  #traverseGroupChildren(
    group: LGraphGroup,
    groupAction: (child: LGraphGroup) => void,
    leafAction: (child: Positionable) => void,
  ): void {
    const stack: Positionable[] = [...group.children]
    while (stack.length > 0) {
      const child = stack.pop()!
      if (child instanceof LGraphGroup) {
        groupAction(child)
        for (const nested of child.children) stack.push(nested)
      } else {
        leafAction(child)
      }
    }
  }

  /** @returns If the pointer is over a link centre marker, the link segment it belongs to.  Otherwise, `undefined`.  */
  #getLinkCentreOnPos(e: CanvasPointerEvent): LinkSegment | undefined {
    for (const linkSegment of this.renderedPaths) {
      const centre = linkSegment.pathCentre
      if (!centre) continue

      if (isInRectangle(e.canvasX, e.canvasY, centre[0] - 4, centre[1] - 4, 8, 8)) {
        return linkSegment
      }
    }
  }

  /** Get the target snap / highlight point in graph space */
  #getHighlightPosition(): ReadOnlyPoint {
    return LiteGraph.snapsForComfy
      ? this.linkConnector.state.snapLinksPos ?? this.#highlightPos ?? this.graphMouse
      : this.graphMouse
  }

  /**
   * Renders indicators showing where a link will connect if released.
   * Partial border over target node and a highlight over the slot itself.
   * @param ctx Canvas 2D context
   */
  #renderSnapHighlight(
    ctx: CanvasRenderingContext2D,
    highlightPos: ReadOnlyPoint,
  ): void {
    const linkConnectorSnap = !!this.linkConnector.state.snapLinksPos
    if (!this.#highlightPos && !linkConnectorSnap) return

    ctx.fillStyle = "#ffcc00"
    ctx.beginPath()
    const shape = this.#highlightInput?.shape

    if (shape === RenderShape.ARROW) {
      ctx.moveTo(highlightPos[0] + 8, highlightPos[1] + 0.5)
      ctx.lineTo(highlightPos[0] - 4, highlightPos[1] + 6 + 0.5)
      ctx.lineTo(highlightPos[0] - 4, highlightPos[1] - 6 + 0.5)
      ctx.closePath()
    } else {
      ctx.arc(highlightPos[0], highlightPos[1], 6, 0, Math.PI * 2)
    }
    ctx.fill()

    const { linkConnector } = this
    const { overReroute, overWidget } = linkConnector
    if (!LiteGraph.snapHighlightsNode || !linkConnector.isConnecting || linkConnectorSnap) return

    // Reroute highlight
    overReroute?.drawHighlight(ctx, "#ffcc00aa")

    // Ensure we're mousing over a node and connecting a link
    const node = this.nodeOver
    if (!node) return

    const { strokeStyle, lineWidth } = ctx

    const area = node.boundingRect
    const gap = 3
    const radius = LiteGraph.ROUND_RADIUS + gap

    const x = area[0] - gap
    const y = area[1] - gap
    const width = area[2] + gap * 2
    const height = area[3] + gap * 2

    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)

    // TODO: Currently works on LTR slots only.  Add support for other directions.
    const start = linkConnector.state.connectingTo === "output" ? 0 : 1
    const inverter = start ? -1 : 1

    // Radial highlight centred on highlight pos
    const hx = highlightPos[0]
    const hy = highlightPos[1]
    const gRadius = width < height
      ? width
      : width * Math.max(height / width, 0.5)

    const gradient = ctx.createRadialGradient(hx, hy, 0, hx, hy, gRadius)
    gradient.addColorStop(1, "#00000000")
    gradient.addColorStop(0, "#ffcc00aa")

    // Linear gradient over half the node.
    const linearGradient = ctx.createLinearGradient(x, y, x + width, y)
    linearGradient.addColorStop(0.5, "#00000000")
    linearGradient.addColorStop(start + 0.67 * inverter, "#ddeeff33")
    linearGradient.addColorStop(start + inverter, "#ffcc0055")

    /**
     * Workaround for a canvas render issue.
     * In Chromium 129 (2024-10-15), rounded corners can be rendered with the wrong part of a gradient colour.
     * Occurs only at certain thicknesses / arc sizes.
     */
    ctx.setLineDash([radius, radius * 0.001])

    ctx.lineWidth = 1
    ctx.strokeStyle = linearGradient
    ctx.stroke()

    if (overWidget) {
      const { computedHeight } = overWidget

      ctx.beginPath()
      const { pos } = node
      const [nodeX, nodeY] = pos
      const height = LiteGraph.NODE_WIDGET_HEIGHT
      if (
        overWidget.type.startsWith("custom") &&
        computedHeight != null &&
        computedHeight > height * 2
      ) {
        // Most likely DOM widget text box
        ctx.rect(
          nodeX + 9,
          nodeY + overWidget.y + 9,
          (overWidget.width ?? area[2]) - 18,
          computedHeight - 18,
        )
      } else {
        // Regular widget, probably
        ctx.roundRect(
          nodeX + BaseWidget.margin,
          nodeY + overWidget.y,
          overWidget.width ?? area[2],
          height,
          height * 0.5,
        )
      }
      ctx.stroke()
    }

    ctx.strokeStyle = gradient
    ctx.stroke()

    ctx.setLineDash([])
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = strokeStyle
  }

  /**
   * draws the given node inside the canvas
   */
  #getNodeModeAlpha(node: LGraphNode): number {
    if (node.flags.ghost) return 0.3
    return node.mode === LGraphEventMode.BYPASS
      ? 0.2
      : (node.mode === LGraphEventMode.NEVER
        ? 0.4
        : this.editorAlpha)
  }

  #renderFloatingLinks(ctx: CanvasRenderingContext2D, graph: LGraph, visibleReroutes: Reroute[], now: number) {
    // Render floating links with 3/4 current alpha
    const { globalAlpha } = ctx
    ctx.globalAlpha = globalAlpha * 0.33

    // Floating reroutes
    for (const link of graph.floatingLinks.values()) {
      const reroutes = LLink.getReroutes(graph, link)
      const firstReroute = reroutes[0]
      const reroute = reroutes.at(-1)
      if (!firstReroute || !reroute?.floating) continue

      // Input not connected
      if (reroute.floating.slotType === "input") {
        const node = graph.getNodeById(link.targetId)
        if (!node) continue

        const startPos = firstReroute.pos
        const endPos = node.getInputPos(link.targetSlot)
        const endDirection = node.inputs[link.targetSlot]?.dir

        firstReroute.dragging = true
        this.#renderAllLinkSegments(ctx, link, startPos, endPos, visibleReroutes, now, LinkDirection.CENTER, endDirection, true)
      } else {
        const node = graph.getNodeById(link.originId)
        if (!node) continue

        const startPos = node.getOutputPos(link.originSlot)
        const endPos = reroute.pos
        const startDirection = node.outputs[link.originSlot]?.dir

        link.dragging = true
        this.#renderAllLinkSegments(ctx, link, startPos, endPos, visibleReroutes, now, startDirection, LinkDirection.CENTER, true)
      }
    }
    ctx.globalAlpha = globalAlpha
  }

  #renderDisconnectCircles(ctx: CanvasRenderingContext2D, highlightPos: ReadOnlyPoint, renderLinks: RenderLinkUnion[]) {
    for (const link of renderLinks) {
      if (!("disconnectOnDrop" in link) || !link.disconnectOnDrop) continue
      if (!("disconnectOrigin" in link) || !link.disconnectOrigin) continue

      const [originX, originY] = link.disconnectOrigin
      const radius = 35
      const distSquared = (originX - highlightPos[0]) ** 2 + (originY - highlightPos[1]) ** 2

      ctx.save()
      ctx.strokeStyle = LiteGraph.WIDGET_OUTLINE_COLOR
      ctx.lineWidth = 2
      const path = new Path2D()
      path.moveTo(originX + radius, originY)
      path.arc(originX, originY, radius, 0, Math.PI * 2)
      ctx.stroke(path)
      ctx.restore()

      link.disconnectOnDrop = distSquared < radius ** 2
    }
  }

  #renderAllLinkSegments(
    ctx: CanvasRenderingContext2D,
    link: LLink,
    startPos: Point,
    endPos: Point,
    visibleReroutes: Reroute[],
    now: number,
    startDirection?: LinkDirection,
    endDirection?: LinkDirection,
    disabled: boolean = false,
  ) {
    const { graph, renderedPaths } = this
    if (!graph) return

    // Get all points this link passes through
    const reroutes = LLink.getReroutes(graph, link)
    const points: [Point, ...Point[], Point] = [
      startPos,
      ...reroutes.map(x => x.pos),
      endPos,
    ]

    // Bounding box of all points (bezier overshoot on long links will be cut)
    const pointsX = points.map(x => x[0])
    const pointsY = points.map(x => x[1])
    LGraphCanvas.#linkBounding[0] = Math.min(...pointsX)
    LGraphCanvas.#linkBounding[1] = Math.min(...pointsY)
    LGraphCanvas.#linkBounding[2] = Math.max(...pointsX) - LGraphCanvas.#linkBounding[0]
    LGraphCanvas.#linkBounding[3] = Math.max(...pointsY) - LGraphCanvas.#linkBounding[1]

    // skip links outside of the visible area of the canvas
    if (!overlapBounding(LGraphCanvas.#linkBounding, LGraphCanvas.#marginArea))
      return

    const startDir = startDirection || LinkDirection.RIGHT
    const endDir = endDirection || LinkDirection.LEFT

    // Has reroutes
    if (reroutes.length) {
      let startControl: Point | undefined

      const l = reroutes.length
      for (let j = 0; j < l; j++) {
        const reroute = reroutes[j]

        // Only render once
        if (!renderedPaths.has(reroute)) {
          renderedPaths.add(reroute)
          visibleReroutes.push(reroute)
          reroute.colour = link.color ||
            LGraphCanvas.linkTypeColors[link.type] ||
            this.defaultLinkColor

          const prevReroute = graph.getReroute(reroute.parentId)
          const rerouteStartPos = prevReroute?.pos ?? startPos
          reroute.calculateAngle(this.lastDrawTime, graph, rerouteStartPos)

          // Skip the first segment if it is being dragged
          if (!reroute.dragging) {
            this.renderLink(
              ctx,
              rerouteStartPos,
              reroute.pos,
              link,
              false,
              0,
              null,
              startControl === undefined ? startDir : LinkDirection.CENTER,
              LinkDirection.CENTER,
              {
                startControl,
                endControl: reroute.controlPoint,
                reroute,
                disabled,
              },
            )
          }
        }

        if (!startControl && reroutes.at(-1)?.floating?.slotType === "input") {
          // Floating link connected to an input
          startControl = [0, 0]
        } else {
          // Calculate start control for the next iter control point
          const nextPos = reroutes[j + 1]?.pos ?? endPos
          const dist = Math.min(Reroute.maxSplineOffset, distance(reroute.pos, nextPos) * 0.25)
          startControl = [dist * reroute.cos, dist * reroute.sin]
        }
      }

      // Skip the last segment if it is being dragged
      if (link.dragging) return

      // Use runtime fallback; TypeScript cannot evaluate this correctly.
      const segmentStartPos = points.at(-2) ?? startPos

      // Render final link segment
      this.renderLink(
        ctx,
        segmentStartPos,
        endPos,
        link,
        false,
        0,
        null,
        LinkDirection.CENTER,
        endDir,
        { startControl, disabled },
      )
      // Skip normal render when link is being dragged
    } else if (!link.dragging) {
      this.renderLink(
        ctx,
        startPos,
        endPos,
        link,
        false,
        0,
        null,
        startDir,
        endDir,
      )
    }
    renderedPaths.add(link)

    // event triggered rendered on top
    if (link?.lastTime && now - link.lastTime < 1000) {
      const f = 2.0 - (now - link.lastTime) * 0.002
      const tmp = ctx.globalAlpha
      ctx.globalAlpha = tmp * f
      this.renderLink(
        ctx,
        startPos,
        endPos,
        link,
        true,
        f,
        "white",
        startDir,
        endDir,
      )
      ctx.globalAlpha = tmp
    }
  }

  /**
   * Modifies an existing point, adding a single-axis offset.
   * @param point The point to add the offset to
   * @param direction The direction to add the offset in
   * @param dist Distance to offset
   * @param factor Distance is mulitplied by this value.  Default: 0.25
   */
  #addSplineOffset(
    point: Point,
    direction: LinkDirection,
    dist: number,
    factor = 0.25,
  ): void {
    switch (direction) {
      case LinkDirection.LEFT:
        point[0] += dist * -factor
        break
      case LinkDirection.RIGHT:
        point[0] += dist * factor
        break
      case LinkDirection.UP:
        point[1] += dist * -factor
        break
      case LinkDirection.DOWN:
        point[1] += dist * factor
        break
    }
  }

  /**
   * Copies canvas items to an internal, app-specific clipboard backed by local storage.
   * When called without parameters, it copies `selectedItems`.
   * @param items The items to copy.  If nullish, all selected items are copied.
   */
  #serializeItems(items?: Iterable<Positionable>): ClipboardItems {
    const serialisable: Required<ClipboardItems> = {
      nodes: [],
      groups: [],
      reroutes: [],
      links: [],
      subgraphs: [],
    }

    // NOTE: logic for traversing nested subgraphs depends on this being a set.
    const subgraphs = new Set<Subgraph>()

    // Create serialisable objects
    for (const item of items ?? this.selectedItems) {
      if (item instanceof LGraphNode) {
        // Nodes
        if (item.clonable === false) continue

        const cloned = item.clone()?.serialize()
        if (!cloned) continue

        cloned.id = item.id
        serialisable.nodes.push(cloned)

        // Links
        if (item.inputs) {
          for (const { link: linkId } of item.inputs) {
            if (linkId == null) continue

            const link = this.graph?.links.get(linkId)?.asSerialisable()
            if (link) serialisable.links.push(link)
          }
        }

        // Find all unique referenced subgraphs
        if (item instanceof SubgraphNode) {
          subgraphs.add(item.subgraph)
        }
      } else if (item instanceof LGraphGroup) {
        // Groups
        serialisable.groups.push(item.serialize())
      } else if (item instanceof Reroute) {
        // Reroutes
        serialisable.reroutes.push(item.asSerialisable())
      }
    }

    // Add unique subgraph entries
    // NOTE: subgraphs is appended to mid iteration.
    for (const subgraph of subgraphs) {
      for (const node of subgraph.nodes) {
        if (node instanceof SubgraphNode) {
          subgraphs.add(node.subgraph)
        }
      }
      const cloned = subgraph
        .clone(true)
        .asSerialisable()
      serialisable.subgraphs.push(cloned)
    }

    return serialisable
  }

  #deserializeItems(
    parsed: ClipboardItems,
    options: IPasteFromClipboardOptions = {},
  ): ClipboardPasteResult | undefined {
    const {
      connectInputs = false,
      position = this.graphMouse,
    } = options

    // if ctrl + shift + v is off, return when isConnectUnselected is true (shift is pressed) to maintain old behavior
    if (!LiteGraph.ctrlShiftVPasteConnectUnselectedOutputs && connectInputs) return

    const { graph } = this
    if (!graph) throw new NullGraphError()
    graph.beforeChange()

    parsed.nodes ??= []
    parsed.groups ??= []
    parsed.reroutes ??= []
    parsed.links ??= []
    parsed.subgraphs ??= []

    // Find top-left-most boundary
    let offsetX = Infinity
    let offsetY = Infinity
    for (const item of [...parsed.nodes, ...parsed.reroutes]) {
      if (item.pos == null) throw new TypeError("Invalid node encounterd on paste.  `pos` was null.")

      if (item.pos[0] < offsetX) offsetX = item.pos[0]
      if (item.pos[1] < offsetY) offsetY = item.pos[1]
    }

    // TODO: Remove when implementing `asSerialisable`
    if (parsed.groups) {
      for (const group of parsed.groups) {
        if (group.bounding[0] < offsetX) offsetX = group.bounding[0]
        if (group.bounding[1] < offsetY) offsetY = group.bounding[1]
      }
    }

    const results: ClipboardPasteResult = {
      created: [],
      nodes: new Map<NodeId, LGraphNode>(),
      links: new Map<LinkId, LLink>(),
      reroutes: new Map<RerouteId, Reroute>(),
      subgraphs: new Map<UUID, Subgraph>(),
    }
    const { created, nodes, links, reroutes } = results

    // const failedNodes: ISerialisedNode[] = []
    const subgraphIdMap: Record<string, string> = {}
    for (const subgraphInfo of parsed.subgraphs)
      subgraphInfo.id = subgraphIdMap[subgraphInfo.id] = createUuidv4()
    const allNodeInfo: ISerialisedNode[] = [
      parsed.nodes,
      ...parsed.subgraphs.map(s => s.nodes ?? []),
    ].flat()
    for (const nodeInfo of allNodeInfo) {
      if (Object.hasOwn(subgraphIdMap, nodeInfo.type))
        nodeInfo.type = subgraphIdMap[nodeInfo.type]
    }

    // Subgraphs
    for (const info of parsed.subgraphs) {
      const subgraph = graph.createSubgraph(info)
      results.subgraphs.set(info.id, subgraph)
    }
    for (const info of parsed.subgraphs)
      results.subgraphs.get(info.id)?.configure(info)

    // Groups
    for (const info of parsed.groups) {
      info.id = -1

      const group = new LGraphGroup()
      group.configure(info)
      graph.add(group)
      created.push(group)
    }

    // Nodes
    for (const info of parsed.nodes) {
      const node = info.type == null ? null : LiteGraph.createNode(info.type)
      if (!node) {
        // failedNodes.push(info)
        continue
      }

      nodes.set(info.id, node)
      info.id = -1

      node.configure(info)
      graph.add(node)

      created.push(node)
    }

    // Reroutes
    for (const info of parsed.reroutes) {
      const { id, ...rerouteInfo } = info

      const reroute = graph.setReroute(rerouteInfo)
      created.push(reroute)
      reroutes.set(id, reroute)
    }

    // Remap reroute parentIds for pasted reroutes
    for (const reroute of reroutes.values()) {
      if (reroute.parentId == null) continue

      const mapped = reroutes.get(reroute.parentId)
      if (mapped) reroute.parentId = mapped.id
    }

    // Links
    for (const info of parsed.links) {
      // Find the copied node / reroute ID
      let outNode: LGraphNode | null | undefined = nodes.get(info.originId)
      let afterRerouteId: number | undefined
      if (info.parentId != null) afterRerouteId = reroutes.get(info.parentId)?.id

      // If it wasn't copied, use the original graph value
      if (connectInputs && LiteGraph.ctrlShiftVPasteConnectUnselectedOutputs) {
        outNode ??= graph.getNodeById(info.originId)
        afterRerouteId ??= info.parentId
      }

      const inNode = nodes.get(info.targetId)
      if (inNode) {
        const link = outNode?.connect(
          info.originSlot,
          inNode,
          info.targetSlot,
          afterRerouteId,
        )
        if (link) links.set(info.id, link)
      }
    }

    // Remap linkIds
    for (const reroute of reroutes.values()) {
      const ids = [...reroute.linkIds].map(x => links.get(x)?.id ?? x)
      reroute.update(reroute.parentId, undefined, ids, reroute.floating)

      // Remove any invalid items
      if (!reroute.validateLinks(graph.links, graph.floatingLinks)) {
        graph.removeReroute(reroute.id)
      }
    }

    const dx = position[0] - offsetX
    const dy = position[1] - offsetY

    // Adjust positions
    for (const item of created) {
      if (item instanceof LGraphNode) {
        item.move(dx, dy)
      } else if (item instanceof Reroute) {
        item.move(dx, dy)
      } else if (item instanceof LGraphGroup) {
        item.move(dx, dy, true)
      }
    }

    // TODO: Report failures, i.e. `failedNodes`

    this.selectItems(created)
    forEachNode(graph, n => n.onGraphConfigured?.())
    forEachNode(graph, n => n.onAfterGraphConfigured?.())

    graph.afterChange()

    return results
  }

  /** Captures an event and prevents default - returns false. */
  #doNothing(e: Event): boolean {
    // console.log("pointerevents: _doNothing "+e.type);
    e.preventDefault()
    return false
  }

  /** Captures an event and prevents default - returns true. */
  #doReturnTrue(e: Event): boolean {
    e.preventDefault()
    return true
  }

  get minFontSizeForLod(): number {
    return this.#minFontSizeForLod
  }

  set minFontSizeForLod(value: number) {
    if (this.#minFontSizeForLod === value) {
      return
    }

    this.#minFontSizeForLod = value
    this.#updateLowQualityThreshold()
  }

  /** The subgraph currently being edited inline, if the canvas has navigated into a subgraph. */
  get subgraph(): Subgraph | undefined {
    return this.#subgraph
  }

  /**
   * Sets the active subgraph context for this canvas.
   * Dispatches `LGraphCanvasEventMap` `"litegraph:set-graph"` when the value changes.
   */
  set subgraph(value: Subgraph | undefined) {
    if (value === this.#subgraph) {
      return
    }

    this.#subgraph = value
    if (value) this.dispatch("litegraph:set-graph", { oldGraph: this.#subgraph, newGraph: value })
  }

  /** Dispatches a custom event on the canvas element with a detail payload. */
  dispatch<T extends keyof NeverNever<LGraphCanvasEventMap>>(type: T, detail: LGraphCanvasEventMap[T]): boolean
  /**
   * Dispatches a custom event on the canvas element with no detail payload.
   * @param type The event name defined in `LGraphCanvasEventMap`.
   */
  dispatch<T extends keyof PickNevers<LGraphCanvasEventMap>>(type: T): boolean
  /**
   * Dispatches a custom event on the canvas element.
   * @param type The event name defined in `LGraphCanvasEventMap`.
   * @param detail Event-specific payload. Omitted for events with no detail.
   */
  dispatch<T extends keyof LGraphCanvasEventMap>(type: T, detail?: LGraphCanvasEventMap[T]) {
    const event = new CustomEvent(type as string, { detail, bubbles: true })
    return this.canvas.dispatchEvent(event)
  }

  /**
   * Dispatches a custom event on the canvas element.
   * @param type The event name defined in `LGraphCanvasEventMap`.
   * @param detail Event-specific payload.
   */
  dispatchEvent<TEvent extends keyof LGraphCanvasEventMap>(type: TEvent, detail: LGraphCanvasEventMap[TEvent]) {
    this.canvas.dispatchEvent(new CustomEvent(type, { detail }))
  }

  get innerTextFont(): string {
    return `normal ${LiteGraph.NODE_SUBTEXT_SIZE}px ${LiteGraph.NODE_FONT}`
  }

  /** Maximum frames per second to render. 0: unlimited. Default: 0 */
  public get maximumFps() {
    return this.#maximumFrameGap > Number.EPSILON ? this.#maximumFrameGap / 1000 : 0
  }

  public set maximumFps(value) {
    this.#maximumFrameGap = value > Number.EPSILON ? 1000 / value : 0
  }

  /**
   * @deprecated Use `LiteGraphGlobal.ROUND_RADIUS` instead.
   */
  get roundRadius() {
    return LiteGraph.ROUND_RADIUS
  }

  /**
   * @deprecated Use `LiteGraphGlobal.ROUND_RADIUS` instead.
   */
  set roundRadius(value: number) {
    LiteGraph.ROUND_RADIUS = value
  }

  /**
   * Render low quality when zoomed out based on minimum readable font size.
   */
  get lowQuality(): boolean {
    return this.#isLowQuality
  }

  /** Override to supply entries for the canvas background context menu. */
  getMenuOptions?(): IContextMenuValue<string>[]
  /**
   * Override to append entries to the canvas background context menu.
   * @param canvas This canvas instance.
   * @param options Mutable menu entries array to append to.
   */
  getExtraMenuOptions?(
    canvas: LGraphCanvas,
    options: IContextMenuValue<string>[],
  ): IContextMenuValue<string>[]
  /** Called before the graph is modified. Use for undo/redo or validation hooks. */
  onBeforeChange?(graph: LGraph): void
  /** Called after the graph has been modified. Use for undo/redo or persistence hooks. */
  onAfterChange?(graph: LGraph): void

  get ensureGraph(): LGraph | Subgraph {
    if (!this.graph) throw new NullGraphError()
    return this.graph
  }

  // #region Legacy accessors
  /** @deprecated Use `LGraphCanvas.state` `readOnly` instead. */
  get readOnly(): boolean {
    return this.state.readOnly
  }

  set readOnly(value: boolean) {
    this.state.readOnly = value
    this.#updateCursorStyle()
  }

  get isDragging(): boolean {
    return this.state.draggingItems
  }

  set isDragging(value: boolean) {
    this.state.draggingItems = value
  }

  get hoveringOver(): CanvasItem {
    return this.state.hoveringOver
  }

  set hoveringOver(value: CanvasItem) {
    this.state.hoveringOver = value
    this.#updateCursorStyle()
  }

  /** @deprecated Replace all references with `pointer`.`CanvasPointer.isDown isDown`. */
  get pointerIsDown() {
    return this.pointer.isDown
  }

  /** @deprecated Replace all references with `pointer`.`CanvasPointer.isDouble isDouble`. */
  get pointerIsDouble() {
    return this.pointer.isDouble
  }

  /** @deprecated Use `LGraphCanvas.state` `draggingCanvas` instead. */
  get draggingCanvas(): boolean {
    return this.state.draggingCanvas
  }

  set draggingCanvas(value: boolean) {
    this.state.draggingCanvas = value
    this.#updateCursorStyle()
  }

  /**
   * @deprecated Use `LGraphNode.titleFontStyle` instead.
   */
  get titleTextFont(): string {
    return `${LiteGraph.NODE_TEXT_SIZE}px ${LiteGraph.NODE_FONT}`
  }
  // #endregion Legacy accessors

  /**
   * draws the widgets stored inside a node
   * @deprecated Use `LGraphNode.drawWidgets` instead.
   * @remarks Currently there are extensions hijacking this function, so we cannot remove it.
   */
  drawNodeWidgets(
    node: LGraphNode,
    _posY: null,
    ctx: CanvasRenderingContext2D,
  ): void {
    node.drawWidgets(ctx, {
      lowQuality: this.lowQuality,
      editorAlpha: this.editorAlpha,
    })
  }

  /**
   * clears all the data inside
   *
   */
  clear(): void {
    this.frame = 0
    this.lastDrawTime = 0
    this.renderTime = 0
    this.fps = 0

    // this.scale = 1;
    // this.offset = [0,0];
    this.draggingRectangle = null

    this.selectedNodes = {}
    this.selectedGroup = null
    this.selectedItems.clear()
    this.state.selectionChanged = true
    this.onSelectionChange?.(this.selectedNodes)

    this.visibleNodes = []
    this.nodeOver = undefined
    this.nodeCapturingInput = null
    this.connectingLinks = null
    this.highlightedLinks = {}

    this.draggingCanvas = false

    this.#dirty()
    this.dirtyArea = null

    this.nodeInPanel = null
    this.nodeWidget = null

    this.lastMouse = [0, 0]
    this.lastMouseClick = 0
    this.pointer.reset()
    this.visibleArea.set([0, 0, 0, 0])

    this.onClear?.()
  }

  /**
   * Assigns a new graph to this canvas.
   */
  setGraph(newGraph: LGraph | Subgraph): void {
    const { graph } = this
    if (newGraph === graph) return

    if (this.state.ghostNodeId != null) this.finalizeGhostPlacement(true)

    this.clear()
    newGraph.attachCanvas(this)

    this.dispatch("litegraph:set-graph", { newGraph, oldGraph: graph })
    this.#dirty()
  }

  openSubgraph(subgraph: Subgraph): void {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    const options = { bubbles: true, detail: { subgraph, closingGraph: graph }, cancelable: true }
    const mayContinue = this.canvas.dispatchEvent(new CustomEvent("subgraph-opening", options))
    if (!mayContinue) return

    this.clear()
    this.subgraph = subgraph
    this.setGraph(subgraph)

    this.canvas.dispatchEvent(new CustomEvent("subgraph-opened", options))
  }

  /**
   * @returns the visually active graph (in case there are more in the stack)
   */
  getCurrentGraph(): LGraph | null {
    return this.graph
  }

  /**
   * Sets the current HTML canvas element.
   * Calls bindEvents to add input event listeners, and (re)creates the background canvas.
   * @param canvas The canvas element to assign, or its HTML element ID.  If null or undefined, the current reference is cleared.
   * @param skipEvents If true, events on the previous canvas will not be removed.  Has no effect on the first invocation.
   */
  setCanvas(canvas: string | HTMLCanvasElement, skipEvents?: boolean) {
    const element = this.#validateCanvas(canvas)
    if (element === this.canvas) return
    // maybe detach events from oldCanvas
    if (!element && this.canvas && !skipEvents) this.unbindEvents()

    this.canvas = element
    this.ds.element = element
    this.pointer.element = element

    if (!element) return
    this.#setCursor = createCursorCache(element)

    // TODO: classList.add
    element.className += " lgraphcanvas"
    element.data = this

    // Background canvas: To render objects behind nodes (background, links, groups)
    this.bgcanvas = document.createElement("canvas")
    this.bgcanvas.width = this.canvas.width
    this.bgcanvas.height = this.canvas.height

    const ctx = element.getContext?.("2d")
    if (ctx == null) {
      if (element.localName != "canvas") {
        throw `Element supplied for LGraphCanvas must be a <canvas> element, you passed a ${element.localName}`
      }
      throw "This browser doesn't support Canvas"
    }
    this.ctx = ctx

    if (!skipEvents) this.bindEvents()
  }

  /** Prevents default for middle-click auxclick only. */
  preventMiddleAuxClick(e: MouseEvent): void {
    if (isMiddleButtonEvent(e)) e.preventDefault()
  }

  /**
   * binds mouse, keyboard, touch and drag events to the canvas
   */
  bindEvents(): void {
    if (this.#eventsBinded) {
      console.warn("LGraphCanvas: events already bound")
      return
    }

    const { canvas } = this
    // hack used when moving canvas between windows
    const { document } = this.getCanvasWindow()

    this.#mousedownCallback = this.processMouseDown.bind(this)
    this.#mousewheelCallback = this.processMouseWheel.bind(this)
    this.#mousemoveCallback = this.processMouseMove.bind(this)
    this.#mouseupCallback = this.processMouseUp.bind(this)
    this.#mouseoutCallback = this.processMouseOut.bind(this)
    this.#mousecancelCallback = this.processMouseCancel.bind(this)
    this.#subgraphOpenedCallback = this.processSubgraphOpened.bind(this)

    canvas.addEventListener("pointerdown", this.#mousedownCallback, { capture: true })
    canvas.addEventListener("wheel", this.#mousewheelCallback, { capture: false })

    canvas.addEventListener("pointerup", this.#mouseupCallback, { capture: true })
    canvas.addEventListener("pointermove", this.#mousemoveCallback)
    canvas.addEventListener("pointerout", this.#mouseoutCallback)
    canvas.addEventListener("pointercancel", this.#mousecancelCallback, { capture: true })

    canvas.addEventListener("contextmenu", this.#doNothing)
    // Prevent middle-click paste (PRIMARY clipboard on Linux) - fixes #4464
    canvas.addEventListener("auxclick", this.preventMiddleAuxClick)

    // Keyboard
    this.#keyCallback = this.processKey.bind(this)

    canvas.addEventListener("keydown", this.#keyCallback, { capture: true })
    // keyup event must be bound on the document
    document.addEventListener("keyup", this.#keyCallback, { capture: true })

    canvas.addEventListener("dragover", this.#doNothing, { capture: false })
    canvas.addEventListener("dragend", this.#doNothing, { capture: false })
    canvas.addEventListener("dragenter", this.#doReturnTrue, { capture: false })

    canvas.addEventListener("subgraph-opened", e => this.#subgraphOpenedCallback?.(e as CustomEvent))

    this.#eventsBinded = true
  }

  /**
   * unbinds mouse events from the canvas
   */
  unbindEvents(): void {
    if (!this.#eventsBinded) {
      console.warn("LGraphCanvas: no events bound")
      return
    }

    // console.log("pointerevents: unbindEvents");
    const { document } = this.getCanvasWindow()
    const { canvas } = this

    // Assertions: removing nullish is fine.
    canvas.removeEventListener("pointercancel", this.#mousecancelCallback!)
    canvas.removeEventListener("pointerout", this.#mouseoutCallback!)
    canvas.removeEventListener("pointermove", this.#mousemoveCallback!)
    canvas.removeEventListener("pointerup", this.#mouseupCallback!)
    canvas.removeEventListener("pointerdown", this.#mousedownCallback!)
    canvas.removeEventListener("wheel", this.#mousewheelCallback!)
    canvas.removeEventListener("keydown", this.#keyCallback!)
    document.removeEventListener("keyup", this.#keyCallback!)
    canvas.removeEventListener("contextmenu", this.#doNothing)
    canvas.removeEventListener("auxclick", this.preventMiddleAuxClick)
    canvas.removeEventListener("dragenter", this.#doReturnTrue)

    this.#mousedownCallback = undefined
    this.#mousewheelCallback = undefined
    this.#keyCallback = undefined

    this.#eventsBinded = false
  }

  /**
   * Ensures the canvas will be redrawn on the next frame by setting the dirty flag(s).
   * Without parameters, this function does nothing.
   * @todo Impl. `setDirty()` or similar as shorthand to redraw everything.
   * @param fgcanvas If true, marks the foreground canvas as dirty (nodes and anything drawn on top of them).  Default: false
   * @param bgcanvas If true, mark the background canvas as dirty (background, groups, links).  Default: false
   */
  setDirty(fgcanvas: boolean, bgcanvas?: boolean): void {
    if (fgcanvas) this.dirtyCanvas = true
    if (bgcanvas) this.dirtyBgCanvas = true
  }

  /**
   * Used to attach the canvas in a popup
   * @returns returns the window where the canvas is attached (the DOM root node)
   */
  getCanvasWindow(): Window {
    if (!this.canvas) return window

    const doc = this.canvas.ownerDocument
    // @ts-expect-error Check if required
    return doc.defaultView || doc.parentWindow
  }

  /**
   * starts rendering the content of the canvas when needed
   *
   */
  startRendering(): void {
    // already rendering
    if (this.isRendering) return

    this.isRendering = true
    renderFrame.call(this)

    /** Render loop */
    function renderFrame(this: LGraphCanvas) {
      if (!this.pauseRendering) {
        this.draw()
      }

      const window = this.getCanvasWindow()
      if (this.isRendering) {
        if (this.#maximumFrameGap > 0) {
          // Manual FPS limit
          const gap = this.#maximumFrameGap - (LiteGraph.getTime() - this.lastDrawTime)
          setTimeout(renderFrame.bind(this), Math.max(1, gap))
        } else {
          // FPS limited by refresh rate
          window.requestAnimationFrame(renderFrame.bind(this))
        }
      }
    }
  }

  /**
   * stops rendering the content of the canvas (to save resources)
   *
   */
  stopRendering(): void {
    this.isRendering = false
    /*
    if(this.renderingTimerId)
    {
        clearInterval(this.renderingTimerId);
        this.renderingTimerId = null;
    }
    */
  }

  /* LiteGraphCanvas input */
  // used to block future mouse events (because of im gui)
  blockClick(): void {
    this.#blockClick = true
    this.lastMouseClick = 0
  }

  /**
   * Gets the widget at the current cursor position.
   * @param node Optional node to check for widgets under cursor
   * @returns The widget located at the current cursor position, if any is found.
   * @deprecated Use `LGraphNode.getWidgetOnPos` instead.
   * ```ts
   * const [x, y] = canvas.graphMouse
   * const widget = canvas.nodeOver?.getWidgetOnPos(x, y, true)
   * ```
   */
  getWidgetAtCursor(node?: LGraphNode): IBaseWidget | undefined {
    node ??= this.nodeOver
    return node?.getWidgetOnPos(this.graphMouse[0], this.graphMouse[1], true)
  }

  /**
   * Clears highlight and mouse-over information from nodes that should not have it.
   *
   * Intended to be called when the pointer moves away from a node.
   * @param node The node that the mouse is now over
   * @param e MouseEvent that is triggering this
   */
  updateMouseOverNodes(node: LGraphNode | null, e: CanvasPointerEvent): void {
    if (!this.graph) throw new NullGraphError()

    const { pointer } = this
    const nodes = this.graph.nodes
    for (const otherNode of nodes) {
      if (otherNode.mouseOver && node != otherNode) {
        // mouse leave
        if (!pointer.eDown) pointer.resizeDirection = undefined
        otherNode.mouseOver = undefined
        this.#highlightInput = undefined
        this.#highlightPos = undefined
        this.linkConnector.overWidget = undefined

        // Hover transitions
        // TODO: Implement single lerp ease factor for current progress on hover in/out.
        // In drawNode, multiply by ease factor and differential value (e.g. bg alpha +0.5).
        otherNode.lostFocusAt = LiteGraph.getTime()

        this.nodeOver?.onMouseLeave?.(e)
        this.nodeOver = undefined
        this.dirtyCanvas = true
      }
    }
  }

  /** Primary pointer-down handler. Routes clicks to selection, dragging, linking, and widget interaction. */
  processMouseDown(e: PointerEvent): void {
    if (this.state.ghostNodeId != null) {
      if (e.button === 0) this.finalizeGhostPlacement(false)
      if (e.button === 2) this.finalizeGhostPlacement(true)
      e.stopPropagation()
      e.preventDefault()
      return
    }

    if (this.dragZoomEnabled && e.ctrlKey && e.shiftKey && !e.altKey && e.buttons) {
      this.#dragZoomStart = { pos: [e.x, e.y], scale: this.ds.scale }
      return
    }

    const { graph, pointer } = this
    this.adjustMouseEvent(e)
    if (e.isPrimary) pointer.down(e)

    if (this.setCanvasDirtyOnMouseEvent) this.dirtyCanvas = true

    if (!graph) return

    const refWindow = this.getCanvasWindow()
    LGraphCanvas.activeCanvas = this

    const x = e.clientX
    const y = e.clientY
    this.ds.viewport = this.viewport
    const isInside = !this.viewport || isInRect(x, y, this.viewport)

    if (!isInside) return

    const node = graph.getNodeOnPos(e.canvasX, e.canvasY, this.visibleNodes) ?? undefined

    this.mouse[0] = x
    this.mouse[1] = y
    this.graphMouse[0] = e.canvasX
    this.graphMouse[1] = e.canvasY
    this.lastClickPosition = [this.mouse[0], this.mouse[1]]

    pointer.isDouble = pointer.isDown && e.isPrimary
    pointer.isDown = true

    this.canvas.focus()

    LiteGraph.closeAllContextMenus(refWindow)

    if (this.onMouse?.(e) == true) return

    // left button mouse / single finger
    if (e.button === 0 && !pointer.isDouble) {
      this.#processPrimaryButton(e, node)
    } else if (isMiddleButtonEvent(e)) {
      this.#processMiddleButton(e, node)
    } else if (
      (e.button === 2 || pointer.isDouble) &&
      this.allowInteraction &&
      !this.readOnly
    ) {
      // Right / aux button
      const { linkConnector, subgraph } = this

      // Sticky select - won't remove single nodes
      if (subgraph?.inputNode.containsPoint(this.graphMouse)) {
        // Subgraph input node
        this.processSelect(subgraph.inputNode, e, true)
        subgraph.inputNode.onPointerDown(e, pointer, linkConnector)
      } else if (subgraph?.outputNode.containsPoint(this.graphMouse)) {
        // Subgraph output node
        this.processSelect(subgraph.outputNode, e, true)
        subgraph.outputNode.onPointerDown(e, pointer, linkConnector)
      } else {
        if (node) {
          this.processSelect(node, e, true)
        } else if (this.linksRenderMode !== LinkRenderType.HIDDEN_LINK) {
        // Reroutes
          const reroute = graph.getRerouteOnPos(e.canvasX, e.canvasY, this.#visibleReroutes)
          if (reroute) {
            if (e.altKey) {
              pointer.onClick = (upEvent) => {
                if (!upEvent.altKey) {
                  return
                }

                // Ensure deselected
                if (reroute.selected) {
                  this.deselect(reroute)
                  this.onSelectionChange?.(this.selectedNodes)
                }
                reroute.remove()
              }
            } else {
              this.processSelect(reroute, e, true)
            }
          }
        }

        // Show context menu for the node or group under the pointer
        pointer.onClick ??= () => this.processContextMenu(node, e)
      }
    }

    this.lastMouse = [x, y]
    this.lastMouseClick = LiteGraph.getTime()
    this.lastMouseDragging = true

    graph.change()

    // this is to ensure to defocus(blur) if a text input element is on focus
    if (
      !refWindow.document.activeElement ||
      (refWindow.document.activeElement.nodeName.toLowerCase() != "input" &&
        refWindow.document.activeElement.nodeName.toLowerCase() != "textarea")
    ) {
      e.preventDefault()
    }
    e.stopPropagation()

    this.onMouseDown?.(e)
  }

  /**
   * Called when a mouse move event has to be processed
   */
  processMouseMove(e: PointerEvent): void {
    if (this.dragZoomEnabled && e.ctrlKey && e.shiftKey && this.#dragZoomStart) {
      this.#processDragZoom(e)
      return
    }

    if (this.autoresize) this.resize()

    if (this.setCanvasDirtyOnMouseEvent) this.dirtyCanvas = true

    const { graph, resizingGroup, linkConnector, pointer, subgraph } = this
    if (!graph) return

    LGraphCanvas.activeCanvas = this
    this.adjustMouseEvent(e)
    const mouse: ReadOnlyPoint = [e.clientX, e.clientY]
    this.mouse[0] = mouse[0]
    this.mouse[1] = mouse[1]
    const delta = [
      mouse[0] - this.lastMouse[0],
      mouse[1] - this.lastMouse[1],
    ]
    this.lastMouse = mouse
    const { canvasX: x, canvasY: y } = e
    this.graphMouse[0] = x
    this.graphMouse[1] = y

    if (e.isPrimary) pointer.move(e)

    // See this.state.hoveringOver
    let underPointer = CanvasItem.Nothing
    if (subgraph) {
      underPointer |= subgraph.inputNode.onPointerMove(e)
      underPointer |= subgraph.outputNode.onPointerMove(e)
    }

    if (this.#blockClick) {
      e.preventDefault()
      return
    }

    e.dragging = this.lastMouseDragging

    if (this.nodeWidget) {
      // Legacy widget mouse callbacks for pointermove events
      const [node, widget] = this.nodeWidget

      if (widget?.mouse) {
        const relativeX = x - node.pos[0]
        const relativeY = y - node.pos[1]
        const result = widget.mouse(e, [relativeX, relativeY], node)
        if (result != null) this.dirtyCanvas = result
      }
    }

    // get node over
    const node = graph.getNodeOnPos(
      x,
      y,
      this.visibleNodes,
    )

    const dragRect = this.draggingRectangle
    if (dragRect) {
      dragRect[2] = x - dragRect[0]
      dragRect[3] = y - dragRect[1]
      this.dirtyCanvas = true
    } else if (resizingGroup) {
      // Resizing a group
      underPointer |= CanvasItem.Group
      pointer.resizeDirection = "SE"
    } else if (this.draggingCanvas) {
      this.ds.offset[0] += delta[0] / this.ds.scale
      this.ds.offset[1] += delta[1] / this.ds.scale
      this.#dirty()
    } else if (
      (this.allowInteraction || node?.flags.allowInteraction) &&
      !this.readOnly
    ) {
      if (linkConnector.isConnecting) {
        this.autoPan?.updatePointer(e.clientX, e.clientY)
        this.dirtyCanvas = true
      }

      // remove mouseover flag
      this.updateMouseOverNodes(node, e)

      // mouse over a node
      if (node) {
        underPointer |= CanvasItem.Node

        if (node.redrawOnMouse) this.dirtyCanvas = true

        // For input/output hovering
        // to store the output of isOverNodeInput
        const pos: Point = [0, 0]
        const inputId = isOverNodeInput(node, x, y, pos)
        const outputId = isOverNodeOutput(node, x, y, pos)
        const overWidget = node.getWidgetOnPos(x, y, true) ?? undefined

        if (!node.mouseOver) {
          // mouse enter
          node.mouseOver = {}
          this.nodeOver = node
          this.dirtyCanvas = true

          for (const reroute of this.#visibleReroutes) {
            reroute.hideSlots()
            this.dirtyBgCanvas = true
          }
          node.onMouseEnter?.(e)
        }

        // in case the node wants to do something
        node.onMouseMove?.(e, [x - node.pos[0], y - node.pos[1]], this)

        // The input the mouse is over has changed
        const { mouseOver } = node
        if (
          mouseOver.inputId !== inputId ||
          mouseOver.outputId !== outputId ||
          mouseOver.overWidget !== overWidget
        ) {
          mouseOver.inputId = inputId
          mouseOver.outputId = outputId
          mouseOver.overWidget = overWidget

          // State reset
          linkConnector.overWidget = undefined

          // Check if link is over anything it could connect to - record position of valid target for snap / highlight
          if (linkConnector.isConnecting) {
            const firstLink = linkConnector.renderLinks.at(0)

            // Default: nothing highlighted
            let highlightPos: Point | undefined
            let highlightInput: INodeInputSlot | undefined

            if (!firstLink || !linkConnector.isNodeValidDrop(node)) {
              // No link, or none of the dragged links may be dropped here
            } else if (linkConnector.state.connectingTo === "input") {
              if (overWidget) {
                // Check widgets first - inputId is only valid if over the input socket
                const slot = node.getSlotFromWidget(overWidget)

                if (slot && linkConnector.isInputValidDrop(node, slot)) {
                  highlightInput = slot
                  highlightPos = node.getInputSlotPos(slot)
                  linkConnector.overWidget = overWidget
                }
              }

              // Not over a valid widget - treat drop on invalid widget same as node background
              if (!linkConnector.overWidget) {
                if (inputId === -1 && outputId === -1) {
                // Node background / title under the pointer
                  const result = node.findInputByType(firstLink.fromSlot.type)
                  if (result) {
                    highlightInput = result.slot
                    highlightPos = node.getInputSlotPos(result.slot)
                  }
                } else if (
                  inputId != -1 &&
                  node.inputs[inputId] != null &&
                  LiteGraph.isValidConnection(firstLink.fromSlot.type, node.inputs[inputId].type)
                ) {
                  highlightPos = pos
                  // XXX CHECK THIS
                  highlightInput = node.inputs[inputId]
                }

                if (highlightInput) {
                  const widget = node.getWidgetFromSlot(highlightInput)
                  if (widget) linkConnector.overWidget = widget
                }
              }
            } else if (linkConnector.state.connectingTo === "output") {
              // Connecting from an input to an output
              if (inputId === -1 && outputId === -1) {
                const result = node.findOutputByType(firstLink.fromSlot.type)
                if (result) {
                  highlightPos = node.getOutputPos(result.index)
                }
              } else {
                // check if I have a slot below de mouse
                if (
                  outputId != -1 &&
                  node.outputs[outputId] !== undefined &&
                  node.outputs[outputId] !== null &&
                  LiteGraph.isValidConnection(firstLink.fromSlot.type, node.outputs[outputId].type)
                ) {
                  highlightPos = pos
                }
              }
            }
            this.#highlightPos = highlightPos
            this.#highlightInput = highlightInput
          }

          this.dirtyCanvas = true
        }

        // Resize direction - only show resize cursor if not over inputs/outputs/widgets
        if (!pointer.eDown) {
          if (inputId === -1 && outputId === -1 && !overWidget) {
            pointer.resizeDirection = node.findResizeDirection(x, y)
          } else {
            // Clear resize direction when over inputs/outputs/widgets
            pointer.resizeDirection &&= undefined
          }
        }
      } else {
        // Reroutes
        underPointer = this.#updateReroutes(underPointer)

        // Not over a node
        const segment = this.#getLinkCentreOnPos(e)
        if (this.overLinkCenter !== segment) {
          underPointer |= CanvasItem.Link
          this.overLinkCenter = segment
          this.dirtyBgCanvas = true
        }

        if (this.canvas) {
          const group = graph.getGroupOnPos(x, y)
          if (
            group &&
            !e.ctrlKey &&
            !this.readOnly &&
            group.isInResize(x, y)
          ) {
            pointer.resizeDirection = "SE"
          } else {
            pointer.resizeDirection &&= undefined
          }
        }
      }

      // send event to node if capturing input (used with widgets that allow drag outside of the area of the node)
      if (this.nodeCapturingInput && this.nodeCapturingInput != node) {
        this.nodeCapturingInput.onMouseMove?.(
          e,
          [
            x - this.nodeCapturingInput.pos[0],
            y - this.nodeCapturingInput.pos[1],
          ],
          this,
        )
      }

      // Items being dragged
      if (this.isDragging) {
        this.autoPan?.updatePointer(e.clientX, e.clientY)

        const selected = this.selectedItems
        this.#lastDragModifiers = { ctrlKey: e.ctrlKey, metaKey: e.metaKey }
        const allItems = getDraggedItems(selected, e)

        const deltaX = delta[0] / this.ds.scale
        const deltaY = delta[1] / this.ds.scale
        for (const item of allItems) {
          item.move(deltaX, deltaY, true)
        }

        this.#dirty()
      }
    }

    this.hoveringOver = underPointer

    e.preventDefault()
    return
  }

  /**
   * Starts ghost placement mode for a node.
   * The node will be semi-transparent and follow the cursor until the user
   * clicks to place it, or presses Escape/right-clicks to cancel.
   *
   * Dispatches `LGraphCanvasEventMap` `"litegraph:ghost-placement"` with `active: true`.
   * @param node The node to place
   * @param dragEvent Optional mouse event for positioning under cursor
   */
  startGhostPlacement(node: LGraphNode, dragEvent?: MouseEvent): void {
    if (this.state.ghostNodeId != null) this.finalizeGhostPlacement(true)

    this.emitBeforeChange()
    this.graph?.beforeChange()

    if (dragEvent) {
      this.adjustMouseEvent(dragEvent)
      const e = dragEvent as CanvasPointerEvent
      node.pos[0] = e.canvasX - node.size[0] / 2
      node.pos[1] = e.canvasY + 10
      this.lastMouse = [e.clientX, e.clientY]
    } else {
      node.pos[0] = this.graphMouse[0] - node.size[0] / 2
      node.pos[1] = this.graphMouse[1] + 10
    }

    this.state.ghostNodeId = node.id
    this.dispatchEvent("litegraph:ghost-placement", {
      active: true,
      nodeId: node.id,
    })

    this.deselectAll()
    this.select(node)
    this.isDragging = true

    this.#startNodeAutoPan()

    this.#ghostPointerHandler = (e: PointerEvent) => {
      this.processMouseMove(e)
    }
    document.addEventListener("pointermove", this.#ghostPointerHandler)
    document.documentElement.addEventListener(
      "pointerleave",
      this.#ghostPointerHandler,
    )

    this.#ghostKeyHandler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Delete" && e.key !== "Backspace") {
        return
      }
      this.finalizeGhostPlacement(true)
      e.stopPropagation()
      e.preventDefault()
    }
    document.addEventListener("keydown", this.#ghostKeyHandler, { capture: true })
  }

  /**
   * Finalizes ghost placement mode.
   *
   * Dispatches `LGraphCanvasEventMap` `"litegraph:ghost-placement"` with `active: false`
   * before removing or committing the node.
   * @param cancelled If true, the node is removed; otherwise it's placed
   */
  finalizeGhostPlacement(cancelled: boolean): void {
    const ownedGhostState =
      this.#ghostPointerHandler != null || this.#ghostKeyHandler != null

    if (this.#ghostPointerHandler) {
      document.removeEventListener("pointermove", this.#ghostPointerHandler)
      document.documentElement.removeEventListener(
        "pointerleave",
        this.#ghostPointerHandler,
      )
      this.#ghostPointerHandler = null
    }

    if (this.#ghostKeyHandler) {
      document.removeEventListener("keydown", this.#ghostKeyHandler, true)
      this.#ghostKeyHandler = null
    }

    if (ownedGhostState) {
      this.isDragging = false
      this.autoPan?.stop()
      this.autoPan = null
    }

    const nodeId = this.state.ghostNodeId
    if (nodeId == null) return

    this.state.ghostNodeId = null
    this.dispatchEvent("litegraph:ghost-placement", {
      active: false,
      nodeId,
    })

    const node = this.graph?.getNodeById(nodeId)
    if (!node) return

    if (cancelled) {
      this.deselect(node)
      this.graph?.remove(node)
    } else {
      delete node.flags.ghost
      this.state.selectionChanged = true
      this.onSelectionChange?.(this.selectedNodes)
    }

    this.dirtyCanvas = true
    this.dirtyBgCanvas = true

    this.graph?.afterChange()
    this.emitAfterChange()
  }

  /**
   * Called when a mouse up event has to be processed
   */
  processMouseUp(e: PointerEvent): void {
    // early exit for extra pointer
    if (e.isPrimary === false) return

    const { graph, pointer } = this
    if (!graph) return

    LGraphCanvas.activeCanvas = this

    this.adjustMouseEvent(e)

    const now = LiteGraph.getTime()
    e.clickTime = now - this.lastMouseClick

    /** The mouseup event occurred near the mousedown event. */
    /** Normal-looking click event - mouseUp occurred near mouseDown, without dragging. */
    const isClick = pointer.up(e)
    if (isClick === true) {
      pointer.isDown = false
      pointer.isDouble = false
      // Required until all link behaviour is added to Pointer API
      this.connectingLinks = null
      this.draggingCanvas = false

      graph.change()

      e.stopPropagation()
      e.preventDefault()
      return
    }

    this.lastMouseDragging = false
    this.lastClickPosition = null

    // used to avoid sending twice a click in an immediate button
    this.#blockClick &&= false

    if (e.button === 0) {
      // left button
      this.selectedGroup = null

      this.isDragging = false

      const x = e.canvasX
      const y = e.canvasY

      if (!this.linkConnector.isConnecting) {
        this.dirtyCanvas = true

        // @ts-expect-error Unused param
        this.nodeOver?.onMouseUp?.(e, [x - this.nodeOver.pos[0], y - this.nodeOver.pos[1]], this)
        this.nodeCapturingInput?.onMouseUp?.(e, [
          x - this.nodeCapturingInput.pos[0],
          y - this.nodeCapturingInput.pos[1],
        ])
      }
    } else if (isMiddleButtonEvent(e)) {
      // middle button
      this.dirtyCanvas = true
      this.draggingCanvas = false
    } else if (e.button === 2) {
      // right button
      this.dirtyCanvas = true
    }

    pointer.isDown = false
    pointer.isDouble = false

    graph.change()

    e.stopPropagation()
    e.preventDefault()
    return
  }

  /**
   * Called when the mouse moves off the canvas.  Clears all node hover states.
   * @param e
   */
  processMouseOut(e: PointerEvent): void {
    // TODO: Check if document.contains(e.relatedTarget) - handle mouseover node textarea etc.
    this.adjustMouseEvent(e)
    this.updateMouseOverNodes(null, e)
  }

  /** Handles pointer-cancel events (e.g. touch interruption), resetting drag and link state. */
  processMouseCancel(): void {
    console.warn("Pointer cancel!")
    this.pointer.reset()
  }

  /**
   * Called when a mouse wheel event has to be processed
   */
  processMouseWheel(e: WheelEvent): void {
    if (!this.graph || !this.allowDragCanvas) return

    this.adjustMouseEvent(e)

    const pos: Point = [e.clientX, e.clientY]
    if (this.viewport && !isPointInRect(pos, this.viewport)) return

    let { scale } = this.ds

    // Detect if this is a trackpad gesture or mouse wheel
    const isTrackpad = this.pointer.isTrackpadGesture(e)
    const isCtrlOrMacMeta =
      e.ctrlKey || (e.metaKey && navigator.platform.includes("Mac"))
    const isZoomModifier = isCtrlOrMacMeta && !e.altKey && !e.shiftKey

    if (isZoomModifier || LiteGraph.canvasNavigationMode === "legacy") {
      // Legacy mode or standard mode with ctrl - use wheel for zoom
      if (isTrackpad) {
        // Trackpad gesture - use smooth scaling
        scale *= 1 + e.deltaY * (1 - this.zoomSpeed) * 0.18
        this.ds.changeScale(scale, [e.clientX, e.clientY], false)
      } else {
        // Mouse wheel - use stepped scaling
        if (e.deltaY < 0) {
          scale *= this.zoomSpeed
        } else if (e.deltaY > 0) {
          scale *= 1 / this.zoomSpeed
        }
        this.ds.changeScale(scale, [e.clientX, e.clientY])
      }
    } else {
      // Standard mode without ctrl - use wheel / gestures to pan
      // Trackpads and mice work on significantly different scales
      const factor = isTrackpad ? 0.18 : 0.008_333

      if (!isTrackpad && e.shiftKey && e.deltaX === 0) {
        this.ds.offset[0] -= e.deltaY * (1 + factor) * (1 / scale)
      } else {
        this.ds.offset[0] -= e.deltaX * (1 + factor) * (1 / scale)
        this.ds.offset[1] -= e.deltaY * (1 + factor) * (1 / scale)
      }
    }

    this.graph.change()

    e.preventDefault()
    return
  }

  goBack() {
    console.log("going back")
    const parent = this.#navStack.pop()
    if (parent) this.setGraph(parent)
  }

  /**
   * process a key event
   */
  processKey(e: KeyboardEvent): void {
    this.#shiftDown = e.shiftKey

    const { graph } = this
    if (!graph) return

    // @ts-expect-error
    if (e.target.localName == "input") return

    let blockDefault = false

    if (e.type == "keydown") {
      // TODO: Switch
      if (e.key === " ") {
        // space
        this.readOnly = true
        if (this.#previouslyDraggingCanvas === null) {
          this.#previouslyDraggingCanvas = this.draggingCanvas
        }
        this.draggingCanvas = this.pointer.isDown
        blockDefault = true
      } else if (e.key === "Escape") {
        // esc
        if (this.linkConnector.isConnecting) {
          this.linkConnector.reset()
          e.preventDefault()
          return
        }
        this.nodePanel?.close()
        this.optionsPanel?.close()
        if (this.nodePanel || this.optionsPanel) blockDefault = true
        if (this.subgraph) this.goBack()
      } else if (e.key === "a" && e.ctrlKey) {
        // select all Control A
        this.selectItems()
        blockDefault = true
      } else if (e.key === "c" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        // copy
        if (this.selectedNodes) {
          this.copyToClipboard()
          blockDefault = true
        }
      } else if (e.key === "v" && (e.metaKey || e.ctrlKey)) {
        // paste
        this.pasteFromClipboard({ connectInputs: e.shiftKey })
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // delete or backspace
        // @ts-expect-error
        if (e.target.localName != "input" && e.target.localName != "textarea") {
          if (this.selectedItems.size === 0) {
            this.#noItemsSelected()
            return
          }

          this.deleteSelected()
          blockDefault = true
        }
      }

      // TODO
      for (const node of Object.values(this.selectedNodes)) {
        node.onKeyDown?.(e)
      }
    } else if (e.type == "keyup") {
      if (e.key === " ") {
        // space
        this.readOnly = false
        this.draggingCanvas = (this.#previouslyDraggingCanvas ?? false) && this.pointer.isDown
        this.#previouslyDraggingCanvas = null
      }

      for (const node of Object.values(this.selectedNodes)) {
        node.onKeyUp?.(e)
      }
    }

    // TODO: Do we need to remeasure and recalculate everything on every key down/up?
    graph.change()

    if (blockDefault) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }

  /**
   * Called when a subgraph is opened.
   * @param e The event object.
   */
  processSubgraphOpened(e: CustomEvent) {
    // Subgraph nav stack, to allow for going back to the parent graph
    const { closingGraph } = e.detail
    this.#navStack.push(closingGraph)
  }

  /**
   * Copies canvas items to an internal, app-specific clipboard backed by local storage.
   * When called without parameters, it copies `selectedItems`.
   * @param items The items to copy.  If nullish, all selected items are copied.
   */
  copyToClipboard(items?: Iterable<Positionable>): void {
    localStorage.setItem(
      "litegraphEditorClipboard",
      JSON.stringify(this.#serializeItems(items)),
    )
  }

  emitEvent(detail: LGraphCanvasEventMap["litegraph:canvas"]): void {
    this.canvas.dispatchEvent(
      new CustomEvent("litegraph:canvas", {
        bubbles: true,
        detail,
      }),
    )
  }

  /** @todo Refactor to where it belongs - e.g. Deleting / creating nodes is not actually canvas event. */
  emitBeforeChange(): void {
    this.emitEvent({
      subType: "before-change",
    })
  }

  /** @todo See `emitBeforeChange` */
  emitAfterChange(): void {
    this.emitEvent({
      subType: "after-change",
    })
  }

  /**
   * Pastes the items from the canvas "clipbaord" - a local storage variable.
   */
  pasteFromClipboard(options: IPasteFromClipboardOptions = {}): ClipboardPasteResult | undefined {
    this.emitBeforeChange()
    try {
      const data = localStorage.getItem("litegraphEditorClipboard")
      if (!data) return
      return this.#deserializeItems(JSON.parse(data), options)
    } finally {
      this.emitAfterChange()
    }
  }

  processNodeDblClicked(n: LGraphNode): void {
    this.onShowNodePanel?.(n)
    this.onNodeDblClicked?.(n)

    this.setDirty(true)
  }

  /**
   * Determines whether to select or deselect an item that has received a pointer event.  Will deselect other nodes if
   * @param item Canvas item to select/deselect
   * @param e The MouseEvent to handle
   * @param sticky Prevents deselecting individual nodes (as used by aux/right-click)
   * @remarks
   * Accessibility: anyone using `multiSelect` always deselects when clicking empty space.
   */
  processSelect<TPositionable extends Positionable = LGraphNode>(
    item: TPositionable | null | undefined,
    e: CanvasPointerEvent | undefined,
    sticky: boolean = false,
  ): void {
    const addModifier = e?.shiftKey
    const subtractModifier = e != null && (e.metaKey || e.ctrlKey)
    const eitherModifier = addModifier || subtractModifier
    const modifySelection = eitherModifier || this.multiSelect

    if (!item) {
      if (!eitherModifier || this.multiSelect) this.deselectAll()
    } else if (!item.selected || !this.selectedItems.has(item)) {
      if (!modifySelection) this.deselectAll(item)
      this.select(item)
    } else if (modifySelection && !sticky) {
      // Modifier-click toggles only the clicked item, not its children.
      // Cascade on select is a convenience; cascade on deselect would
      // remove the user's ability to keep children selected (e.g. for
      // deletion) after toggling the group off.
      if (item instanceof LGraphGroup && this.groupSelectChildren) {
        item.selected = false
        this.selectedItems.delete(item)
        this.state.selectionChanged = true
      } else {
        this.deselect(item)
      }
    } else if (!sticky) {
      this.deselectAll(item)
    } else {
      return
    }
    this.onSelectionChange?.(this.selectedNodes)
    this.setDirty(true)
  }

  /**
   * Selects a `Positionable` item.
   * @param item The canvas item to add to the selection.
   */
  select<TPositionable extends Positionable = LGraphNode>(item: TPositionable): void {
    if (item.selected && this.selectedItems.has(item)) return

    item.selected = true
    this.selectedItems.add(item)
    this.state.selectionChanged = true

    if (item instanceof LGraphGroup) {
      item.recomputeInsideNodes()
      if (this.groupSelectChildren) {
        this.#traverseGroupChildren(
          item,
          (child) => {
            if (!(!child.selected || !this.selectedItems.has(child))) {
              return
            }

            child.selected = true
            this.selectedItems.add(child)
            this.state.selectionChanged = true
          },
          child => this.select(child),
        )
      }
      return
    }

    if (!(item instanceof LGraphNode)) return

    // Node-specific handling
    item.onSelected?.()
    this.selectedNodes[item.id] = item

    this.onNodeSelected?.(item)

    // Highlight links
    if (item.inputs) {
      for (const input of item.inputs) {
        if (input.link == null) continue
        this.highlightedLinks[input.link] = true
      }
    }
    if (item.outputs) {
      for (const id of item.outputs.flatMap(x => x.links)) {
        if (id == null) continue
        this.highlightedLinks[id] = true
      }
    }
  }

  /**
   * Deselects a `Positionable` item.
   * @param item The canvas item to remove from the selection.
   */
  deselect<TPositionable extends Positionable = LGraphNode>(item: TPositionable): void {
    if (!item.selected && !this.selectedItems.has(item)) return

    item.selected = false
    this.selectedItems.delete(item)
    this.state.selectionChanged = true

    if (item instanceof LGraphGroup) {
      if (this.groupSelectChildren) {
        this.#traverseGroupChildren(
          item,
          (child) => {
            if (!(child.selected || this.selectedItems.has(child))) {
              return
            }

            child.selected = false
            this.selectedItems.delete(child)
            this.state.selectionChanged = true
          },
          child => this.deselect(child),
        )
      }
      return
    }

    if (!(item instanceof LGraphNode)) return

    // Node-specific handling
    item.onDeselected?.()
    delete this.selectedNodes[item.id]

    this.onNodeDeselected?.(item)

    // Should be moved to top of function, and throw if null
    const { graph } = this
    if (!graph) return

    // Clear link highlight
    if (item.inputs) {
      for (const input of item.inputs) {
        if (input.link == null) continue

        const node = LLink.getOriginNode(graph, input.link)
        if (node && this.selectedItems.has(node)) continue

        delete this.highlightedLinks[input.link]
      }
    }
    if (item.outputs) {
      for (const id of item.outputs.flatMap(x => x.links)) {
        if (id == null) continue

        const node = LLink.getTargetNode(graph, id)
        if (node && this.selectedItems.has(node)) continue

        delete this.highlightedLinks[id]
      }
    }
  }

  /** @deprecated See `LGraphCanvas.processSelect` */
  processNodeSelected(item: LGraphNode, e: CanvasPointerEvent): void {
    this.processSelect(
      item,
      e,
      e && (e.shiftKey || e.metaKey || e.ctrlKey || this.multiSelect),
    )
  }

  /** @deprecated See `LGraphCanvas.select` */
  selectNode(node: LGraphNode, addToCurrentSelection?: boolean): void {
    if (node == null) {
      this.deselectAll()
    } else {
      this.selectNodes([node], addToCurrentSelection)
    }
  }

  get empty(): boolean {
    if (!this.graph) throw new NullGraphError()
    return this.graph.empty
  }

  get positionableItems() {
    if (!this.graph) throw new NullGraphError()
    return this.graph.positionableItems()
  }

  /**
   * Selects several items.
   * @param items Items to select - if falsy, all items on the canvas will be selected
   * @param addToCurrentSelection If set, the items will be added to the current selection instead of replacing it
   */
  selectItems(items?: Positionable[], addToCurrentSelection?: boolean): void {
    const itemsToSelect = items ?? this.positionableItems
    if (!addToCurrentSelection) this.deselectAll()
    for (const item of itemsToSelect) this.select(item)
    this.onSelectionChange?.(this.selectedNodes)
    this.setDirty(true)
  }

  /**
   * selects several nodes (or adds them to the current selection)
   * @deprecated See `LGraphCanvas.selectItems`
   */
  selectNodes(nodes?: LGraphNode[], addToCurrentSelection?: boolean): void {
    this.selectItems(nodes, addToCurrentSelection)
  }

  /** @deprecated See `LGraphCanvas.deselect` */
  deselectNode(node: LGraphNode): void {
    this.deselect(node)
  }

  /**
   * Deselects all items on the canvas.
   * @param keepSelected If set, this item will not be removed from the selection.
   */
  deselectAll(keepSelected?: Positionable): void {
    if (!this.graph) return

    const selected = this.selectedItems
    if (!selected.size) return

    let wasSelected: Positionable | undefined
    for (const sel of selected) {
      if (sel === keepSelected) {
        wasSelected = sel
        continue
      }
      sel.onDeselected?.()
      sel.selected = false
    }
    selected.clear()
    if (wasSelected) selected.add(wasSelected)

    this.setDirty(true)

    // Legacy code
    const oldNode = keepSelected?.id == null ? null : this.selectedNodes[keepSelected.id]
    this.selectedNodes = {}
    this.currentNode = null
    this.highlightedLinks = {}

    if (keepSelected instanceof LGraphNode) {
      // Handle old object lookup
      if (oldNode) this.selectedNodes[oldNode.id] = oldNode

      // Highlight links
      if (keepSelected.inputs) {
        for (const input of keepSelected.inputs) {
          if (input.link == null) continue
          this.highlightedLinks[input.link] = true
        }
      }
      if (keepSelected.outputs) {
        for (const id of keepSelected.outputs.flatMap(x => x.links)) {
          if (id == null) continue
          this.highlightedLinks[id] = true
        }
      }
    }

    this.state.selectionChanged = true
    this.onSelectionChange?.(this.selectedNodes)
  }

  /** @deprecated See `LGraphCanvas.deselectAll` */
  deselectAllNodes(): void {
    this.deselectAll()
  }

  /**
   * Deletes all selected items from the graph.
   * @todo Refactor deletion task to LGraph.  Selection is a canvas property, delete is a graph action.
   */
  deleteSelected(): void {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    this.emitBeforeChange()
    graph.beforeChange()

    // Snapshot to prevent mutation during iteration (e.g. group deselect cascade)
    const toDelete = [...this.selectedItems]
    for (const item of toDelete) {
      if (item instanceof LGraphNode) {
        const node = item
        if (node.blockDelete) continue
        node.connectInputToOutput()
        graph.remove(node)
        this.onNodeDeselected?.(node)
      } else if (item instanceof LGraphGroup) {
        graph.remove(item)
      } else if (item instanceof Reroute) {
        graph.removeReroute(item.id)
      }
    }

    this.selectedNodes = {}
    this.selectedItems.clear()
    this.currentNode = null
    this.highlightedLinks = {}

    this.state.selectionChanged = true
    this.onSelectionChange?.(this.selectedNodes)
    this.setDirty(true)
    graph.afterChange()
    this.emitAfterChange()
  }

  /**
   * deletes all nodes in the current selection from the graph
   * @deprecated See `LGraphCanvas.deleteSelected`
   */
  deleteSelectedNodes(): void {
    this.deleteSelected()
  }

  /**
   * centers the camera on a given node
   */
  centerOnNode(node: LGraphNode): void {
    const dpi = window?.devicePixelRatio || 1
    this.ds.offset[0] =
      -node.pos[0] -
      node.size[0] * 0.5 +
      (this.canvas.width * 0.5) / (this.ds.scale * dpi)
    this.ds.offset[1] =
      -node.pos[1] -
      node.size[1] * 0.5 +
      (this.canvas.height * 0.5) / (this.ds.scale * dpi)
    this.setDirty(true, true)
  }

  /**
   * adds some useful properties to a mouse event, like the position in graph coordinates
   */
  adjustMouseEvent<T extends MouseEvent>(
    e: T & Partial<CanvasPointerExtensions>,
  ): asserts e is T & CanvasPointerEvent {
    let clientXRel = e.clientX
    let clientYRel = e.clientY

    if (this.canvas) {
      const b = this.canvas.getBoundingClientRect()
      clientXRel -= b.left
      clientYRel -= b.top
    }

    e.safeOffsetX = clientXRel
    e.safeOffsetY = clientYRel

    // TODO: Find a less brittle way to do this

    // Only set deltaX and deltaY if not already set.
    // If deltaX and deltaY are already present, they are read-only.
    // Setting them would result browser error => zoom in/out feature broken.
    if (e.deltaX === undefined)
      e.deltaX = clientXRel - this.lastMousePosition[0]
    if (e.deltaY === undefined)
      e.deltaY = clientYRel - this.lastMousePosition[1]

    this.lastMousePosition[0] = clientXRel
    this.lastMousePosition[1] = clientYRel

    e.canvasX = clientXRel / this.ds.scale - this.ds.offset[0]
    e.canvasY = clientYRel / this.ds.scale - this.ds.offset[1]
  }

  /**
   * changes the zoom level of the graph (default is 1), you can pass also a place used to pivot the zoom
   */
  setZoom(value: number, zoomingCenter: Point) {
    this.ds.changeScale(value, zoomingCenter)
    this.#dirty()
  }

  /**
   * converts a coordinate from graph coordinates to canvas2D coordinates
   */
  convertOffsetToCanvas(pos: Point, out: Point): Point {
    // @ts-expect-error Unused param
    return this.ds.convertOffsetToCanvas(pos, out)
  }

  /**
   * converts a coordinate from Canvas2D coordinates to graph space
   */
  convertCanvasToOffset(pos: Point, out?: Point): Point {
    return this.ds.convertCanvasToOffset(pos, out)
  }

  // converts event coordinates from canvas2D to graph coordinates
  convertEventToCanvasOffset(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    // TODO: -> this.ds.convertCanvasToOffset
    return this.convertCanvasToOffset([
      e.clientX - rect.left,
      e.clientY - rect.top,
    ])
  }

  /**
   * brings a node to front (above all other nodes)
   */
  bringToFront(node: LGraphNode): void {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    const i = graph.nodes.indexOf(node)
    if (i == -1) return

    graph.nodes.splice(i, 1)
    graph.nodes.push(node)
  }

  /**
   * sends a node to the back (below all other nodes)
   */
  sendToBack(node: LGraphNode): void {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    const i = graph.nodes.indexOf(node)
    if (i == -1) return

    graph.nodes.splice(i, 1)
    graph.nodes.unshift(node)
  }

  /**
   * Determines which nodes are visible and populates `out` with the results.
   * @param nodes The list of nodes to check - if falsy, all nodes in the graph will be checked
   * @param out Array to write visible nodes into - if falsy, a new array is created instead
   * @returns Array passed (`out`), or a new array containing all visible nodes
   */
  computeVisibleNodes(nodes?: LGraphNode[], out?: LGraphNode[]): LGraphNode[] {
    const visibleNodes = out || []
    visibleNodes.length = 0
    if (!this.graph) throw new NullGraphError()

    const _nodes = nodes || this.graph.nodes
    for (const node of _nodes) {
      node.updateArea(this.ctx)
      // Not in visible area
      if (!overlapBounding(this.visibleArea, node.renderArea)) continue

      visibleNodes.push(node)
    }
    return visibleNodes
  }

  /**
   * Checks if a node is visible on the canvas.
   * @param node The node to check
   * @returns `true` if the node is visible, otherwise `false`
   */
  isNodeVisible(node: LGraphNode): boolean {
    return this.#visibleNodeIds.has(node.id)
  }

  /**
   * renders the whole canvas content, by rendering in two separated canvas, one containing the background grid and the connections, and one containing the nodes)
   */
  draw(forceCanvas?: boolean, forceBgCanvas?: boolean): void {
    if (!this.canvas || this.canvas.width == 0 || this.canvas.height == 0) return

    // fps counting
    const now = LiteGraph.getTime()
    this.renderTime = (now - this.lastDrawTime) * 0.001
    this.lastDrawTime = now

    if (this.graph) this.ds.computeVisibleArea(this.viewport)

    // Compute node size before drawing links.
    if (this.dirtyCanvas || forceCanvas) {
      this.computeVisibleNodes(undefined, this.visibleNodes)
      // Update visible node IDs
      this.#visibleNodeIds = new Set(this.visibleNodes.map(node => node.id))

      // Arrange subgraph IO nodes
      const { subgraph } = this
      if (subgraph) {
        subgraph.inputNode.arrange()
        subgraph.outputNode.arrange()
      }
    }

    if (
      this.dirtyBgCanvas ||
      forceBgCanvas ||
      this.alwaysRenderBackground ||
      (this.graph?.lastTriggerTime &&
        now - this.graph.lastTriggerTime < 1000)
    ) {
      this.drawBackCanvas()
    }

    if (this.dirtyCanvas || forceCanvas) this.drawFrontCanvas()

    this.fps = this.renderTime ? 1.0 / this.renderTime : 0
    this.frame++
  }

  /**
   * draws the front canvas (the one containing all the nodes)
   */
  drawFrontCanvas(): void {
    clearTextMeasureCache()
    this.dirtyCanvas = false

    const { ctx, canvas, graph, linkConnector } = this

    // @ts-expect-error
    if (ctx.start2D && !this.viewport) {
      // @ts-expect-error
      ctx.start2D()
      ctx.restore()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }

    // clip dirty area if there is one, otherwise work in full canvas
    const area = this.viewport || this.dirtyArea
    if (area) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(area[0], area[1], area[2], area[3])
      ctx.clip()
    }

    // TODO: Set snapping value when changed instead of once per frame
    this.#snapToGrid = this.#shiftDown || LiteGraph.alwaysSnapToGrid
      ? this.graph?.getSnapToGridSize()
      : undefined

    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // clear
    // canvas.width = canvas.width;
    if (this.clearBackground) {
      if (area) ctx.clearRect(area[0], area[1], area[2], area[3])
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    // draw bg canvas (device pixels; graph overlay uses CSS coords below)
    if (this.bgcanvas == this.canvas) {
      this.drawBackCanvas()
    } else {
      ctx.drawImage(this.bgcanvas, 0, 0)
    }

    const view = canvas.ownerDocument.defaultView ?? window
    const dpr = Math.max(view.devicePixelRatio ?? 1, 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // rendering
    this.onRender?.(canvas, ctx)

    // info widget
    if (this.showInfo) {
      this.renderInfo(ctx, area ? area[0] : 0, area ? area[1] : 0)
    }

    if (graph) {
      // apply transformations
      ctx.save()
      this.ds.toCanvasContext(ctx)

      // draw nodes
      const { visibleNodes } = this
      const drawSnapGuides = this.#snapToGrid && this.isDragging

      for (const node of visibleNodes) {
        ctx.save()

        // Draw snap shadow
        if (drawSnapGuides && this.selectedItems.has(node))
          this.drawSnapGuide(ctx, node)

        // Localise co-ordinates to node position
        ctx.translate(node.pos[0], node.pos[1])

        // Draw
        this.drawNode(node, ctx)

        ctx.restore()
      }

      // Draw subgraph IO nodes
      this.subgraph?.draw(ctx, this.colourGetter, this.linkConnector.renderLinks[0]?.fromSlot, this.editorAlpha)

      // on top (debug)
      if (this.renderExecutionOrder) {
        this.drawExecutionOrder(ctx)
      }

      // connections ontop?
      if (graph.config.linksOnTop) {
        this.drawConnections(ctx)
      }

      if (linkConnector.isConnecting) {
        // current connection (the one being dragged by the mouse)
        const { renderLinks } = linkConnector
        const highlightPos = this.#getHighlightPosition()
        ctx.lineWidth = this.connectionsWidth

        for (const renderLink of renderLinks) {
          const { fromSlot, fromPos: pos, fromDirection, dragDirection } = renderLink
          const connShape = fromSlot.shape
          const connType = fromSlot.type

          const colour = connType === LiteGraph.EVENT
            ? LiteGraph.EVENT_LINK_COLOR
            : LiteGraph.CONNECTING_LINK_COLOR

          // the connection being dragged by the mouse
          this.renderLink(
            ctx,
            pos,
            highlightPos,
            null,
            false,
            null,
            colour,
            fromDirection,
            dragDirection,
          )

          const path = new Path2D()

          if (connType === LiteGraph.EVENT || connShape === RenderShape.BOX) {
            path.rect(pos[0] - 6 + 0.5, pos[1] - 5 + 0.5, 14, 10)
            path.rect(
              highlightPos[0] - 6 + 0.5,
              highlightPos[1] - 5 + 0.5,
              14,
              10,
            )
          } else if (connShape === RenderShape.ARROW) {
            path.moveTo(pos[0] + 8, pos[1] + 0.5)
            path.lineTo(pos[0] - 4, pos[1] + 6 + 0.5)
            path.lineTo(pos[0] - 4, pos[1] - 6 + 0.5)
            path.closePath()
          } else {
            path.arc(pos[0], pos[1], 4, 0, Math.PI * 2)
            path.arc(highlightPos[0], highlightPos[1], 4, 0, Math.PI * 2)
          }
          // eslint-disable-next-line unicorn/no-array-fill-with-reference-type
          ctx.fill(path)
          if (renderLink instanceof MovingInputLink) this.setDirty(false, true)
        }

        // Gradient half-border over target node
        this.#renderSnapHighlight(ctx, highlightPos)

        // for (const link of renderLinks) {
        //   if (!("disconnectOnDrop" in link) || !link.disconnectOnDrop) continue
        //   if (!("disconnectOrigin" in link) || !link.disconnectOrigin) continue

        //   const [originX, originY] = link.disconnectOrigin
        //   const radius = 35
        //   const distSquared = (originX - highlightPos[0]) ** 2 + (originY - highlightPos[1]) ** 2

        //   ctx.save()
        //   ctx.strokeStyle = LiteGraph.WIDGET_OUTLINE_COLOR
        //   ctx.lineWidth = 2
        //   const path = new Path2D()
        //   path.moveTo(originX + radius, originY)
        //   path.arc(originX, originY, radius, 0, Math.PI * 2)
        //   ctx.stroke(path)
        //   ctx.restore()

        //   link.disconnectOnDrop = distSquared < radius ** 2
        // }
      }

      // Area-selection rectangle
      if (this.draggingRectangle) {
        const { eDown, eMove } = this.pointer
        ctx.strokeStyle = "#FFF"

        if (eDown && eMove) {
          // Do not scale the selection box
          const transform = ctx.getTransform()
          const ratio = Math.max(1, window.devicePixelRatio)
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

          const x = eDown.safeOffsetX
          const y = eDown.safeOffsetY
          ctx.strokeRect(x, y, eMove.safeOffsetX - x, eMove.safeOffsetY - y)

          ctx.setTransform(transform)
        } else {
          // Fallback to legacy behaviour
          const [x, y, w, h] = this.draggingRectangle
          ctx.strokeRect(x, y, w, h)
        }
      }

      // on top of link center
      if (!this.isDragging && this.overLinkCenter && this.renderLinkTooltip) {
        this.drawLinkTooltip(ctx, this.overLinkCenter)
      } else {
        this.onDrawLinkTooltip?.(ctx, null)
      }

      // custom info
      this.onDrawForeground?.(ctx, this.visibleArea)

      ctx.restore()
    }

    this.onDrawOverlay?.(ctx)

    if (area) ctx.restore()
  }

  /**
   * draws some useful stats in the corner of the canvas
   */
  renderInfo(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    x = x || 10
    y = y ||
      this.canvas.height /
      ((this.canvas.ownerDocument.defaultView ?? window).devicePixelRatio ||
        1) -
        80

    ctx.save()
    ctx.translate(x, y)

    ctx.font = `10px ${LiteGraph.DEFAULT_FONT}`
    ctx.fillStyle = "#888"
    ctx.textAlign = "left"
    if (this.graph) {
      ctx.fillText(`T: ${this.graph.globaltime.toFixed(2)}s`, 5, 13 * 1)
      ctx.fillText(`I: ${this.graph.iteration}`, 5, 13 * 2)
      ctx.fillText(`N: ${this.graph.nodes.length} [${this.visibleNodes.length}]`, 5, 13 * 3)
      ctx.fillText(`V: ${this.graph.version}`, 5, 13 * 4)
      ctx.fillText(`FPS:${this.fps.toFixed(2)}`, 5, 13 * 5)
    } else {
      ctx.fillText("No graph selected", 5, 13 * 1)
    }
    ctx.restore()
  }

  /**
   * draws the back canvas (the one containing the background and the connections)
   */
  drawBackCanvas(): void {
    const canvas = this.bgcanvas
    if (
      canvas.width != this.canvas.width ||
      canvas.height != this.canvas.height
    ) {
      canvas.width = this.canvas.width
      canvas.height = this.canvas.height
    }

    if (!this.bgctx) {
      this.bgctx = this.bgcanvas.getContext("2d")
    }
    const ctx = this.bgctx
    if (!ctx) throw new TypeError("Background canvas context was null.")

    const viewport = this.viewport || [0, 0, ctx.canvas.width, ctx.canvas.height]

    // clear
    if (this.clearBackground) {
      ctx.clearRect(viewport[0], viewport[1], viewport[2], viewport[3])
    }

    const bgAlreadyPainted = this.onRenderBackground
      ? this.onRenderBackground(canvas, ctx)
      : false

    // reset in case of error
    if (!this.viewport) {
      const scale = window.devicePixelRatio
      ctx.restore()
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    }

    if (this.graph) {
      // apply transformations
      ctx.save()
      this.ds.toCanvasContext(ctx)

      // render BG
      if (
        this.ds.scale < 1.5 &&
        !bgAlreadyPainted &&
        this.clearBackgroundColor
      ) {
        ctx.fillStyle = this.clearBackgroundColor
        ctx.fillRect(
          this.visibleArea[0],
          this.visibleArea[1],
          this.visibleArea[2],
          this.visibleArea[3],
        )
      }

      if (this.backgroundImage && this.ds.scale > 0.5 && !bgAlreadyPainted) {
        if (this.zoomModifyAlpha) {
          ctx.globalAlpha = (1.0 - 0.5 / this.ds.scale) * this.editorAlpha
        } else {
          ctx.globalAlpha = this.editorAlpha
        }
        ctx.imageSmoothingEnabled = false
        if (!this.#bgImg || this.#bgImg.name != this.backgroundImage) {
          this.#bgImg = new Image()
          this.#bgImg.name = this.backgroundImage
          this.#bgImg.src = this.backgroundImage
          const that = this
          this.#bgImg.addEventListener("load", function () {
            that.draw(true, true)
          })
        }

        let pattern = this.#pattern
        if (pattern == null && this.#bgImg.width > 0) {
          pattern = ctx.createPattern(this.#bgImg, "repeat") ?? undefined
          // this.#patternImg = this.#bgImg
          this.#pattern = pattern
        }

        // NOTE: This ridiculous kludge provides a significant performance increase when rendering many large (> canvas width) paths in HTML canvas.
        // I could find no documentation or explanation.  Requires that the BG image is set.
        if (pattern) {
          ctx.fillStyle = pattern
          ctx.fillRect(
            this.visibleArea[0],
            this.visibleArea[1],
            this.visibleArea[2],
            this.visibleArea[3],
          )
          ctx.fillStyle = "transparent"
        }

        ctx.globalAlpha = 1.0
        ctx.imageSmoothingEnabled = true
      }

      // groups
      if (this.graph.groups.length) {
        this.drawGroups(canvas, ctx)
      }

      this.onDrawBackground?.(ctx, this.visibleArea)

      // DEBUG: show clipping area
      // ctx.fillStyle = "red";
      // ctx.fillRect( this.visibleArea[0] + 10, this.visibleArea[1] + 10, this.visibleArea[2] - 20, this.visibleArea[3] - 20);
      // bg
      if (this.renderCanvasBorder) {
        ctx.strokeStyle = "#235"
        ctx.strokeRect(0, 0, canvas.width, canvas.height)
      }

      if (this.renderConnectionsShadows) {
        ctx.shadowColor = "#000"
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.shadowBlur = 6
      } else {
        ctx.shadowColor = "rgba(0,0,0,0)"
      }

      // render disconnect circles
      const { linkConnector } = this
      if (linkConnector.isConnecting) {
        const { renderLinks } = linkConnector
        const highlightPos = this.#getHighlightPosition()

        this.#renderDisconnectCircles(ctx, highlightPos, renderLinks)
      }
      // draw connections
      this.drawConnections(ctx)

      ctx.shadowColor = "rgba(0,0,0,0)"

      // restore state
      ctx.restore()
    }

    this.dirtyBgCanvas = false
    // Forces repaint of the front canvas.
    this.dirtyCanvas = true
  }

  drawNode(node: LGraphNode, ctx: CanvasRenderingContext2D): void {
    this.currentNode = node

    const color = node.renderingColor
    const bgcolor = node.renderingBgColor

    const { lowQuality } = this
    const editorAlpha = this.#getNodeModeAlpha(node)
    ctx.globalAlpha = editorAlpha

    if (this.renderShadows && !lowQuality) {
      ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR
      ctx.shadowOffsetX = 2 * this.ds.scale
      ctx.shadowOffsetY = 2 * this.ds.scale
      ctx.shadowBlur = 3 * this.ds.scale
    } else {
      ctx.shadowColor = "transparent"
    }

    // custom draw collapsed method (draw after shadows because they are affected)
    if (node.flags.collapsed && node.onDrawCollapsed?.(ctx, this) == true)
      return

    // clip if required (mask)
    const shape = node.shape || RenderShape.BOX
    const size = LGraphCanvas.#tempVec2
    size.set(node.renderingSize)

    if (node.collapsed) {
      ctx.font = this.innerTextFont
    }

    if (node.clipArea) {
      // Start clipping
      ctx.save()
      ctx.beginPath()
      if (shape == RenderShape.BOX) {
        ctx.rect(0, 0, size[0], size[1])
      } else if (shape == RenderShape.ROUND) {
        ctx.roundRect(0, 0, size[0], size[1], [10])
      } else if (shape == RenderShape.CIRCLE) {
        ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI * 2)
      }
      ctx.clip()
    }

    // draw shape
    this.drawNodeShape(
      node,
      ctx,
      size,
      color,
      bgcolor,
      !!node.selected,
    )

    // Render title buttons (if not collapsed)
    if (node.titleButtons && !node.flags.collapsed) {
      const titleHeight = LiteGraph.NODE_TITLE_HEIGHT
      let currentX = size[0] // Start flush with right edge

      for (let i = 0; i < node.titleButtons.length; i++) {
        const button = node.titleButtons[i]
        if (!button.visible) {
          continue
        }

        const buttonWidth = button.getWidth(ctx)
        currentX -= buttonWidth

        // Center button vertically in title bar
        const buttonY = -titleHeight + (titleHeight - button.height) / 2

        button.draw(ctx, currentX, buttonY)
        currentX -= 2
      }
    }

    if (!lowQuality) {
      node.drawBadges(ctx)
    }

    ctx.shadowColor = "transparent"

    // TODO: Legacy behaviour: onDrawForeground received ctx in this state
    ctx.strokeStyle = LiteGraph.NODE_BOX_OUTLINE_COLOR

    // Draw Foreground
    node.onDrawForeground?.(ctx, this, this.canvas)

    // connection slots
    ctx.font = this.innerTextFont

    // render inputs and outputs
    node.setConcreteSlots()
    if (!node.collapsed) {
      node.arrange()
      node.drawSlots(ctx, {
        fromSlot: this.linkConnector.renderLinks[0]?.fromSlot as INodeOutputSlot | INodeInputSlot,
        colorContext: this.colourGetter,
        editorAlpha: editorAlpha,
        lowQuality: this.lowQuality,
      })

      ctx.textAlign = "left"
      ctx.globalAlpha = 1

      this.drawNodeWidgets(node, null, ctx)
    } else if (this.renderCollapsedSlots) {
      node.drawCollapsedSlots(ctx)
    }

    if (node.clipArea) {
      ctx.restore()
    }

    ctx.globalAlpha = 1.0
  }

  /**
   * Draws the link mouseover effect and tooltip.
   * @param ctx Canvas 2D context to draw on
   * @param link The link to render the mouseover effect for
   * @remarks
   * Called against `LGraphCanvas.overLinkCenter`.
   * @todo Split tooltip from hover, so it can be drawn / eased separately
   */
  drawLinkTooltip(ctx: CanvasRenderingContext2D, link: LinkSegment): void {
    const pos = link.pathCentre
    ctx.fillStyle = "black"
    ctx.beginPath()
    if (this.linkMarkerShape === LinkMarkerShape.Arrow) {
      const transform = ctx.getTransform()
      ctx.translate(pos[0], pos[1])
      // Assertion: Number.isFinite guarantees this is a number.
      if (Number.isFinite(link.centreAngle)) ctx.rotate(link.centreAngle as number)
      ctx.moveTo(-2, -3)
      ctx.lineTo(+4, 0)
      ctx.lineTo(-2, +3)
      ctx.setTransform(transform)
    } else if (
      this.linkMarkerShape == null ||
      this.linkMarkerShape === LinkMarkerShape.Circle
    ) {
      ctx.arc(pos[0], pos[1], 3, 0, Math.PI * 2)
    }
    ctx.fill()

    // @ts-expect-error TODO: Better value typing
    const { data } = link
    if (data == null) return

    // @ts-expect-error TODO: Better value typing
    if (this.onDrawLinkTooltip?.(ctx, link, this) == true) return

    let text: string | null

    if (typeof data === "number")
      text = data.toFixed(2)
    else if (typeof data === "string")
      text = `"${data}"`
    else if (typeof data === "boolean")
      text = String(data)
    else if (data.toToolTip)
      text = data.toToolTip()
    else
      text = `[${data.constructor.name}]`

    if (text == null) return

    // Hard-coded tooltip limit
    text = text.substring(0, 30)

    ctx.font = "14px Courier New"
    const w = cachedMeasureText(ctx, text) + 20
    const h = 24
    ctx.shadowColor = "black"
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.shadowBlur = 3
    ctx.fillStyle = "#454"
    ctx.beginPath()
    ctx.roundRect(pos[0] - w * 0.5, pos[1] - 15 - h, w, h, [3])
    ctx.moveTo(pos[0] - 10, pos[1] - 15)
    ctx.lineTo(pos[0] + 10, pos[1] - 15)
    ctx.lineTo(pos[0], pos[1] - 5)
    ctx.fill()
    ctx.shadowColor = "transparent"
    ctx.textAlign = "center"
    ctx.fillStyle = "#CEC"
    ctx.fillText(text, pos[0], pos[1] - 15 - h * 0.3)
  }

  /**
   * Draws the shape of the given node on the canvas
   * @param node The node to draw
   * @param ctx 2D canvas rendering context used to draw
   * @param size Size of the background to draw, in graph units.  Differs from node size if collapsed, etc.
   * @param fgcolor Foreground colour - used for text
   * @param bgcolor Background colour of the node
   * @param _selected Whether to render the node as selected.  Likely to be removed in future, as current usage is simply the selected property of the node.
   */
  drawNodeShape(
    node: LGraphNode,
    ctx: CanvasRenderingContext2D,
    size: Size,
    fgcolor: CanvasColour,
    bgcolor: CanvasColour,
    _selected: boolean,
  ): void {
    // Rendering options
    ctx.strokeStyle = fgcolor
    ctx.fillStyle = bgcolor

    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT
    const { lowQuality: lowQuality } = this

    const { collapsed } = node.flags
    const shape = node.renderingShape
    const { titleMode: titleMode } = node

    const renderTitle = titleMode == TitleMode.TRANSPARENT_TITLE || titleMode == TitleMode.NO_TITLE
      ? false
      : true

    // Normalised node dimensions
    const area = LGraphCanvas.#tempArea
    area.set(node.boundingRect)
    area[0] -= node.pos[0]
    area[1] -= node.pos[1]

    const oldAlpha = ctx.globalAlpha

    // Draw node background (shape)
    ctx.beginPath()
    if (shape == RenderShape.BOX || lowQuality) {
      ctx.rect(area[0], area[1], area[2], area[3])
    } else if (shape == RenderShape.ROUND || shape == RenderShape.CARD) {
      ctx.roundRect(
        area[0],
        area[1],
        area[2],
        area[3],
        shape == RenderShape.CARD
          ? [LiteGraph.ROUND_RADIUS, LiteGraph.ROUND_RADIUS, 0, 0]
          : [LiteGraph.ROUND_RADIUS],
      )
    } else if (shape == RenderShape.CIRCLE) {
      ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI * 2)
    }
    ctx.fill()

    // Separator - title bar <-> body
    if (!collapsed && renderTitle) {
      ctx.shadowColor = "transparent"
      ctx.fillStyle = "rgba(0,0,0,0.2)"
      ctx.fillRect(0, -1, area[2], 2)
    }
    ctx.shadowColor = "transparent"

    node.onDrawBackground?.(ctx)

    // Title bar background (remember, it is rendered ABOVE the node)
    if (renderTitle || titleMode == TitleMode.TRANSPARENT_TITLE) {
      node.drawTitleBarBackground(ctx, {
        scale: this.ds.scale,
        lowQuality,
      })

      // title box
      node.drawTitleBox(ctx, {
        scale: this.ds.scale,
        lowQuality,
        boxSize: 10,
      })

      ctx.globalAlpha = oldAlpha

      // title text
      node.drawTitleText(ctx, {
        scale: this.ds.scale,
        defaultTitleColor: this.nodeTitleColor,
        lowQuality,
      })

      // custom title render
      node.onDrawTitle?.(ctx)
    }

    // Draw stroke styles
    for (const getStyle of Object.values(node.strokeStyles)) {
      const strokeStyle = getStyle.call(node)
      if (strokeStyle) {
        strokeShape(ctx, area, {
          shape,
          titleHeight,
          titleMode,
          collapsed,
          ...strokeStyle,
        })
      }
    }

    node.drawProgressBar(ctx)

    // these counter helps in conditioning drawing based on if the node has been executed or an action occurred
    if (node.executeTriggered != null && node.executeTriggered > 0) node.executeTriggered--
    if (node.actionTriggered != null && node.actionTriggered > 0) node.actionTriggered--
  }

  /**
   * Draws a snap guide for a `Positionable` item.
   *
   * Initial design was a simple white rectangle representing the location the
   * item would land if dropped.
   * @param ctx The 2D canvas context to draw on
   * @param item The item to draw a snap guide for
   * @param shape The shape of the snap guide to draw
   * @todo Update to align snapping with boundingRect
   * @todo Shapes
   */
  drawSnapGuide(
    ctx: CanvasRenderingContext2D,
    item: Positionable,
    shape = RenderShape.ROUND,
    { offsetToSlot }: { offsetToSlot?: boolean } = {},
  ) {
    const snapGuide = LGraphCanvas.#temp
    snapGuide.set(item.boundingRect)

    // Not all items have pos equal to top-left of bounds
    const { pos } = item
    const offsetX = pos[0] - snapGuide[0]
    const offsetY =
      pos[1] -
      snapGuide[1] -
      (offsetToSlot ? LiteGraph.NODE_SLOT_HEIGHT * 0.7 : 0)

    // Normalise boundingRect to pos to snap
    snapGuide[0] += offsetX
    snapGuide[1] += offsetY
    if (this.#snapToGrid) snapPoint(snapGuide, this.#snapToGrid)
    snapGuide[0] -= offsetX
    snapGuide[1] -= offsetY

    const { globalAlpha } = ctx
    ctx.globalAlpha = 1
    ctx.beginPath()
    const [x, y, w, h] = snapGuide
    if (shape === RenderShape.CIRCLE) {
      const midX = x + (w * 0.5)
      const midY = y + (h * 0.5)
      const radius = Math.min(w * 0.5, h * 0.5)
      ctx.arc(midX, midY, radius, 0, Math.PI * 2)
    } else {
      ctx.rect(x, y, w, h)
    }

    ctx.lineWidth = 0.5
    ctx.strokeStyle = "#FFFFFF66"
    ctx.fillStyle = "#FFFFFF22"
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = globalAlpha
  }

  drawConnections(ctx: CanvasRenderingContext2D): void {
    this.renderedPaths.clear()
    if (this.linksRenderMode === LinkRenderType.HIDDEN_LINK) return

    const { graph, subgraph } = this
    if (!graph) throw new NullGraphError()

    const visibleReroutes: Reroute[] = []

    const now = LiteGraph.getTime()
    const { visibleArea } = this
    LGraphCanvas.#marginArea[0] = visibleArea[0] - 20
    LGraphCanvas.#marginArea[1] = visibleArea[1] - 20
    LGraphCanvas.#marginArea[2] = visibleArea[2] + 40
    LGraphCanvas.#marginArea[3] = visibleArea[3] + 40

    // draw connections
    ctx.lineWidth = this.connectionsWidth

    ctx.fillStyle = "#AAA"
    ctx.strokeStyle = "#AAA"
    ctx.globalAlpha = this.editorAlpha
    // for every node
    const nodes = graph.nodes

    // Ensure widget-input slot positions are computed before rendering links.
    // arrange() sets input.pos for widget-backed slots, but is normally called
    // in drawNode (foreground canvas). drawConnections runs on the background
    // canvas, which may render before drawNode has executed for this frame.
    // The dirty flag avoids a per-frame O(N) scan of all inputs.
    for (const node of nodes) {
      if (node.flags.collapsed || !node.widgetSlotsDirty) continue

      node.setConcreteSlots()
      node.arrange()
    }

    for (const node of nodes) {
      // for every input (we render just inputs because it is easier as every slot can only have one input)
      const { inputs } = node
      if (!inputs?.length) continue

      for (const [i, input] of inputs.entries()) {
        if (!input || input.link == null) continue

        const linkId = input.link
        const link = graph.links.get(linkId)
        if (!link) continue

        const endPos = node.getInputPos(i)

        // find link info
        const startNode = graph.getNodeById(link.originId)
        if (startNode == null) continue

        const outputId = link.originSlot
        const startPos: Point = outputId === -1
          ? [startNode.pos[0] + 10, startNode.pos[1] + 10]
          : startNode.getOutputPos(outputId)

        const output = startNode.outputs[outputId]
        if (!output) continue

        this.#renderAllLinkSegments(ctx, link, startPos, endPos, visibleReroutes, now, output.dir, input.dir)
      }
    }

    if (subgraph) {
      for (const output of subgraph.inputNode.slots) {
        if (!output.linkIds.length) continue

        // find link info
        for (const linkId of output.linkIds) {
          const resolved = LLink.resolve(linkId, graph)
          if (!resolved) continue

          const { link, inputNode, input } = resolved
          if (!inputNode || !input) continue

          const endPos = inputNode.getInputPos(link.targetSlot)

          this.#renderAllLinkSegments(ctx, link, output.pos, endPos, visibleReroutes, now, input.dir, input.dir)
        }
      }

      for (const input of subgraph.outputNode.slots) {
        if (!input.linkIds.length) continue

        // find link info
        const resolved = LLink.resolve(input.linkIds[0], graph)
        if (!resolved) continue

        const { link, outputNode, output } = resolved
        if (!outputNode || !output) continue

        const startPos = outputNode.getOutputPos(link.originSlot)

        this.#renderAllLinkSegments(ctx, link, startPos, input.pos, visibleReroutes, now, output.dir, input.dir)
      }
    }

    if (graph.floatingLinks.size > 0) {
      this.#renderFloatingLinks(ctx, graph, visibleReroutes, now)
    }

    const rerouteSet = this.#visibleReroutes
    rerouteSet.clear()

    // Render reroutes, ordered by number of non-floating links
    visibleReroutes.sort((a, b) => a.linkIds.size - b.linkIds.size)
    for (const reroute of visibleReroutes) {
      rerouteSet.add(reroute)

      if (
        this.#snapToGrid &&
        this.isDragging &&
        this.selectedItems.has(reroute)
      ) {
        this.drawSnapGuide(ctx, reroute, RenderShape.CIRCLE, {
          offsetToSlot: true,
        })
      }
      reroute.draw(ctx, this.#pattern)

      // Never draw slots when the pointer is down
      if (!this.pointer.isDown) reroute.drawSlots(ctx)
    }
    ctx.globalAlpha = 1
  }

  /**
   * draws a link between two points
   * @param ctx Canvas 2D rendering context
   * @param a start pos
   * @param b end pos
   * @param link the link object with all the link info
   * @param skipBorder ignore the shadow of the link
   * @param flow show flow animation (for events)
   * @param color the color for the link
   * @param startDir the direction enum
   * @param endDir the direction enum
   */
  renderLink(
    ctx: CanvasRenderingContext2D,
    a: ReadOnlyPoint,
    b: ReadOnlyPoint,
    link: LLink | null,
    skipBorder: boolean,
    flow: number | null,
    color: CanvasColour | null,
    startDir?: LinkDirection,
    endDir?: LinkDirection,
    {
      startControl,
      endControl,
      reroute,
      numSublines = 1,
      disabled = false,
    }: {
      /** When defined, render data will be saved to this reroute instead of the `link` parameter. */
      reroute?: Reroute
      /** Offset of the bezier curve control point from point `a` (output side) */
      startControl?: ReadOnlyPoint
      /** Offset of the bezier curve control point from point `b` (input side) */
      endControl?: ReadOnlyPoint
      /**
       * Number of sublines (useful to represent vec3 or rgb)
       * @todo If implemented, refactor calculations out of the loop
       */
      numSublines?: number
      /** Whether this is a floating link segment */
      disabled?: boolean
    } = {},
  ): void {
    const linkColour =
      link != null && this.highlightedLinks[link.id] != null
        ? "#FFF"
        : color ||
          link?.color ||
          (link?.type != null && LGraphCanvas.linkTypeColors[link.type]) ||
          this.defaultLinkColor
    startDir = startDir || LinkDirection.RIGHT
    endDir = endDir || LinkDirection.LEFT

    const dist = this.linksRenderMode == LinkRenderType.SPLINE_LINK && (!endControl || !startControl)
      ? distance(a, b)
      : 0

    // TODO: Subline code below was inserted in the wrong place - should be before this statement
    if (this.renderConnectionsBorder && !this.lowQuality) {
      ctx.lineWidth = this.connectionsWidth + 4
    }
    ctx.lineJoin = "round"
    numSublines ||= 1
    if (numSublines > 1) ctx.lineWidth = 0.5

    // begin line shape
    const path = new Path2D()

    /** The link or reroute we're currently rendering */
    const linkSegment = reroute ?? link
    if (linkSegment) linkSegment.path = path

    const innerA = LGraphCanvas.#lTempA
    const innerB = LGraphCanvas.#lTempB

    // Reference to reroute.pathCentre if present, or link.pathCentre if present. Caches the centre point of the link.
    const pos: Point = linkSegment?.pathCentre ?? [0, 0]

    for (let i = 0; i < numSublines; i++) {
      const offsety = (i - (numSublines - 1) * 0.5) * 5
      innerA[0] = a[0]
      innerA[1] = a[1]
      innerB[0] = b[0]
      innerB[1] = b[1]

      if (this.linksRenderMode == LinkRenderType.SPLINE_LINK) {
        if (endControl) {
          innerB[0] = b[0] + endControl[0]
          innerB[1] = b[1] + endControl[1]
        } else {
          this.#addSplineOffset(innerB, endDir, dist)
        }
        if (startControl) {
          innerA[0] = a[0] + startControl[0]
          innerA[1] = a[1] + startControl[1]
        } else {
          this.#addSplineOffset(innerA, startDir, dist)
        }
        path.moveTo(a[0], a[1] + offsety)
        path.bezierCurveTo(
          innerA[0],
          innerA[1] + offsety,
          innerB[0],
          innerB[1] + offsety,
          b[0],
          b[1] + offsety,
        )

        // Calculate centre point
        findPointOnCurve(pos, a, b, innerA, innerB, 0.5)

        if (linkSegment && this.linkMarkerShape === LinkMarkerShape.Arrow) {
          const justPastCentre = LGraphCanvas.#lTempC
          findPointOnCurve(justPastCentre, a, b, innerA, innerB, 0.51)

          linkSegment.centreAngle = Math.atan2(
            justPastCentre[1] - pos[1],
            justPastCentre[0] - pos[0],
          )
        }
      } else {
        const l = this.linksRenderMode == LinkRenderType.LINEAR_LINK ? 15 : 10
        switch (startDir) {
          case LinkDirection.LEFT:
            innerA[0] += -l
            break
          case LinkDirection.RIGHT:
            innerA[0] += l
            break
          case LinkDirection.UP:
            innerA[1] += -l
            break
          case LinkDirection.DOWN:
            innerA[1] += l
            break
        }
        switch (endDir) {
          case LinkDirection.LEFT:
            innerB[0] += -l
            break
          case LinkDirection.RIGHT:
            innerB[0] += l
            break
          case LinkDirection.UP:
            innerB[1] += -l
            break
          case LinkDirection.DOWN:
            innerB[1] += l
            break
        }
        if (this.linksRenderMode == LinkRenderType.LINEAR_LINK) {
          path.moveTo(a[0], a[1] + offsety)
          path.lineTo(innerA[0], innerA[1] + offsety)
          path.lineTo(innerB[0], innerB[1] + offsety)
          path.lineTo(b[0], b[1] + offsety)

          // Calculate centre point
          pos[0] = (innerA[0] + innerB[0]) * 0.5
          pos[1] = (innerA[1] + innerB[1]) * 0.5

          if (linkSegment && this.linkMarkerShape === LinkMarkerShape.Arrow) {
            linkSegment.centreAngle = Math.atan2(
              innerB[1] - innerA[1],
              innerB[0] - innerA[0],
            )
          }
        } else if (this.linksRenderMode == LinkRenderType.STRAIGHT_LINK) {
          const midX = (innerA[0] + innerB[0]) * 0.5

          path.moveTo(a[0], a[1])
          path.lineTo(innerA[0], innerA[1])
          path.lineTo(midX, innerA[1])
          path.lineTo(midX, innerB[1])
          path.lineTo(innerB[0], innerB[1])
          path.lineTo(b[0], b[1])

          // Calculate centre point
          pos[0] = midX
          pos[1] = (innerA[1] + innerB[1]) * 0.5

          if (linkSegment && this.linkMarkerShape === LinkMarkerShape.Arrow) {
            const diff = innerB[1] - innerA[1]
            if (Math.abs(diff) < 4) linkSegment.centreAngle = 0
            else if (diff > 0) linkSegment.centreAngle = Math.PI * 0.5
            else linkSegment.centreAngle = -(Math.PI * 0.5)
          }
        } else {
          return
        }
      }
    }

    // rendering the outline of the connection can be a little bit slow
    if (this.renderConnectionsBorder && !this.lowQuality && !skipBorder) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)"
      ctx.stroke(path)
    }

    ctx.lineWidth = this.connectionsWidth
    ctx.fillStyle = ctx.strokeStyle = linkColour
    ctx.stroke(path)

    // render arrow in the middle
    if (
      this.ds.scale >= 0.6 &&
      this.highqualityRender &&
      linkSegment
    ) {
      // render arrow
      if (this.renderConnectionArrows) {
        // compute two points in the connection
        const posA = this.computeConnectionPoint(a, b, 0.25, startDir, endDir)
        const posB = this.computeConnectionPoint(a, b, 0.26, startDir, endDir)
        const posC = this.computeConnectionPoint(a, b, 0.75, startDir, endDir)
        const posD = this.computeConnectionPoint(a, b, 0.76, startDir, endDir)

        // compute the angle between them so the arrow points in the right direction
        let angleA: number
        let angleB: number
        if (this.renderCurvedConnections) {
          angleA = -Math.atan2(posB[0] - posA[0], posB[1] - posA[1])
          angleB = -Math.atan2(posD[0] - posC[0], posD[1] - posC[1])
        } else {
          angleB = angleA = b[1] > a[1] ? 0 : Math.PI
        }

        // render arrow
        const transform = ctx.getTransform()
        ctx.translate(posA[0], posA[1])
        ctx.rotate(angleA)
        ctx.beginPath()
        ctx.moveTo(-5, -3)
        ctx.lineTo(0, +7)
        ctx.lineTo(+5, -3)
        ctx.fill()
        ctx.setTransform(transform)

        ctx.translate(posC[0], posC[1])
        ctx.rotate(angleB)
        ctx.beginPath()
        ctx.moveTo(-5, -3)
        ctx.lineTo(0, +7)
        ctx.lineTo(+5, -3)
        ctx.fill()
        ctx.setTransform(transform)
      }

      // Draw link centre marker
      ctx.beginPath()
      if (this.linkMarkerShape === LinkMarkerShape.Arrow) {
        const transform = ctx.getTransform()
        ctx.translate(pos[0], pos[1])
        if (linkSegment.centreAngle) ctx.rotate(linkSegment.centreAngle)
        // The math is off, but it currently looks better in chromium
        ctx.moveTo(-3.2, -5)
        ctx.lineTo(+7, 0)
        ctx.lineTo(-3.2, +5)
        ctx.setTransform(transform)
      } else if (
        this.linkMarkerShape == null ||
        this.linkMarkerShape === LinkMarkerShape.Circle
      ) {
        ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2)
      }
      if (disabled) {
        const { fillStyle, globalAlpha } = ctx
        ctx.fillStyle = this.#pattern ?? "#797979"
        ctx.globalAlpha = 0.75
        ctx.fill()
        ctx.globalAlpha = globalAlpha
        ctx.fillStyle = fillStyle
      }
      ctx.fill()

      if (LLink.drawDebugEnabled) {
        const { fillStyle, font, globalAlpha, lineWidth, strokeStyle } = ctx
        ctx.globalAlpha = 1
        ctx.lineWidth = 4
        ctx.fillStyle = "white"
        ctx.strokeStyle = "black"
        ctx.font = "16px Arial"

        const text = String(linkSegment.id)
        const { width, actualBoundingBoxAscent } = ctx.measureText(text)
        const x = pos[0] - width * 0.5
        const y = pos[1] + actualBoundingBoxAscent * 0.5
        ctx.strokeText(text, x, y)
        ctx.fillText(text, x, y)

        ctx.font = font
        ctx.globalAlpha = globalAlpha
        ctx.lineWidth = lineWidth
        ctx.fillStyle = fillStyle
        ctx.strokeStyle = strokeStyle
      }
    }

    // render flowing points
    if (flow) {
      ctx.fillStyle = linkColour
      for (let i = 0; i < 5; ++i) {
        const f = (LiteGraph.getTime() * 0.001 + i * 0.2) % 1
        const flowPos = this.computeConnectionPoint(a, b, f, startDir, endDir)
        ctx.beginPath()
        ctx.arc(flowPos[0], flowPos[1], 5, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }

  /**
   * Finds a point along a spline represented by a to b, with spline endpoint directions dictacted by startDir and endDir.
   * @param a Start point
   * @param b End point
   * @param t Time: distance between points (e.g 0.25 is 25% along the line)
   * @param startDir Spline start direction
   * @param endDir Spline end direction
   * @returns The point at `t` distance along the spline a-b.
   */
  computeConnectionPoint(
    a: ReadOnlyPoint,
    b: ReadOnlyPoint,
    t: number,
    startDir?: LinkDirection,
    endDir?: LinkDirection,
  ): Point {
    startDir ||= LinkDirection.RIGHT
    endDir ||= LinkDirection.LEFT

    const dist = distance(a, b)
    const pa: Point = [a[0], a[1]]
    const pb: Point = [b[0], b[1]]

    this.#addSplineOffset(pa, startDir, dist)
    this.#addSplineOffset(pb, endDir, dist)

    const c1 = (1 - t) * (1 - t) * (1 - t)
    const c2 = 3 * ((1 - t) * (1 - t)) * t
    const c3 = 3 * (1 - t) * (t * t)
    const c4 = t * t * t

    const x = c1 * a[0] + c2 * pa[0] + c3 * pb[0] + c4 * b[0]
    const y = c1 * a[1] + c2 * pa[1] + c3 * pb[1] + c4 * b[1]
    return [x, y]
  }

  drawExecutionOrder(ctx: CanvasRenderingContext2D): void {
    ctx.shadowColor = "transparent"
    ctx.globalAlpha = 0.25

    ctx.textAlign = "center"
    ctx.strokeStyle = "white"
    ctx.globalAlpha = 0.75

    const { visibleNodes } = this
    for (const node of visibleNodes) {
      ctx.fillStyle = "black"
      ctx.fillRect(
        node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT,
        node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT,
        LiteGraph.NODE_TITLE_HEIGHT,
        LiteGraph.NODE_TITLE_HEIGHT,
      )
      if (node.order == 0) {
        ctx.strokeRect(
          node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
          node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT + 0.5,
          LiteGraph.NODE_TITLE_HEIGHT,
          LiteGraph.NODE_TITLE_HEIGHT,
        )
      }
      ctx.fillStyle = "#FFF"
      ctx.fillText(
        stringOrEmpty(node.order),
        node.pos[0] + LiteGraph.NODE_TITLE_HEIGHT * -0.5,
        node.pos[1] - 6,
      )
    }
    ctx.globalAlpha = 1
  }

  /**
   * draws every group area in the background
   */
  drawGroups(_canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!this.graph) return

    const groups = this.graph.groups

    ctx.save()
    ctx.globalAlpha = 0.5 * this.editorAlpha
    const drawSnapGuides = this.#snapToGrid && this.isDragging

    for (const group of groups) {
      // out of the visible area
      if (!overlapBounding(this.visibleArea, group.boundingRect)) {
        continue
      }

      // Draw snap shadow
      if (drawSnapGuides && this.selectedItems.has(group))
        this.drawSnapGuide(ctx, group)

      group.draw(this, ctx)
    }

    ctx.restore()
  }

  /**
   * resizes the canvas to a given size, if no size is passed, then it tries to fill the parentNode
   * @todo Remove or rewrite
   */
  resize(width?: number, height?: number): void {
    if (!width && !height) {
      const parent = this.canvas.parentElement
      if (!parent) throw new TypeError("Attempted to resize canvas, but parent element was null.")
      width = parent.offsetWidth
      height = parent.offsetHeight
    }

    const cssWidth = Math.round(width ?? 0)
    const cssHeight = Math.round(height ?? 0)
    const view = this.canvas.ownerDocument.defaultView ?? window
    const dpr = Math.max(view.devicePixelRatio ?? 1, 1)
    const bufferWidth = Math.round(cssWidth * dpr)
    const bufferHeight = Math.round(cssHeight * dpr)

    if (
      this.canvas.width == bufferWidth &&
      this.canvas.height == bufferHeight &&
      this.canvas.style.width == `${cssWidth}px` &&
      this.canvas.style.height == `${cssHeight}px`
    ) { return }

    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = bufferWidth
    this.canvas.height = bufferHeight
    this.bgcanvas.width = this.canvas.width
    this.bgcanvas.height = this.canvas.height
    this.setDirty(true, true)
  }

  /** Hook called when the node selection changes. Default implementation is a no-op. */
  onNodeSelectionChange(): void {}

  /**
   * Determines the furthest nodes in each direction for the currently selected nodes
   */
  boundaryNodesForSelection(): NullableProperties<IBoundaryNodes> {
    return LGraphCanvas.getBoundaryNodes(this.selectedNodes)
  }

  showLinkMenu(segment: LinkSegment, e: CanvasPointerEvent): boolean {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    const title = "data" in segment && segment.data != null
      ? segment.data.constructor.name
      : undefined

    const { originId, originSlot } = segment
    if (originId == null || originSlot == null) {
      new LiteGraph.ContextMenu<string>(["Link has no origin"], {
        event: e,
        title,
      })
      return false
    }

    const NodeLeft = graph.getNodeById(originId)
    const fromType = NodeLeft?.outputs?.[originSlot]?.type

    const options = ["Add Node", "Add Reroute", null, "Delete", null]

    const menu = new LiteGraph.ContextMenu<string>(options, {
      event: e,
      title,
      callback: innerClicked.bind(this),
    })

    return false

    function innerClicked(this: LGraphCanvas, v: string, _options: unknown, e: MouseEvent) {
      if (!graph) throw new NullGraphError()

      switch (v) {
        case "Add Node":
          LGraphCanvas.onMenuAdd(null, null, e, menu, (node) => {
            if (!node?.inputs?.length || !node?.outputs?.length || originSlot == null) return

            // leave the connection type checking inside connectByType
            const options = { afterRerouteId: segment.parentId }
            if (NodeLeft?.connectByType(originSlot, node, fromType ?? "*", options)) {
              node.pos[0] -= node.size[0] * 0.5
            }
          })
          break

        case "Add Reroute": {
          try {
            this.emitBeforeChange()
            this.adjustMouseEvent(e)
            graph.createReroute(segment.pathCentre, segment)
            this.setDirty(false, true)
          } catch (error) {
            console.error(error)
          } finally {
            this.emitAfterChange()
          }
          break
        }

        case "Delete": {
        // segment can be a Reroute object, in which case segment.id is the reroute id
          const linkId =
            segment instanceof Reroute
              ? segment.linkIds.values().next().value
              : segment.id
          if (linkId !== undefined) {
            graph.removeLink(linkId)
          }
          break
        }
        default:
      }
    }
  }

  createDefaultNodeForSlot(optPass: ICreateDefaultNodeOptions): boolean {
    type DefaultOptions = ICreateDefaultNodeOptions & {
      posAdd: Point
      posSizeFix: Point
    }

    const opts = Object.assign<DefaultOptions, ICreateDefaultNodeOptions>({
      nodeFrom: null,
      slotFrom: null,
      nodeTo: null,
      slotTo: null,
      position: [0, 0],
      nodeType: undefined,
      posAdd: [0, 0],
      posSizeFix: [0, 0],
    }, optPass)
    const { afterRerouteId } = opts

    const isFrom = opts.nodeFrom && opts.slotFrom !== null
    const isTo = !isFrom && opts.nodeTo && opts.slotTo !== null

    if (!isFrom && !isTo) {
      console.warn(`No data passed to createDefaultNodeForSlot`, opts.nodeFrom, opts.slotFrom, opts.nodeTo, opts.slotTo)
      return false
    }
    if (!opts.nodeType) {
      console.warn("No type to createDefaultNodeForSlot")
      return false
    }

    const nodeX = isFrom ? opts.nodeFrom : opts.nodeTo
    if (!nodeX) throw new TypeError("nodeX was null when creating default node for slot.")

    let slotX = isFrom ? opts.slotFrom : opts.slotTo

    let iSlotConn: number | false
    if (nodeX instanceof SubgraphIONodeBase) {
      if (typeof slotX !== "object" || !slotX) {
        console.warn("Cant get slot information", slotX)
        return false
      }
      const { name } = slotX
      iSlotConn = nodeX.slots.findIndex(s => s.name === name)
      slotX = nodeX.slots[iSlotConn]
      if (!slotX) {
        console.warn("Cant get slot information", slotX)
        return false
      }
    } else {
      switch (typeof slotX) {
        case "string":
          iSlotConn = isFrom ? nodeX.findOutputSlot(slotX, false) : nodeX.findInputSlot(slotX, false)
          slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX]
          break
        case "object":
          if (slotX === null) {
            console.warn("Cant get slot information", slotX)
            return false
          }

          // ok slotX
          iSlotConn = isFrom ? nodeX.findOutputSlot(slotX.name) : nodeX.findInputSlot(slotX.name)
          break
        case "number":
          iSlotConn = slotX
          slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX]
          break
        case "undefined":
        default:
          console.warn("Cant get slot information", slotX)
          return false
      }
    }

    // check for defaults nodes for this slottype
    const fromSlotType = slotX.type == LiteGraph.EVENT ? "_event_" : slotX.type
    const slotTypesDefault = isFrom
      ? LiteGraph.slotTypesDefaultOut
      : LiteGraph.slotTypesDefaultIn
    if (slotTypesDefault?.[fromSlotType] != null) {
      let nodeNewType: string | Record<string, unknown> | false = false
      if (typeof slotTypesDefault[fromSlotType] == "object") {
        for (const typeX in slotTypesDefault[fromSlotType]) {
          if (
            opts.nodeType == slotTypesDefault[fromSlotType][typeX] ||
            opts.nodeType == "AUTO"
          ) {
            nodeNewType = slotTypesDefault[fromSlotType][typeX]
            break
          }
        }
      } else if (
        opts.nodeType == slotTypesDefault[fromSlotType] ||
        opts.nodeType == "AUTO"
      ) {
        nodeNewType = slotTypesDefault[fromSlotType]
      }
      if (nodeNewType) {
        let nodeNewOpts: SlotTypeDefaultNodeOpts | undefined
        let nodeTypeStr: string
        if (typeof nodeNewType == "object") {
          nodeNewOpts = nodeNewType as SlotTypeDefaultNodeOpts
          nodeTypeStr = nodeNewOpts.node ?? ""
        } else {
          nodeTypeStr = nodeNewType
        }

        // that.graph.beforeChange();
        const newNode = LiteGraph.createNode(nodeTypeStr)
        if (newNode) {
          // if is object pass options
          if (nodeNewOpts) {
            if (nodeNewOpts.properties) {
              for (const i in nodeNewOpts.properties) {
                newNode.addProperty(i, nodeNewOpts.properties[i])
              }
            }
            if (nodeNewOpts.inputs) {
              newNode.inputs = []
              for (const input of nodeNewOpts.inputs) {
                newNode.addInput(input[0], input[1])
              }
            }
            if (nodeNewOpts.outputs) {
              newNode.outputs = []
              for (const output of nodeNewOpts.outputs) {
                newNode.addOutput(output[0], output[1])
              }
            }
            if (nodeNewOpts.title) {
              newNode.title = nodeNewOpts.title
            }
            if (nodeNewOpts.json) {
              newNode.configure(nodeNewOpts.json)
            }
          }

          // add the node
          if (!this.graph) throw new NullGraphError()

          this.graph.add(newNode)
          newNode.pos = [
            opts.position[0] + opts.posAdd[0] + (opts.posSizeFix[0] ? opts.posSizeFix[0] * newNode.size[0] : 0),
            opts.position[1] + opts.posAdd[1] + (opts.posSizeFix[1] ? opts.posSizeFix[1] * newNode.size[1] : 0),
          ]

          // Interim API - allow the link connection to be canceled.
          // TODO: https://github.com/Comfy-Org/litegraph.js/issues/946
          const detail = { node: newNode, opts }
          const mayConnectLinks = this.canvas.dispatchEvent(new CustomEvent("connect-new-default-node", { detail, cancelable: true }))
          if (!mayConnectLinks) return true

          // connect the two!
          if (isFrom) {
            if (!opts.nodeFrom) throw new TypeError("createDefaultNodeForSlot - nodeFrom was null")
            opts.nodeFrom.connectByType(iSlotConn, newNode, fromSlotType, { afterRerouteId })
          } else {
            if (!opts.nodeTo) throw new TypeError("createDefaultNodeForSlot - nodeTo was null")
            opts.nodeTo.connectByTypeOutput(iSlotConn, newNode, fromSlotType, { afterRerouteId })
          }

          // if connecting in between
          if (isFrom && isTo) {
            // TODO
          }

          return true
        }
        console.log(`failed creating ${nodeTypeStr}`)
      }
    }
    return false
  }

  showConnectionMenu(optPass: Partial<ICreateNodeOptions & { e: MouseEvent }>): ContextMenu<string> | undefined {
    const opts = Object.assign<ICreateNodeOptions & HasShowSearchCallback, ICreateNodeOptions>({
      nodeFrom: null,
      slotFrom: null,
      nodeTo: null,
      slotTo: null,
      e: undefined,
      allowSearchbox: this.allowSearchbox,
      showSearchbox: this.showSearchbox,
    }, optPass || {})
    const dirty = () => this.#dirty()
    const that = this
    const { graph } = this
    const { afterRerouteId } = opts

    const isFrom = opts.nodeFrom && opts.slotFrom
    const isTo = !isFrom && opts.nodeTo && opts.slotTo

    if (!isFrom && !isTo) {
      console.warn("No data passed to showConnectionMenu")
      return
    }

    const nodeX = isFrom ? opts.nodeFrom : opts.nodeTo
    if (!nodeX) throw new TypeError("nodeX was null when creating default node for slot.")
    let slotX = isFrom ? opts.slotFrom : opts.slotTo

    let iSlotConn: number
    if (nodeX instanceof SubgraphIONodeBase) {
      if (typeof slotX !== "object" || !slotX) {
        console.warn("Cant get slot information", slotX)
        return
      }
      const { name } = slotX
      iSlotConn = nodeX.slots.findIndex(s => s.name === name)
      // If it's not found in the main slots, it might be the empty slot from a Subgraph node.
      // In that case, the original `slotX` object is the correct one, so don't overwrite it.
      if (iSlotConn !== -1) {
        slotX = nodeX.slots[iSlotConn]
      }
      if (!slotX) {
        console.warn("Cant get slot information", slotX)
        return
      }
    } else {
      switch (typeof slotX) {
        case "string":
          iSlotConn = isFrom
            ? nodeX.findOutputSlot(slotX, false)
            : nodeX.findInputSlot(slotX, false)
          slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX]
          break
        case "object":
          if (slotX === null) {
            console.warn("Cant get slot information", slotX)
            return
          }

          // ok slotX
          iSlotConn = isFrom
            ? nodeX.findOutputSlot(slotX.name)
            : nodeX.findInputSlot(slotX.name)
          break
        case "number":
          iSlotConn = slotX
          slotX = isFrom ? nodeX.outputs[slotX] : nodeX.inputs[slotX]
          break
        default:
          console.warn("Cant get slot information", slotX)
          return
      }
    }

    const options = ["Add Node", "Add Reroute", null]

    if (opts.allowSearchbox) {
      options.push("Search", null)
    }

    // get defaults nodes for this slottype
    const fromSlotType = slotX.type == LiteGraph.EVENT ? "_event_" : slotX.type
    const slotTypesDefault = isFrom
      ? LiteGraph.slotTypesDefaultOut
      : LiteGraph.slotTypesDefaultIn
    if (slotTypesDefault?.[fromSlotType] != null) {
      if (typeof slotTypesDefault[fromSlotType] == "object") {
        for (const typeX in slotTypesDefault[fromSlotType]) {
          options.push(slotTypesDefault[fromSlotType][typeX])
        }
      } else {
        options.push(slotTypesDefault[fromSlotType])
      }
    }

    // build menu
    const menu = new LiteGraph.ContextMenu<string>(options, {
      event: opts.e,
      extra: slotX,
      title:
        (slotX && slotX.name != ""
          ? slotX.name + (fromSlotType ? " | " : "")
          : "") + (slotX && fromSlotType ? fromSlotType : ""),
      callback: innerClicked,
    })

    return menu

    // callback
    function innerClicked(v: string | undefined, options: IContextMenuOptions<string, INodeInputSlot | INodeOutputSlot>, e: MouseEvent) {
      switch (v) {
        case "Add Node":
          LGraphCanvas.onMenuAdd(null, null, e, menu, function (node) {
            if (!node) return

            if (isFrom) {
              if (!opts.nodeFrom) throw new TypeError("Cannot add node to SubgraphInputNode: nodeFrom was null")
              const slot = opts.nodeFrom.connectByType(iSlotConn, node, fromSlotType, { afterRerouteId })
              if (!slot) console.warn("Failed to make new connection.")
            // }
            } else {
              if (!opts.nodeTo) throw new TypeError("Cannot add node to SubgraphInputNode: nodeTo was null")
              opts.nodeTo.connectByTypeOutput(iSlotConn, node, fromSlotType, { afterRerouteId })
            }
          })
          break
        case "Add Reroute":{
          const node = isFrom ? opts.nodeFrom : opts.nodeTo
          const slot = options.extra

          if (!graph) throw new NullGraphError()
          if (!node) throw new TypeError("Cannot add reroute: node was null")
          if (!slot) throw new TypeError("Cannot add reroute: slot was null")
          if (!opts.e) throw new TypeError("Cannot add reroute: CanvasPointerEvent was null")

          if (node instanceof SubgraphIONodeBase) {
            throw new TypeError("Cannot add floating reroute to Subgraph IO Nodes")
          }

          const reroute = node.connectFloatingReroute([opts.e.canvasX, opts.e.canvasY], slot, afterRerouteId)
          if (!reroute) throw new Error("Failed to create reroute")

          dirty()
          break
        }
        case "Search":
          if (isFrom) {
          // @ts-expect-error Subgraph
            opts.showSearchbox(e, { nodeFrom: opts.nodeFrom, slotFrom: slotX, typeFilterIn: fromSlotType })
          } else {
          // @ts-expect-error Subgraph
            opts.showSearchbox(e, { nodeTo: opts.nodeTo, slotFrom: slotX, typeFilterOut: fromSlotType })
          }
          break
        default: {
          const customProps = {
            position: [opts.e?.canvasX ?? 0, opts.e?.canvasY ?? 0],
            nodeType: v,
            afterRerouteId,
          } satisfies Partial<ICreateDefaultNodeOptions>

          const options = Object.assign(opts, customProps)
          if (!that.createDefaultNodeForSlot(options))
            break
        }
      }
    }
  }

  // refactor: there are different dialogs, some uses createDialog some dont
  prompt(
    title: string,
    value: string | number,
    callback: (value: string) => void,
    event: CanvasPointerEvent,
    multiline?: boolean,
  ): HTMLDivElement {
    const that = this
    title = title || ""

    const customProperties = {
      isModified: false,
      className: "graphdialog rounded",
      innerHTML: multiline
        ? "<span class='name'></span> <textarea autofocus class='value'></textarea><button class='rounded'>OK</button>"
        : "<span class='name'></span> <input autofocus type='text' class='value'/><button class='rounded'>OK</button>",
      close() {
        that.promptBox = null
        if (dialog.parentNode) {
          dialog.remove()
        }
      },
    } satisfies Partial<IDialog>

    const div = document.createElement("div")
    const dialog: PromptDialog = Object.assign(div, customProperties)

    const graphcanvas = LGraphCanvas.activeCanvas
    const { canvas } = graphcanvas
    if (!canvas.parentNode) throw new TypeError("canvas element parentNode was null when opening a prompt.")
    canvas.parentNode.append(dialog)

    if (this.ds.scale > 1) dialog.style.transform = `scale(${this.ds.scale})`

    let dialogCloseTimer: ReturnType<typeof setTimeout>
    let preventTimeout = 0
    LiteGraph.pointerListenerAdd(dialog, "leave", function () {
      if (preventTimeout) return
      if (LiteGraph.dialogCloseOnMouseLeave) {
        if (!dialog.isModified && LiteGraph.dialogCloseOnMouseLeave) {
          dialogCloseTimer = setTimeout(
            dialog.close,
            LiteGraph.dialogCloseOnMouseLeaveDelay,
          )
        }
      }
    })
    LiteGraph.pointerListenerAdd(dialog, "enter", function () {
      if (LiteGraph.dialogCloseOnMouseLeave && dialogCloseTimer)
        clearTimeout(dialogCloseTimer)
    })
    const selInDia = dialog.querySelectorAll(":scope select")
    if (selInDia.length > 0) {
      // if filtering, check focus changed to comboboxes and prevent closing
      for (const selIn of selInDia) {
        selIn.addEventListener("click", function () {
          preventTimeout++
        })
        selIn.addEventListener("blur", function () {
          preventTimeout = 0
        })
        selIn.addEventListener("change", function () {
          preventTimeout = -1
        })
      }
    }
    this.promptBox?.close()
    this.promptBox = dialog

    const nameElement: HTMLSpanElement | null = dialog.querySelector(":scope .name")
    if (!nameElement) throw new TypeError("nameElement was null")

    nameElement.textContent = title
    const valueElement: HTMLInputElement | null = dialog.querySelector(":scope .value")
    if (!valueElement) throw new TypeError("valueElement was null")

    valueElement.value = String(value)
    valueElement.select()

    const input = valueElement
    input.addEventListener("keydown", function (e: KeyboardEvent) {
      dialog.isModified = true
      if (e.key == "Escape") {
        // ESC
        dialog.close()
      } else if (
        e.key == "Enter" &&
        (e.target as Element).localName != "textarea"
      ) {
        if (callback) {
          callback(this.value)
        }
        dialog.close()
      } else {
        return
      }
      e.preventDefault()
      e.stopPropagation()
    })

    const button = dialog.querySelector(":scope button")
    if (!button) throw new TypeError("button was null when opening prompt")

    button.addEventListener("click", function () {
      callback?.(input.value)
      that.setDirty(true)
      dialog.close()
    })

    const rect = canvas.getBoundingClientRect()
    let offsetx = -20
    let offsety = -20
    if (rect) {
      offsetx -= rect.left
      offsety -= rect.top
    }

    if (event) {
      dialog.style.left = `${event.clientX + offsetx}px`
      dialog.style.top = `${event.clientY + offsety}px`
    } else {
      dialog.style.left = `${canvas.width * 0.5 + offsetx}px`
      dialog.style.top = `${canvas.height * 0.5 + offsety}px`
    }

    setTimeout(function () {
      input.focus()
      const clickTime = Date.now()
      function handleOutsideClick(e: Event) {
        if (!(e.target === canvas && Date.now() - clickTime > 256)) {
          return
        }

        dialog.close()
        canvas.parentElement?.removeEventListener("click", handleOutsideClick)
        canvas.parentElement?.removeEventListener("touchend", handleOutsideClick)
      }
      canvas.parentElement?.addEventListener("click", handleOutsideClick)
      canvas.parentElement?.addEventListener("touchend", handleOutsideClick)
    }, 10)

    return dialog
  }

  showSearchbox(
    event: MouseEvent,
    searchOptions?: IShowSearchOptions,
  ): HTMLDivElement {
    // proposed defaults
    const options: IShowSearchOptions = {
      slotFrom: null,
      nodeFrom: null,
      nodeTo: null,
      // TODO check for registeredSlot[In/Out]Types not empty
      // this will be checked for functionality enabled : filter on slot type, in and out
      doTypeFilter: LiteGraph.searchFilterEnabled,

      // these are default: pass to set initially set values
      // @ts-expect-error
      typeFilterIn: false,

      typeFilterOut: false,
      showGeneralIfNoneOnTypeFilter: true,
      showGeneralAfterTypeFiltered: true,
      hideOnMouseLeave: LiteGraph.searchHideOnMouseLeave,
      showAllIfEmpty: true,
      showAllOnOpen: LiteGraph.searchShowAllOnOpen,
      ...searchOptions,
    }

    // console.log(options);
    const that = this
    const graphcanvas = LGraphCanvas.activeCanvas
    const { canvas } = graphcanvas
    const rootDocument = canvas.ownerDocument || document

    const div = document.createElement("div")
    const dialog = Object.assign(div, {
      close(this: typeof div) {
        that.searchBox = undefined
        this.blur()
        canvas.focus()
        rootDocument.body.style.overflow = ""

        // important, if canvas loses focus keys wont be captured
        setTimeout(() => canvas.focus(), 20)
        dialog.remove()
      },
    } satisfies Partial<HTMLDivElement> & ICloseable)
    dialog.className = "litegraph litesearchbox graphdialog rounded"
    dialog.innerHTML = "<span class='name'>Search</span> <input autofocus type='text' class='value rounded'/>"
    if (options.doTypeFilter) {
      dialog.innerHTML += "<select class='slotInTypeFilter'><option value=''></option></select>"
      dialog.innerHTML += "<select class='slotOutTypeFilter'><option value=''></option></select>"
    }
    const helper = document.createElement("div")
    helper.className = "helper"
    dialog.append(helper)

    if (rootDocument.fullscreenElement) {
      rootDocument.fullscreenElement.append(dialog)
    } else {
      rootDocument.body.append(dialog)
      rootDocument.body.style.overflow = "hidden"
    }

    // dialog element has been appended
    let selIn
    let selOut
    if (options.doTypeFilter) {
      selIn = dialog.querySelector(":scope .slotInTypeFilter")
      selOut = dialog.querySelector(":scope .slotOutTypeFilter")
    }

    if (this.ds.scale > 1) {
      dialog.style.transform = `scale(${this.ds.scale})`
    }

    // hide on mouse leave
    if (options.hideOnMouseLeave) {
      let preventTimeout = 0
      let timeoutClose: ReturnType<typeof setTimeout> | null = null
      LiteGraph.pointerListenerAdd(dialog, "enter", function () {
        if (!timeoutClose) {
          return
        }

        clearTimeout(timeoutClose)
        timeoutClose = null
      })
      dialog.addEventListener("pointerleave", function () {
        if (preventTimeout) return

        const hideDelay = options.hideOnMouseLeave
        const delay = typeof hideDelay === "number" ? hideDelay : 500
        timeoutClose = setTimeout(dialog.close, delay)
      })
      // if filtering, check focus changed to comboboxes and prevent closing
      if (options.doTypeFilter) {
        if (!selIn) throw new TypeError("selIn was null when showing search box")
        if (!selOut) throw new TypeError("selOut was null when showing search box")

        selIn.addEventListener("click", function () {
          preventTimeout++
        })
        selIn.addEventListener("blur", function () {
          preventTimeout = 0
        })
        selIn.addEventListener("change", function () {
          preventTimeout = -1
        })
        selOut.addEventListener("click", function () {
          preventTimeout++
        })
        selOut.addEventListener("blur", function () {
          preventTimeout = 0
        })
        selOut.addEventListener("change", function () {
          preventTimeout = -1
        })
      }
    }

    // @ts-expect-error Panel?
    that.searchBox?.close()
    that.searchBox = dialog

    const maybeInput = dialog.querySelector(":scope input") as HTMLInputElement | null
    if (!maybeInput) throw new TypeError("Could not create search input box.")

    let first: string | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    let selected: ChildNode | null = null

    const input = maybeInput

    if (input) {
      input.addEventListener("blur", function () {
        this.focus()
      })
      input.addEventListener("keydown", function (e) {
        if (e.key == "ArrowUp") {
          // UP
          changeSelection(false)
        } else if (e.key == "ArrowDown") {
          // DOWN
          changeSelection(true)
        } else if (e.key == "Escape") {
          // ESC
          dialog.close()
        } else if (e.key == "Enter") {
          if (selected instanceof HTMLElement) {
            select(unescape(String(selected.dataset["type"])))
          } else if (first) {
            select(first)
          } else {
            dialog.close()
          }
        } else {
          if (timeout) {
            clearInterval(timeout)
          }
          timeout = setTimeout(refreshHelper, 10)
          return
        }
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return true
      })
    }

    // if should filter on type, load and fill selected and choose elements if passed
    if (options.doTypeFilter) {
      if (selIn) {
        const aSlots = LiteGraph.slotTypesIn
        const nSlots = aSlots.length

        if (
          options.typeFilterIn == LiteGraph.EVENT ||
          options.typeFilterIn == LiteGraph.ACTION
        ) {
          options.typeFilterIn = "_event_"
        }
        for (let iK = 0; iK < nSlots; iK++) {
          const opt = document.createElement("option")
          opt.value = aSlots[iK]
          opt.innerHTML = aSlots[iK]
          selIn.append(opt)
          if (
            // @ts-expect-error
            options.typeFilterIn !== false &&
            String(options.typeFilterIn).toLowerCase() ==
            String(aSlots[iK]).toLowerCase()
          ) {
            opt.selected = true
          }
        }
        selIn.addEventListener("change", function () {
          refreshHelper()
        })
      }
      if (selOut) {
        const aSlots = LiteGraph.slotTypesOut

        if (
          options.typeFilterOut == LiteGraph.EVENT ||
          options.typeFilterOut == LiteGraph.ACTION
        ) {
          options.typeFilterOut = "_event_"
        }
        for (const aSlot of aSlots) {
          const opt = document.createElement("option")
          opt.value = aSlot
          opt.innerHTML = aSlot
          selOut.append(opt)
          if (
            options.typeFilterOut !== false &&
            String(options.typeFilterOut).toLowerCase() ==
            String(aSlot).toLowerCase()
          ) {
            opt.selected = true
          }
        }
        selOut.addEventListener("change", function () {
          refreshHelper()
        })
      }
    }

    // compute best position
    const rect = canvas.getBoundingClientRect()

    const left = (event ? event.clientX : rect.left + rect.width * 0.5) - 80
    const top = (event ? event.clientY : rect.top + rect.height * 0.5) - 20
    dialog.style.left = `${left}px`
    dialog.style.top = `${top}px`

    // To avoid out of screen problems
    if (event.layerY > rect.height - 200) {
      helper.style.maxHeight = `${rect.height - event.layerY - 20}px`
    }
    requestAnimationFrame(function () {
      input.focus()
    })
    if (options.showAllOnOpen) refreshHelper()

    function select(name: string) {
      if (name) {
        if (that.onSearchBoxSelection) {
          that.onSearchBoxSelection(name, event, graphcanvas)
        } else {
          if (!graphcanvas.graph) throw new NullGraphError()

          graphcanvas.graph.beforeChange()
          const node = LiteGraph.createNode(name)
          if (node) {
            node.pos = graphcanvas.convertEventToCanvasOffset(event)
            graphcanvas.graph.add(node, false)
          }

          // join node after inserting
          if (options.nodeFrom) {
            let iS: number | false
            switch (typeof options.slotFrom) {
              case "string":
                iS = options.nodeFrom.findOutputSlot(options.slotFrom)
                break
              case "object":
                if (options.slotFrom == null) throw new TypeError("options.slotFrom was null when showing search box")

                iS = options.slotFrom.name
                  ? options.nodeFrom.findOutputSlot(options.slotFrom.name)
                  : -1
                // @ts-expect-error change interface check
                if (iS == -1 && options.slotFrom.slotIndex !== undefined) iS = options.slotFrom.slotIndex
                break
              case "number":
                iS = options.slotFrom
                break
              default:
              // try with first if no name set
                iS = 0
            }
            if (iS !== false && options.nodeFrom.outputs[iS] !== undefined) {
              if (iS > -1) {
                if (node == null) throw new TypeError("options.slotFrom was null when showing search box")

                options.nodeFrom.connectByType(iS, node, options.nodeFrom.outputs[iS].type)
              }
            } else {
              // console.warn("cant find slot " + options.slotFrom);
            }
          }
          if (options.nodeTo) {
            let iS: number | false
            switch (typeof options.slotFrom) {
              case "string":
                iS = options.nodeTo.findInputSlot(options.slotFrom)
                break
              case "object":
                if (options.slotFrom == null) throw new TypeError("options.slotFrom was null when showing search box")

                iS = options.slotFrom.name
                  ? options.nodeTo.findInputSlot(options.slotFrom.name)
                  : -1
                // @ts-expect-error change interface check
                if (iS == -1 && options.slotFrom.slotIndex !== undefined) iS = options.slotFrom.slotIndex
                break
              case "number":
                iS = options.slotFrom
                break
              default:
              // try with first if no name set
                iS = 0
            }
            if (iS !== false && options.nodeTo.inputs[iS] !== undefined) {
              if (iS > -1) {
                if (node == null) throw new TypeError("options.slotFrom was null when showing search box")
                // try connection
                options.nodeTo.connectByTypeOutput(iS, node, options.nodeTo.inputs[iS].type)
              }
            } else {
              // console.warn("cant find slotNodeTO " + options.slotFrom);
            }
          }

          graphcanvas.graph.afterChange()
        }
      }

      dialog.close()
    }

    function changeSelection(forward: boolean) {
      const prev = selected
      if (!selected) {
        selected = forward
          ? helper.firstChild
          : helper.childNodes[helper.childNodes.length]
      } else if (selected instanceof Element) {
        selected.classList.remove("selected")
        selected = forward
          ? selected.nextSibling
          : selected.previousSibling
        selected ||= prev
      }

      if (selected instanceof Element) {
        selected.classList.add("selected")
        selected.scrollIntoView({ block: "end", behavior: "smooth" })
      }
    }

    function refreshHelper() {
      timeout = null
      let str = input.value
      first = null
      helper.innerHTML = ""
      if (!str && !options.showAllIfEmpty) return

      if (that.onSearchBox) {
        const list = that.onSearchBox(helper, str, graphcanvas)
        if (list) {
          for (const item of list) {
            addResult(item)
          }
        }
      } else {
        if (!graphcanvas.graph) throw new NullGraphError()

        let c = 0
        str = str.toLowerCase()

        const filter = graphcanvas.filter || graphcanvas.graph.filter

        let sIn: HTMLSelectElement | null = null
        let sOut: HTMLSelectElement | null = null
        if (options.doTypeFilter && that.searchBox) {
          sIn = that.searchBox.querySelector<HTMLSelectElement>(":scope .slotInTypeFilter")
          sOut = that.searchBox.querySelector<HTMLSelectElement>(":scope .slotOutTypeFilter")
        }

        const keys = Object.keys(LiteGraph.registeredNodeTypes)
        const filtered = keys.filter(x => innerTestFilter(x))

        for (const item of filtered) {
          addResult(item)
          if (LGraphCanvas.searchLimit !== -1 && c++ > LGraphCanvas.searchLimit)
            break
        }

        // add general type if filtering
        if (
          options.showGeneralAfterTypeFiltered &&
          (sIn?.value || sOut?.value)
        ) {
          const filteredExtra = []
          for (const i in LiteGraph.registeredNodeTypes) {
            if (
              innerTestFilter(i, {
                inTypeOverride: sIn && sIn.value ? "*" : false,
                outTypeOverride: sOut && sOut.value ? "*" : false,
              })
            ) {
              filteredExtra.push(i)
            }
          }
          for (const extraItem of filteredExtra) {
            addResult(extraItem, "generic-type")
            if (LGraphCanvas.searchLimit !== -1 && c++ > LGraphCanvas.searchLimit)
              break
          }
        }

        // check il filtering gave no results
        if (
          (sIn?.value || sOut?.value) &&
          helper.childNodes.length == 0 &&
          options.showGeneralIfNoneOnTypeFilter
        ) {
          const filteredExtra: string[] = []
          for (const i in LiteGraph.registeredNodeTypes) {
            if (innerTestFilter(i, { skipFilter: true }))
              filteredExtra.push(i)
          }
          for (const extraItem of filteredExtra) {
            addResult(extraItem, "not-in-filter")
            if (LGraphCanvas.searchLimit !== -1 && c++ > LGraphCanvas.searchLimit)
              break
          }
        }

        function innerTestFilter(
          type: string,
          optsIn?: {
            inTypeOverride?: string | boolean
            outTypeOverride?: string | boolean
            skipFilter?: boolean
          },
        ): boolean {
          optsIn = optsIn || {}
          const optsDef = {
            skipFilter: false,
            inTypeOverride: false,
            outTypeOverride: false,
          }
          const opts = Object.assign(optsDef, optsIn)
          const ctor = LiteGraph.registeredNodeTypes[type]
          if (filter && ctor.filter != filter) return false
          if (
            (!options.showAllIfEmpty || str) &&
            !type.toLowerCase().includes(str) &&
            (!ctor.title || !ctor.title.toLowerCase().includes(str))
          ) {
            return false
          }

          // filter by slot IN, OUT types
          if (options.doTypeFilter && !opts.skipFilter) {
            const sType = type

            let sV = opts.inTypeOverride !== false
              ? opts.inTypeOverride
              : sIn?.value
            // type is stored
            if (sIn && typeof sV === "string" && sV && LiteGraph.registeredSlotInTypes[sV]?.nodes) {
              const doesInc = LiteGraph.registeredSlotInTypes[sV].nodes.includes(sType)
              if (doesInc === false) return false
            }

            sV = sOut?.value
            if (opts.outTypeOverride !== false) sV = opts.outTypeOverride
            // type is stored
            if (sOut && typeof sV === "string" && sV && LiteGraph.registeredSlotOutTypes[sV]?.nodes) {
              const doesInc = LiteGraph.registeredSlotOutTypes[sV].nodes.includes(sType)
              if (doesInc === false) return false
            }
          }
          return true
        }
      }

      function addResult(type: string, className?: string): void {
        const help = document.createElement("div")
        first ||= type

        const nodeType = LiteGraph.registeredNodeTypes[type]
        if (nodeType?.title) {
          help.textContent = nodeType?.title
          const typeEl = document.createElement("span")
          typeEl.className = "litegraph lite-search-item-type"
          typeEl.textContent = type
          help.append(typeEl)
        } else {
          help.textContent = type
        }

        help.dataset["type"] = escape(type)
        help.className = "litegraph lite-search-item"
        if (className) {
          help.className += ` ${className}`
        }
        help.addEventListener("click", function () {
          select(unescape(String(this.dataset["type"])))
        })
        helper.append(help)
      }
    }

    return dialog
  }

  showEditPropertyValue(
    node: LGraphNode,
    property: string,
    options: IDialogOptions,
  ): IDialog | undefined {
    if (!node || node.properties[property] === undefined) return

    options = options || {}

    const info = node.getPropertyInfo(property)
    const { type } = info

    let inputHtml: string

    if (
      type == "string" ||
      type == "number" ||
      type == "array" ||
      type == "object"
    ) {
      inputHtml = "<input autofocus type='text' class='value'/>"
    } else if ((type == "enum" || type == "combo") && info.values) {
      inputHtml = "<select autofocus type='text' class='value'>"
      for (const i in info.values) {
        const v = Array.isArray(info.values) ? info.values[i] : i

        const selected = v == node.properties[property] ? "selected" : ""
        inputHtml += `<option value='${v}' ${selected}>${info.values[i]}</option>`
      }
      inputHtml += "</select>"
    } else if (type == "boolean" || type == "toggle") {
      const propertyValue = node.properties[property]
      const checked = propertyValue ? "checked" : ""
      inputHtml = `<input autofocus type='checkbox' class='value' ${checked}/>`
    } else {
      console.warn(`unknown type: ${type}`)
      return
    }

    const displayName = DOMPurify.sanitize(info.label || property)
    const dialog = this.createDialog(
      `<span class='name'>${displayName}</span>${inputHtml}<button>OK</button>`,
      options,
    )

    let input: HTMLInputElement | HTMLSelectElement | null
    if ((type == "enum" || type == "combo") && info.values) {
      input = dialog.querySelector(":scope select")
      input?.addEventListener("change", function (e) {
        dialog.modified()
        setValue((e.target as HTMLSelectElement)?.value)
      })
    } else if (type == "boolean" || type == "toggle") {
      input = dialog.querySelector(":scope input")
      input?.addEventListener("click", function () {
        dialog.modified()
        // @ts-expect-error
        setValue(!!input.checked)
      })
    } else {
      input = dialog.querySelector(":scope input") as HTMLInputElement | null
      if (input) {
        input.addEventListener("blur", function () {
          this.focus()
        })

        let v = node.properties[property] !== undefined
          ? node.properties[property]
          : ""
        if (type !== "string") {
          v = JSON.stringify(v)
        }

        // @ts-expect-error
        input.value = v
        input.addEventListener("keydown", function (e) {
          if (e.key == "Escape") {
            // ESC
            dialog.close()
          } else if (e.key == "Enter") {
            // ENTER
            // save
            inner()
          } else {
            dialog.modified()
            return
          }
          e.preventDefault()
          e.stopPropagation()
        })
      }
    }
    input?.focus()

    const button = dialog.querySelector(":scope button")
    if (!button) throw new TypeError("Show edit property value button was null.")
    button.addEventListener("click", inner)

    function inner() {
      setValue(input?.value)
    }
    const dirty = () => this.#dirty()

    function setValue(value: string | number | undefined) {
      if (
        info?.values &&
        typeof info.values === "object" &&
        info.values[value] != undefined
      ) {
        value = info.values[value]
      }

      if (typeof node.properties[property] == "number") {
        value = Number(value)
      }
      if (type == "array" || type == "object") {
        // @ts-expect-error JSON.parse doesn't care.
        value = JSON.parse(value)
      }
      node.properties[property] = value
      if (node.graph) {
        node.graph.incrementVersion()
      }
      node.onPropertyChanged?.(property, value)
      options.onclose?.()
      dialog.close()
      dirty()
    }

    return dialog
  }

  // TODO refactor, theer are different dialog, some uses createDialog, some dont
  createDialog(html: string, options: IDialogOptions): IDialog {
    const defOptions = {
      checkForInput: false,
      closeOnLeave: true,
      closeOnLeaveCheckModified: true,
    }
    options = Object.assign(defOptions, options || {})

    const customProperties = {
      className: "graphdialog",
      innerHTML: html,
      isModified: false,
      modified() {
        this.isModified = true
      },
      close(this: IDialog) {
        this.remove()
      },
    } satisfies Partial<IDialog>

    const div = document.createElement("div")
    const dialog: IDialog = Object.assign(div, customProperties)

    const rect = this.canvas.getBoundingClientRect()
    let offsetx = -20
    let offsety = -20
    if (rect) {
      offsetx -= rect.left
      offsety -= rect.top
    }

    if (options.position) {
      offsetx += options.position[0]
      offsety += options.position[1]
    } else if (options.event) {
      offsetx += options.event.clientX
      offsety += options.event.clientY
    } else {
      // centered
      offsetx += this.canvas.width * 0.5
      offsety += this.canvas.height * 0.5
    }

    dialog.style.left = `${offsetx}px`
    dialog.style.top = `${offsety}px`

    if (!this.canvas.parentNode) throw new TypeError("Canvas parent element was null.")
    this.canvas.parentNode.append(dialog)

    // acheck for input and use default behaviour: save on enter, close on esc
    if (options.checkForInput) {
      const aI = dialog.querySelectorAll(":scope input") as NodeListOf<HTMLInputElement>
      if (aI.length > 0) {
        for (const iX of aI) {
          iX.addEventListener("keydown", function (e) {
            dialog.modified()
            if (e.key == "Escape") {
              dialog.close()
            } else if (e.key != "Enter") {
              return
            }
            e.preventDefault()
            e.stopPropagation()
          })
          iX.focus()
        }
      }
    }

    let dialogCloseTimer: ReturnType<typeof setTimeout>
    let preventTimeout = 0
    dialog.addEventListener("mouseleave", function () {
      if (preventTimeout) return

      if (!dialog.isModified && LiteGraph.dialogCloseOnMouseLeave) {
        dialogCloseTimer = setTimeout(
          dialog.close,
          LiteGraph.dialogCloseOnMouseLeaveDelay,
        )
      }
    })
    dialog.addEventListener("mouseenter", function () {
      if (options.closeOnLeave || LiteGraph.dialogCloseOnMouseLeave) {
        if (dialogCloseTimer) clearTimeout(dialogCloseTimer)
      }
    })
    const selInDia = dialog.querySelectorAll(":scope select")
    // if filtering, check focus changed to comboboxes and prevent closing
    if (selInDia.length > 0) {
      for (const selIn of selInDia) {
        selIn.addEventListener("click", function () {
          preventTimeout++
        })
        selIn.addEventListener("blur", function () {
          preventTimeout = 0
        })
        selIn.addEventListener("change", function () {
          preventTimeout = -1
        })
      }
    }

    return dialog
  }

  createPanel(title: string, options: ICreatePanelOptions): Panel {
    options = options || {}

    const root = document.createElement("div") as Panel
    root.className = "litegraph dialog"
    root.innerHTML = "<div class='dialog-header'><span class='dialog-title'></span></div><div class='dialog-content'></div><div style='display:none;' class='dialog-alt-content'></div><div class='dialog-footer'></div>"
    root.header = root.querySelector(":scope .dialog-header")!

    if (options.width)
      root.style.width = options.width + (typeof options.width === "number" ? "px" : "")
    if (options.height)
      root.style.height = options.height + (typeof options.height === "number" ? "px" : "")
    if (options.closable) {
      const close = document.createElement("span")
      close.innerHTML = "&#10005;"
      close.classList.add("close")
      close.addEventListener("click", function () {
        root.close()
      })
      root.header.append(close)
    }
    root.titleElement = root.querySelector(":scope .dialog-title")!
    root.titleElement.textContent = title
    root.content = root.querySelector(":scope .dialog-content")!
    root.altContent = root.querySelector(":scope .dialog-alt-content")!
    root.footer = root.querySelector(":scope .dialog-footer")!

    root.close = function () {
      if (typeof root.onClose == "function") root.onClose()
      root.remove()
      this.remove()
    }

    // function to swap panel content
    root.toggleAltContent = function (force?: boolean) {
      let vTo: string
      let vAlt: string
      if (force !== undefined) {
        vTo = force ? "block" : "none"
        vAlt = force ? "none" : "block"
      } else {
        vTo = root.altContent.style.display != "block" ? "block" : "none"
        vAlt = root.altContent.style.display != "block" ? "none" : "block"
      }
      root.altContent.style.display = vTo
      root.content.style.display = vAlt
    }

    root.toggleFooterVisibility = function (force?: boolean) {
      let vTo: string
      if (force !== undefined) {
        vTo = force ? "block" : "none"
      } else {
        vTo = root.footer.style.display != "block" ? "block" : "none"
      }
      root.footer.style.display = vTo
    }

    root.clear = function () {
      this.content.innerHTML = ""
    }

    root.addHTML = function (code: string, classname?: string, onFooter?: boolean) {
      const elem = document.createElement("div")
      if (classname) elem.className = classname
      elem.innerHTML = code
      if (onFooter) root.footer.append(elem)
      else root.content.append(elem)
      return elem
    }

    root.addButton = function (
      name: string,
      callback: () => void,
      options?: unknown,
    ): PanelButton {
      const elem = document.createElement("button") as PanelButton
      elem.textContent = name
      elem.options = options
      elem.classList.add("btn")
      elem.addEventListener("click", callback)
      root.footer.append(elem)
      return elem
    }

    root.addSeparator = function () {
      const elem = document.createElement("div")
      elem.className = "separator"
      root.content.append(elem)
    }

    root.addWidget = function (
      type: string,
      name: string,
      value: TWidgetValue,
      options?: PanelWidgetOptions,
      callback?: PanelWidgetCallback,
    ): PanelWidget {
      options = options || {}
      let strValue = String(value)
      type = type.toLowerCase()
      const precision = options.precision ?? 3
      if (type == "number" && typeof value === "number") strValue = value.toFixed(precision)

      const elem = document.createElement("div") as PanelWidget
      elem.className = "property"
      elem.innerHTML = "<span class='property-name'></span><span class='property-value'></span>"
      const nameSpan = elem.querySelector(":scope .property-name")
      if (!nameSpan) throw new TypeError("Property name element was null.")

      nameSpan.textContent = options.label || name
      const valueElement: HTMLSpanElement | null = elem.querySelector(":scope .property-value")
      if (!valueElement) throw new TypeError("Property name element was null.")
      valueElement.textContent = strValue
      elem.dataset["property"] = name
      elem.dataset["type"] = options.type || type
      elem.options = options
      elem.value = value

      if (type == "code") {
        elem.addEventListener("click", function () {
          const property = this.dataset["property"]
          if (property) root.innerShowCodePad?.(property)
        })
      } else if (type == "boolean") {
        elem.classList.add("boolean")
        if (value) elem.classList.add("bool-on")
        elem.addEventListener("click", () => {
          const propname = elem.dataset["property"]
          elem.value = !elem.value
          elem.classList.toggle("bool-on")
          if (!valueElement) throw new TypeError("Property name element was null.")

          valueElement.textContent = elem.value
            ? "true"
            : "false"
          innerChange(propname, elem.value)
        })
      } else if (type == "string" || type == "number") {
        if (!valueElement) throw new TypeError("Property name element was null.")
        valueElement.setAttribute("contenteditable", "true")
        valueElement.addEventListener("keydown", function (e) {
          // allow for multiline
          if (!(e.code == "Enter" && (type != "string" || !e.shiftKey))) {
            return
          }

          e.preventDefault()
          this.blur()
        })
        valueElement.addEventListener("blur", function () {
          let v: string | number | null = this.textContent
          const propname = this.parentElement?.dataset["property"]
          const proptype = this.parentElement?.dataset["type"]
          if (proptype == "number") v = Number(v)
          innerChange(propname, v)
        })
      } else if (type == "enum" || type == "combo") {
        if (!valueElement) throw new TypeError("Property name element was null.")

        const strValue = LGraphCanvas.getPropertyPrintableValue(value, options.values)
        valueElement.textContent = strValue ?? ""

        valueElement.addEventListener("click", function (event) {
          const values = options?.values || []
          const propname = this.parentElement?.dataset["property"]
          const innerClicked = (v?: string) => {
            this.textContent = v ?? null
            innerChange(propname, v)
            return false
          }
          new LiteGraph.ContextMenu(
            values,
            {
              event,
              className: "dark",
              callback: innerClicked,
            },
          )
        })
      }

      root.content.append(elem)

      function innerChange(name: string | undefined, value: TWidgetValue) {
        const opts = options || {}
        opts.callback?.(name, value, opts)
        callback?.(name, value, opts)
      }

      return elem
    }

    if (typeof root.onOpen == "function") root.onOpen()

    return root
  }

  closePanels(): void {
    type MightHaveClose = HTMLDivElement & Partial<ICloseable>
    document.querySelector<MightHaveClose>("#node-panel")?.close?.()
    document.querySelector<MightHaveClose>("#option-panel")?.close?.()
  }

  showShowNodePanel(node: LGraphNode): void {
    this.SELECTED_NODE = node
    this.closePanels()
    const refWindow = this.getCanvasWindow()
    const panel = this.createPanel(node.title || "", {
      closable: true,
      window: refWindow,
      onOpen: () => {
        this.NODEPANEL_IS_OPEN = true
      },
      onClose: () => {
        this.NODEPANEL_IS_OPEN = false
        this.nodePanel = undefined
      },
    })
    this.nodePanel = panel
    panel.id = "node-panel"
    panel.node = node
    panel.classList.add("settings")

    const innerRefresh = () => {
      // clear
      panel.content.innerHTML = ""
      const nodeType = DOMPurify.sanitize(node.type)
      // @ts-expect-error ctor props
      const nodeDescription = DOMPurify.sanitize(node.constructor.desc || "")
      panel.addHTML(`<span class='node-type'>${nodeType}</span><span class='node-desc'>${nodeDescription}</span><span class='separator'></span>`)

      panel.addHTML("<h3>Properties</h3>")

      const fUpdate: PanelWidgetCallback = (name, value) => {
        if (!this.graph) throw new NullGraphError()
        if (!name) return
        this.graph.beforeChange(node)
        const strValue: string = String(value)
        switch (name) {
          case "Title":
            if (typeof value !== "string") throw new TypeError("Attempting to set title to non-string value.")

            node.title = value
            break
          case "Mode": {
            if (typeof value !== "string") throw new TypeError("Attempting to set mode to non-string value.")

            const kV = Object.values(LiteGraph.NODE_MODES).indexOf(value)
            if (kV !== -1 && LiteGraph.NODE_MODES[kV] != null) {
              node.changeMode(kV)
            } else {
              console.warn(`unexpected mode: ${value}`)
            }
            break
          }
          case "Color":
            if (typeof value !== "string") throw new TypeError("Attempting to set colour to non-string value.")

            if (LGraphCanvas.nodeColors[strValue] != null) {
              node.color = LGraphCanvas.nodeColors[strValue].color
              node.bgcolor = LGraphCanvas.nodeColors[strValue].bgColor
            } else {
              console.warn(`unexpected color: ${strValue}`)
            }
            break
          default:
            node.setProperty(name, value)
            LGraphCanvas.syncPanelPropertyWidget(panel, name, node.properties[name]!)
            break
        }
        this.graph.afterChange()
        this.dirtyCanvas = true
      }

      panel.addWidget("string", "Title", node.title, {}, fUpdate)

      const mode = node.mode == null ? undefined : LiteGraph.NODE_MODES[node.mode]
      panel.addWidget("combo", "Mode", mode, { values: LiteGraph.NODE_MODES }, fUpdate)

      const nodeCol = node.color !== undefined
        ? Object.keys(LGraphCanvas.nodeColors).filter(function (nK) { return LGraphCanvas.nodeColors[nK].color == node.color })
        : ""

      panel.addWidget("combo", "Color", nodeCol, { values: Object.keys(LGraphCanvas.nodeColors) }, fUpdate)

      for (const pName in node.properties) {
        const value = node.properties[pName]
        const info = node.getPropertyInfo(pName)

        // in case the user wants control over the side panel widget
        if (node.onAddPropertyToPanel?.(pName, panel)) continue

        panel.addWidget(info.widget || info.type, pName, value, info, fUpdate)
      }

      panel.addSeparator()

      node.onShowCustomPanelInfo?.(panel)

      // clear
      panel.footer.innerHTML = ""
      panel.addButton("Delete", function () {
        if (node.blockDelete) return
        if (!node.graph) throw new NullGraphError()

        node.graph.remove(node)
        panel.close()
      }).classList.add("delete")
    }

    panel.innerShowCodePad = function (propname: string) {
      panel.classList.remove("settings")
      panel.classList.add("centered")

      panel.altContent.innerHTML = "<textarea class='code'></textarea>"
      const textarea: HTMLTextAreaElement = panel.altContent.querySelector(":scope textarea")!
      const fDoneWith = function () {
        panel.toggleAltContent(false)
        panel.toggleFooterVisibility(true)
        textarea.remove()
        panel.classList.add("settings")
        panel.classList.remove("centered")
        innerRefresh()
      }
      textarea.value = String(node.properties[propname])
      textarea.addEventListener("keydown", function (e: KeyboardEvent) {
        if (!(e.code == "Enter" && e.ctrlKey)) {
          return
        }

        node.setProperty(propname, textarea.value)
        fDoneWith()
      })
      panel.toggleAltContent(true)
      panel.toggleFooterVisibility(false)
      textarea.style.height = "calc(100% - 40px)"

      const assign = panel.addButton("Assign", function () {
        node.setProperty(propname, textarea.value)
        fDoneWith()
      })
      panel.altContent.append(assign)
      const button = panel.addButton("Close", fDoneWith)
      button.style.float = "right"
      panel.altContent.append(button)
    }

    innerRefresh()

    if (!this.canvas.parentNode) throw new TypeError("showNodePanel - this.canvas.parentNode was null")
    this.canvas.parentNode.append(panel)
  }

  checkPanels(): void {
    if (!this.canvas) return

    if (!this.canvas.parentNode) throw new TypeError("checkPanels - this.canvas.parentNode was null")
    const panels = this.canvas.parentNode.querySelectorAll(":scope .litegraph.dialog")
    for (const panel of panels) {
      // @ts-expect-error Panel
      if (!panel.node) continue
      // @ts-expect-error Panel
      if (!panel.node.graph || panel.graph != this.graph) panel.close()
    }
  }

  getCanvasMenuOptions(): IContextMenuValue<string>[] {
    let options: IContextMenuValue<string>[]
    if (this.getMenuOptions) {
      options = this.getMenuOptions()
    } else {
      options = [
        {
          content: "Add Node",
          hasSubmenu: true,
          callback: LGraphCanvas.onMenuAdd,
        },
        { content: "Add Group", callback: LGraphCanvas.onGroupAdd },
        {
          content: "Paste",
          callback: () => {
            this.pasteFromClipboard()
          },
        },
        // { content: "Arrange", callback: that.graph.arrange },
        // {content:"Collapse All", callback: LGraphCanvas.onMenuCollapseAll }
      ]
      if (Object.keys(this.selectedNodes).length > 1) {
        options.push({
          content: "Convert to Subgraph 🆕",
          callback: () => {
            if (!this.selectedItems.size) throw new Error("Convert to Subgraph: Nothing selected.")
            this.ensureGraph.convertToSubgraph(this.selectedItems)
          },
        }, {
          content: "Align",
          hasSubmenu: true,
          callback: LGraphCanvas.onGroupAlign,
        })
      }
    }

    const extra = this.getExtraMenuOptions?.(this, options)
    return Array.isArray(extra)
      ? options.concat(extra)
      : options
  }

  // called by processContextMenu to extract the menu list
  getNodeMenuOptions(node: LGraphNode) {
    let options: (IContextMenuValue<string> | IContextMenuValue<string | null> | IContextMenuValue<INodeSlotContextItem> | IContextMenuValue<unknown, LGraphNode> | IContextMenuValue<typeof LiteGraph.VALID_SHAPES[number]> | null)[]

    if (node.getMenuOptions) {
      options = node.getMenuOptions(this)
    } else {
      options = [
        {
          content: "Inputs",
          hasSubmenu: true,
          disabled: true,
        },
        {
          content: "Outputs",
          hasSubmenu: true,
          disabled: true,
          callback: LGraphCanvas.showMenuNodeOptionalOutputs,
        },
        null,
        ...(node instanceof SubgraphNode
          ? [
            {
              content: "Unpack Subgraph",
              callback: () => {
                this.ensureGraph.unpackSubgraph(node)
              },
            },
          ]
          : []),
        {
          content: "Convert to Subgraph 🆕",
          callback: () => {
            if (!this.selectedItems.size) throw new Error("Convert to Subgraph: Nothing selected.")
            this.ensureGraph.convertToSubgraph(this.selectedItems)
          },
        },
        {
          content: "Properties",
          hasSubmenu: true,
          callback: LGraphCanvas.onShowMenuNodeProperties,
        },
        {
          content: "Properties Panel",
          callback: function (
            _item: Positionable,
            _options: IContextMenuOptions | undefined,
            _e: MouseEvent | undefined,
            _menu: ContextMenu<unknown> | undefined,
            node: LGraphNode,
          ) { LGraphCanvas.activeCanvas.showShowNodePanel(node) },
        },
        null,
        {
          content: "Title",
          callback: LGraphCanvas.onShowPropertyEditor,
        },
        {
          content: "Mode",
          hasSubmenu: true,
          callback: LGraphCanvas.onMenuNodeMode,
        },
      ]
      if (node.resizable !== false) {
        options.push({
          content: "Resize",
          callback: LGraphCanvas.onMenuResizeNode,
        })
      }
      if (node.collapsible) {
        options.push({
          content: node.collapsed ? "Expand" : "Collapse",
          callback: LGraphCanvas.onMenuNodeCollapse,
        })
      }
      if (node.widgets?.some(w => w.advanced)) {
        options.push({
          content: node.showAdvanced ? "Hide Advanced" : "Show Advanced",
          callback: LGraphCanvas.onMenuToggleAdvanced,
        })
      }
      options.push(
        {
          content: node.pinned ? "Unpin" : "Pin",
          callback: () => {
            for (const i in this.selectedNodes) {
              const node = this.selectedNodes[i]
              node.pin()
            }
            this.setDirty(true, true)
          },
        },
        {
          content: "Colors",
          hasSubmenu: true,
          callback: LGraphCanvas.onMenuNodeColors,
        },
        {
          content: "Shapes",
          hasSubmenu: true,
          callback: LGraphCanvas.onMenuNodeShapes,
        },
        null,
      )
    }

    const extra = node.getExtraMenuOptions?.(this, options)
    if (Array.isArray(extra) && extra.length > 0) {
      extra.push(null)
      options = extra.concat(options)
    }

    if (node.clonable !== false) {
      options.push({
        content: "Clone",
        callback: LGraphCanvas.onMenuNodeClone,
      })
    }

    if (Object.keys(this.selectedNodes).length > 1) {
      options.push({
        content: "Align Selected To",
        hasSubmenu: true,
        callback: LGraphCanvas.onNodeAlign,
      }, {
        content: "Distribute Nodes",
        hasSubmenu: true,
        callback: LGraphCanvas.createDistributeMenu,
      })
    }

    options.push(null, {
      content: "Remove",
      disabled: !(node.removable !== false && !node.blockDelete),
      callback: LGraphCanvas.onMenuNodeRemove,
    })

    node.graph?.onGetNodeMenuOptions?.(options, node)

    return options
  }

  /** @deprecated */
  getGroupMenuOptions(group: LGraphGroup) {
    console.warn("LGraphCanvas.getGroupMenuOptions is deprecated, use LGraphGroup.getMenuOptions instead")
    return group.getMenuOptions()
  }

  processContextMenu(node: LGraphNode | undefined, event: CanvasPointerEvent): void {
    const canvas = LGraphCanvas.activeCanvas
    const refWindow = canvas.getCanvasWindow()

    // TODO: Remove type kludge
    let menuInfo: (IContextMenuValue | string | null)[]
    const options: IContextMenuOptions = {
      event,
      callback: innerOptionClicked,
      extra: node,
    }

    if (node) {
      options.title = node.displayType ?? node.type ?? undefined
      LGraphCanvas.activeNode = node

      // check if mouse is in input
      const slot = node.getSlotInPosition(event.canvasX, event.canvasY)
      if (slot) {
        // on slot
        menuInfo = []
        if (node.getSlotMenuOptions) {
          menuInfo = node.getSlotMenuOptions(slot)
        } else {
          if (slot.output?.links?.length || slot.input?.link != null) {
            menuInfo.push({ content: "Disconnect Links", slot })
          }

          const inputOutputSlot = slot.input || slot.output
          if (!inputOutputSlot) throw new TypeError("Both in put and output slots were null when processing context menu.")

          if (inputOutputSlot.removable) {
            menuInfo.push(
              inputOutputSlot.locked
                ? "Cannot remove"
                : { content: "Remove Slot", slot },
            )
          }
          if (!inputOutputSlot.nameLocked && !(("link" in inputOutputSlot) && inputOutputSlot.widget)) {
            menuInfo.push({ content: "Rename Slot", slot })
          }

          if (node.getExtraSlotMenuOptions) {
            menuInfo.push(...node.getExtraSlotMenuOptions(slot))
          }
        }
        // @ts-expect-error Slot type can be number and has number checks
        options.title = (slot.input ? slot.input.type : slot.output.type) || "*"
        if (slot.input && slot.input.type == LiteGraph.ACTION)
          options.title = "Action"

        if (slot.output && slot.output.type == LiteGraph.EVENT)
          options.title = "Event"
      } else {
        // on node
        menuInfo = this.getNodeMenuOptions(node)
      }
    } else {
      menuInfo = this.getCanvasMenuOptions()
      if (!this.graph) throw new NullGraphError()

      // Check for reroutes
      if (this.linksRenderMode !== LinkRenderType.HIDDEN_LINK) {
        const reroute = this.graph.getRerouteOnPos(event.canvasX, event.canvasY, this.#visibleReroutes)
        if (reroute) {
          menuInfo.unshift({
            content: "Delete Reroute",
            callback: () => {
              if (!this.graph) throw new NullGraphError()

              this.graph.removeReroute(reroute.id)
            },
          }, null)
        }
      }

      const group = this.graph.getGroupOnPos(
        event.canvasX,
        event.canvasY,
      )
      if (group) {
        // on group
        menuInfo.push(null, {
          content: "Edit Group",
          hasSubmenu: true,
          submenu: {
            title: "Group",
            extra: group,
            options: group.getMenuOptions(),
          },
        })
      }
    }

    // show menu
    if (!menuInfo) return

    // @ts-expect-error Remove param refWindow - unused
    new LiteGraph.ContextMenu(menuInfo, options, refWindow)

    const createDialog = (options: IDialogOptions) => this.createDialog(
      "<span class='name'>Name</span><input autofocus type='text'/><button>OK</button>",
      options,
    )
    const setDirty = () => this.setDirty(true)

    function innerOptionClicked(v: IContextMenuValue<unknown>, options: IDialogOptions) {
      if (!v) return

      if (v.content == "Remove Slot") {
        if (!node?.graph) throw new NullGraphError()

        const info = v.slot
        if (!info) throw new TypeError("Found-slot info was null when processing context menu.")

        node.graph.beforeChange()
        if (info.input) {
          node.removeInput(info.slot)
        } else if (info.output) {
          node.removeOutput(info.slot)
        }
        node.graph.afterChange()
        return
      }
      if (v.content == "Disconnect Links") {
        if (!node?.graph) throw new NullGraphError()

        const info = v.slot
        if (!info) throw new TypeError("Found-slot info was null when processing context menu.")

        node.graph.beforeChange()
        if (info.output) {
          node.disconnectOutput(info.slot)
        } else if (info.input) {
          node.disconnectInput(info.slot, true)
        }
        node.graph.afterChange()
        return
      }
      if (v.content == "Rename Slot") {
        if (!node) throw new TypeError("`node` was null when processing the context menu.")

        const info = v.slot
        if (!info) throw new TypeError("Found-slot info was null when processing context menu.")

        const slotInfo = info.input
          ? node.getInputInfo(info.slot)
          : node.getOutputInfo(info.slot)
        const dialog = createDialog(options)

        const input = dialog.querySelector(":scope input") as HTMLInputElement | null
        if (input && slotInfo) {
          input.value = slotInfo.label || ""
        }
        const inner = function () {
          if (!node.graph) throw new NullGraphError()

          node.graph.beforeChange()
          if (input?.value) {
            if (slotInfo) {
              slotInfo.label = input.value
            }
            setDirty()
          }
          dialog.close()
          node.graph.afterChange()
        }
        dialog.querySelector(":scope button")?.addEventListener("click", inner)
        if (!input) throw new TypeError("Input element was null when processing context menu.")

        input.addEventListener("keydown", function (e) {
          dialog.isModified = true
          if (e.key == "Escape") {
            // ESC
            dialog.close()
          } else if (e.key == "Enter") {
            // save
            inner()
          } else if ((e.target as Element).localName != "textarea") {
            return
          }
          e.preventDefault()
          e.stopPropagation()
        })
        input.focus()
      }
    }
  }

  /**
   * Starts an animation to fit the view around the specified selection of nodes.
   * @param bounds The bounds to animate the view to, defined by a rectangle.
   */
  animateToBounds(bounds: ReadOnlyRect, options: AnimationOptions = {}) {
    const setDirty = () => this.setDirty(true, true)
    this.ds.animateToBounds(bounds, setDirty, options)
  }

  /**
   * Fits the view to the selected nodes with animation.
   * If nothing is selected, the view is fitted around all items in the graph.
   */
  fitViewToSelectionAnimated(options: AnimationOptions = {}) {
    const items = this.selectedItems.size
      ? Array.from(this.selectedItems)
      : this.positionableItems
    const bounds = createBounds(items)
    if (!bounds) throw new TypeError("Attempted to fit to view but could not calculate bounds.")

    const setDirty = () => this.setDirty(true, true)
    this.ds.animateToBounds(bounds, setDirty, options)
  }
}
