import type { RenderLink } from "./RenderLink"
import type { LinkConnectorEventMap } from "@/infrastructure/LinkConnectorEventMap"
import type { ConnectingLink, ItemLocator, LinkNetwork, LinkSegment } from "@/interfaces"
import type { INodeInputSlot, INodeOutputSlot } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { CanvasPointerEvent } from "@/types/events"
import type { IBaseWidget } from "@/types/widgets"

import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "@/constants"
import { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import { LLink } from "@/LLink"
import { Subgraph } from "@/subgraph/Subgraph"
import { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import { LinkDirection } from "@/types/globalEnums"

import { FloatingRenderLink } from "./FloatingRenderLink"
import { MovingInputLink } from "./MovingInputLink"
import { MovingLinkBase } from "./MovingLinkBase"
import { MovingOutputLink } from "./MovingOutputLink"
import { ToInputFromIoNodeLink } from "./ToInputFromIoNodeLink"
import { ToInputRenderLink } from "./ToInputRenderLink"
import { ToOutputFromIoNodeLink } from "./ToOutputFromIoNodeLink"
import { ToOutputFromRerouteLink } from "./ToOutputFromRerouteLink"
import { ToOutputRenderLink } from "./ToOutputRenderLink"

/**
 * A Litegraph state object for the {@link LinkConnector}.
 * References are only held atomically within a function, never passed.
 * The concrete implementation may be replaced or proxied without side-effects.
 */
export interface LinkConnectorState {
  /**
   * The type of slot that links are being connected **to**.
   * - When `undefined`, no operation is being performed.
   * - A change in this property indicates the start or end of dragging links.
   */
  connectingTo: "input" | "output" | undefined

  /**
   * When `true`, multiple links are being dragged simultaneously.
   *
   * Set by {@link LinkConnector.moveOutputLink} when dragging all links from an output slot.
   */
  multi: boolean

  /** When `true`, existing links are being repositioned. Otherwise, new links are being created. */
  draggingExistingLinks: boolean

  /** When set, connecting links will all snap to this position. */
  snapLinksPos?: [number, number]
}

/** Discriminated union to simplify type narrowing. */
type RenderLinkUnion =
  | MovingInputLink
  | MovingOutputLink
  | FloatingRenderLink
  | ToInputRenderLink
  | ToOutputRenderLink
  | ToInputFromIoNodeLink
  | ToOutputFromIoNodeLink

/**
 * Snapshot of an in-progress link drag operation, returned by {@link LinkConnector.export}.
 * @remarks
 * All array and state properties are shallow clones; mutating them does not affect the
 * {@link LinkConnector} instance.
 */
export interface LinkConnectorExport {
  /** Active {@link RenderLink} instances driving the drag rendering and drop logic. */
  renderLinks: RenderLink[]

  /** Existing {@link LLink}s whose input end is being repositioned. */
  inputLinks: LLink[]

  /** Existing {@link LLink}s whose output end is being repositioned. */
  outputLinks: LLink[]

  /** Floating {@link LLink}s being completed during this drag. */
  floatingLinks: LLink[]

  /** Shallow copy of the current {@link LinkConnectorState}. */
  state: LinkConnectorState

  /** The graph (or subgraph) that owns the links being connected. */
  network: LinkNetwork
}

/**
 * Component of {@link LGraphCanvas} that handles connecting and moving links.
 * @see {@link LLink}
 */
export class LinkConnector {
  /**
   * Link connection state POJO. Source of truth for state of link drag operations.
   *
   * Can be replaced or proxied to allow notifications. Is always dereferenced at the start of
   * an operation.
   * @see {@link LinkConnectorState}
   */
  state: LinkConnectorState = {
    connectingTo: undefined,
    multi: false,
    draggingExistingLinks: false,
    snapLinksPos: undefined,
  }

  /**
   * Event bus for link drag lifecycle hooks.
   *
   * Dispatches events such as `"before-move-input"`, `"link-created"`, `"input-moved"`,
   * `"output-moved"`, `"reset"`, and `"after-drop-links"`. Listeners may return `false` to
   * veto an operation.
   * @see {@link LinkConnectorEventMap}
   */
  readonly events = new CustomEventTarget<LinkConnectorEventMap>()

  /**
   * Active {@link RenderLink} instances for the current drag operation.
   *
   * Contains rendering and connection metadata only; the underlying {@link LLink} objects are
   * tracked separately in {@link inputLinks}, {@link outputLinks}, and {@link floatingLinks}.
   */
  readonly renderLinks: RenderLinkUnion[] = []

  /** Existing links that are being moved **to** a new input slot. */
  readonly inputLinks: LLink[] = []

  /** Existing links that are being moved **to** a new output slot. */
  readonly outputLinks: LLink[] = []

  /** Existing floating links that are being moved to a new slot. */
  readonly floatingLinks: LLink[] = []

  /**
   * Reroutes hidden during an output-side multi-link drag.
   *
   * The first reroute in each link chain is hidden (and marked `_dragging`) so the rendered
   * link segments originate from the reroute position rather than the output slot.
   */
  readonly hiddenReroutes: Set<Reroute> = new Set()

  /**
   * The widget beneath the pointer, if it is a valid connection target.
   *
   * Set by {@link LGraphCanvas} during hover; used by {@link dropOnNode} as a fallback when
   * the pointer is not directly over an input slot.
   */
  overWidget?: IBaseWidget

  /** The slot type (from a downstream callback) associated with {@link overWidget}. */
  overWidgetType?: string

  /**
   * The reroute beneath the pointer, if it is a valid connection target.
   *
   * Updated during hover by {@link LGraphCanvas} for highlight rendering.
   */
  overReroute?: Reroute

  readonly #setConnectingLinks: (value: ConnectingLink[]) => void

  /**
   * @param setConnectingLinks Callback that synchronises the legacy `connecting_links` array
   * on {@link LGraphCanvas}. Invoked whenever a drag operation starts to populate the
   * extension-compatible representation.
   */
  constructor(setConnectingLinks: (value: ConnectingLink[]) => void) {
    this.#setConnectingLinks = setConnectingLinks
  }

  /**
   * Whether a link drag operation is currently in progress.
   *
   * Equivalent to `state.connectingTo !== undefined`.
   */
  get isConnecting() {
    return this.state.connectingTo !== undefined
  }

  /**
   * Whether the current drag is repositioning existing links rather than creating new ones.
   *
   * Mirrors {@link LinkConnectorState.draggingExistingLinks}.
   */
  get draggingExistingLinks() {
    return this.state.draggingExistingLinks
  }

  /**
   * Begins dragging an existing link's input end to a new connection target.
   *
   * Handles three cases:
   * - A floating link parented to a reroute → creates a {@link FloatingRenderLink}.
   * - A subgraph input link → creates a {@link ToInputFromIoNodeLink}.
   * - A regular node link → creates a {@link MovingInputLink}.
   * @param network The graph (or subgraph) that owns the link.
   * @param input The input slot whose connected link is being repositioned.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  moveInputLink(network: LinkNetwork, input: INodeInputSlot): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const { state, inputLinks, renderLinks } = this

    const linkId = input.link
    if (linkId == null) {
      // No link connected, check for a floating link
      const floatingLink = input._floatingLinks?.values().next().value
      if (floatingLink?.parentId == null) return

      try {
        const reroute = network.reroutes.get(floatingLink.parentId)
        if (!reroute) throw new Error(`Invalid reroute id: [${floatingLink.parentId}] for floating link id: [${floatingLink.id}].`)

        const renderLink = new FloatingRenderLink(network, floatingLink, "input", reroute)
        const mayContinue = this.events.dispatch("before-move-input", renderLink)
        if (mayContinue === false) return

        renderLinks.push(renderLink)
      } catch (error) {
        console.warn(`Could not create render link for link id: [${floatingLink.id}].`, floatingLink, error)
      }

      floatingLink._dragging = true
      this.floatingLinks.push(floatingLink)
    } else {
      const link = network.links.get(linkId)
      if (!link) return

      // Special handling for links from subgraph input nodes
      if (link.origin_id === SUBGRAPH_INPUT_ID) {
        // For subgraph input links, we need to handle them differently
        // since they don't have a regular output node
        const subgraphInput = network.inputNode?.slots[link.origin_slot]
        if (!subgraphInput) {
          console.warn(`Could not find subgraph input for slot [${link.origin_slot}]`)
          return
        }

        try {
          const reroute = network.getReroute(link.parentId)
          const renderLink = new ToInputFromIoNodeLink(network, network.inputNode, subgraphInput, reroute, LinkDirection.CENTER, link)

          // Note: We don't dispatch the before-move-input event for subgraph input links
          // as the event type doesn't support ToInputFromIoNodeLink

          renderLinks.push(renderLink)

          this.listenUntilReset("input-moved", () => {
            link.disconnect(network, "input")
          })
        } catch (error) {
          console.warn(`Could not create render link for subgraph input link id: [${link.id}].`, link, error)
          return
        }

        link._dragging = true
        inputLinks.push(link)
      } else {
        // Regular node links
        try {
          const reroute = network.getReroute(link.parentId)
          const renderLink = new MovingInputLink(network, link, reroute)

          const mayContinue = this.events.dispatch("before-move-input", renderLink)
          if (mayContinue === false) return

          renderLinks.push(renderLink)

          this.listenUntilReset("input-moved", (e) => {
            if ("link" in e.detail && e.detail.link) {
              e.detail.link.disconnect(network, "output")
            }
          })
        } catch (error) {
          console.warn(`Could not create render link for link id: [${link.id}].`, link, error)
          return
        }

        link._dragging = true
        inputLinks.push(link)
      }
    }

    state.connectingTo = "input"
    state.draggingExistingLinks = true

    this.#setLegacyLinks(false)
  }

  /**
   * Begins dragging all links from an output slot to new connection targets.
   *
   * Creates a {@link MovingOutputLink} (or {@link FloatingRenderLink}) for each connected link
   * and sets {@link LinkConnectorState.multi} to `true`. The first reroute in each link chain
   * is added to {@link hiddenReroutes}.
   * @param network The graph (or subgraph) that owns the links.
   * @param output The output slot whose connected links are being repositioned.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  moveOutputLink(network: LinkNetwork, output: INodeOutputSlot): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const { state, renderLinks } = this

    // Floating links
    if (output._floatingLinks?.size) {
      for (const floatingLink of output._floatingLinks.values()) {
        try {
          const reroute = LLink.getFirstReroute(network, floatingLink)
          if (!reroute) throw new Error(`Invalid reroute id: [${floatingLink.parentId}] for floating link id: [${floatingLink.id}].`)

          const renderLink = new FloatingRenderLink(network, floatingLink, "output", reroute)
          const mayContinue = this.events.dispatch("before-move-output", renderLink)
          if (mayContinue === false) continue

          renderLinks.push(renderLink)
          this.floatingLinks.push(floatingLink)
        } catch (error) {
          console.warn(`Could not create render link for link id: [${floatingLink.id}].`, floatingLink, error)
        }
      }
    }

    // Normal links
    if (output.links?.length) {
      for (const linkId of output.links) {
        const link = network.links.get(linkId)
        if (!link) continue

        const firstReroute = LLink.getFirstReroute(network, link)
        if (firstReroute) {
          firstReroute._dragging = true
          this.hiddenReroutes.add(firstReroute)
        } else {
          link._dragging = true
        }
        this.outputLinks.push(link)

        try {
          const renderLink = new MovingOutputLink(network, link, firstReroute, LinkDirection.RIGHT)

          const mayContinue = this.events.dispatch("before-move-output", renderLink)
          if (mayContinue === false) continue

          renderLinks.push(renderLink)
        } catch (error) {
          console.warn(`Could not create render link for link id: [${link.id}].`, link, error)
          continue
        }
      }
    }

    if (renderLinks.length === 0) return

    state.draggingExistingLinks = true
    state.multi = true
    state.connectingTo = "output"

    this.#setLegacyLinks(true)
  }

  /**
   * Begins dragging a new link from an output slot toward an input slot.
   *
   * Creates a {@link ToInputRenderLink} and sets {@link LinkConnectorState.connectingTo} to
   * `"input"`.
   * @param network The graph (or subgraph) that will own the new link.
   * @param node The node whose output slot the link is dragged from.
   * @param output The output slot at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  dragNewFromOutput(network: LinkNetwork, node: LGraphNode, output: INodeOutputSlot, fromReroute?: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const { state } = this
    const renderLink = new ToInputRenderLink(network, node, output, fromReroute)
    this.renderLinks.push(renderLink)

    state.connectingTo = "input"

    this.#setLegacyLinks(false)
  }

  /**
   * Begins dragging a new link from an input slot toward an output slot.
   *
   * Creates a {@link ToOutputRenderLink} and sets {@link LinkConnectorState.connectingTo} to
   * `"output"`.
   * @param network The graph (or subgraph) that will own the new link.
   * @param node The node whose input slot the link is dragged from.
   * @param input The input slot at the origin of the drag.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  dragNewFromInput(network: LinkNetwork, node: LGraphNode, input: INodeInputSlot, fromReroute?: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const { state } = this
    const renderLink = new ToOutputRenderLink(network, node, input, fromReroute)
    this.renderLinks.push(renderLink)

    state.connectingTo = "output"

    this.#setLegacyLinks(true)
  }

  /**
   * Begins dragging a new link from a subgraph input boundary toward an input slot.
   * @param network The subgraph that owns the input boundary.
   * @param inputNode The {@link SubgraphInputNode} displaying subgraph inputs.
   * @param input The {@link SubgraphInput} slot the link is dragged from.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  dragNewFromSubgraphInput(network: LinkNetwork, inputNode: SubgraphInputNode, input: SubgraphInput, fromReroute?: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const renderLink = new ToInputFromIoNodeLink(network, inputNode, input, fromReroute)
    this.renderLinks.push(renderLink)

    this.state.connectingTo = "input"

    this.#setLegacyLinks(false)
  }

  /**
   * Begins dragging a new link from a subgraph output boundary toward an output slot.
   * @param network The subgraph that owns the output boundary.
   * @param outputNode The {@link SubgraphOutputNode} displaying subgraph outputs.
   * @param output The {@link SubgraphOutput} slot the link is dragged from.
   * @param fromReroute When dragging from a reroute, the reroute at the chain origin.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  dragNewFromSubgraphOutput(network: LinkNetwork, outputNode: SubgraphOutputNode, output: SubgraphOutput, fromReroute?: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const renderLink = new ToOutputFromIoNodeLink(network, outputNode, output, fromReroute)
    this.renderLinks.push(renderLink)

    this.state.connectingTo = "output"

    this.#setLegacyLinks(true)
  }

  /**
   * Begins dragging a new link from a reroute toward an input slot.
   *
   * Resolves the link attached to the reroute and creates either a {@link ToInputFromIoNodeLink}
   * (for subgraph inputs) or a {@link ToInputRenderLink} (for regular outputs). Sets
   * {@link fromDirection} to {@link LinkDirection.NONE} on the created render link.
   * @param network The graph (or subgraph) that owns the reroute.
   * @param reroute The reroute the link is dragged from.
   * @throws When a drag is already in progress ({@link isConnecting}).
   * @throws When a subgraph input link is found but {@link network} is not a {@link Subgraph}.
   */
  dragFromReroute(network: LinkNetwork, reroute: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const link = reroute.firstLink ?? reroute.firstFloatingLink
    if (!link) {
      console.warn("No link found for reroute.")
      return
    }

    if (link.origin_id === SUBGRAPH_INPUT_ID) {
      if (!(network instanceof Subgraph)) {
        console.warn("Subgraph input link found in non-subgraph network.")
        return
      }

      const input = network.inputs.at(link.origin_slot)
      if (!input) throw new Error("No subgraph input found for link.")

      const renderLink = new ToInputFromIoNodeLink(network, network.inputNode, input, reroute)
      renderLink.fromDirection = LinkDirection.NONE
      this.renderLinks.push(renderLink)

      this.state.connectingTo = "input"

      this.#setLegacyLinks(false)
      return
    }

    const outputNode = network.getNodeById(link.origin_id)
    if (!outputNode) {
      console.warn("No output node found for link.", link)
      return
    }

    const outputSlot = outputNode.outputs.at(link.origin_slot)
    if (!outputSlot) {
      console.warn("No output slot found for link.", link)
      return
    }

    const renderLink = new ToInputRenderLink(network, outputNode, outputSlot, reroute)
    renderLink.fromDirection = LinkDirection.NONE
    this.renderLinks.push(renderLink)

    this.state.connectingTo = "input"

    this.#setLegacyLinks(false)
  }

  /**
   * Begins dragging a new link from a reroute toward an output slot.
   *
   * Resolves the link attached to the reroute and creates either a
   * {@link ToOutputFromIoNodeLink} (for subgraph outputs), a {@link ToOutputFromRerouteLink}
   * (for regular inputs), setting {@link fromDirection} appropriately on each.
   * @param network The graph (or subgraph) that owns the reroute.
   * @param reroute The reroute the link is dragged from.
   * @throws When a drag is already in progress ({@link isConnecting}).
   * @throws When a subgraph output link is found but {@link network} is not a {@link Subgraph}.
   */
  dragFromRerouteToOutput(network: LinkNetwork, reroute: Reroute): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const link = reroute.firstLink ?? reroute.firstFloatingLink
    if (!link) {
      console.warn("No link found for reroute.")
      return
    }

    if (link.target_id === SUBGRAPH_OUTPUT_ID) {
      if (!(network instanceof Subgraph)) {
        console.warn("Subgraph output link found in non-subgraph network.")
        return
      }

      const output = network.outputs.at(link.target_slot)
      if (!output) throw new Error("No subgraph output found for link.")

      const renderLink = new ToOutputFromIoNodeLink(network, network.outputNode, output, reroute)
      renderLink.fromDirection = LinkDirection.NONE
      this.renderLinks.push(renderLink)

      this.state.connectingTo = "output"

      this.#setLegacyLinks(false)
      return
    }

    const inputNode = network.getNodeById(link.target_id)
    if (!inputNode) {
      console.warn("No input node found for link.", link)
      return
    }

    const inputSlot = inputNode.inputs.at(link.target_slot)
    if (!inputSlot) {
      console.warn("No input slot found for link.", link)
      return
    }

    const renderLink = new ToOutputFromRerouteLink(network, inputNode, inputSlot, reroute, this)
    renderLink.fromDirection = LinkDirection.LEFT
    this.renderLinks.push(renderLink)

    this.state.connectingTo = "output"

    this.#setLegacyLinks(true)
  }

  /**
   * Begins dragging a new link from a point on an existing link segment.
   *
   * Resolves the segment's origin node and output slot, then creates a {@link ToInputRenderLink}
   * with {@link LinkDirection.NONE} at the reroute (if any) along the segment.
   * @param network The graph (or subgraph) that owns the link segment.
   * @param linkSegment The clicked segment of an existing link, including origin and parent reroute.
   * @throws When a drag is already in progress ({@link isConnecting}).
   */
  dragFromLinkSegment(network: LinkNetwork, linkSegment: LinkSegment): void {
    if (this.isConnecting) throw new Error("Already dragging links.")

    const { state } = this
    if (linkSegment.origin_id == null || linkSegment.origin_slot == null) return

    const node = network.getNodeById(linkSegment.origin_id)
    if (!node) return

    const slot = node.outputs.at(linkSegment.origin_slot)
    if (!slot) return

    const reroute = network.getReroute(linkSegment.parentId)
    const renderLink = new ToInputRenderLink(network, node, slot, reroute)
    renderLink.fromDirection = LinkDirection.NONE
    this.renderLinks.push(renderLink)

    state.connectingTo = "input"

    this.#setLegacyLinks(false)
  }

  /**
   * Completes the current drag by connecting links at the drop location.
   *
   * Resolves the item under the pointer via {@link ItemLocator} and delegates to
   * {@link dropOnIoNode}, {@link dropOnNode}, {@link dropOnReroute}, or {@link dropOnNothing}.
   * Always dispatches `"after-drop-links"` in a `finally` block.
   * @param locator Provides hit-testing for nodes, IO nodes, and reroutes at the drop position.
   * @param event The pointer event containing canvas-space coordinates.
   */
  dropLinks(locator: ItemLocator, event: CanvasPointerEvent): void {
    if (!this.isConnecting) {
      const mayContinue = this.events.dispatch("before-drop-links", { renderLinks: this.renderLinks, event })
      if (mayContinue === false) return
    }

    try {
      const { canvasX, canvasY } = event

      const ioNode = locator.getIoNodeOnPos?.(canvasX, canvasY)
      if (ioNode) {
        this.dropOnIoNode(ioNode, event)
        return
      }

      const node = locator.getNodeOnPos(canvasX, canvasY) ?? undefined
      if (node) {
        this.dropOnNode(node, event)
      } else {
        // Get reroute if no node is found
        const reroute = locator.getRerouteOnPos(canvasX, canvasY)
        // Drop output->input link on reroute is not impl.
        if (reroute && this.isRerouteValidDrop(reroute)) {
          this.dropOnReroute(reroute, event)
        } else {
          this.dropOnNothing(event)
        }
      }
    } finally {
      this.events.dispatch("after-drop-links", { renderLinks: this.renderLinks, event })
    }
  }

  /**
   * Handles dropping links onto a subgraph IO boundary node.
   *
   * When connecting to an input, resolves the slot on a {@link SubgraphOutputNode} and calls
   * {@link RenderLink.connectToSubgraphOutput} on each render link. When connecting to an output,
   * resolves the slot on a {@link SubgraphInputNode} and calls
   * {@link RenderLink.connectToSubgraphInput}.
   * @param ioNode The subgraph input or output boundary node under the pointer.
   * @param event The pointer event containing canvas-space coordinates.
   * @throws When no matching slot is found at the drop position.
   */
  dropOnIoNode(ioNode: SubgraphInputNode | SubgraphOutputNode, event: CanvasPointerEvent): void {
    const { renderLinks, state } = this
    const { connectingTo } = state
    const { canvasX, canvasY } = event

    if (connectingTo === "input" && ioNode instanceof SubgraphOutputNode) {
      const output = ioNode.getSlotInPosition(canvasX, canvasY)
      if (!output) throw new Error("No output slot found for link.")

      for (const link of renderLinks) {
        link.connectToSubgraphOutput(output, this.events)
      }
    } else if (connectingTo === "output" && ioNode instanceof SubgraphInputNode) {
      const input = ioNode.getSlotInPosition(canvasX, canvasY)
      if (!input) throw new Error("No input slot found for link.")

      for (const link of renderLinks) {
        link.connectToSubgraphInput(input, this.events)
      }
    } else {
      console.error("Invalid connectingTo state &/ ioNode", connectingTo, ioNode)
    }
  }

  /**
   * Handles dropping links onto a regular graph node.
   *
   * Resolves the slot under the pointer (or falls back to {@link overWidget} for input drags)
   * and delegates to the private `#dropOnInput` / `#dropOnOutput` helpers. When no slot is
   * hit, falls back to {@link connectToNode} for type-based auto-matching.
   * @param node The node under the pointer.
   * @param event The pointer event containing canvas-space coordinates.
   */
  dropOnNode(node: LGraphNode, event: CanvasPointerEvent) {
    const { renderLinks, state } = this
    const { connectingTo } = state
    const { canvasX, canvasY } = event

    // Do nothing if every connection would loop back
    if (renderLinks.every(link => link.node === node)) return

    // To output
    if (connectingTo === "output") {
      const output = node.getOutputOnPos([canvasX, canvasY])

      if (output) {
        this.#dropOnOutput(node, output)
      } else {
        this.connectToNode(node, event)
      }
    // To input
    } else if (connectingTo === "input") {
      const input = node.getInputOnPos([canvasX, canvasY])
      const inputOrSocket = input ?? node.getSlotFromWidget(this.overWidget)

      // Input slot
      if (inputOrSocket) {
        this.#dropOnInput(node, inputOrSocket)
      } else {
        // Node background / title
        this.connectToNode(node, event)
      }
    }
  }

  /**
   * Handles dropping links onto a reroute.
   *
   * For input-directed drags, delegates to {@link _connectOutputToReroute} with the single
   * render link. For output-directed drags, finds the reroute's source output and calls
   * {@link RenderLink.connectToRerouteOutput} on each compatible link.
   * @param reroute The reroute under the pointer.
   * @param event The pointer event; may be used by `"dropped-on-reroute"` listeners to veto.
   * @throws When multiple input links are dropped on a single reroute.
   */
  dropOnReroute(reroute: Reroute, event: CanvasPointerEvent): void {
    const mayContinue = this.events.dispatch("dropped-on-reroute", { reroute, event })
    if (mayContinue === false) return

    // Connecting to input
    if (this.state.connectingTo === "input") {
      if (this.renderLinks.length !== 1) throw new Error(`Attempted to connect ${this.renderLinks.length} input links to a reroute.`)

      const renderLink = this.renderLinks[0]
      this._connectOutputToReroute(reroute, renderLink)

      return
    }

    // Connecting to output
    for (const link of this.renderLinks) {
      if (link.toType !== "output") continue

      const result = reroute.findSourceOutput()
      if (!result) continue

      const { node, output } = result
      if (!link.canConnectToOutput(node, output)) continue

      link.connectToRerouteOutput(reroute, node, output, this.events)
    }
  }

  /**
   * Connects an output-directed render link to a reroute's input side.
   *
   * Finds all target inputs along the reroute chain, filters by compatibility, and calls
   * {@link RenderLink.connectToRerouteInput} for each valid target. For
   * {@link ToInputRenderLink} origins, also updates floating-link tracking on intermediate
   * reroutes.
   * @internal Temporary workaround — requires refactor.
   * @param reroute The reroute being dropped on.
   * @param renderLink The render link whose free end is being connected.
   */
  _connectOutputToReroute(reroute: Reroute, renderLink: RenderLinkUnion): void {
    const results = reroute.findTargetInputs()
    if (!results?.length) return

    const maybeReroutes = reroute.getReroutes()
    if (maybeReroutes === null) throw new Error("Reroute loop detected.")

    const originalReroutes = maybeReroutes.slice(0, -1).reverse()

    // From reroute to reroute
    if (renderLink instanceof ToInputRenderLink) {
      const { node, fromSlot, fromSlotIndex, fromReroute } = renderLink

      reroute.setFloatingLinkOrigin(node, fromSlot, fromSlotIndex)

      // Clean floating link IDs from reroutes about to be removed from the chain
      if (fromReroute != null) {
        for (const originalReroute of originalReroutes) {
          if (originalReroute.id === fromReroute.id) break

          for (const linkId of reroute.floatingLinkIds) {
            originalReroute.floatingLinkIds.delete(linkId)
          }
        }
      }
    }

    // Filter before any connections are re-created
    const filtered = results.filter(result => renderLink.toType === "input" && canConnectInputLinkToReroute(renderLink, result.node, result.input, reroute))

    for (const result of filtered) {
      renderLink.connectToRerouteInput(reroute, result, this.events, originalReroutes)
    }

    return
  }

  /**
   * Handles dropping links onto empty canvas (no valid target).
   *
   * Dispatches `"dropped-on-canvas"`; listeners may return `false` to prevent disconnection.
   * Otherwise calls {@link disconnectLinks} to remove moving links.
   * @param event The pointer event; forwarded to `"dropped-on-canvas"` listeners.
   */
  dropOnNothing(event: CanvasPointerEvent): void {
    // For external event only.
    const mayContinue = this.events.dispatch("dropped-on-canvas", event)
    if (mayContinue === false) return

    this.disconnectLinks()
  }

  /**
   * Disconnects all moving links.
   * @remarks This is called when the links are dropped on the canvas.
   * May be called by consumers to e.g. drag links into a bin / void.
   */
  disconnectLinks(): void {
    for (const link of this.renderLinks) {
      if (link instanceof MovingLinkBase) {
        link.disconnect()
      }
    }
  }

  /**
   * Connects the links being dropped onto a node to the first matching slot.
   * @param node The node that the links are being dropped on
   * @param event Contains the drop location, in canvas space
   */
  connectToNode(node: LGraphNode, event: CanvasPointerEvent): void {
    const { state: { connectingTo } } = this

    const mayContinue = this.events.dispatch("dropped-on-node", { node, event })
    if (mayContinue === false) return

    // Assume all links are the same type, disallow loopback
    const firstLink = this.renderLinks[0]
    if (!firstLink) return

    // Use a single type check before looping; ensures all dropped links go to the same slot
    if (connectingTo === "output") {
      // Dropping new output link
      const output = node.findOutputByType(firstLink.fromSlot.type)?.slot
      console.debug("out", node, output, firstLink.fromSlot)
      if (output === undefined) {
        console.warn(`Could not find slot for link type: [${firstLink.fromSlot.type}].`)
        return
      }

      this.#dropOnOutput(node, output)
    } else if (connectingTo === "input") {
      // Dropping new input link
      const input = node.findInputByType(firstLink.fromSlot.type)?.slot
      console.debug("in", node, input, firstLink.fromSlot)
      if (input === undefined) {
        console.warn(`Could not find slot for link type: [${firstLink.fromSlot.type}].`)
        return
      }

      this.#dropOnInput(node, input)
    }
  }

  #dropOnInput(node: LGraphNode, input: INodeInputSlot): void {
    for (const link of this.renderLinks) {
      if (!link.canConnectToInput(node, input)) continue

      link.connectToInput(node, input, this.events)
    }
  }

  #dropOnOutput(node: LGraphNode, output: INodeOutputSlot): void {
    for (const link of this.renderLinks) {
      if (!link.canConnectToOutput(node, output)) {
        if (link instanceof MovingOutputLink && link.link.parentId !== undefined) {
          // Reconnect link without reroutes
          link.outputNode.connectSlots(link.outputSlot, link.inputNode, link.inputSlot, undefined!)
        }
        continue
      }

      link.connectToOutput(node, output, this.events)
    }
  }

  /**
   * Checks whether any active render link can be dropped on the given input slot.
   * @param node The node that owns the candidate input slot.
   * @param input The input slot to validate.
   * @returns `true` if at least one {@link renderLinks} entry passes
   * {@link RenderLink.canConnectToInput}.
   */
  isInputValidDrop(node: LGraphNode, input: INodeInputSlot): boolean {
    return this.renderLinks.some(link => link.canConnectToInput(node, input))
  }

  /**
   * Checks whether any active render link can be dropped somewhere on the given node.
   *
   * Tests all output slots (for output-directed drags) or all input slots (for input-directed
   * drags) against the current {@link renderLinks}.
   * @param node The node to validate as a drop target.
   * @returns `true` if at least one slot on the node accepts a connection.
   */
  isNodeValidDrop(node: LGraphNode): boolean {
    if (this.state.connectingTo === "output") {
      return node.outputs.some(output => this.renderLinks.some(link => link.canConnectToOutput(node, output)))
    }

    return node.inputs.some(input => this.renderLinks.some(link => link.canConnectToInput(node, input)))
  }

  /**
   * Checks if a reroute is a valid drop target for any of the links being connected.
   * @param reroute The reroute that would be dropped on.
   * @returns `true` if any of the current links being connected are valid for the given reroute.
   */
  isRerouteValidDrop(reroute: Reroute): boolean {
    if (this.state.connectingTo === "input") {
      const results = reroute.findTargetInputs()
      if (!results?.length) return false

      for (const { node, input } of results) {
        for (const renderLink of this.renderLinks) {
          if (renderLink.toType !== "input") continue
          if (canConnectInputLinkToReroute(renderLink, node, input, reroute)) return true
        }
      }
    } else {
      const result = reroute.findSourceOutput()
      if (!result) return false

      const { node, output } = result

      for (const renderLink of this.renderLinks) {
        if (renderLink.toType !== "output") continue
        if (!renderLink.canConnectToReroute(reroute)) continue
        if (renderLink.canConnectToOutput(node, output)) return true
      }
    }

    return false
  }

  /** Sets connecting_links, used by some extensions still. */
  #setLegacyLinks(fromSlotIsInput: boolean): void {
    const links = this.renderLinks.map((link) => {
      const input = fromSlotIsInput ? link.fromSlot as INodeInputSlot : null
      const output = fromSlotIsInput ? null : link.fromSlot as INodeOutputSlot

      const afterRerouteId = link instanceof MovingLinkBase ? link.link?.parentId : link.fromReroute?.id

      return {
        node: link.node as LGraphNode,
        slot: link.fromSlotIndex,
        input,
        output,
        pos: link.fromPos,
        afterRerouteId,
      } satisfies ConnectingLink
    })
    this.#setConnectingLinks(links)
  }

  /**
   * Exports the current state of the link connector.
   * @param network The network that the links being connected belong to.
   * @returns A POJO with the state of the link connector, links being connected, and their network.
   * @remarks Other than {@link network}, all properties are shallow cloned.
   */
  export(network: LinkNetwork): LinkConnectorExport {
    return {
      renderLinks: [...this.renderLinks],
      inputLinks: [...this.inputLinks],
      outputLinks: [...this.outputLinks],
      floatingLinks: [...this.floatingLinks],
      state: { ...this.state },
      network,
    }
  }

  /**
   * Adds an event listener that will be automatically removed when the reset event is fired.
   * @param eventName The event to listen for.
   * @param listener The listener to call when the event is fired.
   */
  listenUntilReset<K extends keyof LinkConnectorEventMap>(
    eventName: K,
    listener: Parameters<typeof this.events.addEventListener<K>>[1],
    options?: Parameters<typeof this.events.addEventListener<K>>[2],
  ) {
    this.events.addEventListener(eventName, listener, options)
    this.events.addEventListener("reset", () => this.events.removeEventListener(eventName, listener), { once: true })
  }

  /**
   * Resets everything to its initial state.
   *
   * Effectively cancels moving or connecting links.
   */
  reset(force = false): void {
    const mayContinue = this.events.dispatch("reset", force)
    if (mayContinue === false) return

    const { state, outputLinks, inputLinks, hiddenReroutes, renderLinks, floatingLinks } = this

    if (!force && state.connectingTo === undefined) return
    state.connectingTo = undefined

    for (const link of outputLinks) delete link._dragging
    for (const link of inputLinks) delete link._dragging
    for (const link of floatingLinks) delete link._dragging
    for (const reroute of hiddenReroutes) delete reroute._dragging

    renderLinks.length = 0
    inputLinks.length = 0
    outputLinks.length = 0
    floatingLinks.length = 0
    hiddenReroutes.clear()
    state.multi = false
    state.draggingExistingLinks = false
    state.snapLinksPos = undefined
  }
}

/** Validates that a single {@link RenderLink} can be dropped on the specified reroute. */
function canConnectInputLinkToReroute(
  link: ToInputRenderLink | MovingInputLink | FloatingRenderLink | ToInputFromIoNodeLink,
  inputNode: LGraphNode,
  input: INodeInputSlot,
  reroute: Reroute,
): boolean {
  const { fromReroute } = link

  if (
    !link.canConnectToInput(inputNode, input) ||
    // Would result in no change
    fromReroute?.id === reroute.id ||
    // Cannot connect from child to parent reroute
    fromReroute?.getReroutes()?.includes(reroute)
  ) {
    return false
  }

  // Would result in no change
  if (link instanceof ToInputRenderLink) {
    if (reroute.parentId == null) {
      // Link would make no change - output to reroute
      if (reroute.firstLink?.hasOrigin(link.node.id, link.fromSlotIndex)) return false
    } else if (link.fromReroute?.id === reroute.parentId) {
      return false
    }
  }
  return true
}
