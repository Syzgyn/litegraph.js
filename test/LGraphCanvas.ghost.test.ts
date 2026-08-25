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

function createGhostTestHarness() {
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
    skip_render: true,
    skip_events: true,
  })

  const node = new LGraphNode("test")
  node.size = [200, 100]
  graph.add(node)

  return { canvas, canvasElement, graph, node }
}

describe("LGraphCanvas ghost placement", () => {
  let canvas: LGraphCanvas
  let canvasElement: HTMLCanvasElement
  let graph: LGraph
  let node: LGraphNode

  beforeEach(() => {
    ;({ canvas, canvasElement, graph, node } = createGhostTestHarness())
  })

  afterEach(() => {
    if (canvas.state.ghostNodeId != null) canvas.finalizeGhostPlacement(false)
    canvasElement.remove()
  })

  test("startGhostPlacement selects node and sets ghost state", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    expect(canvas.state.ghostNodeId).toBe(node.id)
    expect(canvas.isDragging).toBe(true)
    expect(node.flags.ghost).toBe(true)
    expect(canvas.selected_nodes[node.id]).toBe(node)
  })

  test("finalizeGhostPlacement places node and clears ghost flag", () => {
    canvas.startGhostPlacement(node)
    canvas.finalizeGhostPlacement(false)

    expect(canvas.state.ghostNodeId).toBeNull()
    expect(canvas.isDragging).toBe(false)
    expect(node.flags.ghost).toBeUndefined()
    expect(graph.getNodeById(node.id)).toBe(node)
  })

  test("finalizeGhostPlacement cancel removes the node", () => {
    canvas.startGhostPlacement(node)
    canvas.finalizeGhostPlacement(true)

    expect(canvas.state.ghostNodeId).toBeNull()
    expect(graph.getNodeById(node.id)).toBeUndefined()
  })

  test("graph.add with ghost option starts ghost placement", () => {
    const ghostNode = new LGraphNode("ghost")
    ghostNode.size = [100, 50]
    graph.add(ghostNode, { ghost: true })

    expect(canvas.state.ghostNodeId).toBe(ghostNode.id)
    expect(ghostNode.flags.ghost).toBe(true)
  })
})

describe("LGraphCanvas ghost placement auto-pan", () => {
  let canvas: LGraphCanvas
  let canvasElement: HTMLCanvasElement
  let node: LGraphNode

  beforeEach(() => {
    vi.useFakeTimers()
    ;({ canvas, canvasElement, node } = createGhostTestHarness())
    canvas.mouse[0] = 5
    canvas.mouse[1] = 300
  })

  afterEach(() => {
    if (canvas.state.ghostNodeId != null) canvas.finalizeGhostPlacement(false)
    canvasElement.remove()
    vi.useRealTimers()
  })

  test("moves the ghost node when pointer is near edge", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    const posXBefore = node.pos[0]
    vi.advanceTimersByTime(16)

    expect(node.pos[0]).not.toBe(posXBefore)
  })

  test("does not pan when pointer is in the center", () => {
    canvas.mouse[0] = 400
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    const offsetBefore = [...canvas.ds.offset]
    vi.advanceTimersByTime(16)

    expect(canvas.ds.offset[0]).toBe(offsetBefore[0])
    expect(canvas.ds.offset[1]).toBe(offsetBefore[1])
  })

  test("cleans up autopan and stops responding to document pointermove on finalize", () => {
    const processMoveSpy = vi.spyOn(canvas, "processMouseMove")
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    expect(canvas["_autoPan"]).not.toBeNull()

    document.dispatchEvent(new MouseEvent("pointermove"))
    expect(processMoveSpy).toHaveBeenCalled()

    processMoveSpy.mockClear()
    canvas.finalizeGhostPlacement(false)

    expect(canvas["_autoPan"]).toBeNull()

    document.dispatchEvent(new MouseEvent("pointermove"))
    expect(processMoveSpy).not.toHaveBeenCalled()
  })

  test("survives linkConnector reset during ghost placement", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    canvas.linkConnector.reset()

    expect(canvas["_autoPan"]).not.toBeNull()
    vi.advanceTimersByTime(16)
    expect(canvas.ds.offset[0]).not.toBe(0)
  })
})
