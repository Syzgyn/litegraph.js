import type { LGraphEventMap } from "./LGraphEventMap"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphNode } from "@/subgraph/SubgraphNode"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { IBaseWidget } from "@/types/widgets"

/**
 * Strongly-typed event map for `Subgraph` IO and widget promotion lifecycle.
 *
 * Extends `LGraphEventMap` with events fired when subgraph inputs/outputs are added,
 * removed, or renamed, and when internal widgets are promoted to the subgraph node surface.
 *
 * Listen on `Subgraph.events`.
 * @see `Subgraph`
 * @see `LGraphEventMap`
 */
export interface SubgraphEventMap extends LGraphEventMap {
  /**
   * A new subgraph input slot is about to be created.
   *
   * Dispatched before the `SubgraphInput` instance is added; listeners may observe or
   * validate the proposed name and type.
   */
  "adding-input": {
    /** Display name for the new input. */
    name: string
    /** Slot type string (e.g. `"number"`, `"string"`). */
    type: string
  }

  /** A new subgraph output slot is about to be created. */
  "adding-output": {
    name: string
    type: string
  }

  /** A subgraph input slot was added and is now available on the subgraph node. */
  "input-added": {
    input: SubgraphInput
  }

  /** A subgraph output slot was added and is now available on the subgraph node. */
  "output-added": {
    output: SubgraphOutput
  }

  /** A subgraph input slot is about to be removed. */
  "removing-input": {
    input: SubgraphInput
    /** Index of the input in the subgraph's input list. */
    index: number
  }

  /** A subgraph output slot is about to be removed. */
  "removing-output": {
    output: SubgraphOutput
    index: number
  }

  /** A subgraph input slot is being renamed. */
  "renaming-input": {
    input: SubgraphInput
    index: number
    oldName: string
    newName: string
  }

  /** A subgraph output slot is being renamed. */
  "renaming-output": {
    output: SubgraphOutput
    index: number
    oldName: string
    newName: string
  }

  /**
   * An internal node widget was promoted to appear on the `SubgraphNode`.
   *
   * Allows UI layers to expose widget controls on the collapsed subgraph instance.
   */
  "widget-promoted": {
    widget: IBaseWidget
    subgraphNode: SubgraphNode
  }

  /** A previously promoted widget was removed from the subgraph node surface. */
  "widget-demoted": {
    widget: IBaseWidget
    subgraphNode: SubgraphNode
  }
}
