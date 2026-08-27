import type { Point, Rect } from "./interfaces"

import { clamp, LGraphCanvas } from "./litegraph"
import { distance } from "./measure"

/**
 * Interactive 2D curve editor rendered inside node widgets.
 *
 * Manages a sorted list of normalised control points `[x, y]` where both axes are in
 * `[0, 1]`. Used by curve widgets to edit easing or response curves via mouse interaction
 * and to sample values along the piecewise-linear path.
 * @remarks
 * Points are stored in graph-normalised space; `draw` maps them into widget pixel
 * coordinates. Edge points (first and last) are locked to `x = 0` and `x = 1` respectively.
 * @see `CurveEditor.sampleCurve`
 */
export class CurveEditor {
  /** Control points in normalised `[0, 1]` space, sorted by ascending `x`. */
  points: Point[]
  /** Index of the point currently being dragged, or `-1` when none is selected. */
  selected: number
  /** Index of the point nearest the pointer for hover highlighting, or `-1`. */
  nearest: number
  /** Last widget size passed to `draw`, required for hit testing in mouse handlers. */
  size: Rect | null
  /** When `true`, downstream code should recompute any cached curve samples. */
  mustUpdate: boolean
  /** Pixel inset applied on all sides when mapping normalised points to canvas space. */
  margin: number
  /**
   * @internal Cached nearest-point index used during `onMouseMove`.
   * TODO: Delete once confirmed it does nothing, or finish implementation
   */
  nearestCache?: number

  /**
   * @param points Initial control points. The array is mutated in place during editing.
   */
  constructor(points: Point[]) {
    this.points = points
    this.selected = -1
    this.nearest = -1
    // stores last size used
    this.size = null
    this.mustUpdate = true
    this.margin = 5
  }

  /**
   * Samples the piecewise-linear curve defined by `points` at normalised input `f`.
   *
   * Walks adjacent point pairs and linearly interpolates within the segment that contains
   * `f`. Returns `0` when `f` lies beyond the final segment.
   * @param f Normalised input along the horizontal axis (`0`–`1`).
   * @param points Sorted control points to sample. When omitted or empty, returns `undefined`.
   * @returns Interpolated output in normalised vertical space, or `undefined` when no points exist.
   */
  static sampleCurve(f: number, points: Point[]): number | undefined {
    if (!points) return

    for (let i = 0; i < points.length - 1; ++i) {
      const p = points[i]
      const pn = points[i + 1]
      if (pn[0] < f) continue

      const r = pn[0] - p[0]
      if (Math.abs(r) < 0.000_01) return p[1]

      const localF = (f - p[0]) / r
      return p[1] * (1.0 - localF) + pn[1] * localF
    }
    return 0
  }

  /**
   * Renders the curve, optional background grid, and control-point handles.
   * @param ctx Canvas context to draw into.
   * @param size Widget area as `[width, height]` in pixels.
   * @param _graphcanvas Optional canvas reference (unused by this method; retained for API compat).
   * @param backgroundColor When set, draws a dark grid background behind the curve.
   * @param lineColor Stroke colour for the curve path. Defaults to `"#666"`.
   * @param inactive When `true`, draws at reduced opacity and omits interactive handles.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    size: Rect,
    _graphcanvas?: LGraphCanvas,
    backgroundColor?: string,
    lineColor?: string,
    inactive = false,
  ): void {
    const points = this.points
    if (!points) return

    this.size = size
    const w = size[0] - this.margin * 2
    const h = size[1] - this.margin * 2

    lineColor = lineColor || "#666"

    ctx.save()
    ctx.translate(this.margin, this.margin)

    if (backgroundColor) {
      ctx.fillStyle = "#111"
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "#222"
      ctx.fillRect(w * 0.5, 0, 1, h)
      ctx.strokeStyle = "#333"
      ctx.strokeRect(0, 0, w, h)
    }
    ctx.strokeStyle = lineColor
    if (inactive) ctx.globalAlpha = 0.5
    ctx.beginPath()
    for (const p of points) {
      ctx.lineTo(p[0] * w, (1.0 - p[1]) * h)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    if (!inactive) {
      for (const [i, p] of points.entries()) {
        ctx.fillStyle = this.selected == i
          ? "#FFF"
          : (this.nearest == i ? "#DDD" : "#AAA")
        ctx.beginPath()
        ctx.arc(p[0] * w, (1.0 - p[1]) * h, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  /**
   * Handles pointer-down inside the editor: selects an existing point or inserts a new one.
   * @param localpos Pointer position in widget-local pixels.
   * @param graphcanvas Canvas used to scale hit-test tolerance with zoom level.
   * @returns `true` when a point was selected or created (caller should capture input), otherwise `undefined`.
   */
  // localpos is mouse in curve editor space
  onMouseDown(localpos: Point, graphcanvas: LGraphCanvas): boolean | undefined {
    const points = this.points
    if (!points) return
    if (localpos[1] < 0) return

    // this.captureInput(true);
    if (this.size == null) throw new Error("CurveEditor.size was null or undefined.")
    const w = this.size[0] - this.margin * 2
    const h = this.size[1] - this.margin * 2
    const x = localpos[0] - this.margin
    const y = localpos[1] - this.margin
    const pos: Point = [x, y]
    const maxDist = 30 / graphcanvas.ds.scale
    // search closer one
    this.selected = this.getCloserPoint(pos, maxDist)
    // create one
    if (this.selected == -1) {
      const point: Point = [x / w, 1 - y / h]
      points.push(point)
      points.sort(function (a, b) {
        return a[0] - b[0]
      })
      this.selected = points.indexOf(point)
      this.mustUpdate = true
    }
    if (this.selected != -1) return true
  }

  /**
   * Handles pointer-move while a point is selected: drags the point or removes it when dragged
   * far outside the widget bounds.
   * @param localpos Pointer position in widget-local pixels.
   * @param graphcanvas Canvas used to scale hit-test tolerance with zoom level.
   */
  onMouseMove(localpos: Point, graphcanvas: LGraphCanvas): void {
    const points = this.points
    if (!points) return

    const s = this.selected
    if (s < 0) return

    if (this.size == null) throw new Error("CurveEditor.size was null or undefined.")
    const x = (localpos[0] - this.margin) / (this.size[0] - this.margin * 2)
    const y = (localpos[1] - this.margin) / (this.size[1] - this.margin * 2)
    const curvepos: Point = [
      localpos[0] - this.margin,
      localpos[1] - this.margin,
    ]
    const maxDist = 30 / graphcanvas.ds.scale
    this.nearestCache = this.getCloserPoint(curvepos, maxDist)
    const point = points[s]
    if (point) {
      const isEdgePoint = s == 0 || s == points.length - 1
      if (
        !isEdgePoint &&
        (localpos[0] < -10 ||
          localpos[0] > this.size[0] + 10 ||
          localpos[1] < -10 ||
          localpos[1] > this.size[1] + 10)
      ) {
        points.splice(s, 1)
        this.selected = -1
        return
      }
      // not edges
      if (!isEdgePoint) point[0] = clamp(x, 0, 1)
      else point[0] = s == 0 ? 0 : 1
      point[1] = 1.0 - clamp(y, 0, 1)
      points.sort(function (a, b) {
        return a[0] - b[0]
      })
      this.selected = points.indexOf(point)
      this.mustUpdate = true
    }
  }

  /**
   * Handles pointer-up: clears the current selection.
   * @returns Always `false` — curve editing does not consume the mouse-up event.
   */
  // Former params: localpos, graphcanvas
  onMouseUp(): boolean {
    this.selected = -1
    return false
  }

  /**
   * Finds the index of the control point closest to `pos` within `max_dist`.
   * @param pos Pointer position in editor-local pixel space (after subtracting `margin`).
   * @param maxDist Maximum distance in pixels for a point to be considered. Defaults to `30`.
   * @returns Index of the closest point, or `-1` when none are within range.
   */
  getCloserPoint(pos: Point, maxDist?: number): number {
    const points = this.points
    if (!points) return -1

    maxDist = maxDist || 30
    if (this.size == null) throw new Error("CurveEditor.size was null or undefined.")
    const w = this.size[0] - this.margin * 2
    const h = this.size[1] - this.margin * 2
    const num = points.length
    const p2: Point = [0, 0]
    let minDist = 1_000_000
    let closest = -1

    for (let i = 0; i < num; ++i) {
      const p = points[i]
      p2[0] = p[0] * w
      p2[1] = (1.0 - p[1]) * h
      const dist = distance(pos, p2)
      if (dist > minDist || dist > maxDist) continue

      closest = i
      minDist = dist
    }
    return closest
  }
}
