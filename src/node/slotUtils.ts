import type { IWidgetInputSlot, SharedIntersection } from "@/interfaces"
import type { INodeInputSlot, INodeOutputSlot, INodeSlot, IWidget } from "@/litegraph"
import type { ISerialisableNodeInput, ISerialisableNodeOutput } from "@/types/serialisation"

type CommonIoSlotProps = SharedIntersection<ISerialisableNodeInput, ISerialisableNodeOutput>

/**
 * Creates a shallow copy of the serialisable properties shared by input and output slots.
 *
 * Used by `inputAsSerialisable` and `outputAsSerialisable` to avoid duplicating
 * property extraction logic.
 * @param slot The slot (or partial slot data) to clone properties from.
 * @returns A plain object containing only the common serialisable slot fields.
 */
export function shallowCloneCommonProps(slot: CommonIoSlotProps): CommonIoSlotProps {
  const { colorOff, colorOn, dir, label, localizedName, locked, name, nameLocked, removable, shape, type } = slot
  return { colorOff, colorOn, dir, label, localizedName, locked, name, nameLocked, removable, shape, type }
}

/**
 * Converts a live `INodeInputSlot` into its serialisable representation.
 *
 * Widget-backed input slots serialise a `{ widget: { name } }` reference instead of a position.
 * @param slot The input slot to serialise.
 * @returns A plain object suitable for JSON serialisation.
 */
export function inputAsSerialisable(slot: INodeInputSlot): ISerialisableNodeInput {
  const { link } = slot
  const widgetOrPos = slot.widget
    ? { widget: { name: slot.widget.name } }
    : { pos: slot.pos }

  return {
    ...shallowCloneCommonProps(slot),
    ...widgetOrPos,
    link,
  }
}

/**
 * Converts a live `INodeOutputSlot` into its serialisable representation.
 * @param slot The output slot to serialise. May optionally include a widget reference for
 * downstream compatibility workarounds.
 * @returns A plain object suitable for JSON serialisation.
 */
export function outputAsSerialisable(slot: INodeOutputSlot & { widget?: IWidget }): ISerialisableNodeOutput {
  const { pos, slotIndex, links, widget } = slot
  // Output widgets do not exist in Litegraph; this is a temporary downstream workaround.
  const outputWidget = widget
    ? { widget: { name: widget.name } }
    : null

  return {
    ...shallowCloneCommonProps(slot),
    ...outputWidget,
    pos,
    slotIndex,
    links: links ? [...links] : links,
  }
}

/**
 * Type guard: whether the given slot is an input slot.
 *
 * Distinguishes inputs from outputs by the presence of the singular `link` property.
 * @param slot Any node slot to test.
 * @returns `true` if `slot` is an `INodeInputSlot`.
 */
export function isINodeInputSlot(slot: INodeSlot): slot is INodeInputSlot {
  return "link" in slot
}

/**
 * Type guard: whether the given slot is an output slot.
 *
 * Distinguishes outputs from inputs by the presence of the `links` array property.
 * @param slot Any node slot to test.
 * @returns `true` if `slot` is an `INodeOutputSlot`.
 */
export function isINodeOutputSlot(slot: INodeSlot): slot is INodeOutputSlot {
  return "links" in slot
}

/**
 * Type guard: whether this input slot is attached to a widget.
 * @param slot The input slot to check.
 * @returns `true` if `slot` is an `IWidgetInputSlot`.
 */
export function isWidgetInputSlot(slot: INodeInputSlot): slot is IWidgetInputSlot {
  return !!slot.widget
}
