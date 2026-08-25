import type { CanvasColour, DefaultConnectionColors, INodeInputSlot, INodeOutputSlot, INodeSlot, ISubgraphInput, OptionalProps, Point, ReadOnlyPoint } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"

import { LabelPosition, SlotShape, SlotType } from "@/draw"
import { LiteGraph, Rectangle } from "@/litegraph"
import { getCentre } from "@/measure"
import { LinkDirection, RenderShape } from "@/types/globalEnums"

import { NodeInputSlot } from "./NodeInputSlot"
import { SlotBase } from "./SlotBase"

/** Options passed to {@link NodeSlot.draw} and its subclasses when rendering a slot on the canvas. */
export interface IDrawOptions {
  /** Theme colours used to resolve slot fill colours when custom colours are not set. */
  colorContext: DefaultConnectionColors
  /** Which side of the slot shape the label text is drawn on. */
  labelPosition?: LabelPosition
  /** When `true`, renders a simplified slot shape for performance during zoomed-out views. */
  lowQuality?: boolean
  /** When `true`, strokes the slot shape outline after filling. */
  doStroke?: boolean
  /** When `true`, uses the highlight colour for the slot label. */
  highlight?: boolean
}

/**
 * Shared abstract base class for {@link LGraphNode} input and output slots.
 *
 * Extends {@link SlotBase} with node ownership, layout helpers, connection validation,
 * and full canvas rendering (expanded and collapsed states).
 * @see {@link NodeInputSlot}
 * @see {@link NodeOutputSlot}
 */
export abstract class NodeSlot extends SlotBase implements INodeSlot {
  /** Canvas-space centre point of this slot, set during node layout. */
  pos?: Point

  /** The offset from the parent node to the centre point of this slot. */
  get #centreOffset(): ReadOnlyPoint {
    const nodePos = this.node.pos
    const { boundingRect } = this

    // Use height; widget input slots may be thinner.
    const diameter = boundingRect[3]

    return getCentre([
      boundingRect[0] - nodePos[0],
      boundingRect[1] - nodePos[1],
      diameter,
      diameter,
    ])
  }

  /**
   * Canvas-space centre point of this slot when the parent node is in collapsed mode.
   *
   * Subclasses position inputs on the left and outputs on the right of the title bar.
   */
  abstract get collapsedPos(): ReadOnlyPoint

  #node: LGraphNode

  /** The {@link LGraphNode} that owns this slot. */
  get node(): LGraphNode {
    return this.#node
  }

  /** Colour used for the slot label when {@link IDrawOptions.highlight} is `true`. */
  get highlightColor(): CanvasColour {
    return LiteGraph.NODE_TEXT_HIGHLIGHT_COLOR ?? LiteGraph.NODE_SELECTED_TITLE_COLOR ?? LiteGraph.NODE_TEXT_COLOR
  }

  /**
   * Whether this slot is backed by a widget rather than a traditional socket.
   *
   * Widget input slots suppress label rendering and use the widget's layout bounds.
   */
  abstract get isWidgetInputSlot(): boolean

  /**
   * @param slot Serialised or partial slot properties used to initialise this instance.
   * @param node The parent node that owns this slot.
   */
  constructor(slot: OptionalProps<INodeSlot, "boundingRect">, node: LGraphNode) {
    // Workaround: Ensure internal properties are not copied to the slot (_listenerController
    // https://github.com/Comfy-Org/litegraph.js/issues/1138
    const maybeSubgraphSlot: OptionalProps<ISubgraphInput, "link" | "boundingRect"> = slot
    const { boundingRect, name, type, _listenerController, ...rest } = maybeSubgraphSlot
    const rectangle = boundingRect ? Rectangle.ensureRect(boundingRect) : new Rectangle()

    super(name, type, rectangle)

    Object.assign(this, rest)
    this.#node = node
  }

  /**
   * Determines whether a dragging link originating from {@link fromSlot} may connect here.
   * @param fromSlot The slot at the free end of the link being dragged.
   * @returns `true` if the connection is type-compatible and otherwise valid.
   */
  abstract isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean

  /**
   * The label text rendered beside this slot on the canvas.
   *
   * Resolves in order: {@link label}, {@link localized_name}, then {@link name}.
   */
  get renderingLabel(): string {
    return this.label || this.localized_name || this.name || ""
  }

  /**
   * Renders this slot's shape, label, and error indicator on the canvas.
   *
   * Draws the slot at its layout centre offset from the parent node, using the shape and colour
   * determined by {@link type}, {@link shape}, and {@link renderingColor}.
   * @param ctx The 2D rendering context for the node canvas.
   * @param options Drawing options controlling colours, label placement, and quality.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    {
      colorContext,
      labelPosition = LabelPosition.Right,
      lowQuality = false,
      highlight = false,
      doStroke = false,
    }: IDrawOptions,
  ) {
    // Save the current fillStyle and strokeStyle
    const originalFillStyle = ctx.fillStyle
    const originalStrokeStyle = ctx.strokeStyle
    const originalLineWidth = ctx.lineWidth

    const labelColor = highlight
      ? this.highlightColor
      : LiteGraph.NODE_TEXT_COLOR

    const pos = this.#centreOffset
    const slot_type = this.type
    const slot_shape = (
      slot_type === SlotType.Array ? SlotShape.Grid : this.shape
    ) as SlotShape

    ctx.beginPath()
    let doFill = true

    ctx.fillStyle = this.renderingColor(colorContext)
    ctx.lineWidth = 1
    if (slot_type === SlotType.Event || slot_shape === SlotShape.Box) {
      ctx.rect(pos[0] - 6 + 0.5, pos[1] - 5 + 0.5, 14, 10)
    } else if (slot_shape === SlotShape.Arrow) {
      ctx.moveTo(pos[0] + 8, pos[1] + 0.5)
      ctx.lineTo(pos[0] - 4, pos[1] + 6 + 0.5)
      ctx.lineTo(pos[0] - 4, pos[1] - 6 + 0.5)
      ctx.closePath()
    } else if (slot_shape === SlotShape.Grid) {
      const gridSize = 3
      const cellSize = 2
      const spacing = 3

      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          ctx.rect(
            pos[0] - 4 + x * spacing,
            pos[1] - 4 + y * spacing,
            cellSize,
            cellSize,
          )
        }
      }
      doStroke = false
    } else {
      // Default rendering for circle, hollow circle.
      if (lowQuality) {
        ctx.rect(pos[0] - 4, pos[1] - 4, 8, 8)
      } else {
        let radius: number
        if (slot_shape === SlotShape.HollowCircle) {
          doFill = false
          doStroke = true
          ctx.lineWidth = 3
          ctx.strokeStyle = ctx.fillStyle
          radius = highlight ? 4 : 3
        } else {
          // Normal circle
          radius = highlight ? 5 : 4
        }
        ctx.arc(pos[0], pos[1], radius, 0, Math.PI * 2)
      }
    }

    if (doFill) ctx.fill()
    if (!lowQuality && doStroke) ctx.stroke()

    // render slot label
    const hideLabel = lowQuality || this.isWidgetInputSlot
    if (!hideLabel) {
      const text = this.renderingLabel
      if (text) {
        // TODO: Finish impl.  Highlight text on mouseover unless we're connecting links.
        ctx.fillStyle = labelColor

        if (labelPosition === LabelPosition.Right) {
          if (this.dir == LinkDirection.UP) {
            ctx.fillText(text, pos[0], pos[1] - 10)
          } else {
            ctx.fillText(text, pos[0] + 10, pos[1] + 5)
          }
        } else {
          if (this.dir == LinkDirection.DOWN) {
            ctx.fillText(text, pos[0], pos[1] - 8)
          } else {
            ctx.fillText(text, pos[0] - 10, pos[1] + 5)
          }
        }
      }
    }

    // Draw a red circle if the slot has errors.
    if (this.hasErrors) {
      ctx.lineWidth = 2
      ctx.strokeStyle = "red"
      ctx.beginPath()
      ctx.arc(pos[0], pos[1], 12, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Restore the original fillStyle and strokeStyle
    ctx.fillStyle = originalFillStyle
    ctx.strokeStyle = originalStrokeStyle
    ctx.lineWidth = originalLineWidth
  }

  /**
   * Renders a simplified slot indicator when the parent node is collapsed.
   *
   * Uses {@link collapsedPos} and a fixed grey fill. Arrow slots adjust direction based on
   * whether this is an input or output slot.
   * @param ctx The 2D rendering context for the node canvas.
   */
  drawCollapsed(ctx: CanvasRenderingContext2D) {
    const [x, y] = this.collapsedPos

    // Save original styles
    const { fillStyle } = ctx

    ctx.fillStyle = "#686"
    ctx.beginPath()

    if (this.type === SlotType.Event || this.shape === RenderShape.BOX) {
      ctx.rect(x - 7 + 0.5, y - 4, 14, 8)
    } else if (this.shape === RenderShape.ARROW) {
      // Adjust arrow direction based on whether this is an input or output slot
      const isInput = this instanceof NodeInputSlot
      if (isInput) {
        ctx.moveTo(x + 8, y)
        ctx.lineTo(x - 4, y - 4)
        ctx.lineTo(x - 4, y + 4)
      } else {
        ctx.moveTo(x + 6, y)
        ctx.lineTo(x - 6, y - 4)
        ctx.lineTo(x - 6, y + 4)
      }
      ctx.closePath()
    } else {
      ctx.arc(x, y, 4, 0, Math.PI * 2)
    }
    ctx.fill()

    // Restore original styles
    ctx.fillStyle = fillStyle
  }
}
