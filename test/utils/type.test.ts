import { describe, expect, test } from "vitest"

import {
  getContextMenuDisplayContent,
  getContextMenuWireValue,
  isContextMenuValue,
} from "@/utils/type"

describe("context menu value helpers", () => {
  test("isContextMenuValue identifies structured menu entries", () => {
    expect(isContextMenuValue({ content: "Label", value: "wire" })).toBe(true)
    expect(isContextMenuValue("plain")).toBe(false)
    expect(isContextMenuValue({ value: "wire" })).toBe(false)
    expect(isContextMenuValue(null)).toBe(false)
    expect(isContextMenuValue(undefined)).toBe(false)
  })

  test("getContextMenuWireValue unwraps structured entries", () => {
    expect(getContextMenuWireValue({ content: "Label", value: "wire" })).toBe("wire")
    expect(getContextMenuWireValue("plain")).toBe("plain")
    expect(getContextMenuWireValue(undefined)).toBeUndefined()
    expect(getContextMenuWireValue(null)).toBeNull()
  })

  test("getContextMenuDisplayContent prefers content over value", () => {
    expect(getContextMenuDisplayContent({ content: "Label", value: "wire" })).toBe("Label")
    expect(getContextMenuDisplayContent({ content: undefined, value: "wire" })).toBe("wire")
    expect(getContextMenuDisplayContent("plain")).toBe("plain")
    expect(getContextMenuDisplayContent(null)).toBe("")
  })
})
