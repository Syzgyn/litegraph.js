# Comfy Port — Reference

## Remote setup

```bash
git remote add comfyui https://github.com/Comfy-Org/ComfyUI_frontend.git
git fetch comfyui
```

This remote is for reading diffs only. Never merge `comfyui/main` into this repo.

## Path mapping

| Upstream | Standalone repo |
|----------|-----------------|
| `src/lib/litegraph/src/Foo.ts` | `src/Foo.ts` |
| `src/lib/litegraph/src/subgraph/Foo.ts` | `src/subgraph/Foo.ts` |
| `src/lib/litegraph/src/widgets/Foo.ts` | `src/widgets/Foo.ts` |
| `src/lib/litegraph/src/canvas/Foo.ts` | `src/canvas/Foo.ts` |
| `src/lib/litegraph/src/utils/Foo.ts` | `src/utils/Foo.ts` |
| `src/lib/litegraph/src/**/*.test.ts` | `test/**/*.test.ts` |
| `src/lib/litegraph/test/**` | `test/**` |

Upstream co-located tests (`src/LGraph.test.ts`) → move to `test/` when porting.

## Import rewriting

| Upstream import | Replace with |
|-----------------|--------------|
| `@/lib/litegraph/src/draw` | `@/draw` |
| `@/lib/litegraph/src/litegraph` | `@/litegraph` |
| `@/lib/litegraph/src/infrastructure/Rectangle` | `@/infrastructure/Rectangle` |
| `@/lib/litegraph/src/types/...` | `@/types/...` |
| `@/stores/widgetValueStore` | **Do not port** — use local widget/node state |
| `@/stores/linkStore` | **Do not port** — use `LGraph` link maps |
| `@/types/nodeId`, `@/types/linkId`, `@/types/widgetId` | `number` / `string` as in this repo |
| `@/i18n` | Literal strings or existing patterns in this repo |

## Exclusion signals (skip or reimplement)

**PR title/body/file patterns that usually mean not portable as-is:**

- `vue-nodes`, `Vue renderer`, `Vue context`, `vueNodes`
- `Pinia`, `widgetValueStore`, `previewExposureStore`, `linkStore`
- `ECS Migration`, `ECS Phase`
- `Comfy.Pointer`, feature flags, cloud, billing, e2e, Playwright
- `image compositor`, `VIDEO_EDIT`, `Painter`, `Asset Widget`, `asset browser`
- `widgets_values_named` + telemetry / shadow-diff
- `Brand local node`, `relocate UUID`, `NodeId out of litegraph`
- Packaging: `package.json`, `vite.config`, `tsconfig`, import path migration in subtree
- `lodash` / `es-toolkit` replacements (unless this repo already uses them)

## New third-party dependencies

During triage, flag any import from a package not listed in this repo's `package.json` `dependencies` or `devDependencies`.

**Stop and ask the user** (add dependency vs local workaround) before:

- Running `npm install`
- Adding entries to `package.json`
- Copying upstream code that `import`s the new package

Document the choice in `docs/PORTED.md` (e.g. "added `dompurify` per upstream").

## Porting principle

**Match upstream as closely as possible.** A port should look like the PR diff applied to this repo's paths — not a reimplementation.

| Do | Don't |
|----|-------|
| Same files upstream touched | Extract helpers into new files upstream didn't add |
| Apply PR hunks verbatim when context matches | Refactor surrounding code "while you're here" |
| Adapt imports and Comfy-only deps only | Change APIs or structure upstream left alone |
| Add `test/**` when upstream has no tests | Skip tests upstream included |

**Often portable:**

- Security (XSS, `eval` → math parser)
- `LGraphCanvas` drag/ghost/pan fixes
- Subgraph configure/serialization bookkeeping (without store calls)
- `textMeasureCache`, `cursorCache`, `mathParser` (new files, no Comfy deps)
- Drawing/performance caches
- Context menu `textContent` instead of `innerHTML`

## Finding the right commit

```bash
# By PR number in merge commit message
git log comfyui/main --oneline --grep="#<PR>" | head -5

# PR files list
gh pr view <PR> --repo Comfy-Org/ComfyUI_frontend --json files --jq '.files[].path' | grep litegraph

# Scoped diff
gh pr diff <PR> --repo Comfy-Org/ComfyUI_frontend -- src/lib/litegraph
```

Prefer the **squash/merge commit** on `comfyui/main`, not intermediate PR branch commits.

## Test conventions (this repo)

- Framework: vitest (`npm test`)
- Location: `test/` directory
- Subgraph: barrel import `{ LGraph, Subgraph, SubgraphNode } from "@/litegraph"`
- Helpers: `test/subgraph/fixtures/subgraphHelpers.ts`
- Style: `.cursor/rules/unit-test.mdc` — use `test`, prefer `test.extend`

## Verification commands

Always run after porting:

```bash
npm run typecheck
npm test -- <relevant-test-file> --run
npm run lint:fix
```

## Port ledger

Track completed ports in `docs/PORTED.md`:

```markdown
# Ported upstream PRs

| PR | Date | Upstream commit | Notes |
|----|------|-----------------|-------|
```
