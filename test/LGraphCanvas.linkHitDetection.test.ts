import type { LinkSegment } from "@/interfaces"

import { afterEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas } from "@/litegraph"

function createMockContext(): CanvasRenderingContext2D {
  return {
    lineWidth: 1,
    isPointInStroke: vi.fn().mockReturnValue(true),
  } as unknown as CanvasRenderingContext2D
}

function createCanvasHarness() {
  const canvasElement = document.createElement("canvas")
  canvasElement.width = 800
  canvasElement.height = 600
  const ctx = createMockContext()
  canvasElement.getContext = vi.fn().mockReturnValue(ctx)
  canvasElement.setPointerCapture = vi.fn()
  document.body.append(canvasElement)
  canvasElement.getBoundingClientRect = vi.fn().mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => {},
  })

  const graph = new LGraph()
  const canvas = new LGraphCanvas(canvasElement, graph, {
    skip_render: true,
    skip_events: true,
  })

  return { canvas, canvasElement, ctx, graph }
}

describe("LGraphCanvas link hit detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const el of document.querySelectorAll("canvas")) el.remove()
  })

  test("uses canvas coordinates for isPointInStroke on alt-click", () => {
    vi.stubGlobal("devicePixelRatio", 2)

    const { canvas, ctx, graph } = createCanvasHarness()
    const path = {}
    const linkSegment = {
      path,
      _pos: [100, 100],
    } as LinkSegment

    canvas.renderedPaths.add(linkSegment)
    canvas.allow_interaction = true

    vi.spyOn(graph, "createReroute").mockReturnValue({ id: 1, pos: [120, 130] } as never)

    const event = {
      clientX: 120,
      clientY: 130,
      button: 0,
      altKey: true,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as PointerEvent

    canvas.processMouseDown(event)

    expect(ctx.isPointInStroke).toHaveBeenCalledWith(path, 240, 260)
    expect(graph.createReroute).toHaveBeenCalled()
  })
})
