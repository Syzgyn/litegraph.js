import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { GraphHistory } from "@/canvas/GraphHistory"
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"

import { test as baseTest } from "../testExtensions"

class TestNode extends LGraphNode {
  constructor() {
    super("test/HistoryNode")
    this.addOutput("out", "number")
    this.addInput("in", "number")
  }
}

class WidgetNode extends LGraphNode {
  constructor() {
    super("test/WidgetNode")
    this.addWidget("number", "count", 10, null)
  }
}

LiteGraph.registerNodeType("test/HistoryNode", TestNode)
LiteGraph.registerNodeType("test/WidgetNode", WidgetNode)

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

interface HistoryFixtures {
  graph: LGraph
  canvas: LGraphCanvas
  history: GraphHistory
}

const test = baseTest.extend<HistoryFixtures>({
  graph: async ({}, use) => {
    const graph = new LGraph()
    await use(graph)
  },
  canvas: async ({ graph }, use) => {
    const container = document.createElement("div")
    const canvasElement = document.createElement("canvas")
    container.append(canvasElement)
    canvasElement.width = 800
    canvasElement.height = 600
    canvasElement.getContext = vi.fn().mockReturnValue(createMockContext())

    const canvas = new LGraphCanvas(canvasElement, graph, {
      skip_events: true,
      skip_render: true,
    })
    await use(canvas)
  },
  history: async ({ canvas }, use) => {
    const history = new GraphHistory(canvas)
    await use(history)
    history.dispose()
  },
})

describe("GraphHistory", () => {
  beforeEach(() => {
    Object.assign(LiteGraph, {
      NODE_TITLE_HEIGHT: 20,
      NODE_SLOT_HEIGHT: 15,
      NODE_TEXT_SIZE: 14,
      isValidConnection: vi.fn().mockReturnValue(true),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("captures a single undo step when a node is added", ({ graph, history }) => {
    expect(history.canUndo).toBe(false)

    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)

    history.capture()

    expect(history.canUndo).toBe(true)
    expect(graph.nodes).toHaveLength(1)
  })

  test("undo removes an added node", ({ graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()

    history.undo()

    expect(graph.nodes).toHaveLength(0)
    expect(history.canRedo).toBe(true)
  })

  test("redo restores an undone add", ({ graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()

    history.undo()
    history.redo()

    expect(graph.nodes).toHaveLength(1)
    expect(history.canRedo).toBe(false)
  })

  test("undo restores a deleted node", ({ graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()

    graph.remove(node)
    history.capture()

    history.undo()

    expect(graph.nodes).toHaveLength(1)
    expect(graph.getNodeById(node.id)).toBeTruthy()
  })

  test("batches emitBeforeChange and emitAfterChange into one undo step", async ({ canvas, graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.reset()

    canvas.emitBeforeChange()
    node.pos[0] += 100
    canvas.emitAfterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(history.canUndo).toBe(true)
    expect(history.undoQueue).toHaveLength(1)
  })

  test("does not capture while a change transaction is open", ({ canvas, history }) => {
    canvas.emitBeforeChange()
    history.capture()

    expect(history.canUndo).toBe(false)
    canvas.emitAfterChange()
  })

  test("reset clears undo and redo stacks", ({ graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()
    history.undo()
    expect(history.canRedo).toBe(true)

    history.reset()

    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  test("keyboard undo and redo", ({ graph, history, canvas }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()

    canvas.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    )
    expect(graph.nodes).toHaveLength(0)

    canvas.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    expect(graph.nodes).toHaveLength(1)
  })

  test("does not poison undo when the graph loads after construction", async ({ graph, canvas }) => {
    const history = new GraphHistory(canvas)
    expect(history.activeState.graph.nodes).toHaveLength(0)

    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)

    graph.afterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(history.activeState.graph.nodes).toHaveLength(1)
    expect(history.canUndo).toBe(false)
  })

  test("syncs baseline when constructed after the graph already has nodes", ({ graph, canvas }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)

    const history = new GraphHistory(canvas)

    expect(history.activeState.graph.nodes).toHaveLength(1)
    expect(history.changeCount).toBe(0)
    expect(history.canUndo).toBe(false)
  })

  test("captures a move when constructed after graph load", async ({ graph, canvas }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    node.pos[0] = 10
    graph.add(node)

    const history = new GraphHistory(canvas)

    canvas.emitBeforeChange()
    graph.nodes[0].pos[0] = 200
    canvas.emitAfterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(history.canUndo).toBe(true)

    history.undo()

    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].pos[0]).toBe(10)
  })

  test("resets baseline when the graph is configured after history was created", async ({ graph, canvas }) => {
    const history = new GraphHistory(canvas)
    expect(history.activeState.graph.nodes).toHaveLength(0)

    const node = LiteGraph.createNode("test/HistoryNode")!
    node.pos[0] = 10
    node.pos[1] = 20
    graph.add(node)

    const snapshot = graph.asSerialisable()
    graph.clear()
    graph.configure(snapshot)
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(graph.nodes).toHaveLength(1)
    expect(history.canUndo).toBe(false)

    canvas.emitBeforeChange()
    graph.nodes[0].pos[0] = 200
    canvas.emitAfterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    history.undo()

    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].pos[0]).toBe(10)
  })

  test("does not push an empty baseline when the graph was populated after history was created", async ({ graph, canvas, history }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)

    canvas.emitBeforeChange()
    node.pos[0] = 100
    canvas.emitAfterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(history.canUndo).toBe(true)

    history.undo()

    expect(graph.nodes).toHaveLength(1)
  })

  test("captures link disconnect as its own undo step", async ({ graph, history }) => {
    const source = LiteGraph.createNode("test/HistoryNode")!
    const target = LiteGraph.createNode("test/HistoryNode")!
    graph.add(source)
    graph.add(target)
    source.connect(0, target, 0)
    history.reset()

    graph.beforeChange()
    target.disconnectInput(0)
    graph.afterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(history.canUndo).toBe(true)

    const targetId = target.id
    history.undo()

    expect(graph.getNodeById(targetId)!.inputs[0].link).toBeTruthy()
  })

  test("undo after node move does not clear a loaded graph", async ({ graph, canvas }) => {
    const history = new GraphHistory(canvas)

    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    graph.configure(graph.asSerialisable())
    await new Promise<void>(resolve => queueMicrotask(resolve))

    canvas.emitBeforeChange()
    graph.nodes[0].pos[0] = 150
    canvas.emitAfterChange()
    await new Promise<void>(resolve => queueMicrotask(resolve))

    history.undo()

    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].pos[0]).not.toBe(150)
  })

  test("undo and redo restore widget values", ({ graph, history }) => {
    const node = LiteGraph.createNode("test/WidgetNode")!
    graph.add(node)
    history.reset()

    const nodeId = node.id
    node.widgets![0].value = 42
    history.capture()

    node.widgets![0].value = 99
    history.capture()

    history.undo()
    expect(graph.getNodeById(nodeId)!.widgets![0].value).toBe(42)

    history.undo()
    expect(graph.getNodeById(nodeId)!.widgets![0].value).toBe(10)

    history.redo()
    expect(graph.getNodeById(nodeId)!.widgets![0].value).toBe(42)
  })

  test("dispose stops keyboard undo", ({ graph, history, canvas }) => {
    const node = LiteGraph.createNode("test/HistoryNode")!
    graph.add(node)
    history.capture()
    history.dispose()

    canvas.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    )

    expect(graph.nodes).toHaveLength(1)
  })
})
