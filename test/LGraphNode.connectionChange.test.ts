import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"

beforeAll(() => {
  LGraphCanvas.measureText = vi.fn().mockReturnValue(50)
})

describe("LGraph connection notifications", () => {
  it("fires onConnectionChange when a link is created", () => {
    const graph = new LGraph()
    const onConnectionChange = vi.fn()
    graph.onConnectionChange = onConnectionChange

    class Source extends LGraphNode {
      constructor() {
        super("Source")
        this.addOutput("out", "number")
      }
    }

    class Target extends LGraphNode {
      constructor() {
        super("Target")
        this.addInput("in", "number")
      }
    }

    LiteGraph.registerNodeType("test/source", Source)
    LiteGraph.registerNodeType("test/target", Target)

    const source = LiteGraph.createNode("test/source")!
    const target = LiteGraph.createNode("test/target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)

    expect(onConnectionChange).toHaveBeenCalledWith(source)
    expect(onConnectionChange).toHaveBeenCalledWith(target)
  })
})

describe("LiteGraph slot type colours", () => {
  afterEach(() => {
    LiteGraph.clearSlotTypeColors()
  })

  it("uses registered colours via colourGetter resolution order", () => {
    LiteGraph.registerSlotTypeColors("buffer", "#ff0000", "#00ff00")

    const defaults = { outputOn: "#111111", outputOff: "#222222" }
    const byType: Record<string, string> = {}
    const byTypeOff: Record<string, string> = {}

    const getConnectedColor = (type: string) =>
      byType[type] ||
      LiteGraph.slotTypeColors[type]?.colorOn ||
      defaults.outputOn

    const getDisconnectedColor = (type: string) =>
      byTypeOff[type] ||
      LiteGraph.slotTypeColors[type]?.colorOff ||
      byType[type] ||
      LiteGraph.slotTypeColors[type]?.colorOn ||
      defaults.outputOff

    expect(getConnectedColor("buffer")).toBe("#ff0000")
    expect(getDisconnectedColor("buffer")).toBe("#00ff00")

    byType["buffer"] = "#aaaaaa"
    expect(getConnectedColor("buffer")).toBe("#aaaaaa")
  })
})

describe("LGraphNode.onSlotsConfigured", () => {
  it("is called after configure restores slots", () => {
    const graph = new LGraph()
    const onSlotsConfigured = vi.fn()

    class Node extends LGraphNode {
      constructor() {
        super("Node")
        this.addInput("in", "number")
        this.onSlotsConfigured = onSlotsConfigured
      }
    }

    LiteGraph.registerNodeType("test/slots", Node)

    const node = LiteGraph.createNode("test/slots")!
    graph.add(node)
    const serialised = node.serialize()

    const reloaded = LiteGraph.createNode("test/slots")!
    graph.add(reloaded)
    reloaded.configure(serialised)

    expect(onSlotsConfigured).toHaveBeenCalledTimes(1)
  })
})

describe("connection gesture depth", () => {
  it("tracks reposition gestures and fires onConnectionGestureEnd", () => {
    const graph = new LGraph()
    const onConnectionGestureEnd = vi.fn()
    graph.onConnectionGestureEnd = onConnectionGestureEnd

    expect(graph.isConnectionGestureActive).toBe(false)
    graph.beginConnectionGesture()
    expect(graph.isConnectionGestureActive).toBe(true)
    graph.endConnectionGesture()
    expect(graph.isConnectionGestureActive).toBe(false)
    expect(onConnectionGestureEnd).toHaveBeenCalledTimes(1)
  })
})
