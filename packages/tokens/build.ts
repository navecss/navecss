/**
 * Nave Design System — first-party token build.
 *
 * Input:  tokens.json  (W3C DTCG format)
 * Output:
 *   dist/tokens.css   — @layer tokens with @property declarations + CSS custom properties
 *   dist/tokens.js    — ESM export of all tokens as a typed const object
 *   dist/tokens.d.ts  — TypeScript declarations for the JS export
 *
 * Run: node build.ts  (Node 22.18+ — native TS type stripping)
 *
 * Replaces Style Dictionary: the reader (`src/reader.ts`) and the runner (`src/builder.ts`)
 * are first-party, so Nave's own build is the reader's regression test on every run — the
 * same reasoning that keeps `src/theming/` first-party. The format functions live in
 * `src/formats.ts`; this file stays a thin caller, matching the same thin-caller shape used
 * consistently by `src/theming/pipeline.ts`.
 */

import type { FlatToken } from './src/reader.ts'

import { type BuildConfig, composeBuild, writeOutputs } from './src/builder.ts'
import {
  formatCssTokens,
  formatJsBreakpoints,
  formatJsTokens,
  formatTsBreakpoints,
  formatTsDeclarations,
} from './src/formats.ts'

const config: BuildConfig = {
  source: ['tokens.json'],

  platforms: {
    // -----------------------------------------------------------------------
    // CSS output
    // -----------------------------------------------------------------------
    css: {
      buildPath: 'dist/',
      files: [
        {
          destination: 'tokens.css',
          format: formatCssTokens,
          // No filter here — isPublic is applied inside the format function
          // so @property blocks and :root vars stay in sync automatically.
        },
      ],
    },

    // -----------------------------------------------------------------------
    // JS/TS output (for JS consumers, CSS-in-JS, or runtime token access)
    // -----------------------------------------------------------------------
    js: {
      buildPath: 'dist/',
      files: [
        {
          destination: 'tokens.js',
          format: formatJsTokens,
        },
        {
          destination: 'tokens.d.ts',
          format: formatTsDeclarations,
        },
        {
          destination: 'breakpoints.js',
          format: formatJsBreakpoints,
        },
        {
          destination: 'breakpoints.d.ts',
          format: formatTsBreakpoints,
          filter: (token: FlatToken) => token.path[0] === 'breakpoint',
        },
      ],
    },
  },
}

// Build, in three phases with the write LAST (AC-theming-05: a failing run leaves no
// partially regenerated tokens.css on disk). Compose the DTCG outputs in memory, then run
// G1 theming colour (R9/R11/R37) — which runs every wired guard and composes the semantic
// layer and the generated artifacts, throwing before anything is written — and only then
// write, once, through the temp-and-rename phase in src/builder.ts.
const composed = await composeBuild(config)
const themingStep = await import('./src/theming/build-step.ts')
await writeOutputs(themingStep.withThemingLayer(composed))
