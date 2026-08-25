import { describe, expect, test } from "vitest"

import { createTestSubgraph, createTestSubgraphNode } from "./fixtures/subgraphHelpers"

describe("Nested SubgraphNode duplicate input prevention", () => {
  test("should not duplicate inputs when the referenced subgraph is reconfigured", () => {
    const subgraph = createTestSubgraph({
      inputs: [
        { name: "a", type: "STRING" },
        { name: "b", type: "NUMBER" },
      ],
    })

    const node = createTestSubgraphNode(subgraph)
    expect(node.inputs).toHaveLength(2)

    const serialized = subgraph.asSerialisable()
    const slotBefore = node.inputs[0]._subgraphSlot
    subgraph.configure(serialized)

    expect(node.inputs).toHaveLength(2)
    expect(node.inputs.every(i => i._subgraphSlot)).toBe(true)
    expect(node.inputs[0]._subgraphSlot).not.toBe(slotBefore)
    expect(node.inputs[0]._subgraphSlot!.id).toBe(slotBefore!.id)
    expect(node.inputs.map(i => i.name)).toEqual(["a", "b"])
  })

  test("should not accumulate inputs across multiple reconfigure cycles", () => {
    const subgraph = createTestSubgraph({
      inputs: [
        { name: "x", type: "IMAGE" },
        { name: "y", type: "VAE" },
      ],
    })

    const node = createTestSubgraphNode(subgraph)
    expect(node.inputs).toHaveLength(2)

    for (let i = 0; i < 5; i++) {
      subgraph.configure(subgraph.asSerialisable())
    }

    expect(node.inputs).toHaveLength(2)
    expect(node.inputs.map(i => i.name)).toEqual(["x", "y"])
  })
})
