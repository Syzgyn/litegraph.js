import { describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LiteGraph } from "@/litegraph"

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

  canvas.getContext = vi.fn().mockReturnValue({
    scale: vi.fn(),
    translate: vi.fn(),
    clearRect: vi.fn(),
  })

  return canvas
}

describe("LGraphCanvas d3 zoom", () => {
  test("lazy-binds d3 when useD3Zoom is set after construction", () => {
    LiteGraph.canvasNavigationMode = "legacy"
    const graph = new LGraph()
    const element = createCanvas()
    const canvas = new LGraphCanvas(element, graph, { skipRender: true })

    canvas.#useD3Zoom = true

    const startScale = canvas.ds.scale
    element.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    }))

    expect(canvas.ds.scale).toBeGreaterThan(startScale)
  })
})
