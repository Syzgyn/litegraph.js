import type { NodeId, SerialisableGraph } from "@/litegraph"
import type { UUID } from "@/utils/uuid"

import { beforeEach, describe } from "vitest"

import { LGraph, LGraphNode, LiteGraph } from "@/litegraph"

import { test } from "../testExtensions"
import { duplicateSubgraphNodeIds } from "./fixtures/duplicateSubgraphNodeIds"
import { nestedSubgraphProxyWidgets } from "./fixtures/nestedSubgraphProxyWidgets"
import { nodeIdSpaceExhausted } from "./fixtures/nodeIdSpaceExhausted"
import { uniqueSubgraphNodeIds } from "./fixtures/uniqueSubgraphNodeIds"

const SUBGRAPH_A = "11111111-1111-4111-8111-111111111111" as UUID
const SUBGRAPH_B = "22222222-2222-4222-8222-222222222222" as UUID
const SHARED_NODE_IDS = [3, 8, 37]

describe("deduplicateSubgraphNodeIds (via configure)", () => {
  beforeEach(() => {
    LiteGraph.registerNodeType("dummy", LGraphNode)
    LiteGraph.registerNodeType(SUBGRAPH_A, LGraphNode)
    LiteGraph.registerNodeType(SUBGRAPH_B, LGraphNode)
  })

  function loadFixture(): SerialisableGraph {
    return structuredClone(duplicateSubgraphNodeIds)
  }

  function configureFromFixture() {
    const graphData = loadFixture()
    const graph = new LGraph()
    graph.configure(graphData)
    return { graph, graphData }
  }

  function nodeIdSet(graph: LGraph, subgraphId: UUID) {
    return new Set(graph.subgraphs.get(subgraphId)!.nodes.map(n => n.id))
  }

  test("remaps duplicate node IDs so subgraphs have no overlap", ({ expect }) => {
    const { graph } = configureFromFixture()

    const idsA = nodeIdSet(graph, SUBGRAPH_A)
    const idsB = nodeIdSet(graph, SUBGRAPH_B)

    for (const id of SHARED_NODE_IDS) {
      expect(idsA.has(id as NodeId)).toBe(true)
    }
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false)
    }
  })

  test("patches link references in remapped subgraph", ({ expect }) => {
    const { graph } = configureFromFixture()
    const idsB = nodeIdSet(graph, SUBGRAPH_B)

    for (const link of graph.subgraphs.get(SUBGRAPH_B)!.links.values()) {
      expect(idsB.has(link.origin_id)).toBe(true)
      expect(idsB.has(link.target_id)).toBe(true)
    }
  })

  test("patches promoted widget references in remapped subgraph", ({ expect }) => {
    const { graph } = configureFromFixture()
    const idsB = nodeIdSet(graph, SUBGRAPH_B)

    for (const widget of graph.subgraphs.get(SUBGRAPH_B)!.widgets) {
      expect(idsB.has(widget.id)).toBe(true)
    }
  })

  test("patches proxyWidgets in root-level nodes referencing remapped IDs", ({ expect }) => {
    const { graph } = configureFromFixture()

    const idsA = new Set(graph.subgraphs.get(SUBGRAPH_A)!.nodes.map(n => String(n.id)))
    const idsB = new Set(graph.subgraphs.get(SUBGRAPH_B)!.nodes.map(n => String(n.id)))

    const pw102 = graph.getNodeById(102 as NodeId)?.properties?.proxyWidgets
    expect(Array.isArray(pw102)).toBe(true)
    for (const entry of pw102 as unknown[][]) {
      expect(Array.isArray(entry)).toBe(true)
      expect(idsA.has(String(entry[0]))).toBe(true)
    }

    const pw103 = graph.getNodeById(103 as NodeId)?.properties?.proxyWidgets
    expect(Array.isArray(pw103)).toBe(true)
    for (const entry of pw103 as unknown[][]) {
      expect(Array.isArray(entry)).toBe(true)
      expect(idsB.has(String(entry[0]))).toBe(true)
    }
  })

  test("patches proxyWidgets inside nested subgraph nodes", ({ expect }) => {
    const graph = new LGraph()
    graph.configure(structuredClone(nestedSubgraphProxyWidgets))

    const idsB = new Set(graph.subgraphs.get(SUBGRAPH_B)!.nodes.map(n => String(n.id)))

    const innerNode = graph.subgraphs.get(SUBGRAPH_A)!.nodes.find(n => n.id === (50 as NodeId))
    const pw = innerNode?.properties?.proxyWidgets
    expect(Array.isArray(pw)).toBe(true)
    for (const entry of pw as unknown[][]) {
      expect(Array.isArray(entry)).toBe(true)
      expect(idsB.has(String(entry[0]))).toBe(true)
    }
  })

  test("throws when node ID space is exhausted", ({ expect }) => {
    expect(() => {
      const graph = new LGraph()
      graph.configure(structuredClone(nodeIdSpaceExhausted))
    }).toThrow("Node ID space exhausted")
  })

  test("is a no-op when subgraph node IDs are already unique", ({ expect }) => {
    const graph = new LGraph()
    graph.configure(structuredClone(uniqueSubgraphNodeIds))

    expect(nodeIdSet(graph, SUBGRAPH_A)).toEqual(new Set([10, 11, 12]))
    expect(nodeIdSet(graph, SUBGRAPH_B)).toEqual(new Set([20, 21, 22]))
  })
})
