import type { SubgraphInput } from "./SubgraphInput"
import type { SubgraphInputNode } from "./SubgraphInputNode"
import type { SubgraphOutput } from "./SubgraphOutput"
import type { SubgraphOutputNode } from "./SubgraphOutputNode"
import type { DefaultConnectionColors, Hoverable, INodeInputSlot, INodeOutputSlot, Point, ReadOnlyRect, ReadOnlySize } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { LinkId, LLink } from "@/LLink"
import type { RerouteId } from "@/Reroute"
import type { CanvasPointerEvent } from "@/types/events"
import type { Serialisable, SubgraphIO } from "@/types/serialisation"

import { SlotShape } from "@/draw"
import { ConstrainedSize } from "@/infrastructure/ConstrainedSize"
import { Rectangle } from "@/infrastructure/Rectangle"
import { LGraphCanvas } from "@/LGraphCanvas"
import { LiteGraph } from "@/litegraph"
import { SlotBase } from "@/node/SlotBase"
import { createUuidv4, type UUID } from "@/utils/uuid"

/**
 * Options passed to {@link SubgraphSlot.draw} when rendering a subgraph IO slot.
 */
export interface SubgraphSlotDrawOptions {
  /** Canvas rendering context; may be left dirty after drawing. */
  ctx: CanvasRenderingContext2D
  /** Connection colour palette for type-based slot colouring. */
  colorContext: DefaultConnectionColors
  /** When `true`, uses simplified slot rendering. */
  lowQuality?: boolean
  /** When dragging a link, the slot being dragged (used for validity highlighting). */
  fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput
  /** Opacity multiplier for editor overlays. */
  editorAlpha?: number
}

/**
 * Shared base class for {@link SubgraphInput} and {@link SubgraphOutput} boundary slots.
 *
 * Implements serialisation, hit-testing, layout measurement, link ID tracking, and canvas
 * rendering for slots displayed on subgraph IO boundary nodes.
 * @see {@link SubgraphInput}
 * @see {@link SubgraphOutput}
 */
export abstract class SubgraphSlot extends SlotBase implements SubgraphIO, Hoverable, Serialisable<SubgraphIO> {
  /** Default vertical height of a subgraph IO slot row, matching standard node slot height. */
  static get defaultHeight() {
    return LiteGraph.NODE_SLOT_HEIGHT
  }

  readonly #pos: Point = new Float32Array(2)

  /** Cached label width/height used during {@link arrange}. */
  readonly measurement: ConstrainedSize = new ConstrainedSize(SubgraphSlot.defaultHeight, SubgraphSlot.defaultHeight)

  /** Stable unique identifier for this slot within the subgraph definition. */
  readonly id: UUID
  /** The IO boundary node ({@link SubgraphInputNode} or {@link SubgraphOutputNode}) that owns this slot. */
  readonly parent: SubgraphInputNode | SubgraphOutputNode
  /** Slot type string used for connection compatibility checks. */
  override type: string

  /**
   * IDs of all {@link LLink} instances attached to this slot.
   *
   * Inputs may fan out to multiple internal targets; outputs typically hold a single link ID.
   */
  readonly linkIds: LinkId[] = []

  /** Axis-aligned bounds used for layout and hit-testing. */
  override readonly boundingRect: Rectangle = new Rectangle(0, 0, 0, SubgraphSlot.defaultHeight)

  /** Canvas-space centre of the slot connection circle. */
  override get pos() {
    return this.#pos
  }

  override set pos(value) {
    if (!value || value.length < 2) return

    this.#pos[0] = value[0]
    this.#pos[1] = value[1]
  }

  /** Whether this slot has at least one connected link. */
  override get isConnected() {
    return this.linkIds.length > 0
  }

  /** Resolved display label, preferring {@link label}, then {@link localized_name}, then {@link name}. */
  get displayName() {
    return this.label ?? this.localized_name ?? this.name
  }

  /** Canvas-space position for rendering this slot's text label. */
  abstract get labelPos(): Point

  /**
   * @param slot Serialised slot metadata (name, type, optional styling).
   * @param parent The IO boundary node that will own and lay out this slot.
   */
  constructor(slot: SubgraphIO, parent: SubgraphInputNode | SubgraphOutputNode) {
    super(slot.name, slot.type)

    Object.assign(this, slot)
    this.id = slot.id ?? createUuidv4()
    this.type = slot.type
    this.parent = parent
  }

  /** Whether the pointer is currently over this slot. */
  isPointerOver: boolean = false

  /**
   * Tests whether a canvas point lies inside this slot's bounding rectangle.
   * @param point `[x, y]` in canvas space.
   */
  containsPoint(point: Point): boolean {
    return this.boundingRect.containsPoint(point)
  }

  /**
   * Updates {@link isPointerOver} from a pointer move event.
   * @param e The pointer event in canvas coordinates.
   */
  onPointerMove(e: CanvasPointerEvent): void {
    this.isPointerOver = this.boundingRect.containsXy(e.canvasX, e.canvasY)
  }

  /**
   * Resolves all link IDs on this slot to live {@link LLink} instances.
   * @returns Links still present in the parent subgraph's link map.
   */
  getLinks(): LLink[] {
    const links: LLink[] = []
    const { subgraph } = this.parent

    for (const id of this.linkIds) {
      const link = subgraph.getLink(id)
      if (link) links.push(link)
    }
    return links
  }

  /**
   * Decrements slot indices on connected links after a slot above this one is removed.
   * @param inputsOrOutputs Whether this slot lives on the input or output IO node, determining
   * which link property (`origin_slot` vs `target_slot`) to adjust.
   */
  decrementSlots(inputsOrOutputs: "inputs" | "outputs"): void {
    const { links } = this.parent.subgraph
    const linkProperty = inputsOrOutputs === "inputs" ? "origin_slot" : "target_slot"

    for (const linkId of this.linkIds) {
      const link = links.get(linkId)
      if (link) link[linkProperty]--
      else console.warn("decrementSlots: link ID not found", linkId)
    }
  }

  /**
   * Measures the width required to render this slot's label and connection circle.
   * @returns `[width, height]` in canvas units.
   */
  measure(): ReadOnlySize {
    const width = LGraphCanvas._measureText?.(this.displayName) ?? 0

    const { defaultHeight } = SubgraphSlot
    this.measurement.setValues(width + defaultHeight, defaultHeight)
    return this.measurement.toSize()
  }

  /**
   * Positions this slot within its parent IO node's vertical layout.
   * @param rect Layout rectangle assigned by {@link SubgraphIONodeBase.arrange}.
   */
  abstract arrange(rect: ReadOnlyRect): void

  /**
   * Creates a connection from or to this slot, depending on the concrete subclass.
   * @param slot The node slot on the other end of the connection.
   * @param node The node that owns {@link slot}.
   * @param afterRerouteId Optional reroute parent when the link passes through reroutes.
   */
  abstract connect(
    slot: INodeInputSlot | INodeOutputSlot,
    node: LGraphNode,
    afterRerouteId?: RerouteId,
  ): LLink | undefined

  /**
   * Disconnects all links connected to this slot.
   */
  disconnect(): void {
    const { subgraph } = this.parent

    for (const linkId of this.linkIds) {
      subgraph.removeLink(linkId)
    }

    this.linkIds.length = 0
  }

  /**
   * Checks if this slot is a valid target for a connection from the given slot.
   * @param fromSlot The slot that is being dragged to connect to this slot.
   * @returns true if the connection is valid, false otherwise.
   */
  abstract isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean

  /**
   * Renders the slot circle and label on the subgraph canvas.
   *
   * Dims invalid drop targets while a link is being dragged. Leaves the canvas context dirty.
   * @param options Drawing context, colours, and drag-state options.
   * @remarks Leaves the context dirty.
   */
  draw({ ctx, colorContext, lowQuality, fromSlot, editorAlpha = 1 }: SubgraphSlotDrawOptions): void {
    // Assertion: SlotShape is a subset of RenderShape
    const shape = this.shape as unknown as SlotShape
    const { isPointerOver, pos: [x, y] } = this

    // Check if this slot is a valid target for the current dragging connection
    const isValidTarget = fromSlot ? this.isValidTarget(fromSlot) : true
    const isValid = !fromSlot || isValidTarget

    // Only highlight if the slot is valid AND mouse is over it
    const highlight = isValid && isPointerOver

    // Save current alpha
    const previousAlpha = ctx.globalAlpha

    // Set opacity based on validity when dragging a connection
    ctx.globalAlpha = isValid ? editorAlpha : 0.4 * editorAlpha

    ctx.beginPath()

    // Default rendering for circle, hollow circle.
    const color = this.renderingColor(colorContext)
    if (lowQuality) {
      ctx.fillStyle = color

      ctx.rect(x - 4, y - 4, 8, 8)
      ctx.fill()
    } else if (shape === SlotShape.HollowCircle) {
      ctx.lineWidth = 3
      ctx.strokeStyle = color

      const radius = highlight ? 4 : 3
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      // Normal circle
      ctx.fillStyle = color

      const radius = highlight ? 5 : 4
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw label with current opacity
    if (this.displayName) {
      const [labelX, labelY] = this.labelPos
      // Also apply highlight logic to text color
      ctx.fillStyle = highlight ? "white" : (LiteGraph.NODE_TEXT_COLOR || "#AAA")
      ctx.fillText(this.displayName, labelX, labelY)
    }

    // Restore alpha
    ctx.globalAlpha = previousAlpha
  }

  /**
   * Serialises this slot for persistence inside {@link ExportedSubgraph}.
   * @returns A {@link SubgraphIO} plain object including link IDs and styling.
   */
  asSerialisable(): SubgraphIO {
    const { id, name, type, linkIds, localized_name, label, dir, shape, color_off, color_on, pos } = this
    return { id, name, type, linkIds, localized_name, label, dir, shape, color_off, color_on, pos }
  }
}
