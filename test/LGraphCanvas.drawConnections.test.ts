import { afterEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"
import { LLink } from "@/LLink"

function createMockCtx(): CanvasRenderingContext2D {
  return {
    lineWidth: 1,
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    translate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    roundRect: vi.fn(),
    getTransform: vi.fn().mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    isPointInStroke: vi.fn().mockReturnValue(false),
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D
}

function createTestLink(
  graph: LGraph,
  sourceNode: LGraphNode,
  outputSlot: number,
  targetNode: LGraphNode,
  inputSlot: number,
): LLink {
  const linkId = ++graph.state.lastLinkId
  const link = new LLink(
    linkId,
    sourceNode.outputs[outputSlot].type,
    sourceNode.id,
    outputSlot,
    targetNode.id,
    inputSlot,
  )
  graph.links.set(linkId, link)
  sourceNode.outputs[outputSlot].links ??= []
  sourceNode.outputs[outputSlot].links!.push(linkId)
  targetNode.inputs[inputSlot].link = linkId
  return link
}

describe("drawConnections widget-input slot positioning", () => {
  let graph: LGraph
  let canvas: LGraphCanvas
  let canvasElement: HTMLCanvasElement

  afterEach(() => {
    for (const el of document.querySelectorAll("canvas")) el.remove()
  })

  test("arranges widget-input slots before rendering links", () => {
    canvasElement = document.createElement("canvas")
    canvasElement.width = 800
    canvasElement.height = 600
    canvasElement.getContext = vi.fn().mockReturnValue(createMockCtx())
    canvasElement.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })

    graph = new LGraph()
    canvas = new LGraphCanvas(canvasElement, graph, { skipRender: true })

    const sourceNode = new LGraphNode("Source")
    sourceNode.pos = [0, 100]
    sourceNode.size = [150, 60]
    sourceNode.addOutput("out", "STRING")
    graph.add(sourceNode)

    const targetNode = new LGraphNode("Target")
    targetNode.pos = [300, 100]
    targetNode.size = [200, 120]
    const widget = targetNode.addWidget("text", "value", "", null)
    const input = targetNode.addInput("value", "STRING")
    input.widget = { name: "value" }
    graph.add(targetNode)

    createTestLink(graph, sourceNode, 0, targetNode, 0)

    expect(input.pos).toBeUndefined()

    canvas.drawConnections(createMockCtx())

    expect(input.pos).toBeDefined()
    expect(input.pos![1]).toBeGreaterThan(0)

    const offset = LiteGraph.NODE_SLOT_HEIGHT * 0.5
    expect(input.pos![1]).toBe(widget.y + offset)
  })

  test("does not re-arrange nodes whose widget-input slots already have positions", () => {
    canvasElement = document.createElement("canvas")
    canvasElement.width = 800
    canvasElement.height = 600
    canvasElement.getContext = vi.fn().mockReturnValue(createMockCtx())
    canvasElement.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })

    graph = new LGraph()
    canvas = new LGraphCanvas(canvasElement, graph, { skipRender: true })

    const sourceNode = new LGraphNode("Source")
    sourceNode.pos = [0, 100]
    sourceNode.size = [150, 60]
    sourceNode.addOutput("out", "STRING")
    graph.add(sourceNode)

    const targetNode = new LGraphNode("Target")
    targetNode.pos = [300, 100]
    targetNode.size = [200, 120]
    targetNode.addWidget("text", "value", "", null)
    const input = targetNode.addInput("value", "STRING")
    input.widget = { name: "value" }
    graph.add(targetNode)

    createTestLink(graph, sourceNode, 0, targetNode, 0)

    targetNode.setConcreteSlots()
    targetNode.arrange()
    expect(input.pos).toBeDefined()

    const arrangeSpy = vi.spyOn(targetNode, "arrange")

    canvas.drawConnections(createMockCtx())

    expect(arrangeSpy).not.toHaveBeenCalled()
  })

  test("positions widget-input slots when display name differs from slot.widget.name", () => {
    canvasElement = document.createElement("canvas")
    canvasElement.width = 800
    canvasElement.height = 600
    canvasElement.getContext = vi.fn().mockReturnValue(createMockCtx())
    canvasElement.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })

    graph = new LGraph()
    canvas = new LGraphCanvas(canvasElement, graph, { skipRender: true })

    const sourceNode = new LGraphNode("Source")
    sourceNode.pos = [0, 100]
    sourceNode.size = [150, 60]
    sourceNode.addOutput("out", "STRING")
    graph.add(sourceNode)

    const targetNode = new LGraphNode("Target")
    targetNode.pos = [300, 100]
    targetNode.size = [200, 120]

    const widget = targetNode.addWidget("text", "renamed_label", "", null)
    const input = targetNode.addInput("renamed_label", "STRING")
    input.widget = { name: "original_name" }
    input._widget = widget

    graph.add(targetNode)
    createTestLink(graph, sourceNode, 0, targetNode, 0)

    canvas.drawConnections(createMockCtx())

    expect(input.pos).toBeDefined()
    const offset = LiteGraph.NODE_SLOT_HEIGHT * 0.5
    expect(input.pos![1]).toBe(widget.y + offset)
  })
})
