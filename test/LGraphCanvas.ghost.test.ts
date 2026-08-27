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
    skipRender: true,
    skipEvents: true,
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

  test("startGhostPlacement dispatches litegraph:ghost-placement with active true", () => {
    const events: Array<{ active: boolean, nodeId: number | string }> = []
    canvasElement.addEventListener("litegraph:ghost-placement", (e) => {
      events.push((e as CustomEvent).detail)
    })

    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    expect(events).toEqual([{ active: true, nodeId: node.id }])
  })

  test("finalizeGhostPlacement dispatches litegraph:ghost-placement with active false", () => {
    const events: Array<{ active: boolean, nodeId: number | string }> = []
    canvasElement.addEventListener("litegraph:ghost-placement", (e) => {
      events.push((e as CustomEvent).detail)
    })

    canvas.startGhostPlacement(node)
    canvas.finalizeGhostPlacement(false)

    expect(events).toEqual([
      { active: true, nodeId: node.id },
      { active: false, nodeId: node.id },
    ])
  })

  test("startGhostPlacement selects node and sets ghost state", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    expect(canvas.state.ghostNodeId).toBe(node.id)
    expect(canvas.isDragging).toBe(true)
    expect(node.flags.ghost).toBe(true)
    expect(canvas.selectedNodes[node.id]).toBe(node)
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
    expect(canvas["autoPan"]).not.toBeNull()

    document.dispatchEvent(new MouseEvent("pointermove"))
    expect(processMoveSpy).toHaveBeenCalled()

    processMoveSpy.mockClear()
    canvas.finalizeGhostPlacement(false)

    expect(canvas["autoPan"]).toBeNull()

    document.dispatchEvent(new MouseEvent("pointermove"))
    expect(processMoveSpy).not.toHaveBeenCalled()
  })

  test("survives linkConnector reset during ghost placement", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    canvas.linkConnector.reset()

    expect(canvas["autoPan"]).not.toBeNull()
    vi.advanceTimersByTime(16)
    expect(canvas.ds.offset[0]).not.toBe(0)
  })
})

function dispatchKey(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
}

describe("LGraphCanvas ghost placement cancellation via document keydown", () => {
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

  test("Escape on document removes the ghost node and clears ghost state", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    expect(canvas.state.ghostNodeId).toBe(node.id)

    dispatchKey(document, "Escape")

    expect(canvas.state.ghostNodeId).toBeNull()
    expect(graph.getNodeById(node.id)).toBeUndefined()
  })

  test("Escape on document stops propagation so window-level keybindings do not fire", () => {
    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      node.flags.ghost = true
      canvas.startGhostPlacement(node)
      dispatchKey(document, "Escape")
      expect(windowSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("Delete and Backspace also cancel ghost placement", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    dispatchKey(document, "Delete")
    expect(canvas.state.ghostNodeId).toBeNull()
    expect(graph.getNodeById(node.id)).toBeUndefined()

    const node2 = new LGraphNode("test-2")
    node2.size = [200, 100]
    node2.flags.ghost = true
    graph.add(node2)
    canvas.startGhostPlacement(node2)
    dispatchKey(document, "Backspace")
    expect(canvas.state.ghostNodeId).toBeNull()
    expect(graph.getNodeById(node2.id)).toBeUndefined()
  })

  test("non-cancel keys do not finalize ghost placement", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      dispatchKey(document, "a")
      expect(canvas.state.ghostNodeId).toBe(node.id)
      expect(windowSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("keydown listener is removed when ghost placement finalizes", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    canvas.finalizeGhostPlacement(false)

    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      dispatchKey(document, "Escape")
      expect(windowSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("switching the active graph cancels any in-flight ghost", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    expect(canvas.state.ghostNodeId).toBe(node.id)

    canvas.setGraph(new LGraph())

    expect(canvas.state.ghostNodeId).toBeNull()
    expect(graph.getNodeById(node.id)).toBeUndefined()

    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      dispatchKey(document, "Escape")
      expect(windowSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("calling startGhostPlacement again cancels the previous ghost without leaking listeners", () => {
    node.flags.ghost = true
    canvas.startGhostPlacement(node)

    const node2 = new LGraphNode("test-2")
    node2.size = [200, 100]
    node2.flags.ghost = true
    graph.add(node2)
    canvas.startGhostPlacement(node2)

    expect(graph.getNodeById(node.id)).toBeUndefined()
    expect(canvas.state.ghostNodeId).toBe(node2.id)

    canvas.finalizeGhostPlacement(true)

    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      dispatchKey(document, "Escape")
      expect(windowSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("removes listeners and resets transient drag state when ghostNodeId was already cleared", () => {
    const processMoveSpy = vi.spyOn(canvas, "processMouseMove")
    node.flags.ghost = true
    canvas.startGhostPlacement(node)
    expect(canvas.isDragging).toBe(true)
    expect(canvas["autoPan"]).not.toBeNull()

    canvas.state.ghostNodeId = null

    canvas.finalizeGhostPlacement(true)

    expect(canvas.isDragging).toBe(false)
    expect(canvas["autoPan"]).toBeNull()

    document.dispatchEvent(new MouseEvent("pointermove"))
    expect(processMoveSpy).not.toHaveBeenCalled()

    const windowSpy = vi.fn()
    window.addEventListener("keydown", windowSpy)
    try {
      dispatchKey(document, "Escape")
      expect(windowSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("keydown", windowSpy)
    }
  })

  test("does not clobber unrelated drag state when called with no ghost in flight", () => {
    const fakeAutoPan = { stop: vi.fn() }
    canvas.isDragging = true
    canvas["autoPan"] = fakeAutoPan as unknown as (typeof canvas)["autoPan"]

    canvas.finalizeGhostPlacement(true)

    expect(canvas.isDragging).toBe(true)
    expect(canvas["autoPan"]).toBe(fakeAutoPan)
    expect(fakeAutoPan.stop).not.toHaveBeenCalled()
  })
})
