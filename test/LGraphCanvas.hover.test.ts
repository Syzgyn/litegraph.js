import type { CanvasPointerEvent } from "@/types/events"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode } from "@/litegraph"

function createMockContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    roundRect: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D
}

function createHoverTestHarness(readOnly = false) {
  const canvasElement = document.createElement("canvas")
  canvasElement.width = 800
  canvasElement.height = 600
  canvasElement.getContext = vi.fn().mockReturnValue(createMockContext())
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
    skipRender: true,
    skipEvents: true,
  })
  canvas.readOnly = readOnly

  const node = new LGraphNode("test")
  node.pos = [100, 120]
  node.size = [200, 100]
  node.addInput("value", "number", { tooltip: "slot tip" })
  graph.add(node)

  return { canvas, canvasElement, graph, node }
}

function pointerMoveAt(canvas: LGraphCanvas, graphX: number, graphY: number): CanvasPointerEvent {
  const event = {
    clientX: graphX,
    clientY: graphY,
    bubbles: true,
    isPrimary: true,
    button: 0,
    buttons: 0,
    preventDefault: () => {},
  } as CanvasPointerEvent
  canvas.processMouseMove(event as PointerEvent)
  return event
}

describe("LGraphCanvas hover APIs", () => {
  let canvas: LGraphCanvas
  let canvasElement: HTMLCanvasElement
  let node: LGraphNode

  beforeEach(() => {
    ;({ canvas, canvasElement, node } = createHoverTestHarness())
  })

  afterEach(() => {
    canvasElement.remove()
  })

  test("updates mouseOver and hover target in read-only mode", () => {
    canvas.readOnly = true
    const [x, y] = node.getInputSlotPos(node.inputs[0])

    pointerMoveAt(canvas, x, y)

    expect(canvas.nodeOver).toBe(node)
    expect(node.mouseOver?.inputId).toBe(0)
    expect(canvas.getHoverTarget()?.kind).toBe("input")
  })

  test("dispatches litegraph:hover-change when the target changes", () => {
    const handler = vi.fn()
    canvas.canvas.addEventListener("litegraph:hover-change", handler)

    pointerMoveAt(canvas, 150, 110)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.target?.kind).toBe("title")

    const [x, y] = node.getInputSlotPos(node.inputs[0])
    pointerMoveAt(canvas, x, y)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[1][0].detail.previousTarget?.kind).toBe("title")
    expect(handler.mock.calls[1][0].detail.target?.kind).toBe("input")
  })

  test("clears hover target on mouse out", () => {
    const [x, y] = node.getInputSlotPos(node.inputs[0])
    pointerMoveAt(canvas, x, y)
    expect(canvas.getHoverTarget()).not.toBeNull()

    const handler = vi.fn()
    canvas.canvas.addEventListener("litegraph:hover-change", handler)

    canvas.processMouseOut({ bubbles: true, preventDefault: () => {} } as PointerEvent)
    expect(canvas.getHoverTarget()).toBeNull()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      detail: { target: null, previousTarget: expect.objectContaining({ kind: "input" }) },
    }))
  })

  test("graphToClient converts graph coordinates to viewport coordinates", () => {
    const [clientX, clientY] = canvas.graphToClient([100, 120])
    expect(clientX).toBe(100)
    expect(clientY).toBe(120)

    const [graphX, graphY] = canvas.clientToGraph([clientX, clientY])
    expect(graphX).toBeCloseTo(100)
    expect(graphY).toBeCloseTo(120)
  })

  test("updates hover target while panning the canvas", () => {
    const [x, y] = node.getInputSlotPos(node.inputs[0])
    pointerMoveAt(canvas, x, y)
    expect(canvas.getHoverTarget()?.kind).toBe("input")

    canvas.draggingCanvas = true
    pointerMoveAt(canvas, x + 10, y)

    expect(canvas.getHoverTarget()?.kind).toBe("input")
    expect(node.mouseOver?.inputId).toBe(0)
  })
})
