import { describe, expect, test } from "vitest"

import { ToInputFromIoNodeLink } from "@/canvas/ToInputFromIoNodeLink"
import { LGraphNode } from "@/litegraph"
import { LinkDirection } from "@/types/globalEnums"

import { createTestSubgraph } from "./fixtures/subgraphHelpers"

describe("Subgraph IO slot removal on disconnect", () => {
  test("removes dynamically created input slot when its only link is disconnected", () => {
    const subgraph = createTestSubgraph({ inputCount: 0, outputCount: 0 })

    const internalNode = new LGraphNode("Internal Node")
    internalNode.addInput("in", "string")
    subgraph.add(internalNode)

    subgraph.inputNode.connectByType(-1, internalNode, "string")
    expect(subgraph.inputs).toHaveLength(1)

    const link = subgraph.getLink(internalNode.inputs[0].link!)!
    const renderLink = new ToInputFromIoNodeLink(
      subgraph,
      subgraph.inputNode,
      subgraph.inputs[0],
      undefined,
      LinkDirection.CENTER,
      link,
    )
    renderLink.disconnect()

    expect(subgraph.inputs).toHaveLength(0)
    expect(internalNode.inputs[0].link).toBeNull()
  })

  test("removes dynamically created output slot when its only link is disconnected", () => {
    const subgraph = createTestSubgraph({ inputCount: 0, outputCount: 0 })

    const internalNode = new LGraphNode("Internal Node")
    internalNode.addOutput("out", "string")
    subgraph.add(internalNode)

    subgraph.outputNode.emptySlot.connect(internalNode.outputs[0], internalNode)
    expect(subgraph.outputs).toHaveLength(1)

    internalNode.disconnectOutput(0)

    expect(subgraph.outputs).toHaveLength(0)
  })

  test("removes dynamically created input slot when link is removed via removeLink", () => {
    const subgraph = createTestSubgraph({ inputCount: 0, outputCount: 0 })

    const internalNode = new LGraphNode("Internal Node")
    internalNode.addInput("in", "string")
    subgraph.add(internalNode)

    subgraph.inputNode.connectByType(-1, internalNode, "string")
    const linkId = internalNode.inputs[0].link!

    subgraph.removeLink(linkId)

    expect(subgraph.inputs).toHaveLength(0)
  })
})
