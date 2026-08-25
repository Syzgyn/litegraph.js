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
  isInRectangle,
  isPointInRect,
  snapPoint,
} from "./measure"

/** Optional flags stored on {@link LGraphGroup.flags}. */
export interface IGraphGroupFlags extends Record<string, unknown> {
  /** When present, the group cannot be moved or resized by mouse interaction. */
  pinned?: true
}

/**
 * A visual grouping frame on the graph canvas that organises nodes, reroutes, and nested groups.
 *
 * Groups are {@link Positionable} items managed by {@link LGraph}. They render a titled rectangle
 * with a resize handle and can automatically track child items whose centres fall inside their bounds
 * via {@link recomputeInsideNodes}.
 * @see {@link LGraph.add}
 * @see {@link LGraphGroup.recomputeInsideNodes}
 */
export class LGraphGroup implements Positionable, IPinnable, IColorable {
  /** Minimum group width in graph units. Enforced by the {@link size} setter and {@link resize}. */
  static minWidth = 140
  /** Minimum group height in graph units. Enforced by the {@link size} setter and {@link resize}. */
  static minHeight = 80
  /** Length of the resize handle triangle drawn in the bottom-right corner. */
  static resizeLength = 10
  /** Padding used when drawing the title text inside the title bar. */
  static padding = 4
  /** Fallback fill/stroke colour when {@link color} is unset. */
  static defaultColour = "#335"
  /**
   * Background luminance (0-255) below which the title text is lightened for
   * readability. Most colours keep title text in the same family as the
   * background even at low contrast; only very dark/black-ish backgrounds
   * are adjusted.
   */
  static darkBgLuminanceThreshold = 80

  /** Unique identifier within the owning {@link LGraph}. Assigned on {@link LGraph.add} if unset. */
  id: number
  /** CSS colour string for the group background and title bar. */
  color?: string
  /** Label shown in the group title bar. */
  title: string
  /** @deprecated Unused; title rendering uses {@link LiteGraph.GROUP_FONT}. */
  font?: string
  /** Font size in pixels for the title bar text. */
  font_size: number = LiteGraph.GROUP_TEXT_SIZE
  _bounding: Float32Array = new Float32Array([
    10,
    10,
    LGraphGroup.minWidth,
    LGraphGroup.minHeight,
  ])

  _pos: Point = this._bounding.subarray(0, 2)
  _size: Size = this._bounding.subarray(2, 4)
  /** @deprecated See {@link _children} */
  _nodes: LGraphNode[] = []
  /** Nodes, reroutes, and nested groups whose bounds are contained by this group. */
  _children: Set<Positionable> = new Set()
  /** The {@link LGraph} that owns this group, set by {@link LGraph.add}. */
  graph?: LGraph
  /** Persistent flags such as {@link IGraphGroupFlags.pinned pinned}. */
  flags: IGraphGroupFlags = {}
  /** Whether the group is currently selected on the canvas. */
  selected?: boolean

  /** Background colour last used to compute {@link _titleTextColor} */
  _lastTitleBgColor?: string
  /** Title text colour, cached until the background colour changes */
  _titleTextColor: string = LGraphGroup.defaultColour

  /**
   * @param title Initial title bar label. Defaults to `"Group"`.
   * @param id Optional ID; if omitted, {@link LGraph.add} assigns one from {@link LGraph.state}.
   */
  constructor(title?: string, id?: number) {
    // TODO: Object instantiation pattern requires too much boilerplate and null checking.  ID should be passed in via constructor.
    this.id = id ?? -1
    this.title = title || "Group"

    const { pale_blue } = LGraphCanvas.node_colors
    this.color = pale_blue ? pale_blue.groupcolor : "#AAA"
  }

  /** @inheritdoc {@link IColorable.setColorOption} */
  setColorOption(colorOption: ColorOption | null): void {
    if (colorOption == null) {
      delete this.color
    } else {
      this.color = colorOption.groupcolor
    }
  }

  /** @inheritdoc {@link IColorable.getColorOption} */
  getColorOption(): ColorOption | null {
    return Object.values(LGraphCanvas.node_colors).find(
      colorOption => colorOption.groupcolor === this.color,
    ) ?? null
  }

  /** Position of the group, as x,y co-ordinates in graph space */
  get pos() {
    return this._pos
  }

  set pos(v) {
    if (!v || v.length < 2) return

    this._pos[0] = v[0]
    this._pos[1] = v[1]
  }

  /** Size of the group, as width,height in graph units */
  get size() {
    return this._size
  }

  set size(v) {
    if (!v || v.length < 2) return

    this._size[0] = Math.max(LGraphGroup.minWidth, v[0])
    this._size[1] = Math.max(LGraphGroup.minHeight, v[1])
  }

  get boundingRect() {
    return this._bounding
  }

  /** @deprecated Prefer {@link children}. Nodes whose centre lies inside this group. */
  get nodes() {
    return this._nodes
  }

  /** Height of the title bar area in graph units, derived from {@link font_size}. */
  get titleHeight() {
    return this.font_size * 1.4
  }

  /** All positionable items tracked as children of this group. */
  get children(): ReadonlySet<Positionable> {
    return this._children
  }

  /** Whether {@link IGraphGroupFlags.pinned} is set on {@link flags}. */
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

  /** Clears the pinned flag via {@link pin}. */
  unpin(): void {
    this.pin(false)
  }

  /**
   * Restores group state from serialised data.
   * @param o Deserialised group object, typically from {@link LGraph.configure}.
   */
  configure(o: ISerialisedGroup): void {
    this.id = o.id
    this.title = o.title
    this._bounding.set(o.bounding)
    this.color = o.color
    this.flags = o.flags || this.flags
    if (o.font_size) this.font_size = o.font_size
  }

  /**
   * Serialises this group for persistence or cloning.
   * @returns A plain object suitable for {@link JSON.stringify} or {@link LGraph.configure}.
   */
  serialize(): ISerialisedGroup {
    const b = this._bounding
    return {
      id: this.id,
      title: this.title,
      bounding: [...b],
      color: this.color,
      font_size: this.font_size,
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
    const font_size = LiteGraph.GROUP_TEXT_SIZE

    const [x, y] = this._pos
    const [width, height] = this._size
    const color = this.color || defaultColour

    if (this._lastTitleBgColor !== color) {
      this._lastTitleBgColor = color
      this._titleTextColor =
        luminance(hexToRgb(color)) < darkBgLuminanceThreshold
          ? readableTextColor(color)
          : color
    }

    // Titlebar
    ctx.globalAlpha = 0.25 * graphCanvas.editor_alpha
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, width, font_size * 1.4)
    ctx.fill()

    // Group background, border
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, width, height)
    ctx.fill()
    ctx.globalAlpha = graphCanvas.editor_alpha
    ctx.stroke()

    // Resize marker
    ctx.beginPath()
    ctx.moveTo(x + width, y + height)
    ctx.lineTo(x + width - resizeLength, y + height)
    ctx.lineTo(x + width, y + height - resizeLength)
    ctx.fill()

    // Title
    ctx.font = `${font_size}px ${LiteGraph.GROUP_FONT}`
    ctx.textAlign = "left"
    if (ctx.fillStyle !== this._titleTextColor)
      ctx.fillStyle = this._titleTextColor
    ctx.fillText(this.title + (this.pinned ? "📌" : ""), x + padding, y + font_size)

    if (LiteGraph.highlight_selected_group && this.selected) {
      strokeShape(ctx, this._bounding, {
        title_height: this.titleHeight,
        padding,
      })
    }
  }

  /**
   * Resizes the group, clamping to {@link minWidth} and {@link minHeight}.
   * @param width New width in graph units.
   * @param height New height in graph units.
   * @returns `false` if the group is {@link pinned}, otherwise `true`.
   */
  resize(width: number, height: number): boolean {
    if (this.pinned) return false

    this._size[0] = Math.max(LGraphGroup.minWidth, width)
    this._size[1] = Math.max(LGraphGroup.minHeight, height)
    return true
  }

  /**
   * Translates the group and, by default, all {@link children}.
   * @param deltaX Horizontal offset in graph units.
   * @param deltaY Vertical offset in graph units.
   * @param skipChildren When `true`, only the group frame moves; child items stay put.
   */
  move(deltaX: number, deltaY: number, skipChildren: boolean = false): void {
    if (this.pinned) return

    this._pos[0] += deltaX
    this._pos[1] += deltaY
    if (skipChildren === true) return

    for (const item of this._children) {
      item.move(deltaX, deltaY)
    }
  }

  /** @inheritdoc */
  snapToGrid(snapTo: number): boolean {
    return this.pinned ? false : snapPoint(this.pos, snapTo)
  }

  /**
   * Rebuilds {@link _children} and {@link _nodes} from the current graph contents.
   *
   * A node is included when its bounding centre lies inside this group. Reroutes are included
   * when their position is inside the group bounds. Nested groups are included when wholly
   * contained. Also reorders the graph's group list so parent groups render above children.
   * @throws {@link NullGraphError} if {@link graph} is unset.
   */
  recomputeInsideNodes(): void {
    if (!this.graph) throw new NullGraphError()
    const { nodes, reroutes, groups } = this.graph
    const children = this._children
    this._nodes.length = 0
    children.clear()

    // Move nodes we overlap the centre point of
    for (const node of nodes) {
      if (containsCentre(this._bounding, node.boundingRect)) {
        this._nodes.push(node)
        children.add(node)
      }
    }

    // Move reroutes we overlap the centre point of
    for (const reroute of reroutes.values()) {
      if (isPointInRect(reroute.pos, this._bounding))
        children.add(reroute)
    }

    // Move groups we wholly contain
    for (const group of groups) {
      if (containsRect(this._bounding, group._bounding))
        children.add(group)
    }

    groups.sort((a, b) => {
      if (a === this) {
        return children.has(b) ? -1 : 0
      } else if (b === this) {
        return children.has(a) ? 1 : 0
      } else {
        return 0
      }
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
  }

  /**
   * Expands the group to include additional nodes.
   *
   * Combines existing {@link children}, legacy {@link _nodes}, and the provided nodes, then
   * calls {@link resizeTo}.
   * @param nodes Nodes to include in the new bounds.
   * @param padding Extra margin passed to {@link resizeTo}. Default: `10`.
   */
  addNodes(nodes: LGraphNode[], padding: number = 10): void {
    if (!this._nodes && nodes.length === 0) return
    this.resizeTo([...this.children, ...this._nodes, ...nodes], padding)
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
        has_submenu: true,
        callback: LGraphCanvas.onMenuNodeColors,
      },
      {
        content: "Font size",
        property: "font_size",
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

  /** @inheritdoc Positionable.isPointInside — delegated to {@link LGraphNode.prototype.isPointInside}. */
  isPointInside = LGraphNode.prototype.isPointInside
  /** @inheritdoc — requests a canvas redraw via the owning graph's canvases. */
  setDirtyCanvas = LGraphNode.prototype.setDirtyCanvas
}
