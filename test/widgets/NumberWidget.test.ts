/**
 * @vitest-environment jsdom
 */
import type { LGraphCanvas } from "@/litegraph"
import type { CanvasPointerEvent } from "@/types/events"
import type { INumericWidget } from "@/types/widgets"

import { describe, expect, test as baseTest } from "vitest"

import { LGraphNode } from "@/litegraph"
import { BaseWidget } from "@/widgets/BaseWidget"
import { NumberWidget } from "@/widgets/NumberWidget"

interface NumberWidgetFixtures {
  node: LGraphNode
  widget: NumberWidget
  canvas: LGraphCanvas
}

function createMockWidgetConfig(overrides: Partial<INumericWidget> = {}): INumericWidget {
  return {
    type: "number",
    name: "test_number",
    value: 1,
    options: { step2: 1 },
    y: 0,
    ...overrides,
  }
}

function createDragEvent(x: number, deltaX: number): CanvasPointerEvent {
  return { canvasX: x, deltaX, clientX: x, clientY: 100 } as CanvasPointerEvent
}

const test = baseTest.extend<NumberWidgetFixtures>({
  node: async ({}, use) => {
    const node = new LGraphNode("TestNode")
    node.pos = [0, 0]
    node.size = [200, 100]
    await use(node)
  },
  widget: async ({ node }, use) => {
    await use(new NumberWidget(createMockWidgetConfig(), node))
  },
  canvas: async ({}, use) => {
    await use({ graphMouse: [0, 0] } as LGraphCanvas)
  },
})

describe("NumberWidget", () => {
  test("onDrag updates value in the left margin between node and widget edges", ({ widget, node, canvas }) => {
    const x = BaseWidget.margin - 5

    widget.onDrag({ e: createDragEvent(x, 2), node, canvas })

    expect(widget.value).toBe(3)
  })

  test("onDrag updates value in the right margin between node and widget edges", ({ widget, node, canvas }) => {
    const width = node.size[0]
    const x = width - BaseWidget.margin + 5

    widget.onDrag({ e: createDragEvent(x, -2), node, canvas })

    expect(widget.value).toBe(-1)
  })

  test("onDrag updates value when dragging over arrow buttons", ({ widget, node, canvas }) => {
    const { margin, arrowMargin, arrowWidth } = BaseWidget
    const leftArrowX = margin + arrowMargin + arrowWidth / 2
    const rightArrowX = node.size[0] - leftArrowX

    widget.onDrag({ e: createDragEvent(leftArrowX, 2), node, canvas })
    expect(widget.value).toBe(3)

    widget.onDrag({ e: createDragEvent(rightArrowX, -1), node, canvas })
    expect(widget.value).toBe(2)
  })

  test("onDrag updates value in the centre of the widget", ({ widget, node, canvas }) => {
    widget.onDrag({ e: createDragEvent(node.size[0] / 2, 4), node, canvas })

    expect(widget.value).toBe(5)
  })
})
