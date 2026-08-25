import type { INodeInputSlot, INodeOutputSlot, Point } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"

import { isInRectangle } from "@/measure"

/**
 * Finds the input slot on a node at the given canvas position, if any.
 *
 * Hit-tests each input slot using a rectangle that approximates the slot icon and label width.
 * Used by {@link isOverNodeInput} and by node-level pointer handling in {@link LGraphCanvas}.
 * @param node The node whose input slots to test.
 * @param x Canvas-space X coordinate.
 * @param y Canvas-space Y coordinate.
 * @returns The slot index, slot reference, and canvas position when a hit is found;
 * `undefined` when the pointer is not over any input slot.
 * @remarks
 * Label width is approximated as `20 + labelLength * 7` pixels. A TODO in the source notes that
 * this should eventually use cached text measurement updated on label change.
 */
export function getNodeInputOnPos(node: LGraphNode, x: number, y: number): { index: number, input: INodeInputSlot, pos: Point } | undefined {
  const { inputs } = node
  if (!inputs) return

  for (const [index, input] of inputs.entries()) {
    const pos = node.getInputPos(index)

    // TODO: Find a cheap way to measure text, and do it on node label change instead of here
    // Input icon width + text approximation
    const nameLength = input.label?.length ?? input.localized_name?.length ?? input.name?.length
    const width = 20 + (nameLength || 3) * 7

    if (isInRectangle(
      x,
      y,
      pos[0] - 10,
      pos[1] - 10,
      width,
      20,
    )) {
      return { index, input, pos }
    }
  }
}

/**
 * Finds the output slot on a node at the given canvas position, if any.
 *
 * Hit-tests each output slot using a fixed-size rectangle around the slot icon. Used by
 * {@link isOverNodeOutput} and by node-level pointer handling in {@link LGraphCanvas}.
 * @param node The node whose output slots to test.
 * @param x Canvas-space X coordinate.
 * @param y Canvas-space Y coordinate.
 * @returns The slot index, slot reference, and canvas position when a hit is found;
 * `undefined` when the pointer is not over any output slot.
 */
export function getNodeOutputOnPos(node: LGraphNode, x: number, y: number): { index: number, output: INodeOutputSlot, pos: Point } | undefined {
  const { outputs } = node
  if (!outputs) return

  for (const [index, output] of outputs.entries()) {
    const pos = node.getOutputPos(index)

    if (isInRectangle(
      x,
      y,
      pos[0] - 10,
      pos[1] - 10,
      40,
      20,
    )) {
      return { index, output, pos }
    }
  }
}

/**
 * Returns the input slot index if the given position (in graph space) is on top of a node input slot.
 *
 * Legacy helper originally on the prototype of {@link LGraphCanvas}. Delegates to
 * {@link getNodeInputOnPos} and optionally writes the slot's canvas position into `slot_pos`.
 * @param node The node whose input slots to test.
 * @param canvasx Canvas-space X coordinate.
 * @param canvasy Canvas-space Y coordinate.
 * @param slot_pos When provided, receives the canvas position of the hit slot.
 * @returns The input slot index, or `-1` when the pointer is not over any input slot.
 */
export function isOverNodeInput(
  node: LGraphNode,
  canvasx: number,
  canvasy: number,
  slot_pos?: Point,
): number {
  const result = getNodeInputOnPos(node, canvasx, canvasy)
  if (!result) return -1

  if (slot_pos) {
    slot_pos[0] = result.pos[0]
    slot_pos[1] = result.pos[1]
  }
  return result.index
}

/**
 * Returns the output slot index if the given position (in graph space) is on top of a node output slot.
 *
 * Legacy helper originally on the prototype of {@link LGraphCanvas}. Delegates to
 * {@link getNodeOutputOnPos} and optionally writes the slot's canvas position into `slot_pos`.
 * @param node The node whose output slots to test.
 * @param canvasx Canvas-space X coordinate.
 * @param canvasy Canvas-space Y coordinate.
 * @param slot_pos When provided, receives the canvas position of the hit slot.
 * @returns The output slot index, or `-1` when the pointer is not over any output slot.
 */
export function isOverNodeOutput(
  node: LGraphNode,
  canvasx: number,
  canvasy: number,
  slot_pos?: Point,
): number {
  const result = getNodeOutputOnPos(node, canvasx, canvasy)
  if (!result) return -1

  if (slot_pos) {
    slot_pos[0] = result.pos[0]
    slot_pos[1] = result.pos[1]
  }
  return result.index
}
