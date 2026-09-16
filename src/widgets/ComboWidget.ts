import type { WidgetEventOptions } from "./BaseWidget"
import type { IContextMenuValue } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { IComboWidget, IStringComboWidget } from "@/types/widgets"

import { clamp, LiteGraph } from "@/litegraph"
import { warnDeprecated } from "@/utils/feedback"

import { BaseSteppedWidget } from "./BaseSteppedWidget"

/**
 * This is used as an (invalid) assertion to resolve issues with legacy duck-typed values.
 *
 * Function style in use by:
 * https://github.com/kijai/ComfyUI-KJNodes/blob/c3dc82108a2a86c17094107ead61d63f8c76200e/web/js/setgetnodes.js#L401-L404
 */
type MenuEntry = string | number | IContextMenuValue<string | number>
type Values =
  string[] |
  number[] |
  Record<string, string> |
  MenuEntry[] |
  ((widget?: ComboWidget, node?: LGraphNode) => Values)

function isContextMenuEntry(value: unknown): value is IContextMenuValue<string | number> {
  return value != null && typeof value === "object" && "content" in value
}

function isLabeledMenuList(values: unknown): values is MenuEntry[] {
  return Array.isArray(values) && values.some(entry => isContextMenuEntry(entry))
}

function entryWireValue(entry: MenuEntry): string | number {
  if (isContextMenuEntry(entry)) {
    return entry.value ?? ""
  }
  return entry
}

function currentWireValue(current: unknown): string | number {
  if (isContextMenuEntry(current)) {
    return entryWireValue(current)
  }
  return current as string | number
}

function resolveSelectedValue(selected: unknown, values: Values): string | number {
  if (isContextMenuEntry(selected)) {
    return entryWireValue(selected)
  }

  if (typeof selected === "string" || typeof selected === "number") {
    if (isLabeledMenuList(values)) {
      const byContent = values.find(
        entry => isContextMenuEntry(entry) && entry.content === selected,
      )
      if (byContent) return entryWireValue(byContent)

      const byWire = values.find(entry => entryWireValue(entry) === selected)
      if (byWire) return entryWireValue(byWire)
    }

    if (!Array.isArray(values) && typeof values === "object" && values !== null) {
      const labels = Object.values(values)
      const index = labels.indexOf(String(selected))
      if (index !== -1) {
        return Object.keys(values)[index] ?? index
      }
    }

    return selected
  }

  return ""
}

function toArray(values: Values): string[] {
  if (Array.isArray(values)) {
    if (isLabeledMenuList(values)) {
      return values.map(entry => String(entryWireValue(entry)))
    }
    return (values as Array<string | number>).map(String)
  }
  return Object.keys(values)
}

function resolveDisplayLabel(values: Values, current: unknown): string {
  const wire = currentWireValue(current)

  if (isLabeledMenuList(values)) {
    const entry = values.find(item => entryWireValue(item) === wire)
    if (entry && isContextMenuEntry(entry)) {
      return entry.content ?? String(entry.value ?? "")
    }
  }

  if (values && !Array.isArray(values) && typeof values === "object") {
    return values[wire as string | number] ?? String(wire)
  }

  return typeof wire === "number" ? String(wire) : String(wire ?? "")
}

/**
 * Combo / dropdown widget (`type: "combo"`) backed by a fixed or dynamic list of choices.
 *
 * Supports stepped arrow buttons, centre-click context menu selection, and legacy `values` shapes
 * (array, record map, labeled menu entries, or deprecated function). Numeric indices are used when
 * `values` is a record.
 * @see `IComboWidget`
 * @see `IStringComboWidget`
 */
export class ComboWidget extends BaseSteppedWidget<IStringComboWidget | IComboWidget> implements IComboWidget {
  /** Widget type discriminator; always `"combo"`. */
  override type = "combo" as const

  #resolveValues(node?: LGraphNode): Values {
    const { values } = this.options
    if (values == null) throw new Error("[ComboWidget]: values is required")

    return typeof values === "function"
      ? values(this, node)
      : values
  }

  #tryChangeValue(delta: number, options: WidgetEventOptions): void {
    const values = this.#resolveValues(options.node)
    const indexedValues = toArray(values)

    // avoids double click event
    options.canvas.lastMouseClick = 0

    const wire = currentWireValue(this.value)
    const foundIndex = indexedValues.indexOf(String(wire)) + delta
    const index = clamp(foundIndex, 0, indexedValues.length - 1)

    let value: string | number
    if (isLabeledMenuList(values)) {
      value = entryWireValue(values[index]!)
    } else if (Array.isArray(values)) {
      value = values[index] as string | number
    } else {
      value = index
    }

    this.setValue(value, options)
  }

  /**
   * Checks if the value is `Array.at at` the given index in the combo list.
   * @param increment `true` if checking the use of the increment button, `false` for decrement
   * @returns `true` if the value is at the given index, otherwise `false`.
   */
  #canUseButton(increment: boolean, node?: LGraphNode): boolean {
    let values: Values
    try {
      values = this.#resolveValues(node)
    } catch {
      return false
    }

    const valuesArray = toArray(values)
    if (valuesArray.length <= 1) return false

    const wire = String(currentWireValue(this.value))

    // Edge case where the value is both the first and last item in the list
    const firstValue = valuesArray.at(0)
    const lastValue = valuesArray.at(-1)
    if (firstValue === lastValue) return true

    return wire !== (increment ? lastValue : firstValue)
  }

  /**
   * Display string for the current selection.
   * @remarks Resolves record-map labels, labeled menu entries, function-backed values, and numeric index coercion.
   */
  protected override formatDisplayValue(): string {
    const { values: rawValues } = this.options
    if (rawValues) {
      let values: Values
      try {
        values = typeof rawValues === "function" ? rawValues(this) : rawValues
      } catch {
        return typeof this.value === "number" ? String(this.value) : String(this.value ?? "")
      }

      return resolveDisplayLabel(values, this.value)
    }
    return typeof this.value === "number" ? String(this.value) : String(this.value ?? "")
  }

  /**
   * Returns `true` when the right arrow can advance to another list entry.
   * @remarks Delegates to private edge-case handling for duplicate first/last values.
   */
  override canIncrement(): boolean {
    return this.#canUseButton(true)
  }

  /** Returns `true` when the left arrow can move to a prior list entry. */
  override canDecrement(): boolean {
    return this.#canUseButton(false)
  }

  /** Steps the selection forward one entry in `options.values`. */
  override incrementValue(options: WidgetEventOptions): void {
    this.#tryChangeValue(1, options)
  }

  /** Steps the selection backward one entry in `options.values`. */
  override decrementValue(options: WidgetEventOptions): void {
    this.#tryChangeValue(-1, options)
  }

  /**
   * Left/right arrows step the value; centre click opens a `LiteGraph.ContextMenu` dropdown.
   * @param options Pointer position is mapped to arrow zones or menu invocation.
   */
  override onClick({ e, node, canvas }: WidgetEventOptions) {
    const x = e.canvasX - node.pos[0]
    const width = this.width || node.size[0]

    // Deprecated functionality (warning as of v0.14.5)
    if (typeof this.options.values === "function") {
      warnDeprecated("Using a function for values is deprecated. Use an array of unique values instead.")
    }

    // Determine if clicked on left/right arrows
    if (x < 40) return this.decrementValue({ e, node, canvas })
    if (x > width - 40) return this.incrementValue({ e, node, canvas })

    // Otherwise, show dropdown menu
    const values = this.#resolveValues(node)

    // Handle center click - show dropdown menu
    const menuValues: readonly (string | IContextMenuValue<string | number> | null)[] = Array.isArray(values)
      ? values as readonly (string | IContextMenuValue<string | number>)[]
      : Object.values(values)

    new LiteGraph.ContextMenu(menuValues, {
      scale: Math.max(1, canvas.ds.scale),
      event: e,
      className: "dark",
      callback: (selected) => {
        this.setValue(
          resolveSelectedValue(selected, values),
          { e, node, canvas },
        )
      },
    })
  }
}
