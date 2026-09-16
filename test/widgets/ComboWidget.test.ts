/**
 * @vitest-environment jsdom
 */
import type { IContextMenuValue } from "@/interfaces"
import type { LGraphCanvas } from "@/litegraph"
import type { CanvasPointerEvent } from "@/types/events"
import type { IComboWidget } from "@/types/widgets"

import { afterEach, describe, expect, test as baseTest, vi } from "vitest"

import { LGraphNode, LiteGraph } from "@/litegraph"
import { ComboWidget } from "@/widgets/ComboWidget"

interface ComboWidgetFixtures {
  node: LGraphNode
  widget: ComboWidget
  canvas: LGraphCanvas
  event: CanvasPointerEvent
}

const menuValues: IContextMenuValue<string>[] = [
  { content: "First Option", value: "first" },
  { content: "Second Option", value: "second" },
  { content: "Third Option", value: "third" },
]

function createMockWidgetConfig(overrides: Partial<IComboWidget> = {}): IComboWidget {
  return {
    type: "combo",
    name: "test_combo",
    value: "first",
    options: { values: menuValues },
    y: 0,
    ...overrides,
  }
}

function createEvent(x: number): CanvasPointerEvent {
  return { canvasX: x, clientX: x, clientY: 100 } as CanvasPointerEvent
}

const test = baseTest.extend<ComboWidgetFixtures>({
  node: async ({}, use) => {
    const node = new LGraphNode("TestNode")
    node.pos = [0, 0]
    node.size = [200, 100]
    await use(node)
  },
  widget: async ({ node }, use) => {
    await use(new ComboWidget(createMockWidgetConfig(), node))
  },
  canvas: async ({}, use) => {
    await use({
      ds: { scale: 1 },
      lastMouseClick: 0,
      graphMouse: [0, 0],
    } as unknown as LGraphCanvas)
  },
  event: async ({}, use) => {
    await use(createEvent(100))
  },
})

describe("ComboWidget", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("displayValue shows menu entry content for wire values", ({ widget }) => {
    expect(widget.displayValue).toBe("First Option")

    widget.value = "second"
    expect(widget.displayValue).toBe("Second Option")
  })

  test("incrementValue and decrementValue step through labeled menu entries", ({ widget, node, canvas, event }) => {
    const options = { e: event, node, canvas }

    widget.incrementValue(options)
    expect(widget.value).toBe("second")
    expect(widget.displayValue).toBe("Second Option")

    widget.incrementValue(options)
    expect(widget.value).toBe("third")
    expect(widget.canIncrement()).toBe(false)

    widget.decrementValue(options)
    expect(widget.value).toBe("second")
    expect(widget.canDecrement()).toBe(true)
  })

  test("onClick menu callback stores wire value from IContextMenuValue selection", ({ widget, node, canvas }) => {
    let capturedCallback: ((selected: unknown) => void) | undefined

    vi.spyOn(LiteGraph, "ContextMenu").mockImplementation(((_values, options) => {
      capturedCallback = options.callback as (selected: unknown) => void
      return {} as InstanceType<typeof LiteGraph.ContextMenu>
    }) as typeof LiteGraph.ContextMenu)

    widget.onClick({ e: createEvent(100), node, canvas })

    expect(capturedCallback).toBeDefined()
    capturedCallback!(menuValues[1])

    expect(widget.value).toBe("second")
    expect(widget.displayValue).toBe("Second Option")
    expect(widget.displayValue).not.toBe("[object Object]")
  })
})
