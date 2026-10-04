/**
 * The markup warning: a build or a dev server that read no use at all and no markup (no `cx()`
 * call, no written Nave class, no `@nave` directive, no HTML page, no module of a server
 * environment) is most likely a backend that renders its own templates and uses Vite for assets
 * only. Every Nave class written there has no rule, so it says so once, for a possible miss.
 */
import type { UsedContext } from './vite-used.ts'

import { collectedAtoms } from './vite-state.ts'
import { isUsed } from './vite-used.ts'

const MARKUP_WARNING =
  "navePlugin(): Nave read no HTML page and no server render, so your pages are likely rendered where it cannot see them, such as in a backend's own templates. A Nave class written there has no rule, in dev or in the build, unless its atom is listed in keep; if most of your Nave classes are written there, set atomic: 'all' to ship every atom. See \"Which atoms the build ships\" in node_modules/@navecss/core/README.md."

/**
 * Whether the conditions of the warning hold: `keep` is empty, the emitted set would be the
 * `keepFor` lists alone, no directive was expanded, no HTML was read, no server environment
 * transformed a module, and the build is not a library's.
 */
function isMarkupCase(context: UsedContext): boolean {
  const { state } = context
  return (
    context.options.keep.length === 0 &&
    collectedAtoms(state, []).size === 0 &&
    !state.directiveExpanded &&
    !state.htmlRead &&
    !state.serverTransformed &&
    !context.isLibrary
  )
}

/**
 * Judges the markup case once for this build or dev server, and says so through `warn` when it
 * holds.
 */
export function judgeMarkup(context: UsedContext, warn: (message: string) => void): void {
  const { state } = context
  if (!isUsed(context) || state.markupJudged) return
  state.markupJudged = true
  if (isMarkupCase(context)) warn(MARKUP_WARNING)
}
