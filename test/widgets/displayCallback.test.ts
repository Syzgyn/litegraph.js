/**
 * @vitest-environment jsdom
 */
import type { IContextMenuValue } from "@/interfaces"
import type { IBaseWidget } from "@/types/widgets"

import { describe, expect, test as baseTest } from "vitest"

import { LGraphNode } from "@/litegraph"
import { BooleanWidget } from "@/widgets/BooleanWidget"
import { ComboWidget } from "@/widgets/ComboWidget"
import { KnobWidget } from "@/widgets/KnobWidget"
import { NumberWidget } from "@/widgets/NumberWidget"
import { SliderWidget } from "@/widgets/SliderWidget"

const menuValues: IContextMenuValue<string>[] = [
  { content: "First Option", value: "first" },
  { content: "Second Option", value: "second" },
]

const test = baseTest.extend<{ node: LGraphNode }>({
  node: async ({}, use) => {
    await use(new LGraphNode("TestNode"))
  },
})

describe("displayCallback", () => {
  test("replaces default number formatting", ({ node }) => {
    const widget = new NumberWidget({
      type: "number",
      name: "amount",
      value: 1.234567,
      options: {
        displayCallback: () => "custom",
      },
      y: 0,
    }, node)

    expect(widget.displayValue).toBe("custom")
  })

  test("replaces combo menu label resolution", ({ node }) => {
    const widget = new ComboWidget({
      type: "combo",
      name: "choice",
      value: "first",
      options: {
        values: menuValues,
        displayCallback: (w: IBaseWidget) => `picked:${String(w.value)}`,
      },
      y: 0,
    }, node)

    expect(widget.displayValue).toBe("picked:first")
  })

  test("replaces boolean on/off labels", ({ node }) => {
    const widget = new BooleanWidget({
      type: "toggle",
      name: "enabled",
      value: true,
      options: {
        on: "ON",
        off: "OFF",
        displayCallback: () => "yes",
      },
      y: 0,
    }, node)

    expect(widget.displayValue).toBe("yes")
  })

  test("replaces slider and knob precision formatting", ({ node }) => {
    const slider = new SliderWidget({
      type: "slider",
      name: "level",
      value: 1.234567,
      options: {
        min: 0,
        max: 2,
        step2: 0.1,
        displayCallback: () => "slider text",
      },
      y: 0,
    }, node)

    const knob = new KnobWidget({
      type: "knob",
      name: "gain",
      value: 1.234567,
      options: {
        min: 0,
        max: 2,
        step2: 0.1,
        displayCallback: () => "knob text",
      },
      y: 0,
    }, node)

    expect(slider.displayValue).toBe("slider text")
    expect(knob.displayValue).toBe("knob text")
  })

  test("returns empty string when computedDisabled even with displayCallback", ({ node }) => {
    const widget = new NumberWidget({
      type: "number",
      name: "amount",
      value: 1,
      computedDisabled: true,
      options: {
        displayCallback: () => "custom",
      },
      y: 0,
    }, node)

    expect(widget.displayValue).toBe("")
  })
})
