import type { LinkSegment, Point, ReadOnlyRect, Rect } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { Subgraph } from "@/subgraph/Subgraph"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import type { HoverTarget } from "@/types/hover"
import type { IBaseWidget } from "@/types/widgets"

import { getNodeInputOnPos, getNodeOutputOnPos } from "@/canvas/measureSlots"
import { isInRectangle } from "@/measure"
import { TitleMode } from "@/types/globalEnums"

/** Default layout metrics; match `LiteGraphGlobal` defaults to avoid a circular import. */
const NODE_TITLE_HEIGHT = 30
const NODE_SLOT_HEIGHT = 20
const NODE_WIDGET_HEIGHT = 20

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

function rectCentre(rect: ReadOnlyRect): Point {
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2]
}

function copyReadOnlyRect(rect: ReadOnlyRect): Rect {
  return [rect[0], rect[1], rect[2], rect[3]]
}

function getNodeTitleGraphRect(node: LGraphNode): Rect | undefined {
  if (node.flags.collapsed) return

  const titleMode = node.titleMode
  if (titleMode === TitleMode.NO_TITLE) return

  return [
    node.pos[0],
    node.pos[1] - NODE_TITLE_HEIGHT,
    node.size[0],
    NODE_TITLE_HEIGHT,
  ]
}

function getWidgetGraphRect(node: LGraphNode, widget: IBaseWidget): Rect | undefined {
  const y = widget.lastY
  if (y == null) return

  const width = widget.width || node.size[0]
  const height = widget.computedHeight ??
    widget.computeSize?.(node.size[0])?.[1] ??
    NODE_WIDGET_HEIGHT

  return [node.pos[0] + 6, node.pos[1] + y, width - 12, height]
}

function getLinkGraphRect(link: LinkSegment): Rect | undefined {
  const centre = link.pathCentre
  if (!centre) return

  return [centre[0] - 4, centre[1] - 4, 8, 8]
}

/**
 * Returns a graph-space bounding rectangle for a hover target, when one exists.
 */
export function getHoverAnchorRect(target: HoverTarget): Rect | undefined {
  switch (target.kind) {
    case "input":
    case "output": {
      const { boundingRect } = target.slot
      if (boundingRect[2] > 0 && boundingRect[3] > 0)
        return copyReadOnlyRect(boundingRect)

      const pos = target.kind === "input"
        ? target.node.getInputSlotPos(target.slot)
        : target.node.getOutputPos(target.index)
      const size = NODE_SLOT_HEIGHT
      return [pos[0] - size / 2, pos[1] - size / 2, size, size]
    }

    case "widget":
      return getWidgetGraphRect(target.node, target.widget)

    case "title":
      return getNodeTitleGraphRect(target.node)

    case "subgraph-input":
    case "subgraph-output":
      return copyReadOnlyRect(target.slot.boundingRect)

    case "link":
      return getLinkGraphRect(target.link)

    case "reroute":
      return copyReadOnlyRect(target.reroute.boundingRect)
  }
}

/**
 * Returns a graph-space anchor point for a hover target (centre of the anchor rect).
 */
export function getHoverAnchorGraphPos(target: HoverTarget): Point | undefined {
  const rect = getHoverAnchorRect(target)
  return rect ? rectCentre(rect) : undefined
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
 * Converts a graph-space rectangle to viewport (`clientX` / `clientY`) coordinates.
 */
export function graphRectToClient(
  graphRect: ReadOnlyRect,
  convertOffsetToCanvas: (pos: Point, out: Point) => Point,
  canvasRect: DOMRect,
  out: Rect = [0, 0, 0, 0],
): Rect {
  const topLeft = graphToClient(
    [graphRect[0], graphRect[1]],
    convertOffsetToCanvas,
    canvasRect,
    [0, 0],
  )
  const bottomRight = graphToClient(
    [graphRect[0] + graphRect[2], graphRect[1] + graphRect[3]],
    convertOffsetToCanvas,
    canvasRect,
    [0, 0],
  )

  out[0] = topLeft[0]
  out[1] = topLeft[1]
  out[2] = bottomRight[0] - topLeft[0]
  out[3] = bottomRight[1] - topLeft[1]
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
