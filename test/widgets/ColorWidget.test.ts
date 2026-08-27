/**
 * @vitest-environment jsdom
 */
import type { LGraphCanvas } from "@/litegraph"
import type { CanvasPointerEvent } from "@/types/events"
import type { IColorWidget } from "@/types/widgets"

import { afterEach, beforeEach, describe, expect, test as baseTest, vi } from "vitest"

import { LGraphNode } from "@/litegraph"
import { ColorWidget } from "@/widgets/ColorWidget"
import { isColorWidget } from "@/widgets/widgetMap"

interface ColorWidgetFixtures {
  node: LGraphNode
  widget: ColorWidget
  canvas: LGraphCanvas
  event: CanvasPointerEvent
}

function createMockWidgetConfig(overrides: Partial<IColorWidget> = {}): IColorWidget {
  return {
    type: "color",
    name: "test_color",
    value: "#ff0000",
    options: {},
    y: 0,
    ...overrides,
  }
}

const test = baseTest.extend<ColorWidgetFixtures>({
  node: async ({}, use) => {
    await use(new LGraphNode("TestNode"))
  },
  widget: async ({ node }, use) => {
    await use(new ColorWidget(createMockWidgetConfig(), node))
  },
  canvas: async ({}, use) => {
    await use({ setDirty: vi.fn() } as unknown as LGraphCanvas)
  },
  event: async ({}, use) => {
    await use({ clientX: 100, clientY: 200 } as CanvasPointerEvent)
  },
})

describe("ColorWidget", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.querySelectorAll("input[type=\"color\"]").forEach(el => el.remove())
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  test("has type color", ({ widget }) => {
    expect(widget.type).toBe("color")
  })

  test("isColorWidget type guard", ({ widget }) => {
    expect(isColorWidget(widget)).toBe(true)
  })

  test("addWidget creates a ColorWidget instance", ({ node }) => {
    const widget = node.addWidget("color", "background", "#282828", "background")
    expect(widget).toBeInstanceOf(ColorWidget)
    expect((widget as IColorWidget).value).toBe("#282828")
  })

  test("onClick creates a color input on document body", ({ widget, node, canvas, event }) => {
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.parentElement).toBe(document.body)
  })

  test("onClick sets input value from widget value", ({ node, canvas, event }) => {
    const widget = new ColorWidget(createMockWidgetConfig({ value: "#00ff00" }), node)
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    expect(input.value).toBe("#00ff00")
  })

  test("onClick defaults to #000000 when widget value is empty", ({ node, canvas, event }) => {
    const widget = new ColorWidget(createMockWidgetConfig({ value: "" }), node)
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    expect(input.value).toBe("#000000")
  })

  test("onClick positions input at click coordinates", ({ widget, node, canvas }) => {
    const event = { clientX: 150, clientY: 250 } as CanvasPointerEvent
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    expect(input.style.left).toBe("150px")
    expect(input.style.top).toBe("250px")
  })

  test("onClick triggers input click on next animation frame", ({ widget, node, canvas, event }) => {
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    const clickSpy = vi.spyOn(input, "click")

    expect(clickSpy).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(clickSpy).toHaveBeenCalled()
  })

  test("onClick reuses the same input element", ({ widget, node, canvas, event }) => {
    widget.onClick({ e: event, node, canvas })
    const firstInput = document.querySelector("input[type=\"color\"]")

    widget.onClick({ e: event, node, canvas })
    const secondInput = document.querySelector("input[type=\"color\"]")

    expect(firstInput).toBe(secondInput)
    expect(document.querySelectorAll("input[type=\"color\"]").length).toBe(1)
  })

  test("onClick calls setValue when color input changes", ({ widget, node, canvas, event }) => {
    const setValueSpy = vi.spyOn(widget, "setValue")

    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    input.value = "#00ff00"
    input.dispatchEvent(new Event("change"))

    expect(setValueSpy).toHaveBeenCalledWith("#00ff00", {
      e: event,
      node,
      canvas,
    })
  })

  test("onClick calls canvas.setDirty after value change", ({ widget, node, canvas, event }) => {
    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    input.value = "#00ff00"
    input.dispatchEvent(new Event("change"))

    expect(canvas.setDirty).toHaveBeenCalledWith(true)
  })

  test("change listener fires only once", ({ widget, node, canvas, event }) => {
    const setValueSpy = vi.spyOn(widget, "setValue")

    widget.onClick({ e: event, node, canvas })

    const input = document.querySelector("input[type=\"color\"]") as HTMLInputElement
    input.value = "#00ff00"
    input.dispatchEvent(new Event("change"))
    input.value = "#0000ff"
    input.dispatchEvent(new Event("change"))

    expect(setValueSpy).toHaveBeenCalledTimes(1)
    expect(setValueSpy).toHaveBeenCalledWith("#00ff00", expect.any(Object))
  })
})
