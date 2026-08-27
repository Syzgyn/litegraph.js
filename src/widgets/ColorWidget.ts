import type { IColorWidget } from "@/types/widgets"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

// Have one color input to prevent leaking instances
// Browsers don't seem to fire any events when the color picker is cancelled
let colorInput: HTMLInputElement | undefined

function getColorInput(): HTMLInputElement {
  if (!colorInput?.isConnected) {
    colorInput = document.createElement("input")
    colorInput.type = "color"
    colorInput.style.position = "absolute"
    colorInput.style.opacity = "0"
    colorInput.style.pointerEvents = "none"
    colorInput.style.zIndex = "-999"
    document.body.append(colorInput)
  }
  return colorInput
}

/**
 * Colour picker widget (`type: "color"`) using a native HTML colour input.
 *
 * Renders a label, hex value, and colour swatch on the canvas; clicking opens the system picker.
 * @see {@link IColorWidget}
 */
export class ColorWidget extends BaseWidget<IColorWidget> implements IColorWidget {
  /** Widget type discriminator; always `"color"`. */
  override type = "color" as const

  /**
   * Draws the widget capsule, label, hex value, and colour swatch.
   * @param ctx Canvas 2D context.
   * @param options Node width and quality flags.
   */
  override drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void {
    const { fillStyle, strokeStyle, textAlign } = ctx

    this.drawWidgetShape(ctx, options)

    const { width } = options
    const { height, y } = this
    const { margin } = BaseWidget

    const swatchWidth = 40
    const swatchHeight = height - 6
    const swatchRadius = swatchHeight / 2
    const rightPadding = 10

    const swatchX = width - margin - rightPadding - swatchWidth
    const swatchY = y + 3

    ctx.beginPath()
    ctx.roundRect(swatchX, swatchY, swatchWidth, swatchHeight, swatchRadius)
    ctx.fillStyle = this.value || "#000000"
    ctx.fill()

    ctx.fillStyle = this.secondary_text_color
    ctx.textAlign = "left"
    ctx.fillText(this.displayName, margin * 2 + 5, y + height * 0.7)

    ctx.fillStyle = this.text_color
    ctx.textAlign = "right"
    ctx.fillText(this.value || "#000000", swatchX - 8, y + height * 0.7)

    Object.assign(ctx, { textAlign, strokeStyle, fillStyle })
  }

  /**
   * Opens the native colour picker at the pointer position.
   * @param options Pointer event and canvas context for value updates.
   */
  override onClick({ e, node, canvas }: WidgetEventOptions): void {
    const input = getColorInput()
    input.value = this.value || "#000000"
    input.style.left = `${e.clientX}px`
    input.style.top = `${e.clientY}px`

    input.addEventListener(
      "change",
      () => {
        this.setValue(input.value, { e, node, canvas })
        canvas.setDirty(true)
      },
      { once: true },
    )

    // Wait for next frame else Chrome doesn't render the color picker at the mouse
    requestAnimationFrame(() => input.click())
  }
}
