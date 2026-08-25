import { beforeEach, describe, expect, test, vi } from "vitest"

import { LinkConnector } from "@/canvas/LinkConnector"
import { ToInputFromIoNodeLink } from "@/canvas/ToInputFromIoNodeLink"
import { LGraphNode, LinkDirection } from "@/litegraph"

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
})
