import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { GraphHistory } from "@/canvas/GraphHistory"
import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LiteGraph,
  type Positionable,
  SubgraphNode,
} from "@/litegraph"

import { test as baseTest } from "../testExtensions"

class InteriorNode extends LGraphNode {
  constructor() {
    super("test/HistoryInterior")
    this.addOutput("out", "number")
    this.addInput("in", "number")
  }
}

LiteGraph.registerNodeType("test/HistoryInterior", InteriorNode)

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

async function waitForHistorySettling(): Promise<void> {
  await new Promise<void>(resolve => queueMicrotask(resolve))
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
      skipEvents: true,
      skipRender: true,
    })
    await use(canvas)
  },
  history: async ({ canvas }, use) => {
    const history = new GraphHistory(canvas)
    await waitForHistorySettling()
    await use(history)
    history.dispose()
  },
})

describe("GraphHistory subgraph operations", () => {
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

  test("captures convertToSubgraph after onAfterChange is wrapped like dirty tracking", async ({ graph, canvas }) => {
    const history = new GraphHistory(canvas)
    await waitForHistorySettling()

    const prevOnAfterChange = graph.onAfterChange
    graph.onAfterChange = (g, info) => {
      prevOnAfterChange?.(g, info)
    }

    const node = LiteGraph.createNode("test/HistoryInterior")!
    graph.add(node)
    history.reset()

    graph.convertToSubgraph(new Set<Positionable>([node]))
    await waitForHistorySettling()

    expect(history.canUndo).toBe(true)
    history.dispose()
  })

  test("captures convertToSubgraph with linked nodes as one undo step", async ({ graph, history }) => {
    const source = LiteGraph.createNode("test/HistoryInterior")!
    const target = LiteGraph.createNode("test/HistoryInterior")!
    graph.add(source)
    graph.add(target)
    source.connect(0, target, 0)
    history.reset()

    graph.convertToSubgraph(new Set<Positionable>([source, target]))
    await waitForHistorySettling()

    expect(history.canUndo).toBe(true)
    expect(history.changeCount).toBe(0)
  })

  test("captures convertToSubgraph as an undo step", async ({ graph, history }) => {
    const node = LiteGraph.createNode("test/HistoryInterior")!
    graph.add(node)
    history.reset()

    graph.convertToSubgraph(new Set<Positionable>([node]))
    await waitForHistorySettling()

    expect(history.canUndo).toBe(true)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]).toBeInstanceOf(SubgraphNode)

    history.undo()

    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]).not.toBeInstanceOf(SubgraphNode)
    expect(graph.subgraphs.size).toBe(0)
  })

  test("captures unpackSubgraph as an undo step", async ({ graph, history }) => {
    const inner = LiteGraph.createNode("test/HistoryInterior")!
    graph.add(inner)
    const { node: subgraphNode } = graph.convertToSubgraph(new Set<Positionable>([inner]))
    history.reset()

    graph.unpackSubgraph(subgraphNode)
    await waitForHistorySettling()

    expect(history.canUndo).toBe(true)
    expect(graph.nodes.some(n => n instanceof SubgraphNode)).toBe(false)

    history.undo()

    expect(graph.nodes.some(n => n instanceof SubgraphNode)).toBe(true)
    expect(graph.subgraphs.size).toBe(1)
  })
})
