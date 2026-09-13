import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"

describe("slot label resize", () => {
  beforeEach(() => {
    Object.assign(LiteGraph, {
      NODE_TITLE_HEIGHT: 20,
      NODE_SLOT_HEIGHT: 15,
      NODE_TEXT_SIZE: 14,
      NODE_WIDTH: 140,
    })
    LGraphCanvas.measureText = vi.fn().mockImplementation((text: string) => text.length * 8)
  })

  afterEach(() => {
    LGraphCanvas.measureText = undefined
    vi.restoreAllMocks()
  })

  test("expandToFitContent grows the node when a slot label is lengthened", () => {
    const graph = new LGraph()
    const node = new LGraphNode("Test")
    graph.add(node)

    node.addOutput("out", "STRING", { label: "a" })
    const initialWidth = node.size[0]

    const output = node.outputs![0]
    output.label = "a much longer output label"
    node.expandToFitContent()

    expect(node.size[0]).toBeGreaterThan(initialWidth)
  })

  test("expandToFitContent grows the node when an input slot label is lengthened", () => {
    const graph = new LGraph()
    const node = new LGraphNode("Test")
    graph.add(node)

    node.addInput("in", "STRING", { label: "x" })
    const initialWidth = node.size[0]

    const input = node.inputs![0]
    input.label = "a much longer input label"
    node.expandToFitContent()

    expect(node.size[0]).toBeGreaterThan(initialWidth)
  })
})
