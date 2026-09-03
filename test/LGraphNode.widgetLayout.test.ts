import type { IBaseWidget } from "@/types/widgets"

import { beforeEach, describe, expect } from "vitest"

import { LGraph, LGraphNode, LiteGraph } from "@/litegraph"

import { test } from "./testExtensions"

const WIDGET_BOTTOM_MARGIN = 8

function createGrowableWidget(minHeight: number): IBaseWidget {
  return {
    name: "growable",
    type: "custom",
    options: {},
    y: 0,
    computeLayoutSize: () => ({
      minHeight,
      minWidth: 100,
      maxHeight: 1_000_000,
      maxWidth: 1_000_000,
    }),
  }
}

describe("LGraphNode widget layout", () => {
  beforeEach(() => {
    LiteGraph.NODE_SLOT_HEIGHT = 15
    LiteGraph.NODE_WIDGET_HEIGHT = 20
  })

  test("arrange leaves bottom margin for computeLayoutSize widgets", () => {
    const graph = new LGraph()
    const node = new LGraphNode("TestNode")
    graph.add(node)

    node.addOutput("out", "*")
    const widget = createGrowableWidget(60)
    node.widgets = [widget]
    node.size = [220, 300]

    node.setConcreteSlots()
    node.arrange()

    const contentBottom = widget.y + (widget.computedHeight ?? 0)
    expect(node.size[1] - contentBottom).toBeGreaterThanOrEqual(WIDGET_BOTTOM_MARGIN)
  })

  test("growable widgets do not consume the reserved bottom margin", () => {
    const graph = new LGraph()
    const node = new LGraphNode("TestNode")
    graph.add(node)

    node.addOutput("out", "*")
    const widget = createGrowableWidget(60)
    node.widgets = [widget]
    node.size = [220, 300]

    node.setConcreteSlots()
    node.arrange()

    const maxWidgetBottom = node.size[1] - WIDGET_BOTTOM_MARGIN
    expect(widget.y + (widget.computedHeight ?? 0)).toBeLessThanOrEqual(maxWidgetBottom)
  })

  test("repeated arrange passes do not grow widgets toward maxHeight", () => {
    const graph = new LGraph()
    const node = new LGraphNode("TestNode")
    graph.add(node)

    node.addOutput("out", "*")
    const widget = createGrowableWidget(60)
    node.widgets = [widget]
    node.size = [220, 180]

    node.setConcreteSlots()
    for (let i = 0; i < 5; i++) node.arrange()

    expect(widget.computedHeight).toBeLessThan(200)
    expect(node.size[1]).toBeLessThan(250)
  })
})
