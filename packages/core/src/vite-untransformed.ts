/**
 * The untransformed-dependency warning. A server build leaves packages in `node_modules` external
 * by default, and an external package's `cx()` calls are read by no environment. When such a
 * package declares `@navecss/core`, the build may be missing atoms it applies, so it says so,
 * naming the package and `ssr.noExternal`: a possible miss, never a known one.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

const PACKAGE_NAME = /^(@[^/]+\/[^/]+|[^./@][^/]*)/

/**
 * The package a bare specifier names, or `undefined` for a built-in, a path or a virtual id.
 */
function packageOfSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith('node:') || specifier.startsWith('\0')) return undefined
  return PACKAGE_NAME.exec(specifier)?.[1]
}

/**
 * Whether the package `name`, found from `root` upward, declares `@navecss/core` as a dependency
 * or a peer or optional dependency.
 */
export function isDeclaringCore(root: string, name: string): boolean {
  for (let directory = root; ; directory = path.dirname(directory)) {
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(directory, 'node_modules', name, 'package.json'), 'utf8'),
      ) as Record<string, Record<string, string> | undefined>
      return ['dependencies', 'peerDependencies', 'optionalDependencies'].some(
        (field) => manifest[field]?.['@navecss/core'] !== undefined,
      )
    } catch {
      if (path.dirname(directory) === directory) return false
    }
  }
}

/**
 * The words of the warning for the package `name`.
 */
function warningFor(name: string): string {
  return `${name} depends on @navecss/core, but no environment of this build transforms it, so the atoms its cx() calls name are not read. Add it to ssr.noExternal in your Vite config so the build reads it, or list the atoms its calls can produce under its name in keepFor in navePlugin().`
}

/**
 * Judges the packages left external so far, warning about each that no environment transformed
 * and `keepFor` does not stand in for.
 */
function judgeExternals(ctx: RenderContext, context: UsedContext): void {
  const { state } = context
  for (const name of state.externals) {
    if (state.packages.has(name) || state.warned.has(name)) continue
    if (Object.hasOwn(context.options.keepFor, name)) continue
    state.warned.add(name)
    ctx.warn(warningFor(name))
  }
  state.externals.clear()
}

/**
 * At a server environment's build end: notes the external packages that declare `@navecss/core`.
 * With a client still to build in this process, the judgement waits for it.
 */
export function noteServerExternals(ctx: RenderContext, context: UsedContext): void {
  const ids = ctx.getModuleIds?.() ?? []
  for (const id of ids) {
    const name = packageOfSpecifier(id)
    if (name !== undefined && isDeclaringCore(context.root, name)) context.state.externals.add(name)
  }
  if (!context.inProcess || context.state.clientEnded) judgeExternals(ctx, context)
}

/**
 * At the client environment's build end: it has now read its modules, so any package a server
 * environment left external before it can be judged.
 */
export function noteClientEnded(ctx: RenderContext, context: UsedContext): void {
  context.state.clientEnded = true
  judgeExternals(ctx, context)
}
