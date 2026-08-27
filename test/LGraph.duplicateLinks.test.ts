import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { LGraph, LGraphNode, LiteGraph, LLink } from "@/litegraph"

import { createTestSubgraphData } from "./subgraph/fixtures/subgraphHelpers"

const NODE_TYPE = "test/DupTestNode"

class TestNode extends LGraphNode {
  constructor(title?: string) {
    super(title ?? "TestNode")
    this.addInput("input_0", "number")
    this.addOutput("output_0", "number")
  }
}

describe("_removeDuplicateLinks", () => {
  beforeEach(() => {
    LiteGraph.registerNodeType(NODE_TYPE, TestNode)
  })

  afterEach(() => {
    LiteGraph.unregisterNodeType(NODE_TYPE)
  })

  test("removes orphaned duplicate links from _links and output.links", () => {
    const graph = new LGraph()

    const source = LiteGraph.createNode(NODE_TYPE, "Source")!
    const target = LiteGraph.createNode(NODE_TYPE, "Target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)
    expect(graph.links.size).toBe(1)

    const existingLink = graph.links.values().next().value!
    for (let i = 0; i < 3; i++) {
      const dupLink = new LLink(
        ++graph.state.lastLinkId,
        existingLink.type,
        existingLink.origin_id,
        existingLink.origin_slot,
        existingLink.target_id,
        existingLink.target_slot,
      )
      graph.links.set(dupLink.id, dupLink)
      source.outputs[0].links!.push(dupLink.id)
    }

    expect(graph.links.size).toBe(4)
    expect(source.outputs[0].links).toHaveLength(4)

    graph.removeDuplicateLinks()

    expect(graph.links.size).toBe(1)
    expect(source.outputs[0].links).toHaveLength(1)
    expect(target.inputs[0].link).toBe(source.outputs[0].links![0])
  })

  test("keeps the link referenced by input.link", () => {
    const graph = new LGraph()

    const source = LiteGraph.createNode(NODE_TYPE, "Source")!
    const target = LiteGraph.createNode(NODE_TYPE, "Target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)
    const keptLinkId = target.inputs[0].link!

    const dupLink = new LLink(
      ++graph.state.lastLinkId,
      "number",
      source.id,
      0,
      target.id,
      0,
    )
    graph.links.set(dupLink.id, dupLink)
    source.outputs[0].links!.push(dupLink.id)

    graph.removeDuplicateLinks()

    expect(graph.links.size).toBe(1)
    expect(target.inputs[0].link).toBe(keptLinkId)
    expect(graph.links.has(keptLinkId)).toBe(true)
    expect(graph.links.has(dupLink.id)).toBe(false)
  })

  test("keeps the valid link when input.link is at a shifted slot index", () => {
    const graph = new LGraph()

    const source = LiteGraph.createNode(NODE_TYPE, "Source")!
    const target = LiteGraph.createNode(NODE_TYPE, "Target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)
    const validLinkId = target.inputs[0].link!
    expect(graph.links.has(validLinkId)).toBe(true)

    target.addInput("extra_widget", "number")
    const connectedInput = target.inputs[0]
    target.inputs[0] = target.inputs[1]
    target.inputs[1] = connectedInput

    const dupLink = new LLink(
      ++graph.state.lastLinkId,
      "number",
      source.id,
      0,
      target.id,
      0,
    )
    graph.links.set(dupLink.id, dupLink)
    source.outputs[0].links!.push(dupLink.id)

    expect(graph.links.size).toBe(2)

    graph.removeDuplicateLinks()

    expect(graph.links.size).toBe(1)
    expect(graph.links.has(validLinkId)).toBe(true)
    expect(graph.links.has(dupLink.id)).toBe(false)
    expect(target.inputs[1].link).toBe(validLinkId)
  })

  test("repairs input.link when it points to a removed duplicate", () => {
    const graph = new LGraph()

    const source = LiteGraph.createNode(NODE_TYPE, "Source")!
    const target = LiteGraph.createNode(NODE_TYPE, "Target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)

    const dupLink = new LLink(
      ++graph.state.lastLinkId,
      "number",
      source.id,
      0,
      target.id,
      0,
    )
    graph.links.set(dupLink.id, dupLink)
    source.outputs[0].links!.push(dupLink.id)

    target.inputs[0].link = dupLink.id

    graph.removeDuplicateLinks()

    expect(graph.links.size).toBe(1)
    const survivingId = graph.links.keys().next().value!
    expect(target.inputs[0].link).toBe(survivingId)
    expect(graph.links.has(target.inputs[0].link!)).toBe(true)
  })

  test("is a no-op when no duplicates exist", () => {
    const graph = new LGraph()

    const source = LiteGraph.createNode(NODE_TYPE, "Source")!
    const target = LiteGraph.createNode(NODE_TYPE, "Target")!
    graph.add(source)
    graph.add(target)

    source.connect(0, target, 0)
    const linksBefore = graph.links.size

    graph.removeDuplicateLinks()

    expect(graph.links.size).toBe(linksBefore)
  })

  test("cleans up duplicate links in subgraph during configure", () => {
    const subgraphData = createTestSubgraphData()
    const rootGraph = new LGraph()
    const subgraph = rootGraph.createSubgraph(subgraphData)

    const source = new LGraphNode("Source")
    source.addOutput("out", "number")
    const target = new LGraphNode("Target")
    target.addInput("in", "number")
    subgraph.add(source)
    subgraph.add(target)

    source.connect(0, target, 0)
    expect(subgraph.links.size).toBe(1)

    const existingLink = subgraph.links.values().next().value!
    for (let i = 0; i < 3; i++) {
      const dup = new LLink(
        ++subgraph.state.lastLinkId,
        existingLink.type,
        existingLink.origin_id,
        existingLink.origin_slot,
        existingLink.target_id,
        existingLink.target_slot,
      )
      subgraph.links.set(dup.id, dup)
      source.outputs[0].links!.push(dup.id)
    }
    expect(subgraph.links.size).toBe(4)

    const serialized = subgraph.asSerialisable()
    subgraph.configure(serialized)

    expect(subgraph.links.size).toBe(1)
  })
})
