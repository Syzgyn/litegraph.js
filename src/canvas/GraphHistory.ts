import type { LGraph } from "@/LGraph"
import type { LGraphCanvas } from "@/LGraphCanvas"
import type { LGraphNode } from "@/LGraphNode"
import type { SerialisableGraph } from "@/types/serialisation"
import type { UUID } from "@/utils/uuid"

import { forEachNode } from "@/utils/graphTraversal"

export interface GraphHistoryEntry {
  graph: SerialisableGraph
  subgraphId?: UUID
}

function entriesEqual(a: GraphHistoryEntry, b: GraphHistoryEntry): boolean {
  return a.subgraphId === b.subgraphId && graphsEqual(a.graph, b.graph)
}

function graphsEqual(a: SerialisableGraph, b: SerialisableGraph): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA") return true
  return "type" in target && target.type === "textarea"
}

function nodeCount(entry: GraphHistoryEntry): number {
  return entry.graph.nodes?.length ?? 0
}

/**
 * Undo/redo history for a {@link LGraphCanvas}, using graph serialisation snapshots.
 *
 * Listens for {@link LGraphCanvas} change events and pointer release to capture state,
 * resets its baseline when the root graph is configured or replaced, and handles
 * Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z (redo).
 * @example
 * ```ts
 * const history = new GraphHistory(canvas)
 * history.dispose()
 * ```
 */
export class GraphHistory implements Disposable {
  static MAX_HISTORY = 50

  #canvas: LGraphCanvas
  #rootGraph: LGraph
  #activeGraph?: LGraph
  #controller = new AbortController()
  #restoring = false
  #captureScheduled = false
  #settling = false
  #prevGraphBeforeChange?: LGraph["onBeforeChange"]
  #prevGraphAfterChange?: LGraph["onAfterChange"]

  #onSetGraph = (e: Event): void => {
    const { newGraph } = (e as CustomEvent<{ newGraph: LGraph }>).detail
    const newRoot = newGraph.rootGraph
    if (newRoot !== this.#rootGraph) {
      this.#detachFromRootGraph()
      this.#rootGraph = newRoot
      this.#attachToRootGraph()
      this.reset()
    }
    this.#attachToActiveGraph()
  }

  #onConfigured = (): void => {
    if (this.#restoring) return
    queueMicrotask(() => {
      if (!this.#restoring) this.reset("configured")
    })
  }

  #onCanvasEvent = (e: Event): void => {
    const detail = (e as CustomEvent<{ subType?: string }>).detail
    if (detail.subType === "before-change") this.#onBeforeChange()
    else if (detail.subType === "after-change") this.#onAfterChange()
  }

  #onBeforeChange = (): void => {
    this.#syncBaselineIfStale()
    this.changeCount++
  }

  #onAfterChange = (): void => {
    this.changeCount = Math.max(0, this.changeCount - 1)
    if (!this.changeCount) this.#scheduleCapture()
  }

  #onMouseUp = (): void => {
    this.#scheduleCapture()
  }

  #onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    this.#handleUndoRedo(e)
  }

  #onBeforeDropLinks = (): void => {
    this.#syncBaselineIfStale()
  }

  #onAfterDropLinks = (): void => {
    this.#scheduleCapture()
  }

  #onLinkCreated = (): void => {
    this.#scheduleCapture()
  }

  activeState: GraphHistoryEntry
  undoQueue: GraphHistoryEntry[] = []
  redoQueue: GraphHistoryEntry[] = []
  changeCount = 0

  constructor(canvas: LGraphCanvas, initialState?: GraphHistoryEntry) {
    this.#canvas = canvas
    this.#rootGraph = canvas.ensureGraph.rootGraph
    this.activeState = initialState ?? this.#createEntry()
    this.#attach()
    if (initialState === undefined) {
      if (this.#shouldResetBaseline()) {
        this.reset("constructed")
      } else {
        this.#settling = true
        queueMicrotask(() => {
          if (!this.#restoring) this.reset("constructed")
          this.#settling = false
        })
      }
    }
  }

  #shouldResetBaseline(): boolean {
    return this.#rootGraph.nodes.length > 0 ||
      this.#rootGraph.links.size > 0 ||
      nodeCount(this.activeState) !== this.#rootGraph.nodes.length
  }

  #createEntry(): GraphHistoryEntry {
    const widgetFlags = new Map<LGraphNode, boolean | undefined>()
    forEachNode(this.#rootGraph, (node) => {
      widgetFlags.set(node, node.serialize_widgets)
      node.serialize_widgets = true
    })

    try {
      return {
        graph: structuredClone(this.#rootGraph.asSerialisable()),
        subgraphId: this.#canvas.subgraph?.id,
      }
    } finally {
      for (const [node, prev] of widgetFlags) node.serialize_widgets = prev
    }
  }

  #restore(entry: GraphHistoryEntry): void {
    this.#restoring = true
    this.changeCount = 0
    try {
      this.#rootGraph.configure(entry.graph)
      this.#restoreNavigation(entry.subgraphId)
      this.activeState = structuredClone(entry)
    } finally {
      this.#restoring = false
      this.changeCount = 0
    }
  }

  #restoreNavigation(subgraphId?: UUID): void {
    if (subgraphId) {
      const subgraph = this.#rootGraph.subgraphs.get(subgraphId)
      if (subgraph) {
        this.#canvas.openSubgraph(subgraph)
        return
      }
    }

    if (this.#canvas.graph !== this.#rootGraph) this.#canvas.setGraph(this.#rootGraph)
  }

  #attach(): void {
    const { signal } = this.#controller
    const element = this.#canvas.canvas
    const listenerOptions = { capture: true, signal } satisfies AddEventListenerOptions

    element.addEventListener("litegraph:canvas", this.#onCanvasEvent, listenerOptions)
    element.addEventListener("keydown", this.#onKeyDown, listenerOptions)
    element.addEventListener("litegraph:set-graph", this.#onSetGraph, listenerOptions)

    // Bubble phase so pointer / link-drop handlers run before capture.
    document.addEventListener("mouseup", this.#onMouseUp, { signal })

    this.#canvas.linkConnector.events.addEventListener("before-drop-links", this.#onBeforeDropLinks, { signal })
    this.#canvas.linkConnector.events.addEventListener("after-drop-links", this.#onAfterDropLinks, { signal })
    this.#canvas.linkConnector.events.addEventListener("link-created", this.#onLinkCreated, { signal })

    this.#attachToRootGraph()
    this.#attachToActiveGraph()
  }

  #attachToRootGraph(): void {
    this.#rootGraph.events.addEventListener("configured", this.#onConfigured, {
      signal: this.#controller.signal,
    })
  }

  #detachFromRootGraph(): void {
    this.#rootGraph.events.removeEventListener("configured", this.#onConfigured)
  }

  #attachToActiveGraph(): void {
    this.#detachFromActiveGraph()

    const graph = this.#canvas.graph
    if (!graph) return

    this.#activeGraph = graph
    this.#prevGraphBeforeChange = graph.onBeforeChange
    this.#prevGraphAfterChange = graph.onAfterChange

    graph.onBeforeChange = (g, info) => {
      this.#prevGraphBeforeChange?.(g, info)
      this.#onBeforeChange()
    }
    graph.onAfterChange = (g, info) => {
      this.#onAfterChange()
      this.#prevGraphAfterChange?.(g, info)
    }
  }

  #detachFromActiveGraph(): void {
    if (!this.#activeGraph) return

    this.#activeGraph.onBeforeChange = this.#prevGraphBeforeChange
    this.#activeGraph.onAfterChange = this.#prevGraphAfterChange
    this.#activeGraph = undefined
    this.#prevGraphBeforeChange = undefined
    this.#prevGraphAfterChange = undefined
  }

  #scheduleCapture(): void {
    if (this.#captureScheduled) return
    this.#captureScheduled = true
    queueMicrotask(() => {
      this.#captureScheduled = false
      this.capture()
    })
  }

  #handleUndoRedo(e: KeyboardEvent): boolean {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
    if (isTextInput(e.target)) return false

    const key = e.key.toUpperCase()
    if (key === "Z" && !e.shiftKey) {
      e.preventDefault()
      this.undo()
      return true
    }

    if ((key === "Y" && !e.shiftKey) || (key === "Z" && e.shiftKey)) {
      e.preventDefault()
      this.redo()
      return true
    }

    return false
  }

  #syncBaselineIfStale(): void {
    if (this.#restoring) return
    if (nodeCount(this.activeState) === 0 && this.#rootGraph.nodes.length > 0)
      this.activeState = this.#createEntry()
  }

  /** @returns Whether undo steps are available. */
  get canUndo(): boolean {
    return this.undoQueue.length > 0
  }

  /** @returns Whether redo steps are available. */
  get canRedo(): boolean {
    return this.redoQueue.length > 0
  }

  capture(): void {
    if (this.#restoring || this.#settling || this.changeCount > 0) return

    const current = this.#createEntry()
    if (entriesEqual(this.activeState, current)) return

    this.undoQueue.push(this.activeState)
    if (this.undoQueue.length > GraphHistory.MAX_HISTORY) this.undoQueue.shift()
    this.activeState = current
    this.redoQueue.length = 0
  }

  undo(): void {
    const prev = this.undoQueue.pop()
    if (!prev) return

    this.redoQueue.push(this.#createEntry())
    this.#restore(prev)
  }

  redo(): void {
    const next = this.redoQueue.pop()
    if (!next) return

    this.undoQueue.push(this.#createEntry())
    this.#restore(next)
  }

  /** Replaces the baseline state and clears undo/redo stacks. */
  reset(state?: GraphHistoryEntry | "configured" | "constructed"): void {
    if (this.#restoring) return
    this.activeState = typeof state === "string" || state === undefined ? this.#createEntry() : state
    this.undoQueue.length = 0
    this.redoQueue.length = 0
    this.changeCount = 0
  }

  dispose(): void {
    this.#detachFromActiveGraph()
    this.#controller.abort()
  }

  /** {@link Disposable} protocol — delegates to {@link dispose}. */
  [Symbol.dispose](): void {
    this.dispose()
  }
}
