import type { Dictionary, ISlotType, Rect, WhenNullish } from "./interfaces"

import { GraphHistory } from "./canvas/GraphHistory"
import { InputIndicators } from "./canvas/InputIndicators"
import { ContextMenu } from "./ContextMenu"
import { CurveEditor } from "./CurveEditor"
import { DragAndScale } from "./DragAndScale"
import { LabelPosition, SlotDirection, SlotShape, SlotType } from "./draw"
import { Rectangle } from "./infrastructure/Rectangle"
import { LGraph } from "./LGraph"
import { LGraphCanvas } from "./LGraphCanvas"
import { LGraphGroup } from "./LGraphGroup"
import { LGraphNode } from "./LGraphNode"
import { LLink } from "./LLink"
import { distance, isInsideRectangle, overlapBounding } from "./measure"
import { Reroute } from "./Reroute"
import { SubgraphIONodeBase } from "./subgraph/SubgraphIONodeBase"
import { SubgraphSlot } from "./subgraph/SubgraphSlotBase"
import {
  LGraphEventMode,
  LinkDirection,
  LinkRenderType,
  NodeSlotType,
  RenderShape,
  TitleMode,
} from "./types/globalEnums"
import { createUuidv4 } from "./utils/uuid"

/**
 * Global litegraph runtime: configuration, constants, and node type registry.
 *
 * A single instance is exported as `LiteGraph` from the package entry point.
 * Register node classes with `registerNodeType`, create nodes with `createNode`,
 * and read/write editor-wide defaults (colours, grid size, interaction flags) on this object.
 * @see `LiteGraph`
 */
export class LiteGraphGlobal {
  /** @see `SlotShape` Re-exported for legacy global access. */
  SlotShape = SlotShape
  /** @see `SlotDirection` Re-exported for legacy global access. */
  SlotDirection = SlotDirection
  /** @see `SlotType` Re-exported for legacy global access. */
  SlotType = SlotType
  /** @see `LabelPosition` Re-exported for legacy global access. */
  LabelPosition = LabelPosition

  /** Serialised graph format version written into saved graphs. */
  VERSION = 0.4 as const

  /** Default canvas grid spacing in graph units. */
  CANVAS_GRID_SIZE = 10

  /** Default height of node title bars in pixels. */
  NODE_TITLE_HEIGHT = 30
  /** Default Y offset for title text baseline within the title bar. */
  NODE_TITLE_TEXT_Y = 20
  /** Vertical spacing between node slot rows in pixels. */
  NODE_SLOT_HEIGHT = 20
  /** Default height allocated per widget row in pixels. */
  NODE_WIDGET_HEIGHT = 20
  /** Default node width in pixels. */
  NODE_WIDTH = 140
  /** Minimum node width when resizing. */
  NODE_MIN_WIDTH = 50
  /** Radius of collapsed node circle representation. */
  NODE_COLLAPSED_RADIUS = 10
  /** Width of collapsed node card representation. */
  NODE_COLLAPSED_WIDTH = 80
  /** Default node title bar text colour. */
  NODE_TITLE_COLOR = "#999"
  /** Title bar text colour when the node is selected. */
  NODE_SELECTED_TITLE_COLOR = "#FFF"
  /** Default node body label font size. */
  NODE_TEXT_SIZE = 14
  /** Default node body text colour. */
  NODE_TEXT_COLOR = "#AAA"
  /** Text colour for highlighted node labels. */
  NODE_TEXT_HIGHLIGHT_COLOR = "#EEE"
  /** Font size for node sub-labels. */
  NODE_SUBTEXT_SIZE = 12
  /** Default node accent/border colour. */
  NODE_DEFAULT_COLOR = "#333"
  /** Default node background fill colour. */
  NODE_DEFAULT_BGCOLOR = "#353535"
  /** Default node outline/box colour. */
  NODE_DEFAULT_BOXCOLOR = "#666"
  /** Default node corner shape. */
  NODE_DEFAULT_SHAPE = RenderShape.ROUND
  /** Outline colour drawn around selected node boxes. */
  NODE_BOX_OUTLINE_COLOR = "#FFF"
  /** Colour used to indicate node execution errors. */
  NODE_ERROR_COLOUR = "#E00"
  /** Default font family for node text. */
  NODE_FONT = "Inter"

  /** Default UI font family. */
  DEFAULT_FONT = "Inter"
  /** Default drop-shadow colour for canvas text. */
  DEFAULT_SHADOW_COLOR = "rgba(0,0,0,0.5)"

  GROUP_TEXT_SIZE = 20
  /** Font family for group titles. */
  GROUP_FONT = "Inter"

  /** Default widget background colour. */
  WIDGET_BGCOLOR = "#222"
  /** Default widget outline colour. */
  WIDGET_OUTLINE_COLOR = "#666"
  /** Outline colour for advanced widget types. */
  WIDGET_ADVANCED_OUTLINE_COLOR = "rgba(56, 139, 253, 0.8)"
  /** Default widget label/value text colour. */
  WIDGET_TEXT_COLOR = "#DDD"
  /** Secondary widget text colour. */
  WIDGET_SECONDARY_TEXT_COLOR = "#999"
  /** Text colour for disabled widgets. */
  WIDGET_DISABLED_TEXT_COLOR = "#666"

  /** Default colour for data links. */
  LINK_COLOR = "#9A9"
  /** Colour for event/action links. */
  EVENT_LINK_COLOR = "#A86"
  /** Colour for in-progress link being dragged. */
  CONNECTING_LINK_COLOR = "#AFA"

  /** Maximum nodes allowed per graph (guard against infinite loops). */
  MAX_NUMBER_OF_NODES = 10_000
  /** Default `[x, y]` position for newly created nodes. */
  DEFAULT_POSITION = [100, 100]
  /** Valid `RenderShape` name strings for node configuration. */
  VALID_SHAPES = ["default", "box", "round", "card"] satisfies ("default" | Lowercase<keyof typeof RenderShape>)[]
  /** Corner radius for `RenderShape.ROUND` nodes. */
  ROUND_RADIUS = 8

  /** @see `RenderShape.BOX` */
  BOX_SHAPE = RenderShape.BOX
  /** @see `RenderShape.ROUND` */
  ROUND_SHAPE = RenderShape.ROUND
  /** @see `RenderShape.CIRCLE` */
  CIRCLE_SHAPE = RenderShape.CIRCLE
  /** @see `RenderShape.CARD` */
  CARD_SHAPE = RenderShape.CARD
  /** @see `RenderShape.ARROW` */
  ARROW_SHAPE = RenderShape.ARROW
  /** @see `RenderShape.GRID` Intended for slot arrays. */
  GRID_SHAPE = RenderShape.GRID

  /** @see `NodeSlotType.INPUT` */
  INPUT = NodeSlotType.INPUT
  /** @see `NodeSlotType.OUTPUT` */
  OUTPUT = NodeSlotType.OUTPUT

  // TODO: -1 can lead to ambiguity in JS; these should be updated to a more explicit constant or Symbol.
  /**
   * Event slot type sentinel for outputs.
   * @see `NodeSlotType`
   */
  EVENT = -1 as const
  /**
   * Action slot type sentinel for inputs.
   * @see `NodeSlotType`
   */
  ACTION = -1 as const

  /** Human-readable node execution mode names. */
  NODE_MODES = ["Always", "On Event", "Never", "On Trigger"]
  /** Title/box colours indexed by node mode when `nodeBoxColouredByMode` is enabled. */
  NODE_MODES_COLORS = ["#666", "#422", "#333", "#224", "#626"]
  /** @see `LGraphEventMode.ALWAYS` */
  ALWAYS = LGraphEventMode.ALWAYS
  /** @see `LGraphEventMode.ON_EVENT` */
  ON_EVENT = LGraphEventMode.ON_EVENT
  /** @see `LGraphEventMode.NEVER` */
  NEVER = LGraphEventMode.NEVER
  /** @see `LGraphEventMode.ON_TRIGGER` */
  ON_TRIGGER = LGraphEventMode.ON_TRIGGER

  /** @see `LinkDirection.UP` */
  UP = LinkDirection.UP
  /** @see `LinkDirection.DOWN` */
  DOWN = LinkDirection.DOWN
  /** @see `LinkDirection.LEFT` */
  LEFT = LinkDirection.LEFT
  /** @see `LinkDirection.RIGHT` */
  RIGHT = LinkDirection.RIGHT
  /** @see `LinkDirection.CENTER` */
  CENTER = LinkDirection.CENTER

  /** Human-readable link render mode names. */
  LINK_RENDER_MODES = ["Straight", "Linear", "Spline"]
  /** @see `LinkRenderType.HIDDEN_LINK` */
  HIDDEN_LINK = LinkRenderType.HIDDEN_LINK
  /** @see `LinkRenderType.STRAIGHT_LINK` */
  STRAIGHT_LINK = LinkRenderType.STRAIGHT_LINK
  /** @see `LinkRenderType.LINEAR_LINK` */
  LINEAR_LINK = LinkRenderType.LINEAR_LINK
  /** @see `LinkRenderType.SPLINE_LINK` */
  SPLINE_LINK = LinkRenderType.SPLINE_LINK

  /** @see `TitleMode.NORMAL_TITLE` */
  NORMAL_TITLE = TitleMode.NORMAL_TITLE
  /** @see `TitleMode.NO_TITLE` */
  NO_TITLE = TitleMode.NO_TITLE
  /** @see `TitleMode.TRANSPARENT_TITLE` */
  TRANSPARENT_TITLE = TitleMode.TRANSPARENT_TITLE
  /** @see `TitleMode.AUTOHIDE_TITLE` */
  AUTOHIDE_TITLE = TitleMode.AUTOHIDE_TITLE

  /** Layout mode string for vertically stacked slot arrays. */
  VERTICAL_LAYOUT = "vertical"

  /** Legacy proxy target for redirected global calls. */
  proxy = null
  /** Base URL/path prefix for node icon images. */
  nodeImagesPath = ""

  /** When `true`, logs node registration and debug information to the console. */
  debug = false
  /** When `true`, `createNode` catches constructor exceptions and returns `null`. */
  catchExceptions = true
  /** When `true`, rethrows errors from `reloadNodes`. */
  throwErrors = true
  /** When `true`, allows nodes such as Formula to evaluate code from untrusted configuration (security risk). */
  allowScripts = false
  /** Map of registered node type path → node class constructor. */
  registeredNodeTypes: Record<string, typeof LGraphNode> = {}
  /** @deprecated Used for dropping files in the canvas. Legacy drag-drop mapping by file extension. */
  nodeTypesByFileExtension: Record<string, { type: string }> = {}
  /** Map of node class name → constructor for legacy lookup. */
  Nodes: Record<string, typeof LGraphNode> = {}
  /** Shared global variables persisted between graph instances. */
  Globals = {}

  /** @deprecated Unused and will be deleted. */
  searchboxExtras: Dictionary<unknown> = {}

  /** When `true`, colours the node box when the node is triggered (execute/action feedback). */
  nodeBoxColouredWhenOn = false
  /** When `true`, node box colour reflects the current node execution mode. */
  nodeBoxColouredByMode = false

  /** When `true`, closes dialogs when the pointer leaves the dialog area. */
  dialogCloseOnMouseLeave = false
  /** Delay in ms before `dialogCloseOnMouseLeave` closes a dialog. */
  dialogCloseOnMouseLeaveDelay = 500

  /** When `true`, Shift+click breaks links from an output slot. */
  shiftClickDoBreakLinkFrom = false
  /** When `true`, click breaks links to an input slot. */
  clickDoBreakLinkTo = false
  /** When `true`, Ctrl+Alt+click breaks links under the pointer. */
  ctrlAltClickDoBreakLink = true
  /** When `true`, dragged links snap to compatible nearby slots (ComfyUI-style). */
  snapsForComfy = true
  /** When `true`, draws a highlight on nodes when a dragged link snaps to them. */
  snapHighlightsNode = true

  /**
   * If `true`, items always snap to the grid - modifier keys are ignored.
   * When `snapToGrid` is falsy, a value of `1` is used.
   * Default: `false`
   */
  alwaysSnapToGrid?: boolean

  /**
   * When set to a positive number, when nodes are moved their positions will
   * be rounded to the nearest multiple of this value.  Half up.
   * Default: `undefined`
   * @todo Not implemented - see `LiteGraph.CANVAS_GRID_SIZE`
   */
  snapToGrid?: number

  /** When `true`, hides the node search box when the pointer leaves it. */
  searchHideOnMouseLeave = true
  /**
   * When `true`, the node search widget filters results by compatible slot type.
   * Requires `autoLoadSlotTypes` or manually populated slot type registries.
   */
  searchFilterEnabled = false
  /** When `true`, opens the full search result list when the search widget opens. */
  searchShowAllOnOpen = true

  /**
   * When `true`, instantiates each registered node class once at registration time
   * to discover and populate slot type metadata automatically.
   */
  autoLoadSlotTypes = false

  /** Maps input slot type → node type paths that expose that type. */
  registeredSlotInTypes: Record<string, { nodes: string[] }> = {}
  /** Maps output slot type → node type paths that expose that type. */
  registeredSlotOutTypes: Record<string, { nodes: string[] }> = {}
  /** Sorted list of known input slot type strings (lowercase). */
  slotTypesIn: string[] = []
  /** Sorted list of known output slot type strings (lowercase). */
  slotTypesOut: string[] = []
  /** Default node type(s) suggested for each input slot type in search/create menus. */
  slotTypesDefaultIn: Record<string, string[]> = {}
  /** Default node type(s) suggested for each output slot type in search/create menus. */
  slotTypesDefaultOut: Record<string, string[]> = {}

  /** When `true`, Alt+drag clones the selected node(s) instead of moving them. */
  altDragDoCloneNodes = false

  /**
   * When `true`, automatically creates event/action slots when connecting triggers.
   * Changes node mode colours when using `onTrigger`.
   */
  doAddTriggersSlots = false

  /** When `true`, allows multiple event outputs to connect from a single event slot. */
  allowMultiOutputForEvents = true

  /** When `true`, middle-click on a slot creates and connects a default node. */
  middleClickSlotAddDefaultNode = false

  /** When `true`, releasing a link on empty canvas opens the node search/create menu. */
  releaseLinkOnEmptyShowsMenu = false

  /** DOM event API to use: `"pointer"` or legacy `"mouse"`. */
  pointerEventsMethod = "pointer"

  /**
   * When `true`, Ctrl+Shift+V paste connects unselected output links to pasted node inputs.
   */
  ctrlShiftVPasteConnectUnselectedOutputs = true

  /** When `true`, new nodes and links use string UUIDs instead of integer IDs. */
  useUuids = false

  /** When `true`, draws a highlight around the bounding box of selected groups. */
  highlightSelectedGroup = true

  /** When `true`, context menus scale up with canvas zoom (never shrink below 1×). */
  contextMenuScaling = false

  /**
   * Debugging flag. Repeats deprecation warnings every time they are reported.
   * May impact performance.
   */
  alwaysRepeatWarnings: boolean = false

  /**
   * Array of callbacks to execute when Litegraph first reports a deprecated API being used.
   * @see alwaysRepeatWarnings By default, will not repeat identical messages.
   */
  onDeprecationWarning: ((message: string, source?: object) => void)[] = [console.warn]

  /**
   * @deprecated Removed; has no effect.
   * If `true`, mouse wheel events will be interpreted as trackpad gestures.
   * Tested on MacBook M4 Pro.
   * @default false
   * @see macGesturesRequireMac
   */
  macTrackpadGestures: boolean = false

  /**
   * @deprecated Removed; has no effect.
   * If both this setting and `macTrackpadGestures` are `true`, trackpad gestures will
   * only be enabled when the browser user agent includes "Mac".
   * @default true
   * @see macTrackpadGestures
   */
  macGesturesRequireMac: boolean = true

  /**
   * Canvas navigation interaction mode.
   * - `"standard"`: left-click selects; pan via middle-click or spacebar+drag.
   * - `"legacy"`: left-click pans (original litegraph behaviour).
   * @default "legacy"
   */
  canvasNavigationMode: "standard" | "legacy" = "legacy"

  /**
   * If `true`, widget labels and values will both be truncated (proportionally to size),
   * until they fit within the widget.
   *
   * Otherwise, the label will be truncated completely before the value is truncated.
   * @default false
   */
  truncateWidgetTextEvenly: boolean = false

  /**
   * If `true`, widget values will be completely truncated when shrinking a widget,
   * before truncating widget labels.  `truncateWidgetTextEvenly` must be `false`.
   * @default false
   */
  truncateWidgetValuesFirst: boolean = false

  /**
   * If `true`, the current viewport scale & offset of the first attached canvas will be included with the graph when exporting.
   * @default true
   */
  saveViewportWithGraph: boolean = true

  /**
   * If `true`, widget values are deserialised using a map of widget names to values instead of a list.
   * This is intended as a temporary setting. It is planned to be made the default and eventually removed.
   * @default false
   */
  namedValuesRestore: boolean = false

  /** @see `LGraph` Legacy constructor reference on the global object. */
  LGraph = LGraph
  /** @see `LLink` Legacy constructor reference on the global object. */
  LLink = LLink
  /** @see `LGraphNode` Legacy constructor reference on the global object. */
  LGraphNode = LGraphNode
  /** @see `LGraphGroup` Legacy constructor reference on the global object. */
  LGraphGroup = LGraphGroup
  /** @see `DragAndScale` Legacy constructor reference on the global object. */
  DragAndScale = DragAndScale
  /** @see `LGraphCanvas` Legacy constructor reference on the global object. */
  LGraphCanvas = LGraphCanvas
  /** @see `ContextMenu` Legacy constructor reference on the global object. */
  ContextMenu = ContextMenu
  /** @see `CurveEditor` Legacy constructor reference on the global object. */
  CurveEditor = CurveEditor
  /** @see `Reroute` Legacy constructor reference on the global object. */
  Reroute = Reroute

  /**
   * Lazily-resolved internal class references exposed for advanced extension.
   *
   * Accessors avoid circular import issues at module load time.
   */
  Classes = {
    get SubgraphSlot() { return SubgraphSlot },
    get SubgraphIONodeBase() { return SubgraphIONodeBase },

    // Rich drawing
    get Rectangle() { return Rectangle },

    // Debug / helpers
    get GraphHistory() { return GraphHistory },
    get InputIndicators() { return InputIndicators },
  }

  /**
   * @see `createUuidv4`
   * @inheritdoc
   */
  uuidv4 = createUuidv4

  /** @see `distance` Re-exported geometry helper. */
  distance = distance

  /** @see `isInsideRectangle` Re-exported hit-test helper (legacy edge semantics). */
  isInsideRectangle = isInsideRectangle

  /** @see `overlapBounding` Re-exported rectangle overlap test. */
  overlapBounding = overlapBounding

  constructor() {
    Object.defineProperty(this, "Classes", { writable: false })
  }

  /** Called after a new node type is registered via `registerNodeType`. */
  onNodeTypeRegistered?(type: string, baseClass: typeof LGraphNode): void
  /** Called when an existing registration is replaced by `registerNodeType`. */
  onNodeTypeReplaced?(type: string, baseClass: typeof LGraphNode, prev: unknown): void

  /**
   * Register a node class so it can be listed when the user wants to create a new one
   * @param type name of the node and path
   * @param baseClass class containing the structure of a node
   */
  registerNodeType(type: string, baseClass: typeof LGraphNode): void {
    if (!baseClass.prototype)
      throw "Cannot register a simple object, it must be a class with a prototype"
    baseClass.type = type

    if (this.debug) console.log("Node registered:", type)

    const classname = baseClass.name

    const pos = type.lastIndexOf("/")
    baseClass.category = type.substring(0, pos)

    baseClass.title ||= classname

    // extend class
    for (const i in LGraphNode.prototype) {
      // @ts-expect-error #576 This functionality is deprecated and should be removed.
      baseClass.prototype[i] ||= LGraphNode.prototype[i]
    }

    const prev = this.registeredNodeTypes[type]
    if (prev && this.debug) {
      console.log("replacing node type:", type)
    }

    this.registeredNodeTypes[type] = baseClass
    if (baseClass.constructor.name) this.Nodes[classname] = baseClass

    this.onNodeTypeRegistered?.(type, baseClass)
    if (prev) this.onNodeTypeReplaced?.(type, baseClass, prev)

    // warnings
    if (baseClass.prototype.onPropertyChange)
      console.warn(`LiteGraph node class ${type} has onPropertyChange method, it must be called onPropertyChanged with d at the end`)

    // TODO one would want to know input and ouput :: this would allow through registerNodeAndSlotType to get all the slots types
    if (this.autoLoadSlotTypes) new baseClass(baseClass.title || "tmpnode")
  }

  /**
   * removes a node type from the system
   * @param type name of the node or the node constructor itself
   */
  unregisterNodeType(type: string | typeof LGraphNode): void {
    const baseClass = typeof type === "string"
      ? this.registeredNodeTypes[type]
      : type
    if (!baseClass) throw `node type not found: ${String(type)}`

    delete this.registeredNodeTypes[String(baseClass.type)]

    const name = baseClass.constructor.name
    if (name) delete this.Nodes[name]
  }

  /**
   * Associates a slot type with a node instance for search/filter registries.
   * @param type Node instance (or legacy string type path) whose slots are being registered.
   * @param slotType Slot type string, wildcard, or event/action sentinel.
   * @param out When `true`, registers an output slot type; otherwise an input slot type.
   */
  registerNodeAndSlotType(
    type: LGraphNode,
    slotType: ISlotType,
    out?: boolean,
  ): void {
    out ||= false
    // @ts-expect-error Confirm this function no longer supports string types - baseClass should always be an instance not a constructor.
    const baseClass = typeof type === "string" && this.registeredNodeTypes[type] !== "anonymous"
      ? this.registeredNodeTypes[type]
      : type

    // @ts-expect-error Confirm this function no longer supports string types - baseClass should always be an instance not a constructor.
    const classType = baseClass.constructor.type

    let allTypes
    if (typeof slotType === "string") {
      allTypes = slotType.split(",")
    } else if (slotType == this.EVENT || slotType == this.ACTION) {
      allTypes = ["_event_"]
    } else {
      allTypes = ["*"]
    }

    for (let slotType of allTypes) {
      if (slotType === "") slotType = "*"

      const register = out
        ? this.registeredSlotOutTypes
        : this.registeredSlotInTypes
      register[slotType] ??= { nodes: [] }

      const { nodes } = register[slotType]
      if (!nodes.includes(classType)) nodes.push(classType)

      // check if is a new type
      const types = out
        ? this.slotTypesOut
        : this.slotTypesIn
      const type = slotType.toLowerCase()

      if (!types.includes(type)) {
        types.push(type)
        types.sort((a, b) => a.localeCompare(b))
      }
    }
  }

  /**
   * Removes all previously registered node's types
   */
  clearRegisteredTypes(): void {
    this.registeredNodeTypes = {}
    this.nodeTypesByFileExtension = {}
    this.Nodes = {}
    this.searchboxExtras = {}
  }

  /**
   * Create a node of a given type with a name. The node is not attached to any graph yet.
   * @param type full name of the node class. p.e. "math/sin"
   * @param title a name to distinguish from other nodes
   * @param options to set options
   */
  createNode(
    type: string,
    title?: string,
    options?: Dictionary<unknown>,
  ): LGraphNode | null {
    const baseClass = this.registeredNodeTypes[type]
    if (!baseClass) {
      if (this.debug) console.log(`GraphNode type "${type}" not registered.`)
      return null
    }

    title = title || baseClass.title || type

    let node

    if (this.catchExceptions) {
      try {
        node = new baseClass(title)
      } catch (error) {
        console.error(error)
        return null
      }
    } else {
      node = new baseClass(title)
    }

    node.type = type

    if (!node.title && title) node.title = title
    node.properties ||= {}
    node.propertiesInfo ||= []
    node.flags ||= {}
    // call onresize?
    node.size ||= node.computeSize()
    node.pos ||= [this.DEFAULT_POSITION[0], this.DEFAULT_POSITION[1]]
    node.mode ||= LGraphEventMode.ALWAYS

    // extra options
    if (options) {
      for (const i in options) {
        // @ts-expect-error #577 Requires interface
        node[i] = options[i]
      }
    }

    // callback
    node.onNodeCreated?.()
    return node
  }

  /**
   * Returns a registered node type with a given name
   * @param type full name of the node class. p.e. "math/sin"
   * @returns the node class
   */
  getNodeType(type: string): typeof LGraphNode {
    return this.registeredNodeTypes[type]
  }

  /**
   * Returns node classes whose registered path is in the given category.
   * @param category Category prefix to match, or `""` for uncategorised nodes.
   * @param filter Optional constructor filter property; nodes with a mismatched filter are excluded.
   * @returns Array of matching node class constructors.
   */
  getNodeTypesInCategory(category: string, filter?: string) {
    const r = []
    for (const i in this.registeredNodeTypes) {
      const type = this.registeredNodeTypes[i]
      if (type.filter != filter) continue

      if (category == "") {
        if (type.category == null) r.push(type)
      } else if (type.category == category) {
        r.push(type)
      }
    }

    return r
  }

  /**
   * Returns a list with all the node type categories
   * @param filter only nodes with ctor.filter equal can be shown
   * @returns array with all the names of the categories
   */
  getNodeTypesCategories(filter?: string): string[] {
    const categories: Dictionary<number> = { "": 1 }
    for (const i in this.registeredNodeTypes) {
      const type = this.registeredNodeTypes[i]
      if (type.category && !type.skipList) {
        if (type.filter != filter) continue

        categories[type.category] = 1
      }
    }
    const result = []
    for (const i in categories) {
      result.push(i)
    }
    return result
  }

  /**
   * Reloads node script files matching a URL wildcard (debug/development utility).
   * @param folderWildcard URL prefix that script `src` attributes must start with.
   */
  reloadNodes(folderWildcard: string): void {
    const tmp = document.getElementsByTagName("script")
    // weird, this array changes by its own, so we use a copy
    const scriptFiles = []
    for (const element of tmp) {
      scriptFiles.push(element)
    }

    const docHeadObj = document.getElementsByTagName("head")[0]
    folderWildcard = document.location.href + folderWildcard

    for (const scriptFile of scriptFiles) {
      const src = scriptFile.src
      if (!src || src.substr(0, folderWildcard.length) != folderWildcard)
        continue

      try {
        if (this.debug) console.log("Reloading:", src)
        const dynamicScript = document.createElement("script")
        dynamicScript.type = "text/javascript"
        dynamicScript.src = src
        docHeadObj.append(dynamicScript)
        scriptFile.remove()
      } catch (error) {
        if (this.throwErrors) throw error
        if (this.debug) console.log("Error while reloading", src)
      }
    }

    if (this.debug) console.log("Nodes reloaded")
  }

  /**
   * Deep-clones a plain object via JSON serialisation.
   * @deprecated Prefer `structuredClone` for modern environments.
   * @param obj Object to clone, or `null`/`undefined`.
   * @param target Optional object to receive cloned properties in place.
   */
  cloneObject<T extends object | undefined | null>(obj: T, target?: T): WhenNullish<T, null> {
    if (obj == null) return null as WhenNullish<T, null>

    const r = JSON.parse(JSON.stringify(obj))
    if (!target) return r

    for (const i in r) {
      // @ts-expect-error deprecated
      target[i] = r[i]
    }
    return target
  }

  /**
   * Returns whether two slot types can be connected (wildcards, events, and comma-lists).
   * @param typeA Output slot type.
   * @param typeB Input slot type.
   * @returns `true` when the types are compatible.
   */
  isValidConnection(typeA: ISlotType, typeB: ISlotType): boolean {
    if (typeA == "" || typeA === "*") typeA = 0
    if (typeB == "" || typeB === "*") typeB = 0
    // If generic in/output, matching types (valid for triggers), or event/action types
    if (
      !typeA ||
      !typeB ||
      typeA == typeB ||
      (typeA == this.EVENT && typeB == this.ACTION)
    ) {
      return true
    }

    // Enforce string type to handle toLowerCase call (-1 number not ok)
    typeA = String(typeA)
    typeB = String(typeB)
    typeA = typeA.toLowerCase()
    typeB = typeB.toLowerCase()

    // For nodes supporting multiple connection types
    if (!typeA.includes(",") && !typeB.includes(","))
      return typeA == typeB

    // Check all permutations to see if one is valid
    const supportedTypesA = typeA.split(",")
    const supportedTypesB = typeB.split(",")
    for (const a of supportedTypesA) {
      for (const b of supportedTypesB) {
        if (this.isValidConnection(a, b))
          return true
      }
    }

    return false
  }

  /**
   * Extracts parameter names from a function's source string.
   *
   * Strips comments and default values; used when wrapping functions as graph nodes.
   * @param func Function whose parameter list should be parsed.
   * @returns Array of parameter name strings.
   */
  getParameterNames(func: (...args: any) => any): string[] {
    return String(func)
      .replaceAll(/\/\/.*$/gm, "") // strip single-line comments
      .replaceAll(/\s+/g, "") // strip white space
      .replaceAll(/\/\*[^*/]*\*\//g, "") // strip multi-line comments  /**/
      .split("){", 1)[0]
      .replace(/^[^(]*\(/, "") // extract the parameters
      .replaceAll(/=[^,]+/g, "") // strip any ES6 defaults
      .split(",")
      .filter(Boolean) // split & filter [""]
  }

  /**
   * Registers a DOM event listener using `pointerEventsMethod` (`pointer` or `mouse`).
   *
   * Falls back to touch events when PointerEvent is unavailable. Used by
   * `LGraphCanvas`, `DragAndScale`, and `ContextMenu`.
   * @param oDOM Target DOM node.
   * @param sEvIn Event suffix (`down`, `move`, `up`, etc.).
   * @param fCall Event handler.
   * @param capture Whether to listen in the capture phase.
   */
  pointerListenerAdd(oDOM: Node, sEvIn: string, fCall: (e: Event) => boolean | void, capture = false): void {
    if (!oDOM || !oDOM.addEventListener || !sEvIn || typeof fCall !== "function") return

    let sMethod = this.pointerEventsMethod
    let sEvent = sEvIn

    // UNDER CONSTRUCTION
    // convert pointerevents to touch event when not available
    if (sMethod == "pointer" && !window.PointerEvent) {
      console.warn("sMethod=='pointer' && !window.PointerEvent")
      console.log(`Converting pointer[${sEvent}] : down move up cancel enter TO touchstart touchmove touchend, etc ..`)
      switch (sEvent) {
        case "down": {
          sMethod = "touch"
          sEvent = "start"
          break
        }
        case "move": {
          sMethod = "touch"
          // sEvent = "move";
          break
        }
        case "up": {
          sMethod = "touch"
          sEvent = "end"
          break
        }
        case "cancel": {
          sMethod = "touch"
          // sEvent = "cancel";
          break
        }
        case "enter": {
          console.log("debug: Should I send a move event?") // ???
          break
        }
        // case "over": case "out": not used at now
        default: {
          console.warn(`PointerEvent not available in this browser ? The event ${sEvent} would not be called`)
        }
      }
    }

    switch (sEvent) {
    // @ts-expect-error
    // both pointer and move events
      case "down": case "up": case "move": case "over": case "out": case "enter":
      {
        oDOM.addEventListener(sMethod + sEvent, fCall, capture)
      }
      // @ts-expect-error
      // only pointerevents
      case "leave": case "cancel": case "gotpointercapture": case "lostpointercapture":
      {
        if (sMethod != "mouse") {
          return oDOM.addEventListener(sMethod + sEvent, fCall, capture)
        }
      }
      // not "pointer" || "mouse"
      default:
        return oDOM.addEventListener(sEvent, fCall, capture)
    }
  }

  /**
   * Removes a listener previously added by `pointerListenerAdd`.
   * @param oDOM Target DOM node.
   * @param sEvent Event suffix (`down`, `move`, `up`, etc.).
   * @param fCall Handler to remove.
   * @param capture Whether the listener was registered in the capture phase.
   */
  pointerListenerRemove(oDOM: Node, sEvent: string, fCall: (e: Event) => boolean | void, capture = false): void {
    if (!oDOM || !oDOM.removeEventListener || !sEvent || typeof fCall !== "function") return

    switch (sEvent) {
    // @ts-expect-error
    // both pointer and move events
      case "down": case "up": case "move": case "over": case "out": case "enter":
      {
        if (this.pointerEventsMethod == "pointer" || this.pointerEventsMethod == "mouse") {
          oDOM.removeEventListener(this.pointerEventsMethod + sEvent, fCall, capture)
        }
      }
      // @ts-expect-error
      // only pointerevents
      case "leave": case "cancel": case "gotpointercapture": case "lostpointercapture":
      {
        if (this.pointerEventsMethod == "pointer") {
          return oDOM.removeEventListener(this.pointerEventsMethod + sEvent, fCall, capture)
        }
      }
      // not "pointer" || "mouse"
      default:
        return oDOM.removeEventListener(sEvent, fCall, capture)
    }
  }

  /** @returns High-resolution timestamp from `performance.now`. */
  getTime(): number {
    return performance.now()
  }

  /**
   * Converts normalised RGBA components `[0–1]` to a CSS `rgba(...)` string.
   * @param c Colour as `[r, g, b]` or `[r, g, b, a]` with components in `0–1`.
   */
  colorToString(c: [number, number, number, number]): string {
    return (
      `rgba(${
        Math.round(c[0] * 255).toFixed()
      },${
        Math.round(c[1] * 255).toFixed()
      },${
        Math.round(c[2] * 255).toFixed()
      },${
        c.length == 4 ? c[3].toFixed(2) : "1.0"
      })`
    )
  }

  /**
   * Expands an axis-aligned bounding box `[minX, minY, maxX, maxY]` to include `(x, y)`.
   * @param bounding Bounding box mutated in place.
   * @param x X coordinate to include.
   * @param y Y coordinate to include.
   */
  growBounding(bounding: Rect, x: number, y: number): void {
    if (x < bounding[0]) {
      bounding[0] = x
    } else if (x > bounding[2]) {
      bounding[2] = x
    }

    if (y < bounding[1]) {
      bounding[1] = y
    } else if (y > bounding[3]) {
      bounding[3] = y
    }
  }

  /**
   * Tests whether point `p` lies inside an axis-aligned bounding box pair `bb`.
   * @param p Point as `[x, y]`.
   * @param bb Bounding box as `[[minX, minY], [maxX, maxY]]`.
   */
  isInsideBounding(p: number[], bb: number[][]): boolean {
    if (
      p[0] < bb[0][0] ||
      p[1] < bb[0][1] ||
      p[0] > bb[1][0] ||
      p[1] > bb[1][1]
    ) {
      return false
    }
    return true
  }

  /**
   * Parses a CSS hex colour into `[r, g, b]` byte components.
   * @param hex Hex string with or without leading `#`.
   */
  hex2num(hex: string): number[] {
    if (hex.charAt(0) == "#") {
      hex = hex.slice(1)
    // Remove the '#' char - if there is one.
    }
    hex = hex.toUpperCase()
    const hexAlphabets = "0123456789ABCDEF"
    const value = new Array(3)
    let k = 0
    let int1, int2
    for (let i = 0; i < 6; i += 2) {
      int1 = hexAlphabets.indexOf(hex.charAt(i))
      int2 = hexAlphabets.indexOf(hex.charAt(i + 1))
      value[k] = int1 * 16 + int2
      k++
    }
    return value
  }

  /**
   * Converts `[r, g, b]` byte components to a CSS `#RRGGBB` hex string.
   * @param triplet RGB components in `0–255`.
   */
  num2hex(triplet: number[]): string {
    const hexAlphabets = "0123456789ABCDEF"
    let hex = "#"
    let int1, int2
    for (let i = 0; i < 3; i++) {
      int1 = triplet[i] / 16
      int2 = triplet[i] % 16

      hex += hexAlphabets.charAt(int1) + hexAlphabets.charAt(int2)
    }
    return hex
  }

  /**
   * Closes all open `.litecontextmenu` elements in the given window.
   * @param refWindow Window whose document should be searched. Default: global `window`.
   */
  closeAllContextMenus(refWindow: Window = window): void {
    const elements = [...refWindow.document.querySelectorAll(":scope .litecontextmenu")]
    if (!elements.length) return

    for (const element of elements) {
      if ("close" in element && typeof element.close === "function") {
        element.close()
      } else {
        element.remove()
      }
    }
  }

  /**
   * Copies enumerable properties and prototype members from `origin` onto `target`.
   *
   * Legacy helper used when extending litegraph classes at runtime.
   * @param target Class or object to extend.
   * @param origin Source class or object.
   */
  extendClass(target: any, origin: any): void {
    for (const i in origin) {
      // copy class properties
      if (target.hasOwnProperty(i)) continue
      target[i] = origin[i]
    }

    if (origin.prototype) {
      // copy prototype properties
      for (const i in origin.prototype) {
        // only enumerable
        if (!origin.prototype.hasOwnProperty(i)) continue

        // avoid overwriting existing ones
        if (target.prototype.hasOwnProperty(i)) continue

        // copy getters
        if (origin.prototype.__lookupGetter__(i)) {
          target.prototype.__defineGetter__(
            i,
            origin.prototype.__lookupGetter__(i),
          )
        } else {
          target.prototype[i] = origin.prototype[i]
        }

        // and setters
        if (origin.prototype.__lookupSetter__(i)) {
          target.prototype.__defineSetter__(
            i,
            origin.prototype.__lookupSetter__(i),
          )
        }
      }
    }
  }
}
