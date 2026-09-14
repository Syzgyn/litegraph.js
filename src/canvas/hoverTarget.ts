import type { LinkSegment, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { Subgraph } from "@/subgraph/Subgraph"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import type { HoverTarget } from "@/types/hover"

import { getNodeInputOnPos, getNodeOutputOnPos } from "@/canvas/measureSlots"
import { isInRectangle } from "@/measure"
import { TitleMode } from "@/types/globalEnums"

export interface ResolveHoverTargetOptions {
  x: number
  y: number
  node?: LGraphNode | null
  subgraph?: Subgraph
  renderedPaths: Iterable<LinkSegment>
  visibleReroutes: Iterable<Reroute>
}

/**
 * Returns whether the pointer is over a node's title bar in graph coordinates.
 */
export function isPointerOverNodeTitle(node: LGraphNode, x: number, y: number): boolean {
  if (node.flags.collapsed) return false

  const titleMode = node.titleMode
  if (titleMode === TitleMode.NO_TITLE) return false

  if (y >= node.pos[1]) return false

  const left = node.pos[0]
  const right = left + node.size[0]
  return x >= left && x <= right
}

function findLinkSegmentAt(
  x: number,
  y: number,
  renderedPaths: Iterable<LinkSegment>,
): LinkSegment | undefined {
  for (const linkSegment of renderedPaths) {
    const centre = linkSegment.pathCentre
    if (!centre) continue

    if (isInRectangle(x, y, centre[0] - 4, centre[1] - 4, 8, 8))
      return linkSegment
  }
}

function findSubgraphInputSlot(
  ioNode: SubgraphInputNode,
  x: number,
  y: number,
): { slot: SubgraphInput, index: number } | undefined {
  for (const [index, slot] of ioNode.allSlots.entries()) {
    if (slot === ioNode.emptySlot) continue
    if (slot.isPointerOver || slot.boundingRect.containsXy(x, y))
      return { slot, index }
  }
}

function findSubgraphOutputSlot(
  ioNode: SubgraphOutputNode,
  x: number,
  y: number,
): { slot: SubgraphOutput, index: number } | undefined {
  for (const [index, slot] of ioNode.allSlots.entries()) {
    if (slot === ioNode.emptySlot) continue
    if (slot.isPointerOver || slot.boundingRect.containsXy(x, y))
      return { slot, index }
  }
}

function findHoveredReroute(
  visibleReroutes: Iterable<Reroute>,
): HoverTarget | undefined {
  for (const reroute of visibleReroutes) {
    if (!reroute.isSlotHovered) continue

    const isInput = reroute.isInputHovered
    const isOutput = reroute.isOutputHovered
    const side = isInput && isOutput ? "both" : (isInput ? "input" : "output")

    return { kind: "reroute", reroute, side }
  }
}

/**
 * Resolves the primary hover target at a graph-space position.
 *
 * Priority: subgraph IO slot → node title → input slot → output slot → widget →
 * link midpoint → reroute slot.
 */
export function resolveHoverTarget({
  x,
  y,
  node,
  subgraph,
  renderedPaths,
  visibleReroutes,
}: ResolveHoverTargetOptions): HoverTarget | null {
  if (subgraph) {
    const inputSlot = findSubgraphInputSlot(subgraph.inputNode, x, y)
    if (inputSlot)
      return { kind: "subgraph-input", ioNode: subgraph.inputNode, ...inputSlot }

    const outputSlot = findSubgraphOutputSlot(subgraph.outputNode, x, y)
    if (outputSlot)
      return { kind: "subgraph-output", ioNode: subgraph.outputNode, ...outputSlot }
  }

  if (node) {
    if (isPointerOverNodeTitle(node, x, y))
      return { kind: "title", node }

    if (!node.flags.collapsed) {
      const input = getNodeInputOnPos(node, x, y)
      if (input)
        return { kind: "input", node, slot: input.input, index: input.index }

      const output = getNodeOutputOnPos(node, x, y)
      if (output)
        return { kind: "output", node, slot: output.output, index: output.index }

      const widget = node.getWidgetOnPos(x, y, true)
      if (widget)
        return { kind: "widget", node, widget }
    }
  }

  const link = findLinkSegmentAt(x, y, renderedPaths)
  if (link)
    return { kind: "link", link }

  const reroute = findHoveredReroute(visibleReroutes)
  if (reroute)
    return reroute

  return null
}

/**
 * Converts a graph-space point to viewport (`clientX` / `clientY`) coordinates.
 */
export function graphToClient(
  graphPos: Point,
  convertOffsetToCanvas: (pos: Point, out: Point) => Point,
  canvasRect: DOMRect,
  out: Point = [0, 0],
): Point {
  const canvasLocal = convertOffsetToCanvas(graphPos, out)
  out[0] = canvasRect.left + canvasLocal[0]
  out[1] = canvasRect.top + canvasLocal[1]
  return out
}

/**
 * Converts viewport (`clientX` / `clientY`) coordinates to graph space.
 */
export function clientToGraph(
  clientPos: Point,
  canvasRect: DOMRect,
  convertCanvasToOffset: (pos: Point, out?: Point) => Point,
  out?: Point,
): Point {
  return convertCanvasToOffset(
    [clientPos[0] - canvasRect.left, clientPos[1] - canvasRect.top],
    out,
  )
}
