import type { DragAndScale } from "@/DragAndScale"

const EDGE_THRESHOLD = 50

interface AutoPanOptions {
  canvas: HTMLCanvasElement
  ds: DragAndScale
  maxPanSpeed: number
  onPan: (canvasDeltaX: number, canvasDeltaY: number) => void
}

/**
 * Calculates the pan speed for a single axis based on distance from the edge.
 * Returns negative speed for left/top edges, positive for right/bottom edges,
 * or 0 if the pointer is not near any edge.
 */
export function calculateEdgePanSpeed(
  pointerPos: number,
  minBound: number,
  maxBound: number,
  scale: number,
  maxPanSpeed: number,
): number {
  if (maxPanSpeed <= 0) return 0

  const distFromMin = pointerPos - minBound
  const distFromMax = maxBound - pointerPos

  if (distFromMin < 0) return -maxPanSpeed / scale

  if (distFromMax < 0) return maxPanSpeed / scale

  if (distFromMin < EDGE_THRESHOLD) {
    return (-maxPanSpeed * (1 - distFromMin / EDGE_THRESHOLD)) / scale
  }

  if (distFromMax < EDGE_THRESHOLD) {
    return (maxPanSpeed * (1 - distFromMax / EDGE_THRESHOLD)) / scale
  }

  return 0
}

export class AutoPanController {
  private pointerX = 0
  private pointerY = 0
  private readonly canvas: HTMLCanvasElement
  private readonly ds: DragAndScale
  private readonly maxPanSpeed: number
  private readonly onPan: (dx: number, dy: number) => void
  private rafId: number | undefined

  constructor(options: AutoPanOptions) {
    this.canvas = options.canvas
    this.ds = options.ds
    this.maxPanSpeed = options.maxPanSpeed
    this.onPan = options.onPan
  }

  updatePointer(screenX: number, screenY: number): void {
    this.pointerX = screenX
    this.pointerY = screenY
  }

  start(): void {
    if (this.rafId != null) return
    this.tick()
  }

  stop(): void {
    if (this.rafId == null) return
    cancelAnimationFrame(this.rafId)
    this.rafId = undefined
  }

  private tick(): void {
    const rect = this.canvas.getBoundingClientRect()
    const scale = this.ds.scale

    const panX = calculateEdgePanSpeed(
      this.pointerX,
      rect.left,
      rect.right,
      scale,
      this.maxPanSpeed,
    )
    const panY = calculateEdgePanSpeed(
      this.pointerY,
      rect.top,
      rect.bottom,
      scale,
      this.maxPanSpeed,
    )

    if (panX !== 0 || panY !== 0) {
      this.ds.offset[0] -= panX
      this.ds.offset[1] -= panY
      this.onPan(panX, panY)
    }

    this.rafId = requestAnimationFrame(() => this.tick())
  }
}
