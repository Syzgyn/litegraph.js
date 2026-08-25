import { describe, expect, test } from "vitest"

import { LGraphNode } from "@/litegraph"

import { createTestSubgraph } from "./fixtures/subgraphHelpers"

describe("SubgraphOutput zombie linkIds", () => {
  test("clears subgraph output linkIds when connected node is removed", () => {
    const subgraph = createTestSubgraph({
      outputs: [{ name: "result", type: "number" }],
    })

    const internalNode = new LGraphNode("InternalNode")
    internalNode.addOutput("out", "number")
    subgraph.add(internalNode)

    const subgraphOutput = subgraph.outputs[0]
    const link = subgraphOutput.connect(internalNode.outputs[0], internalNode)
    expect(link).toBeDefined()
    expect(subgraphOutput.linkIds).toHaveLength(1)

    subgraph.remove(internalNode)

    expect(subgraphOutput.linkIds).toHaveLength(0)
    expect(subgraph.getLink(link!.id)).toBeUndefined()
  })

  test("disconnect skips stale linkIds safely", () => {
    const subgraph = createTestSubgraph({
      outputs: [{ name: "result", type: "number" }],
    })

    const subgraphOutput = subgraph.outputs[0]
    subgraphOutput.linkIds.push(99_999)

    subgraphOutput.disconnect()

    expect(subgraphOutput.linkIds).toHaveLength(0)
  })
})
