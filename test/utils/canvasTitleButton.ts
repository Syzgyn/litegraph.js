import type { Point } from "@/interfaces"
import type { LGraphCanvas, LGraphNode } from "@/litegraph"

/** Mirrors {@link LGraphCanvas} title-button mousedown handling (see #5079). */
export function handleTitleButtonClick(
  node: LGraphNode,
  pos: Point,
  canvas: LGraphCanvas,
): boolean {
  if (!node.title_buttons?.length || node.flags.collapsed) return false

  for (const button of node.title_buttons) {
    if (button.visible && button.isPointInside(pos[0], pos[1])) {
      node.onTitleButtonClick(button, canvas)
      return true
    }
  }
  return false
}
