/**
 * Reference implementation for DOM tooltips on top of litegraph hover APIs.
 *
 * Copy this file into your app and wire `resolveText` to your node-definition
 * store, i18n layer, and settings. Not published as part of the package build.
 * @example
 * ```ts
 * import { LGraphCanvas } from "@comfyorg/litegraph"
 * import { LitegraphDomTooltip } from "./dom-tooltips"
 *
 * const canvas = new LGraphCanvas(canvasEl, graph)
 * const tooltips = new LitegraphDomTooltip(canvas, {
 *   delayMs: 500,
 *   enabled: () => settings.enableTooltips,
 * })
 *
 * // on teardown: tooltips.dispose()
 * ```
 */

import {
  type HoverTarget,
  hoverTargetsEqual,
  type LGraphCanvas,
} from "@comfyorg/litegraph"

export interface DomTooltipOptions {
  /** Delay before showing a tooltip after hover settles. ComfyUI default: 500ms. */
  delayMs?: number
  /** Return false to suppress tooltips entirely. */
  enabled?: () => boolean
  /** Resolve tooltip text for a hover target. Return empty/undefined to hide. */
  resolveText?: (target: HoverTarget, canvas: LGraphCanvas) => string | undefined
}

function defaultResolveText(target: HoverTarget): string | undefined {
  switch (target.kind) {
    case "title":
      return target.node.getTitle() || target.node.type || undefined

    case "input":
    case "output":
      return target.slot.tooltip ?? String(target.slot.type)

    case "widget":
      if ("element" in target.widget && target.widget.element) return undefined
      return target.widget.tooltip

    case "subgraph-input":
    case "subgraph-output":
      return target.slot.tooltip ?? String(target.slot.type)

    case "link":
    case "reroute":
      return undefined
  }
}

/**
 * Manages a single fixed-position DOM element that shows tooltips for canvas hover targets.
 *
 * Listens to `litegraph:hover-change`, debounces display, and hides on interaction.
 * Repositions on `litegraph:viewport-change` so anchored tooltips track zoom and pan.
 */
export class LitegraphDomTooltip {
  readonly #canvas: LGraphCanvas
  readonly #el: HTMLDivElement
  readonly #options: DomTooltipOptions

  #pendingTarget: HoverTarget | null = null
  #visibleTarget: HoverTarget | null = null
  #showTimer: ReturnType<typeof setTimeout> | undefined
  #visible = false

  #onHoverChange = (e: Event): void => {
    const { target } = (e as CustomEvent<{ target: HoverTarget | null }>).detail

    this.#hide()
    clearTimeout(this.#showTimer)
    this.#pendingTarget = target

    if (!target || !this.#options.enabled?.()) return
    if (this.#canvas.state.draggingItems || this.#canvas.linkConnector.isConnecting) return

    this.#showTimer = setTimeout(() => {
      const current = this.#canvas.getHoverTarget()
      if (!hoverTargetsEqual(current, this.#pendingTarget)) return

      const text = this.#options.resolveText?.(current!, this.#canvas)?.trim()
      if (!text) return

      this.#show(text, current!)
    }, this.#options.delayMs)
  }

  #onViewportChange = (): void => {
    if (!this.#visible || !this.#visibleTarget) return
    if (!hoverTargetsEqual(this.#canvas.getHoverTarget(), this.#visibleTarget)) {
      this.#hide()
      return
    }
    this.#reposition()
  }

  #hide = (): void => {
    clearTimeout(this.#showTimer)
    this.#showTimer = undefined
    this.#pendingTarget = null
    this.#visibleTarget = null
    if (!this.#visible) return
    this.#el.style.display = "none"
    this.#el.textContent = ""
    this.#visible = false
  }

  constructor(canvas: LGraphCanvas, options: DomTooltipOptions = {}) {
    this.#canvas = canvas
    this.#options = {
      delayMs: 500,
      enabled: () => true,
      resolveText: defaultResolveText,
      ...options,
    }

    this.#el = document.createElement("div")
    Object.assign(this.#el.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "99999",
      maxWidth: "30vw",
      padding: "4px 8px",
      borderRadius: "5px",
      whiteSpace: "pre-wrap",
      display: "none",
      background: "var(--tooltip-bg, #333)",
      color: "var(--tooltip-fg, #eee)",
      boxShadow: "0 0 5px rgb(0 0 0 / 0.4)",
    })
    document.body.append(this.#el)

    canvas.canvas.addEventListener("litegraph:hover-change", this.#onHoverChange)
    canvas.canvas.addEventListener("litegraph:viewport-change", this.#onViewportChange)
    window.addEventListener("pointerdown", this.#hide)
    window.addEventListener("click", this.#hide)
    canvas.canvas.addEventListener("pointerleave", this.#hide)
  }

  #show(text: string, target: HoverTarget): void {
    this.#visibleTarget = target
    this.#el.textContent = text
    this.#el.style.display = "block"
    this.#visible = true
    this.#reposition()
  }

  #reposition(): void {
    const target = this.#visibleTarget
    if (!target) return

    const anchor = this.#canvas.getHoverClientPos(target)
    const [clientX, clientY] = anchor ?? this.#canvas.mouse
    this.#positionAt(clientX, clientY)
  }

  #positionAt(clientX: number, clientY: number): void {
    const offsetX = 8
    const offsetY = 8

    this.#el.style.left = `${clientX + offsetX}px`
    this.#el.style.top = `${clientY + offsetY}px`
    this.#el.style.transform = "translateY(-100%)"

    const rect = this.#el.getBoundingClientRect()
    if (rect.right > window.innerWidth)
      this.#el.style.left = `${clientX - rect.width - offsetX}px`
    if (rect.top < 0)
      this.#el.style.transform = "none"
  }

  dispose(): void {
    this.#hide()
    this.#el.remove()
    this.#canvas.canvas.removeEventListener("litegraph:hover-change", this.#onHoverChange)
    this.#canvas.canvas.removeEventListener("litegraph:viewport-change", this.#onViewportChange)
    window.removeEventListener("pointerdown", this.#hide)
    window.removeEventListener("click", this.#hide)
    this.#canvas.canvas.removeEventListener("pointerleave", this.#hide)
  }
}
