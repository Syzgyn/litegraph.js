import type { SubgraphInput } from "./SubgraphInput"
import type { ISubgraphInput } from "@/interfaces"
import type { BaseLGraph, LGraph } from "@/LGraph"
import type { GraphOrSubgraph, Subgraph } from "@/subgraph/Subgraph"
import type { ExportedSubgraphInstance, ISerialisedNode } from "@/types/serialisation"
import type { IBaseWidget, TWidgetValue } from "@/types/widgets"
import type { UUID } from "@/utils/uuid"
import type { WidgetTypeMap } from "@/widgets/widgetMap"

import { RecursionError } from "@/infrastructure/RecursionError"
import { LGraphButton } from "@/LGraphButton"
import { LGraphCanvas } from "@/LGraphCanvas"
import { LGraphNode } from "@/LGraphNode"
import { type INodeInputSlot, type ISlotType, type NodeId } from "@/litegraph"
import { LLink, type ResolvedConnection } from "@/LLink"
import { NodeInputSlot } from "@/node/NodeInputSlot"
import { NodeOutputSlot } from "@/node/NodeOutputSlot"
import { toConcreteWidget } from "@/widgets/widgetMap"

import { type ExecutableLGraphNode, ExecutableNodeDTO, type ExecutionId } from "./ExecutableNodeDTO"

/**
 * A live instance of a {@link Subgraph} definition, rendered as a single node on a parent graph.
 *
 * Mirrors the subgraph's input/output slots on its own node surface, promotes connected internal
 * widgets to the parent canvas, and provides link-resolution helpers used during execution
 * flattening and link dragging across subgraph boundaries.
 * @remarks
 * Subscribes to subgraph events so IO slot and widget changes on the definition stay in sync with
 * every placed instance. Virtual ({@link isVirtualNode}) for execution purposes — inner nodes are
 * expanded via {@link getInnerNodes}.
 * @see {@link Subgraph}
 * @see {@link ExecutableNodeDTO}
 */
export class SubgraphNode extends LGraphNode implements BaseLGraph {
  /** Widgets added programmatically outside the promotion system. */
  readonly #extraWidgets: IBaseWidget[] = []

  /** Manages lifecycle of all subgraph event listeners */
  #eventAbortController = new AbortController()

  /** Input slots mirroring {@link Subgraph.inputs}, with optional subgraph-specific metadata. */
  declare inputs: (INodeInputSlot & Partial<ISubgraphInput>)[]

  /** The subgraph definition ID; matches {@link Subgraph.id}. */
  override readonly type: UUID
  /** Subgraph instances are virtual nodes whose behaviour is expanded at execution time. */
  override readonly isVirtualNode = true as const

  /** Widgets promoted from internal subgraph inputs and displayed on this node. */
  override widgets: IBaseWidget[] = []

  /** The parent graph (root or nested subgraph) containing this instance, or `null` when detached. */
  override graph: GraphOrSubgraph | null

  /**
   * @param graph The parent graph (root or nested subgraph) containing this instance.
   * @param subgraph The subgraph definition this node instantiates.
   * @param instanceData Per-instance serialised state (position, properties, etc.).
   */
  constructor(
    graph: GraphOrSubgraph,
    /** The definition of this subgraph; how its nodes are configured, etc. */
    readonly subgraph: Subgraph,
    instanceData: ExportedSubgraphInstance,
  ) {
    super(subgraph.name, subgraph.id)
    this.graph = graph

    // Update this node when the subgraph input / output slots are changed
    const subgraphEvents = this.subgraph.events
    const { signal } = this.#eventAbortController

    subgraphEvents.addEventListener("input-added", (e) => {
      const subgraphInput = e.detail.input
      const { name, type } = subgraphInput
      const existingInput = this.inputs.find(
        input =>
          input._subgraphSlot === subgraphInput ||
          (input._subgraphSlot && input._subgraphSlot.id === subgraphInput.id),
      )
      if (existingInput) {
        // Rebind to the new SubgraphInput object and re-register listeners
        // (configure recreates SubgraphInput objects with the same id)
        this.#addSubgraphInputListeners(subgraphInput, existingInput)

        const linkId = subgraphInput.linkIds[0]
        if (linkId === undefined) return

        const link = this.subgraph.getLink(linkId)
        if (!link) return

        const resolved = link.resolve(this.subgraph)
        if (!resolved.input || !resolved.inputNode) return

        const widget = resolved.inputNode.getWidgetFromSlot(resolved.input)
        if (widget) this.#setWidget(subgraphInput, existingInput, widget)
        return
      }

      const input = this.addInput(name, type, { _subgraphSlot: subgraphInput })
      this.#addSubgraphInputListeners(subgraphInput, input)
    }, { signal })

    subgraphEvents.addEventListener("removing-input", (e) => {
      const widget = e.detail.input._widget
      if (widget) this.ensureWidgetRemoved(widget)

      this.removeInput(e.detail.index)
      this.setDirtyCanvas(true, true)
    }, { signal })

    subgraphEvents.addEventListener("output-added", (e) => {
      const { name, type } = e.detail.output
      this.addOutput(name, type)
    }, { signal })

    subgraphEvents.addEventListener("removing-output", (e) => {
      this.removeOutput(e.detail.index)
      this.setDirtyCanvas(true, true)
    }, { signal })

    subgraphEvents.addEventListener("renaming-input", (e) => {
      const { index, newName } = e.detail
      const input = this.inputs.at(index)
      if (!input) throw new Error("Subgraph input not found")

      input.label = newName
    }, { signal })

    subgraphEvents.addEventListener("renaming-output", (e) => {
      const { index, newName } = e.detail
      const output = this.outputs.at(index)
      if (!output) throw new Error("Subgraph output not found")

      output.label = newName
    }, { signal })

    this.type = subgraph.id
    this.configure(instanceData)

    this.addTitleButton({
      name: "enter_subgraph",
      text: "\u{E93B}", // Unicode for pi-window-maximize
      yOffset: 0, // No vertical offset needed, button is centered
      xOffset: -10,
      fontSize: 16,
    })
  }

  #addSubgraphInputListeners(subgraphInput: SubgraphInput, input: INodeInputSlot & Partial<ISubgraphInput>) {
    input._subgraphSlot = subgraphInput
    input._listenerController?.abort()
    input._listenerController = new AbortController()
    const { signal } = input._listenerController

    subgraphInput.events.addEventListener(
      "input-connected",
      (e) => {
        input.shape = this.getSlotShape(subgraphInput, e.detail.input)

        const hasStaleBoundWidget =
          input._widget &&
          !this.widgets.includes(input._widget)

        if (input._widget && !hasStaleBoundWidget) return

        const widget = e.detail.widget ?? subgraphInput._widget
        if (!widget) return

        if (hasStaleBoundWidget) {
          this.removeWidgetByName(input.name)
          delete input.pos
          delete input.widget
          input._widget = undefined
        }

        this.#setWidget(subgraphInput, input, widget)
      },
      { signal },
    )

    subgraphInput.events.addEventListener(
      "input-disconnected",
      () => {
        input.shape = this.getSlotShape(subgraphInput)

        // If the input is connected to more than one widget, don't remove the widget
        const connectedWidgets = subgraphInput.getConnectedWidgets()
        if (connectedWidgets.length > 0) return

        this.removeWidgetByName(input.name)

        delete input.pos
        delete input.widget
        input._widget = undefined
      },
      { signal },
    )
  }

  #rebindInputSubgraphSlots(): void {
    const subgraphSlots = [...this.subgraph.inputNode.slots]
    const slotsBySignature = new Map<string, SubgraphInput[]>()
    const slotsByName = new Map<string, SubgraphInput[]>()

    for (const slot of subgraphSlots) {
      const signature = `${slot.name}:${String(slot.type)}`
      const signatureSlots = slotsBySignature.get(signature)
      if (signatureSlots) signatureSlots.push(slot)
      else slotsBySignature.set(signature, [slot])

      const nameSlots = slotsByName.get(slot.name)
      if (nameSlots) nameSlots.push(slot)
      else slotsByName.set(slot.name, [slot])
    }

    const assignedSlotIds = new Set<string>()
    const takeUnassignedSlot = (slots: SubgraphInput[] | undefined): SubgraphInput | undefined => {
      if (!slots) return undefined
      return slots.find(slot => !assignedSlotIds.has(String(slot.id)))
    }

    for (const input of this.inputs) {
      const existingSlot = input._subgraphSlot
      if (existingSlot && this.subgraph.inputNode.slots.includes(existingSlot)) {
        assignedSlotIds.add(String(existingSlot.id))
        continue
      }

      const signature = `${input.name}:${String(input.type)}`
      const matchedSlot =
        takeUnassignedSlot(slotsBySignature.get(signature)) ??
        takeUnassignedSlot(slotsByName.get(input.name))

      if (matchedSlot) {
        input._subgraphSlot = matchedSlot
        assignedSlotIds.add(String(matchedSlot.id))
      } else {
        delete input._subgraphSlot
      }
    }
  }

  #resolveInputWidget(subgraphInput: SubgraphInput, input: INodeInputSlot): void {
    for (const linkId of subgraphInput.linkIds) {
      const link = this.subgraph.getLink(linkId)
      if (!link) {
        console.warn(`[SubgraphNode.configure] No link found for link ID ${linkId}`, this)
        continue
      }

      const resolved = link.resolve(this.subgraph)
      if (!resolved.input || !resolved.inputNode) {
        console.warn("Invalid resolved link", resolved, this)
        continue
      }

      const widget = resolved.inputNode.getWidgetFromSlot(resolved.input)
      if (!widget) continue

      this.#setWidget(subgraphInput, input, widget)
      break
    }
  }

  #setWidget(subgraphInput: Readonly<SubgraphInput>, input: INodeInputSlot, widget: Readonly<IBaseWidget>) {
    // Use the first matching widget
    const promotedWidget = toConcreteWidget(widget, this).createCopyForNode(this)

    Object.assign(promotedWidget, {
      get name() {
        return subgraphInput.name
      },
      set name(value) {
        console.warn("Promoted widget: setting name is not allowed", this, value)
      },
      get localized_name() {
        return subgraphInput.localized_name
      },
      set localized_name(value) {
        console.warn("Promoted widget: setting localized_name is not allowed", this, value)
      },
      get label() {
        return subgraphInput.label
      },
      set label(value) {
        console.warn("Promoted widget: setting label is not allowed", this, value)
      },
      get tooltip() {
        // Preserve the original widget's tooltip for promoted widgets
        return widget.tooltip
      },
      set tooltip(value) {
        console.warn("Promoted widget: setting tooltip is not allowed", this, value)
      },
    })

    this.widgets.push(promotedWidget)

    // Dispatch widget-promoted event
    this.subgraph.events.dispatch("widget-promoted", { widget: promotedWidget, subgraphNode: this })

    input.widget = { name: subgraphInput.name }
    input._widget = promotedWidget
    this._widgetSlotsDirty = true
  }

  /** The root graph that ultimately owns this instance's subgraph definition. */
  get rootGraph(): LGraph {
    return this.graph!.rootGraph
  }

  /** `true` when this instance has been removed from its parent graph. */
  get isDetached(): boolean {
    return !this.graph
  }

  /** User-facing type label shown in the node UI. */
  override get displayType(): string {
    return "Subgraph node"
  }

  /** Narrows this node to {@link SubgraphNode} for type guards. */
  override isSubgraphNode(): this is SubgraphNode {
    return true
  }

  /**
   * Opens the subgraph editor when the "enter subgraph" title button is clicked.
   * @param button The title button that was clicked.
   * @param canvas The active graph canvas.
   */
  override onTitleButtonClick(button: LGraphButton, canvas: LGraphCanvas): void {
    if (button.name === "enter_subgraph") {
      canvas.openSubgraph(this.subgraph)
    } else {
      super.onTitleButtonClick(button, canvas)
    }
  }

  /**
   * Rebuilds input/output slots from the subgraph definition and applies instance data.
   * @param info Serialised per-instance node state.
   */
  override configure(info: ExportedSubgraphInstance): void {
    for (const input of this.inputs) {
      input._listenerController?.abort()
    }

    this.inputs.length = 0
    this.inputs.push(
      ...this.subgraph.inputNode.slots.map((slot) => {
        const input = new NodeInputSlot({ name: slot.name, localized_name: slot.localized_name, label: slot.label, shape: this.getSlotShape(slot), type: slot.type, link: null }, this) as INodeInputSlot & Partial<ISubgraphInput>
        input._subgraphSlot = slot
        return input
      }),
    )

    this.outputs.length = 0
    this.outputs.push(
      ...this.subgraph.outputNode.slots.map(
        slot => new NodeOutputSlot({ name: slot.name, localized_name: slot.localized_name, label: slot.label, type: slot.type, links: null }, this),
      ),
    )

    super.configure(info)
  }

  override _internalConfigureAfterSlots() {
    this.#rebindInputSubgraphSlots()

    // Prune inputs that don't map to any subgraph slot definition.
    // This prevents stale/duplicate serialized inputs from persisting (#9977).
    this.inputs = this.inputs.filter(input => input._subgraphSlot)

    // Reset widgets
    const extraWidgets = [...this.#extraWidgets]
    this.widgets.length = 0

    // Check all inputs for connected widgets
    for (const input of this.inputs) {
      const subgraphInput = input._subgraphSlot
      if (!subgraphInput) {
        console.warn(`[SubgraphNode.configure] No subgraph input found for input ${input.name}, skipping`)
        continue
      }

      this.#addSubgraphInputListeners(subgraphInput, input)
      this.#resolveInputWidget(subgraphInput, input)
    }

    this.widgets.push(...extraWidgets)
  }

  /**
   * Clears all cached promoted widget views and re-resolves `input._widget`
   * bindings from the current subgraph connections. Called after ancestor
   * host nodes need refreshing during nested subgraph packing.
   */
  rebuildInputWidgetBindings(): void {
    const extraWidgets = [...this.#extraWidgets]
    this.widgets.length = 0

    for (const input of this.inputs) {
      delete input.widget
      delete input.pos
      input._widget = undefined
      const subgraphInput = input._subgraphSlot
      if (!subgraphInput) continue
      this.#resolveInputWidget(subgraphInput, input)
    }

    this.widgets.push(...extraWidgets)
  }

  /**
   * Rebinds promoted widgets and applies saved values after nested packing.
   */
  restorePromotedWidgetValues(values: Map<string, TWidgetValue>): void {
    this.rebuildInputWidgetBindings()

    for (const input of this.inputs) {
      const saved = values.get(input.name)
      if (saved === undefined) continue

      const widget = this.widgets.find(w => w.name === input.name)
      if (widget) {
        widget.value = saved
        continue
      }

      const subgraphInput = input._subgraphSlot
      const sourceWidget = subgraphInput?.getConnectedWidgets()[0]
      if (!subgraphInput || !sourceWidget) continue

      this.#setWidget(subgraphInput, input, sourceWidget)
      this.widgets.at(-1)!.value = saved
    }
  }

  /**
   * Ensures the subgraph slot is in the params before adding the input as normal.
   * @param name The name of the input slot.
   * @param type The type of the input slot.
   * @param inputProperties Properties that are directly assigned to the created input. Default: a new, empty object.
   * @returns The new input slot.
   * @remarks Assertion is required to instantiate empty generic POJO.
   */
  override addInput<TInput extends Partial<ISubgraphInput>>(name: string, type: ISlotType, inputProperties: TInput = {} as TInput): INodeInputSlot & TInput {
    // Bypasses type narrowing on this.inputs
    return super.addInput(name, type, inputProperties)
  }

  /**
   * Returns a synthetic link representing the internal connection for an output slot.
   *
   * Used when resolving links that appear to originate from this virtual node's outputs.
   * The returned link's `origin_id` is prefixed with this instance's ID.
   * @param slot The output slot index on this subgraph node.
   * @returns A cloned inner link with adjusted origin metadata, or `null` when unconnected.
   */
  override getInputLink(slot: number): LLink | null {
    // Output side: the link from inside the subgraph
    const innerLink = this.subgraph.outputNode.slots[slot].getLinks().at(0)
    if (!innerLink) {
      console.warn(`SubgraphNode.getInputLink: no inner link found for slot ${slot}`)
      return null
    }

    const newLink = LLink.create(innerLink)
    newLink.origin_id = `${this.id}:${innerLink.origin_id}`
    newLink.origin_slot = innerLink.origin_slot

    return newLink
  }

  /**
   * Finds the internal links connected to the given input slot inside the subgraph, and resolves the nodes / slots.
   * @param slot The slot index
   * @returns The resolved connections, or undefined if no input node is found.
   * @remarks This is used to resolve the input links when dragging a link from a subgraph input slot.
   */
  resolveSubgraphInputLinks(slot: number): ResolvedConnection[] {
    const inputSlot = this.subgraph.inputNode.slots[slot]
    const innerLinks = inputSlot.getLinks()
    if (innerLinks.length === 0) {
      console.debug(`[SubgraphNode.resolveSubgraphInputLinks] No inner links found for input slot [${slot}] ${inputSlot.name}`, this)
      return []
    }
    return innerLinks.map(link => link.resolve(this.subgraph))
  }

  /**
   * Finds the internal link connected to the given output slot inside the subgraph, and resolves the nodes / slots.
   * @param slot The slot index
   * @returns The output node if found, otherwise undefined.
   */
  resolveSubgraphOutputLink(slot: number): ResolvedConnection | undefined {
    const outputSlot = this.subgraph.outputNode.slots[slot]
    const innerLink = outputSlot.getLinks().at(0)
    if (innerLink) return innerLink.resolve(this.subgraph)

    console.debug(`[SubgraphNode.resolveSubgraphOutputLink] No inner link found for output slot [${slot}] ${outputSlot.name}`, this)
  }

  /**
   * Flattens this subgraph instance into executable node DTOs.
   *
   * Registers a DTO for this instance, then recursively expands nested subgraph nodes.
   * Throws {@link RecursionError} when a circular subgraph hierarchy is detected.
   * @param executableNodes Map populated with all DTOs keyed by {@link ExecutionId}.
   * @param subgraphNodePath Ordered instance IDs from the root graph to this instance.
   * @param nodes Accumulator for leaf DTOs (internal recursion parameter).
   * @param visited Set of instances already being expanded (internal recursion parameter).
   * @returns All leaf {@link ExecutableLGraphNode} DTOs inside this subgraph.
   */
  getInnerNodes(
    /** The set of computed node DTOs for this execution. */
    executableNodes: Map<ExecutionId, ExecutableLGraphNode>,
    /** The path of subgraph node IDs. */
    subgraphNodePath: readonly NodeId[] = [],
    /** Internal recursion param. The list of nodes to add to. */
    nodes: ExecutableLGraphNode[] = [],
    /** Internal recursion param. The set of visited nodes. */
    visited = new Set<SubgraphNode>(),
  ): ExecutableLGraphNode[] {
    if (visited.has(this)) {
      const nodeInfo = `${this.id}${this.title ? ` (${this.title})` : ""}`
      const subgraphInfo = `'${this.subgraph.name || "Unnamed Subgraph"}'`
      const depth = subgraphNodePath.length
      throw new RecursionError(
        `Circular reference detected at depth ${depth} in node ${nodeInfo} of subgraph ${subgraphInfo}. ` +
        `This creates an infinite loop in the subgraph hierarchy.`,
      )
    }
    visited.add(this)

    const subgraphInstanceIdPath = [...subgraphNodePath, this.id]

    // Store the subgraph node DTO
    const parentSubgraphNode = this.graph!.rootGraph.resolveSubgraphIdPath(subgraphNodePath).at(-1)
    const subgraphNodeDto = new ExecutableNodeDTO(this, subgraphNodePath, executableNodes, parentSubgraphNode)
    executableNodes.set(subgraphNodeDto.id, subgraphNodeDto)

    for (const node of this.subgraph.nodes) {
      if ("getInnerNodes" in node) {
        node.getInnerNodes(executableNodes, subgraphInstanceIdPath, nodes, new Set(visited))
      } else {
        // Create minimal DTOs rather than cloning the node
        const aVeryRealNode = new ExecutableNodeDTO(node, subgraphInstanceIdPath, executableNodes, this)
        executableNodes.set(aVeryRealNode.id, aVeryRealNode)
        nodes.push(aVeryRealNode)
      }
    }
    return nodes
  }

  override addCustomWidget<TPlainWidget extends IBaseWidget>(
    customWidget: TPlainWidget,
  ): TPlainWidget | WidgetTypeMap[TPlainWidget["type"]] {
    const widget = toConcreteWidget(customWidget, this, false) ?? customWidget
    this.#extraWidgets.push(widget)
    this.widgets.push(widget)
    this._widgetSlotsDirty = true
    return widget
  }

  /**
   * Removes a promoted widget by name and dispatches `"widget-demoted"`.
   * @param name The widget name to remove.
   */
  override removeWidgetByName(name: string): void {
    const widget = this.widgets.find(w => w.name === name)
    if (widget) {
      this.subgraph.events.dispatch("widget-demoted", { widget, subgraphNode: this })
    }
    super.removeWidgetByName(name)
  }

  /**
   * Ensures a widget is removed and dispatches `"widget-demoted"` when it was promoted.
   * @param widget The widget instance to remove.
   */
  override ensureWidgetRemoved(widget: IBaseWidget): void {
    const index = this.#extraWidgets.indexOf(widget)
    if (index !== -1) {
      this.#extraWidgets.splice(index, 1)
      super.ensureWidgetRemoved(widget)
      return
    }

    if (this.widgets.includes(widget)) {
      this.subgraph.events.dispatch("widget-demoted", { widget, subgraphNode: this })
    }
    super.ensureWidgetRemoved(widget)
  }

  /**
   * Synchronizes widget values from this SubgraphNode instance to the
   * corresponding widgets in the subgraph definition before serialization.
   * This ensures nested subgraph widget values are preserved when saving.
   */
  override serialize(): ISerialisedNode {
    for (let i = 0; i < this.widgets.length; i++) {
      const widget = this.widgets[i]
      const input = this.inputs.find(inp => inp.name === widget.name)

      if (input) {
        const subgraphInput = this.subgraph.inputNode.slots.find(
          slot => slot.name === input.name,
        )

        if (subgraphInput) {
          for (const connectedWidget of subgraphInput.getConnectedWidgets()) {
            connectedWidget.value = widget.value
          }
        }
      }
    }

    return super.serialize()
  }

  override clone() {
    const clone = super.clone()
    // force reassign so domWidgets reset ownership
    // eslint-disable-next-line no-self-assign
    this.properties["proxyWidgets"] = this.properties["proxyWidgets"]
    return clone
  }

  /**
   * Cleans up event listeners and demotes all widgets when this instance is removed from the graph.
   */
  override onRemoved(): void {
    // Clean up all subgraph event listeners
    this.#eventAbortController.abort()

    // Clean up all promoted widgets
    for (const widget of this.widgets) {
      this.subgraph.events.dispatch("widget-demoted", { widget, subgraphNode: this })
    }

    for (const widget of this.#extraWidgets) widget.onRemove?.()
    this.#extraWidgets.length = 0

    for (const input of this.inputs) {
      input._listenerController?.abort()
    }

    this.widgets.length = 0
  }

  getSlotShape(slot: SubgraphInput, extraInput?: INodeInputSlot) {
    const shapes = slot.linkIds.map(
      id => this.subgraph.links.get(id)?.resolve(this.subgraph)?.input?.shape,
    )
    if (extraInput) shapes.push(extraInput.shape)
    return shapes.every(shape => shape === shapes[0]) ? shapes[0] : undefined
  }
}
