import { describe, expect, test } from "vitest"

import { LGraphNode, renameWidget } from "@/litegraph"

describe("renameWidget", () => {
  test("sets label on widget and linked input slot", () => {
    const node = new LGraphNode("test")
    const widget = node.addWidget("text", "text", "", null)
    const input = node.addInput("text", "STRING")
    input.widget = { name: "text" }

    renameWidget(widget, node, "Renamed")

    expect(widget.label).toBe("Renamed")
    expect(input.label).toBe("Renamed")
  })

  test("clears label when given an empty string", () => {
    const node = new LGraphNode("test")
    const widget = node.addWidget("text", "text", "", null)
    const input = node.addInput("text", "STRING")
    input.widget = { name: "text" }

    renameWidget(widget, node, "Renamed")
    renameWidget(widget, node, "")

    expect(widget.label).toBeUndefined()
    expect(input.label).toBeUndefined()
  })
})
