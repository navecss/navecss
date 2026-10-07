/**
 * The markup warning: a build or a dev server that read no use at all and no markup (no `cx()`
 * call, no written Nave class, no `@nave` directive, no HTML page, no module of a server
 * environment) is most likely a backend that renders its own templates and uses Vite for assets
 * only. Every Nave class written there has no rule, so it says so once, for a possible miss.
 */
import type { BuilderLike, EnvironmentLike } from './vite-types.ts'
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

/**
 * At the last stage of a builder (its `buildApp` hooks of the last order): the environments the
 * build will not build again have been read, so it judges now when the builder's own `buildApp`
 * built some; otherwise Vite builds every environment next, and the judgement waits for the
 * last of them.
 */
export function expectBuilds(
  context: UsedContext,
  builder: BuilderLike,
  warn: (message: string) => void,
): void {
  if (Object.values(builder.environments).some((environment) => environment.isBuilt)) {
    judgeMarkup(context, warn)
    return
  }
  context.state.expectedEnvironments = new Set(Object.keys(builder.environments))
}

/**
 * When `environment` has finished reading its modules: judges once the last environment the
 * builder was going to build has. A build of one invocation (no builder) judges when the client
 * has; a builder that no `buildApp` runs for never does.
 */
export function judgeAfterLastEnvironment(
  context: UsedContext,
  environment: EnvironmentLike,
  warn: (message: string) => void,
): void {
  const { builtEnvironments, expectedEnvironments } = context.state
  builtEnvironments.add(environment.name)
  const isLast = expectedEnvironments
    ? [...expectedEnvironments].every((name) => builtEnvironments.has(name))
    : !context.inProcess && environment.config.consumer === 'client'
  if (isLast) judgeMarkup(context, warn)
}
