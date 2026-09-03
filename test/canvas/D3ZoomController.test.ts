import { zoomIdentity } from "d3-zoom"
import { describe, expect, test } from "vitest"

import {
  dragAndScaleToZoomTransform,
  zoomTransformToDragAndScale,
} from "@/canvas/D3ZoomController"
import { DragAndScale } from "@/DragAndScale"

describe("D3ZoomController transform mapping", () => {
  test("round-trips offset and scale through d3-zoom transforms", () => {
    const canvas = document.createElement("canvas")
    const ds = new DragAndScale(canvas)

    ds.scale = 1.75
    ds.offset[0] = -120
    ds.offset[1] = 45

    const transform = dragAndScaleToZoomTransform(ds.scale, ds.offset)
    expect(transform.k).toBe(1.75)
    expect(transform.x).toBeCloseTo(-210)
    expect(transform.y).toBeCloseTo(78.75)

    const restored = new DragAndScale(canvas)
    zoomTransformToDragAndScale(transform, restored)

    expect(restored.scale).toBe(1.75)
    expect(restored.offset[0]).toBeCloseTo(-120)
    expect(restored.offset[1]).toBeCloseTo(45)
  })

  test("identity transform maps to default DragAndScale state", () => {
    const canvas = document.createElement("canvas")
    const ds = new DragAndScale(canvas)

    zoomTransformToDragAndScale(zoomIdentity, ds)

    expect(ds.scale).toBe(1)
    expect(ds.offset[0]).toBe(0)
    expect(ds.offset[1]).toBe(0)
  })
})
