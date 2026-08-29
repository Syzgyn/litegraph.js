import type { IWidgetOptions } from "@/types/widgets"

import { describe, expect, test } from "vitest"

import { clampWidgetValue, evaluateInput, getWidgetStep } from "@/utils/widget"

describe("getWidgetStep", () => {
  test("should return step2 when available", () => {
    const options: IWidgetOptions<unknown> = {
      step2: 0.5,
      step: 20,
    }

    expect(getWidgetStep(options)).toBe(0.5)
  })

  test("should calculate from step when step2 is not available", () => {
    const options: IWidgetOptions<unknown> = {
      step: 20,
    }

    expect(getWidgetStep(options)).toBe(2) // 20 * 0.1 = 2
  })

  test("should use default step value of 10 when neither step2 nor step is provided", () => {
    const options: IWidgetOptions<unknown> = {}

    expect(getWidgetStep(options)).toBe(1) // 10 * 0.1 = 1
  })
  // Zero value is not allowed for step, fallback to 1.
  test("should handle zero values correctly", () => {
    const optionsWithZeroStep2: IWidgetOptions<unknown> = {
      step2: 0,
      step: 20,
    }

    expect(getWidgetStep(optionsWithZeroStep2)).toBe(2)

    const optionsWithZeroStep: IWidgetOptions<unknown> = {
      step: 0,
    }

    expect(getWidgetStep(optionsWithZeroStep)).toBe(1)
  })
})

describe("clampWidgetValue", () => {
  test("clamps to min and max when both are set", () => {
    const widget = { options: { min: 0, max: 10 } }

    expect(clampWidgetValue(widget, 5)).toBe(5)
    expect(clampWidgetValue(widget, -1)).toBe(0)
    expect(clampWidgetValue(widget, 15)).toBe(10)
  })

  test("returns value unchanged when no bounds are set", () => {
    expect(clampWidgetValue({ options: {} }, 42)).toBe(42)
  })
})

describe("evaluateInput", () => {
  test.each([
    ["42", 42],
    ["3.14", 3.14],
    ["-7", -7],
    ["0", 0],
  ])("plain number: \"%s\" = %d", (input, expected) => {
    expect(evaluateInput(input)).toBe(expected)
  })

  test.each([
    ["2+3", 5],
    ["(4+2)*3", 18],
    ["3.14*2", 6.28],
    ["10/2+3", 8],
  ])("expression: \"%s\" = %d", (input, expected) => {
    expect(evaluateInput(input)).toBe(expected)
  })

  test("empty string returns 0 (Number(\"\") === 0)", () => {
    expect(evaluateInput("")).toBe(0)
  })

  test.each(["abc", "hello world"])(
    "invalid input returns undefined: \"%s\"",
    (input) => {
      expect(evaluateInput(input)).toBeUndefined()
    },
  )

  test("division by zero returns undefined", () => {
    expect(evaluateInput("1/0")).toBeUndefined()
  })

  test("0/0 returns undefined (NaN is filtered)", () => {
    expect(evaluateInput("0/0")).toBeUndefined()
  })

  test("scientific notation via Number() fallback", () => {
    expect(evaluateInput("1e5")).toBe(100_000)
  })

  test("hex notation via Number() fallback", () => {
    expect(evaluateInput("0xff")).toBe(255)
  })

  test.each(["Infinity", "-Infinity"])(
    "\"%s\" returns undefined (non-finite rejected)",
    (input) => {
      expect(evaluateInput(input)).toBeUndefined()
    },
  )
})
