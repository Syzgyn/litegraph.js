import type { EmptySubgraphInput } from "./EmptySubgraphInput"
import type { EmptySubgraphOutput } from "./EmptySubgraphOutput"
import type { Subgraph } from "./Subgraph"
import type { SubgraphInput } from "./SubgraphInput"
import type { SubgraphOutput } from "./SubgraphOutput"
import type { LinkConnector } from "@/canvas/LinkConnector"
import type { DefaultConnectionColors, Hoverable, INodeInputSlot, INodeOutputSlot, Point, Positionable } from "@/interfaces"
import type { NodeId } from "@/LGraphNode"
import type { ExportedSubgraphIONode, Serialisable } from "@/types/serialisation"

import { Rectangle } from "@/infrastructure/Rectangle"
import { type CanvasColour, type CanvasPointer, type CanvasPointerEvent, type IContextMenuValue, LiteGraph } from "@/litegraph"
import { snapPoint } from "@/measure"
import { CanvasItem } from "@/types/globalEnums"

/**
 * Abstract base for the fixed input and output boundary nodes rendered on a subgraph canvas.
 *
 * Provides shared layout, hit-testing, context menus, serialisation, and slot arrangement for
 * `SubgraphInputNode` and `SubgraphOutputNode`. Subclasses supply side-specific
 * drawing, slot lists, and link-drag behaviour.
 * @template TSlot Concrete slot type (`SubgraphInput` or `SubgraphOutput`).
 * @see `SubgraphInputNode`
 * @see `SubgraphOutputNode`
 */
export abstract class SubgraphIONodeBase<TSlot extends SubgraphInput | SubgraphOutput> implements Positionable, Hoverable, Serialisable<ExportedSubgraphIONode> {
  /** Padding between the IO panel edge and its slots. */
  static margin = 10
  /** Minimum width of the IO panel before slot labels are measured. */
  static minWidth = 100
  /** Corner radius for the rounded side of the IO panel. */
  static roundedRadius = 14 // Matches NODE_SLOT_HEIGHT * 0.7 for slot alignment

  readonly #boundingRect: Rectangle = new Rectangle()

  /** Sentinel node ID used in links referencing this boundary node. */
  abstract readonly id: NodeId

  /** Whether this IO node is currently selected in the editor. */
  selected: boolean = false
  /** When `true`, the node cannot be moved by the user. */
  pinned: boolean = false
  /** IO boundary nodes cannot be deleted from the subgraph canvas. */
  readonly removable = false

  /** Whether the pointer is currently over this IO node. */
  isPointerOver: boolean = false

  /** Placeholder slot for creating a new IO slot on first connection. */
  abstract readonly emptySlot: EmptySubgraphInput | EmptySubgraphOutput

  /** Concrete IO slots defined on the subgraph (excludes `emptySlot`). */
  abstract readonly slots: TSlot[]

  /**
   * @param subgraph The subgraph definition that owns this boundary node.
   */
  constructor(
    /** The subgraph that this node belongs to. */
    readonly subgraph: Subgraph,
  ) {}

  /**
   * Gets the context menu options for an IO slot.
   * @param slot The slot to get the context menu options for.
   * @returns The context menu options.
   */
  #getSlotMenuOptions(slot: TSlot): IContextMenuValue[] {
    const options: IContextMenuValue[] = []

    // Disconnect option if slot has connections
    if (slot !== this.emptySlot && slot.linkIds.length > 0) {
      options.push({ content: "Disconnect Links", value: "disconnect" })
    }

    // Remove / rename slot option (except for the empty slot)
    if (slot !== this.emptySlot) {
      options.push(
        { content: "Remove Slot", value: "remove" },
        { content: "Rename Slot", value: "rename" },
      )
    }

    return options
  }

  /**
   * Handles the action for an IO slot context menu.
   * @param selectedItem The item that was selected from the context menu.
   * @param slot The slot
   * @param event The event that triggered the context menu.
   */
  #onSlotMenuAction(selectedItem: IContextMenuValue, slot: TSlot, event: CanvasPointerEvent): void {
    switch (selectedItem.value) {
    // Disconnect all links from this output
      case "disconnect":
        slot.disconnect()
        break

        // Remove the slot
      case "remove":
        if (slot !== this.emptySlot) {
          this.removeSlot(slot)
        }
        break

        // Rename the slot
      case "rename":
        if (slot !== this.emptySlot) {
          this.#promptForSlotRename(slot, event)
        }
        break
    }

    this.subgraph.setDirtyCanvas(true, true)
  }

  /**
   * Prompts the user to rename a slot.
   * @param slot The slot to rename.
   * @param event The event that triggered the rename.
   */
  #promptForSlotRename(slot: TSlot, event: CanvasPointerEvent): void {
    this.subgraph.canvasAction(c => c.prompt(
      "Slot name",
      slot.name,
      (newName: string) => {
        if (newName) this.renameSlot(slot, newName)
      },
      event,
    ))
  }

  /** Top-left corner of this IO node in canvas space. */
  get pos() {
    return this.boundingRect.pos
  }

  set pos(value) {
    this.boundingRect.pos = value
  }

  /** Width and height of this IO node in canvas space. */
  get size() {
    return this.boundingRect.size
  }

  set size(value) {
    this.boundingRect.size = value
  }

  /** Stroke width for the IO panel border; slightly thicker when hovered. */
  protected get sideLineWidth(): number {
    return this.isPointerOver ? 2.5 : 2
  }

  /** Stroke colour for the IO panel border. */
  protected get sideStrokeStyle(): CanvasColour {
    return this.isPointerOver ? "white" : "#efefef"
  }

  /** All slots to render and hit-test, including `emptySlot`. */
  abstract get allSlots(): TSlot[]

  /** Axis-aligned bounds of this IO node in canvas space. */
  get boundingRect(): Rectangle {
    return this.#boundingRect
  }

  /**
   * Translates this IO node by the given delta in canvas space.
   * @param deltaX Horizontal offset.
   * @param deltaY Vertical offset.
   */
  move(deltaX: number, deltaY: number): void {
    this.pos[0] += deltaX
    this.pos[1] += deltaY
  }

  /**
   * Snaps `pos` to the editor grid when this node is not pinned.
   * @param snapTo Grid spacing in canvas units.
   * @returns `true` when the position was adjusted.
   */
  snapToGrid(snapTo: number): boolean {
    return this.pinned ? false : snapPoint(this.pos, snapTo)
  }

  /**
   * Handles pointer down on this IO node. Implemented by subclasses to start link drags or
   * open context menus.
   * @param e The pointer event in canvas coordinates.
   * @param pointer Drag lifecycle callbacks for the active pointer.
   * @param linkConnector Active link connector managing the drag operation.
   */
  abstract onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void

  // #region Hoverable

  /**
   * Tests whether a canvas point lies inside this IO node's bounding rectangle.
   * @param point `[x, y]` in canvas space.
   */
  containsPoint(point: Point): boolean {
    return this.boundingRect.containsPoint(point)
  }

  /**
   * Canvas X coordinate used as the horizontal anchor when stacking slots vertically.
   *
   * Subclasses align slots to the inner edge of their rounded panel.
   */
  abstract get slotAnchorX(): number

  /**
   * Updates hover state for this node and its slots during pointer move.
   * @param e The pointer event in canvas coordinates.
   * @returns Bitmask of `CanvasItem` flags for items under the pointer.
   */
  onPointerMove(e: CanvasPointerEvent): CanvasItem {
    const containsPoint = this.boundingRect.containsXy(e.canvasX, e.canvasY)
    let underPointer = containsPoint ? CanvasItem.SubgraphIoNode : CanvasItem.Nothing

    if (containsPoint) {
      if (!this.isPointerOver) this.onPointerEnter()

      for (const slot of this.allSlots) {
        slot.onPointerMove(e)
        if (slot.isPointerOver) underPointer |= CanvasItem.SubgraphIoSlot
      }
    } else if (this.isPointerOver) {
      this.onPointerLeave()
    }
    return underPointer
  }

  /** Marks this IO node as hovered and updates visual state. */
  onPointerEnter() {
    this.isPointerOver = true
  }

  /** Clears hover state on this node and all of its slots. */
  onPointerLeave() {
    this.isPointerOver = false

    for (const slot of this.slots) {
      slot.isPointerOver = false
    }
  }

  // #endregion Hoverable

  /**
   * Renames an IO slot in the subgraph.
   * @param slot The slot to rename.
   * @param name The new name for the slot.
   */
  abstract renameSlot(slot: TSlot, name: string): void

  /**
   * Removes an IO slot from the subgraph.
   * @param slot The slot to remove.
   */
  abstract removeSlot(slot: TSlot): void

  /**
   * Gets the slot at a given position in canvas space.
   * @param x The x coordinate of the position.
   * @param y The y coordinate of the position.
   * @returns The slot at the given position, otherwise `undefined`.
   */
  getSlotInPosition(x: number, y: number): TSlot | undefined {
    for (const slot of this.allSlots) {
      if (slot.boundingRect.containsXy(x, y)) {
        return slot
      }
    }
  }

  /**
   * Handles double-click on an IO slot to rename it.
   * @param slot The slot that was double-clicked.
   * @param event The event that triggered the double-click.
   */
  protected handleSlotDoubleClick(
    slot: TSlot,
    event: CanvasPointerEvent,
  ): void {
    // Only allow renaming non-empty slots
    if (slot !== this.emptySlot) {
      this.#promptForSlotRename(slot, event)
    }
  }

  /**
   * Shows the context menu for an IO slot.
   * @param slot The slot to show the context menu for.
   * @param event The event that triggered the context menu.
   */
  protected showSlotContextMenu(slot: TSlot, event: CanvasPointerEvent): void {
    const options: IContextMenuValue[] = this.#getSlotMenuOptions(slot)
    if (options.length <= 0) return

    new LiteGraph.ContextMenu(
      options,
      {
        event,
        title: slot.name || "Subgraph Output",
        callback: (item: IContextMenuValue) => {
          this.#onSlotMenuAction(item, slot, event)
        },
      },
    )
  }

  /** Lays out all slots vertically and resizes the IO panel to fit. */
  arrange(): void {
    const { minWidth, roundedRadius } = SubgraphIONodeBase
    const [, y] = this.boundingRect
    const x = this.slotAnchorX
    const { size } = this

    let maxWidth = minWidth
    let currentY = y + roundedRadius

    for (const slot of this.allSlots) {
      const [slotWidth, slotHeight] = slot.measure()
      slot.arrange([x, currentY, slotWidth, slotHeight])

      currentY += slotHeight
      if (slotWidth > maxWidth) maxWidth = slotWidth
    }

    size[0] = maxWidth + 2 * roundedRadius
    size[1] = currentY - y + roundedRadius
  }

  /**
   * Draws this IO node and restores any canvas context state changed during drawing.
   * @param ctx The canvas rendering context.
   * @param colorContext Connection colour palette for slot rendering.
   * @param fromSlot When dragging, the slot being dragged.
   * @param editorAlpha Opacity multiplier for editor overlays.
   */
  draw(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void {
    const { lineWidth, strokeStyle, fillStyle, font, textBaseline } = ctx
    this.drawProtected(ctx, colorContext, fromSlot, editorAlpha)
    Object.assign(ctx, { lineWidth, strokeStyle, fillStyle, font, textBaseline })
  }

  /** @internal Leaves `ctx` dirty. */
  protected abstract drawProtected(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void

  /** @internal Leaves `ctx` dirty. */
  protected drawSlots(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void {
    ctx.fillStyle = "#AAA"
    ctx.font = "12px Inter, sans-serif"
    ctx.textBaseline = "middle"

    for (const slot of this.allSlots) {
      slot.draw({ ctx, colorContext, fromSlot, editorAlpha })
    }
  }

  /**
   * Restores layout and pin state from serialised data.
   * @param data Serialised IO node bounds and pin flag.
   */
  configure(data: ExportedSubgraphIONode): void {
    this.#boundingRect.set(data.bounding)
    this.pinned = data.pinned ?? false
  }

  /**
   * Serialises this IO node's position, size, and pin state.
   * @returns Data suitable for `ExportedSubgraphIONode`.
   */
  asSerialisable(): ExportedSubgraphIONode {
    return {
      id: this.id,
      bounding: this.boundingRect.export(),
      pinned: this.pinned ? true : undefined,
    }
  }
}
