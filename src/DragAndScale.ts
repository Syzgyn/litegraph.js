import type { Point, ReadOnlyRect, Rect } from "./interfaces"

import { EaseFunction, Rectangle } from "./litegraph"

/**
 * Pan-and-zoom viewport state for {@link DragAndScale}.
 *
 * Implemented as a plain object so it can be proxied or copied without side effects.
 */
export interface DragAndScaleState {
  /**
   * The offset from the top-left of the current canvas viewport to `[0, 0]` in graph space.
   * Or said another way, the inverse offset of the viewport.
   */
  offset: [number, number]
  /** The scale of the graph. */
  scale: number
}

/**
 * Options for {@link DragAndScale.animateToBounds} viewport animations.
 */
export type AnimationOptions = {
  /** Duration of the animation in milliseconds. */
  duration?: number
  /** Relative target zoom level. 1 means the view is fit exactly on the bounding box. */
  zoom?: number
  /** The animation easing function (curve) */
  easing?: EaseFunction
}

/**
 * Manages canvas panning, zooming, and coordinate conversion for {@link LGraphCanvas}.
 *
 * Tracks graph-space offset and scale, converts between canvas and graph coordinates,
 * and supports animated or immediate fit-to-bounds operations.
 * @see {@link LGraphCanvas.ds}
 */
export class DragAndScale {
  /**
   * The state of this DragAndScale instance.
   *
   * Implemented as a POCO that can be proxied without side-effects.
   */
  state: DragAndScaleState
  /** Snapshot of {@link state} from the previous frame; used to detect changes. */
  lastState: DragAndScaleState = {
    offset: [0, 0],
    scale: 0,
  }

  /** Maximum allowed zoom level. Default: `10`. */
  max_scale: number
  /** Minimum allowed zoom level. Default: `0.1`. */
  min_scale: number
  /** When `false`, pan/zoom handlers should ignore input. */
  enabled: boolean
  /** Last known pointer position in canvas pixels. */
  last_mouse: Point
  /** Canvas element whose size drives visible-area calculations. */
  element: HTMLCanvasElement
  /** Graph-space rectangle currently visible in the viewport. Updated by {@link computeVisibleArea}. */
  visible_area: Rectangle
  /** Whether a pan drag is currently in progress. */
  dragging?: boolean
  /** Optional sub-rectangle of the canvas used as the viewport (in canvas pixels). */
  viewport?: Rect

  /** Called when pan or zoom changes and the canvas should redraw. */
  onredraw?(das: DragAndScale): void
  /** Called when {@link state} changes after {@link computeVisibleArea}. */
  onChanged?(scale: number, offset: Point): void

  /** Graph-space pan offset (alias for {@link DragAndScaleState.offset}). */
  get offset(): [number, number] {
    return this.state.offset
  }

  set offset(value: Point) {
    this.state.offset[0] = value[0]
    this.state.offset[1] = value[1]
  }

  /** Current zoom scale (alias for {@link DragAndScaleState.scale}). */
  get scale(): number {
    return this.state.scale
  }

  set scale(value: number) {
    this.state.scale = value
  }

  /**
   * @param element Canvas element whose dimensions define the viewport.
   */
  constructor(element: HTMLCanvasElement) {
    this.state = {
      offset: [0, 0],
      scale: 1,
    }
    this.max_scale = 10
    this.min_scale = 0.1
    this.enabled = true
    this.last_mouse = [0, 0]
    this.visible_area = new Rectangle()

    this.element = element
  }

  /**
   * Returns `true` if the current state has changed from the previous state.
   * @returns `true` if the current state has changed from the previous state, otherwise `false`.
   */
  #stateHasChanged(): boolean {
    const current = this.state
    const previous = this.lastState

    return current.scale !== previous.scale ||
      current.offset[0] !== previous.offset[0] ||
      current.offset[1] !== previous.offset[1]
  }

  /**
   * Recomputes {@link visible_area} from current offset, scale, and optional {@link viewport}.
   *
   * Invokes {@link onChanged} when {@link state} differs from {@link lastState}.
   * @param viewport Optional canvas sub-rectangle in pixels; when omitted, uses the full canvas.
   */
  computeVisibleArea(viewport: Rect | undefined): void {
    const { scale, offset, visible_area } = this

    if (this.#stateHasChanged()) {
      this.onChanged?.(scale, offset)
      copyState(this.state, this.lastState)
    }

    if (!this.element) {
      visible_area[0] = visible_area[1] = visible_area[2] = visible_area[3] = 0
      return
    }
    let { width, height } = this.element
    let startx = -offset[0]
    let starty = -offset[1]
    if (viewport) {
      startx += viewport[0] / scale
      starty += viewport[1] / scale
      width = viewport[2]
      height = viewport[3]
    }
    const endx = startx + width / scale
    const endy = starty + height / scale
    visible_area[0] = startx
    visible_area[1] = starty
    visible_area.resizeBottomRight(endx, endy)
  }

  /**
   * Applies current scale and offset to a canvas 2D context for graph-space drawing.
   * @param ctx Context whose transform matrix will be modified.
   */
  toCanvasContext(ctx: CanvasRenderingContext2D): void {
    ctx.scale(this.scale, this.scale)
    ctx.translate(this.offset[0], this.offset[1])
  }

  /**
   * Converts a graph-space point to canvas pixel coordinates.
   * @param pos Point in graph space.
   * @returns Point in canvas pixels.
   */
  convertOffsetToCanvas(pos: Point): Point {
    return [
      (pos[0] + this.offset[0]) * this.scale,
      (pos[1] + this.offset[1]) * this.scale,
    ]
  }

  /**
   * Converts canvas pixel coordinates to graph-space.
   * @param pos Point in canvas pixels.
   * @param out Optional reusable output point. When omitted, a new array is allocated.
   * @returns Graph-space point written to {@link out} or a new `[x, y]` array.
   */
  convertCanvasToOffset(pos: Point, out?: Point): Point {
    out = out || [0, 0]
    out[0] = pos[0] / this.scale - this.offset[0]
    out[1] = pos[1] / this.scale - this.offset[1]
    return out
  }

  /**
   * Pans the viewport by canvas-pixel delta `(x, y)`.
   * @deprecated Has not been kept up to date with current canvas input handling.
   * @param x Horizontal drag delta in canvas pixels.
   * @param y Vertical drag delta in canvas pixels.
   */
  mouseDrag(x: number, y: number): void {
    this.offset[0] += x / this.scale
    this.offset[1] += y / this.scale

    this.onredraw?.(this)
  }

  /**
   * Sets zoom {@link scale}, clamped to {@link min_scale}–{@link max_scale}, keeping
   * {@link zooming_center} fixed on screen when provided.
   * @param value Target scale factor.
   * @param zooming_center Canvas pixel point that should remain stationary during zoom.
   * @param roundToScaleOne When `true`, snaps scale to exactly `1` when within `0.01`.
   */
  changeScale(value: number, zooming_center?: Point, roundToScaleOne = true): void {
    if (value < this.min_scale) {
      value = this.min_scale
    } else if (value > this.max_scale) {
      value = this.max_scale
    }
    if (value == this.scale) return

    const rect = this.element.getBoundingClientRect()
    if (!rect) return

    zooming_center = zooming_center ?? [rect.width * 0.5, rect.height * 0.5]

    const normalizedCenter: Point = [
      zooming_center[0] - rect.x,
      zooming_center[1] - rect.y,
    ]
    const center = this.convertCanvasToOffset(normalizedCenter)
    this.scale = value
    if (roundToScaleOne && Math.abs(this.scale - 1) < 0.01) this.scale = 1
    const new_center = this.convertCanvasToOffset(normalizedCenter)
    const delta_offset = [
      new_center[0] - center[0],
      new_center[1] - center[1],
    ]

    this.offset[0] += delta_offset[0]
    this.offset[1] += delta_offset[1]

    this.onredraw?.(this)
  }

  /**
   * Multiplies current scale by {@link value} (relative zoom in/out).
   * @param value Scale multiplier applied to {@link scale}.
   * @param zooming_center Canvas pixel point that should remain stationary during zoom.
   */
  changeDeltaScale(value: number, zooming_center?: Point): void {
    this.changeScale(this.scale * value, zooming_center)
  }

  /**
   * Fits the view to the specified bounds.
   * @param bounds The bounds to fit the view to, defined by a rectangle.
   */
  fitToBounds(bounds: ReadOnlyRect, { zoom = 0.75 }: { zoom?: number } = {}): void {
    const cw = this.element.width / window.devicePixelRatio
    const ch = this.element.height / window.devicePixelRatio
    let targetScale = this.scale

    if (zoom > 0) {
      const targetScaleX = (zoom * cw) / Math.max(bounds[2], 300)
      const targetScaleY = (zoom * ch) / Math.max(bounds[3], 300)

      // Choose the smaller scale to ensure the node fits into the viewport
      // Ensure we don't go over the max scale
      targetScale = Math.min(targetScaleX, targetScaleY, this.max_scale)
    }

    const scaledWidth = cw / targetScale
    const scaledHeight = ch / targetScale

    // Calculate the target position to center the bounds in the viewport
    const targetX = -bounds[0] - (bounds[2] * 0.5) + (scaledWidth * 0.5)
    const targetY = -bounds[1] - (bounds[3] * 0.5) + (scaledHeight * 0.5)

    // Apply the changes immediately
    this.offset[0] = targetX
    this.offset[1] = targetY
    this.scale = targetScale
  }

  /**
   * Starts an animation to fit the view around the specified selection of nodes.
   * @param bounds The bounds to animate the view to, defined by a rectangle.
   * @param setDirty Callback invoked each animation frame to request a canvas redraw.
   * @param options Animation duration, target zoom padding, and easing curve.
   */
  animateToBounds(
    bounds: ReadOnlyRect,
    setDirty: () => void,
    {
      duration = 350,
      zoom = 0.75,
      easing = EaseFunction.EASE_IN_OUT_QUAD,
    }: AnimationOptions = {},
  ) {
    if (duration <= 0) throw new RangeError("Duration must be greater than 0")

    const easeFunctions = {
      linear: (t: number) => t,
      easeInQuad: (t: number) => t * t,
      easeOutQuad: (t: number) => t * (2 - t),
      easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    }
    const easeFunction = easeFunctions[easing] ?? easeFunctions.linear

    const startTimestamp = performance.now()
    const cw = this.element.width / window.devicePixelRatio
    const ch = this.element.height / window.devicePixelRatio
    const startX = this.offset[0]
    const startY = this.offset[1]
    const startX2 = startX - (cw / this.scale)
    const startY2 = startY - (ch / this.scale)
    const startScale = this.scale
    let targetScale = startScale

    if (zoom > 0) {
      const targetScaleX = (zoom * cw) / Math.max(bounds[2], 300)
      const targetScaleY = (zoom * ch) / Math.max(bounds[3], 300)

      // Choose the smaller scale to ensure the node fits into the viewport
      // Ensure we don't go over the max scale
      targetScale = Math.min(targetScaleX, targetScaleY, this.max_scale)
    }
    const scaledWidth = cw / targetScale
    const scaledHeight = ch / targetScale

    const targetX = -bounds[0] - (bounds[2] * 0.5) + (scaledWidth * 0.5)
    const targetY = -bounds[1] - (bounds[3] * 0.5) + (scaledHeight * 0.5)
    const targetX2 = targetX - scaledWidth
    const targetY2 = targetY - scaledHeight

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTimestamp
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeFunction(progress)

      const currentX = startX + ((targetX - startX) * easedProgress)
      const currentY = startY + ((targetY - startY) * easedProgress)
      this.offset[0] = currentX
      this.offset[1] = currentY

      if (zoom > 0) {
        const currentX2 = startX2 + ((targetX2 - startX2) * easedProgress)
        const currentY2 = startY2 + ((targetY2 - startY2) * easedProgress)
        const currentWidth = Math.abs(currentX2 - currentX)
        const currentHeight = Math.abs(currentY2 - currentY)

        this.scale = Math.min(cw / currentWidth, ch / currentHeight)
      }

      setDirty()

      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      } else {
        cancelAnimationFrame(animationId)
      }
    }
    let animationId = requestAnimationFrame(animate)
  }

  /** Resets pan to origin and scale to `1`. */
  reset(): void {
    this.scale = 1
    this.offset[0] = 0
    this.offset[1] = 0
  }
}

/**
 * Copies the values of one state into another, preserving references.
 * @param from The state to copy values from.
 * @param to The state to copy values into.
 */
function copyState(from: DragAndScaleState, to: DragAndScaleState): void {
  to.scale = from.scale
  to.offset[0] = from.offset[0]
  to.offset[1] = from.offset[1]
}
