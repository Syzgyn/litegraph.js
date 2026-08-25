import type { SubgraphInput } from "./SubgraphInput"
import type { SubgraphOutput } from "./SubgraphOutput"
import type { LinkConnector } from "@/canvas/LinkConnector"
import type { CanvasPointer } from "@/CanvasPointer"
import type { DefaultConnectionColors, INodeInputSlot, INodeOutputSlot, ISlotType, Positionable } from "@/interfaces"
import type { LGraphNode, NodeId } from "@/LGraphNode"
import type { LLink } from "@/LLink"
import type { RerouteId } from "@/Reroute"
import type { CanvasPointerEvent } from "@/types/events"
import type { NodeLike } from "@/types/NodeLike"
import type { SubgraphIO } from "@/types/serialisation"

import { SUBGRAPH_OUTPUT_ID } from "@/constants"
import { findFreeSlotOfType } from "@/utils/collections"

import { EmptySubgraphOutput } from "./EmptySubgraphOutput"
import { SubgraphIONodeBase } from "./SubgraphIONodeBase"

/**
 * Fixed boundary node on the right side of a subgraph canvas listing all subgraph outputs.
 *
 * Renders the output IO panel, handles pointer interaction for dragging new links from internal
 * node outputs onto output boundaries, and exposes legacy connection helpers used during
 * paste and import.
 * @remarks
 * Includes an {@link emptySlot} at the bottom for creating outputs on first connection.
 * Each concrete slot is a {@link SubgraphOutput} stored on {@link Subgraph.outputs}.
 * @see {@link SubgraphInputNode}
 * @see {@link SubgraphIONodeBase}
 */
export class SubgraphOutputNode extends SubgraphIONodeBase<SubgraphOutput> implements Positionable {
  /** Sentinel node ID used in links whose target is a subgraph output boundary. */
  readonly id: NodeId = SUBGRAPH_OUTPUT_ID

  /** Virtual slot that creates a new output when a link is dropped on it. */
  readonly emptySlot: EmptySubgraphOutput = new EmptySubgraphOutput(this)

  /** The concrete output slots defined on this subgraph (excludes {@link emptySlot}). */
  get slots() {
    return this.subgraph.outputs
  }

  /** All drawable slots, including the empty placeholder at the end. */
  override get allSlots(): SubgraphOutput[] {
    return [...this.slots, this.emptySlot]
  }

  /**
   * Canvas X coordinate used as the horizontal anchor when laying out output slots.
   *
   * Aligns slots to the inner edge of the rounded panel on the left side of the IO node.
   */
  get slotAnchorX() {
    const [x] = this.boundingRect
    return x + SubgraphIONodeBase.roundedRadius
  }

  /**
   * Handles pointer down on the output boundary node.
   *
   * Left-click begins a link drag from the slot under the cursor via
   * {@link LinkConnector.dragNewFromSubgraphOutput}. Right-click opens the slot context menu.
   * @param e The pointer event in canvas coordinates.
   * @param pointer Drag lifecycle callbacks for the active pointer.
   * @param linkConnector Active link connector managing the drag operation.
   */
  override onPointerDown(e: CanvasPointerEvent, pointer: CanvasPointer, linkConnector: LinkConnector): void {
    // Left-click handling for dragging connections
    if (e.button === 0) {
      for (const slot of this.allSlots) {
        // Check if click is within the full slot area (including label)
        if (slot.boundingRect.containsXy(e.canvasX, e.canvasY)) {
          pointer.onDragStart = () => {
            linkConnector.dragNewFromSubgraphOutput(this.subgraph, this, slot)
          }
          pointer.onDragEnd = (eUp) => {
            linkConnector.dropLinks(this.subgraph, eUp)
          }
          pointer.onDoubleClick = () => {
            this.handleSlotDoubleClick(slot, e)
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
  override renameSlot(slot: SubgraphOutput, name: string): void {
    this.subgraph.renameOutput(slot, name)
  }

  /** @inheritdoc */
  override removeSlot(slot: SubgraphOutput): void {
    this.subgraph.removeOutput(slot)
  }

  /**
   * Delegates connection validation to the target node.
   * @param outputNode The node that would receive the connection.
   * @param fromSlot The subgraph output slot being connected from.
   * @param output The candidate output slot or subgraph IO definition on {@link outputNode}.
   */
  canConnectTo(outputNode: NodeLike, fromSlot: SubgraphOutput, output: INodeOutputSlot | SubgraphIO): boolean {
    return outputNode.canConnectTo(this, fromSlot, output)
  }

  /**
   * Connects an internal node output to a subgraph output slot by type.
   * @param slot Index of the subgraph output slot.
   * @param target_node The node inside the subgraph to connect from.
   * @param target_slotType Required slot type on the target node's output.
   * @param optsIn Optional reroute attachment point.
   * @returns The created link, or `undefined` when no compatible output exists.
   */
  connectByTypeOutput(
    slot: number,
    target_node: LGraphNode,
    target_slotType: ISlotType,
    optsIn?: { afterRerouteId?: RerouteId },
  ): LLink | undefined {
    const outputSlot = target_node.findOutputByType(target_slotType)
    if (!outputSlot) return

    return this.slots[slot].connect(outputSlot.slot, target_node, optsIn?.afterRerouteId)
  }

  /**
   * Finds the first subgraph output of the given type that has no active connection.
   * @param type The slot type to match.
   * @returns A free {@link SubgraphOutput} of that type, or `undefined`.
   */
  findInputByType(type: ISlotType): SubgraphOutput | undefined {
    return findFreeSlotOfType(this.slots, type, slot => slot.linkIds.length > 0)?.slot
  }

  /**
   * Draws the output IO panel with rounded corners on the left side and all output slots.
   * @param ctx The canvas rendering context.
   * @param colorContext Connection colour palette for slot rendering.
   * @param fromSlot When dragging, the slot being dragged (for highlight validation).
   * @param editorAlpha Opacity multiplier for editor overlays.
   */
  override drawProtected(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void {
    const { roundedRadius } = SubgraphIONodeBase
    const transform = ctx.getTransform()

    const [x, y, , height] = this.boundingRect
    ctx.translate(x, y)

    // Draw bottom rounded part
    ctx.strokeStyle = this.sideStrokeStyle
    ctx.lineWidth = this.sideLineWidth
    ctx.beginPath()
    ctx.arc(roundedRadius, roundedRadius, roundedRadius, Math.PI, Math.PI * 1.5)

    // Straight line to bottom
    ctx.moveTo(0, roundedRadius)
    ctx.lineTo(0, height - roundedRadius)

    // Bottom rounded part
    ctx.arc(roundedRadius, height - roundedRadius, roundedRadius, Math.PI, Math.PI * 0.5, true)
    ctx.stroke()

    // Restore context
    ctx.setTransform(transform)

    this.drawSlots(ctx, colorContext, fromSlot, editorAlpha)
  }
}
