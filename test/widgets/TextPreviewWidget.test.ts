/**
 * @vitest-environment jsdom
 */
import type { CanvasPointerEvent } from "@/types/events"
import type { ITextPreviewWidget } from "@/types/widgets"

import { afterEach, describe, expect, test as baseTest, vi } from "vitest"

import { LGraph, LGraphCanvas, LGraphNode } from "@/litegraph"
import { TextPreviewWidget } from "@/widgets/TextPreviewWidget"
import { isTextPreviewWidget } from "@/widgets/widgetMap"

interface TextPreviewWidgetFixtures {
  graph: LGraph
  node: LGraphNode
  widget: TextPreviewWidget
  canvas: LGraphCanvas
  event: CanvasPointerEvent
}

function createMockContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn().mockImplementation((text: string) => ({
      width: text.length * 7,
    })),
    font: "14px Inter",
    fillStyle: "",
    strokeStyle: "",
    textAlign: "left" as CanvasTextAlign,
  } as unknown as CanvasRenderingContext2D
}

function createMockWidgetConfig(overrides: Partial<ITextPreviewWidget> = {}): ITextPreviewWidget {
  return {
    type: "textpreview",
    name: "preview",
    value: "Line one\nLine two",
    options: {},
    y: 0,
    ...overrides,
  }
}

const test = baseTest.extend<TextPreviewWidgetFixtures>({
  graph: async ({}, use) => {
    const graph = new LGraph()
    await use(graph)
    graph.clear()
  },
  node: async ({ graph }, use) => {
    const node = new LGraphNode("TestNode")
    graph.add(node)
    await use(node)
  },
  widget: async ({ node }, use) => {
    await use(new TextPreviewWidget(createMockWidgetConfig(), node))
  },
  canvas: async ({ graph, node }, use) => {
    const element = document.createElement("canvas")
    element.width = 800
    element.height = 600
    element.getContext = vi.fn().mockReturnValue(createMockContext())
    element.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    document.body.append(element)

    const canvas = new LGraphCanvas(element, graph, { skipEvents: true, skipRender: true })
    node.pos = [100, 100]
    node.setSize([240, 200])
    node.widgets = [new TextPreviewWidget(createMockWidgetConfig(), node)]

    await use(canvas)
    canvas.clear()
    element.remove()
  },
  event: async ({}, use) => {
    await use({ clientX: 100, clientY: 200 } as CanvasPointerEvent)
  },
})

describe("TextPreviewWidget", () => {
  afterEach(() => {
    document.querySelectorAll("textarea.litegraph-textpreview").forEach(el => el.remove())
    vi.restoreAllMocks()
  })

  test("has type textpreview", ({ widget }) => {
    expect(widget.type).toBe("textpreview")
  })

  test("isTextPreviewWidget type guard", ({ widget }) => {
    expect(isTextPreviewWidget(widget)).toBe(true)
  })

  test("addWidget creates a TextPreviewWidget instance", ({ node }) => {
    const widget = node.addWidget("textpreview", "preview", "hello", () => {})
    expect(widget).toBeInstanceOf(TextPreviewWidget)
    expect((widget as ITextPreviewWidget).value).toBe("hello")
  })

  test("computeLayoutSize grows with wrapped content", ({ widget, node }) => {
    widget.value = "A very long line of text that should wrap when the node is narrow"
    const { minHeight } = widget.computeLayoutSize!(node)
    expect(minHeight).toBeGreaterThan(60)
  })

  test("computeLayoutSize minHeight decreases as node width increases", ({ widget, node }) => {
    widget.value = "A very long line of text that should wrap when the node is narrow"
    node.size = [120, 200]
    const narrow = widget.computeLayoutSize!(node).minHeight
    node.size = [400, 200]
    const wide = widget.computeLayoutSize!(node).minHeight
    expect(wide).toBeLessThan(narrow)
  })

  test("onClick does not change value", ({ widget, node, canvas, event }) => {
    const setValueSpy = vi.spyOn(widget, "setValue")
    widget.onClick({ e: event, node, canvas })
    expect(setValueSpy).not.toHaveBeenCalled()
  })

  test("drawWidget creates a readonly textarea overlay", ({ canvas, node }) => {
    const widget = node.widgets![0] as TextPreviewWidget
    widget.computedHeight = 120
    widget.y = 40
    widget.drawWidget(canvas.ctx, { width: node.size[0] })

    const textarea = document.querySelector("textarea.litegraph-textpreview") as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.readOnly).toBe(true)
    expect(textarea.value).toBe("Line one\nLine two")
  })

  test("drawWidget shows value when input slot is linked", ({ canvas, node }) => {
    const widget = node.widgets![0] as TextPreviewWidget
    widget.computedHeight = 120
    widget.y = 40
    widget.computedDisabled = true
    widget.value = "Linked preview value"

    widget.drawWidget(canvas.ctx, { width: node.size[0] })

    const textarea = document.querySelector("textarea.litegraph-textpreview") as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe("Linked preview value")
    expect(widget.displayValue).toBe("Linked preview value")
  })

  test("onRemove removes textarea from the document", ({ canvas, node }) => {
    const widget = node.widgets![0] as TextPreviewWidget
    widget.computedHeight = 120
    widget.y = 40
    widget.drawWidget(canvas.ctx, { width: node.size[0] })
    expect(document.querySelector("textarea.litegraph-textpreview")).toBeTruthy()

    widget.onRemove?.()
    expect(document.querySelector("textarea.litegraph-textpreview")).toBeNull()
  })

  test("setValue updates textarea content", ({ canvas, node }) => {
    const widget = node.widgets![0] as TextPreviewWidget
    widget.computedHeight = 120
    widget.y = 40
    widget.drawWidget(canvas.ctx, { width: node.size[0] })

    widget.setValue("Updated text", {
      e: {} as CanvasPointerEvent,
      node,
      canvas,
    })

    const textarea = document.querySelector("textarea.litegraph-textpreview") as HTMLTextAreaElement
    expect(textarea.value).toBe("Updated text")
  })
})
