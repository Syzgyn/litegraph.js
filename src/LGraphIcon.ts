/**
 * Configuration for constructing an {@link LGraphIcon}.
 */
export interface LGraphIconOptions {
  /** Unicode character or icon-font glyph to render. */
  unicode: string
  /** CSS font family for the icon glyph. Default: `"PrimeIcons"`. */
  fontFamily?: string
  /** Icon foreground colour. Default: `"#e6c200"`. */
  color?: string
  /** Optional circular background fill behind the glyph. */
  bgColor?: string
  /** Font size in pixels. Default: `16`. */
  fontSize?: number
  /** Extra padding around the glyph when drawing a background circle. Default: `2`. */
  circlePadding?: number
  /** Horizontal offset applied when drawing. Default: `0`. */
  xOffset?: number
  /** Vertical offset applied when drawing. Default: `0`. */
  yOffset?: number
}

/**
 * Icon-font glyph renderer for node badges and buttons.
 *
 * Draws a single unicode character from an icon font (default PrimeIcons), optionally
 * inside a filled circle. Used by {@link LGraphBadge} and {@link LGraphButton}.
 * @see {@link LGraphBadge}
 */
export class LGraphIcon {
  /** Unicode character rendered by {@link draw}. */
  unicode: string
  /** Icon font family name passed to `ctx.font`. */
  fontFamily: string
  /** Foreground fill colour for the glyph. */
  color: string
  /** Optional background circle colour. When omitted, no circle is drawn. */
  bgColor?: string
  /** Font size in pixels. */
  fontSize: number
  /** Padding added to the glyph radius when drawing {@link bgColor}. */
  circlePadding: number
  /** Horizontal draw offset. */
  xOffset: number
  /** Vertical draw offset. */
  yOffset: number

  /**
   * @param options Icon glyph, font, and colour configuration.
   */
  constructor({
    unicode,
    fontFamily = "PrimeIcons",
    color = "#e6c200",
    bgColor,
    fontSize = 16,
    circlePadding = 2,
    xOffset = 0,
    yOffset = 0,
  }: LGraphIconOptions) {
    this.unicode = unicode
    this.fontFamily = fontFamily
    this.color = color
    this.bgColor = bgColor
    this.fontSize = fontSize
    this.circlePadding = circlePadding
    this.xOffset = xOffset
    this.yOffset = yOffset
  }

  /**
   * Draws the icon at `(x, y)`, vertically centred on `y`.
   *
   * When {@link bgColor} is set, draws a filled circle behind the glyph first.
   * Restores canvas text state after drawing.
   * @param ctx Canvas rendering context.
   * @param x Left anchor for the icon (circle starts at this x).
   * @param y Vertical centre line for the icon.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    x += this.xOffset
    y += this.yOffset

    const { font, textBaseline, textAlign, fillStyle } = ctx

    ctx.font = `${this.fontSize}px '${this.fontFamily}'`
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    const iconRadius = this.fontSize / 2 + this.circlePadding
    // Draw icon background circle if bgColor is set
    if (this.bgColor) {
      ctx.beginPath()
      ctx.arc(x + iconRadius, y, iconRadius, 0, 2 * Math.PI)
      ctx.fillStyle = this.bgColor
      ctx.fill()
    }
    // Draw icon
    ctx.fillStyle = this.color
    ctx.fillText(this.unicode, x + iconRadius, y)

    ctx.font = font
    ctx.textBaseline = textBaseline
    ctx.textAlign = textAlign
    ctx.fillStyle = fillStyle
  }
}
