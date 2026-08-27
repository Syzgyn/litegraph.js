import type { ISerialisedGraph } from "@/litegraph"

import { describe, expect, test } from "vitest"

import { LGraph, LGraphNode, LiteGraph, renameWidget } from "@/litegraph"
import { createUuidv4 } from "@/utils/uuid"

class LabelledWidgetNode extends LGraphNode {
  static override title = "LabelledWidget"

  constructor() {
    super("LabelledWidget")
    this.serialize_widgets = true
    this.addWidget("text", "text", "a cat", null)
    const input = this.addInput("text", "STRING")
    input.widget = { name: "text" }
  }
}

LiteGraph.registerNodeType("test/LabelledWidget", LabelledWidgetNode)

/**
 * `configure` adopts the payload's graph id when it is not `zeroUuid` on a root graph.
 * Widget display labels are serialised on input slots; without syncing them back onto widgets
 * after configure, a reload can leave stale `IBaseWidget.label` values on in-memory widget instances.
 */
describe("LGraph.configure restores widget labels from the payload", () => {
  function addLabelledNode(graph: LGraph, label: string) {
    const node = LiteGraph.createNode("test/LabelledWidget")!
    graph.add(node)
    renameWidget(node.widgets![0], node, label)
    return node
  }

  function serializeToJson(graph: LGraph): ISerialisedGraph {
    return JSON.parse(JSON.stringify(graph.serialize())) as ISerialisedGraph
  }

  test("a reloaded widget label is read from the payload, never inherited from a stale widget", () => {
    const graphId = createUuidv4()
    const graph = new LGraph()
    graph.id = graphId
    const dropped = addLabelledNode(graph, "Dropped Label")
    const kept = addLabelledNode(graph, "Kept Label")

    const payload = serializeToJson(graph)
    const droppedData = payload.nodes.find(
      n => String(n.id) === String(dropped.id),
    )!
    delete droppedData.inputs![0].label

    const restored = new LGraph()
    restored.configure(payload)

    expect(restored.id).toBe(graphId)
    expect(restored.getNodeById(dropped.id)!.widgets![0].label).toBeUndefined()
    expect(restored.getNodeById(kept.id)!.widgets![0].label).toBe("Kept Label")
  })

  test("re-configuring a node clears a widget label removed from the payload", () => {
    const node = LiteGraph.createNode("test/LabelledWidget")!
    renameWidget(node.widgets![0], node, "First Label")

    const withLabel = JSON.parse(JSON.stringify(node.serialize()))
    node.configure(withLabel)
    expect(node.widgets![0].label).toBe("First Label")

    const withoutLabel = JSON.parse(JSON.stringify(withLabel))
    delete withoutLabel.inputs[0].label
    node.configure(withoutLabel)

    expect(node.widgets![0].label).toBeUndefined()
    expect(node.inputs![0].label).toBeUndefined()
  })
})
