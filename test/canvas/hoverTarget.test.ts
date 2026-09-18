import { describe, expect, test } from "vitest"

import {
  getHoverAnchorGraphPos,
  getHoverAnchorRect,
  graphRectToClient,
  isPointerOverNodeTitle,
  resolveHoverTarget,
} from "@/canvas/hoverTarget"
import { LGraph, LGraphNode, TitleMode } from "@/litegraph"
import { hoverTargetsEqual } from "@/types/hover"

describe("resolveHoverTarget", () => {
  test("prioritises input slot over widget when both overlap", () => {
    const node = new LGraphNode("test")
    node.pos = [0, 100]
    node.size = [200, 120]
    const input = node.addInput("value", "number", { tooltip: "Input tooltip" })
    node.addWidget("number", "value", 0, null)

    const [x, y] = node.getInputSlotPos(input)
    const target = resolveHoverTarget({
      x,
      y,
      node,
      renderedPaths: [],
      visibleReroutes: [],
    })

    expect(target?.kind).toBe("input")
    if (target?.kind === "input") {
      expect(target.index).toBe(0)
      expect(target.slot.tooltip).toBe("Input tooltip")
    }
  })

  test("resolves widget hover when pointer is over widget body", () => {
    const node = new LGraphNode("test")
    node.pos = [0, 100]
    node.size = [200, 120]
    node.addWidget("number", "amount", 0, null)
    const widget = node.widgets?.[0]
    expect(widget).toBeDefined()
    widget!.tooltip = "Widget tooltip"
    widget!.lastY = 40

    const x = node.pos[0] + 20
    const y = node.pos[1] + widget!.lastY + 5
    const target = resolveHoverTarget({
      x,
      y,
      node,
      renderedPaths: [],
      visibleReroutes: [],
    })

    expect(target?.kind).toBe("widget")
    if (target?.kind === "widget")
      expect(target.widget.tooltip).toBe("Widget tooltip")
  })

  test("resolves title hover above the node body", () => {
    const node = new LGraphNode("test")
    node.pos = [50, 100]
    node.size = [200, 120]

    const target = resolveHoverTarget({
      x: 100,
      y: 90,
      node,
      renderedPaths: [],
      visibleReroutes: [],
    })

    expect(target).toEqual({ kind: "title", node })
  })

  test("skips title hover when title mode is NO_TITLE", () => {
    class NoTitleNode extends LGraphNode {
      static titleMode = TitleMode.NO_TITLE
    }

    const node = new NoTitleNode("test")
    node.pos = [50, 100]
    node.size = [200, 120]

    const target = resolveHoverTarget({
      x: 100,
      y: 90,
      node,
      renderedPaths: [],
      visibleReroutes: [],
    })

    expect(target).toBeNull()
  })
})

describe("isPointerOverNodeTitle", () => {
  test("returns true only within the title band", () => {
    const node = new LGraphNode("test")
    node.pos = [10, 50]
    node.size = [100, 80]

    expect(isPointerOverNodeTitle(node, 50, 40)).toBe(true)
    expect(isPointerOverNodeTitle(node, 50, 50)).toBe(false)
    expect(isPointerOverNodeTitle(node, 5, 40)).toBe(false)
  })
})

describe("hoverTargetsEqual", () => {
  test("compares targets by kind and identity fields", () => {
    const node = new LGraphNode("test")
    const input = node.addInput("a", "number")
    const widget = node.addWidget("number", "a", 0, null)

    expect(hoverTargetsEqual(
      { kind: "input", node, slot: input, index: 0 },
      { kind: "input", node, slot: input, index: 0 },
    )).toBe(true)

    expect(hoverTargetsEqual(
      { kind: "widget", node, widget },
      { kind: "input", node, slot: input, index: 0 },
    )).toBe(false)

    expect(hoverTargetsEqual(null, undefined)).toBe(true)
  })
})

describe("hover anchor geometry", () => {
  test("getHoverAnchorRect returns title bar bounds in graph space", () => {
    const node = new LGraphNode("test")
    node.pos = [50, 100]
    node.size = [200, 120]

    const rect = getHoverAnchorRect({ kind: "title", node })
    expect(rect).toEqual([50, 70, 200, 30])

    const centre = getHoverAnchorGraphPos({ kind: "title", node })
    expect(centre).toEqual([150, 85])
  })

  test("getHoverAnchorRect returns widget bounds in graph space", () => {
    const node = new LGraphNode("test")
    node.pos = [0, 100]
    node.size = [200, 120]
    node.addWidget("number", "amount", 0, null)
    const widget = node.widgets?.[0]
    widget!.lastY = 40

    const rect = getHoverAnchorRect({ kind: "widget", node, widget: widget! })
    const width = widget!.width || node.size[0]
    expect(rect).toEqual([node.pos[0] + 6, node.pos[1] + widget!.lastY!, width - 12, 20])
  })

  test("graphRectToClient scales anchor rect with viewport transform", () => {
    const graphRect = [10, 20, 100, 50] as const
    const clientRect = graphRectToClient(
      graphRect,
      (pos, out) => {
        out[0] = (pos[0] + 5) * 2
        out[1] = (pos[1] + 10) * 2
        return out
      },
      { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}) },
    )

    expect(clientRect[0]).toBe(130)
    expect(clientRect[1]).toBe(110)
    expect(clientRect[2]).toBe(200)
    expect(clientRect[3]).toBe(100)
  })
})

describe("slot tooltip serialisation", () => {
  test("round-trips tooltip through node serialisation", () => {
    const graph = new LGraph()
    const node = new LGraphNode("test")
    node.addInput("image", "IMAGE", { tooltip: "An input image" })
    graph.add(node)

    const serialised = node.serialize()
    expect(serialised.inputs?.[0]?.tooltip).toBe("An input image")

    const restored = new LGraphNode("test")
    restored.configure(serialised)
    expect(restored.inputs[0]?.tooltip).toBe("An input image")
  })
})
