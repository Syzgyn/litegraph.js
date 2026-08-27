import type { INodeInputSlot, INodeOutputSlot } from "@/interfaces"

import { describe, expect, it } from "vitest"

import { inputAsSerialisable, outputAsSerialisable } from "@/node/slotUtils"

describe("NodeSlot", () => {
  describe("inputAsSerialisable", () => {
    it("removes data from serialized slot", () => {
      const slot: INodeOutputSlot = {
        data: "test data",
        name: "test-id",
        type: "STRING",
        links: [],
        boundingRect: [0, 0, 120, 60],
      }
      const serialized = outputAsSerialisable(slot)
      expect(serialized).not.toHaveProperty("data")
    })

    it("removes pos from widget input slots", () => {
      const widgetInputSlot: INodeInputSlot = {
        name: "test-id",
        pos: [10, 20],
        type: "STRING",
        link: null,
        widget: {
          name: "test-widget",
        },
        boundingRect: [0, 0, 120, 60],
      }

      const serialized = inputAsSerialisable(widgetInputSlot)
      expect(serialized).not.toHaveProperty("pos")
    })

    it("preserves pos for non-widget input slots", () => {
      const normalSlot: INodeInputSlot = {
        name: "test-id",
        type: "STRING",
        pos: [10, 20],
        link: null,
        boundingRect: [0, 0, 120, 60],
      }
      const serialized = inputAsSerialisable(normalSlot)
      expect(serialized).toHaveProperty("pos")
    })

    it("preserves only widget name during serialization", () => {
      const widgetInputSlot: INodeInputSlot = {
        name: "test-id",
        type: "STRING",
        link: null,
        widget: {
          name: "test-widget",
        },
        boundingRect: [0, 0, 120, 60],
      }

      const serialized = inputAsSerialisable(widgetInputSlot)
      expect(serialized.widget).toEqual({ name: "test-widget" })
      expect(serialized.widget).not.toHaveProperty("type")
      expect(serialized.widget).not.toHaveProperty("value")
      expect(serialized.widget).not.toHaveProperty("options")
    })
  })
})
