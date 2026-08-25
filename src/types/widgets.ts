import type { CanvasColour, Point, RequiredProps, Size } from "../interfaces"
import type { CanvasPointer, LGraphCanvas, LGraphNode } from "../litegraph"
import type { CanvasPointerEvent } from "./events"

/**
 * Configuration options shared by all widget types.
 * @template TValues The type of the {@link values} option (combo box entries, etc.).
 */
export interface IWidgetOptions<TValues = unknown[]> {
  /** Label text shown when the widget value is `true` (toggle widgets). */
  on?: string
  /** Label text shown when the widget value is `false` (toggle widgets). */
  off?: string
  /** Maximum allowed value for numeric widgets. */
  max?: number
  /** Minimum allowed value for numeric widgets. */
  min?: number
  /** Fill colour for the slider track. */
  slider_color?: CanvasColour
  /** Fill colour for the slider/knob marker indicator. */
  marker_color?: CanvasColour
  /** Number of decimal places to display for numeric widgets. */
  precision?: number
  /** When `true`, the widget cannot be edited by the user. */
  read_only?: boolean
  /**
   * @deprecated Use {@link IWidgetOptions.step2} instead.
   * The legacy step is scaled up by 10x in the legacy frontend logic.
   */
  step?: number
  /** The step value for numeric widgets. */
  step2?: number

  /** Legacy vertical offset for widget layout. */
  y?: number
  /** When `true`, renders a multi-line text area instead of a single-line input. */
  multiline?: boolean
  // TODO: Confirm this
  /** Name of the node property this widget is bound to. */
  property?: string
  /** When `true`, an input socket will not be created for this widget. */
  socketless?: boolean

  /** Selectable values for combo-box widgets. */
  values?: TValues
  /** Callback invoked when the widget value changes. */
  callback?: IWidget["callback"]
}

/** Configuration options for slider widgets. Requires min, max, and step values. */
export interface IWidgetSliderOptions extends IWidgetOptions<number[]> {
  min: number
  max: number
  step2: number
  slider_color?: CanvasColour
  marker_color?: CanvasColour
}

/** Configuration options for knob widgets. Requires min, max, and step values. */
export interface IWidgetKnobOptions extends IWidgetOptions<number[]> {
  min: number
  max: number
  step2: number
  slider_color?: CanvasColour // TODO: Replace with knob color
  marker_color?: CanvasColour
  /** CSS gradient stops string for the knob's colour arc. */
  gradient_stops?: string
}

/**
 * A widget for a node.
 * All types are based on IBaseWidget - additions can be made there or directly on individual types.
 *
 * Implemented as a discriminative union of widget types, so this type itself cannot be extended.
 * Recommend declaration merging any properties that use IWidget (e.g. {@link LGraphNode.widgets}) with a new type alias.
 * @see ICustomWidget
 */
export type IWidget =
  | IBooleanWidget
  | INumericWidget
  | IStringWidget
  | IComboWidget
  | IStringComboWidget
  | ICustomWidget
  | ISliderWidget
  | IButtonWidget
  | IKnobWidget

/** A boolean toggle widget with on/off states. */
export interface IBooleanWidget extends IBaseWidget<boolean, "toggle"> {
  type: "toggle"
  value: boolean
}

/** A numeric input widget backed by a number value. */
export interface INumericWidget extends IBaseWidget<number, "number"> {
  type: "number"
  value: number
}

/** A horizontal slider widget for selecting a numeric value within a range. */
export interface ISliderWidget extends IBaseWidget<number, "slider", IWidgetSliderOptions> {
  type: "slider"
  value: number
  /** Optional marker position on the slider track (e.g. a default or reference value). */
  marker?: number
}

/** A rotary knob widget for selecting a numeric value within a range. */
export interface IKnobWidget extends IBaseWidget<number, "knob", IWidgetKnobOptions> {
  type: "knob"
  value: number
  options: IWidgetKnobOptions
}

/**
 * A combo-box widget restricted to string values.
 *
 * Avoids the type issues with the legacy {@link IComboWidget} union type.
 */
export interface IStringComboWidget extends IBaseWidget<string, "combo", RequiredProps<IWidgetOptions<string[]>, "values">> {
  type: "combo"
  value: string
}

/** Allowed value sources for combo-box widgets. */
type ComboWidgetValues = string[] | Record<string, string> | ((widget?: IComboWidget, node?: LGraphNode) => string[])

/**
 * A combo-box widget (dropdown / select) accepting string or numeric values.
 *
 * Values may be a static array, a key-value record, or a callback evaluated at render time.
 */
export interface IComboWidget extends IBaseWidget<
  string | number,
  "combo",
  RequiredProps<IWidgetOptions<ComboWidgetValues>, "values">
> {
  type: "combo"
  value: string | number
}

/** A single-line or multi-line text input widget. */
export interface IStringWidget extends IBaseWidget<string, "string" | "text", IWidgetOptions<string[]>> {
  type: "string" | "text"
  value: string
}

/** A clickable button widget that fires a callback on press. */
export interface IButtonWidget extends IBaseWidget<string | undefined, "button"> {
  type: "button"
  value: string | undefined
  /** Whether the button was clicked during the current event cycle. */
  clicked: boolean
}

/** A custom widget - accepts any value and has no built-in special handling */
export interface ICustomWidget extends IBaseWidget<string | object, "custom"> {
  type: "custom"
  value: string | object
}

/**
 * Union of all recognised widget type name strings.
 *
 * Values not in this list are treated as `"custom"` at runtime without error.
 */
export type TWidgetType = IWidget["type"]

/** Union of all possible widget value types across the {@link IWidget} discriminated union. */
export type TWidgetValue = IWidget["value"]

/**
 * The base type for all widgets.  Should not be implemented directly.
 * @template TValue The type of value this widget holds.
 * @template TType A string designating the type of widget, e.g. "toggle" or "string".
 * @template TOptions The options for this widget.
 * @see IWidget
 */
export interface IBaseWidget<
  TValue = boolean | number | string | object | undefined,
  TType extends string = string,
  TOptions extends IWidgetOptions<unknown> = IWidgetOptions<unknown>,
> {
  /** Widgets that are visually or logically linked to this one (e.g. a combo and its dependent fields). */
  linkedWidgets?: IBaseWidget[]

  /** Internal widget identifier used for serialisation and input slot binding. */
  name: string
  /** Widget-specific configuration options. */
  options: TOptions

  /** User-facing label shown beside the widget. */
  label?: string
  /** Widget type (see {@link TWidgetType}) */
  type: TType
  value?: TValue

  /**
   * Whether the widget value should be serialised on node serialisation.
   * @default true
   */
  serialize?: boolean

  /**
   * The computed height of the widget. Used by customized node resize logic.
   * See scripts/domWidget.ts for more details.
   * @readonly [Computed] This property is computed by the node.
   */
  computedHeight?: number

  /**
   * The starting y position of the widget after layout.
   * @readonly [Computed] This property is computed by the node.
   */
  y: number

  /**
   * The y position of the widget after drawing (rendering).
   * @readonly [Computed] This property is computed by the node.
   * @deprecated There is no longer dynamic y adjustment on rendering anymore.
   * Use {@link IBaseWidget.y} instead.
   */
  last_y?: number

  /** Explicit width override for this widget. */
  width?: number
  /**
   * Whether the widget is disabled. Disabled widgets are rendered at half opacity.
   * See also {@link IBaseWidget.computedDisabled}.
   */
  disabled?: boolean

  /**
   * The disabled state used for rendering based on various conditions including
   * {@link IBaseWidget.disabled}.
   * @readonly [Computed] This property is computed by the node.
   */
  computedDisabled?: boolean

  /** When `true`, the widget is not rendered or interactive. */
  hidden?: boolean
  /** When `true`, the widget is shown only when the node's advanced section is expanded. */
  advanced?: boolean

  /** Tooltip text shown on hover. */
  tooltip?: string

  // TODO: Confirm this format
  callback?(
    value: any,
    canvas?: LGraphCanvas,
    node?: LGraphNode,
    pos?: Point,
    e?: CanvasPointerEvent,
  ): void

  /**
   * Simple callback for pointer events, allowing custom widgets to events relevant to them.
   * @param event The pointer event that triggered this callback
   * @param pointerOffset Offset of the pointer relative to {@link node.pos}
   * @param node The node this widget belongs to
   * @todo Expose CanvasPointer API to custom widgets
   */
  mouse?(event: CanvasPointerEvent, pointerOffset: Point, node: LGraphNode): boolean
  /**
   * Draw the widget.
   * @param ctx The canvas context to draw on.
   * @param node The node this widget belongs to.
   * @param widget_width The width of the widget.
   * @param y The y position of the widget.
   * @param H The height of the widget.
   * @param lowQuality Whether to draw the widget in low quality.
   */
  draw?(
    ctx: CanvasRenderingContext2D,
    node: LGraphNode,
    widget_width: number,
    y: number,
    H: number,
    lowQuality?: boolean,
  ): void

  /**
   * Compute the size of the widget. Overrides {@link IBaseWidget.computeSize}.
   * @param width The width of the widget.
   * @deprecated Use {@link IBaseWidget.computeLayoutSize} instead.
   * @returns The size of the widget.
   */
  computeSize?(width?: number): Size

  /**
   * Compute the layout size of the widget.
   * @param node The node this widget belongs to.
   * @returns The layout size of the widget.
   */
  computeLayoutSize?(
    this: IBaseWidget,
    node: LGraphNode
  ): {
    minHeight: number
    maxHeight?: number
    minWidth: number
    maxWidth?: number
  }

  /**
   * Callback for pointerdown events, allowing custom widgets to register callbacks to occur
   * for all {@link CanvasPointer} events.
   *
   * This callback is operated early in the pointerdown logic; actions that prevent it from firing are:
   * - `Ctrl + Drag` Multi-select
   * - `Alt + Click/Drag` Clone node
   * @param pointer The CanvasPointer handling this event
   * @param node The node this widget belongs to
   * @param canvas The LGraphCanvas where this event originated
   * @returns Returning `true` from this callback forces Litegraph to ignore the event and
   * not process it any further.
   */
  onPointerDown?(pointer: CanvasPointer, node: LGraphNode, canvas: LGraphCanvas): boolean
}
