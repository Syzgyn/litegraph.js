import { afterEach, describe, expect, test, vi } from "vitest"

import { LGraphCanvas } from "@/LGraphCanvas"
import { LGraphNode, LiteGraph } from "@/litegraph"

const xssPayload = "<img src=x onerror=window.__xss=1>"

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
    canvas: new LGraphCanvas(canvasElement, null, {
      skip_render: true,
      skip_events: true,
    }),
    parent,
  }
}

describe("LGraphCanvas XSS", () => {
  const dialogs: HTMLElement[] = []
  const parents: HTMLElement[] = []

  afterEach(() => {
    for (const dialog of dialogs)
      dialog.remove()
    dialogs.length = 0
    for (const parent of parents)
      parent.remove()
    parents.length = 0
    document.querySelector("#node-panel")?.remove()
    delete (window as Window & { __xss?: number }).__xss
  })

  test("decodeHTML strips executable HTML handlers", () => {
    const sanitized = LGraphCanvas.decodeHTML(xssPayload)
    expect(sanitized).not.toContain("onerror")
  })

  test("showEditPropertyValue sanitizes malicious property keys", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new LGraphNode("Note")
    node.properties[xssPayload] = "anything"

    const dialog = canvas.showEditPropertyValue(node, xssPayload, {
      position: [0, 0],
    })
    expect(dialog).toBeDefined()
    dialogs.push(dialog!)

    const name = dialog!.querySelector(".name")
    expect(name?.innerHTML).not.toContain("onerror")
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined()
  })

  test("showShowNodePanel sanitizes malicious node types", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    const node = new LGraphNode(xssPayload)

    canvas.showShowNodePanel(node)

    const panel = parent.querySelector("#node-panel")
    expect(panel).not.toBeNull()

    const nodeType = panel?.querySelector(".node_type")
    expect(nodeType?.innerHTML).not.toContain("onerror")
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined()
  })

  test("onShowMenuNodeProperties sanitizes malicious property values", () => {
    const { canvas, parent } = createTestCanvas()
    parents.push(parent)
    LGraphCanvas.active_canvas = canvas

    const node = new LGraphNode("Note")
    node.properties.safe_key = xssPayload

    const entries: { content?: string }[] = []
    const prevMenu = {
      root: document.createElement("div"),
      close: vi.fn(),
    }
    const ContextMenuSpy = vi.spyOn(LiteGraph, "ContextMenu").mockImplementation((values) => {
      entries.push(...values as { content?: string }[])
      return prevMenu as never
    })

    LGraphCanvas.onShowMenuNodeProperties(
      undefined,
      undefined,
      new MouseEvent("click"),
      prevMenu as never,
      node,
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].content).not.toContain("onerror")

    ContextMenuSpy.mockRestore()
  })
})
