# Ported upstream PRs

PRs from [ComfyUI_frontend `src/lib/litegraph`](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/lib/litegraph) applied to this standalone repo.

| PR | Date | Upstream commit | Local changes | Tests |
|----|------|-----------------|---------------|-------|
| [#8887](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8887) | 2026-08-25 | `2ee0a133` | `src/ContextMenu.ts` (`dompurify`) | `test/ContextMenu.test.ts` |
| [#14928](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14928) | 2026-08-25 | `b2196945` | `src/LGraphCanvas.ts` (`dompurify`) | `test/LGraphCanvas.xss.test.ts` |
| [#9263](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9263) | 2026-08-25 | `df712953` | `src/utils/mathParser.ts`, `src/utils/widget.ts`, `src/widgets/NumberWidget.ts`, `src/litegraph.ts` | `test/utils/mathParser.test.ts`, `test/utils/widget.test.ts` |
| [#9120](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9120) | 2026-08-25 | `87171511` | `src/LGraph.ts`, `src/node/slotUtils.ts` | `test/LGraph.duplicateLinks.test.ts`, `test/node/slotUtils.test.ts` |
| [#10289](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10289) | 2026-08-25 | `35915791` | `src/LGraph.ts` | `test/LGraph.duplicateLinks.test.ts` |
| [#8694](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8694) | 2026-08-25 | `0e3314bb` | `src/LGraph.ts`, `src/LGraphCanvas.ts`, `src/interfaces.ts` | `test/LGraphCanvas.ghost.test.ts` |
| [#10308](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10308) | 2026-08-25 | `be6c64c7` | `src/canvas/AutoPanController.ts`, `src/LGraphCanvas.ts` | `test/LGraphCanvas.ghost.test.ts` |
| [#11779](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11779) | 2026-08-25 | `b8dfbfc0` | `src/LGraphCanvas.ts` | `test/LGraphCanvas.ghost.test.ts` |
| [#12031](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12031) | 2026-08-25 | `90fd05f4` | `src/LGraphCanvas.ts` | `test/LGraphCanvas.ghost.test.ts` |
| [#15613](https://github.com/Comfy-Org/ComfyUI_frontend/pull/15613) | 2026-08-25 | `75c6d4bd` | `src/LGraphNode.ts`, `src/utils/widget.ts` (sync labels on configure; no Pinia) | `test/LGraph.configureStoreScope.test.ts`, `test/utils/widget.rename.test.ts` |
| [#10314](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10314) | 2026-08-25 | `28a91fa8` | `src/LGraph.ts`, `src/subgraph/Subgraph.ts`, `src/subgraph/subgraphDeduplication.ts` | `test/subgraph/subgraphDeduplication.test.ts` |
| [#10187](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10187) | 2026-08-25 | `15442e7f` | `src/subgraph/SubgraphNode.ts`, `src/interfaces.ts` | `test/subgraph/SubgraphNode.reconfigure.test.ts` |
| [#10020](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10020) | 2026-08-25 | `918095f1` | `src/subgraph/SubgraphNode.ts` | `test/subgraph/SubgraphNode.duplicateInputPruning.test.ts` |
| [#10532](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10532) | 2026-08-25 | `d940ea76` | `src/LGraph.ts`, `src/subgraph/SubgraphNode.ts`, `src/subgraph/SubgraphInputNode.ts` (no Pinia promotion store; snapshot + rebind) | `test/subgraph/SubgraphNestedPackPromotedValues.test.ts` |
| [#12473](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12473) | 2026-08-25 | `b7990f76` | `src/subgraph/SubgraphIONodeBase.ts` | `test/subgraph/SubgraphIOSlotContextMenu.test.ts` |
| [#11804](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11804) | 2026-08-25 | `395b0a1c` | `src/LGraph.ts`, `src/infrastructure/LGraphEventMap.ts`, `src/subgraph/SubgraphNode.ts` | `test/LGraph.nodeBeforeRemoved.test.ts`, `test/subgraph/SubgraphNode.test.ts` |
| [#8259](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8259) | 2026-08-25 | `4337b8d6` | `src/LGraphCanvas.ts` | `test/LGraphCanvas.auxclick.test.ts` |
| [#4831](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4831) | 2026-08-25 | `16d74368` | `src/LGraphCanvas.ts` | `test/LGraphCanvas.linkHitDetection.test.ts` |
| [#7153](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7153) | 2026-08-25 | `f800c409` | `src/LGraphNode.ts`, `src/subgraph/SubgraphOutput.ts` | `test/subgraph/SubgraphOutputZombieLinkIds.test.ts` |
| [#5407](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5407) | 2026-08-25 | `c2eb4f03` | (already via #11804 `fireNodeRemovalLifecycle` in `clear()`) | `test/LGraph.nodeBeforeRemoved.test.ts` |
| [#9404](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9404) | 2026-08-25 | `79d0e6dc` | `src/utils/textMeasureCache.ts`, `src/LGraphCanvas.ts`, `src/draw.ts`, `src/utils/textUtils.ts`, `src/widgets/BaseWidget.ts`, `src/LGraphBadge.ts`, `src/LGraphButton.ts`, `src/LGraphNode.ts` | `test/utils/textMeasureCache.test.ts` |
| [#9171](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9171) | 2026-08-25 | `bcc47064` | `src/cursorCache.ts`, `src/LGraphCanvas.ts` | `test/cursorCache.test.ts` |
| [#4863](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4863) | 2026-08-25 | `5cc269ef` | `src/LGraphCanvas.ts` (follow-up to #4831: scale `isPointInStroke` by DPR) | `test/LGraphCanvas.linkHitDetection.test.ts` |
| [#4840](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4840) | 2026-08-25 | `db713657` | `src/LGraph.ts`, `src/node/slotLinks.ts`, `src/subgraph/subgraphUtils.ts`, `src/constants.ts`, `src/LGraphCanvas.ts` (current upstream unpack + menu; includes #4964/#7791/#9046/#9120 unpack fixes) | `test/subgraph/SubgraphConversion.test.ts` |
| [#9510](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9510) | 2026-08-25 | `0b73285c` | `src/LGraph.ts`, `src/subgraph/subgraphDeduplication.ts` | `test/subgraph/subgraphNodeIdDeduplication.test.ts` |
| [#5023](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5023) | 2026-08-25 | `e9ddf295` | `src/subgraph/SubgraphNode.ts` | — |
| [#5003](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5003) | 2026-08-25 | `fdd8564c` | `src/LGraphCanvas.ts` | — |
| [#4911](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4911) | 2026-08-25 | `2c215a62` | `src/subgraph/Subgraph.ts` | — |
| [#4800](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4800) | 2026-08-25 | `db452c1e` | `src/canvas/ToInputFromIoNodeLink.ts`, `src/canvas/LinkConnector.ts` | — |
| [#6258](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6258) | 2026-08-25 | `5897e007` | `src/canvas/ToInputFromIoNodeLink.ts` | `test/subgraph/SubgraphIO.test.ts` |
| [#12619](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12619) | 2026-08-25 | `d7f0d75e` | `src/canvas/RenderLink.ts`, `src/canvas/MovingInputLink.ts`, `src/canvas/ToInputFromIoNodeLink.ts`, `src/canvas/LinkConnector.ts`, `src/LGraphCanvas.ts` | — |
| [#5237](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5237) | 2026-08-25 | `b515ef0a` | `src/subgraph/ExecutableNodeDTO.ts` | — |
| [#5723](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5723) | 2026-08-25 | `687b9e65` | `src/LLink.ts` | — |
| [#7459](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7459) | 2026-08-25 | `d7546e68` | `src/LGraphCanvas.ts` | — |
| [#9896](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9896) | 2026-08-25 | `74a48ab2` | `src/strings.ts`, `src/subgraph/SubgraphInputNode.ts` (litegraph-only; no Pinia/Vue) | `test/subgraph/SubgraphIO.test.ts` |
| [#9304](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9304) | 2026-08-25 | `a9f9afd0` | `src/LGraphCanvas.ts` | `test/LGraphCanvas.renderInfo.test.ts` |
| [#12491](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12491) | 2026-08-25 | `d86483a6` | `src/utils/pointerUtils.ts`, `src/LGraphCanvas.ts`, `src/canvas/InputIndicators.ts` | — |
| [#5115](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5115) | 2026-08-25 | `4db9e3d7` | `src/LGraphCanvas.ts`, `src/canvas/LinkConnector.ts` | — |
| [#4879](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4879) | 2026-08-25 | `8f289c8e` | `src/LGraphCanvas.ts` | — |
| [#8772](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8772) | 2026-08-25 | `157f0598` | `src/canvas/ToInputFromIoNodeLink.ts`, `src/infrastructure/SubgraphInputEventMap.ts`, `src/subgraph/SubgraphInput.ts`, `src/subgraph/SubgraphNode.ts` | — |
| [#4833](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4833) | 2026-08-25 | `7bbbf597` | `src/subgraph/SubgraphIONodeBase.ts`, `src/subgraph/SubgraphInputNode.ts`, `src/subgraph/SubgraphOutputNode.ts` | — |
| [#12575](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12575) | 2026-08-25 | `1938ba80` | `src/LGraph.ts` | — |
| [#10195](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10195) | 2026-08-25 | `657ae6a6` | `src/LGraphNode.ts`, `src/LGraphCanvas.ts`, `src/subgraph/SubgraphNode.ts` (no Pinia/PromotedWidgetViewManager) | `test/LGraphCanvas.drawConnections.test.ts` |
| [#6661](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6661) | 2026-08-25 | `bc553f12` | `src/LGraphNode.ts` (`spliceInputs`, configure `widgets_values` by index) | — |
| [#6752](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6752) | 2026-08-25 | `a832141a` | Already present via #15613 (`syncWidgetLabelsFromInputs` in configure) | `test/LGraph.configureStoreScope.test.ts`, `test/utils/widget.rename.test.ts` |