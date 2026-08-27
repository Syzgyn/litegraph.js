import type { LinkConnector } from "./LinkConnector"
import type { LGraphNode } from "@/LGraphNode"
import type { INodeInputSlot, INodeOutputSlot, LinkNetwork } from "@/litegraph"
import type { Reroute } from "@/Reroute"

import { ToInputRenderLink } from "./ToInputRenderLink"
import { ToOutputRenderLink } from "./ToOutputRenderLink"

/**
 * Workaround subclass of `ToOutputRenderLink` for dragging from a reroute toward an output.
 *
 * When the user drops onto an output slot, this class does not connect directly. Instead it
 * creates a `ToInputRenderLink` from that output and delegates to
 * `LinkConnector.connectOutputToReroute`, which routes the connection through the reroute
 * chain's input side.
 * @remarks
 * This indirection exists because output-to-reroute connections require special reroute-chain
 * bookkeeping that is not yet unified with the standard `ToOutputRenderLink.connectToOutput`
 * path. `canConnectToReroute` always returns `false` to prevent nested reroute drops.
 * @internal
 * @see `LinkConnector.dragFromRerouteToOutput`
 * @see `LinkConnector.connectOutputToReroute`
 */
export class ToOutputFromRerouteLink extends ToOutputRenderLink {
  /**
   * @param network The graph (or subgraph) that owns the reroute chain.
   * @param node The node whose input slot the link chain terminates at.
   * @param fromSlot The input slot at the reroute chain terminus.
   * @param fromReroute The reroute the drag originates from.
   * @param linkConnector The active `LinkConnector`, used to delegate reroute connection.
   */
  constructor(
    network: LinkNetwork,
    node: LGraphNode,
    fromSlot: INodeInputSlot,
    override readonly fromReroute: Reroute,
    readonly linkConnector: LinkConnector,
  ) {
    super(network, node, fromSlot, fromReroute)
  }

  /**
   * Reroute-to-reroute drops are not supported for this workaround class.
   * @returns Always `false`.
   */
  override canConnectToReroute(): false {
    return false
  }

  /**
   * Redirects the drop to a reroute-chain connection via `ToInputRenderLink`.
   *
   * Instead of calling `ToOutputRenderLink.connectToOutput`, creates a
   * `ToInputRenderLink` from the target output and delegates to
   * `LinkConnector.connectOutputToReroute`.
   * @param node The node that owns the target output slot.
   * @param output The output slot being dropped on.
   */
  override connectToOutput(node: LGraphNode, output: INodeOutputSlot) {
    const nuRenderLink = new ToInputRenderLink(this.network, node, output)
    this.linkConnector.connectOutputToReroute(this.fromReroute, nuRenderLink)
  }
}
