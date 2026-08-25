import type { LGraphCanvas } from "@/LGraphCanvas"

/**
 * Overlay that renders pointer and keyboard status indicators on the canvas front layer.
 *
 * Hooks into {@link LGraphCanvas.drawFrontCanvas} to draw modifier-key labels, mouse-button
 * dots, and undo/redo markers near the cursor. Intended for screen recordings and demos that
 * need to show which inputs are active.
 * @example
 * ```ts
 * const inputIndicators = new InputIndicators(canvas)
 * // Dispose when done:
 * inputIndicators.dispose()
 * ```
 * @see {@link LGraphCanvas}
 */
export class InputIndicators implements Disposable {
  // #region config

  /** Radius in pixels of the mouse-button indicator dots. */
  radius = 8

  /** Start angle (radians) for drawing indicator arcs. */
  startAngle = 0

  /** End angle (radians) for drawing indicator arcs. */
  endAngle = Math.PI * 2

  /** Colour used for inactive modifier-key and mouse-button indicators. */
  inactiveColour = "#ffffff10"

  /** Highlight colour for the Shift modifier and left mouse button. */
  colour1 = "#ff5f00"

  /** Highlight colour for the Alt modifier and middle mouse button. */
  colour2 = "#00ff7c"

  /** Highlight colour for the Control modifier and right mouse button. */
  colour3 = "#dea7ff"

  /** Font used for modifier-key text labels. */
  fontString = "bold 12px Arial"
  // #endregion

  // #region state

  /** When `false`, {@link draw} is a no-op (listeners remain active). */
  enabled: boolean = true

  /** Whether the Shift key is currently held. */
  shiftDown: boolean = false

  /** Whether Ctrl+Z (undo) is currently pressed. */
  undoDown: boolean = false

  /** Whether Ctrl+Y (redo) is currently pressed. */
  redoDown: boolean = false

  /** Whether the Control key is currently held. */
  ctrlDown: boolean = false

  /** Whether the Alt key is currently held. */
  altDown: boolean = false

  /** Whether the left mouse button (button 0) is currently held. */
  mouse0Down: boolean = false

  /** Whether the middle mouse button (button 1) is currently held. */
  mouse1Down: boolean = false

  /** Whether the right mouse button (button 2) is currently held. */
  mouse2Down: boolean = false

  /** Client-space X coordinate of the last pointer event. */
  x: number = 0

  /** Client-space Y coordinate of the last pointer event. */
  y: number = 0
  // #endregion

  /** AbortController used to remove all event listeners on {@link dispose}. */
  controller?: AbortController

  /**
   * @param canvas The {@link LGraphCanvas} whose front canvas will be overlaid with indicators.
   * Registers pointer and keyboard listeners and wraps {@link LGraphCanvas.drawFrontCanvas}.
   */
  constructor(public canvas: LGraphCanvas) {
    this.controller = new AbortController()
    const { signal } = this.controller

    const element = canvas.canvas
    const options = { capture: true, signal } satisfies AddEventListenerOptions

    element.addEventListener("pointerdown", this.#onPointerDownOrMove, options)
    element.addEventListener("pointermove", this.#onPointerDownOrMove, options)
    element.addEventListener("pointerup", this.#onPointerUp, options)
    element.addEventListener("keydown", this.#onKeyDownOrUp, options)
    document.addEventListener("keyup", this.#onKeyDownOrUp, options)

    const origDrawFrontCanvas = canvas.drawFrontCanvas.bind(canvas)
    signal.addEventListener("abort", () => {
      canvas.drawFrontCanvas = origDrawFrontCanvas
    })

    canvas.drawFrontCanvas = () => {
      origDrawFrontCanvas()
      this.draw()
    }
  }

  #onPointerDownOrMove = this.onPointerDownOrMove.bind(this)

  /**
   * Updates mouse-button and cursor position state from a pointer event.
   *
   * Called on `pointerdown` and `pointermove`. Marks the canvas dirty so the overlay redraws.
   * @param e The pointer event from the canvas element.
   */
  onPointerDownOrMove(e: MouseEvent): void {
    this.mouse0Down = (e.buttons & 1) === 1
    this.mouse1Down = (e.buttons & 4) === 4
    this.mouse2Down = (e.buttons & 2) === 2

    this.x = e.clientX
    this.y = e.clientY

    this.canvas.setDirty(true)
  }

  #onPointerUp = this.onPointerUp.bind(this)

  /**
   * Clears all mouse-button state when the pointer is released.
   */
  onPointerUp(): void {
    this.mouse0Down = false
    this.mouse1Down = false
    this.mouse2Down = false
  }

  #onKeyDownOrUp = this.onKeyDownOrUp.bind(this)

  /**
   * Updates modifier-key and undo/redo state from a keyboard event.
   *
   * Listens on the canvas element for `keydown` and on `document` for `keyup` so modifier
   * release is detected even when focus leaves the canvas.
   * @param e The keyboard event.
   */
  onKeyDownOrUp(e: KeyboardEvent): void {
    this.ctrlDown = e.ctrlKey
    this.altDown = e.altKey
    this.shiftDown = e.shiftKey
    this.undoDown = e.ctrlKey && e.code === "KeyZ" && e.type === "keydown"
    this.redoDown = e.ctrlKey && e.code === "KeyY" && e.type === "keydown"
  }

  /**
   * Draws the indicator overlay onto the canvas front context.
   *
   * Renders modifier-key labels above the cursor, three mouse-button dots, and undo/redo
   * emoji markers. Called automatically after each {@link LGraphCanvas.drawFrontCanvas} pass.
   */
  draw() {
    const {
      canvas: { ctx },
      radius,
      startAngle,
      endAngle,
      x,
      y,
      inactiveColour,
      colour1,
      colour2,
      colour3,
      fontString,
    } = this

    const { fillStyle, font } = ctx

    const mouseDotX = x
    const mouseDotY = y - 80

    const textX = mouseDotX
    const textY = mouseDotY - 15
    ctx.font = fontString

    textMarker(textX + 0, textY, "Shift", this.shiftDown ? colour1 : inactiveColour)
    textMarker(textX + 45, textY + 20, "Alt", this.altDown ? colour2 : inactiveColour)
    textMarker(textX + 30, textY, "Control", this.ctrlDown ? colour3 : inactiveColour)
    textMarker(textX - 30, textY, "↩️", this.undoDown ? "#000" : "transparent")
    textMarker(textX + 45, textY, "↪️", this.redoDown ? "#000" : "transparent")

    ctx.beginPath()
    drawDot(mouseDotX, mouseDotY)
    drawDot(mouseDotX + 15, mouseDotY)
    drawDot(mouseDotX + 30, mouseDotY)
    ctx.fillStyle = inactiveColour
    ctx.fill()

    const leftButtonColour = this.mouse0Down ? colour1 : inactiveColour
    const middleButtonColour = this.mouse1Down ? colour2 : inactiveColour
    const rightButtonColour = this.mouse2Down ? colour3 : inactiveColour
    if (this.mouse0Down) mouseMarker(mouseDotX, mouseDotY, leftButtonColour)
    if (this.mouse1Down) mouseMarker(mouseDotX + 15, mouseDotY, middleButtonColour)
    if (this.mouse2Down) mouseMarker(mouseDotX + 30, mouseDotY, rightButtonColour)

    ctx.fillStyle = fillStyle
    ctx.font = font

    function textMarker(x: number, y: number, text: string, colour: string) {
      ctx.fillStyle = colour
      ctx.fillText(text, x, y)
    }

    function mouseMarker(x: number, y: number, colour: string) {
      ctx.beginPath()
      ctx.fillStyle = colour
      drawDot(x, y)
      ctx.fill()
    }

    function drawDot(x: number, y: number) {
      ctx.arc(x, y, radius, startAngle, endAngle)
    }
  }

  /**
   * Removes all event listeners and restores the original {@link LGraphCanvas.drawFrontCanvas}.
   */
  dispose() {
    this.controller?.abort()
    this.controller = undefined
  }

  /** {@link Disposable} protocol — delegates to {@link dispose}. */
  [Symbol.dispose](): void {
    this.dispose()
  }
}
