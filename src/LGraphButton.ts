import { Rectangle } from "./infrastructure/Rectangle"
import { LGraphBadge, type LGraphBadgeOptions } from "./LGraphBadge"

/**
 * Configuration for an {@link LGraphButton} title-bar control.
 *
 * Extends {@link LGraphBadgeOptions} with an optional logical name for hit-test routing.
 */
export interface LGraphButtonOptions extends LGraphBadgeOptions {
  /** Optional identifier used to distinguish multiple buttons on one node. */
  name?: string // To identify the button
}

/**
 * Clickable icon-style control rendered in a node title bar.
 *
 * Subclasses {@link LGraphBadge} but draws without a background pill — only the
 * icon/text glyph. Tracks its last rendered bounds for {@link isPointInside} hit testing.
 * @see {@link LGraphBadge}
 */
export class LGraphButton extends LGraphBadge {
  /** Logical button name, when set via {@link LGraphButtonOptions.name}. */
  name?: string
  /** Last canvas area occupied by {@link draw}; used by {@link isPointInside}. */
  _last_area: Rectangle = new Rectangle()

  /**
   * @param options Button label/icon options and optional {@link name}.
   */
  constructor(options: LGraphButtonOptions) {
    super(options)
    this.name = options.name
  }

  /**
   * Measures button width using the PrimeIcons font (no badge padding).
   * @param ctx Canvas context used for text measurement.
   * @returns Text width in pixels, or `0` when {@link visible} is `false`.
   */
  override getWidth(ctx: CanvasRenderingContext2D): number {
    if (!this.visible) return 0

    const { font } = ctx
    ctx.font = `${this.fontSize}px 'PrimeIcons'`

    // For icon buttons, just measure the text width without padding
    const textWidth = this.text ? ctx.measureText(this.text).width : 0

    ctx.font = font
    return textWidth
  }

  /**
   * @internal
   *
   * Draws the button and updates its last rendered area for hit detection.
   * @param ctx The canvas rendering context.
   * @param x The x-coordinate to draw the button at.
   * @param y The y-coordinate to draw the button at.
   */
  override draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.visible) {
      return
    }

    const width = this.getWidth(ctx)

    // Update the hit area
    this._last_area[0] = x + this.xOffset
    this._last_area[1] = y + this.yOffset
    this._last_area[2] = width
    this._last_area[3] = this.height

    // Custom drawing for buttons - no background, just icon/text
    const adjustedX = x + this.xOffset
    const adjustedY = y + this.yOffset

    const { font, fillStyle, textBaseline, textAlign } = ctx

    // Use the same color as the title text (usually white)
    const titleTextColor = ctx.fillStyle || "white"

    // Draw as icon-only without background
    ctx.font = `${this.fontSize}px 'PrimeIcons'`
    ctx.fillStyle = titleTextColor
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"

    const centerX = adjustedX + width / 2
    const centerY = adjustedY + this.height / 2

    if (this.text) {
      ctx.fillText(this.text, centerX, centerY)
    }

    // Restore context
    ctx.font = font
    ctx.fillStyle = fillStyle
    ctx.textBaseline = textBaseline
    ctx.textAlign = textAlign
  }

  /**
   * Checks if a point is inside the button's last rendered area.
   * @param x The x-coordinate of the point.
   * @param y The y-coordinate of the point.
   * @returns `true` if the point is inside the button, otherwise `false`.
   */
  isPointInside(x: number, y: number): boolean {
    return this._last_area.containsPoint([x, y])
  }
}
