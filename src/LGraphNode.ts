import type { DragAndScale } from "./DragAndScale"
import type { IDrawBoundingOptions } from "./draw"
import type { ReadOnlyRectangle } from "./infrastructure/Rectangle"
import type {
  ColorOption,
  CompassCorners,
  DefaultConnectionColors,
  Dictionary,
  IColorable,
  IContextMenuValue,
  IFoundSlot,
  INodeFlags,
  INodeInputSlot,
  INodeOutputSlot,
  INodeSlot,
  INodeSlotContextItem,
  IPinnable,
  ISlotType,
  Panel,
  Point,
  Positionable,
  ReadOnlyPoint,
  ReadOnlyRect,
  Rect,
  Size,
} from "./interfaces"
import type { LGraph } from "./LGraph"
import type { Reroute, RerouteId } from "./Reroute"
import type { SubgraphInputNode } from "./subgraph/SubgraphInputNode"
import type { SubgraphOutputNode } from "./subgraph/SubgraphOutputNode"
import type { CanvasPointerEvent } from "./types/events"
import type { NodeLike } from "./types/NodeLike"
import type { ISerialisedNode, SubgraphIO } from "./types/serialisation"
import type { IBaseWidget, IWidgetOptions, TWidgetType, TWidgetValue, WidgetOptionsFor } from "./types/widgets"

import { SUBGRAPH_OUTPUT_ID } from "@/constants"

import { getNodeInputOnPos, getNodeOutputOnPos } from "./canvas/measureSlots"
import { NullGraphError } from "./infrastructure/NullGraphError"
import { Rectangle } from "./infrastructure/Rectangle"
import { BadgePosition, LGraphBadge } from "./LGraphBadge"
import { LGraphButton, type LGraphButtonOptions } from "./LGraphButton"
import { LGraphCanvas } from "./LGraphCanvas"
import { type LGraphNodeConstructor, LiteGraph, Subgraph, type SubgraphNode } from "./litegraph"
import { LLink } from "./LLink"
import { createBounds, isInRect, isInRectangle, isPointInRect, snapPoint } from "./measure"
import { NodeInputSlot } from "./node/NodeInputSlot"
import { NodeOutputSlot } from "./node/NodeOutputSlot"
import { inputAsSerialisable, isINodeInputSlot, isWidgetInputSlot, outputAsSerialisable } from "./node/slotUtils"
import {
  LGraphEventMode,
  NodeSlotType,
  RenderShape,
  TitleMode,
} from "./types/globalEnums"
import { findFreeSlotOfType } from "./utils/collections"
import { warnDeprecated } from "./utils/feedback"
import { distributeSpace } from "./utils/spaceDistribution"
import { cachedMeasureText } from "./utils/textMeasureCache"
import { truncateText } from "./utils/textUtils"
import { commonType, toClass } from "./utils/type"
import { clampWidgetValue, syncWidgetLabelsFromInputs } from "./utils/widget"
import { BaseWidget } from "./widgets/BaseWidget"
import { toConcreteWidget, type WidgetTypeMap } from "./widgets/widgetMap"

/** Gap below each widget row in `#arrangeWidgets`. Matches `computeSize` per-widget `+ 4`. */
const WIDGET_ARRANGE_GAP = 4
/** Bottom padding below the last widget. Matches `computeSize` `widgetsHeight += 8`. */
const WIDGET_ARRANGE_BOTTOM_MARGIN = 8

// #region Types

/** Unique identifier for a node within a graph. Numeric or UUID string depending on `LiteGraph.useUuids`. */
export type NodeId = number | string

/** Value type for `LGraphNode.properties` entries. */
export type NodeProperty = string | number | boolean | object

/** Schema describing a custom node property shown in the properties panel. */
export interface INodePropertyInfo {
  /** Property key shown in the panel. */
  name?: string
  /** Optional type hint (`"number"`, `"enum"`, etc.). */
  type?: string
  /** Initial value when the property is first created. */
  defaultValue?: NodeProperty
  /** Widget type to use for the property. */
  widget?: string
  /** Label to display for the property. */
  label?: string
  /** Precision when displaying number properties. */
  precision?: number
  /** Selectable values to use for combo widgets. */
  values?: TWidgetValue[]
}

/** Transient hit-test state populated by `LGraphCanvas` during pointer moves. */
export interface IMouseOverData {
  /** Index of the input slot under the pointer, if any. */
  inputId?: number
  /** Index of the output slot under the pointer, if any. */
  outputId?: number
  /** Widget currently hovered, if any. */
  overWidget?: IBaseWidget
}

/** Options controlling type-based auto-connection in `connectByType` and related helpers. */
export interface ConnectByTypeOptions {
  /** @deprecated Events */
  createEventInCase?: boolean
  /** Allow our wildcard slot to connect to typed slots on remote node. Default: true */
  wildcardToTyped?: boolean
  /** Allow our typed slot to connect to wildcard slots on remote node. Default: true */
  typedToWildcard?: boolean
  /** The `Reroute.id` that the connection is being dragged from. */
  afterRerouteId?: RerouteId
}

/**
 * Internal helper type for slot link fields shared by inputs and outputs.
 * @internal Used for type-safe free-slot searches.
 */
export interface IGenericLinkOrLinks {
  links?: INodeOutputSlot["links"]
  link?: INodeInputSlot["link"]
}

/** Options for `findInputSlotFree` and `findOutputSlotFree`. */
export interface FindFreeSlotOptions {
  /** Slots matching these types will be ignored.  Default: [] */
  typesNotAccepted?: ISlotType[]
  /** If true, the slot itself is returned instead of the index.  Default: false */
  returnObj?: boolean
}

interface DrawSlotsOptions {
  fromSlot?: INodeInputSlot | INodeOutputSlot
  colorContext: DefaultConnectionColors
  editorAlpha: number
  lowQuality: boolean
}

interface DrawWidgetsOptions {
  lowQuality?: boolean
  editorAlpha?: number
}

interface DrawTitleOptions {
  scale: number
  titleHeight?: number
  lowQuality?: boolean
}

interface DrawTitleTextOptions extends DrawTitleOptions {
  defaultTitleColor: string
}

interface DrawTitleBoxOptions extends DrawTitleOptions {
  boxSize?: number
}

/*
title: string
pos: [x,y]
size: [x,y]

input|output: every connection
    +  { name:string, type:string, pos: [x,y]=Optional, direction: "input"|"output", links: Array });

general properties:
    + clipArea: if you render outside the node, it will be clipped
    + unsafeExecution: not allowed for safe execution
    + skipRepeatedOutputs: when adding new outputs, it wont show if there is one already connected
    + resizable: if set to false it wont be resizable with the mouse
    + widgetsStartY: widgets start at y distance from the top of the node

flags object:
    + collapsed: if it is collapsed

supported callbacks:
    + onAdded: when added to graph (warning: this is called BEFORE the node is configured when loading)
    + onRemoved: when removed from graph
    + onStart: when the graph starts playing
    + onStop: when the graph stops playing
    + onDrawForeground: render the inside widgets inside the node
    + onDrawBackground: render the background area inside the node (only in edit mode)
    + onMouseDown
    + onMouseMove
    + onMouseUp
    + onMouseEnter
    + onMouseLeave
    + onExecute: execute the node
    + onPropertyChanged: when a property is changed in the panel (return true to skip default behaviour)
    + onGetInputs: returns an array of possible inputs
    + onGetOutputs: returns an array of possible outputs
    + onBounding: in case this node has a bigger bounding than the node itself (the callback receives the bounding as [x,y,w,h])
    + onDblClick: double clicked in the node
    + onNodeTitleDblClick: double clicked in the node title
    + onInputDblClick: input slot double clicked (can be used to automatically create a node connected)
    + onOutputDblClick: output slot double clicked (can be used to automatically create a node connected)
    + onConfigure: called after the node has been configured
    + onSerialize: to add extra info when serializing (the callback receives the object that should be filled with the data)
    + onSelected
    + onDeselected
    + onDropItem : DOM item dropped over the node
    + onDropFile : file dropped over the node
    + onConnectInput : if returns false the incoming connection will be canceled
    + onConnectionsChange : a connection changed (new one or removed) (NodeSlotType.INPUT or NodeSlotType.OUTPUT, slot, true if connected, linkInfo, inputInfo )
    + onAction: action slot triggered
    + getExtraMenuOptions: to add option to context menu
*/

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- merges static constructor metadata onto the class
export interface LGraphNode {
  /** Static constructor reference used by `LiteGraph.registerNodeType`. */
  constructor: LGraphNodeConstructor
}

/** Graph-like object that supports the `onConnectionChange` callback. */
interface ConnectionChangeNotifier {
  notifyConnectionChange(node: LGraphNode): void
}

/** Invoke `graph.onConnectionChange` when implemented. */
function notifyGraphConnectionChange(
  graph: ConnectionChangeNotifier | null | undefined,
  node: LGraphNode,
): void {
  graph?.notifyConnectionChange(node)
}

// #endregion Types

/**
 * Base class for every node rendered and executed on an `LGraph`.
 *
 * Nodes expose typed `inputs` and `outputs`, optional `widgets`, and a rich set
 * of lifecycle/rendering callbacks. Subclass via `LiteGraph.registerNodeType` or extend
 * directly for custom behaviour.
 * @remarks
 * Override optional callbacks such as `onExecute`, `onDrawForeground`, and
 * `onConnectionsChange` to implement node logic. Position and size are
 * `Positionable` and participate in canvas hit-testing via `boundingRect`.
 * @param title Display title shown in the node header.
 * @param type Registered node type string used by `LiteGraph.createNode`.
 * @see `LGraph.add`
 * @see `LGraphNode.connect`
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LGraphNode implements NodeLike, Positionable, IPinnable, IColorable {
  // Static properties used by dynamic child classes
  /** Default title for nodes of this type when instance title is unset. */
  static title?: string
  /** Maximum lines retained in `console` trace output. */
  static MAX_CONSOLE?: number
  /** Registered type name; used by `LiteGraph.createNode`. */
  static type?: string
  /** Palette category for the node search menu. */
  static category?: string
  /** Optional filter string limiting visibility in menus. */
  static filter?: string
  /** When `true`, excluded from node picker lists. */
  static skipList?: boolean
  /** Optional node-definition metadata from the host app (e.g. widget value migration maps). */
  static nodeData?: {
    /** Maps legacy `widgetsValues` indices to widget names for named-value restore. */
    fallbackWidgetsValuesNames?: string[]
  }

  /**
   * Pixel size of corner resize handles.
   * @see `findResizeDirection`
   */
  static resizeHandleSize = 15
  /** Pixel size of edge resize hit areas. */
  static resizeEdgeSize = 5

  /**
   * Default setting for `LGraphNode.connectInputToOutput`.
   * @see `keepAllLinksOnBypass` on `INodeFlags`
   */
  static keepAllLinksOnBypass: boolean = false

  #concreteInputs: NodeInputSlot[] = []
  #concreteOutputs: NodeOutputSlot[] = []

  /** @inheritdoc `renderArea` */
  #renderArea: Float32Array = new Float32Array(4)

  /** @inheritdoc `boundingRect` */
  #boundingRect: Rectangle = new Rectangle()

  /** `pos` and `size` values are backed by this `Rect`. */
  #posSizeStore: Float32Array = new Float32Array(4)
  #posStore: Point = this.#posSizeStore.subarray(0, 2)
  #sizeStore: Size = this.#posSizeStore.subarray(2, 4)
  /** Override for `renderingShape`; unset uses constructor or global default. */
  #shapeStore?: RenderShape

  /** The title text of the node. */
  title: string

  /** Owning graph or subgraph; `null` before `LGraph.add`. */
  graph: LGraph | Subgraph | null = null
  /** Unique ID within the owning graph. */
  id: NodeId
  /** Registered node type string. */
  type: string = ""
  /** Input connection slots on the left side of the node. */
  inputs: INodeInputSlot[] = []
  /** Output connection slots on the right side of the node. */
  outputs: INodeOutputSlot[] = []

  properties: Dictionary<NodeProperty | undefined> = {}
  /** Metadata describing custom properties for the properties panel. */
  propertiesInfo: INodePropertyInfo[] = []
  /** Behaviour flags (collapsed, pinned, bypass, etc.); see `INodeFlags`. */
  flags: INodeFlags = {}
  /** Interactive widgets rendered inside the node body. */
  widgets?: IBaseWidget[]
  /**
   * The amount of space available for widgets to grow into.
   * @see `layoutWidgets`
   */
  freeWidgetSpace?: number

  /**
   * Set to true when widget-backed input slot positions need recalculation.
   * Cleared after arrange() runs. Avoids per-frame O(N) scans in drawConnections.
   */
  widgetSlotsDirty = false

  locked?: boolean

  /**
   * Execution order, automatically computed during run
   * @see `LGraph.computeExecutionOrder`
   */
  order: number = 0
  /** Controls when `onExecute` runs; see `LGraphEventMode`. */
  mode: LGraphEventMode = LGraphEventMode.ALWAYS
  /** Last serialised snapshot, preserved for error placeholder nodes. */
  lastSerialization?: ISerialisedNode
  /** When `true`, `widgets` values are included in `serialize`. */
  serializeWidgets?: boolean
  /**
   * The overridden fg color used to render the node.
   * @see `renderingColor`
   */
  color?: string
  /**
   * The overridden bg color used to render the node.
   * @see `renderingBgColor`
   */
  bgcolor?: string
  /**
   * The overridden box color used to render the node.
   * @see `renderingBoxColor`
   */
  boxcolor?: string

  /**
   * Map of named stroke styles applied when drawing the node bounding outline.
   *
   * Keys `"error"` and `"selected"` are populated by default.
   */
  strokeStyles: Record<string, (this: LGraphNode) => IDrawBoundingOptions | undefined>

  /**
   * The progress of node execution. Used to render a progress bar. Value between 0 and 1.
   */
  progress?: number

  execVersion?: number
  actionCall?: string
  /** Frame counter showing recent execution; decremented each step for visual feedback. */
  executeTriggered?: number
  /** Frame counter showing recent action; decremented each step for visual feedback. */
  actionTriggered?: number
  /** When `true`, widgets render above slots instead of below. */
  widgetsUp?: boolean
  /** Y offset in graph units where widgets begin when not using automatic layout. */
  widgetsStartY?: number
  lostFocusAt?: number
  gotFocusAt?: number
  /** Badges drawn above the title bar (static or factory functions). */
  badges: (LGraphBadge | (() => LGraphBadge))[] = []
  /** Clickable buttons rendered in the title bar. */
  titleButtons: LGraphButton[] = []
  /** Corner alignment for `badges`. */
  badgePosition: BadgePosition = BadgePosition.TopLeft
  collapsedWidth?: number
  /** Rolling debug log displayed on the node when enabled. */
  console?: string[]
  /** Topological depth assigned by `LGraph.computeExecutionOrder`. */
  level?: number
  /** Current pointer hover state for slots and widgets. */
  mouseOver?: IMouseOverData
  redrawOnMouse?: boolean
  /** When `false`, the node cannot be resized interactively. */
  resizable?: boolean
  /** When `true`, the node may be duplicated via the context menu. */
  clonable?: boolean
  /** When `true`, content drawn outside the node body is clipped. */
  clipArea?: boolean
  /** When `true`, `LGraph.remove` refuses to delete this node. */
  ignoreRemove?: boolean
  /** Set when deserialisation failed and a placeholder node was created. */
  hasErrors?: boolean
  removable?: boolean
  blockDelete?: boolean
  /** Whether the node is selected on the canvas. */
  selected?: boolean
  /** When `true`, widgets marked `advanced` are visible. */
  showAdvanced?: boolean

  declare comfyClass?: string
  declare isVirtualNode?: boolean

  /**
   * Creates a node with default title, type, and size.
   * @param title Display title; defaults internally to `"Unnamed"` if empty.
   * @param type Registered node type string.
   */
  constructor(title: string, type?: string) {
    this.id = LiteGraph.useUuids ? LiteGraph.uuidv4() : -1
    this.title = title || "Unnamed"
    this.type = type ?? ""
    this.size = [LiteGraph.NODE_WIDTH, 60]
    this.pos = [10, 10]
    // Assign stroke style getters
    this.strokeStyles = {
      error: this.#getErrorStrokeStyle,
      selected: this.#getSelectedStrokeStyle,
    }
  }

  #getErrorStrokeStyle(this: LGraphNode): IDrawBoundingOptions | undefined {
    if (this.hasErrors) {
      return {
        padding: 12,
        lineWidth: 10,
        color: LiteGraph.NODE_ERROR_COLOUR,
      }
    }
  }

  #getSelectedStrokeStyle(this: LGraphNode): IDrawBoundingOptions | undefined {
    if (this.selected) {
      return {
        padding: this.hasErrors ? 20 : undefined,
      }
    }
  }

  /**
   * Finds the next free slot
   * @param slots The slots to search, i.e. this.inputs or this.outputs
   */
  #findFreeSlot<TSlot extends INodeInputSlot | INodeOutputSlot>(
    slots: TSlot[],
    options?: FindFreeSlotOptions,
  ): TSlot | number {
    const defaults = {
      returnObj: false,
      typesNotAccepted: [],
    }
    const opts = Object.assign(defaults, options || {})
    const length = slots?.length
    if (length <= 0) return -1

    for (let i = 0; i < length; ++i) {
      const slot: TSlot & IGenericLinkOrLinks = slots[i]
      if (!slot || slot.link || slot.links?.length) continue
      if (opts.typesNotAccepted?.includes?.(slot.type)) continue
      return !opts.returnObj ? i : slot
    }
    return -1
  }

  /**
   * Finds a matching slot from those provided, returning the slot itself or its index in `slots`.
   * @param slots Slots to search (this.inputs or this.outputs)
   * @param type Type of slot to look for
   * @param returnObj If true, returns the slot itself.  Otherwise, the index.
   * @param preferFreeSlot Prefer a free slot, but if none are found, fall back to an occupied slot.
   * @param doNotUseOccupied Do not fall back to occupied slots.
   * @see {findSlotByType}
   * @see {findOutputSlotByType}
   * @see {findInputSlotByType}
   * @returns If a match is found, the slot if returnObj is true, otherwise the index.  If no matches are found, -1
   */
  #findSlotByType<TSlot extends INodeInputSlot | INodeOutputSlot>(
    slots: TSlot[],
    type: ISlotType,
    returnObj?: boolean,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): TSlot | number {
    const length = slots?.length
    if (!length) return -1

    // Empty string and * match anything (type:  0)
    if (type == "" || type == "*") type = 0
    const sourceTypes = String(type).toLowerCase().split(",")

    // Run the search
    let occupiedSlot: number | TSlot | null = null
    for (let i = 0; i < length; ++i) {
      const slot: TSlot & IGenericLinkOrLinks = slots[i]
      const destTypes = slot.type == "0" || slot.type == "*"
        ? ["0"]
        : String(slot.type).toLowerCase().split(",")

      for (const sourceType of sourceTypes) {
        // TODO: Remove _event_ entirely.
        const source = sourceType == "_event_" ? LiteGraph.EVENT : sourceType

        for (const destType of destTypes) {
          const dest = destType == "_event_" ? LiteGraph.EVENT : destType

          if (source == dest || source === "*" || dest === "*") {
            if (preferFreeSlot && (slot.links?.length || slot.link != null)) {
              // In case we can't find a free slot.
              occupiedSlot ??= returnObj ? slot : i
              continue
            }
            return returnObj ? slot : i
          }
        }
      }
    }

    return doNotUseOccupied ? -1 : occupiedSlot ?? -1
  }

  #measureSlot(slot: NodeInputSlot | NodeOutputSlot, slotIndex: number, isInput: boolean): void {
    const pos = isInput ? this.getInputPos(slotIndex) : this.getOutputPos(slotIndex)

    slot.boundingRect[0] = pos[0] - LiteGraph.NODE_SLOT_HEIGHT * 0.5
    slot.boundingRect[1] = pos[1] - LiteGraph.NODE_SLOT_HEIGHT * 0.5
    slot.boundingRect[2] = slot.isWidgetInputSlot ? BaseWidget.margin : LiteGraph.NODE_SLOT_HEIGHT
    slot.boundingRect[3] = LiteGraph.NODE_SLOT_HEIGHT
  }

  #measureSlots(): ReadOnlyRect | null {
    const slots: (NodeInputSlot | NodeOutputSlot)[] = []

    for (const [slotIndex, slot] of this.#concreteInputs.entries()) {
      // Unrecognized nodes (Nodes with error) has inputs but no widgets. Treat
      // converted inputs as normal inputs.
      // Widget input slots are handled in layoutWidgetInputSlots
      if (this.widgets?.length && isWidgetInputSlot(slot)) continue

      this.#measureSlot(slot, slotIndex, true)
      slots.push(slot)
    }
    for (const [slotIndex, slot] of this.#concreteOutputs.entries()) {
      this.#measureSlot(slot, slotIndex, false)
      slots.push(slot)
    }

    return slots.length ? createBounds(slots, 0) : null
  }

  #getMouseOverSlot(slot: INodeSlot): INodeSlot | null {
    const isInput = isINodeInputSlot(slot)
    const mouseOverId = this.mouseOver?.[isInput ? "inputId" : "outputId"] ?? -1
    if (mouseOverId === -1) {
      return null
    }
    return isInput ? this.inputs[mouseOverId] : this.outputs[mouseOverId]
  }

  #isMouseOverSlot(slot: INodeSlot): boolean {
    return this.#getMouseOverSlot(slot) === slot
  }

  #isMouseOverWidget(widget: IBaseWidget | undefined): boolean {
    if (!widget) return false
    return this.mouseOver?.overWidget === widget
  }

  /**
   * @internal The inputs that are not positioned with absolute coordinates.
   */
  get #defaultVerticalInputs() {
    return this.inputs.filter(
      slot => !slot.pos && !(this.widgets?.length && isWidgetInputSlot(slot)),
    )
  }

  /**
   * @internal The outputs that are not positioned with absolute coordinates.
   */
  get #defaultVerticalOutputs() {
    return this.outputs.filter((slot: INodeOutputSlot) => !slot.pos)
  }

  /**
   * Arranges the node's widgets vertically.
   * Sets following properties on each widget:
   * -  `computedHeight`
   * -  `y`
   * @param widgetStartY The y-coordinate of the first widget
   */
  #arrangeWidgets(widgetStartY: number): void {
    if (!this.widgets || !this.widgets.length) return

    const bodyHeight = this.bodyHeight
    const startY = this.widgetsStartY ?? (
      (this.widgetsUp ? 0 : widgetStartY) + 2
    )

    let freeSpace = bodyHeight - startY - WIDGET_ARRANGE_BOTTOM_MARGIN

    // Collect fixed height widgets first
    let fixedWidgetHeight = 0
    const growableWidgets: {
      minHeight: number
      prefHeight?: number
      w: IBaseWidget
    }[] = []

    for (const w of this.widgets) {
      if (w.computeSize) {
        const height = w.computeSize()[1] + WIDGET_ARRANGE_GAP
        w.computedHeight = height
        fixedWidgetHeight += height
      } else if (w.computeLayoutSize) {
        const { minHeight, maxHeight } = w.computeLayoutSize(this)
        growableWidgets.push({
          minHeight,
          prefHeight: maxHeight,
          w,
        })
      } else {
        const height = LiteGraph.NODE_WIDGET_HEIGHT + WIDGET_ARRANGE_GAP
        w.computedHeight = height
        fixedWidgetHeight += height
      }
    }

    // Calculate remaining space for growable widgets
    freeSpace -= fixedWidgetHeight
    if (growableWidgets.length > 0) freeSpace -= WIDGET_ARRANGE_GAP * growableWidgets.length
    this.freeWidgetSpace = freeSpace

    // Prepare space requests for distribution
    const spaceRequests = growableWidgets.map(d => ({
      minSize: d.minHeight,
      maxSize: d.prefHeight,
    }))

    // Distribute space among growable widgets
    const allocations = distributeSpace(Math.max(0, freeSpace), spaceRequests)

    // Apply computed heights
    for (const [i, d] of growableWidgets.entries()) {
      d.w.computedHeight = allocations[i] + WIDGET_ARRANGE_GAP
    }

    // Position widgets
    let y = startY
    for (const w of this.widgets) {
      w.y = y
      y += w.computedHeight ?? 0
    }

    if (!this.graph) throw new NullGraphError()

    // Grow the node if necessary.
    // Ref: https://github.com/Comfy-Org/ComfyUI_frontend/issues/2652
    // TODO: Move the layout logic before drawing of the node shape, so we don't
    // need to trigger extra round of rendering.
    if (y > bodyHeight) {
      this.setSize([this.size[0], y + WIDGET_ARRANGE_BOTTOM_MARGIN])
      this.graph.setDirtyCanvas(false, true)
    }
  }

  /**
   * Arranges the layout of the node's widget input slots.
   */
  #arrangeWidgetInputSlots(): void {
    if (!this.widgets?.length) return

    // Build a name→widget map for fast lookup.
    const widgetByName = new Map<string, IBaseWidget>()
    for (const w of this.widgets) widgetByName.set(w.name, w)

    // Set widget-backed slot positions from widget Y coordinates.
    for (const [i, slot] of this.#concreteInputs.entries()) {
      if (!isWidgetInputSlot(slot)) continue

      // Prefer the slot's direct _widget binding (1:1 for promoted inputs).
      // Fall back to name-map lookup for regular nodes without _widget set.
      const widget = slot._widget ?? widgetByName.get(slot.widget.name)
      if (!widget) continue

      const offset = LiteGraph.NODE_SLOT_HEIGHT * 0.5
      slot.pos = [offset, widget.y + offset]
      this.#measureSlot(slot, i, true)
    }
  }

  /**
   * The font style used to render the node's title text.
   */
  get titleFontStyle(): string {
    return `${LiteGraph.NODE_TEXT_SIZE}px ${LiteGraph.NODE_FONT}`
  }

  /**
   * CSS font shorthand for rendering slot labels and subtext.
   */
  get innerFontStyle(): string {
    return `normal ${LiteGraph.NODE_SUBTEXT_SIZE}px ${LiteGraph.NODE_FONT}`
  }

  /** Type string shown in the node header; defaults to `type`. */
  get displayType(): string {
    return this.type
  }

  /** The fg color used to render the node. */
  get renderingColor(): string {
    return this.color || this.constructor.color || LiteGraph.NODE_DEFAULT_COLOR
  }

  /** The bg color used to render the node. */
  get renderingBgColor(): string {
    return this.bgcolor || this.constructor.bgColor || LiteGraph.NODE_DEFAULT_BGCOLOR
  }

  /** The box color used to render the node. */
  get renderingBoxColor(): string {
    if (this.boxcolor) return this.boxcolor

    if (LiteGraph.nodeBoxColouredWhenOn) {
      if (this.actionTriggered) return "#FFF"
      if (this.executeTriggered) return "#AAA"
    }

    if (LiteGraph.nodeBoxColouredByMode) {
      const modeColour = LiteGraph.NODE_MODES_COLORS[this.mode ?? LGraphEventMode.ALWAYS]
      if (modeColour) return modeColour
    }
    return LiteGraph.NODE_DEFAULT_BOXCOLOR
  }

  /** @inheritdoc */
  setColorOption(colorOption: ColorOption | null): void {
    if (colorOption == null) {
      delete this.color
      delete this.bgcolor
    } else {
      this.color = colorOption.color
      this.bgcolor = colorOption.bgColor
    }
  }

  /** @inheritdoc */
  getColorOption(): ColorOption | null {
    return Object.values(LGraphCanvas.nodeColors).find(
      colorOption =>
        colorOption.color === this.color && colorOption.bgColor === this.bgcolor,
    ) ?? null
  }
  /** Called from `removeOutput` after an output slot is spliced out. */
  onOutputRemoved?(this: LGraphNode, slot: number): void
  /** Called from `removeInput` after an input slot is spliced out. */
  onInputRemoved?(this: LGraphNode, slot: number, input: INodeInputSlot): void
  /**
   * The width of the node when collapsed.
   * Updated by `LGraphCanvas.drawNode`
   */
  /**
   * Called once at the start of every frame.  Caller may change the values in `out`, which will be reflected in `boundingRect`.
   * WARNING: Making changes to boundingRect via onBounding is poorly supported, and will likely result in strange behaviour.
   */
  onBounding?(this: LGraphNode, out: Rect): void

  /** ComfyUI extension hook for applying virtual node side effects. */
  applyToGraph?(extraLinks?: LLink[]): void

  /** Type guard; overridden by `SubgraphNode` to return `true`. */
  isSubgraphNode(): this is SubgraphNode {
    return false
  }

  /**
   * Rect describing the node area, including shadows and any protrusions.
   * Determines if the node is visible.  Calculated once at the start of every frame.
   */
  get renderArea(): ReadOnlyRect {
    return this.#renderArea
  }

  /**
   * Cached node position & area as `x, y, width, height`.  Includes changes made by `onBounding`, if present.
   *
   * Determines the node hitbox and other rendering effects.  Calculated once at the start of every frame.
   */
  get boundingRect(): ReadOnlyRectangle {
    return this.#boundingRect
  }

  /** The offset from `pos` to the top-left of `boundingRect`. */
  get boundingOffset(): ReadOnlyPoint {
    const { pos, boundingRect } = this
    const [posX, posY] = pos
    const [bX, bY] = boundingRect
    return [posX - bX, posY - bY]
  }

  get posSize() {
    return this.#posSizeStore
  }

  /** Anchor position in graph space; may differ from the top-left of `boundingRect`. */
  public get pos() {
    return this.#posStore
  }

  /** Node position does not necessarily correlate to the top-left corner. */
  public set pos(value) {
    if (!value || value.length < 2) return

    this.#posStore[0] = value[0]
    this.#posStore[1] = value[1]
  }

  /** Body width and height in graph units (excluding title bar). */
  public get size() {
    return this.#sizeStore
  }

  public set size(value) {
    if (!value || value.length < 2) return

    this.#sizeStore[0] = value[0]
    this.#sizeStore[1] = value[1]
  }

  /**
   * The size of the node used for rendering.
   */
  get renderingSize(): Size {
    return this.flags.collapsed ? [this.collapsedWidth ?? 0, 0] : this.#sizeStore
  }

  get shape(): RenderShape | undefined {
    return this.#shapeStore
  }

  /**
   * Sets the visual shape override using enum values or legacy string aliases.
   * @param v Shape constant, `"default"` to clear, or legacy names (`"box"`, `"round"`, etc.).
   */
  set shape(v: RenderShape | "default" | "box" | "round" | "circle" | "card") {
    switch (v) {
      case "default":
        this.#shapeStore = undefined
        break
      case "box":
        this.#shapeStore = RenderShape.BOX
        break
      case "round":
        this.#shapeStore = RenderShape.ROUND
        break
      case "circle":
        this.#shapeStore = RenderShape.CIRCLE
        break
      case "card":
        this.#shapeStore = RenderShape.CARD
        break
      default:
        this.#shapeStore = v
    }
  }

  /**
   * The shape of the node used for rendering.
   * @see `RenderShape`
   */
  get renderingShape(): RenderShape {
    return this.#shapeStore || this.constructor.shape || LiteGraph.NODE_DEFAULT_SHAPE
  }

  /** @deprecated Alias for `selected`. */
  public get isSelected(): boolean | undefined {
    return this.selected
  }

  /** @deprecated Alias for `selected`. */
  public set isSelected(value: boolean) {
    this.selected = value
  }

  /** Title rendering mode from the node constructor, defaulting to `TitleMode.NORMAL_TITLE`. */
  public get titleMode(): TitleMode {
    return this.constructor.titleMode ?? TitleMode.NORMAL_TITLE
  }

  /**
   * Called before an incoming connection is accepted.
   * @returns `false` to cancel the connection.
   */
  onConnectInput?(
    this: LGraphNode,
    targetSlot: number,
    type: unknown,
    output: INodeOutputSlot | SubgraphIO,
    node: LGraphNode | SubgraphInputNode,
    slot: number,
  ): boolean
  /**
   * Called before an outgoing connection is accepted.
   * @returns `false` to cancel the connection.
   */
  onConnectOutput?(
    this: LGraphNode,
    slot: number,
    type: unknown,
    input: INodeInputSlot | SubgraphIO,
    targetNode: number | LGraphNode | SubgraphOutputNode,
    targetSlot: number,
  ): boolean
  /** Called from `setSize` after the node dimensions change. */
  onResize?(this: LGraphNode, size: Size): void
  /**
   * Called when a `properties` entry changes via `setProperty` or the panel.
   * @returns `false` to revert the change.
   */
  onPropertyChanged?(
    this: LGraphNode,
    name: string,
    value: unknown,
    prevValue?: unknown,
  ): boolean
  /** Called for each connection that is created, updated, or removed. This includes "restored" connections when deserialising. */
  onConnectionsChange?(
    this: LGraphNode,
    type: ISlotType,
    index: number,
    isConnected: boolean,
    linkInfo: LLink | null | undefined,
    inputOrOutput: INodeInputSlot | INodeOutputSlot | SubgraphIO,
  ): void
  /** Called from `addInput` when a new input slot is created. */
  onInputAdded?(this: LGraphNode, input: INodeInputSlot): void
  /** Called from `addOutput` when a new output slot is created. */
  onOutputAdded?(this: LGraphNode, output: INodeOutputSlot): void
  /**
   * Called after `configure` restores input and output slots.
   *
   * Use to re-apply slot styling (e.g. wire colours) omitted from serialised data.
   */
  onSlotsConfigured?(this: LGraphNode): void
  /** Called at the end of `configure` with the serialised node payload. */
  onConfigure?(this: LGraphNode, serialisedNode: ISerialisedNode): void
  /** Called from `serialize` to add extra fields; must not return a value. */
  onSerialize?(this: LGraphNode, serialised: ISerialisedNode): void
  /** Primary execution callback invoked by `doExecute` and the graph loop. */
  onExecute?(
    this: LGraphNode,
    param?: unknown,
    options?: { actionCall?: string },
  ): void
  /** Invoked when an action input slot fires via `actionDo`. */
  onAction?(
    this: LGraphNode,
    action: string,
    param: unknown,
    options: { actionCall?: string },
  ): void
  /** Custom background painting inside the node body (edit mode). */
  onDrawBackground?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
  ): void
  /** Called once when the node instance is created by `LiteGraph.createNode`. */
  onNodeCreated?(this: LGraphNode): void
  /**
   * Callback invoked by `connect` to override the target slot index.
   * Its return value overrides the target index selection.
   * @param targetSlot The current input slot index
   * @param requestedSlot The originally requested slot index - could be negative, or if using (deprecated) name search, a string
   * @returns {number | null} If a number is returned, the connection will be made to that input index.
   * If an invalid index or non-number (false, null, NaN etc) is returned, the connection will be cancelled.
   */
  onBeforeConnectInput?(
    this: LGraphNode,
    targetSlot: number,
    requestedSlot?: number | string,
  ): number | false | null
  /** Customises the node properties panel layout. */
  onShowCustomPanelInfo?(this: LGraphNode, panel: Panel): void
  /** Return `true` to skip default property panel row for `pName`. */
  onAddPropertyToPanel?(this: LGraphNode, pName: string, panel: Panel): boolean
  /** Called when a widget value changes through user interaction. */
  onWidgetChanged?(
    this: LGraphNode,
    name: string,
    value: unknown,
    oldValue: unknown,
    w: IBaseWidget,
  ): void
  /** Called when the node is deselected on the canvas. */
  onDeselected?(this: LGraphNode): void
  onKeyUp?(this: LGraphNode, e: KeyboardEvent): void
  onKeyDown?(this: LGraphNode, e: KeyboardEvent): void
  /** Called when the node becomes selected on the canvas. */
  onSelected?(this: LGraphNode): void
  /** Append entries to the node right-click context menu. */
  getExtraMenuOptions?(
    this: LGraphNode,
    canvas: LGraphCanvas,
    options: (IContextMenuValue<unknown> | null)[],
  ): (IContextMenuValue<unknown> | null)[]
  /** Fully replaces the default node context menu when implemented. */
  getMenuOptions?(this: LGraphNode, canvas: LGraphCanvas): IContextMenuValue[]
  /** Called from `LGraph.add` after the node is registered (before `onConfigure` when loading). */
  onAdded?(this: LGraphNode, graph: LGraph): void

  /** Called after the node is configured on a graph; used by primitive/custom nodes. */
  onGraphConfigured?(): void

  /** Called after `onGraphConfigured` for all nodes on the graph. */
  onAfterGraphConfigured?(): void
  /**
   * Custom collapsed-node rendering.
   * @returns `true` if default collapsed rendering should be skipped.
   */
  onDrawCollapsed?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
    cavnas: LGraphCanvas,
  ): boolean
  /** Custom foreground painting over widgets inside the node body. */
  onDrawForeground?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
    canvas: LGraphCanvas,
    canvasElement: HTMLCanvasElement,
  ): void
  /** Called when the pointer leaves the node area. */
  onMouseLeave?(this: LGraphNode, e: CanvasPointerEvent): void
  /**
   * Override the default slot menu options.
   */
  getSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[]
  /**
   * Add extra menu options to the slot context menu.
   */
  getExtraSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[]

  // FIXME: Re-typing
  /**
   * Handle drag-and-drop of DOM items onto the node.
   * @returns `true` if handled.
   */
  onDropItem?(this: LGraphNode, event: Event): boolean
  onDropData?(
    this: LGraphNode,
    data: string | ArrayBuffer,
    filename: string,
    file: File,
  ): void
  /** Handle drag-and-drop of files onto the node. */
  onDropFile?(this: LGraphNode, file: File): void
  onInputClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void
  /** Double-click on an input slot; often used to spawn a connected node. */
  onInputDblClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void
  onOutputClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void
  /** Double-click on an output slot; often used to spawn a connected node. */
  onOutputDblClick?(this: LGraphNode, index: number, e: CanvasPointerEvent): void
  // TODO: Return type
  /** Supplies metadata for a property name when not declared in `propertiesInfo`. */
  onGetPropertyInfo?(this: LGraphNode, property: string): INodePropertyInfo
  /** Called when the user adds a dynamic output via the context menu. */
  onNodeOutputAdd?(this: LGraphNode, value: unknown): void
  /** Called when the user adds a dynamic input via the context menu. */
  onNodeInputAdd?(this: LGraphNode, value: unknown): void
  /** Customises the "Add input" submenu entries. */
  onMenuNodeInputs?(
    this: LGraphNode,
    entries: (IContextMenuValue<INodeSlotContextItem> | null)[],
  ): (IContextMenuValue<INodeSlotContextItem> | null)[]
  /** Customises the "Add output" submenu entries. */
  onMenuNodeOutputs?(
    this: LGraphNode,
    entries: (IContextMenuValue<INodeSlotContextItem> | null)[],
  ): (IContextMenuValue<INodeSlotContextItem> | null)[]
  onMouseUp?(this: LGraphNode, e: CanvasPointerEvent, pos: Point): void
  /** Called when the pointer enters the node area. */
  onMouseEnter?(this: LGraphNode, e: CanvasPointerEvent): void
  /**
   * Blocks drag if return value is truthy.
   * @param pos Offset from `LGraphNode.pos`.
   */
  onMouseDown?(
    this: LGraphNode,
    e: CanvasPointerEvent,
    pos: Point,
    canvas: LGraphCanvas,
  ): boolean
  /** @param pos Offset from `LGraphNode.pos`. */
  onDblClick?(
    this: LGraphNode,
    e: CanvasPointerEvent,
    pos: Point,
    canvas: LGraphCanvas,
  ): void
  /**
   * Double-click on the title bar.
   * @param pos Offset from `pos`.
   */
  onNodeTitleDblClick?(
    this: LGraphNode,
    e: CanvasPointerEvent,
    pos: Point,
    canvas: LGraphCanvas,
  ): void
  /** Completely custom title bar rendering. */
  onDrawTitle?(this: LGraphNode, ctx: CanvasRenderingContext2D): void
  /** Custom title text rendering; called from `drawTitleText`. */
  onDrawTitleText?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
    titleHeight: number,
    size: Size,
    scale: number,
    titleTextFont: string,
    selected?: boolean,
  ): void
  /** Custom collapse-button (title box) rendering. */
  onDrawTitleBox?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
    titleHeight: number,
    size: Size,
    scale: number,
  ): void
  /** Custom title bar background rendering. */
  onDrawTitleBar?(
    this: LGraphNode,
    ctx: CanvasRenderingContext2D,
    titleHeight: number,
    size: Size,
    scale: number,
    fgcolor: string,
  ): void
  /** Called from `LGraph.remove` before the node is detached. */
  onRemoved?(this: LGraphNode): void
  onMouseMove?(
    this: LGraphNode,
    e: CanvasPointerEvent,
    pos: Point,
    arg2: LGraphCanvas,
  ): void
  /** Legacy property-panel refresh hook. */
  onPropertyChange?(this: LGraphNode): void
  /** Forces recomputation of output `LLink.data` for upstream reads via `getInputData`. */
  updateOutputData?(this: LGraphNode, originSlot: number): void

  /** Internal callback for subgraph nodes. Do not implement externally. */
  internalConfigureAfterSlots?(): void

  /**
   * Restores node state from serialised data produced by `serialize`.
   *
   * Rehydrates properties, slots, widgets, and fires connection callbacks for restored links.
   * @param info Deserialised node object from graph configuration.
   */
  configure(info: ISerialisedNode): void {
    if (this.graph) {
      this.graph.incrementVersion()
    }
    if (info.id === -1) info.id = this.id
    for (const j in info) {
      if (j == "properties") {
        // i don't want to clone properties, I want to reuse the old container
        for (const k in info.properties) {
          const widget = this.widgets?.find(w => w?.options?.property === k)
          const value = widget
            ? clampWidgetValue(widget, info.properties[k])
            : info.properties[k]
          this.properties[k] = value
          this.onPropertyChanged?.(k, value)
        }
        continue
      }

      // @ts-expect-error #594
      if (info[j] == null) {
        continue
      }
      // @ts-expect-error #594
      if (typeof info[j] == "object") {
        // @ts-expect-error #594
        if (this[j]?.configure) {
          // @ts-expect-error #594
          this[j]?.configure(info[j])
        } else {
          // @ts-expect-error #594
          this[j] = LiteGraph.cloneObject(info[j], this[j])
        }
      } else {
        // value
        // @ts-expect-error #594
        this[j] = info[j]
      }
    }

    if (!info.title) {
      this.title = this.constructor.title
    }

    this.inputs ??= []
    this.inputs = this.inputs.map(input => toClass(NodeInputSlot, input, this))
    for (const [i, input] of this.inputs.entries()) {
      const link = this.graph && input.link != null
        ? this.graph.links.get(input.link)
        : null
      this.onConnectionsChange?.(NodeSlotType.INPUT, i, true, link, input)
      this.onInputAdded?.(input)
    }

    this.outputs ??= []
    this.outputs = this.outputs.map(output => toClass(NodeOutputSlot, output, this))
    for (const [i, output] of this.outputs.entries()) {
      if (!output.links) continue

      for (const linkId of output.links) {
        const link = this.graph
          ? this.graph.links.get(linkId)
          : null
        this.onConnectionsChange?.(NodeSlotType.OUTPUT, i, true, link, output)
      }
      this.onOutputAdded?.(output)
    }

    this.onSlotsConfigured?.()

    // SubgraphNode callback.
    this.internalConfigureAfterSlots?.()

    if (this.widgets) {
      for (const w of this.widgets) {
        if (!w) continue

        if (w.options?.property && this.properties[w.options.property] != undefined) {
          w.value = clampWidgetValue(
            w,
            JSON.parse(JSON.stringify(this.properties[w.options.property])),
          )
        }
      }

      const getNamedValues = (): Record<string, TWidgetValue> | undefined => {
        if (info.widgetsValuesNamed) return info.widgetsValuesNamed

        const map = (this.constructor as typeof LGraphNode).nodeData?.fallbackWidgetsValuesNames
        if (!info.widgetsValues || !map) return

        return Object.fromEntries(
          info.widgetsValues.flatMap((v, i) => (map[i] != null ? [[map[i], v]] : [])),
        )
      }

      const namedValues = getNamedValues()
      if (namedValues && LiteGraph.namedValuesRestore) {
        for (const widget of this.widgets) {
          if (widget.serialize === false || !(Object.hasOwn(namedValues, widget.name))) continue

          widget.value = clampWidgetValue(widget, namedValues[widget.name])
        }
      } else if (info.widgetsValues) {
        let i = 0
        for (const widget of this.widgets ?? []) {
          if (widget.serialize === false) continue

          widget.value = clampWidgetValue(widget, info.widgetsValues[i])
          i++
        }
      }
    }

    // #6752 / #15613: restore widget labels from serialised input slot labels
    syncWidgetLabelsFromInputs(this)

    // Sync the state of this.resizable.
    if (this.pinned) this.resizable = false

    this.onConfigure?.(info)
  }

  /**
   * Serialises this node to a plain object for persistence or cloning.
   * @returns Shallow copy of serialisable node fields; widgets included when `serializeWidgets` is set.
   */
  serialize(): ISerialisedNode {
    // special case for when there were errors
    if (this.constructor === LGraphNode && this.lastSerialization)
      return this.lastSerialization

    // create serialization object
    const o: ISerialisedNode = {
      id: this.id,
      type: this.type,
      pos: [this.pos[0], this.pos[1]],
      size: [this.size[0], this.size[1]],
      flags: LiteGraph.cloneObject(this.flags),
      order: this.order,
      mode: this.mode,
      showAdvanced: this.showAdvanced,
    }

    if (this.inputs) o.inputs = this.inputs.map(input => inputAsSerialisable(input))
    if (this.outputs) o.outputs = this.outputs.map(output => outputAsSerialisable(output))

    if (this.title && this.title != this.constructor.title) o.title = this.title

    if (this.properties) o.properties = LiteGraph.cloneObject(this.properties)

    const { widgets } = this
    if (widgets?.length && this.serializeWidgets) {
      o.widgetsValues = []
      o.widgetsValuesNamed = {}
      for (const [i, widget] of widgets.entries()) {
        if (widget.serialize === false) continue
        const val = widget.value
        const serialisedVal =
          val != null && typeof val === "object"
            ? JSON.parse(JSON.stringify(val))
            : (val ?? null)
        o.widgetsValues[i] = serialisedVal
        o.widgetsValuesNamed[widget.name] = serialisedVal
      }
    }

    if (!o.type) o.type = this.constructor.type

    if (this.color) o.color = this.color
    if (this.bgcolor) o.bgcolor = this.bgcolor
    if (this.boxcolor) o.boxcolor = this.boxcolor
    if (this.shape) o.shape = this.shape

    if (this.onSerialize?.(o)) console.warn("node onSerialize shouldnt return anything, data should be stored in the object pass in the first parameter")

    return o
  }

  /**
   * Creates a duplicate of this node without copying link IDs.
   * @returns A new node of the same `type` with matching configuration, or `null` if creation fails.
   */
  clone(): LGraphNode | null {
    if (this.type == null) return null
    const node = LiteGraph.createNode(this.type)
    if (!node) return null

    // we clone it because serialize returns shared containers
    const data = LiteGraph.cloneObject(this.serialize())
    const { inputs, outputs } = data

    // remove links
    if (inputs) {
      for (const input of inputs) {
        input.link = null
      }
    }

    if (outputs) {
      for (const { links } of outputs) {
        if (links) links.length = 0
      }
    }

    // @ts-expect-error Exceptional case: id is removed so that the graph can assign a new one on add.
    delete data.id

    if (LiteGraph.useUuids) data.id = LiteGraph.uuidv4()

    node.configure(data)

    return node
  }

  /**
   * @returns JSON string from `serialize`.
   */
  toString(): string {
    return JSON.stringify(this.serialize())
  }

  /**
   * @returns The display title, falling back to the constructor's static `title`.
   */
  getTitle(): string {
    return this.title || this.constructor.title
  }

  /**
   * sets the value of a property
   * @param name
   * @param value
   */
  setProperty(name: string, value: TWidgetValue): void {
    this.properties ||= {}
    const widget = this.widgets?.find(w => w && w.options.property == name)
    if (widget) value = clampWidgetValue(widget, value)

    if (value === this.properties[name]) return

    const prevValue = this.properties[name]
    this.properties[name] = value
    // abort change
    if (this.onPropertyChanged?.(name, value, prevValue) === false)
      this.properties[name] = prevValue

    if (this.widgets) {
      for (const w of this.widgets) {
        if (!w) continue

        if (w.options.property == name) {
          w.value = value
          break
        }
      }
    }
  }

  /**
   * sets the output data
   * @param slot
   * @param data
   */
  setOutputData(slot: number, data: number | string | boolean | { toToolTip?(): string }): void {
    const { outputs } = this
    if (!outputs) return

    // this maybe slow and a niche case
    if (slot == -1 || slot >= outputs.length) return

    const outputInfo = outputs[slot]
    if (!outputInfo) return

    // store data in the output itself in case we want to debug
    outputInfo.data = data

    if (!this.graph) throw new NullGraphError()

    // if there are connections, pass the data to the connections
    const { links } = outputs[slot]
    if (links) {
      for (const id of links) {
        const link = this.graph.links.get(id)
        if (link) link.data = data
      }
    }
  }

  /**
   * sets the output data type, useful when you want to be able to overwrite the data type
   */
  setOutputDataType(slot: number, type: ISlotType): void {
    const { outputs } = this
    if (!outputs || (slot == -1 || slot >= outputs.length)) return

    const outputInfo = outputs[slot]
    if (!outputInfo) return
    // store data in the output itself in case we want to debug
    outputInfo.type = type

    if (!this.graph) throw new NullGraphError()

    // if there are connections, pass the data to the connections
    const { links } = outputs[slot]
    if (links) {
      for (const id of links) {
        const link = this.graph.links.get(id)
        if (link) link.type = type
      }
    }
  }

  /**
   * Retrieves the input data (data traveling through the connection) from one slot
   * @param slot
   * @param forceUpdate if set to true it will force the connected node of this slot to output data into this link
   * @returns data or if it is not connected returns undefined
   */
  getInputData(slot: number, forceUpdate?: boolean): unknown {
    if (!this.inputs) return

    if (slot >= this.inputs.length || this.inputs[slot].link == null) return
    if (!this.graph) throw new NullGraphError()

    const linkId = this.inputs[slot].link
    const link = this.graph.links.get(linkId)
    // bug: weird case but it happens sometimes
    if (!link) return null

    if (!forceUpdate) return link.data

    // special case: used to extract data from the incoming connection before the graph has been executed
    const node = this.graph.getNodeById(link.originId)
    if (!node) return link.data

    if (node.updateOutputData) {
      node.updateOutputData(link.originSlot)
    } else {
      node.onExecute?.()
    }

    return link.data
  }

  /**
   * Retrieves the input data type (in case this supports multiple input types)
   * @param slot
   * @returns datatype in string format
   */
  getInputDataType(slot: number): ISlotType | null {
    if (!this.inputs) return null
    if (slot >= this.inputs.length || this.inputs[slot].link == null) return null
    if (!this.graph) throw new NullGraphError()

    const linkId = this.inputs[slot].link
    const link = this.graph.links.get(linkId)
    // bug: weird case but it happens sometimes
    if (!link) return null

    const node = this.graph.getNodeById(link.originId)
    if (!node) return link.type

    const outputInfo = node.outputs[link.originSlot]
    return outputInfo
      ? outputInfo.type
      : null
  }

  /**
   * Retrieves the input data from one slot using its name instead of slot number
   * @param slotName
   * @param forceUpdate if set to true it will force the connected node of this slot to output data into this link
   * @returns data or if it is not connected returns null
   */
  getInputDataByName(slotName: string, forceUpdate: boolean): unknown {
    const slot = this.findInputSlot(slotName)
    return slot == -1
      ? null
      : this.getInputData(slot, forceUpdate)
  }

  /**
   * tells you if there is a connection in one input slot
   * @param slot The 0-based index of the input to check
   * @returns `true` if the input slot has a link ID (does not perform validation)
   */
  isInputConnected(slot: number): boolean {
    if (!this.inputs) return false
    return slot < this.inputs.length && this.inputs[slot].link != null
  }

  /**
   * tells you info about an input connection (which node, type, etc)
   * @returns object or null { link: id, name: string, type: string or 0 }
   */
  getInputInfo(slot: number): INodeInputSlot | null {
    return !this.inputs || (slot >= this.inputs.length)
      ? null
      : this.inputs[slot]
  }

  /**
   * Returns the link info in the connection of an input slot
   * @returns object or null
   */
  getInputLink(slot: number): LLink | null {
    if (!this.inputs) return null

    if (slot < this.inputs.length) {
      if (!this.graph) throw new NullGraphError()

      const input = this.inputs[slot]
      if (input.link != null) {
        return this.graph.links.get(input.link) ?? null
      }
    }
    return null
  }

  /**
   * returns the node connected in the input slot
   * @returns node or null
   */
  getInputNode(slot: number): LGraphNode | null {
    if (!this.inputs) return null
    if (slot >= this.inputs.length) return null

    const input = this.inputs[slot]
    if (!input || input.link === null) return null
    if (!this.graph) throw new NullGraphError()

    const linkInfo = this.graph.links.get(input.link)
    if (!linkInfo) return null

    return this.graph.getNodeById(linkInfo.originId)
  }

  /**
   * returns the value of an input with this name, otherwise checks if there is a property with that name
   * @returns value
   */
  getInputOrProperty(name: string): unknown {
    const { inputs } = this
    if (!inputs?.length) {
      return this.properties ? this.properties[name] : null
    }
    if (!this.graph) throw new NullGraphError()

    for (const input of inputs) {
      if (name == input.name && input.link != null) {
        const link = this.graph.links.get(input.link)
        if (link) return link.data
      }
    }
    return this.properties[name]
  }

  /**
   * tells you the last output data that went in that slot
   * @returns object or null
   */
  getOutputData(slot: number): unknown {
    if (!this.outputs) return null
    if (slot >= this.outputs.length) return null

    const info = this.outputs[slot]
    return info.data
  }

  /**
   * tells you info about an output connection (which node, type, etc)
   * @returns object or null { name: string, type: string, links: [ ids of links in number ] }
   */
  getOutputInfo(slot: number): INodeOutputSlot | null {
    return !this.outputs || (slot >= this.outputs.length)
      ? null
      : this.outputs[slot]
  }

  /**
   * tells you if there is a connection in one output slot
   */
  isOutputConnected(slot: number): boolean {
    if (!this.outputs) return false
    return slot < this.outputs.length && Number(this.outputs[slot].links?.length) > 0
  }

  /**
   * tells you if there is any connection in the output slots
   */
  isAnyOutputConnected(): boolean {
    const { outputs } = this
    if (!outputs) return false

    for (const output of outputs) {
      if (output.links?.length) return true
    }
    return false
  }

  /**
   * retrieves all the nodes connected to this output slot
   */
  getOutputNodes(slot: number): LGraphNode[] | null {
    const { outputs } = this
    if (!outputs || outputs.length == 0) return null

    if (slot >= outputs.length) return null

    const { links } = outputs[slot]
    if (!links || links.length == 0) return null
    if (!this.graph) throw new NullGraphError()

    const r: LGraphNode[] = []
    for (const id of links) {
      const link = this.graph.links.get(id)
      if (link) {
        const targetNode = this.graph.getNodeById(link.targetId)
        if (targetNode) {
          r.push(targetNode)
        }
      }
    }
    return r
  }

  /**
   * Ensures an `"onTrigger"` `LiteGraph.EVENT` input exists for trigger mode.
   * @returns Index of the trigger input slot.
   */
  addOnTriggerInput(): number {
    const trigS = this.findInputSlot("onTrigger")
    if (trigS == -1) {
      this.addInput("onTrigger", LiteGraph.EVENT, {
        nameLocked: true,
      })
      return this.findInputSlot("onTrigger")
    }
    return trigS
  }

  /**
   * Ensures an `"onExecuted"` `LiteGraph.ACTION` output exists for trigger mode.
   * @returns Index of the executed output slot.
   */
  addOnExecutedOutput(): number {
    const trigS = this.findOutputSlot("onExecuted")
    if (trigS == -1) {
      this.addOutput("onExecuted", LiteGraph.ACTION, {
        nameLocked: true,
      })
      return this.findOutputSlot("onExecuted")
    }
    return trigS
  }

  /**
   * Fires the `"onExecuted"` output after `doExecute` completes.
   * @param param Payload forwarded to downstream nodes.
   * @param options Optional execution metadata including `actionCall`.
   */
  onAfterExecuteNode(param: unknown, options?: { actionCall?: string }) {
    const trigS = this.findOutputSlot("onExecuted")
    if (trigS != -1) {
      this.triggerSlot(trigS, param, null, options)
    }
  }

  /**
   * Switches `mode` and adds trigger slots when entering `LGraphEventMode.ON_TRIGGER`.
   * @param modeTo Target `LGraphEventMode` value.
   * @returns `false` if `modeTo` is unrecognised.
   */
  changeMode(modeTo: number): boolean {
    switch (modeTo) {
      case LGraphEventMode.ON_EVENT:
        break

      case LGraphEventMode.ON_TRIGGER:
        this.addOnTriggerInput()
        this.addOnExecutedOutput()
        break

      case LGraphEventMode.NEVER:
        break

      case LGraphEventMode.ALWAYS:
        break

      // @ts-expect-error Not impl.
      case LiteGraph.ON_REQUEST:
        break

      default:
        return false
        break
    }
    this.mode = modeTo
    return true
  }

  /**
   * Triggers the node code execution, place a boolean/counter to mark the node as being executed
   */
  doExecute(param?: unknown, options?: { actionCall?: string }): void {
    options = options || {}
    if (this.onExecute) {
      // enable this to give the event an ID
      options.actionCall ||= `${this.id}_exec_${Math.floor(Math.random() * 9999)}`
      if (!this.graph) throw new NullGraphError()

      // @ts-expect-error Technically it works when id is a string. Array gets props.
      this.graph.nodesExecuting[this.id] = true
      this.onExecute(param, options)
      // @ts-expect-error deprecated
      this.graph.nodesExecuting[this.id] = false

      // save execution/action ref
      this.execVersion = this.graph.iteration
      if (options?.actionCall) {
        this.actionCall = options.actionCall
        // @ts-expect-error deprecated
        this.graph.nodesExecutedAction[this.id] = options.actionCall
      }
    }
    // the nFrames it will be used (-- each step), means "how old" is the event
    this.executeTriggered = 2
    this.onAfterExecuteNode?.(param, options)
  }

  /**
   * Triggers an action, wrapped by logics to control execution flow
   * @param action name
   */
  actionDo(
    action: string,
    param: unknown,
    options: { actionCall?: string },
  ): void {
    options = options || {}
    if (this.onAction) {
      // enable this to give the event an ID
      options.actionCall ||= `${this.id}_${action || "action"}_${Math.floor(Math.random() * 9999)}`
      if (!this.graph) throw new NullGraphError()

      // @ts-expect-error deprecated
      this.graph.nodesActioning[this.id] = action || "actioning"
      this.onAction(action, param, options)
      // @ts-expect-error deprecated
      this.graph.nodesActioning[this.id] = false

      // save execution/action ref
      if (options?.actionCall) {
        this.actionCall = options.actionCall
        // @ts-expect-error deprecated
        this.graph.nodesExecutedAction[this.id] = options.actionCall
      }
    }
    // the nFrames it will be used (-- each step), means "how old" is the event
    this.actionTriggered = 2
    this.onAfterExecuteNode?.(param, options)
  }

  /**
   * Triggers an event in this node, this will trigger any output with the same name
   * @param action name ( "onPlay", ... ) if action is equivalent to false then the event is send to all
   */
  trigger(
    action: string,
    param: unknown,
    options: { actionCall?: string },
  ): void {
    const { outputs } = this
    if (!outputs || !outputs.length) {
      return
    }

    if (this.graph) this.graph.lastTriggerTime = LiteGraph.getTime()

    for (const [i, output] of outputs.entries()) {
      if (
        !output ||
        output.type !== LiteGraph.EVENT ||
        (action && output.name != action)
      ) {
        continue
      }
      this.triggerSlot(i, param, null, options)
    }
  }

  /**
   * Triggers a slot event in this node: cycle output slots and launch execute/action on connected nodes
   * @param slot the index of the output slot
   * @param linkId [optional] in case you want to trigger and specific output link in a slot
   */
  triggerSlot(
    slot: number,
    param: unknown,
    linkId: number | null,
    options?: { actionCall?: string },
  ): void {
    options = options || {}
    if (!this.outputs) return

    if (slot == null) {
      console.error("slot must be a number")
      return
    }

    if (typeof slot !== "number")
      console.warn("slot must be a number, use node.trigger('name') if you want to use a string")

    const output = this.outputs[slot]
    if (!output) return

    const links = output.links
    if (!links || !links.length) return

    if (!this.graph) throw new NullGraphError()
    this.graph.lastTriggerTime = LiteGraph.getTime()

    // for every link attached here
    for (const id of links) {
      // to skip links
      if (linkId != null && linkId != id) continue

      const linkInfo = this.graph.links.get(id)
      // not connected
      if (!linkInfo) continue

      linkInfo.lastTime = LiteGraph.getTime()
      const node = this.graph.getNodeById(linkInfo.targetId)
      // node not found?
      if (!node) continue

      if (node.mode === LGraphEventMode.ON_TRIGGER) {
        // generate unique trigger ID if not present
        if (!options.actionCall)
          options.actionCall = `${this.id}_trigg_${Math.floor(Math.random() * 9999)}`
        // -- wrapping node.onExecute(param); --
        node.doExecute?.(param, options)
      } else if (node.onAction) {
        // generate unique action ID if not present
        if (!options.actionCall)
          options.actionCall = `${this.id}_act_${Math.floor(Math.random() * 9999)}`
        // pass the action name
        const targetConnection = node.inputs[linkInfo.targetSlot]
        node.actionDo(targetConnection.name, param, options)
      }
    }
  }

  /**
   * clears the trigger slot animation
   * @param slot the index of the output slot
   * @param linkId [optional] in case you want to trigger and specific output link in a slot
   */
  clearTriggeredSlot(slot: number, linkId: number): void {
    if (!this.outputs) return

    const output = this.outputs[slot]
    if (!output) return

    const links = output.links
    if (!links || !links.length) return

    if (!this.graph) throw new NullGraphError()

    // for every link attached here
    for (const id of links) {
      // to skip links
      if (linkId != null && linkId != id) continue

      const linkInfo = this.graph.links.get(id)
      // not connected
      if (!linkInfo) continue

      linkInfo.lastTime = 0
    }
  }

  /**
   * changes node size and triggers callback
   */
  setSize(size: Size): void {
    this.size = size
    this.onResize?.(this.size)
  }

  /**
   * Expands the node size to fit its content.
   */
  expandToFitContent(): void {
    const newSize = this.computeSize()
    this.setSize([
      Math.max(this.size[0], newSize[0]),
      Math.max(this.size[1], newSize[1]),
    ])
  }

  /**
   * Add a new property to this node
   * @param name name of the property
   * @param defaultValue default value of the property
   * @param type string defining the output type ("vec3","number",...)
   * @param extraInfo this can be used to have special properties of the property (like values, etc)
   */
  addProperty(
    name: string,
    defaultValue: NodeProperty | undefined,
    type?: string,
    extraInfo?: Partial<INodePropertyInfo>,
  ): INodePropertyInfo {
    const o: INodePropertyInfo = { name, type, defaultValue }
    if (extraInfo) Object.assign(o, extraInfo)

    this.propertiesInfo ||= []
    this.propertiesInfo.push(o)
    this.properties ||= {}
    this.properties[name] = defaultValue
    return o
  }

  /**
   * add a new output slot to use in this node
   * @param type string defining the output type ("vec3","number",...)
   * @param extraInfo this can be used to have special properties of an output (label, special color, position, etc)
   */
  addOutput<TProperties extends Partial<INodeOutputSlot>>(
    name: string,
    type: ISlotType,
    extraInfo?: TProperties,
  ): INodeOutputSlot & TProperties {
    const output = Object.assign(
      new NodeOutputSlot({ name, type, links: null }, this),
      extraInfo,
    )

    this.outputs ||= []
    this.outputs.push(output)
    this.onOutputAdded?.(output)

    if (LiteGraph.autoLoadSlotTypes)
      LiteGraph.registerNodeAndSlotType(this, type, true)

    this.expandToFitContent()
    this.setDirtyCanvas(true, true)
    return output
  }

  /**
   * remove an existing output slot
   */
  removeOutput(slot: number): void {
    // Only disconnect if node is part of a graph
    if (this.graph) {
      this.disconnectOutput(slot)
    }
    const { outputs } = this
    outputs.splice(slot, 1)

    for (let i = slot; i < outputs.length; ++i) {
      const output = outputs[i]
      if (!output || !output.links) continue

      // Only update link indices if node is part of a graph
      if (this.graph) {
        for (const linkId of output.links) {
          const link = this.graph.links.get(linkId)
          if (link) link.originSlot--
        }
      }
    }

    this.onOutputRemoved?.(slot)
    this.setDirtyCanvas(true, true)
  }

  /**
   * add a new input slot to use in this node
   * @param type string defining the input type ("vec3","number",...), it its a generic one use 0
   * @param extraInfo this can be used to have special properties of an input (label, color, position, etc)
   */
  addInput<TProperties extends Partial<INodeInputSlot>>(name: string, type: ISlotType, extraInfo?: TProperties): INodeInputSlot & TProperties {
    type ||= 0

    const input = Object.assign(
      new NodeInputSlot({ name, type, link: null }, this),
      extraInfo,
    )

    this.inputs ||= []
    this.inputs.push(input)
    this.expandToFitContent()

    this.onInputAdded?.(input)
    LiteGraph.registerNodeAndSlotType(this, type)

    this.setDirtyCanvas(true, true)
    return input
  }

  /**
   * remove an existing input slot
   */
  removeInput(slot: number): void {
    // Only disconnect if node is part of a graph
    if (this.graph) {
      this.disconnectInput(slot, true)
    }
    const { inputs } = this
    const slotInfo = inputs.splice(slot, 1)

    for (let i = slot; i < inputs.length; ++i) {
      const input = inputs[i]
      if (!input?.link) continue

      // Only update link indices if node is part of a graph
      if (this.graph) {
        const link = this.graph.links.get(input.link)
        if (link) link.targetSlot--
      }
    }
    this.onInputRemoved?.(slot, slotInfo[0])
    this.setDirtyCanvas(true, true)
  }

  /**
   * computes the minimum size of a node according to its inputs and output slots
   * @returns the total size
   */
  computeSize(out?: Size): Size {
    const ctorSize = this.constructor.size
    if (ctorSize) return [ctorSize[0], ctorSize[1]]

    const { inputs, outputs, widgets } = this
    let rows = Math.max(
      inputs ? inputs.filter(input => !isWidgetInputSlot(input)).length : 1,
      outputs ? outputs.length : 1,
    )
    const size = out || new Float32Array([0, 0])
    rows = Math.max(rows, 1)
    // although it should be graphcanvas.innerTextFont size
    const fontSize = LiteGraph.NODE_TEXT_SIZE

    const padLeft = LiteGraph.NODE_TITLE_HEIGHT
    const padRight = padLeft * 0.33
    const titleWidth = padLeft + computeTextSize(this.title, this.titleFontStyle) + padRight
    let inputWidth = 0
    let widgetWidth = 0
    let outputWidth = 0

    if (inputs) {
      for (const input of inputs) {
        const text = input.label || input.localizedName || input.name || ""
        const textWidth = computeTextSize(text, this.innerFontStyle)
        if (isWidgetInputSlot(input)) {
          const widget = this.getWidgetFromSlot(input)
          if (widget && !this.isWidgetVisible(widget)) continue

          if (textWidth > widgetWidth) widgetWidth = textWidth
        } else {
          if (textWidth > inputWidth) inputWidth = textWidth
        }
      }
    }

    if (outputs) {
      for (const output of outputs) {
        const text = output.label || output.localizedName || output.name || ""
        const textWidth = computeTextSize(text, this.innerFontStyle)
        if (outputWidth < textWidth)
          outputWidth = textWidth
      }
    }

    const minWidth = LiteGraph.NODE_WIDTH * (widgets?.length ? 1.5 : 1)
    // Text + slot width + centre padding
    const centrePadding = inputWidth && outputWidth ? 5 : 0
    const slotsWidth = inputWidth + outputWidth + (2 * LiteGraph.NODE_SLOT_HEIGHT) + centrePadding

    // Total distance from edge of node to the inner edge of the widget 'previous' arrow button
    const widgetMargin = BaseWidget.margin + BaseWidget.arrowMargin + BaseWidget.arrowWidth
    const widgetPadding = BaseWidget.minValueWidth + (2 * widgetMargin)
    if (widgetWidth) widgetWidth += widgetPadding

    size[0] = Math.max(slotsWidth, widgetWidth, titleWidth, minWidth)
    size[1] = (this.constructor.slotStartY || 0) + rows * LiteGraph.NODE_SLOT_HEIGHT

    // Get widget height & expand size if necessary
    let widgetsHeight = 0
    if (widgets?.length) {
      for (const widget of widgets) {
        if (!this.isWidgetVisible(widget)) continue

        let widgetHeight = 0
        if (widget.computeSize) {
          widgetHeight += widget.computeSize(size[0])[1]
        } else if (widget.computeLayoutSize) {
          // Expand widget width if necessary
          const { minHeight, minWidth } = widget.computeLayoutSize(this)
          const widgetWidth = minWidth + widgetPadding
          if (widgetWidth > size[0]) size[0] = widgetWidth

          widgetHeight += minHeight
        } else {
          widgetHeight += LiteGraph.NODE_WIDGET_HEIGHT
        }
        widgetsHeight += widgetHeight + WIDGET_ARRANGE_GAP
      }
      widgetsHeight += WIDGET_ARRANGE_BOTTOM_MARGIN
    }

    // compute height using widgets height
    if (this.widgetsUp)
      size[1] = Math.max(size[1], widgetsHeight)
    else if (this.widgetsStartY != null)
      size[1] = Math.max(size[1], widgetsHeight + this.widgetsStartY)
    else
      size[1] += widgetsHeight

    function computeTextSize(text: string, fontStyle: string) {
      return LGraphCanvas.measureText?.(text, fontStyle) ??
        fontSize * (text?.length ?? 0) * 0.6
    }

    if (this.constructor.minHeight && size[1] < this.constructor.minHeight) {
      size[1] = this.constructor.minHeight
    }

    // margin
    size[1] += 6

    return size
  }

  /**
   * @deprecated Legacy resize hit-test for the bottom-right corner only.
   *
   * Prefer `findResizeDirection` for full corner/edge support.
   * @param canvasX Pointer X in graph space.
   * @param canvasY Pointer Y in graph space.
   * @returns `true` if the pointer is over the legacy resize square.
   */
  inResizeCorner(canvasX: number, canvasY: number): boolean {
    const rows = this.outputs ? this.outputs.length : 1
    const outputsOffset = (this.constructor.slotStartY || 0) + rows * LiteGraph.NODE_SLOT_HEIGHT
    return isInRectangle(
      canvasX,
      canvasY,
      this.pos[0] + this.size[0] - 15,
      this.pos[1] + Math.max(this.size[1] - 15, outputsOffset),
      20,
      20,
    )
  }

  /**
   * Returns which resize corner the point is over, if any.
   * @param canvasX X position in canvas coordinates
   * @param canvasY Y position in canvas coordinates
   * @returns The compass corner the point is in, otherwise `undefined`.
   */
  findResizeDirection(canvasX: number, canvasY: number): CompassCorners | undefined {
    if (this.resizable === false) return

    const { boundingRect } = this
    if (!boundingRect.containsXy(canvasX, canvasY)) return

    // Check corners first (they take priority over edges)
    return boundingRect.findContainingCorner(canvasX, canvasY, LGraphNode.resizeHandleSize)
  }

  /**
   * returns all the info available about a property of this node.
   * @param property name of the property
   * @returns the object with all the available info
   */
  getPropertyInfo(property: string) {
    let info = null

    // there are several ways to define info about a property
    // legacy mode
    const { propertiesInfo } = this
    if (propertiesInfo) {
      for (const propInfo of propertiesInfo) {
        if (propInfo.name == property) {
          info = propInfo
          break
        }
      }
    }

    const key = `@${property}`
    // litescene mode using the constructor
    // @ts-expect-error deprecated https://github.com/Comfy-Org/litegraph.js/issues/639
    if (this.constructor[key] != null) info = this.constructor[key]

    if (this.constructor.widgetsInfo != null && Object.hasOwn(this.constructor.widgetsInfo, property))
      info = this.constructor.widgetsInfo[property]

    // litescene mode using the constructor
    if (!info && this.onGetPropertyInfo) {
      info = this.onGetPropertyInfo(property)
    }

    info ||= {}
    info.type ||= typeof this.properties[property]
    if (info.widget == "combo") info.type = "enum"

    return info
  }

  /**
   * Defines a widget inside the node, it will be rendered on top of the node, you can control lots of properties
   * @param type the widget type
   * @param name the text to show on the widget
   * @param value the default value
   * @param callback function to call when it changes (optionally, it can be the name of the property to modify)
   * @param options the object that contains special properties of this widget
   * @returns the created widget object
   */
  addWidget<Type extends TWidgetType, TValue extends WidgetTypeMap[Type]["value"]>(
    type: Type,
    name: string,
    value: TValue,
    callback: IBaseWidget["callback"] | string | null,
    options?: WidgetOptionsFor<Type> | string,
  ): WidgetTypeMap[Type] | IBaseWidget {
    this.widgets ||= []

    let resolvedCallback = callback
    let opts: IWidgetOptions

    if (!options && resolvedCallback && typeof resolvedCallback === "object") {
      opts = resolvedCallback as IWidgetOptions
      resolvedCallback = null
    } else if (typeof options === "string") {
      opts = { property: options }
    } else if (options && typeof options === "object") {
      opts = { ...options }
    } else {
      opts = {}
    }
    if (resolvedCallback && typeof resolvedCallback === "string") {
      opts.property = resolvedCallback
      resolvedCallback = null
    }

    const w: IBaseWidget & { type: Type } = {
      // @ts-expect-error
      type: type.toLowerCase(),
      name: name,
      value: value,
      callback: typeof resolvedCallback !== "function" ? undefined : resolvedCallback,
      options: opts,
      y: 0,
    }

    if (w.options.y !== undefined) {
      w.y = w.options.y
    }

    if (!callback && !w.options.callback && !w.options.property) {
      console.warn("LiteGraph addWidget(...) without a callback or property assigned")
    }
    if (type == "combo" && !w.options.values) {
      throw "LiteGraph addWidget('combo',...) requires to pass values in options: { values:['red','blue'] }"
    }

    const widget = this.addCustomWidget(w)
    this.expandToFitContent()
    return widget
  }

  /**
   * Converts a plain widget descriptor to a concrete widget and appends it.
   * @param customWidget Widget definition or pre-built instance.
   * @returns The concrete widget added to `widgets`.
   */
  addCustomWidget<TPlainWidget extends IBaseWidget>(
    customWidget: TPlainWidget,
  ): TPlainWidget | WidgetTypeMap[TPlainWidget["type"]] {
    this.widgets ||= []
    const widget = toConcreteWidget(customWidget, this, false) ?? customWidget
    this.widgets.push(widget)
    this.widgetSlotsDirty = true

    return widget
  }

  /**
   * Adds a clickable button to the title bar.
   * @param options Button configuration passed to `LGraphButton`.
   * @returns The created button instance.
   */
  addTitleButton(options: LGraphButtonOptions): LGraphButton {
    this.titleButtons ||= []
    const button = new LGraphButton(options)
    this.titleButtons.push(button)
    return button
  }

  /**
   * Default handler for title bar button clicks; dispatches a canvas event.
   * @param button The button that was clicked.
   * @param canvas Canvas receiving the `"litegraph:node-title-button-clicked"` event.
   */
  onTitleButtonClick(button: LGraphButton, canvas: LGraphCanvas): void {
    // Dispatch event for button click
    canvas.dispatch("litegraph:node-title-button-clicked", {
      node: this,
      button: button,
    })
  }

  /**
   * Removes the first widget matching `name`.
   * @param name Widget name to search for.
   */
  removeWidgetByName(name: string): void {
    const widget = this.widgets?.find(x => x.name === name)
    if (widget) this.removeWidget(widget)
  }

  /**
   * Invokes `onRemove` on every widget so DOM overlays and other resources are released.
   * Called when the node is removed from the graph; idempotent for widgets already disposed.
   */
  disposeWidgets(): void {
    for (const widget of this.widgets ?? []) widget.onRemove?.()
  }

  /**
   * Removes a widget and clears any associated widget input slot references.
   * @param widget Widget instance to remove.
   * @throws If the node has no widgets or the widget is not on this node.
   */
  removeWidget(widget: IBaseWidget): void {
    if (!this.widgets) throw new Error("removeWidget called on node without widgets")

    const widgetIndex = this.widgets.indexOf(widget)
    if (widgetIndex === -1) throw new Error("Widget not found on this node")

    // Clean up slot references to prevent memory leaks
    if (this.inputs) {
      for (const input of this.inputs) {
        if (input._widget === widget) {
          input._widget = undefined
          delete input.widget
          input.pos = undefined
        }
      }
    }
    this.widgetSlotsDirty = true

    widget.onRemove?.()
    this.widgets.splice(widgetIndex, 1)
  }

  /**
   * Best-effort wrapper around `removeWidget` that logs failures instead of throwing.
   * @param widget Widget to remove.
   */
  ensureWidgetRemoved(widget: IBaseWidget): void {
    try {
      this.removeWidget(widget)
    } catch (error) {
      console.debug("Failed to remove widget", error)
    }
  }

  /** @inheritdoc Positionable.move — no-op when `pinned`. */
  move(deltaX: number, deltaY: number): void {
    if (this.pinned) return

    this.pos[0] += deltaX
    this.pos[1] += deltaY
  }

  /**
   * Internal method to measure the node for rendering.  Prefer `boundingRect` where possible.
   *
   * Populates `out` with the results in graph space.
   * Populates `collapsedWidth` with the collapsed width if the node is collapsed.
   * Adjusts for title and collapsed status, but does not call `onBounding`.
   * @param out `x, y, width, height` are written to this array.
   * @param ctx The canvas context to use for measuring text.
   */
  measure(out: Rect, ctx: CanvasRenderingContext2D): void {
    const titleMode = this.titleMode
    const renderTitle =
      titleMode != TitleMode.TRANSPARENT_TITLE &&
      titleMode != TitleMode.NO_TITLE
    const titleHeight = renderTitle ? LiteGraph.NODE_TITLE_HEIGHT : 0

    out[0] = this.pos[0]
    out[1] = this.pos[1] + -titleHeight
    if (!this.flags?.collapsed) {
      out[2] = this.size[0]
      out[3] = this.size[1] + titleHeight
    } else {
      ctx.font = this.innerFontStyle
      this.collapsedWidth = Math.min(
        this.size[0],
        ctx ? cachedMeasureText(ctx, this.getTitle() ?? "") + LiteGraph.NODE_TITLE_HEIGHT * 2 : 0,
      )
      out[2] = (this.collapsedWidth || LiteGraph.NODE_COLLAPSED_WIDTH)
      out[3] = LiteGraph.NODE_TITLE_HEIGHT
    }
  }

  /**
   * returns the bounding of the object, used for rendering purposes
   * @param out {Float32Array[4]?} [optional] a place to store the output, to free garbage
   * @param includeExternal {boolean?} [optional] set to true to
   * include the shadow and connection points in the bounding calculation
   * @returns the bounding box in format of [topLeftCornerX, topLeftCornerY, width, height]
   */
  getBounding(out?: Rect, includeExternal?: boolean): Rect {
    out ||= new Float32Array(4)

    const rect = includeExternal ? this.renderArea : this.boundingRect
    out[0] = rect[0]
    out[1] = rect[1]
    out[2] = rect[2]
    out[3] = rect[3]

    return out
  }

  /**
   * Calculates the render area of this node, populating both `boundingRect` and `renderArea`.
   * Called automatically at the start of every frame.
   */
  updateArea(ctx: CanvasRenderingContext2D): void {
    const bounds = this.#boundingRect
    this.measure(bounds, ctx)
    this.onBounding?.(bounds)

    const renderArea = this.#renderArea
    renderArea.set(bounds)
    // 4 offset for collapsed node connection points
    renderArea[0] -= 4
    renderArea[1] -= 4
    // Add shadow & left offset
    renderArea[2] += 6 + 4
    // Add shadow & top offsets
    renderArea[3] += 5 + 4
  }

  /**
   * checks if a point is inside the shape of a node
   */
  isPointInside(x: number, y: number): boolean {
    return isInRect(x, y, this.boundingRect)
  }

  /**
   * Checks if the provided point is inside this node's collapse button area.
   * @param x X co-ordinate to check
   * @param y Y co-ordinate to check
   * @returns true if the x,y point is in the collapse button area, otherwise false
   */
  isPointInCollapse(x: number, y: number): boolean {
    const squareLength = LiteGraph.NODE_TITLE_HEIGHT
    return isInRectangle(
      x,
      y,
      this.pos[0],
      this.pos[1] - squareLength,
      squareLength,
      squareLength,
    )
  }

  /**
   * Returns the input slot at the given position. Uses full 20 height, and approximates the label length.
   * @param pos The graph co-ordinates to check
   * @returns The input slot at the given position if found, otherwise `undefined`.
   */
  getInputOnPos(pos: Point): INodeInputSlot | undefined {
    return getNodeInputOnPos(this, pos[0], pos[1])?.input
  }

  /**
   * Returns the output slot at the given position. Uses full 20x20 box for the slot.
   * @param pos The graph co-ordinates to check
   * @returns The output slot at the given position if found, otherwise `undefined`.
   */
  getOutputOnPos(pos: Point): INodeOutputSlot | undefined {
    return getNodeOutputOnPos(this, pos[0], pos[1])?.output
  }

  /**
   * Returns the input or output slot at the given position.
   *
   * Tries `getNodeInputOnPos` first, then `getNodeOutputOnPos`.
   * @param pos The graph co-ordinates to check
   * @returns The input or output slot at the given position if found, otherwise `undefined`.
   */
  getSlotOnPos(pos: Point): INodeInputSlot | INodeOutputSlot | undefined {
    if (!isPointInRect(pos, this.boundingRect)) return

    return this.getInputOnPos(pos) ?? this.getOutputOnPos(pos)
  }

  /**
   * @deprecated Use `getSlotOnPos` instead.
   * checks if a point is inside a node slot, and returns info about which slot
   * @param x
   * @param y
   * @returns if found the object contains { input|output: slot object, slot: number, linkPos: [x,y] }
   */
  getSlotInPosition(x: number, y: number): IFoundSlot | null {
    // search for inputs
    const { inputs, outputs } = this

    if (inputs) {
      for (const [i, input] of inputs.entries()) {
        const pos = this.getInputPos(i)
        if (isInRectangle(x, y, pos[0] - 10, pos[1] - 10, 20, 20)) {
          return { input, slot: i, linkPos: pos }
        }
      }
    }

    if (outputs) {
      for (const [i, output] of outputs.entries()) {
        const pos = this.getOutputPos(i)
        if (isInRectangle(x, y, pos[0] - 10, pos[1] - 10, 20, 20)) {
          return { output, slot: i, linkPos: pos }
        }
      }
    }

    return null
  }

  /**
   * Gets the widget on this node at the given co-ordinates.
   * @param canvasX X co-ordinate in graph space
   * @param canvasY Y co-ordinate in graph space
   * @returns The widget found, otherwise `null`
   */
  getWidgetOnPos(
    canvasX: number,
    canvasY: number,
    includeDisabled = false,
  ): IBaseWidget | undefined {
    const { widgets, pos, size } = this
    if (!widgets?.length) return

    const x = canvasX - pos[0]
    const y = canvasY - pos[1]
    const nodeWidth = size[0]

    for (const widget of widgets) {
      if (
        (widget.computedDisabled && !includeDisabled) ||
        !this.isWidgetVisible(widget)
      ) {
        continue
      }

      const h = widget.computedHeight ??
        widget.computeSize?.(nodeWidth)[1] ??
        LiteGraph.NODE_WIDGET_HEIGHT

      const w = widget.width || nodeWidth
      if (
        widget.lastY !== undefined &&
        isInRectangle(x, y, 6, widget.lastY, w - 12, h)
      ) {
        return widget
      }
    }
  }

  /**
   * Returns the input slot with a given name (used for dynamic slots), -1 if not found
   * @param name the name of the slot to find
   * @param returnObj if the obj itself wanted
   * @returns the slot (-1 if not found)
   */
  findInputSlot<TReturn extends false>(name: string, returnObj?: TReturn): number
  findInputSlot<TReturn extends true>(name: string, returnObj?: TReturn): INodeInputSlot
  findInputSlot(name: string, returnObj: boolean = false) {
    const { inputs } = this
    if (!inputs) return -1

    for (const [i, input] of inputs.entries()) {
      if (name == input.name) {
        return !returnObj ? i : input
      }
    }
    return -1
  }

  /**
   * returns the output slot with a given name (used for dynamic slots), -1 if not found
   * @param name the name of the slot to find
   * @param returnObj if the obj itself wanted
   * @returns the slot (-1 if not found)
   */
  findOutputSlot<TReturn extends false>(name: string, returnObj?: TReturn): number
  findOutputSlot<TReturn extends true>(name: string, returnObj?: TReturn): INodeOutputSlot
  findOutputSlot(name: string, returnObj: boolean = false) {
    const { outputs } = this
    if (!outputs) return -1

    for (const [i, output] of outputs.entries()) {
      if (name == output.name) {
        return !returnObj ? i : output
      }
    }
    return -1
  }

  /**
   * Finds the first free input slot.
   * @param optsIn
   * @returns The index of the first matching slot, the slot itself if returnObj is true, or -1 if not found.
   */
  findInputSlotFree<TReturn extends false>(
    optsIn?: FindFreeSlotOptions & { returnObj?: TReturn },
  ): number
  findInputSlotFree<TReturn extends true>(
    optsIn?: FindFreeSlotOptions & { returnObj?: TReturn },
  ): INodeInputSlot | -1
  findInputSlotFree(optsIn?: FindFreeSlotOptions) {
    return this.#findFreeSlot(this.inputs, optsIn)
  }

  /**
   * Finds the first free output slot.
   * @param optsIn
   * @returns The index of the first matching slot, the slot itself if returnObj is true, or -1 if not found.
   */
  findOutputSlotFree<TReturn extends false>(
    optsIn?: FindFreeSlotOptions & { returnObj?: TReturn },
  ): number
  findOutputSlotFree<TReturn extends true>(
    optsIn?: FindFreeSlotOptions & { returnObj?: TReturn },
  ): INodeOutputSlot | -1
  findOutputSlotFree(optsIn?: FindFreeSlotOptions) {
    return this.#findFreeSlot(this.outputs, optsIn)
  }

  /**
   * findSlotByType for INPUTS
   */
  findInputSlotByType<TReturn extends false>(
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): number
  findInputSlotByType<TReturn extends true>(
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): INodeInputSlot
  findInputSlotByType(
    type: ISlotType,
    returnObj?: boolean,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ) {
    return this.#findSlotByType(
      this.inputs,
      type,
      returnObj,
      preferFreeSlot,
      doNotUseOccupied,
    )
  }

  /**
   * findSlotByType for OUTPUTS
   */
  findOutputSlotByType<TReturn extends false>(
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): number
  findOutputSlotByType<TReturn extends true>(
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): INodeOutputSlot
  findOutputSlotByType(
    type: ISlotType,
    returnObj?: boolean,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ) {
    return this.#findSlotByType(
      this.outputs,
      type,
      returnObj,
      preferFreeSlot,
      doNotUseOccupied,
    )
  }

  /**
   * returns the output (or input) slot with a given type, -1 if not found
   * @param input uise inputs instead of outputs
   * @param type the type of the slot to find
   * @param returnObj if the obj itself wanted
   * @param preferFreeSlot if we want a free slot (if not found, will return the first of the type anyway)
   * @returns the slot (-1 if not found)
   */
  findSlotByType<TSlot extends true | false, TReturn extends false>(
    input: TSlot,
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): number
  findSlotByType<TSlot extends true, TReturn extends true>(
    input: TSlot,
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): INodeInputSlot | -1
  findSlotByType<TSlot extends false, TReturn extends true>(
    input: TSlot,
    type: ISlotType,
    returnObj?: TReturn,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): INodeOutputSlot | -1
  findSlotByType(
    input: boolean,
    type: ISlotType,
    returnObj?: boolean,
    preferFreeSlot?: boolean,
    doNotUseOccupied?: boolean,
  ): number | INodeOutputSlot | INodeInputSlot {
    return input
      ? this.#findSlotByType(
        this.inputs,
        type,
        returnObj,
        preferFreeSlot,
        doNotUseOccupied,
      )
      : this.#findSlotByType(
        this.outputs,
        type,
        returnObj,
        preferFreeSlot,
        doNotUseOccupied,
      )
  }

  /**
   * Determines the slot index to connect to when attempting to connect by type.
   * @param findInputs If true, searches for an input.  Otherwise, an output.
   * @param node The node at the other end of the connection.
   * @param slotType The type of slot at the other end of the connection.
   * @param options Search restrictions to adhere to.
   * @see {connectByType}
   * @see {connectByTypeOutput}
   */
  findConnectByTypeSlot(
    findInputs: boolean,
    node: LGraphNode,
    slotType: ISlotType,
    options?: ConnectByTypeOptions,
  ): number | undefined {
    if (!this.graph) throw new NullGraphError()

    // LEGACY: Old options names
    if (options && typeof options === "object") {
      if ("firstFreeIfInputGeneralInCase" in options) options.wildcardToTyped = !!options.firstFreeIfInputGeneralInCase
      if ("firstFreeIfOutputGeneralInCase" in options) options.wildcardToTyped = !!options.firstFreeIfOutputGeneralInCase
      if ("generalTypeInCase" in options) options.typedToWildcard = !!options.generalTypeInCase
    }

    const optsDef: ConnectByTypeOptions = {
      createEventInCase: true,
      wildcardToTyped: true,
      typedToWildcard: true,
    }
    const opts = Object.assign(optsDef, options)

    if (node && typeof node === "number") {
      const nodeById = this.graph.getNodeById(node)
      if (!nodeById) return

      node = nodeById
    }
    const slot = node.findSlotByType(findInputs, slotType, false, true)
    if (slot >= 0 && slot !== null) return slot

    // TODO: Remove or reimpl. events.  WILL CREATE THE onTrigger IN SLOT
    if (opts.createEventInCase && slotType == LiteGraph.EVENT) {
      if (findInputs) return -1
      if (LiteGraph.doAddTriggersSlots) return node.addOnExecutedOutput()
    }

    // connect to the first general output slot if not found a specific type and
    if (opts.typedToWildcard) {
      const generalSlot = node.findSlotByType(findInputs, 0, false, true, true)
      if (generalSlot >= 0) return generalSlot
    }
    // connect to the first free input slot if not found a specific type and this output is general
    if (
      opts.wildcardToTyped &&
      (slotType == 0 || slotType == "*" || slotType == "")
    ) {
      const opt = { typesNotAccepted: [LiteGraph.EVENT] }
      const nonEventSlot = findInputs
        ? node.findInputSlotFree(opt)
        : node.findOutputSlotFree(opt)
      if (nonEventSlot >= 0) return nonEventSlot
    }
  }

  /**
   * Finds the first free output slot with any of the comma-delimited types in `type`.
   *
   * If no slots are free, falls back in order to:
   * - The first free wildcard slot
   * - The first occupied slot
   * - The first occupied wildcard slot
   * @param type The `ISlotType type` of slot to find
   * @returns The index and slot if found, otherwise `undefined`.
   */
  findOutputByType(type: ISlotType): undefined | { index: number, slot: INodeOutputSlot } {
    return findFreeSlotOfType(this.outputs, type, output => !output.links?.length)
  }

  /**
   * Finds the first free input slot with any of the comma-delimited types in `type`.
   *
   * If no slots are free, falls back in order to:
   * - The first free wildcard slot
   * - The first occupied slot
   * - The first occupied wildcard slot
   * @param type The `ISlotType type` of slot to find
   * @returns The index and slot if found, otherwise `undefined`.
   */
  findInputByType(type: ISlotType): undefined | { index: number, slot: INodeInputSlot } {
    return findFreeSlotOfType(this.inputs, type, input => input.link == null)
  }

  /**
   * connect this node output to the input of another node BY TYPE
   * @param slot (could be the number of the slot or the string with the name of the slot)
   * @param targetNode the target node
   * @param targetSlotType the input slot type of the target node
   * @returns the linkInfo is created, otherwise null
   */
  connectByType(
    slot: number | string,
    targetNode: LGraphNode,
    targetSlotType: ISlotType,
    optsIn?: ConnectByTypeOptions,
  ): LLink | null {
    const slotIndex = this.findConnectByTypeSlot(
      true,
      targetNode,
      targetSlotType,
      optsIn,
    )
    if (slotIndex !== undefined)
      return this.connect(slot, targetNode, slotIndex, optsIn?.afterRerouteId)

    console.debug("[connectByType]: no way to connect type:", targetSlotType, "to node:", targetNode)
    return null
  }

  /**
   * connect this node input to the output of another node BY TYPE
   * @param slot (could be the number of the slot or the string with the name of the slot)
   * @param sourceNode the target node
   * @param sourceSlotType the output slot type of the target node
   * @returns the linkInfo is created, otherwise null
   */
  connectByTypeOutput(
    slot: number | string,
    sourceNode: LGraphNode,
    sourceSlotType: ISlotType,
    optsIn?: ConnectByTypeOptions,
  ): LLink | null {
    // LEGACY: Old options names
    if (typeof optsIn === "object") {
      if ("firstFreeIfInputGeneralInCase" in optsIn) optsIn.wildcardToTyped = !!optsIn.firstFreeIfInputGeneralInCase
      if ("generalTypeInCase" in optsIn) optsIn.typedToWildcard = !!optsIn.generalTypeInCase
    }
    const slotIndex = this.findConnectByTypeSlot(
      false,
      sourceNode,
      sourceSlotType,
      optsIn,
    )
    if (slotIndex !== undefined)
      return sourceNode.connect(slotIndex, this, slot, optsIn?.afterRerouteId)

    console.debug("[connectByType]: no way to connect type:", sourceSlotType, "to node:", sourceNode)
    return null
  }

  /**
   * Checks whether a connection from `fromSlot` on this node to `toSlot` on `node` is allowed.
   *
   * Used by `LinkConnector` and drag-link classes during hover validation.
   * @param node Target node at the other end of the proposed link.
   * @param toSlot Input-side slot (or subgraph IO) being connected to.
   * @param fromSlot Output-side slot (or subgraph IO) being connected from.
   */
  canConnectTo(
    node: NodeLike,
    toSlot: INodeInputSlot | SubgraphIO,
    fromSlot: INodeOutputSlot | SubgraphIO,
  ) {
    return this.id !== node.id && LiteGraph.isValidConnection(fromSlot.type, toSlot.type)
  }

  /**
   * Connect an output of this node to an input of another node
   * @param slot (could be the number of the slot or the string with the name of the slot)
   * @param targetNode the target node
   * @param targetSlot the input slot of the target node (could be the number of the slot or the string with the name of the slot, or -1 to connect a trigger)
   * @returns the linkInfo is created, otherwise null
   */
  connect(
    slot: number | string,
    targetNode: LGraphNode,
    targetSlot: ISlotType,
    afterRerouteId?: RerouteId,
  ): LLink | null {
    const { graph, outputs } = this
    if (!graph) {
      // could be connected before adding it to a graph
      // due to link ids being associated with graphs
      console.log("Connect: Error, node doesn't belong to any graph. Nodes must be added first to a graph before connecting them.")
      return null
    }

    // seek for the output slot
    if (typeof slot === "string") {
      slot = this.findOutputSlot(slot)
      if (slot == -1) {
        if (LiteGraph.debug) console.log(`Connect: Error, no slot of name ${slot}`)
        return null
      }
    } else if (!outputs || slot >= outputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found")
      return null
    }

    if (targetNode && typeof targetNode === "number") {
      const nodeById = graph.getNodeById(targetNode)
      if (!nodeById) throw "target node is null"

      targetNode = nodeById
    }
    if (!targetNode) throw "target node is null"

    // avoid loopback
    if (targetNode == this) return null

    // Allow legacy API support for searching targetSlot by string, without mutating the input variables
    let targetIndex: number | null

    // you can specify the slot by name
    if (typeof targetSlot === "string") {
      targetIndex = targetNode.findInputSlot(targetSlot)
      if (targetIndex == -1) {
        if (LiteGraph.debug) console.log(`Connect: Error, no slot of name ${targetIndex}`)
        return null
      }
    } else if (targetSlot === LiteGraph.EVENT) {
      // TODO: Events
      if (LiteGraph.doAddTriggersSlots) {
        targetNode.changeMode(LGraphEventMode.ON_TRIGGER)
        targetIndex = targetNode.findInputSlot("onTrigger")
      } else {
        return null
      }
    } else if (typeof targetSlot === "number") {
      targetIndex = targetSlot
    } else {
      targetIndex = 0
    }

    // Allow target node to change slot
    if (targetNode.onBeforeConnectInput) {
      // This way node can choose another slot (or make a new one?)
      const requestedIndex = targetNode.onBeforeConnectInput(targetIndex, targetSlot)
      targetIndex = typeof requestedIndex === "number" ? requestedIndex : null
    }

    if (
      targetIndex === null ||
      !targetNode.inputs ||
      targetIndex >= targetNode.inputs.length
    ) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found")
      return null
    }

    const input = targetNode.inputs[targetIndex]
    const output = outputs[slot]

    if (!output) return null

    if (output.links?.length) {
      if (output.type === LiteGraph.EVENT && !LiteGraph.allowMultiOutputForEvents) {
        graph.beforeChange()
        // @ts-expect-error Unused param
        this.disconnectOutput(slot, false, { doProcessChange: false })
      }
    }

    const link = this.connectSlots(output, targetNode, input, afterRerouteId)
    return link ?? null
  }

  /**
   * Connect two slots between two nodes
   * @param output The output slot to connect
   * @param inputNode The node that the input slot is on
   * @param input The input slot to connect
   * @param afterRerouteId The reroute ID to use for the link
   * @returns The link that was created, or null if the connection was blocked
   */
  connectSlots(
    output: INodeOutputSlot,
    inputNode: LGraphNode,
    input: INodeInputSlot,
    afterRerouteId: RerouteId | undefined,
  ): LLink | null | undefined {
    const { graph } = this
    if (!graph) throw new NullGraphError()

    const outputIndex = this.outputs.indexOf(output)
    if (outputIndex === -1) {
      console.warn("connectSlots: output not found")
      return
    }
    const inputIndex = inputNode.inputs.indexOf(input)
    if (inputIndex === -1) {
      console.warn("connectSlots: input not found")
      return
    }

    // check targetSlot and check connection types
    if (!LiteGraph.isValidConnection(output.type, input.type)) {
      this.setDirtyCanvas(false, true)
      return null
    }

    // Allow nodes to block connection
    if (inputNode.onConnectInput?.(inputIndex, output.type, output, this, outputIndex) === false)
      return null
    if (this.onConnectOutput?.(outputIndex, input.type, input, inputNode, inputIndex) === false)
      return null

    // if there is something already plugged there, disconnect
    if (inputNode.inputs[inputIndex]?.link != null) {
      graph.beforeChange()
      inputNode.disconnectInput(inputIndex, true)
    }

    const maybeCommonType =
      input.type && output.type && commonType(input.type, output.type)

    const link = new LLink(
      ++graph.state.lastLinkId,
      maybeCommonType || input.type || output.type,
      this.id,
      outputIndex,
      inputNode.id,
      inputIndex,
      afterRerouteId,
    )

    // add to graph links list
    graph.links.set(link.id, link)

    // connect in output
    output.links ??= []
    output.links.push(link.id)
    // connect in input
    inputNode.inputs[inputIndex].link = link.id

    // Reroutes
    const reroutes = LLink.getReroutes(graph, link)
    for (const reroute of reroutes) {
      reroute.linkIds.add(link.id)
      if (reroute.floating) delete reroute.floating
      reroute.dragging = undefined
    }

    // If this is the terminus of a floating link, remove it
    const lastReroute = reroutes.at(-1)
    if (lastReroute) {
      for (const linkId of lastReroute.floatingLinkIds) {
        const link = graph.floatingLinks.get(linkId)
        if (link?.parentId === lastReroute.id) {
          graph.removeFloatingLink(link)
        }
      }
    }
    graph.incrementVersion()

    // link has been created now, so its updated
    this.onConnectionsChange?.(
      NodeSlotType.OUTPUT,
      outputIndex,
      true,
      link,
      output,
    )

    inputNode.onConnectionsChange?.(
      NodeSlotType.INPUT,
      inputIndex,
      true,
      link,
      input,
    )

    notifyGraphConnectionChange(graph, this)
    notifyGraphConnectionChange(graph, inputNode)

    this.setDirtyCanvas(false, true)
    graph.afterChange()

    return link
  }

  /**
   * Creates a floating reroute chain starting from `slot`, optionally after an existing reroute.
   * @param pos Graph position for the new reroute.
   * @param slot Input or output slot on this node to float from.
   * @param afterRerouteId Parent reroute when extending an existing chain.
   * @returns The newly created `Reroute`.
   * @throws If `slot` is not on this node or parent reroute state is invalid.
   */
  connectFloatingReroute(pos: Point, slot: INodeInputSlot | INodeOutputSlot, afterRerouteId?: RerouteId): Reroute {
    const { graph, id } = this
    if (!graph) throw new NullGraphError()

    // Assertion: It's either there or it isn't.
    const inputIndex = this.inputs.indexOf(slot as INodeInputSlot)
    const outputIndex = this.outputs.indexOf(slot as INodeOutputSlot)
    if (inputIndex === -1 && outputIndex === -1) throw new Error("Invalid slot")

    const slotType = outputIndex === -1 ? "input" : "output"

    const reroute = graph.setReroute({
      pos,
      parentId: afterRerouteId,
      linkIds: [],
      floating: { slotType },
    })

    const parentReroute = graph.getReroute(afterRerouteId)
    const fromLastFloatingReroute = parentReroute?.floating?.slotType === "output"

    // Adding from an ouput, or a floating reroute that is NOT the tip of an existing floating chain
    if (afterRerouteId == null || !fromLastFloatingReroute) {
      const link = new LLink(
        -1,
        slot.type,
        outputIndex === -1 ? -1 : id,
        outputIndex,
        inputIndex === -1 ? -1 : id,
        inputIndex,
      )
      link.parentId = reroute.id
      graph.addFloatingLink(link)
      return reroute
    }

    // Adding a new floating reroute from the tip of a floating chain.
    if (!parentReroute) throw new Error("[connectFloatingReroute] Parent reroute not found")

    const link = parentReroute.getFloatingLinks("output")?.[0]
    if (!link) throw new Error("[connectFloatingReroute] Floating link not found")

    reroute.floatingLinkIds.add(link.id)
    link.parentId = reroute.id
    delete parentReroute.floating
    return reroute
  }

  /**
   * disconnect one output to an specific node
   * @param slot (could be the number of the slot or the string with the name of the slot)
   * @param targetNode the target node to which this slot is connected [Optional,
   * if not targetNode is specified all nodes will be disconnected]
   * @returns if it was disconnected successfully
   */
  disconnectOutput(slot: string | number, targetNode?: LGraphNode): boolean {
    if (typeof slot === "string") {
      slot = this.findOutputSlot(slot)
      if (slot == -1) {
        if (LiteGraph.debug) console.log(`Connect: Error, no slot of name ${slot}`)
        return false
      }
    } else if (!this.outputs || slot >= this.outputs.length) {
      if (LiteGraph.debug) console.log("Connect: Error, slot number not found")
      return false
    }

    // get output slot
    const output = this.outputs[slot]
    if (!output) return false

    if (output.floatingLinks) {
      for (const link of output.floatingLinks) {
        if (link.hasOrigin(this.id, slot)) {
          this.graph?.removeFloatingLink(link)
        }
      }
    }

    if (!output.links || output.links.length == 0) return false
    const { links } = output

    // one of the output links in this slot
    const graph = this.graph
    if (!graph) throw new NullGraphError()

    if (targetNode) {
      const target = typeof targetNode === "number"
        ? graph.getNodeById(targetNode)
        : targetNode
      if (!target) throw "Target Node not found"

      for (const [i, linkId] of links.entries()) {
        const linkInfo = graph.links.get(linkId)
        if (linkInfo?.targetId != target.id) continue

        // is the link we are searching for...
        // remove here
        links.splice(i, 1)
        const input = target.inputs[linkInfo.targetSlot]
        // remove there
        input.link = null

        // remove the link from the links pool
        linkInfo.disconnect(graph, "input")
        graph.incrementVersion()

        // linkInfo hasn't been modified so its ok
        target.onConnectionsChange?.(
          NodeSlotType.INPUT,
          linkInfo.targetSlot,
          false,
          linkInfo,
          input,
        )
        this.onConnectionsChange?.(
          NodeSlotType.OUTPUT,
          slot,
          false,
          linkInfo,
          output,
        )

        notifyGraphConnectionChange(graph, target)
        notifyGraphConnectionChange(graph, this)

        break
      }
    } else {
      // all the links in this output slot
      for (const linkId of links) {
        const linkInfo = graph.links.get(linkId)
        if (!linkInfo) continue
        if (
          linkInfo.targetId === SUBGRAPH_OUTPUT_ID &&
          graph instanceof Subgraph
        ) {
          const targetSlot = graph.outputNode.slots[linkInfo.targetSlot]
          if (targetSlot) {
            targetSlot.linkIds.length = 0
          } else {
            console.error("Missing subgraphOutput slot when disconnecting link")
          }
        }

        const target = graph.getNodeById(linkInfo.targetId)
        graph.incrementVersion()

        if (target) {
          const input = target.inputs[linkInfo.targetSlot]
          // remove other side link
          input.link = null

          // linkInfo hasn't been modified so its ok
          target.onConnectionsChange?.(
            NodeSlotType.INPUT,
            linkInfo.targetSlot,
            false,
            linkInfo,
            input,
          )
        }
        // remove the link from the links pool
        linkInfo.disconnect(graph, "input")

        this.onConnectionsChange?.(
          NodeSlotType.OUTPUT,
          slot,
          false,
          linkInfo,
          output,
        )

        if (target) {
          notifyGraphConnectionChange(graph, target)
        }
        notifyGraphConnectionChange(graph, this)
      }
      output.links = null
    }

    this.setDirtyCanvas(false, true)
    return true
  }

  /**
   * Disconnect one input
   * @param slot Input slot index, or the name of the slot
   * @param keepReroutes If `true`, reroutes will not be garbage collected.
   * @returns true if disconnected successfully or already disconnected, otherwise false
   */
  disconnectInput(slot: number | string, keepReroutes?: boolean): boolean {
    // Allow search by string
    if (typeof slot === "string") {
      slot = this.findInputSlot(slot)
      if (slot == -1) {
        if (LiteGraph.debug) console.log(`Connect: Error, no slot of name ${slot}`)
        return false
      }
    } else if (!this.inputs || slot >= this.inputs.length) {
      if (LiteGraph.debug) {
        console.log("Connect: Error, slot number not found")
      }
      return false
    }

    const input = this.inputs[slot]
    if (!input) {
      console.debug("disconnectInput: input not found", slot, this.inputs)
      return false
    }

    const { graph } = this
    if (!graph) throw new NullGraphError()

    // Break floating links
    if (input.floatingLinks?.size) {
      for (const link of input.floatingLinks) {
        graph.removeFloatingLink(link)
      }
    }

    const linkId = this.inputs[slot].link
    if (linkId != null) {
      this.inputs[slot].link = null

      // remove other side
      const linkInfo = graph.links.get(linkId)
      if (linkInfo) {
        // Let SubgraphInput do the disconnect.
        if (linkInfo.originId === -10 && "inputNode" in graph) {
          graph.inputNode.disconnectNodeInput(this, input, linkInfo)
          return true
        }

        const targetNode = graph.getNodeById(linkInfo.originId)
        if (!targetNode) {
          console.debug("disconnectInput: target node not found", linkInfo.originId)
          return false
        }

        const output = targetNode.outputs[linkInfo.originSlot]
        if (!(output?.links?.length)) {
          console.debug("disconnectInput: output not found", linkInfo.originSlot)
          return false
        }

        // search in the inputs list for this link
        let i = 0
        for (const l = output.links.length; i < l; i++) {
          if (output.links[i] == linkId) {
            output.links.splice(i, 1)
            break
          }
        }

        linkInfo.disconnect(graph, keepReroutes ? "output" : undefined)
        if (graph) graph.incrementVersion()

        this.onConnectionsChange?.(
          NodeSlotType.INPUT,
          slot,
          false,
          linkInfo,
          input,
        )
        targetNode.onConnectionsChange?.(
          NodeSlotType.OUTPUT,
          i,
          false,
          linkInfo,
          output,
        )

        notifyGraphConnectionChange(graph, this)
        notifyGraphConnectionChange(graph, targetNode)
      }
    }

    this.setDirtyCanvas(false, true)
    return true
  }

  /**
   * @deprecated Use `getInputPos` or `getOutputPos` instead.
   * returns the center of a connection point in canvas coords
   * @param isInput true if if a input slot, false if it is an output
   * @param slotNumber (could be the number of the slot or the string with the name of the slot)
   * @param out [optional] a place to store the output, to free garbage
   * @returns the position
   */
  getConnectionPos(isInput: boolean, slotNumber: number, out?: Point): Point {
    out ||= new Float32Array(2)

    const { pos, inputs, outputs } = this
    const [nodeX, nodeY] = pos

    if (this.flags.collapsed) {
      const w = this.collapsedWidth || LiteGraph.NODE_COLLAPSED_WIDTH
      out[0] = isInput ? nodeX : nodeX + w
      out[1] = nodeY - LiteGraph.NODE_TITLE_HEIGHT * 0.5
      return out
    }

    // weird feature that never got finished
    if (isInput && slotNumber == -1) {
      out[0] = nodeX + LiteGraph.NODE_TITLE_HEIGHT * 0.5
      out[1] = nodeY + LiteGraph.NODE_TITLE_HEIGHT * 0.5
      return out
    }

    // hard-coded pos
    const inputPos = inputs?.[slotNumber]?.pos
    const outputPos = outputs?.[slotNumber]?.pos

    if (isInput && inputPos) {
      out[0] = nodeX + inputPos[0]
      out[1] = nodeY + inputPos[1]
      return out
    }
    if (!isInput && outputPos) {
      out[0] = nodeX + outputPos[0]
      out[1] = nodeY + outputPos[1]
      return out
    }

    // default vertical slots
    const offset = LiteGraph.NODE_SLOT_HEIGHT * 0.5
    const slotIndex = isInput
      ? this.#defaultVerticalInputs.indexOf(this.inputs[slotNumber])
      : this.#defaultVerticalOutputs.indexOf(this.outputs[slotNumber])

    out[0] = isInput
      ? nodeX + offset
      : nodeX + this.size[0] + 1 - offset
    out[1] =
      nodeY +
      (slotIndex + 0.7) * LiteGraph.NODE_SLOT_HEIGHT +
      (this.constructor.slotStartY || 0)
    return out
  }

  /**
   * Gets the position of an input slot, in graph co-ordinates.
   *
   * This method is preferred over the legacy `getConnectionPos` method.
   * @param slot Input slot index
   * @returns Position of the input slot
   */
  getInputPos(slot: number): Point {
    return this.getInputSlotPos(this.inputs[slot])
  }

  /**
   * Gets the position of an input slot, in graph co-ordinates.
   * @param input The actual node input object
   * @returns Position of the centre of the input slot in graph co-ordinates.
   */
  getInputSlotPos(input: INodeInputSlot): Point {
    const { pos: thisPos } = this
    const [nodeX, nodeY] = thisPos

    if (this.flags.collapsed) {
      const halfTitle = LiteGraph.NODE_TITLE_HEIGHT * 0.5
      return [nodeX, nodeY - halfTitle]
    }

    const { pos } = input
    if (pos) return [nodeX + pos[0], nodeY + pos[1]]

    // default vertical slots
    const offsetX = LiteGraph.NODE_SLOT_HEIGHT * 0.5
    const nodeOffsetY = this.constructor.slotStartY || 0
    const slotIndex = this.#defaultVerticalInputs.indexOf(input)
    const slotY = (slotIndex + 0.7) * LiteGraph.NODE_SLOT_HEIGHT

    return [nodeX + offsetX, nodeY + slotY + nodeOffsetY]
  }

  /**
   * Gets the position of an output slot, in graph co-ordinates.
   *
   * This method is preferred over the legacy `getConnectionPos` method.
   * @param outputSlotIndex Output slot index
   * @returns Position of the output slot
   */
  getOutputPos(outputSlotIndex: number): Point {
    const { pos, outputs, size } = this
    const [nodeX, nodeY] = pos
    const [width] = size

    if (this.flags.collapsed) {
      const width = this.collapsedWidth || LiteGraph.NODE_COLLAPSED_WIDTH
      const halfTitle = LiteGraph.NODE_TITLE_HEIGHT * 0.5
      return [nodeX + width, nodeY - halfTitle]
    }

    const outputPos = outputs?.[outputSlotIndex]?.pos
    if (outputPos) return [nodeX + outputPos[0], nodeY + outputPos[1]]

    // default vertical slots
    const offsetX = LiteGraph.NODE_SLOT_HEIGHT * 0.5
    const nodeOffsetY = this.constructor.slotStartY || 0
    const slotIndex = this.#defaultVerticalOutputs.indexOf(this.outputs[outputSlotIndex])
    const slotY = (slotIndex + 0.7) * LiteGraph.NODE_SLOT_HEIGHT

    // TODO: Why +1?
    return [nodeX + width + 1 - offsetX, nodeY + slotY + nodeOffsetY]
  }

  /**
   * Get slot position using layout tree if available, fallback to node's position.
   * @param slotIndex The slot index
   * @param isInput Whether this is an input slot
   * @returns Position of the slot center in graph coordinates
   */
  getSlotPosition(slotIndex: number, isInput: boolean): Point {
    return isInput ? this.getInputPos(slotIndex) : this.getOutputPos(slotIndex)
  }

  /** @inheritdoc */
  snapToGrid(snapTo: number): boolean {
    return this.pinned ? false : snapPoint(this.pos, snapTo)
  }

  /** @see `snapToGrid` */
  alignToGrid(): void {
    this.snapToGrid(LiteGraph.CANVAS_GRID_SIZE)
  }

  /* Console output */
  /** Appends a line to `console`, trimming to `MAX_CONSOLE`. */
  trace(msg: string): void {
    this.console ||= []
    this.console.push(msg)
    // @ts-expect-error deprecated
    if (this.console.length > LGraphNode.MAX_CONSOLE)
      this.console.shift()
  }

  /* Forces to redraw or the main canvas (LGraphNode) or the bg canvas (links) */
  setDirtyCanvas(dirtyForeground: boolean, dirtyBackground?: boolean): void {
    this.graph?.canvasAction(c => c.setDirty(dirtyForeground, dirtyBackground))
  }

  /**
   * Loads an image from `LiteGraph.nodeImagesPath` for use in custom drawing.
   * @param URL Filename relative to the node images path.
   * @returns The loading `HTMLImageElement`; `ready` is set when load completes.
   */
  loadImage(URL: string): HTMLImageElement {
    interface AsyncImageElement extends HTMLImageElement { ready?: boolean }

    const img: AsyncImageElement = new Image()
    img.src = LiteGraph.nodeImagesPath + URL
    img.ready = false

    const dirty = () => this.setDirtyCanvas(true)
    img.addEventListener("load", function (this: AsyncImageElement) {
      this.ready = true
      dirty()
    })
    return img
  }

  /**
   * Allows to get onMouseMove and onMouseUp events even if the mouse is out of focus
   * @deprecated Use `LGraphCanvas.pointer` instead.
   */
  captureInput(v: boolean): void {
    warnDeprecated("[DEPRECATED] captureInput will be removed in a future version. Please use LGraphCanvas.pointer (CanvasPointer) instead.")
    if (!this.graph || !this.graph.listOfGraphCanvas) return

    const list = this.graph.listOfGraphCanvas

    for (const c of list) {
      // releasing somebody elses capture?!
      if (!v && c.nodeCapturingInput != this) continue

      // change
      c.nodeCapturingInput = v ? this : null
    }
  }

  /** Whether `flags.collapsed` is set. */
  get collapsed() {
    return !!this.flags.collapsed
  }

  /** Whether the node may be collapsed via UI interaction. */
  get collapsible() {
    return !this.pinned && this.constructor.collapsable !== false
  }

  /**
   * Toggle node collapse (makes it smaller on the canvas)
   */
  collapse(force?: boolean): void {
    if (!this.collapsible && !force) return
    if (!this.graph) throw new NullGraphError()
    this.graph.incrementVersion()
    this.flags.collapsed = !this.flags.collapsed
    this.setDirtyCanvas(true, true)
  }

  /**
   * Toggles advanced mode of the node, showing advanced widgets
   */
  toggleAdvanced() {
    if (!this.widgets?.some(w => w.advanced)) return
    if (!this.graph) throw new NullGraphError()
    this.graph.incrementVersion()
    this.showAdvanced = !this.showAdvanced
    this.expandToFitContent()
    this.setDirtyCanvas(true, true)
  }

  /** Whether `flags.pinned` is set. */
  get pinned() {
    return !!this.flags.pinned
  }

  /**
   * Prevents the node being accidentally moved or resized by mouse interaction.
   * Toggles pinned state if no value is provided.
   */
  pin(v?: boolean): void {
    if (!this.graph) throw new NullGraphError()

    this.graph.incrementVersion()
    this.flags.pinned = v ?? !this.flags.pinned
    this.resizable = !this.pinned
    // Delete the flag if unpinned, so that we don't get unnecessary
    // flags.pinned = false in serialized object.
    if (!this.pinned) delete this.flags.pinned
  }

  unpin(): void {
    this.pin(false)
  }

  /**
   * Converts node-local coordinates to canvas screen space.
   * @param x X offset from `pos`.
   * @param y Y offset from `pos`.
   * @param dragAndScale Active canvas transform.
   * @returns Screen-space point.
   */
  localToScreen(x: number, y: number, dragAndScale: DragAndScale): Point {
    return [
      (x + this.pos[0]) * dragAndScale.scale + dragAndScale.offset[0],
      (y + this.pos[1]) * dragAndScale.scale + dragAndScale.offset[1],
    ]
  }

  /** Rendered width including collapsed state. */
  get width() {
    return this.collapsed
      ? this.collapsedWidth || LiteGraph.NODE_COLLAPSED_WIDTH
      : this.size[0]
  }

  /**
   * Returns the height of the node, including the title bar.
   */
  get height() {
    return LiteGraph.NODE_TITLE_HEIGHT + this.bodyHeight
  }

  /**
   * Returns the height of the node, excluding the title bar.
   */
  get bodyHeight() {
    return this.collapsed ? 0 : this.size[1]
  }

  /**
   * Draws `badges` above the title bar according to `badgePosition`.
   * @param ctx Canvas context in node-local coordinates.
   * @param gap Horizontal spacing between badges. Default: `2`.
   */
  drawBadges(ctx: CanvasRenderingContext2D, { gap = 2 } = {}): void {
    const badgeInstances = this.badges.map(badge =>
      badge instanceof LGraphBadge ? badge : badge())
    const isLeftAligned = this.badgePosition === BadgePosition.TopLeft

    let currentX = isLeftAligned
      ? 0
      : this.width - badgeInstances.reduce((acc, badge) => acc + badge.getWidth(ctx) + gap, 0)
    const y = -(LiteGraph.NODE_TITLE_HEIGHT + gap)

    for (const badge of badgeInstances) {
      badge.draw(ctx, currentX, y - badge.height)
      currentX += badge.getWidth(ctx) + gap
    }
  }

  /**
   * Renders the node's title bar background
   */
  drawTitleBarBackground(ctx: CanvasRenderingContext2D, {
    scale,
    titleHeight = LiteGraph.NODE_TITLE_HEIGHT,
    lowQuality = false,
  }: DrawTitleOptions): void {
    const fgcolor = this.renderingColor
    const shape = this.renderingShape
    const size = this.renderingSize

    if (this.onDrawTitleBar) {
      this.onDrawTitleBar(ctx, titleHeight, size, scale, fgcolor)
      return
    }

    if (this.titleMode === TitleMode.TRANSPARENT_TITLE) {
      return
    }

    if (this.collapsed) {
      ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR
    }

    ctx.fillStyle = this.constructor.titleColor || fgcolor
    ctx.beginPath()

    if (shape == RenderShape.BOX || lowQuality) {
      ctx.rect(0, -titleHeight, size[0], titleHeight)
    } else if (shape == RenderShape.ROUND || shape == RenderShape.CARD) {
      ctx.roundRect(
        0,
        -titleHeight,
        size[0],
        titleHeight,
        this.collapsed
          ? [LiteGraph.ROUND_RADIUS]
          : [LiteGraph.ROUND_RADIUS, LiteGraph.ROUND_RADIUS, 0, 0],
      )
    }
    ctx.fill()
    ctx.shadowColor = "transparent"
  }

  /**
   * Renders the node's title box, i.e. the dot in front of the title text that
   * when clicked toggles the node's collapsed state. The term `title box` comes
   * from the original LiteGraph implementation.
   */
  drawTitleBox(ctx: CanvasRenderingContext2D, {
    scale,
    lowQuality = false,
    titleHeight = LiteGraph.NODE_TITLE_HEIGHT,
    boxSize = 10,
  }: DrawTitleBoxOptions): void {
    const size = this.renderingSize
    const shape = this.renderingShape

    if (this.onDrawTitleBox) {
      this.onDrawTitleBox(ctx, titleHeight, size, scale)
      return
    }

    if (
      [RenderShape.ROUND, RenderShape.CIRCLE, RenderShape.CARD].includes(shape)
    ) {
      if (lowQuality) {
        ctx.fillStyle = "black"
        ctx.beginPath()
        ctx.arc(
          titleHeight * 0.5,
          titleHeight * -0.5,
          boxSize * 0.5 + 1,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      ctx.fillStyle = this.renderingBoxColor
      if (lowQuality) {
        ctx.fillRect(
          titleHeight * 0.5 - boxSize * 0.5,
          titleHeight * -0.5 - boxSize * 0.5,
          boxSize,
          boxSize,
        )
      } else {
        ctx.beginPath()
        ctx.arc(
          titleHeight * 0.5,
          titleHeight * -0.5,
          boxSize * 0.5,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
    } else {
      if (lowQuality) {
        ctx.fillStyle = "black"
        ctx.fillRect(
          (titleHeight - boxSize) * 0.5 - 1,
          (titleHeight + boxSize) * -0.5 - 1,
          boxSize + 2,
          boxSize + 2,
        )
      }
      ctx.fillStyle = this.renderingBoxColor
      ctx.fillRect(
        (titleHeight - boxSize) * 0.5,
        (titleHeight + boxSize) * -0.5,
        boxSize,
        boxSize,
      )
    }
  }

  /**
   * Renders the node's title text.
   */
  drawTitleText(ctx: CanvasRenderingContext2D, {
    scale,
    defaultTitleColor,
    lowQuality = false,
    titleHeight = LiteGraph.NODE_TITLE_HEIGHT,
  }: DrawTitleTextOptions): void {
    const size = this.renderingSize
    const selected = this.selected

    if (this.onDrawTitleText) {
      this.onDrawTitleText(
        ctx,
        titleHeight,
        size,
        scale,
        this.titleFontStyle,
        selected,
      )
      return
    }

    // Don't render title text if low quality
    if (lowQuality) {
      return
    }

    ctx.font = this.titleFontStyle
    const rawTitle = this.getTitle() ?? `❌ ${this.type}`
    const title = String(rawTitle) + (this.pinned ? "📌" : "")
    if (title) {
      if (selected) {
        ctx.fillStyle = LiteGraph.NODE_SELECTED_TITLE_COLOR
      } else {
        ctx.fillStyle = this.constructor.titleTextColor || defaultTitleColor
      }

      // Calculate available width for title
      let availableWidth = size[0] - titleHeight * 2 // Basic margins

      // Subtract space for title buttons
      if (this.titleButtons?.length > 0) {
        let buttonsWidth = 0
        const savedFont = ctx.font // Save current font
        for (const button of this.titleButtons) {
          if (button.visible) {
            buttonsWidth += button.getWidth(ctx) + 2 // button width + gap
          }
        }
        ctx.font = savedFont // Restore font after button measurements
        if (buttonsWidth > 0) {
          buttonsWidth += 10 // Extra margin before buttons
          availableWidth -= buttonsWidth
        }
      }

      // Truncate title if needed
      let displayTitle = title

      if (this.collapsed) {
        // For collapsed nodes, limit to 20 chars as before
        displayTitle = title.substr(0, 20)
      } else if (availableWidth > 0) {
        // For regular nodes, truncate based on available width
        displayTitle = truncateText(ctx, title, availableWidth)
      }

      ctx.textAlign = "left"
      ctx.fillText(
        displayTitle,
        titleHeight,
        LiteGraph.NODE_TITLE_TEXT_Y - titleHeight,
      )
    }
  }

  /**
   * Attempts to gracefully bypass this node in all of its connections by reconnecting all links.
   *
   * Each input is checked against each output.  This is done on a matching index basis, i.e. input 3 -> output 3.
   * If there are any input links remaining,
   * and `flags` `keepAllLinksOnBypass` is `true`,
   * each input will check for outputs that match, and take the first one that matches
   * `true`: Try the index matching first, then every input to every output.
   * `false`: Only matches indexes, e.g. input 3 to output 3.
   *
   * If `flags` `keepAllLinksOnBypass` is `undefined`, it will fall back to
   * the static `LGraphNode.keepAllLinksOnBypass`.
   * @returns `true` if any new links were established, otherwise `false`.
   * @todo Decision: Change API to return array of new links instead?
   */
  connectInputToOutput(): boolean | undefined {
    const { inputs, outputs, graph } = this
    if (!inputs || !outputs) return
    if (!graph) throw new NullGraphError()

    const { links } = graph
    let madeAnyConnections = false

    // First pass: only match exactly index-to-index
    for (const [index, input] of inputs.entries()) {
      if (input.link == null) continue

      const output = outputs[index]
      if (!output || !LiteGraph.isValidConnection(input.type, output.type)) continue

      const inLink = links.get(input.link)
      if (!inLink) continue
      const inNode = graph.getNodeById(inLink?.originId)
      if (!inNode) continue

      bypassAllLinks(output, inNode, inLink, graph)
    }
    // Configured to only use index-to-index matching
    if (!(this.flags.keepAllLinksOnBypass ?? LGraphNode.keepAllLinksOnBypass))
      return madeAnyConnections

    // Second pass: match any remaining links
    for (const input of inputs) {
      if (input.link == null) continue

      const inLink = links.get(input.link)
      if (!inLink) continue
      const inNode = graph.getNodeById(inLink?.originId)
      if (!inNode) continue

      for (const output of outputs) {
        if (!LiteGraph.isValidConnection(input.type, output.type)) continue

        bypassAllLinks(output, inNode, inLink, graph)
        break
      }
    }
    return madeAnyConnections

    function bypassAllLinks(output: INodeOutputSlot, inNode: LGraphNode, inLink: LLink, graph: LGraph) {
      const outLinks = output.links
        ?.map(x => links.get(x))
        .filter(x => !!x)
      if (!outLinks?.length) return

      for (const outLink of outLinks) {
        const outNode = graph.getNodeById(outLink.targetId)
        if (!outNode) continue

        const result = inNode.connect(
          inLink.originSlot,
          outNode,
          outLink.targetSlot,
          inLink.parentId,
        )
        madeAnyConnections ||= !!result
      }
    }
  }

  /**
   * Returns `true` if the widget is visible, otherwise `false`.
   */
  isWidgetVisible(widget: IBaseWidget): boolean {
    const isHidden = (
      this.collapsed ||
      widget.hidden ||
      (widget.advanced && !this.showAdvanced)
    )
    return !isHidden
  }

  drawWidgets(ctx: CanvasRenderingContext2D, {
    lowQuality = false,
    editorAlpha = 1,
  }: DrawWidgetsOptions): void {
    if (!this.widgets) return

    const nodeWidth = this.size[0]
    const { widgets } = this
    const H = LiteGraph.NODE_WIDGET_HEIGHT
    const showText = !lowQuality
    ctx.save()
    ctx.globalAlpha = editorAlpha

    for (const widget of widgets) {
      if (!this.isWidgetVisible(widget)) continue

      const { y } = widget
      const outlineColour = widget.advanced ? LiteGraph.WIDGET_ADVANCED_OUTLINE_COLOR : LiteGraph.WIDGET_OUTLINE_COLOR

      widget.lastY = y
      // Disable widget if it is disabled or if the value is passed from socket connection.
      widget.computedDisabled = widget.disabled || this.getSlotFromWidget(widget)?.link != null

      ctx.strokeStyle = outlineColour
      ctx.fillStyle = "#222"
      ctx.textAlign = "left"
      if (widget.computedDisabled) ctx.globalAlpha *= 0.5
      const width = widget.width || nodeWidth

      if (typeof widget.draw === "function") {
        widget.draw(ctx, this, width, y, H, lowQuality)
      } else {
        toConcreteWidget(widget, this, false)?.drawWidget(ctx, { width, showText })
      }
      ctx.globalAlpha = editorAlpha
    }
    ctx.restore()
  }

  /**
   * When `LGraphNode.collapsed` is `true`, this method draws the node's collapsed slots.
   */
  drawCollapsedSlots(ctx: CanvasRenderingContext2D): void {
    // Render the first connected slot only.
    for (const slot of this.#concreteInputs) {
      if (slot.link != null) {
        slot.drawCollapsed(ctx)
        break
      }
    }
    for (const slot of this.#concreteOutputs) {
      if (slot.links?.length) {
        slot.drawCollapsed(ctx)
        break
      }
    }
  }

  /** Combined `inputs` and `outputs` for iteration. */
  get slots(): (INodeInputSlot | INodeOutputSlot)[] {
    return [...this.inputs, ...this.outputs]
  }

  /**
   * Returns the input slot that is associated with the given widget.
   */
  getSlotFromWidget(widget: IBaseWidget | undefined): INodeInputSlot | undefined {
    if (widget) return this.inputs.find(slot => isWidgetInputSlot(slot) && slot.widget.name === widget.name)
  }

  /**
   * Returns the widget that is associated with the given input slot.
   */
  getWidgetFromSlot(slot: INodeInputSlot): IBaseWidget | undefined {
    if (!isWidgetInputSlot(slot)) return
    return this.widgets?.find(w => w.name === slot.widget.name)
  }

  /**
   * Draws the node's input and output slots.
   */
  drawSlots(ctx: CanvasRenderingContext2D, {
    fromSlot,
    colorContext,
    editorAlpha,
    lowQuality,
  }: DrawSlotsOptions) {
    for (const slot of [...this.#concreteInputs, ...this.#concreteOutputs]) {
      const isValidTarget = fromSlot && slot.isValidTarget(fromSlot)
      const isMouseOverSlot = this.#isMouseOverSlot(slot)

      // change opacity of incompatible slots when dragging a connection
      const isValid = !fromSlot || isValidTarget
      const highlight = isValid && isMouseOverSlot

      // Show slot if it's not a widget input slot
      // or if it's a widget input slot and satisfies one of the following:
      // - the mouse is over the widget
      // - the slot is valid during link drop
      // - the slot is connected
      if (
        isMouseOverSlot ||
        isValidTarget ||
        !slot.isWidgetInputSlot ||
        this.#isMouseOverWidget(this.getWidgetFromSlot(slot)) ||
        slot.isConnected ||
        slot.alwaysVisible
      ) {
        ctx.globalAlpha = isValid ? editorAlpha : 0.4 * editorAlpha
        slot.draw(ctx, {
          colorContext,
          lowQuality,
          highlight,
        })
      }
    }
  }

  /**
   * @internal Sets the internal concrete slot arrays, ensuring they are instances of
   * `NodeInputSlot` or `NodeOutputSlot`.
   *
   * A temporary workaround until duck-typed inputs and outputs
   * have been removed from the ecosystem.
   */
  setConcreteSlots(): void {
    this.#concreteInputs = this.inputs.map(slot => toClass(NodeInputSlot, slot, this))
    this.#concreteOutputs = this.outputs.map(slot => toClass(NodeOutputSlot, slot, this))
  }

  /**
   * Arranges node elements in preparation for rendering (slots & widgets).
   */
  arrange(): void {
    const slotsBounds = this.#measureSlots()
    const widgetStartY = slotsBounds ? slotsBounds[1] + slotsBounds[3] - this.pos[1] : 0
    this.#arrangeWidgets(widgetStartY)
    this.#arrangeWidgetInputSlots()
    this.widgetSlotsDirty = false
  }

  /**
   * Draws a progress bar on the node.
   * @param ctx The canvas context to draw on
   */
  drawProgressBar(ctx: CanvasRenderingContext2D): void {
    if (!this.progress) return

    const originalFillStyle = ctx.fillStyle
    ctx.fillStyle = "green"
    ctx.fillRect(
      0,
      0,
      this.width * this.progress,
      6,
    )
    ctx.fillStyle = originalFillStyle
  }
}
