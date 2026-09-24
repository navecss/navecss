/**
 * The DTCG-reader half of `build`'s output (`facade.ts`), split into its own module so
 * `facade.ts` stays under this package's line-count lint cap. Internal only: not listed in
 * `package.json`'s `exports` map, and `facade.ts` is still the sole public entry point that
 * calls it.
 */

import type { OutputFile } from './builder.ts'
import type { FlatToken } from './reader.ts'

import { composeBuild } from './builder.ts'
import {
  formatCssTokens,
  formatJsBreakpoints,
  formatJsTokens,
  formatTsBreakpoints,
  formatTsDeclarations,
} from './formats.ts'

const CONSUMER_LAYER = 'tokens.presets'

/**
The DTCG-reader half of `build`'s output, into the SAME `tokens.presets` layer (R10) the theming half also targets.
 */
export function composeDtcgOutputs(sourcePath: string, outDir: string): Promise<OutputFile[]> {
  return composeBuild({
    source: [sourcePath],
    platforms: {
      css: {
        buildPath: outDir,
        files: [
          {
            destination: 'tokens.css',
            format: (tokens: FlatToken[]) => formatCssTokens(tokens, CONSUMER_LAYER),
          },
        ],
      },
      js: {
        buildPath: outDir,
        files: [
          { destination: 'tokens.js', format: formatJsTokens },
          { destination: 'tokens.d.ts', format: formatTsDeclarations },
          { destination: 'breakpoints.js', format: formatJsBreakpoints },
          {
            destination: 'breakpoints.d.ts',
            format: formatTsBreakpoints,
            filter: (token: FlatToken) => token.path[0] === 'breakpoint',
          },
        ],
      },
    },
  })
}
