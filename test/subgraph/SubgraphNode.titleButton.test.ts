import { describe, expect, it, vi } from "vitest"

import { LGraphButton } from "@/LGraphButton"
import { LGraphCanvas } from "@/LGraphCanvas"

import { handleTitleButtonClick } from "../utils/canvasTitleButton"
import { createTestSubgraph, createTestSubgraphNode } from "./fixtures/subgraphHelpers"

describe("SubgraphNode Title Button", () => {
  describe("Constructor", () => {
    it("should automatically add enterSubgraph button", () => {
      const subgraph = createTestSubgraph({
        name: "Test Subgraph",
        inputs: [{ name: "input", type: "number" }],
      })

      const subgraphNode = createTestSubgraphNode(subgraph)

      expect(subgraphNode.titleButtons).toHaveLength(1)

      const button = subgraphNode.titleButtons[0]
      expect(button).toBeInstanceOf(LGraphButton)
      expect(button.name).toBe("enterSubgraph")
      expect(button.text).toBe("\u{E93B}") // pi-window-maximize
      expect(button.xOffset).toBe(-10)
      expect(button.yOffset).toBe(0)
      expect(button.fontSize).toBe(16)
    })

    it("should preserve enterSubgraph button when adding more buttons", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)

      // Add another button
      const customButton = subgraphNode.addTitleButton({
        name: "customButton",
        text: "C",
      })

      expect(subgraphNode.titleButtons).toHaveLength(2)
      expect(subgraphNode.titleButtons[0].name).toBe("enterSubgraph")
      expect(subgraphNode.titleButtons[1]).toBe(customButton)
    })
  })

  describe("onTitleButtonClick", () => {
    it("should open subgraph when enterSubgraph button is clicked", () => {
      const subgraph = createTestSubgraph({
        name: "Test Subgraph",
      })

      const subgraphNode = createTestSubgraphNode(subgraph)
      const enterButton = subgraphNode.titleButtons[0]

      const canvas = {
        openSubgraph: vi.fn(),
        dispatch: vi.fn(),
      } as unknown as LGraphCanvas

      subgraphNode.onTitleButtonClick(enterButton, canvas)

      expect(canvas.openSubgraph).toHaveBeenCalledWith(subgraph)
      expect(canvas.dispatch).not.toHaveBeenCalled() // Should not call parent implementation
    })

    it("should call parent implementation for other buttons", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)

      const customButton = subgraphNode.addTitleButton({
        name: "customButton",
        text: "X",
      })

      const canvas = {
        openSubgraph: vi.fn(),
        dispatch: vi.fn(),
      } as unknown as LGraphCanvas

      subgraphNode.onTitleButtonClick(customButton, canvas)

      expect(canvas.openSubgraph).not.toHaveBeenCalled()
      expect(canvas.dispatch).toHaveBeenCalledWith("litegraph:node-title-button-clicked", {
        node: subgraphNode,
        button: customButton,
      })
    })
  })

  describe("Integration with node click handling", () => {
    it("should handle clicks on enterSubgraph button", () => {
      const subgraph = createTestSubgraph({
        name: "Nested Subgraph",
        nodeCount: 3,
      })

      const subgraphNode = createTestSubgraphNode(subgraph)
      subgraphNode.pos = [100, 100]
      subgraphNode.size = [200, 100]

      const enterButton = subgraphNode.titleButtons[0]
      enterButton.getWidth = vi.fn().mockReturnValue(25)
      enterButton.height = 20

      // Simulate button being drawn at node-relative coordinates
      // Button x: 200 - 5 - 25 = 170
      // Button y: -30 (title height)
      enterButton.lastArea[0] = 170
      enterButton.lastArea[1] = -30
      enterButton.lastArea[2] = 25
      enterButton.lastArea[3] = 20

      const canvas = {
        ctx: {
          measureText: vi.fn().mockReturnValue({ width: 25 }),
        } as unknown as CanvasRenderingContext2D,
        openSubgraph: vi.fn(),
        dispatch: vi.fn(),
      } as unknown as LGraphCanvas

      // Simulate click on the enter button
      const clickPosRelativeToNode: [number, number] = [
        275 - subgraphNode.pos[0], // 275 - 100 = 175
        80 - subgraphNode.pos[1], // 80 - 100 = -20
      ]

      const handled = handleTitleButtonClick(subgraphNode, clickPosRelativeToNode, canvas)

      expect(handled).toBe(true)
      expect(canvas.openSubgraph).toHaveBeenCalledWith(subgraph)
    })

    it("should not interfere with normal node operations", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)
      subgraphNode.pos = [100, 100]
      subgraphNode.size = [200, 100]

      const canvas = {
        ctx: {
          measureText: vi.fn().mockReturnValue({ width: 25 }),
        } as unknown as CanvasRenderingContext2D,
        openSubgraph: vi.fn(),
        dispatch: vi.fn(),
      } as unknown as LGraphCanvas

      // Click in the body of the node, not on button
      const clickPosRelativeToNode: [number, number] = [
        200 - subgraphNode.pos[0], // 200 - 100 = 100
        150 - subgraphNode.pos[1], // 150 - 100 = 50
      ]

      const handled = handleTitleButtonClick(subgraphNode, clickPosRelativeToNode, canvas)

      expect(handled).toBe(false)
      expect(canvas.openSubgraph).not.toHaveBeenCalled()
    })

    it("should not process button clicks when node is collapsed", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)
      subgraphNode.pos = [100, 100]
      subgraphNode.size = [200, 100]
      subgraphNode.flags.collapsed = true

      const enterButton = subgraphNode.titleButtons[0]
      enterButton.getWidth = vi.fn().mockReturnValue(25)
      enterButton.height = 20

      // Set button area as if it was drawn
      enterButton.lastArea[0] = 170
      enterButton.lastArea[1] = -30
      enterButton.lastArea[2] = 25
      enterButton.lastArea[3] = 20

      const canvas = {
        ctx: {
          measureText: vi.fn().mockReturnValue({ width: 25 }),
        } as unknown as CanvasRenderingContext2D,
        openSubgraph: vi.fn(),
        dispatch: vi.fn(),
      } as unknown as LGraphCanvas

      // Try to click on where the button would be
      const clickPosRelativeToNode: [number, number] = [
        275 - subgraphNode.pos[0], // 175
        80 - subgraphNode.pos[1], // -20
      ]

      const handled = handleTitleButtonClick(subgraphNode, clickPosRelativeToNode, canvas)

      // Should not handle the click when collapsed
      expect(handled).toBe(false)
      expect(canvas.openSubgraph).not.toHaveBeenCalled()
    })
  })

  describe("Visual properties", () => {
    it("should have appropriate visual properties for enter button", () => {
      const subgraph = createTestSubgraph()
      const subgraphNode = createTestSubgraphNode(subgraph)

      const enterButton = subgraphNode.titleButtons[0]

      // Check visual properties
      expect(enterButton.text).toBe("\u{E93B}") // pi-window-maximize
      expect(enterButton.fontSize).toBe(16) // Icon size
      expect(enterButton.xOffset).toBe(-10) // Positioned from right edge
      expect(enterButton.yOffset).toBe(0) // Centered vertically

      // Should be visible by default
      expect(enterButton.visible).toBe(true)
    })
  })
})
