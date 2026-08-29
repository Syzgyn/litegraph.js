/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from "vitest"

import { LGraphCanvas } from "@/LGraphCanvas"
import { LGraph, LGraphNode, LiteGraph } from "@/litegraph"

class BoundedPropertyNode extends LGraphNode {
  static override type = "test/panel_bounded_property"

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

function createTestCanvas(): { canvas: LGraphCanvas, parent: HTMLDivElement } {
  const parent = document.createElement("div")
  document.body.append(parent)
  const canvasElement = document.createElement("canvas")
  parent.append(canvasElement)

  canvasElement.getBoundingClientRect = vi.fn().mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  })
  canvasElement.getContext = vi.fn().mockReturnValue({
    measureText: vi.fn().mockReturnValue({ width: 50 }),
  })

  return {
    canvas: new LGraphCanvas(canvasElement, new LGraph(), {
      skipRender: true,
      skipEvents: true,
    }),
    parent,
  }
}

describe("LGraphCanvas node panel property clamping", () => {
  const parents: HTMLElement[] = []

  afterEach(() => {
    for (const parent of parents)
      parent.remove()
    parents.length = 0
    document.querySelector("#node-panel")?.remove()
  })

  test("properties panel shows clamped value after editing a bounded property", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new BoundedPropertyNode()
    canvas.graph.add(node)

    canvas.showShowNodePanel(node)

    const panelElement = parent.querySelector(":scope #node-panel")!
    const valueElement = panelElement.querySelector(
      ":scope [data-property=\"strength\"] .property-value",
    ) as HTMLSpanElement
    expect(valueElement).not.toBeNull()
    expect(valueElement.textContent).toBe("0.500")

    valueElement.textContent = "5"
    valueElement.dispatchEvent(new FocusEvent("blur"))

    expect(node.properties.strength).toBe(1)
    expect(valueElement.textContent).toBe("1.000")
  })

  test("properties panel reverts display when value is already at the clamp bound", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new BoundedPropertyNode()
    node.setProperty("strength", 1)
    canvas.graph.add(node)

    canvas.showShowNodePanel(node)

    const panelElement = parent.querySelector(":scope #node-panel")!
    const valueElement = panelElement.querySelector(
      ":scope [data-property=\"strength\"] .property-value",
    ) as HTMLSpanElement
    valueElement.textContent = "99"
    valueElement.dispatchEvent(new FocusEvent("blur"))

    expect(node.properties.strength).toBe(1)
    expect(valueElement.textContent).toBe("1.000")
  })
})
