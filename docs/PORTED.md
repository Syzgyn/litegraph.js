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