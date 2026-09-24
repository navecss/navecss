/**
 * R11a: generates the consumer-theming CSS fixtures
 * `test/browser/tokens-free-entry.browser.test.ts` needs, GITIGNORED and regenerated before
 * every `test:browser` run (never committed — same treatment as `dist/`).
 *
 * Node-only, deliberately separate from the browser test itself: `emitCss`'s import chain
 * transitively pulls in `node:fs` (`emit.ts` -> `copy-lint.ts` -> `contrast.ts` ->
 * `adjacency.ts` -> `adjacency-source.ts` -> `tokens-source.ts`, which reads the shipped
 * `tokens.json`), so it cannot be bundled into a Vite browser test directly ("Module
 * 'node:fs' has been externalized for browser compatibility"). Running the real pipeline
 * here, Node-side, and handing the browser test only the resulting CSS TEXT (via a `?raw`
 * import Vite resolves at bundle time) is what keeps the browser test exercising the real,
 * unmodified `emitCss`/`runPipeline` output rather than a hand-typed stand-in for it.
 *
 * Each fixture is the DTCG-half shell (`formatCssTokens`, empty token list — this fixture
 * only needs its OWN copy of the cascade order statement, `@navecss/tokens`'s real
 * `tokens.css` is loaded separately where needed) plus the theming CSS appended, exactly the
 * shape `build.ts`/`build-step.ts`'s `withThemingLayer` composes for Nave's own build
 * (`file.content = \`${dtcgHalf}\n${themingCss}\``) and the shape the consumer-invocable
 * token build's façade will compose for a consumer's. Skipping the DTCG-half shell here (an
 * earlier version of this script did) silently drops its `@layer tokens.defaults,
 * tokens.presets, …;` STATEMENT, which is what
 * actually fixes the relative order of `tokens.presets` against `tokens.defaults` — without
 * it, whichever `@layer tokens.presets { … }` BLOCK is first encountered in the composed
 * document creates that layer at ITS position, which inverted the win in the
 * consumer-sheet-first order and is exactly the two-`:root`-blocks defect R10/R11 exist to
 * close (caught by this file's own browser test failing red for the right reason).
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Seeds } from '../../tokens/src/theming/pipeline.ts'

import { build } from '../../tokens/src/facade.ts'
import { formatCssTokens } from '../../tokens/src/formats.ts'
import { emitCss } from '../../tokens/src/theming/emit.ts'
import { runPipeline } from '../../tokens/src/theming/pipeline.ts'
import { DEFAULT_ENV } from '../../tokens/src/theming/ramp.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(HERE, '../test/browser/fixtures')

/**
 * Two seeds, both deliberately far from the shipped default (teal, hue ~186) so a passing
 * assertion against either cannot be explained by coincidentally matching Nave's own
 * defaults, and far from EACH OTHER so the differential assertions in the browser test (does
 * changing the seed change what renders) cannot pass by accident.
 */
const SEEDS: Record<string, Seeds> = {
  'consumer-a': {
    primary: { l: 0.55, c: 0.14, h: 275 },
    danger: { l: 0.6, c: 0.2, h: 20 },
    declaredTintHue: 275,
  },
  'consumer-b': {
    primary: { l: 0.6, c: 0.16, h: 40 },
    danger: { l: 0.6, c: 0.2, h: 20 },
    declaredTintHue: 40,
  },
}

mkdirSync(FIXTURES_DIR, { recursive: true })

for (const [name, seeds] of Object.entries(SEEDS)) {
  const dtcgHalf = formatCssTokens([], 'tokens.presets')
  const { css: themingHalf } = emitCss(runPipeline(seeds, {}, DEFAULT_ENV), 'tokens.presets')
  writeFileSync(path.join(FIXTURES_DIR, `${name}.css`), `${dtcgHalf}\n${themingHalf}`, 'utf8')
}

/**
 * `AC-token-build-10` (R11), for the registration-COUNT pinning row added in the
 * consumer-invocable token build's Phase 3 review. The two fixtures above are the THEMING
 * HALF alone, which is all the R11a render assertions turn on; the count turns on the WHOLE
 * artifact, both halves, because
 * it is the DTCG half that carries the bulk of the `@property` registrations. So this runs the
 * real `build` façade — the consumer-invocable entry point itself, default bundled source,
 * every artifact it writes — and takes its `tokens.css`, which is the file R7 tells a consumer
 * to COMMIT and therefore the one they compose with `@navecss/core`.
 *
 * Written into a throwaway temp directory and copied in, so nothing about this script's own
 * output shape depends on `build`'s other six artifacts.
 */
const scratchRoot = mkdtempSync(path.join(tmpdir(), 'nave-consumer-build-'))
const consumerBuildDir = path.join(scratchRoot, 'out')
await build({ seed: 'oklch(0.55 0.14 275)', outDir: consumerBuildDir })
copyFileSync(
  path.join(consumerBuildDir, 'tokens.css'),
  path.join(FIXTURES_DIR, 'consumer-build.css'),
)

console.log(
  `✓ Generated ${Object.keys(SEEDS).length + 1} consumer-theming fixture(s) in test/browser/fixtures/`,
)
