---
name: comfy-port
description: Ports a ComfyUI_frontend pull request into this standalone litegraph.js repo, matching upstream diffs as closely as possible (same files and hunks, path/import adaptations only). Fetches PR diffs from Comfy-Org/ComfyUI_frontend (src/lib/litegraph), reimplements Comfy-only deps without Pinia/Vue, asks before adding new npm packages, allows new tests when upstream has none, and runs typecheck, tests, and lint:fix. Use when the user asks to port a PR number, cherry-pick from ComfyUI, or apply an upstream litegraph fix.
---

# Comfy Port

Port **one** [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend) PR into this standalone repo. Do not merge `comfyui/main` and do not use `git cherry-pick` (different tree and path layout).

## Inputs

- **PR number** (required), e.g. `12031`
- Optional: upstream commit SHA if the user provides it

## Workflow

Copy this checklist and track progress:

```
Port progress (PR #____):
- [ ] Step 1: Fetch PR metadata and diff
- [ ] Step 2: Triage — portable?
- [ ] Step 2b: New third-party dependencies?
- [ ] Step 3: Map files and plan port
- [ ] Step 4: Apply minimal changes
- [ ] Step 5: Tests
- [ ] Step 6: Record port
- [ ] Step 7: Verify (typecheck, test, lint:fix)
```

### Step 1: Fetch PR metadata and diff

Ensure `gh` can reach GitHub and the comfyui remote exists:

```bash
git remote get-url comfyui 2>/dev/null || git remote add comfyui https://github.com/Comfy-Org/ComfyUI_frontend.git
git fetch comfyui --quiet
```

Inspect the PR:

```bash
gh pr view <PR> --repo Comfy-Org/ComfyUI_frontend --json title,body,mergeCommit,files,url
gh pr diff <PR> --repo Comfy-Org/ComfyUI_frontend -- src/lib/litegraph
```

If `gh` is unavailable, use the merge commit from `git log comfyui/main --oneline --grep="#<PR>"` and:

```bash
git show <merge-sha> --stat -- src/lib/litegraph/
git show <merge-sha> -- src/lib/litegraph/
```

Read [reference.md](reference.md) for path mapping and exclusion patterns.

### Step 2: Triage — is this PR portable?

**Stop and report to the user** (do not port) if the PR:

- Only touches files outside `src/lib/litegraph/`
- Depends on Pinia (`useWidgetValueStore`, `usePreviewExposureStore`, `useLinkStore`, `createTestingPinia`)
- Imports from `@/stores/*`, `@/types/*` (branded IDs), `@/i18n`, Vue renderer, or Comfy app code
- Is an architectural migration (ECS, WidgetValueStore, link-only promotion wholesale, Vue nodes)
- Is packaging/monorepo-only (import paths, removed `package.json`, eslint config in subtree)

**Proceed** if the PR is a focused bug fix or small feature in canvas/subgraph/link/widget logic that can be expressed with this repo's in-memory structures.

When a fix *uses* stores upstream but the *bug* applies here, **reimplement the intent** in `LGraph`, `LGraphNode`, `BaseWidget`, etc. — do not add Pinia.

Check `docs/upstream-comparison.md` for prior notes on this PR.

### Step 2b: New third-party dependencies?

Scan the PR diff for **new runtime dependencies** not already in this repo's `package.json`:

- `import ... from 'package-name'` / `require('package-name')` in ported files
- Upstream `package.json` / lockfile changes (ComfyUI root or former litegraph package)
- PR body "Dependencies" section

Compare against `package.json` — this project aims to stay **zero runtime dependencies**.

**If the PR introduces a new third-party package, stop and ask the user** before implementing (use `AskQuestion`):

1. **Add the dependency** — `npm install <package>` and port upstream usage as-is (or with path/import adaptations)
2. **Work around it** — reimplement with local code (preferred default for small utilities, e.g. DOMPurify → `sanitizeMenuHTML`)

Do not add packages to `package.json` or install anything until the user chooses. If they choose "work around", note the substitution in `docs/PORTED.md` — but still keep the port structurally close to upstream where possible.

**User:** Port PR 8887 → upstream adds `dompurify` in `ContextMenu.ts` → ask → user picks add dependency → apply upstream hunks in `src/ContextMenu.ts`.

### Step 3: Map files and plan port

| Upstream path | This repo |
|---------------|-----------|
| `src/lib/litegraph/src/**` | `src/**` |
| `src/lib/litegraph/src/**/*.test.ts` | `test/**` (prefer domain dirs, e.g. `test/subgraph/`) |
| `@/lib/litegraph/src/...` imports | `@/...` (this repo's alias) |
| `@/litegraph` barrel in tests | `@/litegraph` barrel |

**Import rewrite rules:**

- `@/lib/litegraph/src/X` → `@/X`
- Never introduce `@/stores/*`, `@/types/nodeId`, `pinia`, or `es-toolkit` unless already in this repo
- Never add a new npm package without Step 2b user approval
- Subgraph tests: import from `@/litegraph` barrel only (see `CLAUDE.md`)

List each upstream file → local target before editing. Apply the PR's diff to those files; avoid drive-by refactors.

### Step 4: Apply changes — match upstream closely

**Default: mirror the upstream PR diff as faithfully as possible.**

1. Touch the **same logical files** upstream changed — map `src/lib/litegraph/src/Foo.ts` → `src/Foo.ts`, not a new module unless upstream added one.
2. Apply upstream **hunks verbatim** where local code still matches; only edit what the PR edits.
3. Limit adaptations to what standalone requires:
   - Import path rewrites (`@/lib/litegraph/src/…` → `@/…`)
   - Replacing Comfy-only deps (Pinia, `@/stores/*`, `@/i18n`) with local equivalents
   - Project style required by ESLint/`CLAUDE.md` (quotes, formatting — use `lint:fix`)
4. **Do not** restructure upstream's solution (e.g. extracting helpers into new files upstream kept inline).
5. New source files only when upstream added them in the PR.
6. Export from `src/litegraph.ts` only if upstream exposes via the public API.

**Do not** run `git cherry-pick` or `git merge comfyui/main`.

### Step 5: Tests

1. If upstream added/updated test files in the PR, port them to `test/` (path + import adaptations only).
2. If upstream has **no tests**, adding a new `test/**/*.test.ts` is OK — cover the ported behavior without inventing extra structure.
3. Follow `.cursor/rules/unit-test.mdc`:
   - Use `test` from vitest, not `it`
   - Prefer `test.extend` over loose variables
   - Subgraph tests: use `createTestSubgraph` / `createTestSubgraphNode` from `test/subgraph/fixtures/subgraphHelpers`
4. Run **only the relevant test file(s)** first:

```bash
npm test -- test/path/to/port.test.ts --run
```

### Step 6: Record port

Append a row to `docs/PORTED.md` (create if missing):

```markdown
| PR | Date | Commit (upstream) | Local changes | Tests |
|----|------|-------------------|---------------|-------|
| [#12031](https://github.com/Comfy-Org/ComfyUI_frontend/pull/12031) | YYYY-MM-DD | `90fd05f` | `src/LGraphCanvas.ts` | `test/...` |
```

### Step 7: Verify (required)

Run in order; fix failures before finishing:

```bash
npm run typecheck
npm test -- <test-file(s)> --run
npm run lint:fix
```

- If no new test file, run the closest existing test for the touched area.
- Re-run `npm run typecheck` after `lint:fix` if eslint changes types-affecting code.
- Do not skip this step.

## Output

Summarize for the user:

1. PR title and link
2. What was ported and what was skipped (with reason)
3. Any new dependencies — what the user chose (add vs workaround)
4. Files changed
5. Test command run and result
6. Whether `docs/PORTED.md` was updated
7. If any notable changes were made to the resulting code compared to the upstream PR
8. A suggested Commit title and body

## Examples

**User:** Port PR 8887

1. `gh pr diff 8887 --repo Comfy-Org/ComfyUI_frontend`
2. Triage: `ContextMenu.ts` XSS fix — portable
3. Step 2b: upstream adds `dompurify` — ask user → add dependency
4. Apply upstream hunks in `src/ContextMenu.ts` (DOMPurify hook + `textContent`/`sanitizeMenuHTML` inline)
5. Add `test/ContextMenu.test.ts` (upstream has no tests)
6. `npm run typecheck && npm test -- test/ContextMenu.test.ts --run && npm run lint:fix`

**User:** Port PR 9263

1. `gh pr diff 9263 --repo Comfy-Org/ComfyUI_frontend`
2. Triage: adds `utils/mathParser.ts`, changes `utils/widget.ts` — portable
3. Copy upstream files to the mapped local paths; apply hunks as-is
4. Port upstream tests if present, else add `test/utils/mathParser.test.ts`
5. `npm run typecheck && npm test -- test/utils/mathParser.test.ts --run && npm run lint:fix`

**User:** Port PR 8594

1. Triage: introduces Pinia `WidgetValueStore` — **not portable**
2. Report to user; suggest porting only the underlying bug if they name one

## Additional resources

- Path mapping, exclusions, remote setup: [reference.md](reference.md)
- Upstream gap analysis: `docs/upstream-comparison.md`
- Project conventions: `CLAUDE.md`
