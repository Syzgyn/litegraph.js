import { describe, expect, test } from "vitest"

import { LGraphCanvas, LGraphNode } from "@/litegraph"

class CustomMouseDownNode extends LGraphNode {
  handled = false

  override onMouseDown(): boolean {
    this.handled = true
    return true
  }
}

describe("LGraphNode onMouseDown subclass override", () => {
  test("subclass onMouseDown is not replaced by the constructor", () => {
    const node = new CustomMouseDownNode("Custom")
    const canvas = {} as LGraphCanvas

    expect(node.onMouseDown?.({} as never, [0, 0], canvas)).toBe(true)
    expect(node.handled).toBe(true)
  })

  test("base nodes have no default onMouseDown implementation", () => {
    const node = new LGraphNode("Base")
    expect(node.onMouseDown).toBeUndefined()
  })
})
