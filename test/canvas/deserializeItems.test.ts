import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"

class SimpleNode extends LGraphNode {
  constructor() {
    super("Simple")
  }
}

LiteGraph.registerNodeType("test/simple", SimpleNode)

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

describe("LGraphCanvas.serializeItems / deserializeItems", () => {
  let canvasElement: HTMLCanvasElement | undefined

  beforeEach(() => {
    Object.assign(LiteGraph, {
      NODE_TITLE_HEIGHT: 20,
      NODE_SLOT_HEIGHT: 15,
      NODE_TEXT_SIZE: 14,
      isValidConnection: vi.fn().mockReturnValue(true),
    })
  })

  afterEach(() => {
    canvasElement?.remove()
    canvasElement = undefined
  })

  function createCanvas(graph: LGraph): LGraphCanvas {
    canvasElement = document.createElement("canvas")
    canvasElement.width = 800
    canvasElement.height = 600
    canvasElement.getContext = vi.fn().mockReturnValue(createMockContext())
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
    document.body.append(canvasElement)
    return new LGraphCanvas(canvasElement, graph, { skipRender: true, skipEvents: true })
  }

  test("deserializeItems duplicates nodes with new ids", () => {
    const graph = new LGraph()
    const canvas = createCanvas(graph)
    const node = LiteGraph.createNode("test/simple")!
    node.pos = [10, 20]
    graph.add(node)

    const payload = canvas.serializeItems([node])
    const result = canvas.deserializeItems(payload, { position: [100, 100] })

    expect(result).toBeDefined()
    const pasted = [...result!.nodes.values()][0]
    expect(pasted.id).not.toBe(node.id)
    expect(pasted.type).toBe("test/simple")
    expect(pasted.pos[0]).toBe(100)
    expect(pasted.pos[1]).toBe(100)
    expect(graph.getNodeById(pasted.id)).toBe(pasted)
  })
})
