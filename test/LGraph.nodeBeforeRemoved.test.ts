import type { ExportedSubgraphInstance } from "@/types/serialisation"

import { describe, expect, test, vi } from "vitest"

import { LGraph, LGraphGroup, LGraphNode, Subgraph, SubgraphNode } from "@/litegraph"

import { createTestSubgraph } from "./subgraph/fixtures/subgraphHelpers"

function createSubgraphWithNodes(rootGraph: LGraph, nodeCount: number) {
  const subgraph = createTestSubgraph({ nodeCount })
  rootGraph.subgraphs.set(subgraph.id, subgraph)

  return { subgraph, innerNodes: [...subgraph.nodes] }
}

function addSubgraphNode(rootGraph: LGraph, subgraph: Subgraph): SubgraphNode {
  const instanceData: ExportedSubgraphInstance = {
    id: ++rootGraph.state.lastNodeId,
    type: subgraph.id,
    pos: [100, 100],
    size: [200, 100],
    inputs: [],
    outputs: [],
    flags: {},
    mode: 0,
    order: 0,
  }

  const subgraphNode = new SubgraphNode(rootGraph, subgraph, instanceData)
  rootGraph.add(subgraphNode)
  return subgraphNode
}

describe("node:before-removed event", () => {
  test("fires node:before-removed for a successful node removal", () => {
    const graph = new LGraph()
    const node = new LGraphNode("test")
    graph.add(node)

    const events: { node: LGraphNode, graphAtDispatch: unknown }[] = []
    graph.events.addEventListener("node:before-removed", (e) => {
      events.push({
        node: e.detail.node,
        graphAtDispatch: e.detail.node.graph,
      })
    })

    graph.remove(node)

    expect(events).toHaveLength(1)
    expect(events[0].node).toBe(node)
    expect(events[0].graphAtDispatch).toBe(graph)
    expect(node.graph).toBeNull()
  })

  test("does not fire node:before-removed for a node not in the graph", () => {
    const graph = new LGraph()
    const node = new LGraphNode("test")

    const fired = vi.fn()
    graph.events.addEventListener("node:before-removed", fired)

    graph.remove(node)

    expect(fired).not.toHaveBeenCalled()
  })

  test("does not fire node:before-removed when removing an LGraphGroup", () => {
    const graph = new LGraph()
    const group = new LGraphGroup("test-group")
    graph.add(group)

    const fired = vi.fn()
    graph.events.addEventListener("node:before-removed", fired)

    graph.remove(group)

    expect(fired).not.toHaveBeenCalled()
  })

  test("does not fire node:before-removed when ignore_remove is set", () => {
    const graph = new LGraph()
    const node = new LGraphNode("test")
    graph.add(node)
    node.ignore_remove = true

    const fired = vi.fn()
    graph.events.addEventListener("node:before-removed", fired)

    graph.remove(node)

    expect(fired).not.toHaveBeenCalled()
    expect(graph.nodes).toContain(node)
  })

  test("fires node:before-removed before node.onRemoved and detach", () => {
    const graph = new LGraph()
    const node = new LGraphNode("test")
    graph.add(node)

    const order: string[] = []
    graph.events.addEventListener("node:before-removed", () => {
      order.push(`before-removed(graph=${node.graph === graph ? "set" : "null"})`)
    })
    node.onRemoved = () => {
      order.push(`onRemoved(graph=${node.graph === graph ? "set" : "null"})`)
    }
    graph.onNodeRemoved = (n) => {
      order.push(`onNodeRemoved(graph=${n.graph === null ? "null" : "set"})`)
    }

    graph.remove(node)

    expect(order).toEqual([
      "before-removed(graph=set)",
      "onRemoved(graph=set)",
      "onNodeRemoved(graph=null)",
    ])
  })
})

describe("Graph clearing and callbacks", () => {
  test("clear() calls both node.onRemoved() and graph.onNodeRemoved()", () => {
    const graph = new LGraph()

    const node1 = new LGraphNode("TestNode1")
    const node2 = new LGraphNode("TestNode2")
    graph.add(node1)
    graph.add(node2)

    const nodeRemovedCallbacks = new Set<string>()
    const graphRemovedCallbacks = new Set<string>()

    node1.onRemoved = () => {
      nodeRemovedCallbacks.add(String(node1.id))
    }
    node2.onRemoved = () => {
      nodeRemovedCallbacks.add(String(node2.id))
    }
    graph.onNodeRemoved = (node) => {
      graphRemovedCallbacks.add(String(node.id))
    }

    expect(graph.nodes.length).toBe(2)

    graph.clear()

    expect(nodeRemovedCallbacks).toContain(String(node1.id))
    expect(nodeRemovedCallbacks).toContain(String(node2.id))
    expect(graphRemovedCallbacks).toContain(String(node1.id))
    expect(graphRemovedCallbacks).toContain(String(node2.id))
    expect(graph.nodes.length).toBe(0)
  })
})

describe("Subgraph definition garbage collection", () => {
  test("subgraph-definition GC dispatches node:before-removed on the inner subgraph for each inner node", () => {
    const rootGraph = new LGraph()
    const { subgraph, innerNodes } = createSubgraphWithNodes(rootGraph, 2)

    const dispatched: { node: LGraphNode, graphAtDispatch: unknown }[] = []
    subgraph.events.addEventListener("node:before-removed", (e) => {
      dispatched.push({
        node: e.detail.node,
        graphAtDispatch: e.detail.node.graph,
      })
    })

    const subgraphNode = addSubgraphNode(rootGraph, subgraph)
    rootGraph.remove(subgraphNode)

    expect(dispatched.map(entry => entry.node)).toEqual(innerNodes)
    for (const entry of dispatched) {
      expect(entry.graphAtDispatch).toBe(subgraph)
    }
  })

  test("subgraph-definition GC dispatches node:before-removed before each inner node onRemoved", () => {
    const rootGraph = new LGraph()
    const { subgraph, innerNodes } = createSubgraphWithNodes(rootGraph, 1)
    const innerNode = innerNodes[0]

    const order: string[] = []
    subgraph.events.addEventListener("node:before-removed", () => {
      order.push("before-removed")
    })
    innerNode.onRemoved = () => {
      order.push("onRemoved")
    }
    subgraph.onNodeRemoved = () => {
      order.push("onNodeRemoved")
    }

    const subgraphNode = addSubgraphNode(rootGraph, subgraph)
    rootGraph.remove(subgraphNode)

    expect(order).toEqual(["before-removed", "onRemoved", "onNodeRemoved"])
  })

  test("subgraph definition is removed when SubgraphNode is removed", () => {
    const rootGraph = new LGraph()
    const { subgraph } = createSubgraphWithNodes(rootGraph, 1)

    const subgraphNode = addSubgraphNode(rootGraph, subgraph)
    rootGraph.remove(subgraphNode)

    expect(rootGraph.subgraphs.has(subgraph.id)).toBe(false)
  })
})
