import type {
  ColorOption,
  IColorable,
  IContextMenuValue,
  IPinnable,
  Point,
  Positionable,
  Size,
} from "./interfaces"
import type { LGraph } from "./LGraph"
import type { ISerialisedGroup } from "./types/serialisation"

import { NullGraphError } from "@/infrastructure/NullGraphError"
import { hexToRgb, luminance, readableTextColor } from "@/utils/colorUtil"

import { strokeShape } from "./draw"
import { LGraphCanvas } from "./LGraphCanvas"
import { LGraphNode } from "./LGraphNode"
import { LiteGraph } from "./litegraph"
import {
  containsCentre,
  containsRect,
  createBounds,
  expandRectToGrid,
  isInRectangle,
  isPointInRect,
  snapPoint,
} from "./measure"

/** Optional flags stored on `LGraphGroup.flags`. */
export interface IGraphGroupFlags extends Record<string, unknown> {
  /** When present, the group cannot be moved or resized by mouse interaction. */
  pinned?: true
}

/**
 * A visual grouping frame on the graph canvas that organises nodes, reroutes, and nested groups.
 *
 * Groups are `Positionable` items managed by `LGraph`. They render a titled rectangle
 * with a resize handle and can automatically track child items whose centres fall inside their bounds
 * via `recomputeInsideNodes`.
 * @see `LGraph.add`
 * @see `LGraphGroup.recomputeInsideNodes`
 */
export class LGraphGroup implements Positionable, IPinnable, IColorable {
  /** Minimum group width in graph units. Enforced by the `size` setter and `resize`. */
  static minWidth = 140
  /** Minimum group height in graph units. Enforced by the `size` setter and `resize`. */
  static minHeight = 80
  /** Length of the resize handle triangle drawn in the bottom-right corner. */
  static resizeLength = 10
  /** Padding used when drawing the title text inside the title bar. */
  static padding = 4
  /** Fallback fill/stroke colour when `color` is unset. */
  static defaultColour = "#335"
  /**
   * Background luminance (0-255) below which the title text is lightened for
   * readability. Most colours keep title text in the same family as the
   * background even at low contrast; only very dark/black-ish backgrounds
   * are adjusted.
   */
  static darkBgLuminanceThreshold = 80

  /** Background colour last used to compute `titleTextColor` */
  #lastTitleBgColor?: string
  /** Title text colour, cached until the background colour changes */
  #titleTextColor: string = LGraphGroup.defaultColour
  #bounding: Float32Array = new Float32Array([
    10,
    10,
    LGraphGroup.minWidth,
    LGraphGroup.minHeight,
  ])

  #posStore: Point = this.#bounding.subarray(0, 2)
  #sizeStore: Size = this.#bounding.subarray(2, 4)
  /** Nodes, reroutes, and nested groups whose bounds are contained by this group. */
  #childrenStore: Set<Positionable> = new Set()

  /** Unique identifier within the owning `LGraph`. Assigned on `LGraph.add` if unset. */
  id: number
  /** CSS colour string for the group background and title bar. */
  color?: string
  /** Label shown in the group title bar. */
  title: string
  /** @deprecated Unused; title rendering uses `LiteGraph.GROUP_FONT`. */
  font?: string
  /** Font size in pixels for the title bar text. */
  fontSize: number = LiteGraph.GROUP_TEXT_SIZE

  /** The `LGraph` that owns this group, set by `LGraph.add`. */
  graph?: LGraph
  /** Persistent flags such as the `pinned` flag on `flags`. */
  flags: IGraphGroupFlags = {}
  /** Whether the group is currently selected on the canvas. */
  selected?: boolean

  /** @inheritdoc — delegated to `LGraphNode.prototype.isPointInside`. */
  isPointInside = LGraphNode.prototype.isPointInside
  /** @inheritdoc — requests a canvas redraw via the owning graph's canvases. */
  setDirtyCanvas = LGraphNode.prototype.setDirtyCanvas

  /**
   * @param title Initial title bar label. Defaults to `"Group"`.
   * @param id Optional ID; if omitted, `LGraph.add` assigns one from `LGraph.state`.
   */
  constructor(title?: string, id?: number) {
    // TODO: Object instantiation pattern requires too much boilerplate and null checking.  ID should be passed in via constructor.
    this.id = id ?? -1
    this.title = title || "Group"

    const { paleBlue } = LGraphCanvas.nodeColors
    this.color = paleBlue ? paleBlue.groupColor : "#AAA"
  }

  /** @inheritdoc */
  setColorOption(colorOption: ColorOption | null): void {
    if (colorOption == null) {
      delete this.color
    } else {
      this.color = colorOption.groupColor
    }
  }

  /** @inheritdoc */
  getColorOption(): ColorOption | null {
    return Object.values(LGraphCanvas.nodeColors).find(
      colorOption => colorOption.groupColor === this.color,
    ) ?? null
  }

  /** Position of the group, as x,y co-ordinates in graph space */
  get pos() {
    return this.#posStore
  }

  set pos(v) {
    if (!v || v.length < 2) return

    this.#posStore[0] = v[0]
    this.#posStore[1] = v[1]
  }

  /** Size of the group, as width,height in graph units */
  get size() {
    return this.#sizeStore
  }

  set size(v) {
    if (!v || v.length < 2) return

    this.#sizeStore[0] = Math.max(LGraphGroup.minWidth, v[0])
    this.#sizeStore[1] = Math.max(LGraphGroup.minHeight, v[1])
  }

  get boundingRect() {
    return this.#bounding
  }

  /** Height of the title bar area in graph units. */
  get titleHeight() {
    return LiteGraph.NODE_TITLE_HEIGHT
  }

  /** All positionable items tracked as children of this group. */
  get children(): ReadonlySet<Positionable> {
    return this.#childrenStore
  }

  /** Whether the `pinned` flag is set on `flags`. */
  get pinned() {
    return !!this.flags.pinned
  }

  /**
   * Prevents the group being accidentally moved or resized by mouse interaction.
   * Toggles pinned state if no value is provided.
   * @param value Explicit pin state; omit to toggle.
   */
  pin(value?: boolean): void {
    const newState = value === undefined ? !this.pinned : value

    if (newState) this.flags.pinned = true
    else delete this.flags.pinned
  }

  /** Clears the pinned flag via `pin`. */
  unpin(): void {
    this.pin(false)
  }

  /**
   * Restores group state from serialised data.
   * @param o Deserialised group object, typically from `LGraph.configure`.
   */
  configure(o: ISerialisedGroup): void {
    this.id = o.id
    this.title = o.title
    this.#bounding.set(o.bounding)
    this.color = o.color
    this.flags = o.flags || this.flags
  }

  /**
   * Serialises this group for persistence or cloning.
   * @returns A plain object suitable for `JSON.stringify` or `LGraph.configure`.
   */
  serialize(): ISerialisedGroup {
    const b = this.#bounding
    return {
      id: this.id,
      title: this.title,
      bounding: [...b],
      color: this.color,
      flags: this.flags,
    }
  }

  /**
   * Draws the group on the canvas.
   *
   * Renders the title bar, background, border, resize marker, and optional selection highlight.
   * @param graphCanvas Canvas providing editor alpha and selection styling.
   * @param ctx 2D rendering context in graph space.
   */
  draw(graphCanvas: LGraphCanvas, ctx: CanvasRenderingContext2D): void {
    const { padding, resizeLength, defaultColour, darkBgLuminanceThreshold } =
      LGraphGroup
    const fontSize = LiteGraph.GROUP_TEXT_SIZE

    const [x, y] = this.#posStore
    const [width, height] = this.#sizeStore
    const color = this.color || defaultColour

    if (this.#lastTitleBgColor !== color) {
      this.#lastTitleBgColor = color
      this.#titleTextColor =
        luminance(hexToRgb(color)) < darkBgLuminanceThreshold
          ? readableTextColor(color)
          : color
    }

    // Titlebar
    ctx.globalAlpha = 0.25 * graphCanvas.editorAlpha
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, width, LiteGraph.NODE_TITLE_HEIGHT)
    ctx.fill()

    // Group background, border
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, width, height)
    ctx.fill()
    ctx.globalAlpha = graphCanvas.editorAlpha
    ctx.stroke()

    // Resize marker
    ctx.beginPath()
    ctx.moveTo(x + width, y + height)
    ctx.lineTo(x + width - resizeLength, y + height)
    ctx.lineTo(x + width, y + height - resizeLength)
    ctx.fill()

    // Title
    ctx.font = `${fontSize}px ${LiteGraph.GROUP_FONT}`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    if (ctx.fillStyle !== this.#titleTextColor)
      ctx.fillStyle = this.#titleTextColor
    ctx.fillText(
      this.title + (this.pinned ? "📌" : ""),
      x + fontSize / 2,
      y + LiteGraph.NODE_TITLE_HEIGHT / 2 + 1,
    )
    ctx.textBaseline = "alphabetic"

    if (LiteGraph.highlightSelectedGroup && this.selected) {
      strokeShape(ctx, this.#bounding, {
        titleHeight: this.titleHeight,
        padding,
      })
    }
  }

  /**
   * Resizes the group, clamping to `minWidth` and `minHeight`.
   * @param width New width in graph units.
   * @param height New height in graph units.
   * @returns `false` if the group is `pinned`, otherwise `true`.
   */
  resize(width: number, height: number): boolean {
    if (this.pinned) return false

    this.#sizeStore[0] = Math.max(LGraphGroup.minWidth, width)
    this.#sizeStore[1] = Math.max(LGraphGroup.minHeight, height)
    return true
  }

  /**
   * Translates the group and, by default, all `children`.
   * @param deltaX Horizontal offset in graph units.
   * @param deltaY Vertical offset in graph units.
   * @param skipChildren When `true`, only the group frame moves; child items stay put.
   */
  move(deltaX: number, deltaY: number, skipChildren: boolean = false): void {
    if (this.pinned) return

    this.#posStore[0] += deltaX
    this.#posStore[1] += deltaY
    if (skipChildren === true) return

    for (const item of this.#childrenStore) {
      item.move(deltaX, deltaY)
    }
  }

  /** @inheritdoc */
  snapToGrid(snapTo: number): boolean {
    return this.pinned ? false : snapPoint(this.pos, snapTo)
  }

  /**
   * Rebuilds `childrenStore` from the current graph contents.
   *
   * A node is included when its bounding centre lies inside this group. Reroutes are included
   * when their position is inside the group bounds. Nested groups are included when wholly
   * contained. Also reorders the graph's group list so parent groups render above children.
   * @throws `NullGraphError` if `graph` is unset.
   */
  recomputeInsideNodes(
    maxDepth: number = 100,
    visited: Set<number> = new Set(),
  ): void {
    if (!this.graph) throw new NullGraphError()
    if (maxDepth <= 0 || visited.has(this.id)) return

    visited.add(this.id)

    const { nodes, reroutes, groups } = this.graph
    const children = this.#childrenStore
    children.clear()

    // Move nodes we overlap the centre point of
    for (const node of nodes) {
      if (containsCentre(this.#bounding, node.boundingRect)) {
        children.add(node)
      }
    }

    // Move reroutes we overlap the centre point of
    for (const reroute of reroutes.values()) {
      if (isPointInRect(reroute.pos, this.#bounding))
        children.add(reroute)
    }

    // Move groups we wholly contain
    const containedGroups: LGraphGroup[] = []
    for (const group of groups) {
      if (group !== this && containsRect(this.#bounding, group.#bounding)) {
        children.add(group)
        containedGroups.push(group)
      }
    }
    for (const group of containedGroups)
      group.recomputeInsideNodes(maxDepth - 1, visited)

    groups.sort((a, b) => {
      if (a === this) {
        return children.has(b) ? -1 : 0
      }
      if (b === this) {
        return children.has(a) ? 1 : 0
      }
      return 0
    })
  }

  /**
   * Resizes and moves the group to neatly fit all given positionables.
   * @param objects All objects that should be inside the group.
   * @param padding Extra margin in graph units on all sides. Default: `10`.
   */
  resizeTo(objects: Iterable<Positionable>, padding: number = 10): void {
    const boundingBox = createBounds(objects, padding)
    if (boundingBox === null) return

    this.pos[0] = boundingBox[0]
    this.pos[1] = boundingBox[1] - this.titleHeight
    this.size[0] = boundingBox[2]
    this.size[1] = boundingBox[3] + this.titleHeight

    const snapTo = LiteGraph.alwaysSnapToGrid
      ? this.graph?.getSnapToGridSize()
      : undefined
    if (snapTo) expandRectToGrid(this.#bounding, snapTo)
  }

  /**
   * Expands the group to include additional nodes.
   *
   * Combines existing `children` and the provided nodes, then
   * calls `resizeTo`.
   * @param nodes Nodes to include in the new bounds.
   * @param padding Extra margin passed to `resizeTo`. Default: `10`.
   */
  addNodes(nodes: LGraphNode[], padding: number = 10): void {
    if (this.children.size === 0 && nodes.length === 0) return
    this.resizeTo([...this.children, ...nodes], padding)
  }

  /**
   * Default right-click context menu entries for this group.
   * @returns Menu items for pin/unpin, title, colour, font size, and removal actions.
   */
  getMenuOptions(): (IContextMenuValue<string> | IContextMenuValue<string | null> | null)[] {
    return [
      {
        content: this.pinned ? "Unpin" : "Pin",
        callback: () => {
          if (this.pinned) this.unpin()
          else this.pin()
          this.setDirtyCanvas(false, true)
        },
      },
      null,
      { content: "Title", callback: LGraphCanvas.onShowPropertyEditor },
      {
        content: "Color",
        hasSubmenu: true,
        callback: LGraphCanvas.onMenuNodeColors,
      },
      {
        content: "Font size",
        property: "fontSize",
        type: "Number",
        callback: LGraphCanvas.onShowPropertyEditor,
      },
      null,
      { content: "Remove", callback: LGraphCanvas.onMenuNodeRemove },
    ]
  }

  /**
   * Hit-tests the title bar region.
   * @param x X coordinate in graph space.
   * @param y Y coordinate in graph space.
   * @returns `true` if the point lies within the title bar rectangle.
   */
  isPointInTitlebar(x: number, y: number): boolean {
    const b = this.boundingRect
    return isInRectangle(x, y, b[0], b[1], b[2], this.titleHeight)
  }

  /**
   * Hit-tests the bottom-right resize handle triangle.
   * @param x X coordinate in graph space.
   * @param y Y coordinate in graph space.
   * @returns `true` if the point is over the resize affordance.
   */
  isInResize(x: number, y: number): boolean {
    const b = this.boundingRect
    const right = b[0] + b[2]
    const bottom = b[1] + b[3]

    return (
      x < right &&
      y < bottom &&
      x - right + (y - bottom) > -LGraphGroup.resizeLength
    )
  }
}
