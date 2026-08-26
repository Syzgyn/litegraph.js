import type { Dictionary, ISlotType, Rect, WhenNullish } from "./interfaces"

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
 * A single instance is exported as {@link LiteGraph} from the package entry point.
 * Register node classes with {@link registerNodeType}, create nodes with {@link createNode},
 * and read/write editor-wide defaults (colours, grid size, interaction flags) on this object.
 * @see {@link LiteGraph}
 */
export class LiteGraphGlobal {
  /** @see {@link SlotShape} Re-exported for legacy global access. */
  SlotShape = SlotShape
  /** @see {@link SlotDirection} Re-exported for legacy global access. */
  SlotDirection = SlotDirection
  /** @see {@link SlotType} Re-exported for legacy global access. */
  SlotType = SlotType
  /** @see {@link LabelPosition} Re-exported for legacy global access. */
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
  /** Valid {@link RenderShape} name strings for node configuration. */
  VALID_SHAPES = ["default", "box", "round", "card"] satisfies ("default" | Lowercase<keyof typeof RenderShape>)[]
  /** Corner radius for {@link RenderShape.ROUND} nodes. */
  ROUND_RADIUS = 8

  /** @see {@link RenderShape.BOX} */
  BOX_SHAPE = RenderShape.BOX
  /** @see {@link RenderShape.ROUND} */
  ROUND_SHAPE = RenderShape.ROUND
  /** @see {@link RenderShape.CIRCLE} */
  CIRCLE_SHAPE = RenderShape.CIRCLE
  /** @see {@link RenderShape.CARD} */
  CARD_SHAPE = RenderShape.CARD
  /** @see {@link RenderShape.ARROW} */
  ARROW_SHAPE = RenderShape.ARROW
  /** @see {@link RenderShape.GRID} Intended for slot arrays. */
  GRID_SHAPE = RenderShape.GRID

  /** @see {@link NodeSlotType.INPUT} */
  INPUT = NodeSlotType.INPUT
  /** @see {@link NodeSlotType.OUTPUT} */
  OUTPUT = NodeSlotType.OUTPUT

  // TODO: -1 can lead to ambiguity in JS; these should be updated to a more explicit constant or Symbol.
  /**
   * Event slot type sentinel for outputs.
   * @see {@link NodeSlotType}
   */
  EVENT = -1 as const
  /**
   * Action slot type sentinel for inputs.
   * @see {@link NodeSlotType}
   */
  ACTION = -1 as const

  /** Human-readable node execution mode names. */
  NODE_MODES = ["Always", "On Event", "Never", "On Trigger"]
  /** Title/box colours indexed by node mode when {@link node_box_coloured_by_mode} is enabled. */
  NODE_MODES_COLORS = ["#666", "#422", "#333", "#224", "#626"]
  /** @see {@link LGraphEventMode.ALWAYS} */
  ALWAYS = LGraphEventMode.ALWAYS
  /** @see {@link LGraphEventMode.ON_EVENT} */
  ON_EVENT = LGraphEventMode.ON_EVENT
  /** @see {@link LGraphEventMode.NEVER} */
  NEVER = LGraphEventMode.NEVER
  /** @see {@link LGraphEventMode.ON_TRIGGER} */
  ON_TRIGGER = LGraphEventMode.ON_TRIGGER

  /** @see {@link LinkDirection.UP} */
  UP = LinkDirection.UP
  /** @see {@link LinkDirection.DOWN} */
  DOWN = LinkDirection.DOWN
  /** @see {@link LinkDirection.LEFT} */
  LEFT = LinkDirection.LEFT
  /** @see {@link LinkDirection.RIGHT} */
  RIGHT = LinkDirection.RIGHT
  /** @see {@link LinkDirection.CENTER} */
  CENTER = LinkDirection.CENTER

  /** Human-readable link render mode names. */
  LINK_RENDER_MODES = ["Straight", "Linear", "Spline"]
  /** @see {@link LinkRenderType.HIDDEN_LINK} */
  HIDDEN_LINK = LinkRenderType.HIDDEN_LINK
  /** @see {@link LinkRenderType.STRAIGHT_LINK} */
  STRAIGHT_LINK = LinkRenderType.STRAIGHT_LINK
  /** @see {@link LinkRenderType.LINEAR_LINK} */
  LINEAR_LINK = LinkRenderType.LINEAR_LINK
  /** @see {@link LinkRenderType.SPLINE_LINK} */
  SPLINE_LINK = LinkRenderType.SPLINE_LINK

  /** @see {@link TitleMode.NORMAL_TITLE} */
  NORMAL_TITLE = TitleMode.NORMAL_TITLE
  /** @see {@link TitleMode.NO_TITLE} */
  NO_TITLE = TitleMode.NO_TITLE
  /** @see {@link TitleMode.TRANSPARENT_TITLE} */
  TRANSPARENT_TITLE = TitleMode.TRANSPARENT_TITLE
  /** @see {@link TitleMode.AUTOHIDE_TITLE} */
  AUTOHIDE_TITLE = TitleMode.AUTOHIDE_TITLE

  /** Layout mode string for vertically stacked slot arrays. */
  VERTICAL_LAYOUT = "vertical"

  /** Legacy proxy target for redirected global calls. */
  proxy = null
  /** Base URL/path prefix for node icon images. */
  node_images_path = ""

  /** When `true`, logs node registration and debug information to the console. */
  debug = false
  /** When `true`, {@link createNode} catches constructor exceptions and returns `null`. */
  catch_exceptions = true
  /** When `true`, rethrows errors from {@link reloadNodes}. */
  throw_errors = true
  /** When `true`, allows nodes such as Formula to evaluate code from untrusted configuration (security risk). */
  allow_scripts = false
  /** Map of registered node type path → node class constructor. */
  registered_node_types: Record<string, typeof LGraphNode> = {}
  /** @deprecated Used for dropping files in the canvas. Legacy drag-drop mapping by file extension. */
  node_types_by_file_extension: Record<string, { type: string }> = {}
  /** Map of node class name → constructor for legacy lookup. */
  Nodes: Record<string, typeof LGraphNode> = {}
  /** Shared global variables persisted between graph instances. */
  Globals = {}

  /** @deprecated Unused and will be deleted. */
  searchbox_extras: Dictionary<unknown> = {}

  /** When `true`, colours the node box when the node is triggered (execute/action feedback). */
  node_box_coloured_when_on = false
  /** When `true`, node box colour reflects the current node execution mode. */
  node_box_coloured_by_mode = false

  /** When `true`, closes dialogs when the pointer leaves the dialog area. */
  dialog_close_on_mouse_leave = false
  /** Delay in ms before {@link dialog_close_on_mouse_leave} closes a dialog. */
  dialog_close_on_mouse_leave_delay = 500

  /** When `true`, Shift+click breaks links from an output slot. */
  shift_click_do_break_link_from = false
  /** When `true`, click breaks links to an input slot. */
  click_do_break_link_to = false
  /** When `true`, Ctrl+Alt+click breaks links under the pointer. */
  ctrl_alt_click_do_break_link = true
  /** When `true`, dragged links snap to compatible nearby slots (ComfyUI-style). */
  snaps_for_comfy = true
  /** When `true`, draws a highlight on nodes when a dragged link snaps to them. */
  snap_highlights_node = true

  /**
   * If `true`, items always snap to the grid - modifier keys are ignored.
   * When {@link snapToGrid} is falsy, a value of `1` is used.
   * Default: `false`
   */
  alwaysSnapToGrid?: boolean

  /**
   * When set to a positive number, when nodes are moved their positions will
   * be rounded to the nearest multiple of this value.  Half up.
   * Default: `undefined`
   * @todo Not implemented - see {@link LiteGraph.CANVAS_GRID_SIZE}
   */
  snapToGrid?: number

  /** When `true`, hides the node search box when the pointer leaves it. */
  search_hide_on_mouse_leave = true
  /**
   * When `true`, the node search widget filters results by compatible slot type.
   * Requires {@link auto_load_slot_types} or manually populated slot type registries.
   */
  search_filter_enabled = false
  /** When `true`, opens the full search result list when the search widget opens. */
  search_show_all_on_open = true

  /**
   * When `true`, instantiates each registered node class once at registration time
   * to discover and populate slot type metadata automatically.
   */
  auto_load_slot_types = false

  /** Maps input slot type → node type paths that expose that type. */
  registered_slot_in_types: Record<string, { nodes: string[] }> = {}
  /** Maps output slot type → node type paths that expose that type. */
  registered_slot_out_types: Record<string, { nodes: string[] }> = {}
  /** Sorted list of known input slot type strings (lowercase). */
  slot_types_in: string[] = []
  /** Sorted list of known output slot type strings (lowercase). */
  slot_types_out: string[] = []
  /** Default node type(s) suggested for each input slot type in search/create menus. */
  slot_types_default_in: Record<string, string[]> = {}
  /** Default node type(s) suggested for each output slot type in search/create menus. */
  slot_types_default_out: Record<string, string[]> = {}

  /** When `true`, Alt+drag clones the selected node(s) instead of moving them. */
  alt_drag_do_clone_nodes = false

  /**
   * When `true`, automatically creates event/action slots when connecting triggers.
   * Changes node mode colours when using `onTrigger`.
   */
  do_add_triggers_slots = false

  /** When `true`, allows multiple event outputs to connect from a single event slot. */
  allow_multi_output_for_events = true

  /** When `true`, middle-click on a slot creates and connects a default node. */
  middle_click_slot_add_default_node = false

  /** When `true`, releasing a link on empty canvas opens the node search/create menu. */
  release_link_on_empty_shows_menu = false

  /** DOM event API to use: `"pointer"` or legacy `"mouse"`. */
  pointerevents_method = "pointer"

  /**
   * When `true`, Ctrl+Shift+V paste connects unselected output links to pasted node inputs.
   */
  ctrl_shift_v_paste_connect_unselected_outputs = true

  /** When `true`, new nodes and links use string UUIDs instead of integer IDs. */
  use_uuids = false

  /** When `true`, draws a highlight around the bounding box of selected groups. */
  highlight_selected_group = true

  /** When `true`, context menus scale up with canvas zoom (never shrink below 1×). */
  context_menu_scaling = false

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
   * If both this setting and {@link macTrackpadGestures} are `true`, trackpad gestures will
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
   * before truncating widget labels.  {@link truncateWidgetTextEvenly} must be `false`.
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

  /** @see {@link LGraph} Legacy constructor reference on the global object. */
  LGraph = LGraph
  /** @see {@link LLink} Legacy constructor reference on the global object. */
  LLink = LLink
  /** @see {@link LGraphNode} Legacy constructor reference on the global object. */
  LGraphNode = LGraphNode
  /** @see {@link LGraphGroup} Legacy constructor reference on the global object. */
  LGraphGroup = LGraphGroup
  /** @see {@link DragAndScale} Legacy constructor reference on the global object. */
  DragAndScale = DragAndScale
  /** @see {@link LGraphCanvas} Legacy constructor reference on the global object. */
  LGraphCanvas = LGraphCanvas
  /** @see {@link ContextMenu} Legacy constructor reference on the global object. */
  ContextMenu = ContextMenu
  /** @see {@link CurveEditor} Legacy constructor reference on the global object. */
  CurveEditor = CurveEditor
  /** @see {@link Reroute} Legacy constructor reference on the global object. */
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
    get InputIndicators() { return InputIndicators },
  }

  /**
   * @see {@link createUuidv4}
   * @inheritdoc
   */
  uuidv4 = createUuidv4

  /** @see {@link distance} Re-exported geometry helper. */
  distance = distance

  /** @see {@link isInsideRectangle} Re-exported hit-test helper (legacy edge semantics). */
  isInsideRectangle = isInsideRectangle

  /** @see {@link overlapBounding} Re-exported rectangle overlap test. */
  overlapBounding = overlapBounding

  constructor() {
    Object.defineProperty(this, "Classes", { writable: false })
  }

  /** Called after a new node type is registered via {@link registerNodeType}. */
  onNodeTypeRegistered?(type: string, base_class: typeof LGraphNode): void
  /** Called when an existing registration is replaced by {@link registerNodeType}. */
  onNodeTypeReplaced?(type: string, base_class: typeof LGraphNode, prev: unknown): void

  /**
   * Register a node class so it can be listed when the user wants to create a new one
   * @param type name of the node and path
   * @param base_class class containing the structure of a node
   */
  registerNodeType(type: string, base_class: typeof LGraphNode): void {
    if (!base_class.prototype)
      throw "Cannot register a simple object, it must be a class with a prototype"
    base_class.type = type

    if (this.debug) console.log("Node registered:", type)

    const classname = base_class.name

    const pos = type.lastIndexOf("/")
    base_class.category = type.substring(0, pos)

    base_class.title ||= classname

    // extend class
    for (const i in LGraphNode.prototype) {
      // @ts-expect-error #576 This functionality is deprecated and should be removed.
      base_class.prototype[i] ||= LGraphNode.prototype[i]
    }

    const prev = this.registered_node_types[type]
    if (prev && this.debug) {
      console.log("replacing node type:", type)
    }

    this.registered_node_types[type] = base_class
    if (base_class.constructor.name) this.Nodes[classname] = base_class

    this.onNodeTypeRegistered?.(type, base_class)
    if (prev) this.onNodeTypeReplaced?.(type, base_class, prev)

    // warnings
    if (base_class.prototype.onPropertyChange)
      console.warn(`LiteGraph node class ${type} has onPropertyChange method, it must be called onPropertyChanged with d at the end`)

    // TODO one would want to know input and ouput :: this would allow through registerNodeAndSlotType to get all the slots types
    if (this.auto_load_slot_types) new base_class(base_class.title || "tmpnode")
  }

  /**
   * removes a node type from the system
   * @param type name of the node or the node constructor itself
   */
  unregisterNodeType(type: string | typeof LGraphNode): void {
    const base_class = typeof type === "string"
      ? this.registered_node_types[type]
      : type
    if (!base_class) throw `node type not found: ${String(type)}`

    delete this.registered_node_types[String(base_class.type)]

    const name = base_class.constructor.name
    if (name) delete this.Nodes[name]
  }

  /**
   * Associates a slot type with a node instance for search/filter registries.
   * @param type Node instance (or legacy string type path) whose slots are being registered.
   * @param slot_type Slot type string, wildcard, or event/action sentinel.
   * @param out When `true`, registers an output slot type; otherwise an input slot type.
   */
  registerNodeAndSlotType(
    type: LGraphNode,
    slot_type: ISlotType,
    out?: boolean,
  ): void {
    out ||= false
    // @ts-expect-error Confirm this function no longer supports string types - base_class should always be an instance not a constructor.
    const base_class = typeof type === "string" && this.registered_node_types[type] !== "anonymous"
      ? this.registered_node_types[type]
      : type

    // @ts-expect-error Confirm this function no longer supports string types - base_class should always be an instance not a constructor.
    const class_type = base_class.constructor.type

    let allTypes
    if (typeof slot_type === "string") {
      allTypes = slot_type.split(",")
    } else if (slot_type == this.EVENT || slot_type == this.ACTION) {
      allTypes = ["_event_"]
    } else {
      allTypes = ["*"]
    }

    for (let slotType of allTypes) {
      if (slotType === "") slotType = "*"

      const register = out
        ? this.registered_slot_out_types
        : this.registered_slot_in_types
      register[slotType] ??= { nodes: [] }

      const { nodes } = register[slotType]
      if (!nodes.includes(class_type)) nodes.push(class_type)

      // check if is a new type
      const types = out
        ? this.slot_types_out
        : this.slot_types_in
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
    this.registered_node_types = {}
    this.node_types_by_file_extension = {}
    this.Nodes = {}
    this.searchbox_extras = {}
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
    const base_class = this.registered_node_types[type]
    if (!base_class) {
      if (this.debug) console.log(`GraphNode type "${type}" not registered.`)
      return null
    }

    title = title || base_class.title || type

    let node

    if (this.catch_exceptions) {
      try {
        node = new base_class(title)
      } catch (error) {
        console.error(error)
        return null
      }
    } else {
      node = new base_class(title)
    }

    node.type = type

    if (!node.title && title) node.title = title
    node.properties ||= {}
    node.properties_info ||= []
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
    return this.registered_node_types[type]
  }

  /**
   * Returns node classes whose registered path is in the given category.
   * @param category Category prefix to match, or `""` for uncategorised nodes.
   * @param filter Optional constructor filter property; nodes with a mismatched filter are excluded.
   * @returns Array of matching node class constructors.
   */
  getNodeTypesInCategory(category: string, filter?: string) {
    const r = []
    for (const i in this.registered_node_types) {
      const type = this.registered_node_types[i]
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
    for (const i in this.registered_node_types) {
      const type = this.registered_node_types[i]
      if (type.category && !type.skip_list) {
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
   * @param folder_wildcard URL prefix that script `src` attributes must start with.
   */
  reloadNodes(folder_wildcard: string): void {
    const tmp = document.getElementsByTagName("script")
    // weird, this array changes by its own, so we use a copy
    const script_files = []
    for (const element of tmp) {
      script_files.push(element)
    }

    const docHeadObj = document.getElementsByTagName("head")[0]
    folder_wildcard = document.location.href + folder_wildcard

    for (const script_file of script_files) {
      const src = script_file.src
      if (!src || src.substr(0, folder_wildcard.length) != folder_wildcard)
        continue

      try {
        if (this.debug) console.log("Reloading:", src)
        const dynamicScript = document.createElement("script")
        dynamicScript.type = "text/javascript"
        dynamicScript.src = src
        docHeadObj.append(dynamicScript)
        script_file.remove()
      } catch (error) {
        if (this.throw_errors) throw error
        if (this.debug) console.log("Error while reloading", src)
      }
    }

    if (this.debug) console.log("Nodes reloaded")
  }

  /**
   * Deep-clones a plain object via JSON serialisation.
   * @deprecated Prefer {@link structuredClone} for modern environments.
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
   * @param type_a Output slot type.
   * @param type_b Input slot type.
   * @returns `true` when the types are compatible.
   */
  isValidConnection(type_a: ISlotType, type_b: ISlotType): boolean {
    if (type_a == "" || type_a === "*") type_a = 0
    if (type_b == "" || type_b === "*") type_b = 0
    // If generic in/output, matching types (valid for triggers), or event/action types
    if (
      !type_a ||
      !type_b ||
      type_a == type_b ||
      (type_a == this.EVENT && type_b == this.ACTION)
    ) {
      return true
    }

    // Enforce string type to handle toLowerCase call (-1 number not ok)
    type_a = String(type_a)
    type_b = String(type_b)
    type_a = type_a.toLowerCase()
    type_b = type_b.toLowerCase()

    // For nodes supporting multiple connection types
    if (!type_a.includes(",") && !type_b.includes(","))
      return type_a == type_b

    // Check all permutations to see if one is valid
    const supported_types_a = type_a.split(",")
    const supported_types_b = type_b.split(",")
    for (const a of supported_types_a) {
      for (const b of supported_types_b) {
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
   * Registers a DOM event listener using {@link pointerevents_method} (`pointer` or `mouse`).
   *
   * Falls back to touch events when PointerEvent is unavailable. Used by
   * {@link LGraphCanvas}, {@link DragAndScale}, and {@link ContextMenu}.
   * @param oDOM Target DOM node.
   * @param sEvIn Event suffix (`down`, `move`, `up`, etc.).
   * @param fCall Event handler.
   * @param capture Whether to listen in the capture phase.
   */
  pointerListenerAdd(oDOM: Node, sEvIn: string, fCall: (e: Event) => boolean | void, capture = false): void {
    if (!oDOM || !oDOM.addEventListener || !sEvIn || typeof fCall !== "function") return

    let sMethod = this.pointerevents_method
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
   * Removes a listener previously added by {@link pointerListenerAdd}.
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
        if (this.pointerevents_method == "pointer" || this.pointerevents_method == "mouse") {
          oDOM.removeEventListener(this.pointerevents_method + sEvent, fCall, capture)
        }
      }
      // @ts-expect-error
      // only pointerevents
      case "leave": case "cancel": case "gotpointercapture": case "lostpointercapture":
      {
        if (this.pointerevents_method == "pointer") {
          return oDOM.removeEventListener(this.pointerevents_method + sEvent, fCall, capture)
        }
      }
      // not "pointer" || "mouse"
      default:
        return oDOM.removeEventListener(sEvent, fCall, capture)
    }
  }

  /** @returns High-resolution timestamp from {@link performance.now}. */
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
    const hex_alphabets = "0123456789ABCDEF"
    const value = new Array(3)
    let k = 0
    let int1, int2
    for (let i = 0; i < 6; i += 2) {
      int1 = hex_alphabets.indexOf(hex.charAt(i))
      int2 = hex_alphabets.indexOf(hex.charAt(i + 1))
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
    const hex_alphabets = "0123456789ABCDEF"
    let hex = "#"
    let int1, int2
    for (let i = 0; i < 3; i++) {
      int1 = triplet[i] / 16
      int2 = triplet[i] % 16

      hex += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2)
    }
    return hex
  }

  /**
   * Closes all open `.litecontextmenu` elements in the given window.
   * @param ref_window Window whose document should be searched. Default: global `window`.
   */
  closeAllContextMenus(ref_window: Window = window): void {
    const elements = [...ref_window.document.querySelectorAll(":scope .litecontextmenu")]
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
   * Copies enumerable properties and prototype members from {@link origin} onto {@link target}.
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
