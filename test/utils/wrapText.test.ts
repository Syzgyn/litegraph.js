/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from "vitest"

import { measureWrappedTextHeight, wrapTextToLines } from "@/utils/wrapText"

function createMeasureContext(charWidth = 7): CanvasRenderingContext2D {
  return {
    font: "14px Inter",
    measureText: vi.fn().mockImplementation((text: string) => ({
      width: text.length * charWidth,
    })),
  } as unknown as CanvasRenderingContext2D
}

describe("wrapText", () => {
  test("wrapTextToLines preserves explicit newlines", () => {
    const ctx = createMeasureContext()
    const lines = wrapTextToLines("alpha\nbeta", 200, ctx)
    expect(lines).toEqual(["alpha", "beta"])
  })

  test("wrapTextToLines wraps long lines", () => {
    const ctx = createMeasureContext()
    const lines = wrapTextToLines("one two three four five", 40, ctx)
    expect(lines.length).toBeGreaterThan(1)
  })

  test("measureWrappedTextHeight increases for narrower widths", () => {
    const ctx = createMeasureContext()
    const text = "A long line of text that should wrap across multiple rows"
    const narrow = measureWrappedTextHeight(text, 80, {
      font: "14px Inter",
      lineHeight: 18,
      verticalPadding: 8,
    }, ctx)
    const wide = measureWrappedTextHeight(text, 400, {
      font: "14px Inter",
      lineHeight: 18,
      verticalPadding: 8,
    }, ctx)
    expect(narrow).toBeGreaterThan(wide)
  })
})
