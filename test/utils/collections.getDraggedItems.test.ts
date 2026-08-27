import type { Positionable } from "@/interfaces"

import { beforeEach, describe, expect, test } from "vitest"

import { LGraph, LGraphGroup, LGraphNode } from "@/litegraph"
import { getDraggedItems } from "@/utils/collections"

class TestNode extends LGraphNode {
  constructor() {
    super("test")
  }
}

describe("getDraggedItems", () => {
  let graph: LGraph
  let group: LGraphGroup
  let nodeA: TestNode
  let nodeB: TestNode
  let selected: Set<Positionable>

  beforeEach(() => {
    graph = new LGraph()

    group = new LGraphGroup("TestGroup")
    group.boundingRect.set([0, 0, 500, 500])
    graph.add(group)

    nodeA = new TestNode()
    nodeA.pos = [50, 50]
    nodeA.size = [100, 100]
    graph.add(nodeA)

    nodeB = new TestNode()
    nodeB.pos = [100, 100]
    nodeB.size = [100, 100]
    graph.add(nodeB)

    group.recomputeInsideNodes()

    expect(group.children.has(nodeA)).toBe(true)
    expect(group.children.has(nodeB)).toBe(true)

    selected = new Set<Positionable>([group])
  })

  test("drags the group with its contents when no modifier is held", () => {
    const items = getDraggedItems(selected, { ctrlKey: false, metaKey: false })

    expect(items.has(group)).toBe(true)
    expect(items.has(nodeA)).toBe(true)
    expect(items.has(nodeB)).toBe(true)
  })

  test("drags only the group when Ctrl is held (Windows/Linux)", () => {
    const items = getDraggedItems(selected, { ctrlKey: true, metaKey: false })

    expect(items.has(group)).toBe(true)
    expect(items.has(nodeA)).toBe(false)
    expect(items.has(nodeB)).toBe(false)
  })

  test("drags only the group when Meta/Cmd is held (macOS)", () => {
    const items = getDraggedItems(selected, { ctrlKey: false, metaKey: true })

    expect(items.has(group)).toBe(true)
    expect(items.has(nodeA)).toBe(false)
    expect(items.has(nodeB)).toBe(false)
  })
})
