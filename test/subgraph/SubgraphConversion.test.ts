import type { ISlotType, Positionable } from "@/litegraph"

import { afterEach, assert, describe, expect, test } from "vitest"

import { LGraph, LGraphNode, LiteGraph, SubgraphNode } from "@/litegraph"

import { createTestSubgraph, createTestSubgraphNode } from "./fixtures/subgraphHelpers"

const NODE_TYPE = "test/subgraph-unpack-interior"

class InteriorTestNode extends LGraphNode {
  constructor(title?: string) {
    super(title ?? "Interior")
  }
}

function registerInteriorNode(inputs: ISlotType[] = [], outputs: ISlotType[] = []) {
  LiteGraph.registerNodeType(NODE_TYPE, class extends InteriorTestNode {
    constructor(title?: string) {
      super(title)
      let i = 0
      for (const type of inputs) this.addInput(`input_${i++}`, type)
      let o = 0
      for (const type of outputs) this.addOutput(`output_${o++}`, type)
    }
  })
}

function createInteriorNode(
  graph: LGraph,
  inputs: ISlotType[] = [],
  outputs: ISlotType[] = [],
  title?: string,
) {
  registerInteriorNode(inputs, outputs)
  const node = LiteGraph.createNode(NODE_TYPE, title)
  if (!node) throw new Error("Failed to create node")
  graph.add(node)
  return node
}

afterEach(() => {
  LiteGraph.unregisterNodeType(NODE_TYPE)
})

describe("SubgraphConversion", () => {
  describe("convertToSubgraph", () => {
    test("creates a subgraph node without manual type registration", () => {
      const graph = new LGraph()
      const node = createInteriorNode(graph, [], ["number"], "Packed Node")

      const { subgraph, node: subgraphNode } = graph.convertToSubgraph(
        new Set<Positionable>([node]),
      )

      expect(subgraphNode).toBeInstanceOf(SubgraphNode)
      expect(subgraphNode.type).toBe(subgraph.id)
      expect(graph.nodes).toEqual([subgraphNode])
      expect(graph.subgraphs.get(subgraph.id)).toBe(subgraph)
      expect(subgraph.nodes.length).toBe(1)
      expect(LiteGraph.registeredNodeTypes[subgraph.id]).toBeDefined()

      LiteGraph.unregisterNodeType(subgraph.id)
    })
  })

  describe("Subgraph Unpacking Functionality", () => {
    test("keeps interior nodes and links", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)
      const graph = subgraphNode.graph!
      graph.add(subgraphNode)

      const node1 = createInteriorNode(subgraph, [], ["number"])
      const node2 = createInteriorNode(subgraph, ["number"])
      node1.connect(0, node2, 0)

      graph.unpackSubgraph(subgraphNode)

      expect(graph.nodes.length).toBe(2)
      expect(graph.links.size).toBe(1)
    })

    test("merges boundary links", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "value", type: "number" }],
        outputs: [{ name: "value", type: "number" }],
      })
      const subgraphNode = createTestSubgraphNode(subgraph)
      const graph = subgraphNode.graph!
      graph.add(subgraphNode)

      const innerNode1 = createInteriorNode(subgraph, [], ["number"])
      const innerNode2 = createInteriorNode(subgraph, ["number"], [])
      subgraph.inputNode.slots[0].connect(innerNode2.inputs[0], innerNode2)
      subgraph.outputNode.slots[0].connect(innerNode1.outputs[0], innerNode1)

      const outerNode1 = createInteriorNode(graph, [], ["number"])
      const outerNode2 = createInteriorNode(graph, ["number"])
      outerNode1.connect(0, subgraphNode, 0)
      subgraphNode.connect(0, outerNode2, 0)

      graph.unpackSubgraph(subgraphNode)

      expect(graph.nodes.length).toBe(4)
      expect(graph.links.size).toBe(2)
    })

    test("keeps reroutes", () => {
      const subgraph = createTestSubgraph({
        outputs: [{ name: "value", type: "number" }],
      })
      const subgraphNode = createTestSubgraphNode(subgraph)
      const graph = subgraphNode.graph!
      graph.add(subgraphNode)

      const inner = createInteriorNode(subgraph, [], ["number"])
      const innerLink = subgraph.outputNode.slots[0].connect(
        inner.outputs[0],
        inner,
      )
      assert(innerLink)

      const outer = createInteriorNode(graph, ["number"])
      const outerLink = subgraphNode.connect(0, outer, 0)
      assert(outerLink)

      subgraph.createReroute([10, 10], innerLink)
      graph.createReroute([10, 10], outerLink)

      graph.unpackSubgraph(subgraphNode)

      expect(graph.reroutes.size).toBe(2)
    })

    test("maps reroutes onto split outputs", () => {
      const subgraph = createTestSubgraph({
        outputs: [
          { name: "value1", type: "number" },
          { name: "value2", type: "number" },
        ],
      })
      const subgraphNode = createTestSubgraphNode(subgraph)
      const graph = subgraphNode.graph!
      graph.add(subgraphNode)

      const inner = createInteriorNode(subgraph, [], ["number", "number"])
      const innerLink1 = subgraph.outputNode.slots[0].connect(
        inner.outputs[0],
        inner,
      )
      const innerLink2 = subgraph.outputNode.slots[1].connect(
        inner.outputs[1],
        inner,
      )
      const outer1 = createInteriorNode(graph, ["number"])
      const outer2 = createInteriorNode(graph, ["number"])
      const outer3 = createInteriorNode(graph, ["number"])
      const outerLink1 = subgraphNode.connect(0, outer1, 0)
      assert(innerLink1 && innerLink2 && outerLink1)
      subgraphNode.connect(0, outer2, 0)
      subgraphNode.connect(1, outer3, 0)

      subgraph.createReroute([10, 10], innerLink1)
      subgraph.createReroute([10, 20], innerLink2)
      graph.createReroute([10, 10], outerLink1)

      graph.unpackSubgraph(subgraphNode)

      expect(graph.reroutes.size).toBe(3)
      expect(graph.links.size).toBe(3)
      let linkRefCount = 0
      for (const reroute of graph.reroutes.values()) {
        linkRefCount += reroute.linkIds.size
      }
      expect(linkRefCount).toBe(4)
    })

    test("maps reroutes onto split inputs", () => {
      const subgraph = createTestSubgraph({
        inputs: [
          { name: "value1", type: "number" },
          { name: "value2", type: "number" },
        ],
      })
      const subgraphNode = createTestSubgraphNode(subgraph)
      const graph = subgraphNode.graph!
      graph.add(subgraphNode)

      const inner1 = createInteriorNode(subgraph, ["number", "number"])
      const inner2 = createInteriorNode(subgraph, ["number"])
      const innerLink1 = subgraph.inputNode.slots[0].connect(
        inner1.inputs[0],
        inner1,
      )
      const innerLink2 = subgraph.inputNode.slots[1].connect(
        inner1.inputs[1],
        inner1,
      )
      const innerLink3 = subgraph.inputNode.slots[1].connect(
        inner2.inputs[0],
        inner2,
      )
      assert(innerLink1 && innerLink2 && innerLink3)
      const outer = createInteriorNode(graph, [], ["number"])
      const outerLink1 = outer.connect(0, subgraphNode, 0)
      const outerLink2 = outer.connect(0, subgraphNode, 1)
      assert(outerLink1 && outerLink2)

      graph.createReroute([10, 10], outerLink1)
      graph.createReroute([10, 20], outerLink2)
      subgraph.createReroute([10, 10], innerLink1)

      graph.unpackSubgraph(subgraphNode)

      expect(graph.reroutes.size).toBe(3)
      expect(graph.links.size).toBe(3)
      let linkRefCount = 0
      for (const reroute of graph.reroutes.values()) {
        linkRefCount += reroute.linkIds.size
      }
      expect(linkRefCount).toBe(4)
    })
  })
})
