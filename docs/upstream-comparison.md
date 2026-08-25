# Upstream comparison: ComfyUI Frontend litegraph vs v0.17.2

Comparison of this standalone repo against the current litegraph subtree in [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/lib/litegraph).

| | |
|---|---|
| **Baseline** | `v0.17.2` (`a7aa83b`) — final standalone release (2025-08-05) |
| **Upstream** | `ComfyUI_frontend` `main` (snapshot: 2026-08-25) |
| **Method** | Git history on `src/lib/litegraph/`, plus source-tree diff of `src/` |

**Ported PRs** are ~~struck through~~ below. **[Won't do]** marks items we are not planning to port. See [PORTED.md](./PORTED.md) for local file mappings.

## Scope

**Included:** Graph editor behavior, canvas interaction, nodes/widgets, links, subgraphs, serialization, drawing, and security fixes that live in litegraph source.

**Excluded:**

- Packaging / monorepo migration (removed `package.json`, vite config, eslint in subtree, import path changes)
- ComfyUI app integration (Vue node renderer, Pinia stores, i18n, feature flags, cloud/billing, E2E harnesses)
- Comfy-specific widget/node types (Painter, ImageCrop, VideoEdit, compositor, asset browser, etc.)
- Changes that would require adopting ComfyUI's external store/type layers to work

## Scale of divergence

Upstream has continued actively after the subtree merge:

- **~320 commits** touching `src/lib/litegraph/src/` since the subtree was added
- **~200 functional commits** after filtering out tests, chores, and ComfyUI-only work
- **227 source files** differ from v0.17.2 (~+14,400 / −7,200 lines in the full tree including tests)

The upstream codebase is no longer a drop-in standalone library. Much of the post-v0.17.2 work assumes ComfyUI infrastructure (especially **Pinia-backed widget/preview/link stores** and **branded ID types** moved to `@/types/*`). Cherry-picking individual fixes is often possible; cherry-picking whole features usually is not.

---

## Changes by category

### Security

- ~~**Properties panel XSS** — malicious subgraph type names could execute script when the properties panel opens ([#14928](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14928))~~
- ~~**Context menu XSS** — `innerHTML` replaced with `textContent` for menu labels (malicious filenames) ([#8887](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8887))~~
- ~~**`eval()` removed from widget math** — new `mathParser.ts` recursive-descent parser for `evaluateInput()` ([#9263](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9263))~~

### Subgraphs

Upstream subgraph work is the largest area of change since v0.17.2.

**Major feature**

- **[Won't do] Link-only widget promotion (ADR 0009)** — promoted host widgets are defined by input links to interior nodes instead of duplicating widget state on `SubgraphNode` ([#12197](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12197)). Large architectural shift; depends on later store/refactor work.

**Serialization & configure fixes**

- ~~Configure nested subgraph definitions in **dependency order** ([#10314](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10314))~~
- **[Won't do] Normalize legacy `proxyWidget` entries** on configure ([#10573](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10573))
- ~~**Repoint promoted-widget bindings** when packing nested subgraphs ([#10532](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10532))~~
- **[Won't do] Prune stale `proxyWidgets` referencing nodes removed by nested subgraph packing** ([#10390](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10390))
- ~~**Prune orphaned `SubgraphNode` inputs** after configure ([#10020](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10020))~~
- ~~**Prevent input slots doubling** on nested subgraph reload ([#10187](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10187))~~
- ~~**Subgraph node ID deduplication** on workflow load ([#9510](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9510), experimental [#8762](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8762))~~
- ~~**Detect/remove duplicate links** during subgraph unpacking ([#9120](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9120))~~
- ~~**Implement subgraph unpacking** ([#4840](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4840))~~
- ~~**Deep-copy subgraphs to clipboard** with nested ID remapping on paste ([#5003](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5003))~~
- ~~Preserve nested subgraph widget values during serialization ([#5023](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5023))~~
- ~~Handle missing subgraph inputs gracefully on import ([#4985](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4985))~~ — already present locally
- ~~Subgraph reroute serialization fixes ([#4911](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4911))~~

**Runtime / interaction fixes**

- ~~**Ghost links after removing subgraph IO slots** — canvas not marked dirty for background layer ([#12473](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12473))~~
- ~~**NullGraphError on subgraph node removal** ([#11804](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11804))~~
- ~~Garbage-collect subgraph definitions when `SubgraphNode` removed; nullable `SubgraphNode.graph` ([#8187](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8187), [#8180](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8180))~~ — already via #11804
- ~~Fix disconnection of `subgraphInput` links ([#6258](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6258), [#4800](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4800))~~
- ~~Shift+click+drag from subgraph outputs ([#5115](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5115))~~
- ~~Alt+click-drag-copy of subgraph nodes ([#4879](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4879))~~
- ~~**Fast disconnect on subgraph IO** ([#12619](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12619))~~
- ~~Optional-input indicator on `SubgraphNode` inputs ([#8772](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8772))~~
- ~~Double-click to rename subgraph slot labels ([#4833](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4833))~~
- ~~Undo tracking on subgraph conversion ([#12575](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12575))~~

**Promoted-widget stability** (many iterations; some reverted/re-done)

- Per-instance promoted widget values ([#10849](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10849), later rolled back [#11790](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11790))
- ~~Stabilize promoted widget identity/rendering ([#9896](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9896))~~ — litegraph-only: unique empty-slot input names
- ~~Promoted widget input label rename ([#10195](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10195))~~
- ~~Fix pruning of uninitialized promoted primitives ([#11987](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11987))~~ — **[Won't do]** (upstream `proxyWidgets` model; local uses copy-based promotion)

### Canvas & input

- ~~**Ghost node placement cleanup** — document listeners / `isDragging` / auto-pan leaked when `ghostNodeId` cleared early ([#12031](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12031))~~
- ~~Escape / graph navigation cancels ghost placement ([#11779](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11779))~~
- ~~Edge autopan during ghost placement ([#10308](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10308))~~
- ~~Autopan when dragging nodes/links to canvas edges ([#8773](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8773))~~
- ~~**More robust drag cleanup** ([#13084](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13084))~~
- ~~Consolidated middle-button pan handling ([#12491](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12491))~~
- Move group without dragging inner nodes (Mac drag-navigation) ([#13989](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13989))
- Groups no longer drag children when Control held ([#12867](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12867))
- ~~Prevent middle-click paste duplicating workflow on Linux ([#8259](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8259))~~
- ~~Reroute creation on high-DPI ([#4831](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4831), [#4863](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4863))~~
- Middle-button link deletion from reroute nodes ([#4928](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4928))
- Snap offset for reroutes and subgraph IO ([#10229](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10229))
- High-resolution wheel / trackpad support ([#5092](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5092), [#4913](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4913))
- Cmd+wheel zoom on Mac ([#5143](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5143))
- Select group children on group click ([#9149](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9149))
- Adaptive LOD threshold ([#5249](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5249))
- Drop-on-canvas image handling and link-connector consolidation ([#5898](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5898))

### Links & connections

- ~~**`_removeDuplicateLinks` regression** — valid links removed when slot indices shift after widget-to-input conversion ([#10289](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10289))~~
- Extracted `linkDeduplication.ts` helpers (ties into Comfy link store)
- ~~**Zombie `linkIds` on node deletion** safety check ([#7153](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7153))~~
- ~~Fix broken links on bypass before reroute ([#5237](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5237))~~
- ~~Quick disconnect for moved input links ([#7459](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7459))~~
- ~~Fix reroute ID `0` treated as invalid ([#5723](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5723))~~
- Color links by common type ([#7211](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7211))
- Multiple links from reroute creating single `SubgraphOutputNode` slot ([#4915](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4915))

### Serialization & graph lifecycle

> **Note:** Many upstream fixes in this area assume `widgetValueStore` / `previewExposureStore` (Pinia). The underlying *bugs* are real for standalone litegraph too; the upstream *implementation* is not directly portable.

- ~~**Clear widget/preview store state for incoming graph id on `configure`** ([#15613](https://github.com/Comfy-Org/ComfyUI_frontend/pull/15613)) — stale widget labels survive reload~~
- Centralized **WidgetValueStore** (Comfy Pinia store; widget `.value` delegates to store) ([#8594](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8594))
- `widgets_values_named` serialization format ([#10392](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10392))
- Tolerate un-keyable widget ids in value store ([#13773](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13773))
- Assign valid id when root graph has zero UUID ([#10825](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10825))
- ~~`onNodeRemoved` not called when loading a new graph ([#5407](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5407))~~
- Do not delay fit-to-view on graph restore ([#7645](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7645))
- Restore `onMouseDown` override in node subclasses ([#5079](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5079))

### Nodes & widgets (canvas mode)

- Persist renamed widget labels via name-based input lookup ([#13865](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13865))
- Widget ordering consistency ([#5106](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5106))
- `removeWidget` invokes `onRemove` callback ([#5102](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5102))
- `removeInput` / `removeOutput` on nodes without graph reference ([#5053](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5053))
- Support dynamic widgets ([#6661](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6661))
- Support renaming widgets ([#6752](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6752))
- Return `undefined` for muted node output resolution ([#9302](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9302))
- Execution breaks on multi/any-type slots ([#4864](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4864))
- Growable inputs ([#6830](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6830))
- Expose `LGraphNode.getSlotPosition` ([#7042](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7042))
- Deprecation warning for `widget.inputEl` on STRING multiline widgets ([#9808](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9808))
- Many new widget implementations upstream (Color, Curve, Range, Markdown, MultiSelect, FileUpload, etc.) — mostly Comfy-driven

### Groups

- **Contrasting group title text** on colored group backgrounds ([#14474](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14474))
- Improved group title layout ([#9839](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9839))
- Fix `LGraphGroup` paste position ([#9962](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9962))
- Snap group borders to grid when fitting to nodes ([#15070](https://github.com/Comfy-Org/ComfyUI_frontend/pull/15070))
- `recomputeInsideNodes` nested group processing ([#8275](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8275))

### Drawing & performance

- ~~**`cachedMeasureText`** — cache `ctx.measureText` in draw loop ([#9404](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9404))~~
- ~~**`createCursorCache`** — avoid redundant DOM cursor writes ([#9171](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9171))~~
- Multitype slot color slices on shared-color links ([#11250](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11250))
- Font consistency pass ([#7220](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7220))
- ~~Avoid forced layout in `renderInfo` via `canvas.height` ([#9304](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9304))~~

### API & infrastructure (upstream-only patterns)

These improve upstream but are **not standalone-compatible as-is**:

- Widget values canonical in Pinia (`useWidgetValueStore`, `usePreviewExposureStore`)
- Link/reroute stores (`useLinkStore`) with `linkDeduplication.ts`, `LinkMap.ts`
- Branded IDs (`NodeId`, `LinkId`, `WidgetId`) relocated to `@/types/*`
- `litegraphInstance` singleton pattern vs exported `LiteGraph` global
- **[Won't do] ECS migration** (in progress, [#14246](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14246))
- `incrementVersion()` centralization ([#11698](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11698))
- ES private fields → TS `private` for Vue Proxy compatibility

### New standalone-friendly utilities (upstream only)

These files exist upstream and have **no Comfy imports** — good cherry-pick candidates:

| File | Purpose |
|------|---------|
| ~~`utils/mathParser.ts`~~ | ~~Safe arithmetic parsing (replaces `eval`) — ported via #9263~~ |
| ~~`utils/textMeasureCache.ts`~~ | ~~`measureText` result cache — ported via #9404~~ |
| ~~`cursorCache.ts`~~ | ~~DOM cursor write deduplication — ported via #9171~~ |
| `canvas/findRerouteAtPoint.ts` | Hit-testing helper extraction |

---

## Recommended to port

Prioritized for **bug fixes and behavioral improvements** that port cleanly to this standalone package without adopting ComfyUI stores or the Vue renderer.

### High priority — security & correctness

> ~~**Security XSS fixes ([#14928](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14928), [#8887](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8887))** — Small, isolated changes. Should be ported immediately.~~

> ~~**Replace `eval()` with `mathParser` ([#9263](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9263))** — Drop-in new file + small `widget.ts` change. Removes a real security footgun.~~

> ~~**`_removeDuplicateLinks` slot-index regression ([#10289](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10289))** — Requires duplicate-link removal from [#9120](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9120); deletes valid links on load without the fix.~~

> ~~**Ghost node placement listener leak ([#12031](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12031))** — Fixes stuck drag state and leaked document listeners. Canvas-only; no store dependency.~~

> ~~**Configure-time stale state ([#15613](https://github.com/Comfy-Org/ComfyUI_frontend/pull/15613))** — Widget labels survive reload; port logic without Pinia stores.~~

### High priority — subgraphs (if you maintain subgraph support)

> ~~**Ghost links on IO slot removal ([#12473](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12473))** — Simple dirty-canvas fix; visible user-facing bug.~~

> ~~**Nested subgraph configure dependency order ([#10314](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10314))** — Prevents configure-order bugs in deeply nested workflows.~~

> ~~**Prevent input slots doubling on reload ([#10187](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10187))** — Related to work already in v0.17.2; upstream hardening ported.~~

> ~~**Prune orphaned / stale promoted-widget state ([#10020](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10020), [#10532](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10532))** — High value for subgraph serialization stability.~~  
> **[Won't do]** [#10573](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10573), [#10390](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10390).

> ~~**NullGraphError on subgraph node removal ([#11804](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11804))** — Crash fix during removal/cleanup.~~

### Medium priority — canvas UX & robustness

> ~~**Escape cancels ghost placement ([#11779](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11779))** — Expected editor behavior; low risk.~~

> ~~**More robust drag cleanup ([#13084](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13084))** — Reduces stuck-interaction edge cases.~~

> ~~**Middle-click paste duplicate on Linux ([#8259](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8259))** — Platform-specific bug fix.~~

> ~~**Reroute creation on high-DPI ([#4831](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4831), [#4863](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4863))** — Common pain point on Retina displays.~~

> ~~**Zombie linkIds on node deletion ([#7153](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7153))** — Prevents orphaned link references.~~

> ~~**`onNodeRemoved` when loading new graph ([#5407](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5407))** — Lifecycle correctness for embedders listening to removal events.~~

### Medium priority — performance (easy wins)

> ~~**`textMeasureCache` + `cursorCache` ([#9404](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9404), [#9171](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9171))** — Self-contained utilities; measurable draw/interaction perf gain on large graphs.~~

### Lower priority / evaluate before porting

| Change | Status |
|--------|--------|
| **[Won't do] Link-only promotion (ADR 0009)** ([#12197](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12197)) | Large redesign; touches promotion model, migration, and stores |
| **[Won't do] WidgetValueStore architecture** ([#8594](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8594)) | Requires Pinia + Comfy types; opposite of standalone goals |
| ~~**Subgraph unpacking** ([#4840](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4840))~~, **[Won't do] group-node conversion** ([#4972](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4972)) | #4840 ported; #4972 not planned |
| ~~**Autopan / edge pan** ([#8773](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8773), [#10308](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10308))~~ | Ported |
| **New widget types** (Color, Curve, Range, etc.) | Comfy product features, not core library gaps |
| **[Won't do] ECS migration** ([#14246](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14246)) | In flux; not relevant to standalone canvas editor |

---

## Practical porting notes

1. **Prefer patch-porting over merging.** Upstream history is entangled with ComfyUI refactors. For each item, read the PR diff and transplant the minimal hunk into the equivalent v0.17.2 file.

2. **Test subgraph changes heavily.** This repo already has substantial subgraph tests (`test/subgraph/`). Use them when porting any configure/serialization fix.

3. **Watch for store assumptions.** If an upstream fix touches `useWidgetValueStore`, `useLinkStore`, or `@/types/*`, reimplement the intent against local in-memory structures instead of copying the patch verbatim.

4. **Upstream is the source of truth for ComfyUI.** This document is a map, not a merge plan. Track absorbed PRs in [PORTED.md](./PORTED.md) to avoid double-work.

---

*Generated by comparing `v0.17.2` in this repo to `ComfyUI_frontend` `main` `src/lib/litegraph/`.*
