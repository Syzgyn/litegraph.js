import type { LGraphNode } from "@/LGraphNode"
import type { ITextPreviewWidget } from "@/types/widgets"

import { type LGraphCanvas, LiteGraph } from "@/litegraph"
import { measureWrappedTextHeight } from "@/utils/wrapText"

import { BaseWidget, type DrawWidgetOptions, type WidgetEventOptions } from "./BaseWidget"

const TEXTAREA_CLASS = "litegraph-textpreview"
const VERTICAL_PADDING = 2
const HORIZONTAL_PADDING = 10
const DEFAULT_MIN_HEIGHT = 20

function widgetFont(): string {
  return `${LiteGraph.NODE_TEXT_SIZE}px ${LiteGraph.NODE_FONT}`
}

function lineHeight(): number {
  return LiteGraph.NODE_TEXT_SIZE * 1.35
}

/**
 * Read-only multiline text preview (`type: "textpreview"`).
 *
 * Renders a selectable DOM textarea that tracks node size and zoom. The widget grows with
 * wrapped content and expands further when the node is resized vertically.
 */
export class TextPreviewWidget extends BaseWidget<ITextPreviewWidget> implements ITextPreviewWidget {
  #textarea: HTMLTextAreaElement | null = null

  constructor(widget: ITextPreviewWidget, node: LGraphNode) {
    super(widget, node)
    this.type ??= "textpreview"
    this.value = widget.value?.toString() ?? ""
  }

  #measureContentHeight(nodeWidth: number): number {
    const innerWidth = Math.max(
      0,
      nodeWidth - BaseWidget.margin * 2 - HORIZONTAL_PADDING,
    )

    return measureWrappedTextHeight(this.value, innerWidth, {
      font: widgetFont(),
      lineHeight: lineHeight(),
      horizontalPadding: 0,
      verticalPadding: VERTICAL_PADDING,
    })
  }

  #shouldShowElement(): boolean {
    const { node } = this
    return !node.collapsed && !this.hidden && this.node.isWidgetVisible(this)
  }

  #ensureTextarea(canvas: LGraphCanvas): HTMLTextAreaElement {
    if (this.#textarea) return this.#textarea

    const textarea = document.createElement("textarea")
    textarea.className = TEXTAREA_CLASS
    textarea.readOnly = true
    textarea.tabIndex = -1
    textarea.spellcheck = false
    textarea.value = this.value
    textarea.addEventListener("pointerdown", e => e.stopPropagation())
    textarea.addEventListener("pointermove", e => e.stopPropagation())
    textarea.addEventListener("pointerup", e => e.stopPropagation())
    textarea.addEventListener("wheel", e => e.stopPropagation(), { passive: true })

    canvas.getCanvasWindow().document.body.append(textarea)
    this.#textarea = textarea
    return textarea
  }

  #hideElement(): void {
    if (this.#textarea) this.#textarea.style.display = "none"
  }

  #syncElement(canvas: LGraphCanvas, width: number): void {
    if (!this.#shouldShowElement()) {
      this.#hideElement()
      return
    }

    const textarea = this.#ensureTextarea(canvas)
    if (textarea.value !== this.value) textarea.value = this.value

    const { margin } = BaseWidget
    const { ds } = canvas
    const graphX = this.node.pos[0] + margin
    const graphY = this.node.pos[1] + this.y
    const widgetWidth = width - margin * 2
    const widgetHeight = this.computedHeight ?? this.height

    const canvasX = (graphX + ds.offset[0]) * ds.scale
    const canvasY = (graphY + ds.offset[1]) * ds.scale
    const rect = canvas.canvas.getBoundingClientRect()

    const fontSize = LiteGraph.NODE_TEXT_SIZE * ds.scale
    // TODO: Only update the style if it has changed
    Object.assign(textarea.style, {
      display: "block",
      position: "fixed",
      left: `${rect.left + canvasX}px`,
      top: `${rect.top + canvasY}px`,
      width: `${widgetWidth * ds.scale}px`,
      height: `${widgetHeight * ds.scale}px`,
      font: `${fontSize}px ${LiteGraph.NODE_FONT}`,
      lineHeight: `${fontSize * 1.35}px`,
      zIndex: "10",
    })
  }

  override get value(): string {
    return super.value as string
  }

  override set value(value: unknown) {
    super.value = String(value)
  }

  override get displayValue(): string {
    return String(this.value)
  }

  override get height(): number {
    return this.computedHeight || super.height
  }

  override computeLayoutSize(node: LGraphNode): {
    minHeight: number
    maxHeight?: number
    minWidth: number
    maxWidth?: number
  } {
    const minHeight = Math.max(
      this.options.minHeight ?? DEFAULT_MIN_HEIGHT,
      this.options.growToFit ? this.#measureContentHeight(node.size[0]) : 0,
      // TODO: uncomment this when the widget is ready
      // this.#measureContentHeight(node.size[0]),
    )

    return {
      minHeight,
      minWidth: 100,
      maxHeight: 1_000_000,
      maxWidth: 1_000_000,
    }
  }

  protected override drawWidgetShape(ctx: CanvasRenderingContext2D, options: DrawWidgetOptions): void {
    const { width, showText } = options
    const { height, y } = this
    const { margin } = BaseWidget

    ctx.textAlign = "left"
    ctx.strokeStyle = this.outlineColor
    ctx.fillStyle = this.backgroundColor
    ctx.beginPath()

    if (showText) {
      ctx.roundRect(margin, y, width - margin * 2, height, [5])
    } else {
      ctx.rect(margin, y, width - margin * 2, height)
    }
    ctx.fill()
    if (showText) ctx.stroke()
  }

  override drawWidget(ctx: CanvasRenderingContext2D, {
    width,
    showText = true,
  }: DrawWidgetOptions): void {
    const { fillStyle, strokeStyle, textAlign, globalAlpha } = ctx
    const fullAlpha = this.computedDisabled ? globalAlpha / 0.5 : globalAlpha
    ctx.globalAlpha = fullAlpha

    this.drawWidgetShape(ctx, { width, showText })

    const canvas = this.node.graph?.primaryCanvas
    if (!canvas || !showText || !this.#shouldShowElement()) {
      this.#hideElement()
      Object.assign(ctx, { textAlign, strokeStyle, fillStyle, globalAlpha })
      return
    }

    this.#syncElement(canvas, width)
    Object.assign(ctx, { textAlign, strokeStyle, fillStyle, globalAlpha })
  }

  override onClick(_options: WidgetEventOptions): void {
    // Read-only preview: selection happens in the DOM textarea.
  }

  onRemove(): void {
    this.#textarea?.remove()
    this.#textarea = null
  }

  override setValue(value: string, options: WidgetEventOptions): void {
    super.setValue(value, options)
    if (this.#textarea) this.#textarea.value = this.value
  }
}
