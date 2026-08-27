import { describe, expect, test, vi } from "vitest"

import { LGraphCanvas } from "@/litegraph"

describe("LGraphCanvas auxclick", () => {
  const canvas = Object.create(LGraphCanvas.prototype) as LGraphCanvas

  test("prevents default for middle-button auxclick", () => {
    const event = new MouseEvent("auxclick", { button: 1, bubbles: true })
    const preventDefault = vi.spyOn(event, "preventDefault")

    canvas.preventMiddleAuxClick(event)

    expect(preventDefault).toHaveBeenCalled()
  })

  test("does not prevent default for non-middle auxclick", () => {
    const event = new MouseEvent("auxclick", { button: 0, bubbles: true })
    const preventDefault = vi.spyOn(event, "preventDefault")

    canvas.preventMiddleAuxClick(event)

    expect(preventDefault).not.toHaveBeenCalled()
  })
})
