/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from "vitest"

import type { IContextMenuValue } from "@/interfaces"
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "@/litegraph"
import { getContextMenuWireValue } from "@/utils/type"

type MenuEntry = string | IContextMenuValue<string>

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

describe("LGraphCanvas node panel color", () => {
  const parents: HTMLElement[] = []

  afterEach(() => {
    for (const parent of parents)
      parent.remove()
    parents.length = 0
    document.querySelector("#node-panel")?.remove()
    vi.restoreAllMocks()
  })

  test("properties panel Color combo includes None and shows it for default nodes", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new LGraphNode("Test")
    canvas.graph!.add(node)

    canvas.showShowNodePanel(node)

    const panelElement = parent.querySelector(":scope #node-panel")!
    const colorElement = panelElement.querySelector(
      ":scope [data-property=\"Color\"] .property-value",
    ) as HTMLSpanElement
    expect(colorElement).not.toBeNull()
    expect(colorElement.textContent).toBe(LGraphCanvas.nodeColorNone)

    const menuValues: unknown[] = []
    const spy = vi.spyOn(LiteGraph, "ContextMenu").mockImplementation((values, options) => {
      menuValues.push(...values)
      options.callback?.("red")
      return { close: vi.fn() } as ReturnType<typeof LiteGraph.ContextMenu>
    })

    colorElement.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(getContextMenuWireValue(menuValues[0] as MenuEntry)).toBe(LGraphCanvas.nodeColorNone)
    expect(menuValues.some(entry => getContextMenuWireValue(entry as MenuEntry) === "red")).toBe(true)
    expect(node.getColorOption()).toEqual(LGraphCanvas.nodeColors.red)

    spy.mockRestore()
  })

  test("properties panel Color None clears a preset colour", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new LGraphNode("Test")
    node.setColorOption(LGraphCanvas.nodeColors.red)
    canvas.graph!.add(node)

    canvas.showShowNodePanel(node)

    const panelElement = parent.querySelector(":scope #node-panel")!
    const colorElement = panelElement.querySelector(
      ":scope [data-property=\"Color\"] .property-value",
    ) as HTMLSpanElement
    expect(colorElement.textContent).toBe("red")

    vi.spyOn(LiteGraph, "ContextMenu").mockImplementation((values, options) => {
      options.callback?.({
        value: LGraphCanvas.nodeColorNone,
        content: LGraphCanvas.nodeColorNone,
      })
      return { close: vi.fn() } as ReturnType<typeof LiteGraph.ContextMenu>
    })

    colorElement.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(node.getColorOption()).toBeNull()
    expect(colorElement.textContent).toBe(LGraphCanvas.nodeColorNone)
  })
})
