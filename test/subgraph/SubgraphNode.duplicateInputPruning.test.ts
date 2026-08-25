import type { ExportedSubgraphInstance } from "@/litegraph"

import { describe, expect, test } from "vitest"

import { LGraph, SubgraphNode } from "@/litegraph"

import { createTestSubgraph, createTestSubgraphNode } from "./fixtures/subgraphHelpers"

describe("SubgraphNode duplicate input pruning (#9977)", () => {
  test("should prune inputs that have no matching subgraph slot after configure", () => {
    const subgraph = createTestSubgraph({
      inputs: [
        { name: "a", type: "STRING" },
        { name: "b", type: "NUMBER" },
      ],
    })

    const parentGraph = new LGraph()
    const instanceData = {
      id: 1,
      type: subgraph.id,
      pos: [0, 0] as [number, number],
      size: [200, 100] as [number, number],
      inputs: [
        { name: "a", type: "STRING", link: null },
        { name: "b", type: "NUMBER", link: null },
        { name: "a", type: "STRING", link: null },
        { name: "b", type: "NUMBER", link: null },
      ],
      outputs: [],
      properties: {},
      flags: {},
      mode: 0,
      order: 0,
    }

    const node = new SubgraphNode(
      parentGraph,
      subgraph,
      instanceData as ExportedSubgraphInstance,
    )

    expect(node.inputs).toHaveLength(2)
    expect(node.inputs.every(i => i._subgraphSlot)).toBe(true)
  })

  test("should not accumulate duplicate inputs on reconfigure", () => {
    const subgraph = createTestSubgraph({
      inputs: [
        { name: "a", type: "STRING" },
        { name: "b", type: "NUMBER" },
      ],
    })

    const node = createTestSubgraphNode(subgraph)
    expect(node.inputs).toHaveLength(2)

    node.configure(node.serialize())
    expect(node.inputs).toHaveLength(2)

    node.configure(node.serialize())
    expect(node.inputs).toHaveLength(2)
  })

  test("should serialize with exactly the subgraph-defined inputs", () => {
    const subgraph = createTestSubgraph({
      inputs: [
        { name: "x", type: "IMAGE" },
        { name: "y", type: "VAE" },
      ],
    })

    const node = createTestSubgraphNode(subgraph)
    const serialized = node.serialize()

    expect(serialized.inputs).toHaveLength(2)
    expect(serialized.inputs?.map(i => i.name)).toEqual(["x", "y"])
  })
})
