import { describe, expect, test } from "vitest"

import { D3ZoomController } from "@/canvas/D3ZoomController"
import { DragAndScale } from "@/DragAndScale"

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = 800
  canvas.height = 600
  document.body.append(canvas)

  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  })

  return canvas
}

describe("D3ZoomController wheel integration", () => {
  test("wheel event updates DragAndScale scale", () => {
    const canvas = createCanvas()
    const ds = new DragAndScale(canvas)
    let zoomCount = 0

    const controller = new D3ZoomController(canvas, ds, {
      shouldZoomOnWheel: () => true,
      onZoom: () => {
        zoomCount++
      },
    })
    controller.bind()

    canvas.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    }))

    expect(zoomCount).toBeGreaterThan(0)
    expect(ds.scale).toBeGreaterThan(1)
  })
})
