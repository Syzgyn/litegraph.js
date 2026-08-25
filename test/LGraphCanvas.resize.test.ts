import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas } from "@/litegraph"

describe("LGraphCanvas.resize", () => {
  let originalDPR: number
  let parent: HTMLDivElement

  beforeEach(() => {
    originalDPR = window.devicePixelRatio
    parent = document.createElement("div")
    Object.defineProperty(parent, "offsetWidth", { configurable: true, value: 800 })
    Object.defineProperty(parent, "offsetHeight", { configurable: true, value: 600 })
    document.body.append(parent)
  })

  afterEach(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: originalDPR,
    })
    parent.remove()
  })

  function createCanvas(): LGraphCanvas {
    const canvasElement = document.createElement("canvas")
    parent.append(canvasElement)
    canvasElement.getContext = vi.fn().mockReturnValue({
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    })

    return new LGraphCanvas(canvasElement, new LGraph(), {
      skip_render: true,
      skip_events: true,
    })
  }

  function setDPR(value: number): void {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value,
    })
  }

  test("scales backing store by devicePixelRatio when filling parent", () => {
    setDPR(2)
    const lgCanvas = createCanvas()

    lgCanvas.resize()

    expect(lgCanvas.canvas.width).toBe(1600)
    expect(lgCanvas.canvas.height).toBe(1200)
    expect(lgCanvas.bgcanvas.width).toBe(1600)
    expect(lgCanvas.bgcanvas.height).toBe(1200)
  })

  test("scales explicit dimensions by devicePixelRatio", () => {
    setDPR(2)
    const lgCanvas = createCanvas()

    lgCanvas.resize(400, 300)

    expect(lgCanvas.canvas.width).toBe(800)
    expect(lgCanvas.canvas.height).toBe(600)
  })

  test("uses CSS pixel dimensions when devicePixelRatio is 1", () => {
    setDPR(1)
    const lgCanvas = createCanvas()

    lgCanvas.resize(640, 480)

    expect(lgCanvas.canvas.width).toBe(640)
    expect(lgCanvas.canvas.height).toBe(480)
  })

  test("backing store matches CSS size used by drawFrontCanvas blit on HiDPI", () => {
    setDPR(2)
    const lgCanvas = createCanvas()
    lgCanvas.resize(800, 600)

    const scale = window.devicePixelRatio
    expect(lgCanvas.bgcanvas.width / scale).toBe(800)
    expect(lgCanvas.bgcanvas.height / scale).toBe(600)
  })
})
