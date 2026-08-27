import type { CanvasColour, DefaultConnectionColors, INodeSlot, ISlotType, IWidgetLocator, Point } from "@/interfaces"
import type { LLink } from "@/LLink"
import type { RenderShape } from "@/types/globalEnums"
import type { LinkDirection } from "@/types/globalEnums"

import { Rectangle } from "@/infrastructure/Rectangle"

/**
 * Abstract base class for all node input and output slots.
 *
 * Holds the shared serialisable properties (name, type, shape, colours, etc.) and provides
 * connection-state queries and colour resolution. Concrete rendering and connection logic
 * live in `NodeSlot` and its subclasses.
 * @see `NodeInputSlot`
 * @see `NodeOutputSlot`
 */
export abstract class SlotBase implements INodeSlot {
  /** Internal slot identifier used for linking and serialisation. */
  name: string

  /** Localised display name, shown in the UI when `label` is not set. */
  localized_name?: string

  /** Optional user-facing label override for rendering. */
  label?: string

  /** Data type of this slot, used for connection compatibility checks. */
  type: ISlotType

  /** Direction the link leaves or enters this slot (up, down, left, right). */
  dir?: LinkDirection

  /** When `true`, the user may remove this slot from the node at runtime. */
  removable?: boolean

  /** Visual shape used when rendering this slot on the canvas. */
  shape?: RenderShape

  /** Fill colour when the slot has no active connections. */
  color_off?: CanvasColour

  /** Fill colour when the slot has at least one active connection. */
  color_on?: CanvasColour

  /** When `true`, the slot cannot accept new connections. */
  locked?: boolean

  /** When `true`, the slot's name cannot be edited by the user. */
  nameLocked?: boolean

  /** Locator for the widget bound to this slot, if it is a widget input slot. */
  widget?: IWidgetLocator

  /** Links that originate from this slot but are not yet connected to a target (floating links). */
  floatingLinks?: Set<LLink>

  /** When `true`, an error indicator is drawn around this slot. */
  hasErrors?: boolean

  /** Canvas-space centre point of this slot. Set during node layout. */
  abstract pos?: Point

  /** Axis-aligned bounding rectangle of this slot relative to the parent node. */
  readonly boundingRect: Rectangle

  /**
   * @param name Internal slot identifier.
   * @param type Data type of the slot.
   * @param boundingRect Layout rectangle for hit-testing and rendering. Defaults to an empty rectangle.
   */
  constructor(name: string, type: ISlotType, boundingRect?: Rectangle) {
    this.name = name
    this.type = type
    this.boundingRect = boundingRect ?? new Rectangle()
  }

  /** Whether this slot currently has one or more active connections. */
  abstract get isConnected(): boolean

  /**
   * Resolves the fill colour to use when rendering this slot.
   *
   * Returns `color_on` or `color_off` when set; otherwise delegates to
   * `DefaultConnectionColors` based on `isConnected`.
   * @param colorContext Theme colours for connected and disconnected slot states.
   * @returns The canvas colour string to use for this slot's fill.
   */
  renderingColor(colorContext: DefaultConnectionColors): CanvasColour {
    return this.isConnected
      ? this.color_on || colorContext.getConnectedColor(this.type)
      : this.color_off || colorContext.getDisconnectedColor(this.type)
  }
}
