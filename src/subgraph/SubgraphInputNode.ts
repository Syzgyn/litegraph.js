import type { SubgraphInput } from "./SubgraphInput"
import type { SubgraphOutput } from "./SubgraphOutput"
import type { LinkConnector } from "@/canvas/LinkConnector"
import type { CanvasPointer } from "@/CanvasPointer"
import type { DefaultConnectionColors, INodeInputSlot, INodeOutputSlot, ISlotType, Positionable } from "@/interfaces"
import type { LGraphNode, NodeId } from "@/LGraphNode"
import type { RerouteId } from "@/Reroute"
import type { CanvasPointerEvent } from "@/types/events"
import type { NodeLike } from "@/types/NodeLike"

import { SUBGRAPH_INPUT_ID } from "@/constants"
import { Rectangle } from "@/infrastructure/Rectangle"
import { LLink } from "@/LLink"
import { NodeSlotType } from "@/types/globalEnums"
import { findFreeSlotOfType } from "@/utils/collections"

import { EmptySubgraphInput } from "./EmptySubgraphInput"
import { SubgraphIONodeBase } from "./SubgraphIONodeBase"

/**
 * Fixed boundary node on the left side of a subgraph canvas listing all subgraph inputs.
 *
 * Renders the input IO panel, handles pointer interaction for dragging new links from inputs
 * into the subgraph interior, and exposes legacy {@link LGraphNode}-compatible connection APIs
 * used by {@link LinkConnector} and paste/import logic.
 * @remarks
 * Includes an {@link emptySlot} at the bottom for creating inputs on first connection.
 * Each concrete slot is a {@link SubgraphInput} stored on {@link Subgraph.inputs}.
 * @see {@link SubgraphOutputNode}
 * @see {@link SubgraphIONodeBase}
 */
export class SubgraphInputNode extends SubgraphIONodeBase<SubgraphInput> implements Positionable {
  /** Sentinel node ID used in links whose origin is a subgraph input boundary. */
  readonly id: NodeId = SUBGRAPH_INPUT_ID

  /** Virtual slot that creates a new input when a link is dropped on it. */
  readonly emptySlot: EmptySubgraphInput = new EmptySubgraphInput(this)

  /** The concrete input slots defined on this subgraph (excludes {@link emptySlot}). */
  get slots() {
    return this.subgraph.inputs
  }

  /** All drawable slots, including the empty placeholder at the end. */
  override get allSlots(): SubgraphInput[] {
    return [...this.slots, this.emptySlot]
  }

  /**
   * Canvas X coordinate used as the horizontal anchor when laying out input slots.
   *
   * Aligns slots to the inner edge of the rounded panel on the right side of the IO node.
   */
  get slotAnchorX() {
    const [x, , width] = this.boundingRect
    return x + width - SubgraphIONodeBase.roundedRadius
  }

  /**
   * Handles pointer down on the input boundary node.
   *
   * Left-click begins a link drag from the slot under the cursor via
   * {@link LinkConnector.dragNewFromSubgraphInput}. Right-click opens the slot context menu.
   * @param e The pointer event in canvas coordinates.
   * @param pointer Drag lifecycle callbacks for the active pointer.
   * @param linkConnector Active link connector managing the drag operation.
   */
  override onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void {
    // Left-click handling for dragging connections
    if (e.button === 0) {
      for (const slot of this.allSlots) {
        const slotBounds = Rectangle.fromCentre(slot.pos, slot.boundingRect.height)

        if (slotBounds.containsXy(e.canvasX, e.canvasY)) {
          pointer.onDragStart = () => {
            linkConnector.dragNewFromSubgraphInput(this.subgraph, this, slot)
          }
          pointer.onDragEnd = (eUp) => {
            linkConnector.dropLinks(this.subgraph, eUp)
          }
          pointer.finally = () => {
            linkConnector.reset(true)
          }
        }
      }
    // Check for right-click
    } else if (e.button === 2) {
      const slot = this.getSlotInPosition(e.canvasX, e.canvasY)
      if (slot) this.showSlotContextMenu(slot, e)
    }
  }

  /** @inheritdoc */
  override renameSlot(slot: SubgraphInput, name: string): void {
    this.subgraph.renameInput(slot, name)
  }

  /** @inheritdoc */
  override removeSlot(slot: SubgraphInput): void {
    this.subgraph.removeInput(slot)
  }

  /**
   * Delegates connection validation to the target node.
   * @param inputNode The node that would receive the connection.
   * @param input The candidate input slot on {@link inputNode}.
   * @param fromSlot The subgraph input slot being connected from.
   */
  canConnectTo(inputNode: NodeLike, input: INodeInputSlot, fromSlot: SubgraphInput): boolean {
    return inputNode.canConnectTo(this, input, fromSlot)
  }

  /**
   * Creates a link from a subgraph input slot to an internal node input.
   * @param fromSlot The subgraph input acting as the link origin.
   * @param inputNode The target node inside the subgraph.
   * @param input The target input slot on {@link inputNode}.
   * @param afterRerouteId Optional reroute parent when the link passes through reroutes.
   * @returns The newly created {@link LLink}.
   * @throws When either slot index cannot be resolved.
   */
  connectSlots(fromSlot: SubgraphInput, inputNode: LGraphNode, input: INodeInputSlot, afterRerouteId: RerouteId | undefined): LLink {
    const { subgraph } = this

    const outputIndex = this.slots.indexOf(fromSlot)
    const inputIndex = inputNode.inputs.indexOf(input)

    if (outputIndex === -1 || inputIndex === -1) throw new Error("Invalid slot indices.")

    return new LLink(
      ++subgraph.state.lastLinkId,
      input.type || fromSlot.type,
      this.id,
      outputIndex,
      inputNode.id,
      inputIndex,
      afterRerouteId,
    )
  }

  // #region Legacy LGraphNode compatibility

  /**
   * Connects a subgraph input to the first compatible input on a target node.
   *
   * When `slot` is `-1`, creates a new subgraph input matching the target slot before connecting.
   * @param slot Index of the subgraph input, or `-1` for the empty slot.
   * @param target_node The node inside the subgraph to connect to.
   * @param target_slotType Required slot type on the target node.
   * @param optsIn Optional reroute attachment point.
   * @returns The created link, or `undefined` when no compatible input exists.
   */
  connectByType(
    slot: number,
    target_node: LGraphNode,
    target_slotType: ISlotType,
    optsIn?: { afterRerouteId?: RerouteId },
  ): LLink | undefined {
    const inputSlot = target_node.findInputByType(target_slotType)
    if (!inputSlot) return

    if (slot === -1) {
      // This indicates a connection is being made from the "Empty" slot.
      // We need to create a new, concrete input on the subgraph that matches the target.
      const newSubgraphInput = this.subgraph.addInput(inputSlot.slot.name, String(inputSlot.slot.type ?? ""))
      const newSlotIndex = this.slots.indexOf(newSubgraphInput)
      if (newSlotIndex === -1) {
        console.error("Could not find newly created subgraph input slot.")
        return
      }
      slot = newSlotIndex
    }

    return this.slots[slot].connect(inputSlot.slot, target_node, optsIn?.afterRerouteId)
  }

  /**
   * Finds a subgraph input slot by name.
   * @param name The slot name to search for.
   * @returns The matching {@link SubgraphInput}, or `undefined`.
   */
  findOutputSlot(name: string): SubgraphInput | undefined {
    return this.slots.find(output => output.name === name)
  }

  /**
   * Finds the first subgraph input of the given type that has no active connections.
   * @param type The slot type to match.
   * @returns A free {@link SubgraphInput} of that type, or `undefined`.
   */
  findOutputByType(type: ISlotType): SubgraphInput | undefined {
    return findFreeSlotOfType(this.slots, type, slot => slot.linkIds.length > 0)?.slot
  }

  // #endregion Legacy LGraphNode compatibility

  /**
   * Disconnects an internal node input that was linked from a subgraph input.
   *
   * Cleans up floating links, removes the link from the subgraph input's `linkIds`, and notifies
   * the node via `onConnectionsChange`.
   * @param node The node whose input is being disconnected.
   * @param input The input slot on {@link node}.
   * @param link The link being removed, if known.
   */
  _disconnectNodeInput(node: LGraphNode, input: INodeInputSlot, link: LLink | undefined): void {
    const { subgraph } = this

    // Break floating links
    if (input._floatingLinks?.size) {
      for (const link of input._floatingLinks) {
        subgraph.removeFloatingLink(link)
      }
    }

    input.link = null
    subgraph.setDirtyCanvas(false, true)

    if (!link) return

    const subgraphInputIndex = link.origin_slot
    link.disconnect(subgraph, "output")
    subgraph._version++

    const subgraphInput = this.slots.at(subgraphInputIndex)
    if (!subgraphInput) {
      console.debug("disconnectNodeInput: subgraphInput not found", this, subgraphInputIndex)
      return
    }

    // search in the inputs list for this link
    const index = subgraphInput.linkIds.indexOf(link.id)
    if (index !== -1) {
      subgraphInput.linkIds.splice(index, 1)
    } else {
      console.debug("disconnectNodeInput: link ID not found in subgraphInput linkIds", link.id)
    }

    if (subgraphInput.linkIds.length === 0) {
      subgraphInput._widget = undefined
    }
    subgraphInput.events.dispatch("input-disconnected", {
      input: subgraphInput,
    })

    node.onConnectionsChange?.(
      NodeSlotType.OUTPUT,
      index,
      false,
      link,
      subgraphInput,
    )
  }

  /**
   * Draws the input IO panel with rounded corners on the right side and all input slots.
   * @param ctx The canvas rendering context.
   * @param colorContext Connection colour palette for slot rendering.
   * @param fromSlot When dragging, the slot being dragged (for highlight validation).
   * @param editorAlpha Opacity multiplier for editor overlays.
   */
  override drawProtected(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void {
    const { roundedRadius } = SubgraphIONodeBase
    const transform = ctx.getTransform()

    const [x, y, width, height] = this.boundingRect
    ctx.translate(x, y)

    // Draw top rounded part
    ctx.strokeStyle = this.sideStrokeStyle
    ctx.lineWidth = this.sideLineWidth
    ctx.beginPath()
    ctx.arc(width - roundedRadius, roundedRadius, roundedRadius, Math.PI * 1.5, 0)

    // Straight line to bottom
    ctx.moveTo(width, roundedRadius)
    ctx.lineTo(width, height - roundedRadius)

    // Bottom rounded part
    ctx.arc(width - roundedRadius, height - roundedRadius, roundedRadius, 0, Math.PI * 0.5)
    ctx.stroke()

    // Restore context
    ctx.setTransform(transform)

    this.drawSlots(ctx, colorContext, fromSlot, editorAlpha)
  }
}
