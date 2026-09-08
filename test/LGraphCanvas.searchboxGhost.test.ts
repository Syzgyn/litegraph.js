import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"

const NODE_TYPE = "test/searchboxGhost"

class SearchboxGhostNode extends LGraphNode {
  static title = "Searchbox Ghost"
}

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

function createHarness() {
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
  LGraphCanvas.activeCanvas = canvas
  canvas.followCursorWhenAddingNodes = true

  return { canvas, canvasElement, graph }
}

function openEventAt(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent("dblclick", { clientX, clientY, bubbles: true })
}

describe("LGraphCanvas showSearchbox ghost placement", () => {
  let canvas: LGraphCanvas
  let canvasElement: HTMLCanvasElement
  let graph: LGraph

  beforeEach(() => {
    LiteGraph.registerNodeType(NODE_TYPE, SearchboxGhostNode)
    ;({ canvas, canvasElement, graph } = createHarness())
  })

  afterEach(() => {
    canvas.searchBox?.close()
    if (canvas.state.ghostNodeId != null) canvas.finalizeGhostPlacement(true)
    LiteGraph.unregisterNodeType(NODE_TYPE)
    canvasElement.remove()
  })

  test("positions ghost node at current cursor after pointer moved while search is open", async () => {
    canvas.showSearchbox(openEventAt(100, 100))

    const input = canvas.searchBox?.querySelector<HTMLInputElement>(":scope input.value")
    expect(input).toBeTruthy()
    input!.value = NODE_TYPE
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))

    await vi.waitFor(() => {
      expect(canvas.searchBox?.querySelector(":scope .lite-search-item")).toBeTruthy()
    })

    canvas.mouse[0] = 400
    canvas.mouse[1] = 300
    canvas.graphMouse[0] = 400
    canvas.graphMouse[1] = 300
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    const ghostId = canvas.state.ghostNodeId
    expect(ghostId).not.toBeNull()

    const ghostNode = graph.getNodeById(ghostId!)
    expect(ghostNode).toBeTruthy()

    // Node center should align with cursor x; y offset matches startGhostPlacement (+10)
    expect(ghostNode!.pos[0] + ghostNode!.size[0] / 2).toBeCloseTo(400, 0)
    expect(ghostNode!.pos[1]).toBeCloseTo(310, 0)
  })
})
