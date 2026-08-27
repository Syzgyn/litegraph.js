import type { SubgraphEventMap } from "@/infrastructure/SubgraphEventMap"
import type { DefaultConnectionColors, INodeInputSlot, INodeOutputSlot } from "@/interfaces"
import type { LGraphCanvas } from "@/LGraphCanvas"
import type { ExportedSubgraph, ExposedWidget, ISerialisedGraph, Serialisable, SerialisableGraph } from "@/types/serialisation"

import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "@/constants"
import { CustomEventTarget } from "@/infrastructure/CustomEventTarget"
import { type BaseLGraph, LGraph } from "@/LGraph"
import { type LinkId, LLink } from "@/LLink"
import { createUuidv4 } from "@/utils/uuid"

import { SubgraphInput } from "./SubgraphInput"
import { SubgraphInputNode } from "./SubgraphInputNode"
import { SubgraphOutput } from "./SubgraphOutput"
import { SubgraphOutputNode } from "./SubgraphOutputNode"

/**
 * Union of graph types that may contain or be contained by a `Subgraph`.
 *
 * Used where APIs accept either a root `LGraph` or a nested subgraph definition.
 */
export type GraphOrSubgraph = LGraph | Subgraph

/**
 * A reusable subgraph definition that can be instantiated as `SubgraphNode` instances.
 *
 * Extends `LGraph` with named inputs/outputs, IO boundary nodes, and widget promotion.
 * When opened in the canvas, the editor displays the subgraph's internal node network while
 * preserving links to the parent graph through `SubgraphInput` and `SubgraphOutput`.
 * @remarks
 * Subgraph instances on a parent graph mirror this definition's IO slots. Changes to inputs,
 * outputs, or promoted widgets propagate to all live instances via events.
 * @see `SubgraphNode`
 * @see `SubgraphInput`
 * @see `SubgraphOutput`
 */
export class Subgraph extends LGraph implements BaseLGraph, Serialisable<ExportedSubgraph> {
  /**
   * Maximum nesting depth for programmatically created subgraphs.
   *
   * Guards against unbounded recursive subgraph creation.
   */
  static MAX_NESTED_SUBGRAPHS = 1000

  #rootGraph: LGraph

  /** Typed event target for subgraph lifecycle and IO slot changes. */
  declare readonly events: CustomEventTarget<SubgraphEventMap>

  /** Human-readable name shown in the editor and on `SubgraphNode` instances. */
  name: string = "Unnamed Subgraph"

  /** Fixed boundary node listing all subgraph inputs on the left side of the subgraph canvas. */
  readonly inputNode = new SubgraphInputNode(this)
  /** Fixed boundary node listing all subgraph outputs on the right side of the subgraph canvas. */
  readonly outputNode = new SubgraphOutputNode(this)

  /**
   * Ordered list of inputs exposed on the subgraph boundary.
   *
   * Each input connects from the parent graph into the subgraph interior (origin side in parent,
   * target side inside). Conceptually similar to a reroute.
   */
  readonly inputs: SubgraphInput[] = []
  /**
   * Ordered list of outputs exposed on the subgraph boundary.
   *
   * Each output connects from the subgraph interior to the parent graph (origin side inside,
   * target side in parent).
   */
  readonly outputs: SubgraphOutput[] = []
  /**
   * Node widgets promoted to the parent graph and displayed on `SubgraphNode` instances.
   */
  readonly widgets: ExposedWidget[] = []

  /**
   * @param rootGraph The root graph that registers and owns this subgraph definition.
   * @param data Serialised subgraph configuration used to populate IO slots, nodes, and layout.
   */
  constructor(
    rootGraph: LGraph,
    data: ExportedSubgraph,
  ) {
    if (!rootGraph) throw new Error("Root graph is required")

    super()

    this.#rootGraph = rootGraph

    const cloned = structuredClone(data)
    this._configureBase(cloned)
    this.#configureSubgraph(cloned)
  }

  #configureSubgraph(data: ISerialisedGraph & ExportedSubgraph | SerialisableGraph & ExportedSubgraph): void {
    const { name, inputs, outputs, widgets } = data

    this.name = name
    if (inputs) {
      this.inputs.length = 0
      for (const input of inputs) {
        const subgraphInput = new SubgraphInput(input, this.inputNode)
        this.inputs.push(subgraphInput)
        this.events.dispatch("input-added", { input: subgraphInput })
      }
    }

    if (outputs) {
      this.outputs.length = 0
      for (const output of outputs) {
        this.outputs.push(new SubgraphOutput(output, this.outputNode))
      }
    }

    // Repair IO slot linkIds that reference links removed by
    // _removeDuplicateLinks during super.configure().
    this.#repairIOSlotLinkIds()

    if (widgets) {
      this.widgets.length = 0
      for (const widget of widgets) {
        this.widgets.push(widget)
      }
    }

    this.inputNode.configure(data.inputNode)
    this.outputNode.configure(data.outputNode)
  }

  /**
   * Repairs SubgraphInput/Output `linkIds` that reference links removed
   * by `_removeDuplicateLinks` during `super.configure()`.
   *
   * For each stale link ID, finds the surviving link that connects to the
   * same IO node and slot index, and substitutes it.
   */
  #repairIOSlotLinkIds(): void {
    for (const [slotIndex, slot] of this.inputs.entries()) {
      this.#repairSlotLinkIds(slot.linkIds, SUBGRAPH_INPUT_ID, slotIndex)
    }
    for (const [slotIndex, slot] of this.outputs.entries()) {
      this.#repairSlotLinkIds(slot.linkIds, SUBGRAPH_OUTPUT_ID, slotIndex)
    }
  }

  #repairSlotLinkIds(
    linkIds: LinkId[],
    ioNodeId: number,
    slotIndex: number,
  ): void {
    const repaired = linkIds.map(id =>
      this.links.has(id)
        ? id
        : (this.#findLinkBySlot(ioNodeId, slotIndex)?.id ?? id))
    for (const [i, id] of repaired.entries()) {
      linkIds[i] = id
    }
  }

  #findLinkBySlot(
    nodeId: number,
    slotIndex: number,
  ): LLink | undefined {
    for (const link of this.links.values()) {
      if (
        (link.origin_id === nodeId && link.origin_slot === slotIndex) ||
        (link.target_id === nodeId && link.target_slot === slotIndex)
      ) {
        return link
      }
    }
  }

  /** The top-level `LGraph` that owns this subgraph definition in the registry. */
  override get rootGraph(): LGraph {
    return this.#rootGraph
  }

  /**
   * Returns the IO boundary node under the given canvas coordinates, if any.
   * @param x Canvas-space X coordinate.
   * @param y Canvas-space Y coordinate.
   * @returns The input or output boundary node at that position, or `undefined`.
   */
  getIoNodeOnPos(x: number, y: number): SubgraphInputNode | SubgraphOutputNode | undefined {
    const { inputNode, outputNode } = this
    if (inputNode.containsPoint([x, y])) return inputNode
    if (outputNode.containsPoint([x, y])) return outputNode
  }

  /**
   * Reconfigures this subgraph from serialised data.
   * @param data The serialised graph and subgraph metadata.
   * @param keep_old When `true`, merges with existing state instead of replacing it.
   * @returns The result of the base `LGraph.configure` call.
   */
  override configure(data: ISerialisedGraph & ExportedSubgraph | SerialisableGraph & ExportedSubgraph, keep_old?: boolean): boolean | undefined {
    const r = super.configure(data, keep_old)

    this.#configureSubgraph(data)
    return r
  }

  /**
   * Attaches a canvas and sets it as the active subgraph editor view.
   * @param canvas The canvas to attach.
   */
  override attachCanvas(canvas: LGraphCanvas): void {
    super.attachCanvas(canvas)
    canvas.subgraph = this
  }

  /**
   * Adds a new input slot to the subgraph boundary.
   *
   * Dispatches `"adding-input"` before creation and `"input-added"` after the slot is registered.
   * @param name Display name for the new input.
   * @param type Slot type string used for connection validation.
   * @returns The created `SubgraphInput`.
   */
  addInput(name: string, type: string): SubgraphInput {
    this.events.dispatch("adding-input", { name, type })

    const input = new SubgraphInput({
      id: createUuidv4(),
      name,
      type,
    }, this.inputNode)

    this.inputs.push(input)
    this.events.dispatch("input-added", { input })

    return input
  }

  /**
   * Adds a new output slot to the subgraph boundary.
   *
   * Dispatches `"adding-output"` before creation and `"output-added"` after the slot is registered.
   * @param name Display name for the new output.
   * @param type Slot type string used for connection validation.
   * @returns The created `SubgraphOutput`.
   */
  addOutput(name: string, type: string): SubgraphOutput {
    this.events.dispatch("adding-output", { name, type })

    const output = new SubgraphOutput({
      id: createUuidv4(),
      name,
      type,
    }, this.outputNode)

    this.outputs.push(output)
    this.events.dispatch("output-added", { output })

    return output
  }

  /**
   * Renames an input slot in the subgraph.
   * @param input The input slot to rename.
   * @param name The new name for the input slot.
   */
  renameInput(input: SubgraphInput, name: string): void {
    const index = this.inputs.indexOf(input)
    if (index === -1) throw new Error("Input not found")

    const oldName = input.displayName
    this.events.dispatch("renaming-input", { input, index, oldName, newName: name })

    input.label = name
  }

  /**
   * Renames an output slot in the subgraph.
   * @param output The output slot to rename.
   * @param name The new name for the output slot.
   */
  renameOutput(output: SubgraphOutput, name: string): void {
    const index = this.outputs.indexOf(output)
    if (index === -1) throw new Error("Output not found")

    const oldName = output.displayName
    this.events.dispatch("renaming-output", { output, index, oldName, newName: name })

    output.label = name
  }

  /**
   * Removes an input slot from the subgraph.
   * @param input The input slot to remove.
   */
  removeInput(input: SubgraphInput): void {
    input.disconnect()

    const index = this.inputs.indexOf(input)
    if (index === -1) throw new Error("Input not found")

    const mayContinue = this.events.dispatch("removing-input", { input, index })
    if (!mayContinue) return

    this.inputs.splice(index, 1)

    const { length } = this.inputs
    for (let i = index; i < length; i++) {
      this.inputs[i].decrementSlots("inputs")
    }
  }

  /**
   * Removes an output slot from the subgraph.
   * @param output The output slot to remove.
   */
  removeOutput(output: SubgraphOutput): void {
    output.disconnect()

    const index = this.outputs.indexOf(output)
    if (index === -1) throw new Error("Output not found")

    const mayContinue = this.events.dispatch("removing-output", { output, index })
    if (!mayContinue) return

    this.outputs.splice(index, 1)

    const { length } = this.outputs
    for (let i = index; i < length; i++) {
      this.outputs[i].decrementSlots("outputs")
    }
  }

  /**
   * Draws both IO boundary nodes on the subgraph canvas.
   * @param ctx The canvas rendering context.
   * @param colorContext Connection colour palette for slot rendering.
   * @param fromSlot When dragging a link, the slot being dragged (used for highlight validation).
   * @param editorAlpha Opacity multiplier for editor overlays.
   */
  draw(ctx: CanvasRenderingContext2D, colorContext: DefaultConnectionColors, fromSlot?: INodeInputSlot | INodeOutputSlot | SubgraphInput | SubgraphOutput, editorAlpha?: number): void {
    this.inputNode.draw(ctx, colorContext, fromSlot, editorAlpha)
    this.outputNode.draw(ctx, colorContext, fromSlot, editorAlpha)
  }

  /**
   * Clones the subgraph, creating an identical copy with a new ID.
   * @param keepId When `true`, preserves the original subgraph ID instead of generating a new one.
   * @returns A new subgraph with the same configuration.
   */
  clone(keepId: boolean = false): Subgraph {
    const exported = this.asSerialisable()
    if (!keepId) exported.id = createUuidv4()

    const subgraph = new Subgraph(this.rootGraph, exported)
    subgraph.configure(exported)
    return subgraph
  }

  /**
   * Serialises this subgraph definition for persistence or cloning.
   * @returns Exported subgraph data including nodes, groups, links, IO slots, and widgets.
   */
  override asSerialisable(): ExportedSubgraph & Required<Pick<SerialisableGraph, "nodes" | "groups" | "extra">> {
    return {
      id: this.id,
      version: LGraph.serialisedSchemaVersion,
      state: this.state,
      revision: this.revision,
      config: this.config,
      name: this.name,
      inputNode: this.inputNode.asSerialisable(),
      outputNode: this.outputNode.asSerialisable(),
      inputs: this.inputs.map(x => x.asSerialisable()),
      outputs: this.outputs.map(x => x.asSerialisable()),
      widgets: [...this.widgets],
      nodes: this.nodes.map(node => node.serialize()),
      groups: this.groups.map(group => group.serialize()),
      links: [...this.links.values()].map(x => x.asSerialisable()),
      reroutes: this.reroutes.size
        ? [...this.reroutes.values()].map(x => x.asSerialisable())
        : undefined,
      extra: this.extra,
    }
  }
}
