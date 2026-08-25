import { describe, expect, test } from "vitest"

import { LGraph } from "@/litegraph"
import { zeroUuid } from "@/utils/uuid"

import { createTestSubgraph, createTestSubgraphData } from "./subgraph/fixtures/subgraphHelpers"

describe("Zero UUID handling in configure", () => {
  test("rejects zeroUuid for root graphs and assigns a new ID", () => {
    const graph = new LGraph()
    const data = graph.serialize()
    data.id = zeroUuid
    graph.configure(data)
    expect(graph.id).not.toBe(zeroUuid)
  })

  test("preserves zeroUuid for subgraphs", () => {
    const subgraph = createTestSubgraph({ id: zeroUuid })
    const data = createTestSubgraphData({ id: zeroUuid })
    subgraph.configure(data)
    expect(subgraph.id).toBe(zeroUuid)
  })
})
