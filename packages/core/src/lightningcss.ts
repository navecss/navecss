/**
 * Nave's Lightning CSS adapter: expands `@nave` directives in the text of a stylesheet before
 * Lightning CSS reads it, so Lightning CSS never sees a directive. It imports nothing from
 * `lightningcss`, types included, declares no peer, and runs no visitor: the supported range is
 * documented, not declared.
 *
 * Setup:
 *   import { transform } from 'lightningcss'
 *   import { navePlugin } from '@navecss/core/lightningcss'
 *
 *   const nave = navePlugin()
 *   const { code, map } = nave.expand(source, 'src/app.css')
 *   transform({ filename: 'src/app.css', code, inputSourceMap: map })
 *
 *   bundleAsync({ filename: 'src/app.css', resolver: nave.resolver })   // @import-reached files too
 *
 * For a host that runs Lightning CSS directly. On Vite, use `@navecss/core/vite`, which runs under
 * `css.transformer: 'lightningcss'` too.
 */
import { readFileSync } from 'node:fs'

import type { AtomDefinition } from './atoms.ts'
import type { ExtendMap } from './directive/resolve.ts'

import { splitByteOrderMark } from './byte-order-mark.ts'
import { expandText } from './directive/expand-text.ts'
import { foldedText, warningTexts } from './directive/report-text.ts'
import { snapshotExtendMap } from './snapshot-extend-atoms.ts'
import { validateExtendAtomsHostFree } from './validate-extend-host-free.ts'

export interface NaveLightningOptions {
  /**
   * Consumer-defined atoms merged with Nave built-in atoms. Consumer atoms win on name collision.
   * These atoms resolve via @nave only. No global class. Not available in cx().
   *
   * An object only: `expand` is synchronous, for `transform()`, so it cannot load a module.
   * Import your atoms into the script that calls `navePlugin()`.
   */
  extend?: Record<string, AtomDefinition>

  /**
   * Behaviour on a problem in a @nave directive: an unknown atom name, no atom named at all,
   * anything but a name between the names (a comma, a string), a {} block, or a place the
   * directive cannot expand. Under 'error', every such problem in one stylesheet is reported in
   * one thrown error.
   * 'warn'  — print each with `console.warn` and skip it
   * 'error' — throw (default)
   * 'ignore' — silently skip
   */
  onUnknown?: 'warn' | 'error' | 'ignore'
}

/**
 * What `navePlugin()` returns: `expand` for `transform()`, and `resolver` for `bundleAsync()`.
 */
export interface NaveLightningAdapter {
  /**
   * Expands the directives of `code` (the stylesheet's text, or its bytes) and returns the result
   * as bytes with its source map, ready to pass to `transform()` as `code` and `inputSourceMap`.
   * `filename` is what a message names.
   */
  expand(code: string | Uint8Array, filename: string): { code: Uint8Array; map: string }
  /**
   * For `bundleAsync()`: `read` reads a file and returns its expanded text. It returns no source
   * map, and the inserted text adds no line breaks, so line numbers hold.
   */
  resolver: { read(filePath: string): string }
}

/**
 * Judges the problems of one stylesheet per `onUnknown`: under `'error'` one thrown report,
 * under `'warn'` one `console.warn` each.
 */
function report(
  diagnostics: Parameters<typeof foldedText>[0],
  file: string,
  extend: ExtendMap,
  onUnknown: 'warn' | 'error' | 'ignore',
): void {
  if (onUnknown === 'ignore' || diagnostics.length === 0) return
  if (onUnknown === 'warn') {
    for (const text of warningTexts(diagnostics, file, extend)) console.warn(text)
    return
  }
  throw new Error(foldedText(diagnostics, file, extend))
}

/**
 * The Lightning CSS adapter: `expand` for `transform()` and `resolver` for `bundleAsync()`.
 */
export function navePlugin(options: NaveLightningOptions = {}): NaveLightningAdapter {
  const onUnknown = options.onUnknown ?? 'error'
  // The atoms are trusted, consumer-authored code, read once and checked once, here, so a
  // mistake in them fails when the adapter is built and not on the first stylesheet.
  const extend = snapshotExtendMap(options.extend ?? {})
  validateExtendAtomsHostFree(extend)

  const expandToText = (text: string, file: string): { css: string; map: string } => {
    const result = expandText(text, { extend, onUnknown, from: file })
    report(result.diagnostics, file, extend, onUnknown)
    return result
  }

  return {
    expand(code, filename) {
      const raw =
        typeof code === 'string' ? code : new TextDecoder('utf-8', { ignoreBOM: true }).decode(code)
      const { bom, text } = splitByteOrderMark(raw)
      const { css, map } = expandToText(text, filename)
      return { code: new TextEncoder().encode(bom + css), map }
    },
    resolver: {
      read: (filePath) => {
        const { bom, text } = splitByteOrderMark(readFileSync(filePath, 'utf8'))
        return bom + expandToText(text, filePath).css
      },
    },
  }
}

/**
 * A host-loaded entry point also carries a default export, since hosts and every peer library
 * load it that way (`import nave from '@navecss/core/lightningcss'`). `navePlugin` stays the
 * documented, named form.
 * @public
 */
export default navePlugin
