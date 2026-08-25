import type { SubgraphInputNode } from "./SubgraphInputNode"
import type { SubgraphOutput } from "./SubgraphOutput"
import type { SubgraphInputEventMap } from "@/infrastructure/SubgraphInputEventMap"
import type { INodeInputSlot, INodeOutputSlot, Point, ReadOnlyRect } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { RerouteId } from "@/Reroute"
import type { IBaseWidget } from "@/types/widgets"

import { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import { LiteGraph } from "@/litegraph"
import { LLink } from "@/LLink"
import { NodeSlotType } from "@/types/globalEnums"

import { SubgraphSlot } from "./SubgraphSlotBase"
import { isNodeSlot, isSubgraphOutput } from "./subgraphUtils"

/**
 * An input boundary slot that bridges a parent graph into a subgraph interior.
 *
 * IMPORTANT: A subgraph "input" is both an input AND an output. It creates an extra link
 * connection point between a parent graph and a subgraph, so is conceptually similar to a reroute.
 *
 * When editing inside the subgraph, this slot is the **origin** (output side) of links that fan
 * out to internal node inputs. On the parent {@link SubgraphNode}, the corresponding slot is a
 * normal input.
 * @remarks
 * May promote a connected internal widget to the parent graph when all connected links target
 * widget-backed inputs of the same type.
 * @see {@link SubgraphOutput}
 * @see {@link SubgraphInputNode}
 */
export class SubgraphInput extends SubgraphSlot {
  /** The IO boundary node that owns and lays out this slot. */
  declare parent: SubgraphInputNode

  /** Dispatches connect/disconnect events for widget promotion and other listeners. */
  events = new CustomEventTarget<SubgraphInputEventMap>()

  /** The linked widget that this slot is connected to. */
  #widgetRef?: WeakRef<IBaseWidget>

  /**
   * The widget associated with this input, when the slot is connected to widget-backed inputs.
   *
   * Held weakly so promoted widgets can be garbage-collected when disconnected.
   */
  get _widget() {
    return this.#widgetRef?.deref()
  }

  /** Associates a widget with this input slot for promotion to the parent graph. */
  set _widget(widget) {
    this.#widgetRef = widget ? new WeakRef(widget) : undefined
  }

  /**
   * Connects this subgraph input to an internal node input slot.
   *
   * Creates a link whose origin is this slot (on the {@link SubgraphInputNode}) and whose target
   * is the given node input. Disconnects any existing link on the target input first. When the
   * target is widget-backed, validates widget compatibility and records the widget reference.
   * @param slot The internal node input to connect to.
   * @param node The node that owns {@link slot}.
   * @param afterRerouteId Optional reroute ID when the link chain continues through reroutes.
   * @returns The created {@link LLink}, or `undefined` if the connection was blocked.
   */
  override connect(slot: INodeInputSlot, node: LGraphNode, afterRerouteId?: RerouteId): LLink | undefined {
    const { subgraph } = this.parent

    // Allow nodes to block connection
    const inputIndex = node.inputs.indexOf(slot)
    if (node.onConnectInput?.(inputIndex, this.type, this, this.parent, -1) === false) return

    // if (slot instanceof SubgraphOutput) {
    //   // Subgraph IO nodes have no special handling at present.
    //   return new LLink(
    //     ++subgraph.state.lastLinkId,
    //     this.type,
    //     this.parent.id,
    //     this.parent.slots.indexOf(this),
    //     node.id,
    //     inputIndex,
    //     afterRerouteId,
    //   )
    // }

    // Disconnect target input, if it is already connected.
    if (slot.link != null) {
      subgraph.beforeChange()
      const link = subgraph.getLink(slot.link)
      this.parent._disconnectNodeInput(node, slot, link)
    }

    const inputWidget = node.getWidgetFromSlot(slot)
    if (inputWidget) {
      if (!this.matchesWidget(inputWidget)) {
        console.warn("Target input has invalid widget.", slot, node)
        return
      }

      this._widget ??= inputWidget
      this.events.dispatch("input-connected", { input: slot, widget: inputWidget })
    }

    const link = new LLink(
      ++subgraph.state.lastLinkId,
      slot.type,
      this.parent.id,
      this.parent.slots.indexOf(this),
      node.id,
      inputIndex,
      afterRerouteId,
    )

    // Add to graph links list
    subgraph._links.set(link.id, link)

    // Set link ID in each slot
    this.linkIds.push(link.id)
    slot.link = link.id

    // Reroutes
    const reroutes = LLink.getReroutes(subgraph, link)
    for (const reroute of reroutes) {
      reroute.linkIds.add(link.id)
      if (reroute.floating) delete reroute.floating
      reroute._dragging = undefined
    }

    // If this is the terminus of a floating link, remove it
    const lastReroute = reroutes.at(-1)
    if (lastReroute) {
      for (const linkId of lastReroute.floatingLinkIds) {
        const link = subgraph.floatingLinks.get(linkId)
        if (link?.parentId === lastReroute.id) {
          subgraph.removeFloatingLink(link)
        }
      }
    }
    subgraph._version++

    node.onConnectionsChange?.(
      NodeSlotType.INPUT,
      inputIndex,
      true,
      link,
      slot,
    )

    subgraph.afterChange()

    return link
  }

  /**
   * Canvas-space position for rendering this slot's label.
   *
   * Vertically centred on the right edge of the slot bounding rectangle.
   */
  get labelPos(): Point {
    const [x, y, , height] = this.boundingRect
    return [x, y + height * 0.5]
  }

  /**
   * Collects all widgets connected through this input's links.
   *
   * Walks each link ID, resolves the target input, and returns matching widgets from the
   * connected nodes.
   * @returns Widgets found on connected internal inputs.
   */
  getConnectedWidgets(): IBaseWidget[] {
    const { subgraph } = this.parent
    const widgets: IBaseWidget[] = []

    for (const linkId of this.linkIds) {
      const link = subgraph.getLink(linkId)
      if (!link) {
        console.error("Link not found", linkId)
        continue
      }

      const resolved = link.resolve(subgraph)
      if (resolved.input && resolved.inputNode?.widgets) {
        // Has no widget
        const widgetNamePojo = resolved.input.widget
        if (!widgetNamePojo) continue

        // Invalid widget name
        if (!widgetNamePojo.name) {
          console.warn("Invalid widget name", widgetNamePojo)
          continue
        }

        const widget = resolved.inputNode.widgets.find(w => w.name === widgetNamePojo.name)
        if (!widget) {
          console.warn("Widget not found", widgetNamePojo)
          continue
        }

        widgets.push(widget)
      } else {
        console.debug("No input found on link id", linkId, link)
      }
    }
    return widgets
  }

  /**
   * Validates that the connection between the new slot and the existing widget is valid.
   * Used to prevent connections between widgets that are not of the same type.
   * @param otherWidget The widget to compare to.
   * @returns `true` if the connection is valid, otherwise `false`.
   */
  matchesWidget(otherWidget: IBaseWidget): boolean {
    const widget = this.#widgetRef?.deref()
    if (!widget) return true

    if (
      otherWidget.type !== widget.type ||
      otherWidget.options.min !== widget.options.min ||
      otherWidget.options.max !== widget.options.max ||
      otherWidget.options.step !== widget.options.step ||
      otherWidget.options.step2 !== widget.options.step2 ||
      otherWidget.options.precision !== widget.options.precision
    ) {
      return false
    }

    return true
  }

  /**
   * Disconnects all links on this input and dispatches `"input-disconnected"`.
   */
  override disconnect(): void {
    super.disconnect()

    this.events.dispatch("input-disconnected", { input: this })
  }

  /**
   * Positions this slot within the input boundary node's layout.
   *
   * For inputs, the connection circle sits on the right edge of the IO node panel.
   * @param rect `[right, top, width, height]` in canvas space.
   */
  override arrange(rect: ReadOnlyRect): void {
    const [right, top, width, height] = rect
    const { boundingRect: b, pos } = this

    b[0] = right - width
    b[1] = top
    b[2] = width
    b[3] = height

    pos[0] = right - height * 0.5
    pos[1] = top + height * 0.5
  }

  /**
   * Checks if this slot is a valid target for a connection from the given slot.
   * For SubgraphInput (which acts as an output inside the subgraph),
   * the fromSlot should be an input slot.
   * @param fromSlot The slot being dragged toward this input boundary slot.
   * @returns `true` when types are compatible and the source is an input or subgraph output.
   */
  override isValidTarget(fromSlot: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput): boolean {
    if (isNodeSlot(fromSlot)) {
      return "link" in fromSlot && LiteGraph.isValidConnection(this.type, fromSlot.type)
    }

    if (isSubgraphOutput(fromSlot)) {
      return LiteGraph.isValidConnection(this.type, fromSlot.type)
    }

    return false
  }
}
