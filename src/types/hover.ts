import type { INodeInputSlot, INodeOutputSlot, LinkSegment } from "@/interfaces"
import type { LGraphNode } from "@/LGraphNode"
import type { Reroute } from "@/Reroute"
import type { SubgraphInput } from "@/subgraph/SubgraphInput"
import type { SubgraphInputNode } from "@/subgraph/SubgraphInputNode"
import type { SubgraphOutput } from "@/subgraph/SubgraphOutput"
import type { SubgraphOutputNode } from "@/subgraph/SubgraphOutputNode"
import type { IBaseWidget } from "@/types/widgets"

/** Discriminated union describing what is currently under the pointer. */
export type HoverTarget =
  | HoverTargetTitle |
  HoverTargetInput |
  HoverTargetOutput |
  HoverTargetWidget |
  HoverTargetLink |
  HoverTargetReroute |
  HoverTargetSubgraphInput |
  HoverTargetSubgraphOutput

export interface HoverTargetTitle {
  kind: "title"
  node: LGraphNode
}

export interface HoverTargetInput {
  kind: "input"
  node: LGraphNode
  slot: INodeInputSlot
  index: number
}

export interface HoverTargetOutput {
  kind: "output"
  node: LGraphNode
  slot: INodeOutputSlot
  index: number
}

export interface HoverTargetWidget {
  kind: "widget"
  node: LGraphNode
  widget: IBaseWidget
}

export interface HoverTargetLink {
  kind: "link"
  link: LinkSegment
}

export interface HoverTargetReroute {
  kind: "reroute"
  reroute: Reroute
  /** Which reroute slot affordance is hovered, when only one side matches. */
  side: "input" | "output" | "both"
}

export interface HoverTargetSubgraphInput {
  kind: "subgraph-input"
  ioNode: SubgraphInputNode
  slot: SubgraphInput
  index: number
}

export interface HoverTargetSubgraphOutput {
  kind: "subgraph-output"
  ioNode: SubgraphOutputNode
  slot: SubgraphOutput
  index: number
}

/** Returns whether two hover targets refer to the same canvas item. */
export function hoverTargetsEqual(
  a: HoverTarget | null | undefined,
  b: HoverTarget | null | undefined,
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false

  if (a.kind !== b.kind) return false

  switch (a.kind) {
    case "title":
      return a.node === (b as HoverTargetTitle).node
    case "input":
      return a.node === (b as HoverTargetInput).node && a.index === (b as HoverTargetInput).index
    case "output":
      return a.node === (b as HoverTargetOutput).node && a.index === (b as HoverTargetOutput).index
    case "widget":
      return a.node === (b as HoverTargetWidget).node && a.widget === (b as HoverTargetWidget).widget
    case "link":
      return a.link === (b as HoverTargetLink).link
    case "reroute":
      return a.reroute === (b as HoverTargetReroute).reroute
    case "subgraph-input":
      return a.ioNode === (b as HoverTargetSubgraphInput).ioNode &&
        a.index === (b as HoverTargetSubgraphInput).index
    case "subgraph-output":
      return a.ioNode === (b as HoverTargetSubgraphOutput).ioNode &&
        a.index === (b as HoverTargetSubgraphOutput).index
    default:
      return false
  }
}
