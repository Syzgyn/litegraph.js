import { beforeEach, describe, vi } from "vitest"

import { LGraph, LGraphCanvas } from "@/litegraph"

import { test } from "./testExtensions"

describe("LGraphCanvas.renderInfo", () => {
  let lgCanvas: LGraphCanvas
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    const canvasElement = document.createElement("canvas")
    ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      font: "",
      fillStyle: "",
      textAlign: "left",
      fillText: vi.fn(),
    } as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D

    canvasElement.getContext = vi.fn().mockReturnValue(ctx)

    const graph = new LGraph()
    lgCanvas = new LGraphCanvas(canvasElement, graph, {
      skip_render: true,
      skip_events: true,
    })
  })

  test("does not access canvas.offsetHeight when y is provided", ({ expect }) => {
    const spy = vi.spyOn(lgCanvas.canvas, "offsetHeight", "get")

    lgCanvas.renderInfo(ctx, 10, 500)

    expect(spy).not.toHaveBeenCalled()
  })

  test("uses canvas.height divided by devicePixelRatio as y fallback", ({ expect }) => {
    lgCanvas.canvas.width = 1920
    lgCanvas.canvas.height = 2160

    const originalDPR = window.devicePixelRatio
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    })

    try {
      lgCanvas.renderInfo(ctx, 10, 0)

      expect(ctx.translate).toHaveBeenCalledWith(10, 2160 / 2 - 80)
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        value: originalDPR,
        configurable: true,
      })
    }
  })
})
