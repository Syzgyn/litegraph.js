import type { LGraphNode } from "@/LGraphNode"
import type { IBaseWidget, IWidgetOptions } from "@/types/widgets"

import { evaluateMathExpression } from "@/utils/mathParser"

/**
 * The step value for numeric widgets.
 * Use {@link IWidgetOptions.step2} if available, otherwise fallback to
 * {@link IWidgetOptions.step} which is scaled up by 10x in the legacy frontend logic.
 */
export function getWidgetStep(options: IWidgetOptions<unknown>): number {
  return options.step2 || ((options.step || 10) * 0.1)
}

export function evaluateInput(input: string): number | undefined {
  const result = evaluateMathExpression(input)
  if (result !== undefined) {
    if (!isFinite(result)) return undefined
    return result
  }
  const newValue = Number(input)
  if (!isFinite(newValue)) return undefined
  return newValue
}

/**
 * Sets the display label on a widget and its linked input slot, if any.
 * @returns `true` when the label was applied.
 */
export function renameWidget(
  widget: IBaseWidget,
  node: LGraphNode,
  newLabel: string,
): boolean {
  const label = newLabel || undefined
  const input = node.inputs?.find(inp => inp.widget?.name === widget.name)

  widget.label = label
  if (input) input.label = label

  return true
}

/**
 * Copies widget input slot labels onto their linked widgets after configure.
 *
 * Serialised labels are stored on input slots; widgets must be updated explicitly
 * so a reload never inherits a stale {@link IBaseWidget.label}.
 */
export function syncWidgetLabelsFromInputs(node: LGraphNode): void {
  const { widgets, inputs } = node
  if (!widgets || !inputs) return

  for (const input of inputs) {
    if (!input.widget) continue

    const widget = widgets.find(w => w.name === input.widget!.name)
    if (!widget) continue

    widget.label = input.label || undefined
  }
}
