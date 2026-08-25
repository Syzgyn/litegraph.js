import type { IContextMenuValue } from "@/litegraph"

import { describe, expect, test, vi } from "vitest"

import { LGraphNode, LiteGraph } from "@/litegraph"

import { createTestSubgraph } from "./fixtures/subgraphHelpers"

describe("Subgraph IO slot context menu", () => {
  test("marks the background canvas dirty after removing a slot", () => {
    const subgraph = createTestSubgraph({
      inputs: [{ name: "steps", type: "number" }],
    })
    const setDirtyCanvas = vi.spyOn(subgraph, "setDirtyCanvas")
    const slot = subgraph.inputs[0]

    let menuCallback: ((item: IContextMenuValue) => void) | undefined
    vi.spyOn(LiteGraph, "ContextMenu").mockImplementation((_options, opts) => {
      menuCallback = opts.callback
      return {} as InstanceType<typeof LiteGraph.ContextMenu>
    })

    subgraph.inputNode.showSlotContextMenu(slot, {} as never)
    menuCallback?.({ content: "Remove Slot", value: "remove" })

    expect(setDirtyCanvas).toHaveBeenCalledWith(true, true)
  })

  test("marks the background canvas dirty after disconnecting slot links", () => {
    const subgraph = createTestSubgraph({
      inputs: [{ name: "steps", type: "number" }],
    })
    const node = new LGraphNode("Source")
    node.addInput("in", "number")
    subgraph.add(node)
    subgraph.inputNode.slots[0].connect(node.inputs[0], node)

    const setDirtyCanvas = vi.spyOn(subgraph, "setDirtyCanvas")
    const slot = subgraph.inputs[0]

    let menuCallback: ((item: IContextMenuValue) => void) | undefined
    vi.spyOn(LiteGraph, "ContextMenu").mockImplementation((_options, opts) => {
      menuCallback = opts.callback
      return {} as InstanceType<typeof LiteGraph.ContextMenu>
    })

    subgraph.inputNode.showSlotContextMenu(slot, {} as never)
    menuCallback?.({ content: "Disconnect Links", value: "disconnect" })

    expect(setDirtyCanvas).toHaveBeenCalledWith(true, true)
  })
})
