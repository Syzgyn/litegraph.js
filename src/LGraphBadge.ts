import { LGraphIcon, type LGraphIconOptions } from "./LGraphIcon"
import { cachedMeasureText } from "./utils/textMeasureCache"

/**
 * Corner placement for {@link LGraphBadge} overlays on node titles.
 */
export enum BadgePosition {
  /** Badge anchored to the top-left of the node title bar. */
  TopLeft = "top-left",
  /** Badge anchored to the top-right of the node title bar. */
  TopRight = "top-right",
}

/**
 * Configuration for constructing an {@link LGraphBadge}.
 */
export interface LGraphBadgeOptions {
  /** Text label rendered inside the badge. */
  text: string
  /** Foreground (text) colour. Default: `"white"`. */
  fgColor?: string
  /** Background fill colour. Default: `"#0F1F0F"`. */
  bgColor?: string
  /** Font size in pixels for the label. Default: `12`. */
  fontSize?: number
  /** Horizontal padding inside the badge. Default: `6`. */
  padding?: number
  /** Total badge height in pixels. Default: `20`. */
  height?: number
  /** Corner radius when {@link CanvasRenderingContext2D.roundRect} is available. Default: `5`. */
  cornerRadius?: number
  /** Optional icon drawn to the left of the label text. */
  iconOptions?: LGraphIconOptions
  /** Horizontal offset applied when drawing. Default: `0`. */
  xOffset?: number
  /** Vertical offset applied when drawing. Default: `0`. */
  yOffset?: number
}

/**
 * Small labelled overlay drawn on node title bars (e.g. status or category badges).
 *
 * Renders a rounded rectangle with optional {@link LGraphIcon} and text. Used by
 * {@link LGraphNode} badge lists and {@link LGraphButton} for interactive controls.
 * @see {@link BadgePosition}
 * @see {@link LGraphButton}
 */
export class LGraphBadge {
  /** Badge label text. */
  text: string
  /** Foreground colour for label text. */
  fgColor: string
  /** Background fill colour for the badge pill. */
  bgColor: string
  /** Font size in pixels for the label. */
  fontSize: number
  /** Internal horizontal padding. */
  padding: number
  /** Total rendered height in pixels. */
  height: number
  /** Corner radius for rounded badge background. */
  cornerRadius: number
  /** Optional icon rendered before the label. */
  icon?: LGraphIcon
  /** Horizontal draw offset from the anchor point. */
  xOffset: number
  /** Vertical draw offset from the anchor point. */
  yOffset: number

  /**
   * @param options Badge appearance and optional icon configuration.
   */
  constructor({
    text,
    fgColor = "white",
    bgColor = "#0F1F0F",
    fontSize = 12,
    padding = 6,
    height = 20,
    cornerRadius = 5,
    iconOptions,
    xOffset = 0,
    yOffset = 0,
  }: LGraphBadgeOptions) {
    this.text = text
    this.fgColor = fgColor
    this.bgColor = bgColor
    this.fontSize = fontSize
    this.padding = padding
    this.height = height
    this.cornerRadius = cornerRadius
    if (iconOptions) {
      this.icon = new LGraphIcon(iconOptions)
    }
    this.xOffset = xOffset
    this.yOffset = yOffset
  }

  /**
   * Whether the badge has any visible content (non-empty text or an icon).
   */
  get visible() {
    return (this.text?.length ?? 0) > 0 || !!this.icon
  }

  /**
   * Measures the total rendered width of the badge in canvas pixels.
   *
   * Temporarily adjusts `ctx.font` and restores it before returning.
   * @param ctx Canvas context used for text measurement.
   * @returns Width in pixels, or `0` when {@link visible} is `false`.
   */
  getWidth(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return 0
    const { font } = ctx
    let iconWidth = 0
    if (this.icon) {
      ctx.font = `${this.icon.fontSize}px '${this.icon.fontFamily}'`
      iconWidth = cachedMeasureText(ctx, this.icon.unicode) + this.padding
    }
    ctx.font = `${this.fontSize}px sans-serif`
    const textWidth = this.text ? cachedMeasureText(ctx, this.text) : 0
    ctx.font = font
    return iconWidth + textWidth + this.padding * 2
  }

  /**
   * Draws the badge background, optional icon, and label at `(x, y)`.
   * @param ctx Canvas rendering context.
   * @param x Left edge of the badge in canvas coordinates.
   * @param y Top edge of the badge in canvas coordinates.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    if (!this.visible) return

    x += this.xOffset
    y += this.yOffset

    const { font, fillStyle, textBaseline, textAlign } = ctx

    ctx.font = `${this.fontSize}px sans-serif`
    const badgeWidth = this.getWidth(ctx)
    const badgeX = 0

    // Draw badge background
    ctx.fillStyle = this.bgColor
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x + badgeX, y, badgeWidth, this.height, this.cornerRadius)
    } else {
      // Fallback for browsers that don't support roundRect
      ctx.rect(x + badgeX, y, badgeWidth, this.height)
    }
    ctx.fill()

    let drawX = x + badgeX + this.padding
    const centerY = y + this.height / 2

    // Draw icon if present
    if (this.icon) {
      this.icon.draw(ctx, drawX, centerY)
      drawX += this.icon.fontSize + this.padding / 2 + 4
    }

    // Draw badge text
    if (this.text) {
      ctx.fillStyle = this.fgColor
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      ctx.fillText(this.text, drawX, centerY + 1)
    }

    ctx.font = font
    ctx.fillStyle = fillStyle
    ctx.textBaseline = textBaseline
    ctx.textAlign = textAlign
  }
}
