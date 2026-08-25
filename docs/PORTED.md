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
| [#13989](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13989) | 2026-08-25 | `19b1d8ce` | `src/utils/collections.ts`, `src/LGraphCanvas.ts` | `test/utils/collections.getDraggedItems.test.ts` |
| [#12867](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12867) | 2026-08-25 | `cb52a382` | Covered by #13989 (`getDraggedItems`); Vue-only group drag hunks skipped | `test/utils/collections.getDraggedItems.test.ts` |
| [#4928](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4928) | 2026-08-25 | `7972550f` | `src/LGraphCanvas.ts` | — |
| [#10229](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10229) | 2026-08-25 | `860d0494` | `src/Reroute.ts`, `src/LGraphCanvas.ts`, `src/subgraph/SubgraphIONodeBase.ts` | — |
| [#4913](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4913) | 2026-08-25 | `9c31d708` | `src/CanvasPointer.ts`, `src/LGraphCanvas.ts`, `src/LiteGraphGlobal.ts` | — |
| [#5092](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5092) | 2026-08-25 | `e7892274` | `src/CanvasPointer.ts` | `test/CanvasPointer.deviceDetection.test.ts` |
| [#5143](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5143) | 2026-08-25 | `ea9cb3cb` | `src/LGraphCanvas.ts` | — |
| [#9149](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9149) | 2026-08-25 | `e1193830` | `src/LGraphCanvas.ts` (`groupSelectChildren` default false) | `test/LGraphCanvas.groupSelection.test.ts` |
| [#5249](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5249) | 2026-08-25 | `c74c1c01` | `src/LGraphCanvas.ts` | — |
| [#5898](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5898) | 2026-08-25 | `4404c046` | `src/LGraphNode.ts` (vueNodesMode hunks skipped; drop-on-canvas already present) | — |
| [#7211](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7211) | 2026-08-25 | `795733b3` | `src/utils/type.ts`, `src/LGraphNode.ts` | — |
| [#4915](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4915) | 2026-08-25 | `90f54414` | `src/canvas/LinkConnector.ts` | — |
| [#13865](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13865) | 2026-08-25 | `0688d160` | Already via #15613; regression test added | `test/utils/widget.rename.test.ts` |
| [#5106](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5106) | 2026-08-25 | `1e9d4c7c` | `src/litegraph.ts` (export `TWidgetValue`) | — |
| [#5102](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5102) | 2026-08-25 | `28d74be3` | `src/LGraphNode.ts` | — |
| [#5053](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5053) | 2026-08-25 | `f0adb4c9` | `src/LGraphNode.ts` | `test/LGraphNode.removeSlot.test.ts` |
| [#9302](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9302) | 2026-08-25 | `f5363e40` | `src/subgraph/ExecutableNodeDTO.ts` | `test/subgraph/ExecutableNodeDTO.test.ts` |
| [#4864](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4864) | 2026-08-25 | `5f5f44b3` | `src/subgraph/ExecutableNodeDTO.ts` | — |
| [#6830](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6830) | 2026-08-25 | `49824824` | `src/node/NodeInputSlot.ts`, `src/interfaces.ts` | — |
| [#7042](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7042) | 2026-08-25 | `b50b34ac` | `src/LGraphNode.ts` | — |
| [#9808](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9808) | 2026-08-25 | `dc09eb60` | `src/utils/feedback.ts` | — |
| [#14474](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14474) | 2026-08-25 | `67da59c7` | `src/utils/colorUtil.ts`, `src/LGraphGroup.ts` | — |
| [#9839](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9839) | 2026-08-25 | `5f142761` | `src/LGraphGroup.ts` | — |
| [#9962](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9962) | 2026-08-25 | `a96c61d2` | `src/LGraphCanvas.ts` | — |
| [#15070](https://github.com/Comfy-Org/ComfyUI_frontend/pull/15070) | 2026-08-25 | `a8483a8a` | `src/measure.ts`, `src/LGraphGroup.ts` | `test/LGraphGroup.test.ts` |
| [#8275](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8275) | 2026-08-25 | `01362d5f` | `src/LGraphGroup.ts` | `test/LGraphGroup.test.ts` |
| [#11250](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11250) | 2026-08-25 | `e28c1e7e` | `src/node/NodeSlot.ts` | — |
| [#7220](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7220) | 2026-08-25 | `5139e056` | `public/css/litegraph.css`, `src/LiteGraphGlobal.ts`, `src/canvas/InputIndicators.ts`, `src/subgraph/SubgraphIONodeBase.ts` | — |
| [#5079](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5079) | 2026-08-25 | `0daacfd914` | `src/LGraphCanvas.ts`, `src/LGraphNode.ts` | `test/LGraphNode.onMouseDownOverride.test.ts`, `test/LGraphNode.titleButtons.test.ts`, `test/subgraph/SubgraphNode.titleButton.test.ts` |
| [#10825](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10825) | 2026-08-25 | `0b83926c3e` | `src/LGraph.ts` | `test/LGraph.zeroUuid.test.ts` |
| [#10392](https://github.com/Comfy-Org/ComfyUI_frontend/pull/10392) | 2026-08-25 | `b1e7d57308` | `src/LGraphNode.ts`, `src/LiteGraphGlobal.ts`, `src/types/serialisation.ts` (no Pinia/shadow-diff telemetry) | `test/LGraphNode.widgetsValuesNamed.test.ts` |
| [#11698](https://github.com/Comfy-Org/ComfyUI_frontend/pull/11698) | 2026-08-25 | `a441364a` | `src/LGraph.ts`, `src/LGraphNode.ts`, `src/LGraphCanvas.ts`, `src/widgets/BaseWidget.ts`, `src/subgraph/SubgraphInput.ts`, `src/subgraph/SubgraphInputNode.ts`, `src/subgraph/SubgraphOutput.ts` | — |
| [#7229](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7229) | 2026-08-25 | `248929c6` | `src/canvas/ToInputFromIoNodeLink.ts` | — |
| [#8777](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8777) | 2026-08-25 | `581452d3` | `src/canvas/ToInputFromIoNodeLink.ts` | `test/canvas/LinkConnectorSubgraphInputValidation.test.ts` |
| [#8342](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8342) | 2026-08-25 | `89571c7a` | `src/LGraphNode.ts` | `test/LGraphNode.test.ts` |
| [#4984](https://github.com/Comfy-Org/ComfyUI_frontend/pull/4984) | 2026-08-25 | `5224c63b` | `src/canvas/FloatingRenderLink.ts`, `src/canvas/LinkConnector.ts`, `src/canvas/MovingOutputLink.ts`, `src/canvas/ToOutputRenderLink.ts` | `test/canvas/LinkConnectorSubgraphInputValidation.test.ts` |
| [#8758](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8758) | 2026-08-25 | `a6620a4d` | `src/LGraph.ts`, `src/utils/graphTraversal.ts` | — |
| [#6606](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6606) | 2026-08-25 | `cfbd5361` | `src/LGraph.ts`, `src/LGraphNode.ts` | — |
| [#5708](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5708) | 2026-08-25 | `c9d74777` | `src/LGraph.ts`, `src/subgraph/subgraphUtils.ts` | — |
| [#6383](https://github.com/Comfy-Org/ComfyUI_frontend/pull/6383) | 2026-08-25 | `6f068c87` | `src/LGraphCanvas.ts`, `src/subgraph/SubgraphNode.ts` | — |
| [#8094](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8094) | 2026-08-25 | `a6b6857e` | `src/LGraphCanvas.ts`, `src/utils/graphTraversal.ts` | — |
| [#7103](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7103) | 2026-08-25 | `379af286` | `src/LGraphCanvas.ts` | — |
| [#8602](https://github.com/Comfy-Org/ComfyUI_frontend/pull/8602) | 2026-08-25 | `3adecc4d` | `src/contextMenuCompat.ts` | `test/contextMenuCompat.test.ts` |
| [#9332](https://github.com/Comfy-Org/ComfyUI_frontend/pull/9332) | 2026-08-25 | `82556f02` | `src/measure.ts`, `src/LGraph.ts`, `src/LGraphCanvas.ts` | `test/measure.test.ts` |
| [#14707](https://github.com/Comfy-Org/ComfyUI_frontend/pull/14707) | 2026-08-25 | `b1861ab4` | `src/subgraph/SubgraphNode.ts` | — |
| [#5637](https://github.com/Comfy-Org/ComfyUI_frontend/pull/5637) | 2026-08-25 | `eb664f47` | Already addressed by copy-based promoted widgets (empty commit) | — |
| [#13809](https://github.com/Comfy-Org/ComfyUI_frontend/pull/13809) | 2026-08-25 | `f21a7583` | `src/LGraph.ts` (host widget snapshot already present) | `test/subgraph/SubgraphNestedPackPromotedValues.test.ts` |