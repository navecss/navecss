/**
 * The pieces the used-atoms rows for `keepFor` share: a build of a scratch app over dependency
 * packages, and the line the build prints for a listed package whose `cx` export the application
 * takes.
 */
import {
  addPackage,
  appFiles,
  type BuildOptions,
  buildUsed,
  type Built,
  makeUsedApp,
} from './used-atoms-app.ts'
import { IMPORT } from './used-atoms-rows.ts'

export const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
export const KEEP_NONE = { '@acme/ui': [] } as const
export const WHOLE =
  '; where a file takes a module whole (a namespace import, export *, import() or an import the build cannot read), import by name what it uses from that module, and cx from @navecss/core/cx'
export const PASSED_ON =
  '; where a file re-exports what it takes, import cx from @navecss/core/cx in the files that call it, call cx there in its place, and drop the re-export'
export const FIX =
  ' The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out.'

/**
 * The remedy line for a listed package whose `cx` export the application takes: `listed` is the
 * list of takers and what each takes, `files` the clause that points at them, `whole` the clause
 * for a take of a module whole and `fix` the closing sentence for a package that has one to make.
 */
export function takenLine(listed: string, files = 'in that file', whole = '', fix = FIX): string {
  const pkg = '@acme/ui'
  return `${pkg} re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in ${listed}. The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this.${fix}`
}

/**
 * The line for a dependency module that re-exports the `cx` of a module `cxModules` lists, when
 * your code takes it: `pkg` is the forwarding package.
 */
export function forwardLine(
  pkg: string,
  input: { readonly files?: string; readonly listed: string; readonly whole?: string },
): string {
  const { listed, files = 'in that file', whole = '' } = input
  return `${pkg} re-exports the cx of a module listed in cxModules, and your code takes that cx, from ${pkg} or through another package that re-exports it, in ${listed}. The build follows a listed module one step, so it does not read calls made through what your code takes there: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}.${FIX}`
}

/**
 * The line for a dependency module that re-exports the `cx` of a module `cxModules` lists, when
 * other dependencies' code calls through it: `callers` are their modules, joined.
 */
export function callsThroughLine(pkg: string, callers: readonly string[]): string {
  const [make, owner, its] =
    callers.length === 1 ? ['makes', "a dependency's", 'its'] : ['make', "dependencies'", 'their']
  return `${pkg} re-exports the cx of a module listed in cxModules, and the build follows a listed module one step, so it does not read the calls that ${callers.join(', ')} ${make} through that re-export. That code is ${owner}, not yours to change: list the atoms those calls can produce, from ${its} documentation, under the name of ${pkg}, which holds the re-export, in navePlugin(): keepFor: { '${pkg}': ['<atom>'] }. The lasting fix is upstream: ${pkg} can re-export cx from @navecss/core/cx itself, or the code that calls through it can import cx from there.`
}

export interface Scenario {
  readonly app: Record<string, string>
  readonly code: string
  readonly config?: (root: string) => Record<string, unknown>
  /**
   * The app files `src/main.ts` imports; every script file of `app` by default.
   */
  readonly imports?: readonly string[]
  readonly options: NonNullable<BuildOptions['options']>
  readonly packages: Record<string, Record<string, string>>
  readonly plugins?: NonNullable<BuildOptions['plugins']>
}

/**
 * Builds the scenario's scratch app: `code` as `src/App.ts`, the `app` files beside it, and the
 * `packages` in `node_modules`, `@acme/ui` among them. `config` is given the project root and its
 * result is merged over the fixture's Vite config.
 */
export async function runScenario(scenario: Scenario): Promise<Built> {
  const { app, code, config, imports, options, packages, plugins } = scenario
  const scratch = makeUsedApp(appFiles({ 'src/App.ts': code, ...app }, imports))
  for (const [name, files] of Object.entries(packages)) addPackage(scratch, name, files)
  try {
    return await buildUsed(scratch, {
      options,
      ...(config && { config: config(scratch.root) }),
      ...(plugins && { plugins }),
    })
  } finally {
    scratch.dispose()
  }
}

/**
 * Builds an app of `code` (`src/App.ts`, with more `app` files beside it) over the packages of
 * `packages`, `@acme/ui` among them.
 */
export function run(
  code: string,
  packages: Record<string, Record<string, string>>,
  options: BuildOptions['options'] = {},
  app: Record<string, string> = {},
): Promise<Built> {
  return runScenario({ app, code, options, packages })
}

/**
 * Builds the same app with `config`, which is given the project root, merged over the fixture's
 * Vite config.
 */
export function runWithConfig(
  config: (root: string) => Record<string, unknown>,
  code: string,
  packages: Record<string, Record<string, string>>,
  options: BuildOptions['options'] = {},
): Promise<Built> {
  return runScenario({ app: {}, code, config, options, packages })
}

/**
 * A package whose entry exports `Menu`, which calls `cx('flex', v)` and imports `file`, holding
 * `text`, for its effect.
 */
export function withMenu(file: string, text: string): Record<string, string> {
  return {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}import './${file}'\nexport const Menu = (v) => cx('flex', v)\n`,
    [file]: text,
  }
}

export const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"
