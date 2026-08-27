import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph, renameWidget } from "@/litegraph"

class ClipTextEncodeLikeNode extends LGraphNode {
  static override title = "CLIPTextEncodeLike"

  constructor() {
    super("CLIPTextEncodeLike")
    this.serialize_widgets = true
    this.addWidget("text", "text", "a cat", null)
    const input = this.addInput("text", "STRING")
    input.widget = { name: "text" }
  }
}

LiteGraph.registerNodeType("test/CLIPTextEncodeLike", ClipTextEncodeLikeNode)

function createLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
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

/**
 * Regression #13861: a renamed widget label reverted to its default on
 * save/reload, delete/undo, and copy/paste for normal (input-backed) nodes.
 */
describe("renameWidget label persistence via input lookup (regression #13861)", () => {
  let canvasElement: HTMLCanvasElement | undefined

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock())
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
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  function addClipNode(graph: LGraph): LGraphNode {
    const node = LiteGraph.createNode("test/CLIPTextEncodeLike")!
    graph.add(node)
    return node
  }

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
    return new LGraphCanvas(canvasElement, graph, { skip_render: true, skip_events: true })
  }

  test("renameWidget writes the label onto the normal-node backing input", () => {
    const graph = new LGraph()
    const node = addClipNode(graph)
    const widget = node.widgets![0]
    const input = node.inputs![0]

    expect(input.widget?.name).toBe("text")

    renameWidget(widget, node, "Positive Prompt")

    expect(input.label).toBe("Positive Prompt")
  })

  test("label survives a full graph serialize -> configure round-trip", () => {
    const graph = new LGraph()
    const node = addClipNode(graph)
    renameWidget(node.widgets![0], node, "Positive Prompt")

    const restored = new LGraph()
    restored.configure(graph.serialize())

    const restoredNode = restored.getNodeById(node.id)!
    expect(restoredNode.widgets![0].label).toBe("Positive Prompt")
  })

  test("label survives delete -> undo", () => {
    const graph = new LGraph()
    const node = addClipNode(graph)
    renameWidget(node.widgets![0], node, "Positive Prompt")

    const undoSnapshot = graph.serialize()
    graph.remove(node)
    expect(graph.getNodeById(node.id)).toBeFalsy()

    const restored = new LGraph()
    restored.configure(undoSnapshot)

    expect(restored.getNodeById(node.id)!.widgets![0].label).toBe("Positive Prompt")
  })

  test("clearing a rename reverts the label to its default after round-trip", () => {
    const graph = new LGraph()
    const node = addClipNode(graph)
    renameWidget(node.widgets![0], node, "Positive Prompt")
    renameWidget(node.widgets![0], node, "")

    expect(node.inputs![0].label).toBeUndefined()

    const restored = new LGraph()
    restored.configure(graph.serialize())

    expect(restored.getNodeById(node.id)!.widgets![0].label).toBeUndefined()
  })

  test("label survives copy -> paste", () => {
    const graph = new LGraph()
    const canvas = createCanvas(graph)
    const node = addClipNode(graph)
    renameWidget(node.widgets![0], node, "Positive Prompt")

    canvas.copyToClipboard([node])
    const pasted = canvas.pasteFromClipboard({ position: [50, 50] })!

    const pastedNode = [...pasted.nodes.values()][0]
    expect(pastedNode.widgets![0].label).toBe("Positive Prompt")
  })
})
