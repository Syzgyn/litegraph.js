import type { Point } from "@/interfaces"
import type { CanvasPointer, LGraphCanvas, LGraphNode, Size } from "@/litegraph"
import type { CanvasPointerEvent } from "@/types/events"
import type { IBaseWidget } from "@/types/widgets"

import { drawTextInArea } from "@/draw"
import { Rectangle } from "@/infrastructure/Rectangle"
import { LiteGraph } from "@/litegraph"

/**
 * Options passed to {@link BaseWidget.drawWidget} and related drawing helpers.
 */
export interface DrawWidgetOptions {
  /** Canvas width of the owning node — used to size the widget capsule and text layout. */
  width: number
  /**
   * When `false`, widgets render a simplified shape without text or decorative strokes.
   * @remarks Synonym for "low quality" rendering during zoomed-out or performance-sensitive draws.
   */
  showText?: boolean
}

/**
 * Options for {@link BaseWidget.drawTruncatingText}, extending draw options with canvas context
 * and horizontal padding for label/value text.
 */
export interface DrawTruncatingTextOptions extends DrawWidgetOptions {
  /** The canvas 2D context used to measure and render text. */
  ctx: CanvasRenderingContext2D
  /** Extra padding between the widget's left inner edge and the label text. */
  leftPadding?: number
  /** Extra padding between the value text and the widget's right inner edge. */
  rightPadding?: number
}

/**
 * Context bundle passed to widget interaction handlers ({@link BaseWidget.onClick},
 * {@link BaseWidget.onDrag}, {@link BaseWidget.setValue}, etc.).
 */
export interface WidgetEventOptions {
  /** The pointer event that triggered the interaction. */
  e: CanvasPointerEvent
  /** The node that owns this widget. */
  node: LGraphNode
  /** The canvas displaying the node graph. */
  canvas: LGraphCanvas
}

/**
 * Abstract base class for all built-in canvas-rendered node widgets.
 *
 * Provides shared layout constants, value storage, serialization hooks, default drawing helpers
 * (capsule shape, truncating label/value text), and the standard value-change pipeline
 * ({@link setValue} → callback → {@link LGraphNode.onWidgetChanged}).
 * @remarks
 * Concrete widget types extend this class or {@link BaseSteppedWidget}. Custom third-party widgets
 * may be wrapped by {@link LegacyWidget} until they migrate to this interface.
 * @see {@link toConcreteWidget}
 */
export abstract class BaseWidget<TWidget extends IBaseWidget = IBaseWidget> implements IBaseWidget {
  /** Horizontal inset from the node edge to the widget capsule's outer edge, in canvas pixels. */
  static margin = 15
  /** Horizontal inset from the widget capsule edge to the tip of stepped-widget arrow buttons. */
  static arrowMargin = 6
  /** Width of each increment/decrement arrow button on stepped widgets. */
  static arrowWidth = 10
  /** Minimum display width reserved for widget values before truncation kicks in. */
  static minValueWidth = 42
  /** Minimum horizontal gap between label and value text when both are drawn inline. */
  static labelValueGap = 5

  /**
   * Optional override for widget height, set by layout when the widget needs non-standard vertical space
   * (e.g. {@link KnobWidget}).
   */
  declare computedHeight?: number
  /** When `false`, this widget is omitted from graph serialization. */
  declare serialize?: boolean
  /**
   * Reports min/max width and height constraints for automatic node layout.
   * @param node The node requesting layout hints.
   */
  computeLayoutSize?(node: LGraphNode): {
    minHeight: number
    maxHeight?: number
    minWidth: number
    maxWidth?: number
  }

  #node: LGraphNode
  /** The {@link LGraphNode} that owns and displays this widget. */
  get node() {
    return this.#node
  }

  /** Widgets whose visibility or value is tied to this widget (e.g. linked combo entries). */
  linkedWidgets?: IBaseWidget[]
  /** Unique widget identifier within the owning node; used in callbacks and serialization. */
  name: string
  /** Type-specific configuration object (min/max, values list, precision, etc.). */
  options: TWidget["options"]
  /** Optional display label; falls back to {@link name} via {@link displayName}. */
  label?: string
  /** Discriminator string matching {@link TWidgetType} (e.g. `"number"`, `"combo"`). */
  type: TWidget["type"]
  /** Vertical offset of this widget within the node's widget stack, in canvas pixels. */
  y: number = 0
  /** Previous {@link y} value, used during layout reflow. */
  last_y?: number
  /** Cached width for hit-testing and drawing; typically mirrors node width. */
  width?: number
  /** When `true`, the widget is non-interactive and drawn in a disabled style. */
  disabled?: boolean
  /** Runtime-computed disabled state (may differ from {@link disabled} when linked to node state). */
  computedDisabled?: boolean
  /** When `true`, the widget is not drawn and does not receive pointer events. */
  hidden?: boolean
  /** When `true`, the widget uses the advanced outline colour ({@link outline_color}). */
  advanced?: boolean
  /** Optional hover tooltip text shown by the canvas. */
  tooltip?: string
  /** DOM element backing hybrid DOM/canvas widgets; unused by pure canvas widgets. */
  element?: HTMLElement
  /**
   * Invoked after {@link setValue} changes the widget value.
   * @param value The new widget value (type varies by widget).
   * @param canvas The canvas instance, when available.
   * @param node The owning node, when available.
   * @param pos Graph-space mouse position at the time of the change.
   * @param e The pointer event that caused the change, when applicable.
   */
  callback?(
    value: any,
    canvas?: LGraphCanvas,
    node?: LGraphNode,
    pos?: Point,
    e?: CanvasPointerEvent,
  ): void
  /**
   * Legacy mouse handler for custom widgets; returns whether the event was consumed.
   * @remarks Prefer {@link onPointerDown} and {@link onClick} on {@link BaseWidget} subclasses.
   */
  mouse?(event: CanvasPointerEvent, pointerOffset: Point, node: LGraphNode): boolean
  /** Returns the preferred {@link Size} for this widget at the given node width. */
  computeSize?(width?: number): Size
  /**
   * Called when a pointer down occurs over this widget.
   * @returns `true` if this widget captured the pointer for subsequent drag/click handling.
   */
  onPointerDown?(pointer: CanvasPointer, node: LGraphNode, canvas: LGraphCanvas): boolean

  #value?: TWidget["value"]
  /** Current widget value; assignment does not trigger callbacks — use {@link setValue} instead. */
  get value(): TWidget["value"] {
    return this.#value
  }

  /** Assigns backing storage only; does not run the change notification pipeline. */
  set value(value: TWidget["value"]) {
    this.#value = value
  }

  /**
   * @param widget Widget definition POJO, optionally including an embedded `node` reference.
   * @param node The owning node when `widget` does not carry `node` directly.
   */
  constructor(widget: TWidget & { node: LGraphNode })
  constructor(widget: TWidget, node: LGraphNode)
  constructor(widget: TWidget & { node: LGraphNode }, node?: LGraphNode) {
    // Private fields
    this.#node = node ?? widget.node

    // The set and get functions for DOM widget values are hacked on to the options object;
    // attempting to set value before options will throw.
    // https://github.com/Comfy-Org/ComfyUI_frontend/blob/df86da3d672628a452baed3df3347a52c0c8d378/src/scripts/domWidget.ts#L125
    this.name = widget.name
    this.options = widget.options
    this.type = widget.type

    // `node` has no setter - Object.assign will throw.
    // TODO: Resolve this workaround. Ref: https://github.com/Comfy-Org/litegraph.js/issues/1022
    // @ts-expect-error Prevent naming conflicts with custom nodes.
    // eslint-disable-next-line unused-imports/no-unused-vars
    const { node: _, outline_color, background_color, height, text_color, secondary_text_color, disabledTextColor, displayName, displayValue, labelBaseline, ...safeValues } = widget

    Object.assign(this, safeValues)
  }

  /** Stroke colour for the widget capsule outline; advanced widgets use a distinct palette entry. */
  get outline_color() {
    return this.advanced ? LiteGraph.WIDGET_ADVANCED_OUTLINE_COLOR : LiteGraph.WIDGET_OUTLINE_COLOR
  }

  /** Fill colour for the widget capsule background. */
  get background_color() {
    return LiteGraph.WIDGET_BGCOLOR
  }

  /** Default widget row height; subclasses may override (e.g. knobs with {@link computedHeight}). */
  get height() {
    return LiteGraph.NODE_WIDGET_HEIGHT
  }

  /** Primary text colour for values and active labels. */
  get text_color() {
    return LiteGraph.WIDGET_TEXT_COLOR
  }

  /** Secondary text colour for labels and de-emphasised values. */
  get secondary_text_color() {
    return LiteGraph.WIDGET_SECONDARY_TEXT_COLOR
  }

  /** Text colour used when increment/decrement arrows are unavailable. */
  get disabledTextColor() {
    return LiteGraph.WIDGET_DISABLED_TEXT_COLOR
  }

  /** User-facing label: {@link label} when set, otherwise {@link name}. */
  get displayName() {
    return this.label || this.name
  }

  // TODO: Resolve this workaround. Ref: https://github.com/Comfy-Org/litegraph.js/issues/1022
  /**
   * String representation of {@link value} for canvas text rendering.
   * @remarks Returns an empty string when {@link computedDisabled} is `true`. Subclasses override
   * for formatted numbers, combo labels, etc.
   */
  get _displayValue(): string {
    return this.computedDisabled ? "" : String(this.value)
  }

  /** Canvas Y coordinate for baseline-aligned label and value text within this widget row. */
  get labelBaseline() {
    return this.y + this.height * 0.7
  }

  /**
   * Renders this widget onto the node canvas.
   * @param ctx The canvas 2D rendering context (already translated to node space).
   * @param options Width and quality flags for the draw pass.
   * @remarks Named `drawWidget` instead of `draw` to avoid colliding with legacy custom widget
   * `draw` methods wrapped by {@link LegacyWidget}.
   */
  abstract drawWidget(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void

  /**
   * Draws the standard widget shape - elongated capsule. The path of the widget shape is not
   * cleared, and may be used for further drawing.
   * @param ctx The canvas context
   * @param options The options for drawing the widget
   * @remarks Leaves {@link ctx} dirty.
   */
  protected drawWidgetShape(ctx: CanvasRenderingContext2D, { width, showText }: DrawWidgetOptions): void {
    const { height, y } = this
    const { margin } = BaseWidget

    ctx.textAlign = "left"
    ctx.strokeStyle = this.outline_color
    ctx.fillStyle = this.background_color
    ctx.beginPath()

    if (showText) {
      ctx.roundRect(margin, y, width - margin * 2, height, [height * 0.5])
    } else {
      ctx.rect(margin, y, width - margin * 2, height)
    }
    ctx.fill()
    if (showText && !this.computedDisabled) ctx.stroke()
  }

  /**
   * Draws {@link displayName} and {@link _displayValue} inline, truncating or scaling text when the
   * combined width exceeds the available capsule interior.
   * @param options Canvas context, node width, and optional horizontal padding.
   * @remarks Uses {@link LiteGraph.truncateWidgetTextEvenly} and
   * {@link LiteGraph.truncateWidgetValuesFirst} to choose truncation strategy.
   */
  protected drawTruncatingText({
    ctx,
    width,
    leftPadding = 5,
    rightPadding = 20,
  }: DrawTruncatingTextOptions): void {
    const { height, y } = this
    const { margin } = BaseWidget

    // Measure label and value
    const { displayName, _displayValue } = this
    const labelWidth = ctx.measureText(displayName).width
    const valueWidth = ctx.measureText(_displayValue).width

    const gap = BaseWidget.labelValueGap
    const x = margin * 2 + leftPadding

    const totalWidth = width - x - 2 * margin - rightPadding
    const requiredWidth = labelWidth + gap + valueWidth

    const area = new Rectangle(x, y, totalWidth, height * 0.7)

    ctx.fillStyle = this.secondary_text_color

    if (requiredWidth <= totalWidth) {
      // Draw label & value normally
      drawTextInArea({ ctx, text: displayName, area, align: "left" })
    } else if (LiteGraph.truncateWidgetTextEvenly) {
      // Label + value will not fit - scale evenly to fit
      const scale = (totalWidth - gap) / (requiredWidth - gap)
      area.width = labelWidth * scale

      drawTextInArea({ ctx, text: displayName, area, align: "left" })

      // Move the area to the right to render the value
      area.right = x + totalWidth
      area.setWidthRightAnchored(valueWidth * scale)
    } else if (LiteGraph.truncateWidgetValuesFirst) {
      // Label + value will not fit - use legacy scaling of value first
      const cappedLabelWidth = Math.min(labelWidth, totalWidth)

      area.width = cappedLabelWidth
      drawTextInArea({ ctx, text: displayName, area, align: "left" })

      area.right = x + totalWidth
      area.setWidthRightAnchored(Math.max(totalWidth - gap - cappedLabelWidth, 0))
    } else {
      // Label + value will not fit - scale label first
      const cappedValueWidth = Math.min(valueWidth, totalWidth)

      area.width = Math.max(totalWidth - gap - cappedValueWidth, 0)
      drawTextInArea({ ctx, text: displayName, area, align: "left" })

      area.right = x + totalWidth
      area.setWidthRightAnchored(cappedValueWidth)
    }
    ctx.fillStyle = this.text_color
    drawTextInArea({ ctx, text: _displayValue, area, align: "right" })
  }

  /**
   * Handles a completed click (pointer up) on this widget.
   * @param options Pointer event, owning node, and canvas context.
   */
  abstract onClick(options: WidgetEventOptions): void

  /**
   * Handles pointer drag while this widget has capture.
   * @param options Pointer event, owning node, and canvas context.
   */
  onDrag?(options: WidgetEventOptions): void

  /**
   * Assigns a new value and runs the standard change notification pipeline.
   *
   * Updates the backing property, mirrors to `node.properties` when
   * {@link options.property} is set, invokes {@link callback}, fires
   * {@link LGraphNode.onWidgetChanged}, and bumps the graph version.
   * @param value The new value (no-op when equal to the current value).
   * @param options Event context for callbacks and property sync.
   */
  setValue(value: TWidget["value"], { e, node, canvas }: WidgetEventOptions): void {
    const oldValue = this.value
    if (value === this.value) return

    const v = this.type === "number" ? Number(value) : value
    this.value = v
    if (
      this.options?.property &&
      node.properties[this.options.property] !== undefined
    ) {
      node.setProperty(this.options.property, v)
    }
    const pos = canvas.graph_mouse
    this.callback?.(this.value, canvas, node, pos, e)

    node.onWidgetChanged?.(this.name ?? "", v, oldValue, this)
    if (node.graph) node.graph._version++
  }

  /**
   * Clones the widget.
   * @param node The node that will own the cloned widget.
   * @returns A new widget with the same properties as the original
   * @remarks Subclasses with custom constructors must override this method.
   *
   * Correctly and safely typing this is currently not possible (practical?) in TypeScript 5.8.
   */
  createCopyForNode(node: LGraphNode): this {
    // @ts-expect-error
    const cloned: this = new (this.constructor as typeof this)(this, node)
    cloned.value = this.value
    return cloned
  }
}
