import type { DragAndScale } from "@/DragAndScale"
import type { Point } from "@/interfaces"

import { select } from "d3-selection"
import {
  type D3ZoomEvent,
  zoom,
  type ZoomBehavior,
  zoomIdentity,
  type ZoomTransform,
} from "d3-zoom"

/** Converts a litegraph `DragAndScale` viewport to a d3-zoom transform. */
export function dragAndScaleToZoomTransform(
  scale: number,
  offset: Point,
): ZoomTransform {
  return zoomIdentity.translate(offset[0] * scale, offset[1] * scale).scale(scale)
}

/** Applies a d3-zoom transform to a litegraph `DragAndScale` viewport. */
export function zoomTransformToDragAndScale(
  transform: ZoomTransform,
  ds: DragAndScale,
): void {
  ds.scale = transform.k
  ds.offset[0] = transform.x / transform.k
  ds.offset[1] = transform.y / transform.k
}

export type D3ZoomControllerOptions = {
  /** Called after d3-zoom updates `DragAndScale`. */
  onZoom?: () => void
  /** Returns the mouse-wheel zoom step multiplier. */
  getZoomSpeed?: () => number
  /** Whether a wheel event should initiate zoom (vs pan). */
  shouldZoomOnWheel?: (event: WheelEvent) => boolean
}

/**
 * Bridges d3-zoom wheel/pinch handling to litegraph's `DragAndScale` state.
 *
 * Only wheel-initiated zoom gestures are handled; canvas panning remains with
 * `LGraphCanvas` pointer handlers.
 */
export class D3ZoomController {
  readonly #ds: DragAndScale
  readonly #element: HTMLCanvasElement
  readonly #onZoom?: () => void
  readonly #getZoomSpeed: () => number
  readonly #shouldZoomOnWheel: (event: WheelEvent) => boolean
  #zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>
  #selection = select<HTMLCanvasElement, unknown>(document.createElement("canvas"))
  #syncingFromD3 = false
  #bound = false

  constructor(
    element: HTMLCanvasElement,
    ds: DragAndScale,
    { onZoom, getZoomSpeed = () => 1.1, shouldZoomOnWheel = () => true }: D3ZoomControllerOptions = {},
  ) {
    this.#element = element
    this.#ds = ds
    this.#onZoom = onZoom
    this.#getZoomSpeed = getZoomSpeed
    this.#shouldZoomOnWheel = shouldZoomOnWheel

    this.#zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([ds.minScale, ds.maxScale])
      .filter(event => this.#shouldHandleWheelEvent(event))
      .wheelDelta(event => this.#wheelDelta(event))
      .on("zoom", event => this.#handleZoom(event))
  }

  #shouldHandleWheelEvent(event: Event): boolean {
    if (event.type !== "wheel") return false
    return this.#shouldZoomOnWheel(event as WheelEvent)
  }

  #wheelDelta(event: WheelEvent): number {
    // d3 applies scale as transform.k *= 2 ** wheelDelta
    const log2ZoomSpeed = Math.log2(this.#getZoomSpeed())
    const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 0.05
      : (event.deltaMode
        ? 1
        : 0.002)

    return -event.deltaY * modeScale * (event.ctrlKey ? 10 : 1) * (log2ZoomSpeed / Math.log2(1.1))
  }

  #handleZoom(event: D3ZoomEvent<HTMLCanvasElement, unknown>): void {
    this.#syncingFromD3 = true
    try {
      zoomTransformToDragAndScale(event.transform, this.#ds)
      this.#ds.onredraw?.(this.#ds)
      this.#onZoom?.()
    } finally {
      this.#syncingFromD3 = false
    }
  }

  /** Attaches d3-zoom listeners to the canvas. */
  bind(): void {
    if (this.#bound) return

    this.#selection = select(this.#element)
    this.#zoomBehavior.scaleExtent([this.#ds.minScale, this.#ds.maxScale])
    this.#selection.call(this.#zoomBehavior)
    this.syncFromDragAndScale()
    this.#bound = true
  }

  /** Detaches d3-zoom listeners from the canvas. */
  unbind(): void {
    if (!this.#bound) return

    this.#selection.on(".zoom", null)
    this.#bound = false
  }

  /** Pushes the current `DragAndScale` state into d3-zoom without emitting events. */
  syncFromDragAndScale(): void {
    const transform = dragAndScaleToZoomTransform(this.#ds.scale, this.#ds.offset)
    this.#selection.property("__zoom", transform)
  }

  /** Whether d3-zoom listeners are attached to the canvas. */
  get isBound(): boolean {
    return this.#bound
  }

  /** Updates scale extent when `DragAndScale` limits change. */
  updateScaleExtent(): void {
    this.#zoomBehavior.scaleExtent([this.#ds.minScale, this.#ds.maxScale])
  }

  /** Whether the latest viewport change originated from d3-zoom. */
  get syncingFromD3(): boolean {
    return this.#syncingFromD3
  }
}
