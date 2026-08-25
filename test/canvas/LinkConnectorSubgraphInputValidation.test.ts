import { beforeEach, describe, expect, test, vi } from "vitest"

import { LinkConnector } from "@/canvas/LinkConnector"
import { MovingOutputLink } from "@/canvas/MovingOutputLink"
import { ToInputFromIoNodeLink } from "@/canvas/ToInputFromIoNodeLink"
import { ToOutputRenderLink } from "@/canvas/ToOutputRenderLink"
import { LGraphNode, LLink, LinkDirection } from "@/litegraph"
import { NodeInputSlot } from "@/node/NodeInputSlot"

import { createTestSubgraph } from "../subgraph/fixtures/subgraphHelpers"

describe("LinkConnector SubgraphInput connection validation", () => {
  let connector: LinkConnector
  const mockSetConnectingLinks = vi.fn()

  beforeEach(() => {
    connector = new LinkConnector(mockSetConnectingLinks)
    vi.clearAllMocks()
  })

  describe("ToInputFromIoNodeLink", () => {
    test("should allow reconnection to same target", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "number_input", type: "number" }],
      })

      const node = new LGraphNode("TargetNode")
      node.addInput("number_in", "number")
      subgraph.add(node)

      const link = subgraph.inputNode.slots[0].connect(node.inputs[0], node)

      const renderLink = new ToInputFromIoNodeLink(
        subgraph,
        subgraph.inputNode,
        subgraph.inputNode.slots[0],
        undefined,
        LinkDirection.CENTER,
        link,
      )
      renderLink.connectToInput(node, node.inputs[0], connector.events)
      expect(node.inputs[0].link).not.toBeNull()
    })
  })

  describe("MovingOutputLink validation", () => {
    test("should implement canConnectToSubgraphInput method", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "number_input", type: "number" }],
      })

      const sourceNode = new LGraphNode("SourceNode")
      sourceNode.addOutput("number_out", "number")
      subgraph.add(sourceNode)

      const targetNode = new LGraphNode("TargetNode")
      targetNode.addInput("number_in", "number")
      subgraph.add(targetNode)

      const link = new LLink(1, "number", sourceNode.id, 0, targetNode.id, 0)
      subgraph._links.set(link.id, link)

      const movingLink = new MovingOutputLink(subgraph, link)
      expect(typeof movingLink.canConnectToSubgraphInput).toBe("function")
    })

    test("should validate type compatibility correctly", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "number_input", type: "number" }],
      })

      const sourceNode = new LGraphNode("SourceNode")
      sourceNode.addOutput("number_out", "number")
      sourceNode.addOutput("string_out", "string")
      subgraph.add(sourceNode)

      const targetNode = new LGraphNode("TargetNode")
      targetNode.addInput("number_in", "number")
      targetNode.addInput("string_in", "string")
      subgraph.add(targetNode)

      const validLink = new LLink(1, "number", sourceNode.id, 0, targetNode.id, 0)
      subgraph._links.set(validLink.id, validLink)
      const validMovingLink = new MovingOutputLink(subgraph, validLink)

      const invalidLink = new LLink(2, "string", sourceNode.id, 1, targetNode.id, 1)
      subgraph._links.set(invalidLink.id, invalidLink)
      const invalidMovingLink = new MovingOutputLink(subgraph, invalidLink)

      const numberInput = subgraph.inputs[0]
      expect(validMovingLink.canConnectToSubgraphInput(numberInput)).toBe(true)
      expect(invalidMovingLink.canConnectToSubgraphInput(numberInput)).toBe(false)
    })
  })

  describe("ToOutputRenderLink validation", () => {
    test("should implement canConnectToSubgraphInput method", () => {
      const subgraph = createTestSubgraph()
      const node = new LGraphNode("TestNode")
      node.id = 1
      node.addInput("test_in", "number")
      subgraph.add(node)

      const slot = node.inputs[0] as NodeInputSlot
      const renderLink = new ToOutputRenderLink(subgraph, node, slot)
      expect(typeof renderLink.canConnectToSubgraphInput).toBe("function")
    })
  })

  describe("dropOnIoNode validation", () => {
    test("should prevent invalid connections when dropping on SubgraphInputNode", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "number_input", type: "number" }],
      })

      const sourceNode = new LGraphNode("SourceNode")
      sourceNode.addOutput("string_out", "string")
      subgraph.add(sourceNode)

      const targetNode = new LGraphNode("TargetNode")
      targetNode.addInput("string_in", "string")
      subgraph.add(targetNode)

      const link = new LLink(1, "string", sourceNode.id, 0, targetNode.id, 0)
      subgraph._links.set(link.id, link)
      const movingLink = new MovingOutputLink(subgraph, link)

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      connector.renderLinks.push(movingLink)
      connector.state.connectingTo = "output"

      const mockEvent = { canvasX: 100, canvasY: 100 } as CanvasPointerEvent
      subgraph.inputNode.getSlotInPosition = vi.fn().mockReturnValue(subgraph.inputs[0])

      const connectSpy = vi.spyOn(movingLink, "connectToSubgraphInput")
      connector.dropOnIoNode(subgraph.inputNode, mockEvent)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid connection type",
        "string",
        "->",
        "number",
      )
      expect(connectSpy).not.toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })
  })

  describe("isSubgraphInputValidDrop", () => {
    test("should check if render links can connect to SubgraphInput", () => {
      const subgraph = createTestSubgraph({
        inputs: [{ name: "number_input", type: "number" }],
      })

      const sourceNode = new LGraphNode("SourceNode")
      sourceNode.addOutput("number_out", "number")
      sourceNode.addOutput("string_out", "string")
      subgraph.add(sourceNode)

      const targetNode = new LGraphNode("TargetNode")
      targetNode.addInput("number_in", "number")
      targetNode.addInput("string_in", "string")
      subgraph.add(targetNode)

      const validLink = new LLink(1, "number", sourceNode.id, 0, targetNode.id, 0)
      const invalidLink = new LLink(2, "string", sourceNode.id, 1, targetNode.id, 1)
      subgraph._links.set(validLink.id, validLink)
      subgraph._links.set(invalidLink.id, invalidLink)

      const validMovingLink = new MovingOutputLink(subgraph, validLink)
      const invalidMovingLink = new MovingOutputLink(subgraph, invalidLink)
      const subgraphInput = subgraph.inputs[0]

      connector.renderLinks.length = 0
      connector.renderLinks.push(invalidMovingLink)
      expect(connector.isSubgraphInputValidDrop(subgraphInput)).toBe(false)

      connector.renderLinks.length = 0
      connector.renderLinks.push(validMovingLink)
      expect(connector.isSubgraphInputValidDrop(subgraphInput)).toBe(true)
    })
  })
})
