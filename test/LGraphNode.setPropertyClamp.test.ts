import type { ISerialisedNode } from "@/types/serialisation"

import { describe, expect, test } from "vitest"

import { LGraphNode, LiteGraph } from "@/litegraph"
import { clampWidgetValue } from "@/utils/widget"

function getMockISerialisedNode(data: Partial<ISerialisedNode>): ISerialisedNode {
  return Object.assign({
    id: 0,
    flags: {},
    type: "TestNode",
    pos: [100, 100],
    size: [100, 100],
    order: 0,
    mode: 0,
  }, data)
}

class BoundedPropertyNode extends LGraphNode {
  static override type = "test/bounded_property"

  constructor() {
    super("Bounded", BoundedPropertyNode.type)
    this.addProperty("strength", 0.5, "number")
    this.addWidget("number", "strength", 0.5, "strength", {
      min: 0,
      max: 1,
      step2: 0.01,
    })
  }
}

LiteGraph.registerNodeType(BoundedPropertyNode.type!, BoundedPropertyNode)

describe("clampWidgetValue", () => {
  test("clamps to min and max when both are set", () => {
    const widget = { options: { min: 0, max: 10 } }

    expect(clampWidgetValue(widget, 5)).toBe(5)
    expect(clampWidgetValue(widget, -1)).toBe(0)
    expect(clampWidgetValue(widget, 15)).toBe(10)
  })

  test("clamps only when one bound is set", () => {
    expect(clampWidgetValue({ options: { min: 2 } }, 1)).toBe(2)
    expect(clampWidgetValue({ options: { max: 8 } }, 9)).toBe(8)
  })

  test("returns non-numeric values unchanged", () => {
    const widget = { options: { min: 0, max: 1 } }

    expect(clampWidgetValue(widget, "hello")).toBe("hello")
    expect(clampWidgetValue(widget, true)).toBe(true)
  })
})

describe("setProperty clamps bounded widgets", () => {
  test("clamps property and widget value via setProperty", () => {
    const node = new BoundedPropertyNode()

    node.setProperty("strength", 5)
    expect(node.properties.strength).toBe(1)
    expect(node.widgets![0].value).toBe(1)

    node.setProperty("strength", -2)
    expect(node.properties.strength).toBe(0)
    expect(node.widgets![0].value).toBe(0)
  })

  test("configure clamps out-of-range property values", () => {
    const node = new BoundedPropertyNode()

    node.configure(getMockISerialisedNode({
      id: 1,
      type: BoundedPropertyNode.type!,
      pos: [0, 0],
      size: [100, 50],
      properties: { strength: 99 },
    }))

    expect(node.properties.strength).toBe(1)
    expect(node.widgets![0].value).toBe(1)
  })

  test("configure clamps out-of-range widgetsValues", () => {
    const node = new BoundedPropertyNode()
    node.serializeWidgets = true

    node.configure(getMockISerialisedNode({
      id: 1,
      type: BoundedPropertyNode.type!,
      pos: [0, 0],
      size: [100, 50],
      properties: {},
      widgetsValues: [-5],
    }))

    expect(node.widgets![0].value).toBe(0)
  })
})
