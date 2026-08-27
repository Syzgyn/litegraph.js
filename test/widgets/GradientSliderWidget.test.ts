import type { CanvasPointerEvent } from "@/types/events"
import type { IGradientSliderWidget } from "@/types/widgets"

import { afterEach, describe, expect, test as baseTest, vi } from "vitest"

import { LGraphCanvas } from "@/LGraphCanvas"
import { LGraphNode } from "@/LGraphNode"
import { GradientSliderWidget } from "@/widgets/GradientSliderWidget"
import { isGradientSliderWidget } from "@/widgets/widgetMap"

interface GradientSliderFixtures {
  node: LGraphNode
  widget: GradientSliderWidget
  canvas: LGraphCanvas
}

const test = baseTest.extend<GradientSliderFixtures>({
  node: async ({}, use) => {
    const node = new LGraphNode("TestNode")
    node.pos = [0, 0]
    node.size = [200, 100]
    await use(node)
  },
  widget: async ({ node }, use) => {
    const widget = new GradientSliderWidget({
      type: "gradientslider",
      name: "strength",
      value: 0.5,
      options: { min: 0, max: 1, step2: 0.01 },
      y: 0,
    }, node)
    await use(widget)
  },
  canvas: async ({}, use) => {
    await use({ setDirty: vi.fn() } as unknown as LGraphCanvas)
  },
})

function createEvent(canvasX: number): CanvasPointerEvent {
  return { canvasX, clientX: canvasX, clientY: 0 } as CanvasPointerEvent
}

describe("GradientSliderWidget", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("has type gradientslider", ({ widget }) => {
    expect(widget.type).toBe("gradientslider")
  })

  test("isGradientSliderWidget type guard", ({ widget }) => {
    expect(isGradientSliderWidget(widget)).toBe(true)
  })

  test("addWidget creates a GradientSliderWidget instance", ({ node }) => {
    const widget = node.addWidget("gradientslider", "strength", 0.25, "strength", {
      min: 0,
      max: 1,
      step2: 0.01,
    })

    expect(widget).toBeInstanceOf(GradientSliderWidget)
    expect((widget as IGradientSliderWidget).value).toBe(0.25)
  })

  test("onClick sets value from pointer position", ({ widget, node, canvas }) => {
    widget.onClick({ e: createEvent(100), node, canvas })
    expect(widget.value).toBe(0.5)
  })

  test("onClick at minimum sets min value", ({ widget, node, canvas }) => {
    widget.onClick({ e: createEvent(15), node, canvas })
    expect(widget.value).toBe(0)
  })

  test("onClick at maximum sets max value", ({ widget, node, canvas }) => {
    widget.onClick({ e: createEvent(185), node, canvas })
    expect(widget.value).toBe(1)
  })

  test("onClick is a no-op when read_only", ({ widget, node, canvas }) => {
    widget.options.read_only = true
    const setValue = vi.spyOn(widget, "setValue")

    widget.onClick({ e: createEvent(100), node, canvas })

    expect(setValue).not.toHaveBeenCalled()
  })
})
