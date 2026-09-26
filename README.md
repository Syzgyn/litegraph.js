# @syzgyn/litegraph

A TypeScript graph node editor for the browser (Canvas2D), similar to Unreal Blueprints or Pure Data. This repository is a **standalone fork** of the final [Comfy-Org/litegraph.js](https://github.com/Comfy-Org/litegraph.js) release (`v0.17.2`, August 2025).

The official Comfy package was [archived](https://github.com/Comfy-Org/litegraph.js) and merged into [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/lib/litegraph). Active Comfy development no longer ships as a separate npm library. **This fork is a zero–ComfyUI-app-dependency package** while selectively porting bug fixes and features from the frontend subtree.

- **This repo:** [https://github.com/Syzgyn/litegraph.js](https://github.com/Syzgyn/litegraph.js)  
- **Historical baseline:** `v0.17.2` (`a7aa83b`) — last Comfy standalone release  
- **Upstream for ports:** ComfyUI_frontend `src/lib/litegraph/`
- **Port log:** [docs/PORTED.md](./docs/PORTED.md) (~90 PRs)
- **Gap analysis:** [docs/upstream-comparison.md](./docs/upstream-comparison.md)

![Node Graph](imgs/node_graph_example.png "Node graph example")

## How this fork differs from Comfy-Org `v0.17.2`

Roughly **190 commits** since the archived release: **~98 upstream PR imports** plus **~80 fork-specific** changes (features, fixes, tooling, and tests).

### Upstream ports (ComfyUI_frontend)

Patches are transplanted without Pinia, Vue, or Comfy app stores. Highlights by area:


| Area                 | Examples of what was ported                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security**         | Context menu and properties-panel XSS fixes; `eval()` removed from widget math (`[mathParser](./src/utils/mathParser.ts)`)                         |
| **Subgraphs**        | Unpacking, nested configure order, duplicate link removal, promoted-widget stability, IO slot UX, clipboard ID remapping, navigation fixes         |
| **Canvas & input**   | Ghost node placement (with cleanup/autopan), high-DPI reroutes, d3-friendly wheel zoom, group drag fixes, link hit-testing, autopan while dragging |
| **Serialization**    | `widgets_values_named`, zero-UUID graphs, stale widget labels on reload, `node:before-removed` lifecycle                                           |
| **Nodes & widgets**  | Dynamic widgets, rename sync, growable inputs, slot APIs, muted execution behavior                                                                 |
| **Groups & drawing** | Contrasting titles, grid snap, `cachedMeasureText`, cursor cache, multitype link colors                                                            |


See [docs/PORTED.md](./docs/PORTED.md) for the full PR table with local file mappings and tests.

**Intentionally not ported** (require ComfyUI infrastructure or a different architecture): Pinia widget/link stores, Vue node renderer, link-only widget promotion (ADR 0009), ECS migration, and Comfy-specific widget types. Details in [docs/upstream-comparison.md](./docs/upstream-comparison.md).

### Fork-only enhancements

Features and fixes added on top of the port baseline:

- `GraphHistory` — undo/redo for graph edits (including widget values, group resize, subgraph pack/unpack, context-menu title/color changes)
- `TextPreviewWidget` — multiline text preview with correct DOM visibility across graphs and hidden canvas
- **Hover & viewport APIs** — `litegraph:hover-change`, `litegraph:viewport-change`, hover anchor geometry for DOM overlays (`[examples/dom-tooltips.ts](./examples/dom-tooltips.ts)`)
- **Placement & canvas options** — `followCursorWhenAddingNodes`, `colorWidgetUpdateOnInput`, global link colors, optional **d3-zoom** wheel/pinch handler
- **Widgets** — Color widget (from upstream Comfy), `displayCallback`, `BaseWidget.normalizedValue`, Combo labeled entries and numeric values, panel/property precision and clamping
- **Subgraphs** — back navigation, boundary slot removal when links disconnect, canvas refocus and history entries on create/unpack
- **Events** — `litegraph:before-draw-nodes`, connection-change notifications with gesture deferral
- **Quality** — high-DPI canvas scaling fix, camelCase API cleanup, TypeScript 6 / ESLint 10 toolchain, expanded Vitest coverage under `test/`



### Dependencies

The archived `v0.17.2` release had **no runtime dependencies**. This fork adds small, focused runtime deps:


| Package                   | Role                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `dompurify`               | Sanitize HTML in context menus and the properties panel           |
| `d3-selection`, `d3-zoom` | Optional high-quality wheel/pinch zoom (`LGraphCanvas.useD3Zoom`) |


**PrimeIcons** font files are bundled for slot/input indicators ([NOTICE](./NOTICE)).

## Inherited from the Comfy fork (pre–`v0.17.2`)

This line of development already diverged from [jagenjo/litegraph.js](https://github.com/jagenjo/litegraph.js) before archival: full TypeScript rewrite, ComfyUI workflow features, subgraph support, and many API changes. It is **not** drop-in compatible with the original library. Early Comfy-Org changelog items (custom events, combo truncation, serialization ordering, batch link moves, etc.) remain part of the baseline.

## Features

- Renders on Canvas2D (zoom, pan, hundreds of nodes)
- Editor: search box, shortcuts, multi-select, context menus
- Customizable theme, node shapes, widgets, and draw callbacks
- Subgraph editing with pack/unpack
- Graph execution usable in Node.js (minus browser-only nodes)
- TypeScript types and barrel export from `litegraph`



## Installation

```bash
npm install @syzgyn/litegraph
```

CSS and fonts:

```ts
import "@syzgyn/litegraph/style.css"
```



## How to code a new node type

```ts
import { LiteGraph, LGraphNode } from "@syzgyn/litegraph"

class MyAddNode extends LGraphNode {
  title = "Sum"

  constructor() {
    this.addInput("A", "number")
    this.addInput("B", "number")
    this.addOutput("A+B", "number")
    this.properties.precision = 1
  }

  onExecute() {
    const A = this.getInputData(0) ?? 0
    const B = this.getInputData(1) ?? 0
    this.setOutputData(0, A + B)
  }
}

LiteGraph.registerNodeType("basic/sum", MyAddNode)
```



## Server side

Works in Node.js for graph logic; audio/graphics/input nodes may require a browser.

```ts
import { LiteGraph, LGraph } from "@syzgyn/litegraph"

const graph = new LGraph()
const firstNode = LiteGraph.createNode("basic/sum")
graph.add(firstNode)
const secondNode = LiteGraph.createNode("basic/sum")
graph.add(secondNode)
firstNode.connect(0, secondNode, 1)
graph.start()
```



## Projects using litegraph



### [ComfyUI](https://github.com/comfyanonymous/ComfyUI)

ComfyUI historically consumed `@comfyorg/litegraph`; current Comfy builds embed litegraph from ComfyUI_frontend instead.

Projects using the original jagenjo/litegraph.js

### [webglstudio.org](http://webglstudio.org)

![WebGLStudio](imgs/webglstudio.gif "WebGLStudio")

### [MOI Elephant](http://moiscript.weebly.com/elephant-systegraveme-nodal.html)

![MOI Elephant](imgs/elephant.gif "MOI Elephant")

### Mynodes

![MyNodes](imgs/mynodes.png "MyNodes")

## Development

Runtime dependencies are listed above; dev tooling uses Node.js 20+.

```bash
npm install
npm run build      # tsc + vite
npm run test       # vitest
npm run typecheck
npm run lint:fix
```



### Porting from ComfyUI_frontend

Use the [comfy-port skill](./.cursor/skills/comfy-port/SKILL.md) workflow: patch-port PRs from `src/lib/litegraph/`, reimplement Comfy-only pieces in local classes, and record the result in [docs/PORTED.md](./docs/PORTED.md). Do not merge `comfyui/main` wholesale.

### Releasing

GitHub Actions can publish npm versions (see existing release workflow on the repository). Bump version in `package.json` per semver when cutting releases.

## Feedback

Open an issue on [https://github.com/Syzgyn/litegraph.js/issues](https://github.com/Syzgyn/litegraph.js/issues).

For bugs that also affect embedded ComfyUI litegraph, [ComfyUI_frontend issues](https://github.com/Comfy-Org/ComfyUI_frontend/issues) remain relevant upstream.

## License

MIT — see [LICENSE](./LICENSE). Third-party notices: [NOTICE](./NOTICE).

### Contributors

[Comfy-Org/litegraph.js contributors](https://github.com/Comfy-Org/litegraph.js/graphs/contributors) and fork contributors on GitHub.

Contributors to the original jagenjo/litegraph.js

- atlasan
- kriffe
- rappestad
- InventivetalentDev
- NateScarlet
- coderofsalvation
- ilyabesk
- gausszhou

