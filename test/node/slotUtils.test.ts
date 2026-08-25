import type { INodeOutputSlot, IWidget } from "@/litegraph"

import { describe, expect, test } from "vitest"

import { LGraphNode } from "@/litegraph"
import { outputAsSerialisable } from "@/node/slotUtils"

type OutputSlotParam = INodeOutputSlot & { widget?: IWidget }

describe("outputAsSerialisable", () => {
  test("clones the links array to prevent shared reference mutation", () => {
    const node = new LGraphNode("test")
    const output = node.addOutput("out", "number")
    output.links = [1, 2, 3]

    const serialised = outputAsSerialisable(output as OutputSlotParam)

    expect(serialised.links).toEqual([1, 2, 3])
    expect(serialised.links).not.toBe(output.links)

    output.links.push(4)
    expect(serialised.links).toHaveLength(3)
  })

  test("preserves null links", () => {
    const node = new LGraphNode("test")
    const output = node.addOutput("out", "number")
    output.links = null

    const serialised = outputAsSerialisable(output as OutputSlotParam)
    expect(serialised.links).toBeNull()
  })
})
