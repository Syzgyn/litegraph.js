import type { ExportedSubgraphInstance, Positionable } from "@/litegraph"

import { afterEach, describe, expect, test } from "vitest"

import { LGraphNode, LiteGraph, Subgraph, SubgraphNode } from "@/litegraph"
import { toConcreteWidget } from "@/widgets/widgetMap"

import { createTestSubgraph } from "./fixtures/subgraphHelpers"

const registeredTypes: string[] = []

function registerInteriorNodeType(): void {
  LiteGraph.registerNodeType("test/interior", LGraphNode)
  registeredTypes.push("test/interior")
}

function registerSubgraphNodeType(subgraph: Subgraph): void {
  const instanceData: ExportedSubgraphInstance = {
    id: -1,
    type: subgraph.id,
    pos: [0, 0],
    size: [100, 100],
    inputs: [],
    outputs: [],
    flags: {},
    order: 0,
    mode: 0,
  }

  const NodeClass = class extends SubgraphNode {
    constructor() {
      super(subgraph.rootGraph, subgraph, instanceData)
    }
  }
  Object.defineProperty(NodeClass, "title", { value: subgraph.name })
  LiteGraph.registerNodeType(subgraph.id, NodeClass)
  registeredTypes.push(subgraph.id)
}

afterEach(() => {
  for (const type of registeredTypes) LiteGraph.unregisterNodeType(type)
  registeredTypes.length = 0
})

function createInteriorNodeWithWidget(
  title: string,
  widgetName: string,
  value: string,
) {
  const node = LiteGraph.createNode("test/interior", title) as LGraphNode
  const input = node.addInput("in", "*")
  node.addOutput("out", "*")

  const widget = toConcreteWidget({
    name: widgetName,
    type: "text",
    value,
    y: 0,
    options: {},
    node,
  }, node)
  node.widgets = [widget]
  input.widget = { name: widget.name }

  return node
}

function setupParentSubgraphWithWidgets() {
  registerInteriorNodeType()

  const parentSubgraph = createTestSubgraph({
    name: "Parent Subgraph",
    inputs: [{ name: "input", type: "*" }],
    outputs: [{ name: "output", type: "*" }],
  })
  const rootGraph = parentSubgraph.rootGraph

  rootGraph.events.addEventListener("subgraph-created", (e) => {
    registerSubgraphNodeType(e.detail.subgraph)
  })

  const interiorNode = createInteriorNodeWithWidget("Interior Node", "prompt", "hello world")
  parentSubgraph.add(interiorNode)
  parentSubgraph.inputNode.slots[0].connect(interiorNode.inputs[0], interiorNode)

  registerSubgraphNodeType(parentSubgraph)
  const hostNode = new SubgraphNode(rootGraph, parentSubgraph, {
    id: 1,
    type: parentSubgraph.id,
    pos: [0, 0],
    size: [200, 100],
    inputs: [],
    outputs: [],
    flags: {},
    mode: 0,
    order: 0,
  })
  hostNode.serializeWidgets = true
  rootGraph.add(hostNode)

  return { rootGraph, parentSubgraph, interiorNode, hostNode }
}

describe("nested pack promoted widget values", () => {
  test("preserves host value when source is converted to nested subgraph", () => {
    const { parentSubgraph, interiorNode, hostNode } = setupParentSubgraphWithWidgets()

    hostNode.widgets[0].value = "host value"
    parentSubgraph.convertToSubgraph(new Set<Positionable>([interiorNode]))

    expect(hostNode.widgets).toHaveLength(1)
    expect(hostNode.widgets[0].value).toBe("host value")
  })

  test("preserves host promoted widget values when packing interior nodes into nested subgraph", () => {
    const { parentSubgraph, interiorNode, hostNode } = setupParentSubgraphWithWidgets()

    expect(hostNode.widgets).toHaveLength(1)
    expect(hostNode.widgets[0].value).toBe("hello world")

    parentSubgraph.convertToSubgraph(new Set<Positionable>([interiorNode]))

    expect(hostNode.widgets).toHaveLength(1)
    expect(hostNode.widgets[0].value).toBe("hello world")
    expect(hostNode.serialize().widgetsValues?.[0]).toBe("hello world")
  })

  test("preserves promotions that reference non-moved nodes", () => {
    const { parentSubgraph, interiorNode, hostNode } = setupParentSubgraphWithWidgets()

    const remainingNode = createInteriorNodeWithWidget("Remaining Node", "widget_b", "b")
    parentSubgraph.add(remainingNode)

    parentSubgraph.convertToSubgraph(new Set<Positionable>([interiorNode]))

    expect(hostNode.widgets).toHaveLength(1)
    expect(hostNode.widgets[0].name).toBe("input")
    expect(hostNode.widgets[0].value).toBe("hello world")
  })

  test("refreshes bindings on all host instances of the same subgraph type", () => {
    const { rootGraph, parentSubgraph, interiorNode } = setupParentSubgraphWithWidgets()

    const hostNode1 = new SubgraphNode(rootGraph, parentSubgraph, {
      id: 2,
      type: parentSubgraph.id,
      pos: [0, 0],
      size: [200, 100],
      inputs: [],
      outputs: [],
      flags: {},
      mode: 0,
      order: 0,
    })
    const hostNode2 = new SubgraphNode(rootGraph, parentSubgraph, {
      id: 3,
      type: parentSubgraph.id,
      pos: [100, 0],
      size: [200, 100],
      inputs: [],
      outputs: [],
      flags: {},
      mode: 0,
      order: 0,
    })
    rootGraph.add(hostNode1)
    rootGraph.add(hostNode2)

    parentSubgraph.convertToSubgraph(new Set<Positionable>([interiorNode]))

    expect(hostNode1.widgets).toHaveLength(1)
    expect(hostNode1.widgets[0].value).toBe("hello world")
    expect(hostNode2.widgets).toHaveLength(1)
    expect(hostNode2.widgets[0].value).toBe("hello world")
  })
})
