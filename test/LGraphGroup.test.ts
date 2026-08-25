import { describe, expect, vi } from "vitest"

import type { LGraphCanvas } from "@/litegraph"
import { LGraphGroup } from "@/litegraph"
import * as colorUtil from "@/utils/colorUtil"

import { test } from "./testExtensions"

function createMockContext() {
  return {
    beginPath: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D
}

const graphCanvas = { editor_alpha: 1 } as Partial<LGraphCanvas> as LGraphCanvas

describe("LGraphGroup", () => {
  test("serializes to the existing format", () => {
    const link = new LGraphGroup("title", 929)
    expect(link.serialize()).toMatchSnapshot("Basic")
  })

  describe("draw", () => {
    test("lightens the title text for a very dark background", () => {
      const group = new LGraphGroup("Group")
      group.color = "#000000"
      const ctx = createMockContext()

      group.draw(graphCanvas, ctx)

      expect(ctx.fillStyle).toBe(colorUtil.readableTextColor("#000000"))
      expect(ctx.fillStyle).not.toBe("#fff")
      expect(ctx.fillStyle).not.toBe("#000000")
    })

    test("leaves the title text unchanged for a light background", () => {
      const group = new LGraphGroup("Group")
      group.color = "#ffffff"
      const ctx = createMockContext()

      group.draw(graphCanvas, ctx)

      expect(ctx.fillStyle).toBe("#ffffff")
    })

    test("leaves the title text unchanged for a moderately dark, non-black background", () => {
      const group = new LGraphGroup("Group")
      // "purple" preset groupcolor - dark but well above the black-ish threshold
      group.color = "#a1309b"
      const ctx = createMockContext()

      group.draw(graphCanvas, ctx)

      expect(ctx.fillStyle).toBe("#a1309b")
    })

    test("does not recompute the title text color when the background is unchanged", () => {
      const group = new LGraphGroup("Group")
      group.color = "#000000"
      const ctx = createMockContext()
      const spy = vi.spyOn(colorUtil, "readableTextColor")

      group.draw(graphCanvas, ctx)
      group.draw(graphCanvas, ctx)

      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })

    test("recomputes the title text color when the background changes", () => {
      const group = new LGraphGroup("Group")
      group.color = "#000000"
      const ctx = createMockContext()
      const spy = vi.spyOn(colorUtil, "readableTextColor")

      group.draw(graphCanvas, ctx)
      group.color = "#111111"
      group.draw(graphCanvas, ctx)

      expect(spy).toHaveBeenCalledTimes(2)
      spy.mockRestore()
    })
  })
})
