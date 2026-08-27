import { describe, expect, test } from "vitest"

import { LGraph, LGraphNode, LiteGraph } from "@/litegraph"

class NamedWidgetTestNode extends LGraphNode {
  static override type = "test/named_widgets"
  static override title = "Named Widgets"

  constructor() {
    super(NamedWidgetTestNode.title, NamedWidgetTestNode.type)
    this.addWidget("number", "first", 1, null)
    this.addWidget("number", "second", 2, null)
    this.addWidget("number", "third", 4, null)
  }
}

describe("widgetsValuesNamed", () => {
  test("serialises widgetsValuesNamed alongside widgetsValues", () => {
    LiteGraph.registerNodeType(NamedWidgetTestNode.type!, NamedWidgetTestNode)

    const graph = new LGraph()
    const node = LiteGraph.createNode(NamedWidgetTestNode.type!) as NamedWidgetTestNode
    node.serializeWidgets = true
    graph.add(node)

    const data = node.serialize()
    expect(data.widgetsValuesNamed).toEqual({
      first: 1,
      second: 2,
      third: 4,
    })
    expect(data.widgetsValues).toEqual([1, 2, 4])
  })

  test("restores from widgetsValuesNamed when namedValuesRestore is enabled", () => {
    LiteGraph.namedValuesRestore = true

    const graph = new LGraph()
    const node = LiteGraph.createNode(NamedWidgetTestNode.type!) as NamedWidgetTestNode
    node.serializeWidgets = true
    graph.add(node)

    const data = node.serialize()
    data.widgetsValuesNamed = { first: 10, second: 20, third: 40 }
    data.widgetsValues = [99, 99, 99]

    node.widgets![0].value = 0
    node.widgets![1].value = 0
    node.widgets![2].value = 0
    node.configure(data)

    expect(node.widgets![0].value).toBe(10)
    expect(node.widgets![1].value).toBe(20)
    expect(node.widgets![2].value).toBe(40)

    LiteGraph.namedValuesRestore = false
  })

  test("uses fallbackWidgetsValuesNames when namedValuesRestore is enabled", () => {
    class FallbackNode extends LGraphNode {
      static override type = "test/fallback_named"
      static override nodeData = { fallbackWidgetsValuesNames: ["alpha", "beta"] }

      constructor() {
        super("Fallback", FallbackNode.type)
        this.addWidget("number", "alpha", 0, null)
        this.addWidget("number", "beta", 0, null)
      }
    }

    LiteGraph.registerNodeType(FallbackNode.type!, FallbackNode)
    LiteGraph.namedValuesRestore = true

    const node = LiteGraph.createNode(FallbackNode.type!) as FallbackNode
    node.configure({
      id: 1,
      type: FallbackNode.type!,
      pos: [0, 0],
      size: [100, 50],
      flags: {},
      order: 0,
      mode: 0,
      widgetsValues: [5, 6],
    })

    expect(node.widgets![0].value).toBe(5)
    expect(node.widgets![1].value).toBe(6)

    LiteGraph.namedValuesRestore = false
  })

  test("falls back to positional widgetsValues when namedValuesRestore is disabled", () => {
    const graph = new LGraph()
    const node = LiteGraph.createNode(NamedWidgetTestNode.type!) as NamedWidgetTestNode
    node.serializeWidgets = true
    graph.add(node)

    const data = node.serialize()
    data.widgetsValuesNamed = { first: 10, second: 20, third: 40 }
    data.widgetsValues = [11, 22, 44]

    node.configure(data)

    expect(node.widgets![0].value).toBe(11)
    expect(node.widgets![1].value).toBe(22)
    expect(node.widgets![2].value).toBe(44)
  })
})
